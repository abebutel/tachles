import type { MessagesRequest } from "@/lib/proxy/anthropic-client";
import { TRANSLATION_MODEL } from "@/lib/proxy/anthropic-client";

// Classify a letter into one of four institution categories so the pipeline
// can route to the right specialist prompt.
//
// Output JSON shape: lib/prompts/types.ts → ClassificationResult.

const CLASSIFY_SYSTEM_PROMPT = `You are a Hebrew document classifier. The user will paste the text of a letter from an Israeli institution. Your job is to identify which institution sent it. The four categories are:

1. "bituach_leumi" — letters from the National Insurance Institute (ביטוח לאומי / המוסד לביטוח לאומי). Signals: ביטוח לאומי logo references, claim numbers, terms like קצבה / מענק / דמי / זכאות.
2. "bank" — letters from any Israeli bank or credit-card company (בנק / כרטיס אשראי). Signals: bank name in header (הפועלים, לאומי, דיסקונט, מזרחי, etc.), account numbers (חשבון / חן), interest/balance/overdraft language.
3. "municipality" — letters from a city or local council (עירייה / מועצה מקומית / מועצה אזורית). Signals: municipality name, ארנונה, היטלים, תשלום עירוני, water/property fees.
4. "lawyer" — legal notices, court documents, attorney letters (עורך דין / עו"ד / משרד עורכי דין / בית משפט / התראה / תביעה). Signals: attorney letterhead, court references, legal threats, hearing dates.

If the document doesn't fit any of these (or you can't tell from the text), use "unknown".

Be concrete about what you saw in "detected_signals" — short phrases (max 6 words each), 1-4 items. Examples: "header text mentions ביטוח לאומי", "claim reference 12345-67-12", "attorney signature block".

OUTPUT: Respond ONLY with valid JSON. No preamble, no markdown fences. The JSON must match this shape exactly:

{
  "institution_category": "bituach_leumi" | "bank" | "municipality" | "lawyer" | "unknown",
  "confidence": <number between 0 and 1>,
  "detected_signals": [<short string>, ...]
}`;

export function buildPrompt_ClassifyDocument(ocrText: string): MessagesRequest {
  return {
    model: TRANSLATION_MODEL,
    max_tokens: 512,
    system: CLASSIFY_SYSTEM_PROMPT,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `Classify the following letter:\n\n${ocrText}`,
      },
    ],
  };
}
