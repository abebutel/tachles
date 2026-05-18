import { SafeError, SafeErrorCodes } from "./safe-error";

// Thin fetch-based wrapper around Anthropic's Messages API.
//
// Why not the official SDK: @anthropic-ai/sdk's credential loader contains
// static `await import("node:fs")` / `node:path` calls (for OAuth disk
// credentials) which Vercel's Edge function scanner rejects on import-graph
// reachability — see the Day 4 followup that switched OCR fallback to fetch.
// Using fetch keeps the Edge bundle clean and gives us full control over
// retries and JSON parsing.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const TRANSLATION_MODEL = process.env.ANTHROPIC_TRANSLATION_MODEL ?? "claude-sonnet-4-6";

interface TextBlock {
  type: "text";
  text: string;
}

interface ImageBlock {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
}

export type MessageBlock = TextBlock | ImageBlock;

export interface MessagesRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string | MessageBlock[] }>;
  temperature?: number;
}

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

export interface MessagesCallResult {
  text: string;
  input_tokens: number;
  output_tokens: number;
  stop_reason: string;
}

// Single non-retried call to Anthropic. Returns the concatenated text content
// and token usage. Throws SafeError on HTTP error or empty response.
export async function callAnthropicMessages(
  body: MessagesRequest,
): Promise<MessagesCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new SafeError({
      code: "ANTHROPIC_NOT_CONFIGURED",
      status: 500,
      upstream: "anthropic",
      message: "ANTHROPIC_API_KEY missing",
    });
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new SafeError({
      code:
        res.status === 429
          ? SafeErrorCodes.UPSTREAM_RATE_LIMIT
          : SafeErrorCodes.UPSTREAM_5XX,
      status: res.status === 429 ? 503 : 502,
      upstream: "anthropic",
      message: `anthropic returned ${res.status}`,
    });
  }

  const json = (await res.json()) as MessagesResponse;
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
      message: "anthropic returned empty text",
    });
  }

  return {
    text,
    input_tokens: json.usage?.input_tokens ?? 0,
    output_tokens: json.usage?.output_tokens ?? 0,
    stop_reason: json.stop_reason ?? "unknown",
  };
}

// Strip ```json ... ``` fences the model sometimes emits despite the system
// prompt forbidding them. Keep this conservative — we don't want to mangle
// real content.
function stripCodeFences(text: string): string {
  const fence = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return fence ? fence[1] : text;
}

// Call Anthropic and parse the response as JSON conforming to T. Retries
// ONCE on parse failure — second call adds a corrective system reminder.
// After the second failure, throws UPSTREAM_INVALID_RESPONSE.
export async function callAnthropicJson<T>(
  body: MessagesRequest,
): Promise<{ value: T; input_tokens: number; output_tokens: number }> {
  const tryParse = (text: string): T | null => {
    try {
      return JSON.parse(stripCodeFences(text)) as T;
    } catch {
      return null;
    }
  };

  const first = await callAnthropicMessages(body);
  const parsed1 = tryParse(first.text);
  if (parsed1 !== null) {
    return {
      value: parsed1,
      input_tokens: first.input_tokens,
      output_tokens: first.output_tokens,
    };
  }

  // Retry once with an explicit reminder. We send the same user message and
  // append an assistant + user pair forcing the model to re-emit JSON only.
  const retry = await callAnthropicMessages({
    ...body,
    messages: [
      ...body.messages,
      { role: "assistant", content: first.text },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON. Respond again with ONLY a valid JSON object matching the requested shape. No prose, no markdown fences, just the JSON.",
      },
    ],
  });
  const parsed2 = tryParse(retry.text);
  if (parsed2 !== null) {
    return {
      value: parsed2,
      input_tokens: first.input_tokens + retry.input_tokens,
      output_tokens: first.output_tokens + retry.output_tokens,
    };
  }

  throw new SafeError({
    code: SafeErrorCodes.UPSTREAM_INVALID_RESPONSE,
    status: 502,
    upstream: "anthropic",
    message: "anthropic response was not valid JSON after one retry",
  });
}
