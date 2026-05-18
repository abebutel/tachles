import { NextResponse } from "next/server";
import { proxyLogger } from "@/lib/proxy/proxy-logger";
import { SafeError } from "@/lib/proxy/safe-error";
import { verifyRequestAuth, getClientIp } from "@/lib/proxy/auth";
import { enforceRateLimit } from "@/lib/proxy/ratelimit";
import { runTranslationPipeline } from "@/lib/proxy/translate-pipeline";

// /api/translate — Edge runtime.
//
// Spec: docs/no-log-proxy-spec.md §`/api/translate`.
//
// Order of operations:
//   1. Auth (cheap)
//   2. Rate-limit
//   3. Hand the Request to runTranslationPipeline() — that's where body
//      parsing happens (the spec's one allowed exception)
//   4. Pipeline returns structured result + metadata; we log only metadata
//   5. JSON response streamed back; ocr_text and the LLM responses go out
//      of scope
//
// As with /api/ocr: no logger call ever takes a body field.

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const auth = await verifyRequestAuth(request);
    await enforceRateLimit({ userId: auth.userId, ip: getClientIp(request) });

    const result = await runTranslationPipeline(request);

    proxyLogger.info({
      ts: new Date().toISOString(),
      request_id: requestId,
      user_id: auth.userId,
      route: "translate",
      classification_label: result.metadata.classification_label,
      classification_confidence: result.metadata.classification_confidence,
      specialist_route: result.metadata.specialist_route,
      total_input_tokens: result.metadata.total_input_tokens,
      total_output_tokens: result.metadata.total_output_tokens,
      call_count: result.metadata.call_count,
      response_status: 200,
      latency_ms: Date.now() - startedAt,
    });

    return NextResponse.json(result.body);
  } catch (err) {
    return handleError(err, requestId, startedAt);
  }
}

function handleError(err: unknown, requestId: string, startedAt: number): Response {
  if (err instanceof SafeError) {
    proxyLogger.warn({
      ts: new Date().toISOString(),
      request_id: requestId,
      route: "translate",
      response_status: err.status,
      error_code: err.code,
      upstream: err.upstream,
      latency_ms: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: { code: err.code } },
      { status: err.status },
    );
  }

  proxyLogger.error({
    ts: new Date().toISOString(),
    request_id: requestId,
    route: "translate",
    response_status: 500,
    error_class: (err as Error)?.constructor?.name ?? "unknown",
    latency_ms: Date.now() - startedAt,
  });
  return NextResponse.json(
    { error: { code: "INTERNAL" } },
    { status: 500 },
  );
}
