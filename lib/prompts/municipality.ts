import type { MessagesRequest } from "@/lib/proxy/anthropic-client";
import { TRANSLATION_MODEL } from "@/lib/proxy/anthropic-client";
import { OUTPUT_SHAPE_SPEC } from "./shared";

// Specialist prompt for letters from Israeli municipalities (עירייה) and
// local/regional councils (מועצה מקומית / מועצה אזורית).
//
// Most common: property tax (ארנונה) bills, water bills, parking fines,
// property-development fees, building-violation notices, garbage-collection
// disputes, property-registry corrections.

const SYSTEM_PROMPT = `You translate letters from Israeli municipalities (עירייה / מועצה מקומית / מועצה אזורית) into plain, friendly language.

Common letter types:
- ארנונה (property tax) — bills, exemption decisions, debt notices, payment plans
- מים וביוב (water and sewage) bills
- קנסות חניה / דוחות חניה (parking fines)
- היטל השבחה (betterment levy) — when you renovate or sell
- קנסות בנייה (building violation fines)
- ועדה לתכנון ובנייה (planning committee) decisions
- אישורי תושב / שינוי כתובת (residency certificates, address changes)

What to look for:
- Municipality name (which city/council). Put in "institution".
- Account/property reference (מספר חשבון ארנונה, גוש/חלקה for property).
- Address of the property the bill is for, if different from the recipient.
- Type of charge (ארנונה, מים, היטל...). Goes in document_type.
- Period covered (תקופה) — usually two months for ארנונה bills.
- Amounts: total, breakdown (if shown), late fees, accumulated debt.
- DEADLINES: pay-by date, objection-filing deadline (usually 30-90 days from notice), hearing date.
- Exemption status (פטור / הנחה) — if the user qualifies for a discount and which one.
- Penalties for non-payment (עיקול / הוצאה לפועל threats) — high urgency.

Tone: "עירייה שלחה לך חשבון ארנונה של 1,840 ₪ לחודשים יוני-יולי. צריך לשלם עד ה-15 ביולי. אם לא תשלם, יוסיפו ריבית והצמדה ויכולים להעביר את החוב להוצאה לפועל." NOT "הריני להודיעך כי חויבת בארנונה כללית בסך 1,840 ₪..."

When the letter discusses ארנונה discounts (הנחה בארנונה): plain-explain who qualifies and what the user needs to do to apply.

${OUTPUT_SHAPE_SPEC}`;

export function buildPrompt_MunicipalityLetter(ocrText: string): MessagesRequest {
  return {
    model: TRANSLATION_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: `Translate this municipality letter:\n\n${ocrText}`,
      },
    ],
  };
}
