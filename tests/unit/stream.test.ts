import { describe, expect, it } from "vitest";
import { readBodyBounded, bytesToBase64 } from "@/lib/proxy/stream";
import { SafeError } from "@/lib/proxy/safe-error";

function makeRequest(bytes: Uint8Array, declaredLength?: string | null): Request {
  const headers: Record<string, string> = { "content-type": "image/png" };
  if (declaredLength !== null) {
    headers["content-length"] = declaredLength ?? String(bytes.byteLength);
  }
  return new Request("https://test.local/", {
    method: "POST",
    headers,
    body: bytes as BodyInit,
  });
}

describe("readBodyBounded", () => {
  it("reads bytes under the limit", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const out = await readBodyBounded(makeRequest(bytes), 100);
    expect(out.byteLength).toBe(5);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects when declared Content-Length exceeds the limit, before reading", async () => {
    const bytes = new Uint8Array(50);
    const req = new Request("https://test.local/", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: bytes as BodyInit,
    });
    await expect(readBodyBounded(req, 100)).rejects.toBeInstanceOf(SafeError);
  });

  it("rejects mid-read when accumulated size exceeds the limit", async () => {
    // Build a request whose body streams in chunks past the limit but whose
    // declared length stays low (simulating a lying client).
    const big = new Uint8Array(2048);
    const req = new Request("https://test.local/", {
      method: "POST",
      // Intentionally omit content-length so the size check happens during read.
      body: big,
    });
    await expect(readBodyBounded(req, 1024)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects invalid Content-Length", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const req = new Request("https://test.local/", {
      method: "POST",
      headers: { "content-length": "not-a-number" },
      body: bytes as BodyInit,
    });
    await expect(readBodyBounded(req, 1024)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 400,
    });
  });
});

describe("bytesToBase64", () => {
  it("encodes small buffers correctly", () => {
    const out = bytesToBase64(new TextEncoder().encode("hello"));
    expect(out).toBe("aGVsbG8=");
  });

  it("encodes buffers larger than the 8KB chunk size without stack overflow", () => {
    const size = 64 * 1024;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;
    const out = bytesToBase64(bytes);
    expect(out.length).toBeGreaterThan(0);
    // Round-trip — decode and compare a few bytes.
    const decoded = Uint8Array.from(atob(out), (c) => c.charCodeAt(0));
    expect(decoded.byteLength).toBe(size);
    expect(decoded[0]).toBe(0);
    expect(decoded[size - 1]).toBe((size - 1) % 256);
  });
});
