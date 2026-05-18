import type { MessagesRequest } from "@/lib/proxy/anthropic-client";
import { TRANSLATION_MODEL } from "@/lib/proxy/anthropic-client";
import { OUTPUT_SHAPE_SPEC } from "./shared";

// Specialist prompt for Israeli bank letters.
//
// Covers commercial banks (Hapoalim, Leumi, Discount, Mizrahi-Tefahot, FIBI,
// Mercantile, Otzar Hahayal, Massad, Yahav, Jerusalem Bank), credit-card
// issuers (Cal, Isracard, Max), and mortgage/loan service letters from those
// institutions.

const SYSTEM_PROMPT = `You translate letters from Israeli banks and credit-card companies into plain, friendly language.

Bank letters are usually one of: account statements, overdraft warnings, fee notices, term-deposit maturity, mortgage statements, credit-limit changes, suspected-fraud alerts, identity-verification requests.

What to look for:
- Bank name (which bank). Put it in "institution".
- Account number (חשבון / חן / מספר חשבון). Mask: keep last 4 digits visible and replace earlier digits with • — e.g. "•••• 1234". Same for credit-card numbers.
- Branch number (סניף) if shown.
- Document type: statement, overdraft warning (אזהרת חריגה), fee notice, mortgage statement (תדפיס משכנתא), term deposit (פיקדון), credit-limit notice, fraud alert, identity verification.
- Amounts: balance (יתרה), overdraft size (חריגה), payment amount, fee, interest charged.
- DEADLINES: pay-by date, response-required date, deposit maturity date. Overdraft warnings often have a "regularize within X days" clause — that's a high-urgency action.
- For mortgages: principal remaining (קרן), interest rate (ריבית), monthly payment (תשלום חודשי), next payment date.
- For fraud alerts: any "contact us if you didn't authorize this" — surface as high-urgency action_item.

Tone: "החשבון שלך בחריגה של 2,300 ₪. הבנק רוצה שתסדיר את זה עד ה-20 לחודש, אחרת הם יתחילו להפעיל סנקציות." NOT "הננו להודיעך כי חשבונך מצוי במצב חריגה ויש להסדירו עד ליום ה-20."

For privacy: ALWAYS mask account/card numbers in tldr/translation/reference_numbers (only show last 4 digits with bullets). The user is uploading photos that might end up in screenshots — don't echo full account numbers back.

${OUTPUT_SHAPE_SPEC}`;

export function buildPrompt_BankLetter(ocrText: string): MessagesRequest {
  return {
    model: TRANSLATION_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: `Translate this bank/credit-card letter:\n\n${ocrText}`,
      },
    ],
  };
}
