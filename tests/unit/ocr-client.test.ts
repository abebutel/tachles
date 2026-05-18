import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sentinel image bytes — content irrelevant since we mock the upstreams.
const FAKE_IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("OCR client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.GOOGLE_CLOUD_VISION_KEY = "test-google-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("extractTextGoogleVision parses fullTextAnnotation", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          responses: [
            {
              fullTextAnnotation: {
                text: "שלום מבטוח לאומי",
                pages: [{ confidence: 0.92 }],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const { extractTextGoogleVision } = await import("@/lib/proxy/ocr-client");
    const result = await extractTextGoogleVision(FAKE_IMAGE);
    expect(result.text).toBe("שלום מבטוח לאומי");
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it("extractTextGoogleVision throws SafeError on 500", async () => {
    globalThis.fetch = vi.fn(async () => new Response("internal error", { status: 500 })) as unknown as typeof fetch;
    const { extractTextGoogleVision } = await import("@/lib/proxy/ocr-client");
    await expect(extractTextGoogleVision(FAKE_IMAGE)).rejects.toMatchObject({
      code: "UPSTREAM_5XX",
      status: 502,
      upstream: "google_vision",
    });
  });

  it("extractTextGoogleVision throws SafeError on 429", async () => {
    globalThis.fetch = vi.fn(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    const { extractTextGoogleVision } = await import("@/lib/proxy/ocr-client");
    await expect(extractTextGoogleVision(FAKE_IMAGE)).rejects.toMatchObject({
      code: "UPSTREAM_RATE_LIMIT",
      status: 503,
    });
  });

  it("extractTextGoogleVision throws when API key missing", async () => {
    delete process.env.GOOGLE_CLOUD_VISION_KEY;
    vi.resetModules();
    const { extractTextGoogleVision } = await import("@/lib/proxy/ocr-client");
    await expect(extractTextGoogleVision(FAKE_IMAGE)).rejects.toMatchObject({
      code: "OCR_NOT_CONFIGURED",
      status: 500,
    });
  });

  it("runOcr falls back to Claude when Google confidence is below threshold", async () => {
    process.env.OCR_FALLBACK_CONFIDENCE_THRESHOLD = "0.75";
    vi.resetModules();

    // Both providers go through fetch now. We route by URL: vision.googleapis.com
    // returns low confidence; api.anthropic.com returns a high-quality result.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("vision.googleapis.com")) {
        return new Response(
          JSON.stringify({
            responses: [{ fullTextAnnotation: { text: "noisy text", pages: [{ confidence: 0.5 }] } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("api.anthropic.com")) {
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "high quality extracted text" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    const { runOcr } = await import("@/lib/proxy/ocr-client");
    const result = await runOcr(FAKE_IMAGE, "image/png");
    expect(result.provider_used).toBe("claude_fallback");
    expect(result.text).toBe("high quality extracted text");
    expect(result.confidence).toBe(1.0);
  });

  it("runOcr uses Google when confidence is above threshold", async () => {
    process.env.OCR_FALLBACK_CONFIDENCE_THRESHOLD = "0.75";
    vi.resetModules();

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          responses: [{ fullTextAnnotation: { text: "clear text", pages: [{ confidence: 0.95 }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const { runOcr } = await import("@/lib/proxy/ocr-client");
    const result = await runOcr(FAKE_IMAGE, "image/png");
    expect(result.provider_used).toBe("google");
    expect(result.text).toBe("clear text");
    expect(result.confidence).toBeCloseTo(0.95);
  });

  it("runOcr rejects unsupported media types before calling upstream", async () => {
    const { runOcr } = await import("@/lib/proxy/ocr-client");
    await expect(runOcr(FAKE_IMAGE, "application/pdf")).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 415,
    });
  });
});
