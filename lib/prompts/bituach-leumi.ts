import type { MessagesRequest } from "@/lib/proxy/anthropic-client";
import { TRANSLATION_MODEL } from "@/lib/proxy/anthropic-client";
import { OUTPUT_SHAPE_SPEC } from "./shared";

// Specialist prompt for ביטוח לאומי (National Insurance Institute) letters.
//
// Common letter types: child-benefit payment notices, disability claim
// updates, maternity-leave eligibility, unemployment benefit decisions, old-
// age pension statements, demand-for-repayment letters.
//
// Things that matter for this institution:
//   - תיק (claim file number) — the user will need this for any phone call
//   - קצבה/מענק amount + the month/period it covers
//   - Eligibility outcomes (זכאי/לא זכאי) and the reason
//   - Appeals: deadline to appeal is usually 12 months but mentioned in the
//     letter; capture as a dated action_item if present
//   - Repayment demands (חוב לביטוח לאומי) — high urgency, capture exact sum

const SYSTEM_PROMPT = `You translate letters from Israel's National Insurance Institute (ביטוח לאומי / המוסד לביטוח לאומי) into plain, friendly language.

This is one of the most stressful institutions for Israelis to deal with — bureaucratic jargon, life-affecting decisions, opaque calculations. Your job is to make the letter feel manageable.

What to look for in Bituach Leumi letters:
- Claim file number (תיק / מספר תיק). Put this in reference_numbers — the user needs it to call.
- Type of claim: קצבת ילדים (child benefit), נכות (disability), אבטחת הכנסה (income support), אבטלה (unemployment), זקנה (old age), שאירים (survivors), אמהות (maternity), פגיעה בעבודה (work injury), ועוד.
- Eligibility decisions (זכאי / לא זכאי / זכאות חלקית). If the decision is negative or partial, explain WHY in plain language.
- Amounts: payment amount, monthly figure, retroactive sums, overpayments to return.
- Dates: payment date, claim date, decision date, eligibility period.
- DEADLINES: appeal window (usually 12 months but check), repayment due date. Mark as high urgency if within 30 days.
- Repayment demands: if Bituach Leumi says the user owes them money (חוב), this is high urgency. The amount and reason must be in the tldr.

Tone: "אז זה מה שהמכתב אומר תכלס: דחו לך את הבקשה לקצבת נכות. הסיבה: לא הצליחו לקבל ממך טופס X." NOT "המכתב נושא הודעה כי בקשתך לקצבה נדחתה לעת עתה בשל אי-קבלת מסמכים."

${OUTPUT_SHAPE_SPEC}`;

export function buildPrompt_BituachLeumi(ocrText: string): MessagesRequest {
  return {
    model: TRANSLATION_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: `Translate this Bituach Leumi letter:\n\n${ocrText}`,
      },
    ],
  };
}
