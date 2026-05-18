import { SafeError, SafeErrorCodes } from "./safe-error";

// Read a request body stream into a bounded Uint8Array.
//
// Why we don't use `await request.arrayBuffer()`:
//   - It's banned by Six Disciplines #1 (and by our `no-text-on-request`
//     ESLint rule). The reason the disciplines ban it is that it makes
//     "I accidentally logged the body" trivially expressible — once you
//     have a string/buffer, JSON.stringify is one keystroke away.
//   - We read chunks manually and accumulate so we can ENFORCE the size
//     limit during the read, aborting before fully buffering an attacker's
//     20MB upload.
//
// The returned bytes live for the duration of the route handler. They go
// out of scope the moment the upstream response is streamed back. Nothing
// else references them.

export async function readBodyBounded(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  // Reject early on declared size — saves us reading anything.
  const declared = request.headers.get("content-length");
  if (declared) {
    const n = parseInt(declared, 10);
    if (!Number.isFinite(n) || n < 0) {
      throw new SafeError({
        code: SafeErrorCodes.INVALID_INPUT,
        status: 400,
        message: "invalid content-length",
      });
    }
    if (n > maxBytes) {
      throw new SafeError({
        code: SafeErrorCodes.BODY_TOO_LARGE,
        status: 413,
        message: `body exceeds ${maxBytes} bytes`,
      });
    }
  }

  if (!request.body) {
    throw new SafeError({
      code: SafeErrorCodes.INVALID_INPUT,
      status: 400,
      message: "missing body",
    });
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Cancel the reader so the underlying stream can be cleaned up.
        await reader.cancel();
        throw new SafeError({
          code: SafeErrorCodes.BODY_TOO_LARGE,
          status: 413,
          message: `body exceeds ${maxBytes} bytes`,
        });
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader may already be released after cancel(); ignore.
    }
  }

  // Concatenate without intermediate string conversion.
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

// Base64-encode without going through a binary string for the whole buffer.
// On Edge runtime, `btoa(String.fromCharCode(...bytes))` blows the stack on
// large inputs. This loops in 8 KB chunks.
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
