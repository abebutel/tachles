import type { MessagesRequest } from "@/lib/proxy/anthropic-client";
import type { ClassificationResult, InstitutionCategory } from "./types";
import { buildPrompt_BituachLeumi } from "./bituach-leumi";
import { buildPrompt_BankLetter } from "./bank";
import { buildPrompt_MunicipalityLetter } from "./municipality";
import { buildPrompt_LawyerLetter } from "./lawyer";
import { buildPrompt_TranslateDocument } from "./generic";

// Pick the right specialist prompt based on the classifier's verdict.
//
// Confidence threshold: if the classifier picked a category but with low
// confidence, we fall back to the generic translator (which doesn't assume
// document type) rather than feeding the letter to the wrong specialist
// and getting confidently-wrong output.

const SPECIALIST_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.SPECIALIST_CONFIDENCE_THRESHOLD ?? "0.6",
);

export type SpecialistRoute = InstitutionCategory | "generic";

export interface RoutedPrompt {
  route: SpecialistRoute;
  prompt: MessagesRequest;
}

export function routeToSpecialistPrompt(
  ocrText: string,
  classification: ClassificationResult,
): RoutedPrompt {
  const cat = classification.institution_category;
  const useGeneric =
    cat === "unknown" || classification.confidence < SPECIALIST_CONFIDENCE_THRESHOLD;

  if (useGeneric) {
    return { route: "generic", prompt: buildPrompt_TranslateDocument(ocrText) };
  }

  switch (cat) {
    case "bituach_leumi":
      return { route: cat, prompt: buildPrompt_BituachLeumi(ocrText) };
    case "bank":
      return { route: cat, prompt: buildPrompt_BankLetter(ocrText) };
    case "municipality":
      return { route: cat, prompt: buildPrompt_MunicipalityLetter(ocrText) };
    case "lawyer":
      return { route: cat, prompt: buildPrompt_LawyerLetter(ocrText) };
  }
}
