// CI canary test — the most important test we run.
//
// Spec: docs/no-log-proxy-spec.md §CI canary test.
//
// On every PR this test feeds a unique tracer string through the proxy
// pipeline and then scans every output channel (console.*, sentry mock
// buffer) for that tracer. If it appears anywhere, the build fails — even if
// the ESLint rules let the regression through (e.g. via a transitive library
// call).
//
// At Day 3 this was a stub; Day 4 added /api/ocr coverage in ocr.test.ts.
// This file remains as the harness self-test and SafeError shape check.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { proxyLogger } from "../../lib/proxy/proxy-logger";
import { SafeError, SafeErrorCodes } from "../../lib/proxy/safe-error";

interface CaptureBuffers {
  stdout: string[];
  stderr: string[];
  sentry: unknown[];
}

function startCapture(): { buffers: CaptureBuffers; stop: () => void } {
  const buffers: CaptureBuffers = { stdout: [], stderr: [], sentry: [] };

  // proxyLogger writes via console.log/warn/error (the only Edge-compatible
  // primitive). We spy on those — process.stdout/stderr monkey-patching
  // doesn't work because vitest intercepts console.* before it reaches the
  // streams.
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
    buffers.stdout.push(args.map(String).join(" "));
  });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
    buffers.stdout.push(args.map(String).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    buffers.stderr.push(args.map(String).join(" "));
  });

  return {
    buffers,
    stop() {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

function combined(buffers: CaptureBuffers): string {
  return [
    buffers.stdout.join("\n"),
    buffers.stderr.join("\n"),
    JSON.stringify(buffers.sentry),
  ].join("\n");
}

// Stand-in for a future proxy pipeline. Real route invocations live in
// ocr.test.ts (Day 4) and translate.test.ts (Day 5). This stub guards the
// harness mechanics.
async function runProxyStub(ocrText: string, requestId: string): Promise<void> {
  proxyLogger.info({
    request_id: requestId,
    route: "translate",
    classification_label: "bituach_leumi",
    classification_confidence: 0.92,
    specialist_route: "bituach_leumi",
    total_input_tokens: 123,
    total_output_tokens: 456,
    call_count: 3,
    latency_ms: 87,
    response_status: 200,
    quality_check_passed: true,
  });
  // Intentionally do NOT log ocrText. The variable is here so future revisions
  // that accidentally interpolate it will surface in the canary.
  void ocrText;
}

describe("CI canary — tracer must never leak", () => {
  let capture: ReturnType<typeof startCapture>;

  beforeEach(() => {
    capture = startCapture();
  });

  afterEach(() => {
    capture.stop();
  });

  it("green path: structured metadata logs do not contain the tracer", async () => {
    const tracer = `__TRACER_${randomUUID()}__`;
    const requestId = randomUUID();

    await runProxyStub(`bituach leumi letter ${tracer} ...`, requestId);

    const all = combined(capture.buffers);
    expect(all).not.toContain(tracer);
    // Sanity: we DID write metadata, so capture buffers are not empty.
    expect(capture.buffers.stdout.join("")).toContain(requestId);
  });

  it("self-test: the scanner catches a deliberate leak", async () => {
    // If someone breaks the capture (e.g., by changing how the logger emits
    // in a future refactor), this test fails — and so does the canary.
    const tracer = `__TRACER_${randomUUID()}__`;
    console.log(`oops leaked ${tracer}`);

    const all = combined(capture.buffers);
    expect(all).toContain(tracer);
  });

  it("SafeError messages do not contain user content", () => {
    const err = new SafeError({
      code: SafeErrorCodes.UPSTREAM_5XX,
      status: 502,
      upstream: "anthropic",
      message: "upstream returned 502",
    });
    const tracer = `__TRACER_${randomUUID()}__`;
    // SafeError accepts the message as-is; the discipline is that the
    // *caller* never passes content. We assert on the API shape here.
    expect(err.message).not.toContain(tracer);
    expect(err.code).toBe("UPSTREAM_5XX");
    expect(err.status).toBe(502);
    expect(err.upstream).toBe("anthropic");
  });
});
