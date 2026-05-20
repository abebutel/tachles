import { describe, expect, it } from "vitest";
import { buildPlainTextSummary } from "@/app/[locale]/dashboard/upload-form";
import type { TranslationResult } from "@/lib/prompts/types";

const SAMPLE: TranslationResult = {
  tldr_he: "ביטוח לאומי שולח לך 1,840 ₪",
  tldr_en: "Bituach Leumi is sending you 1,840 ILS",
  institution: "Bituach Leumi",
  document_type: "Child Benefit Payment Notice",
  reference_numbers: [{ label: "Claim ID", value: "12345-67-12" }],
  amounts: [{ label: "Payment", amount: "1840", currency: "ILS" }],
  dates: [
    { label: "Payment date", date: "2026-06-15", is_deadline: false },
    { label: "Appeal deadline", date: "2026-06-30", is_deadline: true },
  ],
  action_items: [
    {
      description_he: "שלם את הסכום",
      description_en: "Pay the amount",
      deadline_date: "2026-06-15",
      urgency: "medium",
    },
  ],
  translation_he: "...",
  translation_en: "...",
};

describe("buildPlainTextSummary", () => {
  it("renders Hebrew tldr first when lang=he", () => {
    const out = buildPlainTextSummary(SAMPLE, "he");
    expect(out.startsWith(SAMPLE.tldr_he)).toBe(true);
    expect(out).not.toContain(SAMPLE.tldr_en);
  });

  it("renders English tldr only when lang=en", () => {
    const out = buildPlainTextSummary(SAMPLE, "en");
    expect(out).toContain(SAMPLE.tldr_en);
    expect(out).not.toContain(SAMPLE.tldr_he);
  });

  it("renders both tldrs when lang=both", () => {
    const out = buildPlainTextSummary(SAMPLE, "both");
    expect(out).toContain(SAMPLE.tldr_he);
    expect(out).toContain(SAMPLE.tldr_en);
  });

  it("includes institution + document type", () => {
    const out = buildPlainTextSummary(SAMPLE, "en");
    expect(out).toContain("Bituach Leumi — Child Benefit Payment Notice");
  });

  it("includes action items with urgency tag and deadline", () => {
    const out = buildPlainTextSummary(SAMPLE, "en");
    expect(out).toContain("[medium] Pay the amount (2026-06-15)");
  });

  it("uses Hebrew action description when lang=he", () => {
    const out = buildPlainTextSummary(SAMPLE, "he");
    expect(out).toContain("שלם את הסכום");
    expect(out).not.toContain("Pay the amount");
  });

  it("marks deadline dates explicitly", () => {
    const out = buildPlainTextSummary(SAMPLE, "en");
    expect(out).toContain("Appeal deadline: 2026-06-30 (deadline)");
    expect(out).toContain("Payment date: 2026-06-15");
    // Non-deadline dates don't get the marker.
    expect(out).not.toContain("Payment date: 2026-06-15 (deadline)");
  });

  it("includes amounts with currency", () => {
    const out = buildPlainTextSummary(SAMPLE, "en");
    expect(out).toContain("Payment: 1840 ILS");
  });

  it("includes reference numbers", () => {
    const out = buildPlainTextSummary(SAMPLE, "en");
    expect(out).toContain("Claim ID: 12345-67-12");
  });

  it("omits empty sections cleanly", () => {
    const minimal: TranslationResult = {
      tldr_he: "סיכום",
      tldr_en: "Summary",
      institution: "X",
      document_type: "Y",
      reference_numbers: [],
      amounts: [],
      dates: [],
      action_items: [],
      translation_he: "",
      translation_en: "",
    };
    const out = buildPlainTextSummary(minimal, "en");
    expect(out).toContain("X — Y");
    expect(out).not.toContain("Action items:");
    expect(out).not.toContain("Amounts:");
    expect(out).not.toContain("Dates:");
    expect(out).not.toContain("Reference:");
  });
});
