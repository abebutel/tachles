import type { MessagesRequest } from "@/lib/proxy/anthropic-client";
import { TRANSLATION_MODEL } from "@/lib/proxy/anthropic-client";
import type { TranslationResult } from "./types";

// Quality-check pass — the third call in the translate pipeline.
//
// Spec: docs/no-log-proxy-spec.md §`/api/translate` and CLAUDE.md
// (buildPrompt_QualityCheck). The job is to check that the specialist's
// output faithfully reflects the original OCR text:
//
//   - Are amounts in the translation equal to amounts in the original?
//   - Are dates correctly identified, not invented?
//   - Are deadlines surfaced if they exist in the original?
//   - Are reference numbers / claim IDs preserved verbatim?
//   - Is anything hallucinated (mentioned in translation but absent in original)?
//
// QC failure surfaces to the user as a "we're not confident in this
// translation" banner in the Day 8 Results UI. We don't block the response
// on QC failure — we show the translation with a warning, and let the user
// decide whether to trust it.

const QUALITY_CHECK_SYSTEM_PROMPT = `You are a faithfulness checker for translated Hebrew letters from Israeli institutions. The user will give you:

1. The original OCR text of a Hebrew letter.
2. A structured JSON translation produced by a specialist translator.

Your job is to verify the translation faithfully reflects the original. Check for:

- **Amount integrity**: every amount in the translation MUST be findable in the OCR (allowing for minor formatting — "1,840" vs "1840", or " ₪ " vs "ILS").
- **Date integrity**: dates in the translation must come from the OCR. Flag invented dates. Allow Hebrew→ISO conversion if the original date is unambiguous.
- **Deadline preservation**: if the OCR mentions a deadline (תאריך אחרון / יש להגיש עד / לא יאוחר מ-), it MUST appear in the translation's dates[] (is_deadline=true) and action_items.
- **Reference number preservation**: claim IDs / case numbers / account refs should appear in reference_numbers[] verbatim. Account numbers may be MASKED (bullets + last 4 digits) — that's expected for bank letters and is NOT a faithfulness violation.
- **No hallucinations**: institution names, document types, action items, and facts in the translation must be supported by the OCR. Tone-rewording is fine ("you owe" vs "the recipient is liable for") but inventing facts is not.
- **Action item presence**: if the OCR demands an action (pay X, submit Y, appear at Z), it MUST appear in action_items.

Be strict but reasonable: minor paraphrasing in tldr_he/tldr_en/translation_he/translation_en is fine if the facts are preserved. Imperfect tone alone is not a "fail" — only flag concrete factual divergence.

Output a "concerns" array with at most 5 short strings (under 80 chars each) describing specific divergences you found. Empty array if none.

"passes" is true if and only if concerns is empty AND no critical fact (amount, deadline, action) was missed or invented.

"confidence" reflects how sure you are about your verdict, 0-1.

OUTPUT: Respond ONLY with valid JSON. No preamble, no markdown fences. Match this shape exactly:

{
  "passes": <true|false>,
  "concerns": [<short string>, ...],
  "confidence": <number between 0 and 1>
}`;

export function buildPrompt_QualityCheck(
  ocrText: string,
  translation: TranslationResult,
): MessagesRequest {
  return {
    model: TRANSLATION_MODEL,
    max_tokens: 1024,
    system: QUALITY_CHECK_SYSTEM_PROMPT,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `ORIGINAL OCR TEXT:
${ocrText}

----

STRUCTURED TRANSLATION:
${JSON.stringify(translation, null, 2)}

Verify the translation faithfully reflects the original.`,
      },
    ],
  };
}
