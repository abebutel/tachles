#!/usr/bin/env tsx
// Smoke test for the OCR clients. Runs Google Vision + Claude Vision against
// a real image and prints both results.
//
// This bypasses the /api/ocr route (auth + rate-limit are covered by the
// canary tests). The point is to validate that:
//   1. GOOGLE_CLOUD_VISION_KEY is configured correctly and Vision returns
//      text + a confidence score
//   2. ANTHROPIC_API_KEY is configured correctly and Claude vision returns
//      text
//   3. Both providers handle Hebrew correctly on a real image
//
// Usage:
//   pnpm tsx scripts/smoke-ocr.ts <path-to-image>
//
// Requires .env.local in the project root with GOOGLE_CLOUD_VISION_KEY and
// ANTHROPIC_API_KEY set. Reads it automatically.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Lightweight .env.local loader — no extra dep.
async function loadEnvLocal(): Promise<void> {
  try {
    const raw = await readFile(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, key, valueRaw] = m;
      if (process.env[key]) continue; // existing env wins
      let value = valueRaw;
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // No .env.local — assume env is already set externally.
  }
}

function inferMediaType(path: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  throw new Error(`unsupported image extension: .${ext}`);
}

async function main(): Promise<void> {
  await loadEnvLocal();

  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Usage: pnpm tsx scripts/smoke-ocr.ts <path-to-image>");
    process.exit(2);
  }

  const absPath = resolve(imagePath);
  const bytes = new Uint8Array(await readFile(absPath));
  const mediaType = inferMediaType(absPath);

  console.log(`Image: ${absPath}`);
  console.log(`Media type: ${mediaType}`);
  console.log(`Bytes: ${bytes.byteLength.toLocaleString()}`);
  console.log("");

  // Import after env is loaded — the clients read env vars at module init.
  const { extractTextGoogleVision, extractTextClaudeFallback } = await import(
    "../lib/proxy/ocr-client"
  );

  // Google Vision
  console.log("─".repeat(60));
  console.log("Google Cloud Vision");
  console.log("─".repeat(60));
  const tGoogle = Date.now();
  try {
    const result = await extractTextGoogleVision(bytes);
    const latency = Date.now() - tGoogle;
    console.log(`✓ ${latency}ms  confidence=${result.confidence.toFixed(3)}`);
    console.log("");
    console.log(result.text);
  } catch (err) {
    console.log(`✗ ${(err as { code?: string }).code ?? "ERROR"}`);
    console.log((err as Error).message);
  }

  console.log("");

  // Claude Vision
  console.log("─".repeat(60));
  console.log("Anthropic Claude Vision (fallback)");
  console.log("─".repeat(60));
  const tClaude = Date.now();
  try {
    const result = await extractTextClaudeFallback(bytes, mediaType);
    const latency = Date.now() - tClaude;
    console.log(`✓ ${latency}ms  confidence=${result.confidence.toFixed(3)}`);
    console.log("");
    console.log(result.text);
  } catch (err) {
    console.log(`✗ ${(err as { code?: string }).code ?? "ERROR"}`);
    console.log((err as Error).message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
