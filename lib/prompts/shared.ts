// Shared scaffolding for the four specialist translation prompts.
//
// Every specialist returns the same JSON shape (lib/prompts/types.ts →
// TranslationResult). Only the system-prompt prelude differs — that's
// where each specialist tells the model what to look for in its specific
// document type.

export const OUTPUT_SHAPE_SPEC = `OUTPUT: Respond ONLY with valid JSON. No preamble, no markdown fences, no commentary. The JSON must match this shape exactly:

{
  "tldr_he": "<1-2 sentences in plain conversational Hebrew, like you're explaining to a friend>",
  "tldr_en": "<1-2 sentences in plain English>",
  "institution": "<human-readable institution name in English, e.g. 'Bituach Leumi' or 'Bank Hapoalim'>",
  "document_type": "<short English label, e.g. 'Child Benefit Payment Notice'>",
  "reference_numbers": [
    { "label": "<English label>", "value": "<exact value from letter>" }
  ],
  "amounts": [
    { "label": "<English label>", "amount": "<numeric string, exact>", "currency": "ILS" }
  ],
  "dates": [
    { "label": "<English label>", "date": "<YYYY-MM-DD if unambiguous, else as written>", "is_deadline": <true|false> }
  ],
  "action_items": [
    {
      "description_he": "<plain Hebrew, imperative, friend-explaining tone>",
      "description_en": "<plain English, imperative>",
      "deadline_date": "<YYYY-MM-DD or omit if no deadline>",
      "urgency": "high" | "medium" | "low"
    }
  ],
  "translation_he": "<the whole letter rewritten in plain conversational Hebrew. Keep all dates/amounts/IDs exact. Drop bureaucratic register. Explain jargon inline (e.g. 'מס שבח' becomes 'מס על הרווח ממכירת הדירה').>",
  "translation_en": "<English translation of the same plain rewrite>"
}

Rules:
- Use empty arrays ([]) for sections that don't apply. Do not omit keys.
- Dates: prefer YYYY-MM-DD when you can parse them. If only a Hebrew month name is given, keep the original wording.
- Amounts: preserve exact numbers. Currency defaults to "ILS" for Israeli letters.
- Urgency: "high" if there's a deadline within 14 days or threats of legal/financial action. "medium" for non-trivial action with a longer timeline. "low" for informational or no required action.
- Tone for tldr/translation: write like a friend explaining over coffee. No "Dear Sir/Madam". No formal bureaucratic phrasing. Lead with what the recipient needs to DO, then context.
- Never invent facts. If a field isn't in the letter, leave it out (empty array, or skip the optional key).`;
