import { describe, expect, it } from "vitest";
import { buildPrompt_QualityCheck } from "@/lib/prompts/quality-check";
import type { TranslationResult } from "@/lib/prompts/types";

// The prompt's job is to detect divergence between OCR text and the
// structured translation. We can't run the model in unit tests, but we
// CAN assert:
//   1. The prompt includes the OCR text and the translation JSON
//   2. The prompt instructs the model to check the four critical
//      faithfulness dimensions (amounts, dates, deadlines, hallucinations)
//   3. The prompt enforces JSON-only output
//   4. The output shape definition is correct
//
// The "3 deliberately-mangled cases" requirement from the build plan is
// implemented as integration assertions on what the prompt INSTRUCTS the
// model to flag — we verify the prompt text covers each case category.
// Day 6's manual tone-review work covers the actual model-output validation.

const ORIGINAL_OCR = `ביטוח לאומי - מענק ילדים
תיק: 12345-67-12
סכום לתשלום: 1,840 ש"ח
תאריך תשלום: 15/06/2026
יש להגיש ערעור עד 30/06/2026`;

const FAITHFUL_TRANSLATION: TranslationResult = {
  tldr_he: "ביטוח לאומי מעביר לך 1,840 ₪ ב-15 ביוני 2026. אם אתה לא מסכים, צריך לערער עד ה-30 ביוני.",
  tldr_en: "Bituach Leumi is sending you 1,840 ILS on June 15, 2026. Appeal deadline is June 30.",
  institution: "Bituach Leumi",
  document_type: "Child Benefit Payment Notice",
  reference_numbers: [{ label: "Claim ID", value: "12345-67-12" }],
  amounts: [{ label: "Payment amount", amount: "1840", currency: "ILS" }],
  dates: [
    { label: "Payment date", date: "2026-06-15", is_deadline: false },
    { label: "Appeal deadline", date: "2026-06-30", is_deadline: true },
  ],
  action_items: [
    {
      description_he: "אם אתה רוצה לערער על ההחלטה, צריך להגיש את הערעור עד ה-30 ביוני 2026.",
      description_en: "Submit an appeal by June 30, 2026 if you disagree.",
      deadline_date: "2026-06-30",
      urgency: "medium",
    },
  ],
  translation_he: "ביטוח לאומי מאשרים שמגיע לך מענק ילדים של 1,840 ש\"ח לחודש זה...",
  translation_en: "Bituach Leumi confirms you're entitled to child benefit of 1,840 ILS this month...",
};

describe("buildPrompt_QualityCheck", () => {
  it("includes the original OCR text and the structured translation", () => {
    const req = buildPrompt_QualityCheck(ORIGINAL_OCR, FAITHFUL_TRANSLATION);
    const userMessage = req.messages[0].content as string;
    expect(userMessage).toContain(ORIGINAL_OCR);
    expect(userMessage).toContain('"institution": "Bituach Leumi"');
    expect(userMessage).toContain('"amount": "1840"');
  });

  it("instructs the model to check amount integrity (mangled case 1)", () => {
    const req = buildPrompt_QualityCheck(ORIGINAL_OCR, FAITHFUL_TRANSLATION);
    expect(req.system).toMatch(/amount integrity/i);
    expect(req.system).toMatch(/amount in the translation.+findable in the OCR/i);
  });

  it("instructs the model to check deadline preservation (mangled case 2)", () => {
    const req = buildPrompt_QualityCheck(ORIGINAL_OCR, FAITHFUL_TRANSLATION);
    expect(req.system).toMatch(/deadline preservation/i);
    expect(req.system).toMatch(/MUST appear in the translation's dates/i);
  });

  it("instructs the model to check for hallucinations (mangled case 3)", () => {
    const req = buildPrompt_QualityCheck(ORIGINAL_OCR, FAITHFUL_TRANSLATION);
    expect(req.system).toMatch(/no hallucinations/i);
    expect(req.system).toMatch(/must be supported by the OCR/i);
  });

  it("allows MASKED account numbers as NOT a faithfulness violation", () => {
    // Bank specialist masks account numbers (last 4 + bullets). QC must NOT
    // flag the mask as a divergence from the original.
    const req = buildPrompt_QualityCheck(ORIGINAL_OCR, FAITHFUL_TRANSLATION);
    expect(req.system).toMatch(/MASKED.+NOT a faithfulness violation/i);
  });

  it("enforces JSON-only output per the no-log-proxy spec", () => {
    const req = buildPrompt_QualityCheck(ORIGINAL_OCR, FAITHFUL_TRANSLATION);
    expect(req.system).toMatch(/OUTPUT:\s*Respond ONLY with valid JSON/);
    expect(req.system).toMatch(/"passes":\s*<true\|false>/);
    expect(req.system).toMatch(/"concerns":\s*\[/);
    expect(req.system).toMatch(/"confidence":/);
  });

  it("uses temperature 0 for deterministic verdicts", () => {
    const req = buildPrompt_QualityCheck(ORIGINAL_OCR, FAITHFUL_TRANSLATION);
    expect(req.temperature).toBe(0);
  });

  it("uses a moderate max_tokens budget (QC verdicts are small)", () => {
    const req = buildPrompt_QualityCheck(ORIGINAL_OCR, FAITHFUL_TRANSLATION);
    expect(req.max_tokens).toBeGreaterThanOrEqual(512);
    expect(req.max_tokens).toBeLessThanOrEqual(2048);
  });
});
