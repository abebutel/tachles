// Canary test for /api/translate — Day 5 expansion.
//
// Spec: docs/no-log-proxy-spec.md §CI canary test. The translate canary
// submits a request with `ocr_text` containing a unique __TRACER_<uuid>__,
// mocks Anthropic to ECHO the tracer back inside the classification +
// translation responses, and scans every captured channel for the tracer.
//
// The tracer must:
//   - reach the user response (correctness — proves end-to-end works)
//   - NEVER appear in stdout/stderr/proxyLogger payloads (privacy guarantee)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Mock auth + rate-limit to be passthrough.
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

// Mock the Anthropic JSON-returning client at the pipeline boundary. The
// translate pipeline makes 3 calls — classify (max_tokens 512), specialist
// (max_tokens 4096), quality check (max_tokens 1024). We route by
// max_tokens. The specialist embeds the tracer in translation text — that's
// the worst-case privacy test (tracer-bearing user content in the response).
let lastTracer = "";
vi.mock("@/lib/proxy/anthropic-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/proxy/anthropic-client")>(
    "@/lib/proxy/anthropic-client",
  );
  return {
    ...actual,
    callAnthropicJson: vi.fn(async (req: { max_tokens: number }) => {
      if (req.max_tokens <= 512) {
        return {
          value: {
            institution_category: "bituach_leumi",
            confidence: 0.95,
            detected_signals: ["header text", "claim number"],
          },
          input_tokens: 200,
          output_tokens: 50,
        };
      }
      if (req.max_tokens === 1024) {
        // Quality check.
        return {
          value: { passes: true, concerns: [], confidence: 0.9 },
          input_tokens: 1800,
          output_tokens: 30,
        };
      }
      // Specialist translation — embeds the tracer in the user-visible text.
      return {
        value: {
          tldr_he: `סיכום: ${lastTracer}`,
          tldr_en: `Summary: ${lastTracer}`,
          institution: "Bituach Leumi",
          document_type: "Child Benefit Payment Notice",
          reference_numbers: [{ label: "Claim ID", value: "12345-67-12" }],
          amounts: [{ label: "Payment", amount: "800", currency: "ILS" }],
          dates: [{ label: "Letter date", date: "2026-05-15", is_deadline: false }],
          action_items: [],
          translation_he: `תרגום מלא: ${lastTracer}`,
          translation_en: `Full translation: ${lastTracer}`,
        },
        input_tokens: 1500,
        output_tokens: 800,
      };
    }),
  };
});

// Spy on proxyLogger to catch any tracer-bearing payload at the source.
const loggerCalls: Array<{ level: string; payload: Record<string, unknown> }> = [];
vi.mock("@/lib/proxy/proxy-logger", () => ({
  proxyLogger: {
    info: (payload: Record<string, unknown>) => loggerCalls.push({ level: "info", payload }),
    warn: (payload: Record<string, unknown>) => loggerCalls.push({ level: "warn", payload }),
    error: (payload: Record<string, unknown>) => loggerCalls.push({ level: "error", payload }),
  },
}));

import { POST } from "@/app/api/translate/route";

interface CaptureBuffers {
  stdout: string[];
  stderr: string[];
}

function startCapture(): { buffers: CaptureBuffers; stop: () => void } {
  const buffers: CaptureBuffers = { stdout: [], stderr: [] };
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

function makeRequest(ocrText: string): Request {
  const body = JSON.stringify({ ocr_text: ocrText });
  return new Request("https://test.local/api/translate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body, "utf8")),
      authorization: "Bearer fake-jwt-validated-by-mock",
    },
    body,
  });
}

describe("CI canary — /api/translate tracer must never leak", () => {
  let capture: ReturnType<typeof startCapture>;

  beforeEach(() => {
    loggerCalls.length = 0;
    capture = startCapture();
  });

  afterEach(() => {
    capture.stop();
  });

  it("green path: tracer in ocr_text + translation never surfaces in logs", async () => {
    const tracer = `__TRACER_${randomUUID()}__`;
    lastTracer = tracer;

    const ocrText = `ביטוח לאומי - מענק ילדים - חודש מאי ${tracer} - תיק 12345-67-12`;
    const res = await POST(makeRequest(ocrText));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      classification: { institution_category: string };
      translation: { tldr_he: string; translation_he: string };
      quality_check: { passes: boolean; confidence: number };
    };

    // Correctness: the tracer reaches the user response.
    expect(json.classification.institution_category).toBe("bituach_leumi");
    expect(json.translation.tldr_he).toContain(tracer);
    expect(json.translation.translation_he).toContain(tracer);
    expect(json.quality_check.passes).toBe(true);

    // Privacy: tracer not in stdout/stderr.
    const out = capture.buffers.stdout.join("\n") + capture.buffers.stderr.join("\n");
    expect(out).not.toContain(tracer);

    // Privacy: tracer not in any proxyLogger payload value.
    for (const call of loggerCalls) {
      for (const [key, value] of Object.entries(call.payload)) {
        if (typeof value === "string") {
          expect(value, `payload.${key}`).not.toContain(tracer);
        }
      }
    }

    // Sanity: the route DID log metadata.
    expect(loggerCalls.some((c) => c.payload.route === "translate")).toBe(true);
  });

  it("error path (invalid JSON body): tracer never surfaces", async () => {
    const tracer = `__TRACER_${randomUUID()}__`;
    lastTracer = tracer;

    // Send the tracer as the body but with a content-type that says JSON
    // and content that isn't valid JSON. The pipeline should reject early.
    const body = `not-json-${tracer}`;
    const req = new Request("https://test.local/api/translate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body, "utf8")),
        authorization: "Bearer fake",
      },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const out = capture.buffers.stdout.join("\n") + capture.buffers.stderr.join("\n");
    expect(out).not.toContain(tracer);
  });

  it("error path (rate limited): tracer never surfaces", async () => {
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
    lastTracer = tracer;
    const res = await POST(makeRequest(`payload with ${tracer}`));
    expect(res.status).toBe(429);

    const out = capture.buffers.stdout.join("\n") + capture.buffers.stderr.join("\n");
    expect(out).not.toContain(tracer);
  });
});
