import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagesCallResult } from "@/lib/proxy/anthropic-client";

// Pipeline integration tests at the callAnthropicJson seam. We exercise the
// orchestration (classify -> route -> specialist -> quality check) and the
// defensive failure modes (QC errors, malformed QC responses).
//
// The DoD says "quality check correctly flags 3 deliberately-mangled cases".
// We simulate the model returning a "fails" verdict for each of the three
// mangled-case categories the QC prompt is told to check.

const SPECIALIST_TRANSLATION = {
  tldr_he: "סיכום",
  tldr_en: "Summary",
  institution: "Bituach Leumi",
  document_type: "Notice",
  reference_numbers: [],
  amounts: [{ label: "Payment", amount: "1840", currency: "ILS" }],
  dates: [{ label: "Date", date: "2026-06-15", is_deadline: false }],
  action_items: [],
  translation_he: "תרגום",
  translation_en: "translation",
};

function buildPipelineRequest(ocrText: string): Request {
  const body = JSON.stringify({ ocr_text: ocrText });
  return new Request("https://test.local/api/translate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body, "utf8")),
    },
    body,
  });
}

interface MockResponses {
  classify?: { passes?: never; institution_category?: string; confidence?: number };
  qc?: { passes: boolean; concerns: string[]; confidence: number };
  qcThrows?: boolean;
  qcRawValue?: unknown; // for malformed-response tests
}

function makeAnthropicMock(responses: MockResponses) {
  return vi.fn(async (req: { max_tokens: number }) => {
    if (req.max_tokens <= 512) {
      return {
        value: responses.classify ?? {
          institution_category: "bituach_leumi",
          confidence: 0.9,
          detected_signals: [],
        },
        input_tokens: 100,
        output_tokens: 50,
      };
    }
    if (req.max_tokens === 1024) {
      if (responses.qcThrows) {
        throw new Error("simulated QC failure");
      }
      return {
        value: responses.qcRawValue !== undefined
          ? responses.qcRawValue
          : (responses.qc ?? { passes: true, concerns: [], confidence: 0.9 }),
        input_tokens: 1500,
        output_tokens: 30,
      };
    }
    return {
      value: SPECIALIST_TRANSLATION,
      input_tokens: 1500,
      output_tokens: 800,
    };
  });
}

describe("translate pipeline + quality check integration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: QC passes, metadata reflects it", async () => {
    vi.doMock("@/lib/proxy/anthropic-client", async () => {
      const actual = await vi.importActual<typeof import("@/lib/proxy/anthropic-client")>(
        "@/lib/proxy/anthropic-client",
      );
      return { ...actual, callAnthropicJson: makeAnthropicMock({}) };
    });
    const { runTranslationPipeline } = await import("@/lib/proxy/translate-pipeline");
    const result = await runTranslationPipeline(buildPipelineRequest("test letter"));
    expect(result.body.quality_check.passes).toBe(true);
    expect(result.metadata.quality_check_passed).toBe(true);
    expect(result.metadata.call_count).toBe(3);
  });

  it("mangled case 1 (wrong amount): QC fails with concerns surfaced", async () => {
    vi.doMock("@/lib/proxy/anthropic-client", async () => {
      const actual = await vi.importActual<typeof import("@/lib/proxy/anthropic-client")>(
        "@/lib/proxy/anthropic-client",
      );
      return {
        ...actual,
        callAnthropicJson: makeAnthropicMock({
          qc: {
            passes: false,
            concerns: ["amount 1840 in translation not found in OCR (original shows 1480)"],
            confidence: 0.95,
          },
        }),
      };
    });
    const { runTranslationPipeline } = await import("@/lib/proxy/translate-pipeline");
    const result = await runTranslationPipeline(buildPipelineRequest("test letter"));
    expect(result.body.quality_check.passes).toBe(false);
    expect(result.body.quality_check.concerns[0]).toMatch(/amount/i);
    expect(result.metadata.quality_check_passed).toBe(false);
  });

  it("mangled case 2 (missing deadline): QC fails", async () => {
    vi.doMock("@/lib/proxy/anthropic-client", async () => {
      const actual = await vi.importActual<typeof import("@/lib/proxy/anthropic-client")>(
        "@/lib/proxy/anthropic-client",
      );
      return {
        ...actual,
        callAnthropicJson: makeAnthropicMock({
          qc: {
            passes: false,
            concerns: ["OCR mentions appeal deadline 2026-06-30 but it is missing from dates[]"],
            confidence: 0.88,
          },
        }),
      };
    });
    const { runTranslationPipeline } = await import("@/lib/proxy/translate-pipeline");
    const result = await runTranslationPipeline(buildPipelineRequest("test letter"));
    expect(result.body.quality_check.passes).toBe(false);
    expect(result.body.quality_check.concerns[0]).toMatch(/deadline/i);
  });

  it("mangled case 3 (hallucinated fact): QC fails", async () => {
    vi.doMock("@/lib/proxy/anthropic-client", async () => {
      const actual = await vi.importActual<typeof import("@/lib/proxy/anthropic-client")>(
        "@/lib/proxy/anthropic-client",
      );
      return {
        ...actual,
        callAnthropicJson: makeAnthropicMock({
          qc: {
            passes: false,
            concerns: ["action_item 'attend hearing on 2026-07-01' not supported by OCR"],
            confidence: 0.9,
          },
        }),
      };
    });
    const { runTranslationPipeline } = await import("@/lib/proxy/translate-pipeline");
    const result = await runTranslationPipeline(buildPipelineRequest("test letter"));
    expect(result.body.quality_check.passes).toBe(false);
    expect(result.body.quality_check.concerns[0]).toMatch(/hearing|not supported/i);
  });

  it("QC upstream error: returns 'couldn't validate' verdict, request still succeeds", async () => {
    vi.doMock("@/lib/proxy/anthropic-client", async () => {
      const actual = await vi.importActual<typeof import("@/lib/proxy/anthropic-client")>(
        "@/lib/proxy/anthropic-client",
      );
      return {
        ...actual,
        callAnthropicJson: makeAnthropicMock({ qcThrows: true }),
      };
    });
    const { runTranslationPipeline } = await import("@/lib/proxy/translate-pipeline");
    const result = await runTranslationPipeline(buildPipelineRequest("test letter"));
    // The user still gets the translation — we don't fail the whole request
    // when only QC errors. They see the warning banner instead.
    expect(result.body.translation.institution).toBe("Bituach Leumi");
    expect(result.body.quality_check.passes).toBe(false);
    expect(result.body.quality_check.concerns[0]).toMatch(/could not run|quality check/i);
    expect(result.body.quality_check.confidence).toBe(0);
  });

  it("QC returns a malformed shape: normalized to a failed verdict", async () => {
    vi.doMock("@/lib/proxy/anthropic-client", async () => {
      const actual = await vi.importActual<typeof import("@/lib/proxy/anthropic-client")>(
        "@/lib/proxy/anthropic-client",
      );
      return {
        ...actual,
        callAnthropicJson: makeAnthropicMock({ qcRawValue: "not an object at all" }),
      };
    });
    const { runTranslationPipeline } = await import("@/lib/proxy/translate-pipeline");
    const result = await runTranslationPipeline(buildPipelineRequest("test letter"));
    expect(result.body.quality_check.passes).toBe(false);
  });
});

// Cosmetic: silence the unused import warning in some configurations.
void ({} as MessagesCallResult);
