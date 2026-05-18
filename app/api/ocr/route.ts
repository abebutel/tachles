import { NextResponse } from "next/server";
import { proxyLogger } from "@/lib/proxy/proxy-logger";
import { SafeError } from "@/lib/proxy/safe-error";
import { verifyRequestAuth, getClientIp } from "@/lib/proxy/auth";
import { enforceRateLimit } from "@/lib/proxy/ratelimit";
import { readBodyBounded } from "@/lib/proxy/stream";
import { runOcr } from "@/lib/proxy/ocr-client";

// /api/ocr — Edge runtime.
//
// Spec: docs/no-log-proxy-spec.md §`/api/ocr`.
//
// Order of operations matters for the privacy guarantee:
//   1. Auth check (cheap)
//   2. Rate-limit check (cheap, network call but tiny)
//   3. Content-Length validation BEFORE reading any body bytes
//   4. Stream body into bounded Uint8Array
//   5. Hand bytes to runOcr() which calls Google Vision (primary) / Claude
//      Vision (fallback), returns text + confidence
//   6. Stream JSON response back; image bytes go out of scope
//
// At no point does the image content touch the logger or the error tracker.

export const runtime = "edge";

const MAX_OCR_BODY_BYTES = parseInt(
  process.env.MAX_OCR_BODY_BYTES ?? "10485760",
  10,
);

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const auth = await verifyRequestAuth(request);
    await enforceRateLimit({ userId: auth.userId, ip: getClientIp(request) });

    const imageBytes = await readBodyBounded(request, MAX_OCR_BODY_BYTES);
    const contentType = request.headers.get("content-type");

    const result = await runOcr(imageBytes, contentType);

    proxyLogger.info({
      ts: new Date().toISOString(),
      request_id: requestId,
      user_id: auth.userId,
      route: "ocr",
      image_size_bytes: imageBytes.byteLength,
      response_status: 200,
      ocr_provider_used: result.provider_used,
      ocr_confidence: result.confidence,
      latency_ms: Date.now() - startedAt,
    });

    return NextResponse.json({
      text: result.text,
      confidence: result.confidence,
      provider_used: result.provider_used,
    });
  } catch (err) {
    return handleError(err, requestId, startedAt);
  }
}

function handleError(err: unknown, requestId: string, startedAt: number): Response {
  if (err instanceof SafeError) {
    proxyLogger.warn({
      ts: new Date().toISOString(),
      request_id: requestId,
      route: "ocr",
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

  // Unknown error — log only the class name, never the message (might
  // contain echoed body from a bad upstream).
  proxyLogger.error({
    ts: new Date().toISOString(),
    request_id: requestId,
    route: "ocr",
    response_status: 500,
    error_class: (err as Error)?.constructor?.name ?? "unknown",
    latency_ms: Date.now() - startedAt,
  });
  return NextResponse.json(
    { error: { code: "INTERNAL" } },
    { status: 500 },
  );
}
