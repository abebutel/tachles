import { SafeError, SafeErrorCodes } from "./safe-error";
import { callAnthropicJson } from "./anthropic-client";
import { buildPrompt_ClassifyDocument } from "@/lib/prompts/classify";
import { buildPrompt_QualityCheck } from "@/lib/prompts/quality-check";
import { routeToSpecialistPrompt, type SpecialistRoute } from "@/lib/prompts/route";
import type {
  ClassificationResult,
  QualityCheckResult,
  TranslateResponse,
  TranslationResult,
} from "@/lib/prompts/types";

// THE ONE FILE allowed to call `request.json()`. The route handler
// (app/api/translate/route.ts) hands its inbound Request to
// runTranslationPipeline() which parses the body, runs classification,
// routes to a specialist, and returns the structured result.
//
// Spec: docs/no-log-proxy-spec.md §`/api/translate` and Six Disciplines #2.
// ESLint exemption: eslint.config.mjs marks this file as the sole exception
// to tachles/no-text-on-request. Day 6 will add the quality-check step.
//
// The ocr_text variable LIVES in this function's scope. It is never logged
// (proxyLogger's types reject it) and never appears in any thrown error
// (SafeError messages are constructed without user content). It goes out
// of scope when the response stream is committed.

const MAX_TRANSLATE_BODY_BYTES = parseInt(
  process.env.MAX_TRANSLATE_BODY_BYTES ?? "51200",
  10,
);

interface TranslateRequestBody {
  ocr_text: string;
  target_language?: "he" | "en";
}

export interface PipelineMetadata {
  classification_label: SpecialistRoute;
  classification_confidence: number;
  specialist_route: SpecialistRoute;
  total_input_tokens: number;
  total_output_tokens: number;
  call_count: number;
  quality_check_passed: boolean;
}

export interface PipelineResult {
  body: TranslateResponse;
  metadata: PipelineMetadata;
}

export async function runTranslationPipeline(request: Request): Promise<PipelineResult> {
  // Pre-flight size check on the inbound JSON envelope (not just the text
  // field). Cheaper than parsing first.
  const declared = request.headers.get("content-length");
  if (declared) {
    const n = parseInt(declared, 10);
    if (Number.isFinite(n) && n > MAX_TRANSLATE_BODY_BYTES) {
      throw new SafeError({
        code: SafeErrorCodes.BODY_TOO_LARGE,
        status: 413,
        message: `body exceeds ${MAX_TRANSLATE_BODY_BYTES} bytes`,
      });
    }
  }

  // The sanctioned call to request.json(). Six Disciplines #2 — this is the
  // ONLY place in the proxy paths where it's allowed (ESLint enforced).
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new SafeError({
      code: SafeErrorCodes.INVALID_INPUT,
      status: 400,
      message: "request body is not valid JSON",
    });
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as TranslateRequestBody).ocr_text !== "string"
  ) {
    throw new SafeError({
      code: SafeErrorCodes.INVALID_INPUT,
      status: 400,
      message: "missing or invalid ocr_text",
    });
  }

  const ocrText = (parsed as TranslateRequestBody).ocr_text;
  if (ocrText.length === 0) {
    throw new SafeError({
      code: SafeErrorCodes.INVALID_INPUT,
      status: 400,
      message: "ocr_text is empty",
    });
  }
  if (ocrText.length > MAX_TRANSLATE_BODY_BYTES) {
    throw new SafeError({
      code: SafeErrorCodes.BODY_TOO_LARGE,
      status: 413,
      message: `ocr_text exceeds ${MAX_TRANSLATE_BODY_BYTES} bytes`,
    });
  }

  let totalInput = 0;
  let totalOutput = 0;
  let callCount = 0;

  // Step 1: classify.
  const classifyResult = await callAnthropicJson<ClassificationResult>(
    buildPrompt_ClassifyDocument(ocrText),
  );
  totalInput += classifyResult.input_tokens;
  totalOutput += classifyResult.output_tokens;
  callCount += 1;

  // Validate classifier output shape minimally — defensive in case the model
  // returns extra fields or a malformed shape that JSON.parse accepted.
  const classification = normalizeClassification(classifyResult.value);

  // Step 2: route + specialist call.
  const routed = routeToSpecialistPrompt(ocrText, classification);
  const translationResult = await callAnthropicJson<TranslationResult>(routed.prompt);
  totalInput += translationResult.input_tokens;
  totalOutput += translationResult.output_tokens;
  callCount += 1;

  // Step 3: quality check. Defensive — if the QC call itself throws or
  // returns a malformed verdict, we don't fail the whole request. The user
  // still gets the translation, with the QC marked as failed (low-confidence
  // verdict). The alternative — failing the whole request when QC errors —
  // would punish the user for a tool problem.
  const qualityCheck = await runQualityCheckSafely(
    ocrText,
    translationResult.value,
    (input, output) => {
      totalInput += input;
      totalOutput += output;
      callCount += 1;
    },
  );

  return {
    body: {
      classification,
      translation: translationResult.value,
      quality_check: qualityCheck,
    },
    metadata: {
      classification_label: classification.institution_category,
      classification_confidence: classification.confidence,
      specialist_route: routed.route,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      call_count: callCount,
      quality_check_passed: qualityCheck.passes,
    },
  };
}

async function runQualityCheckSafely(
  ocrText: string,
  translation: TranslationResult,
  onUsage: (input: number, output: number) => void,
): Promise<QualityCheckResult> {
  try {
    const result = await callAnthropicJson<QualityCheckResult>(
      buildPrompt_QualityCheck(ocrText, translation),
    );
    onUsage(result.input_tokens, result.output_tokens);
    return normalizeQualityCheck(result.value);
  } catch {
    // QC failed for some reason (upstream error, parse failure). Return a
    // "didn't pass, low confidence" verdict so the user sees the
    // can't-validate banner rather than a failed request.
    return {
      passes: false,
      concerns: ["quality check could not run"],
      confidence: 0,
    };
  }
}

function normalizeQualityCheck(value: unknown): QualityCheckResult {
  if (typeof value !== "object" || value === null) {
    return { passes: false, concerns: ["malformed quality-check response"], confidence: 0 };
  }
  const v = value as Record<string, unknown>;
  const passes = v.passes === true;
  const concerns = Array.isArray(v.concerns)
    ? v.concerns.filter((c): c is string => typeof c === "string").slice(0, 5)
    : [];
  const confidence = typeof v.confidence === "number" ? Math.max(0, Math.min(1, v.confidence)) : 0;
  return { passes, concerns, confidence };
}

function normalizeClassification(value: unknown): ClassificationResult {
  if (typeof value !== "object" || value === null) {
    throw new SafeError({
      code: SafeErrorCodes.UPSTREAM_INVALID_RESPONSE,
      status: 502,
      upstream: "anthropic",
      message: "classifier returned non-object",
    });
  }
  const v = value as Record<string, unknown>;
  const cat = v.institution_category;
  const valid = cat === "bituach_leumi" || cat === "bank" || cat === "municipality" || cat === "lawyer" || cat === "unknown";
  if (!valid) {
    throw new SafeError({
      code: SafeErrorCodes.UPSTREAM_INVALID_RESPONSE,
      status: 502,
      upstream: "anthropic",
      message: "classifier returned invalid institution_category",
    });
  }
  const confidence = typeof v.confidence === "number" ? v.confidence : 0;
  const signals = Array.isArray(v.detected_signals)
    ? v.detected_signals.filter((s): s is string => typeof s === "string")
    : [];
  return {
    institution_category: cat,
    confidence: Math.max(0, Math.min(1, confidence)),
    detected_signals: signals,
  };
}
