import { SafeError, SafeErrorCodes } from "./safe-error";
import { bytesToBase64 } from "./stream";

// Two-provider OCR pipeline.
//
// 1. Primary: Google Cloud Vision DOCUMENT_TEXT_DETECTION.
//    Better Hebrew character accuracy than Claude vision (especially for
//    typeset government letters). Returns a confidence score per page.
// 2. Fallback: Claude Vision (claude-haiku-4-5 — fastest vision model that
//    handles Hebrew well).
//    Triggered when (a) Google confidence falls below the threshold or (b)
//    Google fails outright.
//
// Spec: docs/no-log-proxy-spec.md §`/api/ocr`.
//
// IMPORTANT: image bytes pass through here once, in memory, and are never
// persisted, logged, or sent to any error tracker.

export type OcrProvider = "google" | "claude_fallback";

export interface OcrResult {
  text: string;
  confidence: number;
  provider_used: OcrProvider;
}

const OCR_FALLBACK_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.OCR_FALLBACK_CONFIDENCE_THRESHOLD ?? "0.75",
);

const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function normalizeMediaType(contentType: string | null): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const ct = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!SUPPORTED_MEDIA_TYPES.has(ct)) {
    throw new SafeError({
      code: SafeErrorCodes.INVALID_INPUT,
      status: 415,
      message: "unsupported media type",
    });
  }
  return ct as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

// --- Google Cloud Vision ---

interface GoogleVisionResponse {
  responses: Array<{
    fullTextAnnotation?: {
      text?: string;
      pages?: Array<{ confidence?: number }>;
    };
    error?: { message?: string; code?: number };
  }>;
}

export async function extractTextGoogleVision(
  imageBytes: Uint8Array,
): Promise<{ text: string; confidence: number }> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_KEY;
  if (!apiKey) {
    throw new SafeError({
      code: "OCR_NOT_CONFIGURED",
      status: 500,
      upstream: "google_vision",
      message: "GOOGLE_CLOUD_VISION_KEY missing",
    });
  }

  const body = JSON.stringify({
    requests: [
      {
        image: { content: bytesToBase64(imageBytes) },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["he", "en"] },
      },
    ],
  });

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  );

  if (!res.ok) {
    throw new SafeError({
      code:
        res.status === 429
          ? SafeErrorCodes.UPSTREAM_RATE_LIMIT
          : SafeErrorCodes.UPSTREAM_5XX,
      status: res.status === 429 ? 503 : 502,
      upstream: "google_vision",
      message: `google vision returned ${res.status}`,
    });
  }

  // Vision returns small JSON of structured text. Parsing it is allowed (it's
  // metadata + extracted text, not the original document body — though the
  // extracted text IS user content and goes back to the user verbatim, never
  // logged).
  const json = (await res.json()) as GoogleVisionResponse;
  const r0 = json.responses?.[0];
  if (!r0 || r0.error) {
    throw new SafeError({
      code: SafeErrorCodes.UPSTREAM_INVALID_RESPONSE,
      status: 502,
      upstream: "google_vision",
      message: "google vision error response",
    });
  }
  const text = r0.fullTextAnnotation?.text ?? "";
  const pageConfs = r0.fullTextAnnotation?.pages?.map((p) => p.confidence ?? 0) ?? [];
  const confidence = pageConfs.length > 0
    ? pageConfs.reduce((a, b) => a + b, 0) / pageConfs.length
    : (text ? 0.5 : 0);
  return { text, confidence };
}

// --- Anthropic Claude Vision fallback ---

const CLAUDE_VISION_MODEL = process.env.CLAUDE_VISION_MODEL ?? "claude-haiku-4-5";

const CLAUDE_OCR_SYSTEM_PROMPT = `You are an OCR engine. The user will send a photo of a Hebrew letter from an Israeli institution (Bituach Leumi, a bank, a municipality, or a lawyer). Extract ALL the text from the image exactly as it appears, preserving line breaks. Hebrew on Hebrew lines, English on English lines, numbers as-is. Do not translate. Do not summarize. Do not add commentary. Output ONLY the extracted text, nothing else.`;

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

export async function extractTextClaudeFallback(
  imageBytes: Uint8Array,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<{ text: string; confidence: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new SafeError({
      code: "OCR_NOT_CONFIGURED",
      status: 500,
      upstream: "anthropic",
      message: "ANTHROPIC_API_KEY missing",
    });
  }

  // Direct REST call instead of @anthropic-ai/sdk. The SDK's credential
  // loader has static `await import("node:fs")` / `node:path` calls (for
  // OAuth disk credentials), which Vercel's Edge function scanner rejects
  // on import-graph reachability — even though we only ever pass an API
  // key and never reach the disk-loading code path. Switching to fetch
  // keeps the Edge bundle clean and matches the style we already use for
  // Google Vision.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_VISION_MODEL,
      max_tokens: 4096,
      system: CLAUDE_OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: bytesToBase64(imageBytes),
              },
            },
            { type: "text", text: "Extract all the text from this image." },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new SafeError({
      code:
        res.status === 429
          ? SafeErrorCodes.UPSTREAM_RATE_LIMIT
          : SafeErrorCodes.UPSTREAM_5XX,
      status: res.status === 429 ? 503 : 502,
      upstream: "anthropic",
      message: `claude vision returned ${res.status}`,
    });
  }

  const json = (await res.json()) as AnthropicMessageResponse;
  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new SafeError({
      code: SafeErrorCodes.UPSTREAM_INVALID_RESPONSE,
      status: 502,
      upstream: "anthropic",
      message: "claude vision returned empty text",
    });
  }

  // Claude doesn't return a calibrated confidence score for OCR. We mark
  // fallback results as 1.0 (i.e., we trust them) since we only fall back
  // when Google failed or was below the threshold.
  return { text, confidence: 1.0 };
}

// --- Orchestrator ---

export async function runOcr(
  imageBytes: Uint8Array,
  contentType: string | null,
): Promise<OcrResult> {
  const mediaType = normalizeMediaType(contentType);

  // Try Google first. If it throws OR confidence is below threshold, fall
  // back to Claude.
  let google: { text: string; confidence: number } | null = null;
  let googleError: SafeError | null = null;
  try {
    google = await extractTextGoogleVision(imageBytes);
  } catch (err) {
    if (err instanceof SafeError) googleError = err;
    else throw err; // propagate non-SafeError (shouldn't happen)
  }

  if (google && google.confidence >= OCR_FALLBACK_CONFIDENCE_THRESHOLD) {
    return { ...google, provider_used: "google" };
  }

  // Either Google failed or its confidence was too low. Try Claude.
  try {
    const claude = await extractTextClaudeFallback(imageBytes, mediaType);
    return { ...claude, provider_used: "claude_fallback" };
  } catch (claudeErr) {
    // If Claude also fails, surface whichever upstream we hit first so the
    // route logger has a coherent error_code to record.
    throw googleError ?? claudeErr;
  }
}
