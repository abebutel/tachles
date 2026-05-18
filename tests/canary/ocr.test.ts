// Canary test for /api/ocr — Day 4 expansion.
//
// Spec: docs/no-log-proxy-spec.md §CI canary test. The OCR canary submits a
// request to /api/ocr with image bytes carrying a unique __TRACER_<uuid>__
// string, mocks the upstream OCR providers to echo the tracer back as
// "extracted text", then scans every captured output channel for the tracer.
// Build fails if the tracer surfaces anywhere.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Mock dependencies BEFORE importing the route module. The mocks replace
// auth (always-ok), rate limiter (always-ok), and runOcr (echoes the tracer
// the test injects via the request body).
vi.mock("@/lib/proxy/auth", () => ({
  verifyRequestAuth: vi.fn(async () => ({ userId: "test-user-id" })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/proxy/ratelimit", () => ({
  enforceRateLimit: vi.fn(async () => ({
    ok: true as const,
    remaining: 29,
    resetUnixMs: Date.now() + 60_000,
  })),
}));

// Holds the tracer the active test wants the mocked OCR to "extract".
let extractedText = "";
vi.mock("@/lib/proxy/ocr-client", () => ({
  runOcr: vi.fn(async () => ({
    text: extractedText,
    confidence: 0.95,
    provider_used: "google" as const,
  })),
}));

// Mock the typed proxyLogger to spy on its payloads as well. Any field whose
// value contains the tracer is an immediate fail.
const loggerCalls: Array<{ level: string; payload: Record<string, unknown> }> = [];
vi.mock("@/lib/proxy/proxy-logger", () => ({
  proxyLogger: {
    info: (payload: Record<string, unknown>) => loggerCalls.push({ level: "info", payload }),
    warn: (payload: Record<string, unknown>) => loggerCalls.push({ level: "warn", payload }),
    error: (payload: Record<string, unknown>) => loggerCalls.push({ level: "error", payload }),
  },
}));

import { POST } from "@/app/api/ocr/route";

interface CaptureBuffers {
  stdout: string[];
  stderr: string[];
}

function startCapture(): { buffers: CaptureBuffers; stop: () => void } {
  const buffers: CaptureBuffers = { stdout: [], stderr: [] };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  const grab = (target: string[]) => (chunk: string | Uint8Array): boolean => {
    target.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  process.stdout.write = grab(buffers.stdout) as typeof process.stdout.write;
  process.stderr.write = grab(buffers.stderr) as typeof process.stderr.write;

  return {
    buffers,
    stop() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

function makeImageBytesContaining(tracer: string): Uint8Array {
  // We don't need a real image — runOcr is mocked. We DO want the tracer to
  // appear inside the bytes the route reads from `request.body`, so a
  // logging regression that buffers the raw body would surface the tracer.
  // Pad with a small PNG-ish header so the size feels realistic.
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = new TextEncoder().encode(`${tracer}\n`.repeat(64));
  const out = new Uint8Array(header.byteLength + body.byteLength);
  out.set(header, 0);
  out.set(body, header.byteLength);
  return out;
}

function makeRequest(bytes: Uint8Array): Request {
  return new Request("https://test.local/api/ocr", {
    method: "POST",
    headers: {
      "content-type": "image/png",
      "content-length": String(bytes.byteLength),
      authorization: "Bearer fake-jwt-validated-by-mock",
    },
    body: bytes as BodyInit,
  });
}

describe("CI canary — /api/ocr tracer must never leak", () => {
  let capture: ReturnType<typeof startCapture>;

  beforeEach(() => {
    loggerCalls.length = 0;
    capture = startCapture();
  });

  afterEach(() => {
    capture.stop();
  });

  it("green path: tracer in body + extracted text never surfaces in logs", async () => {
    const tracer = `__TRACER_${randomUUID()}__`;
    extractedText = `Israel Bituach Leumi letter\n${tracer}\nClaim ID 12345`;

    const bytes = makeImageBytesContaining(tracer);
    const res = await POST(makeRequest(bytes));

    // The route should respond 200 with the extracted text.
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string; provider_used: string };
    expect(json.text).toContain(tracer);
    expect(json.provider_used).toBe("google");

    // No tracer in stdout/stderr.
    const out = capture.buffers.stdout.join("") + capture.buffers.stderr.join("");
    expect(out).not.toContain(tracer);

    // No tracer in any proxyLogger payload value.
    for (const call of loggerCalls) {
      for (const [key, value] of Object.entries(call.payload)) {
        if (typeof value === "string") {
          expect(value, `payload.${key}`).not.toContain(tracer);
        }
      }
    }

    // Sanity: the logger DID record metadata for this request.
    expect(loggerCalls.some((c) => c.payload.route === "ocr")).toBe(true);
  });

  it("error path (rate limited): tracer in body never surfaces", async () => {
    const { enforceRateLimit } = await import("@/lib/proxy/ratelimit");
    const { SafeError, SafeErrorCodes } = await import("@/lib/proxy/safe-error");
    vi.mocked(enforceRateLimit).mockRejectedValueOnce(
      new SafeError({
        code: SafeErrorCodes.RATE_LIMITED,
        status: 429,
        message: "rate limited",
      }),
    );

    const tracer = `__TRACER_${randomUUID()}__`;
    const bytes = makeImageBytesContaining(tracer);

    const res = await POST(makeRequest(bytes));
    expect(res.status).toBe(429);

    const out = capture.buffers.stdout.join("") + capture.buffers.stderr.join("");
    expect(out).not.toContain(tracer);
  });
});
