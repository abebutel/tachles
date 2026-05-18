import { describe, expect, it, beforeEach, vi } from "vitest";
import { routeToSpecialistPrompt } from "@/lib/prompts/route";

describe("routeToSpecialistPrompt", () => {
  beforeEach(() => {
    process.env.SPECIALIST_CONFIDENCE_THRESHOLD = "0.6";
    vi.resetModules();
  });

  it("picks bituach_leumi specialist when classifier is confident", () => {
    const r = routeToSpecialistPrompt("...", {
      institution_category: "bituach_leumi",
      confidence: 0.9,
      detected_signals: [],
    });
    expect(r.route).toBe("bituach_leumi");
    // The specialist prompt's system block should mention the institution.
    expect(r.prompt.system).toContain("ביטוח לאומי");
  });

  it("picks bank specialist for bank category", () => {
    const r = routeToSpecialistPrompt("...", {
      institution_category: "bank",
      confidence: 0.85,
      detected_signals: [],
    });
    expect(r.route).toBe("bank");
    expect(r.prompt.system).toContain("bank");
  });

  it("picks municipality specialist", () => {
    const r = routeToSpecialistPrompt("...", {
      institution_category: "municipality",
      confidence: 0.8,
      detected_signals: [],
    });
    expect(r.route).toBe("municipality");
    expect(r.prompt.system).toContain("ארנונה");
  });

  it("picks lawyer specialist and mandates the legal-advice disclaimer", () => {
    const r = routeToSpecialistPrompt("...", {
      institution_category: "lawyer",
      confidence: 0.9,
      detected_signals: [],
    });
    expect(r.route).toBe("lawyer");
    // The prompt must instruct adding the consult-a-lawyer disclaimer.
    expect(r.prompt.system).toMatch(/lawyer|legal advice/i);
  });

  it("falls back to generic when category is unknown", () => {
    const r = routeToSpecialistPrompt("...", {
      institution_category: "unknown",
      confidence: 0.95,
      detected_signals: [],
    });
    expect(r.route).toBe("generic");
  });

  it("falls back to generic when confidence is below threshold (default 0.6)", () => {
    const r = routeToSpecialistPrompt("...", {
      institution_category: "bituach_leumi",
      confidence: 0.4, // below 0.6
      detected_signals: [],
    });
    expect(r.route).toBe("generic");
  });

  it("uses the specialist when confidence equals the threshold", () => {
    const r = routeToSpecialistPrompt("...", {
      institution_category: "bank",
      confidence: 0.6,
      detected_signals: [],
    });
    expect(r.route).toBe("bank");
  });

  it("all prompts request JSON-only output per the spec", () => {
    const categories = ["bituach_leumi", "bank", "municipality", "lawyer", "unknown"] as const;
    for (const cat of categories) {
      const r = routeToSpecialistPrompt("test text", {
        institution_category: cat,
        confidence: 0.9,
        detected_signals: [],
      });
      // Every prompt's system block must end with the OUTPUT directive
      // per docs/no-log-proxy-spec.md (and CLAUDE.md).
      expect(r.prompt.system).toMatch(/OUTPUT:\s*Respond ONLY with valid JSON/);
    }
  });
});
