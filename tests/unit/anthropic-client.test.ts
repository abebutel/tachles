import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function anthropicTextResponse(text: string): Response {
  return jsonResponse({
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 50 },
    stop_reason: "end_turn",
  });
}

describe("callAnthropicMessages", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns concatenated text + token usage on 200", async () => {
    globalThis.fetch = vi.fn(async () =>
      anthropicTextResponse("hello world"),
    ) as unknown as typeof fetch;

    const { callAnthropicMessages } = await import("@/lib/proxy/anthropic-client");
    const result = await callAnthropicMessages({
      model: "claude-test",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.text).toBe("hello world");
    expect(result.input_tokens).toBe(100);
    expect(result.output_tokens).toBe(50);
  });

  it("throws UPSTREAM_RATE_LIMIT on 429", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    const { callAnthropicMessages } = await import("@/lib/proxy/anthropic-client");
    await expect(
      callAnthropicMessages({
        model: "claude-test",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_RATE_LIMIT", status: 503 });
  });

  it("throws UPSTREAM_5XX on 500", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    const { callAnthropicMessages } = await import("@/lib/proxy/anthropic-client");
    await expect(
      callAnthropicMessages({
        model: "claude-test",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_5XX", status: 502 });
  });

  it("throws ANTHROPIC_NOT_CONFIGURED when API key missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.resetModules();
    const { callAnthropicMessages } = await import("@/lib/proxy/anthropic-client");
    await expect(
      callAnthropicMessages({
        model: "claude-test",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toMatchObject({ code: "ANTHROPIC_NOT_CONFIGURED" });
  });
});

describe("callAnthropicJson", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses a valid JSON response on first call", async () => {
    globalThis.fetch = vi.fn(async () =>
      anthropicTextResponse(JSON.stringify({ hello: "world", n: 42 })),
    ) as unknown as typeof fetch;

    const { callAnthropicJson } = await import("@/lib/proxy/anthropic-client");
    const result = await callAnthropicJson<{ hello: string; n: number }>({
      model: "claude-test",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.value).toEqual({ hello: "world", n: 42 });
    expect(result.input_tokens).toBe(100);
    expect(result.output_tokens).toBe(50);
  });

  it("strips ```json fences before parsing", async () => {
    globalThis.fetch = vi.fn(async () =>
      anthropicTextResponse('```json\n{"ok": true}\n```'),
    ) as unknown as typeof fetch;
    const { callAnthropicJson } = await import("@/lib/proxy/anthropic-client");
    const result = await callAnthropicJson<{ ok: boolean }>({
      model: "claude-test",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.value).toEqual({ ok: true });
  });

  it("retries once when first response is not JSON, succeeds on retry", async () => {
    let callIdx = 0;
    globalThis.fetch = vi.fn(async () => {
      callIdx += 1;
      return anthropicTextResponse(
        callIdx === 1 ? "I am not JSON, sorry." : JSON.stringify({ recovered: true }),
      );
    }) as unknown as typeof fetch;

    const { callAnthropicJson } = await import("@/lib/proxy/anthropic-client");
    const result = await callAnthropicJson<{ recovered: boolean }>({
      model: "claude-test",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.value).toEqual({ recovered: true });
    expect(result.input_tokens).toBe(200); // sum of both calls
    expect(result.output_tokens).toBe(100);
    expect(callIdx).toBe(2);
  });

  it("throws UPSTREAM_INVALID_RESPONSE after two parse failures", async () => {
    globalThis.fetch = vi.fn(async () =>
      anthropicTextResponse("definitely not json"),
    ) as unknown as typeof fetch;
    const { callAnthropicJson } = await import("@/lib/proxy/anthropic-client");
    await expect(
      callAnthropicJson({
        model: "claude-test",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toMatchObject({
      code: "UPSTREAM_INVALID_RESPONSE",
      upstream: "anthropic",
    });
  });
});
