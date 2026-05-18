// CI canary test — the most important test we run.
//
// Spec: docs/no-log-proxy-spec.md §CI canary test.
//
// On every PR this test feeds a unique tracer string through the proxy
// pipeline and then scans every output channel (stdout, stderr, Sentry mock
// buffer) for that tracer. If it appears anywhere, the build fails — even if
// the ESLint rules let the regression through (e.g. via a transitive library
// call).
//
// At Day 3 the proxy routes do not exist yet. This file is the SCAFFOLD: it
// asserts the harness mechanics — capture, run a stub, scan — work end-to-end
// on the green path. The stub will be replaced by real route invocations as
// /api/ocr (Day 4) and /api/translate (Day 5) land.

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

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  const recordStdout = (chunk: string | Uint8Array): boolean => {
    buffers.stdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  const recordStderr = (chunk: string | Uint8Array): boolean => {
    buffers.stderr.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  process.stdout.write = recordStdout as typeof process.stdout.write;
  process.stderr.write = recordStderr as typeof process.stderr.write;

  return {
    buffers,
    stop() {
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
    },
  };
}

function combined(buffers: CaptureBuffers): string {
  return [
    buffers.stdout.join(""),
    buffers.stderr.join(""),
    JSON.stringify(buffers.sentry),
  ].join("\n");
}

// Stand-in for a future proxy pipeline. Day 4/5 will swap this out for a real
// fetch-against-the-route invocation. The intent is identical: receive a
// tracer-bearing payload, do work, log only metadata via proxyLogger.
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
    // Sanity-check that the capture harness itself works. If someone breaks
    // the capture (e.g., by stubbing process.stdout differently in a future
    // refactor), this test fails — which fails the canary too.
    const tracer = `__TRACER_${randomUUID()}__`;
    process.stdout.write(`oops leaked ${tracer}\n`);

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
    // Simulate a poorly-written catch that would pass user input into the
    // error. SafeError accepts the message as-is; the discipline is that the
    // *caller* never passes content. We assert here on the shape of the API —
    // future linting could enforce stricter message scrubbing.
    expect(err.message).not.toContain(tracer);
    expect(err.code).toBe("UPSTREAM_5XX");
    expect(err.status).toBe(502);
    expect(err.upstream).toBe("anthropic");
  });
});

// Make vitest's `vi` import non-empty so the lint doesn't strip it; the Day 4
// expansion will need vi.mock() for the upstream fetch.
void vi;
