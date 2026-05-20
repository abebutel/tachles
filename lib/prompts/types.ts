// JSON shapes returned by the LLM prompts. These are the contracts that
// drive both the prompt wording ("Return JSON shaped exactly like ...") and
// the Day 8 Results UI rendering.
//
// All prompts MUST return valid JSON conforming to one of these interfaces.
// The Anthropic client retries once on parse failure (see lib/proxy/
// anthropic-client.ts) before surfacing UPSTREAM_INVALID_RESPONSE.

export type InstitutionCategory =
  | "bituach_leumi"
  | "bank"
  | "municipality"
  | "lawyer"
  | "unknown";

export interface ClassificationResult {
  institution_category: InstitutionCategory;
  confidence: number; // 0-1
  detected_signals: string[]; // brief notes the LLM used (e.g. "logo: BL", "header text")
}

export interface ReferenceNumber {
  label: string; // "Claim ID" / "Account number" / "File reference"
  value: string;
}

export interface MonetaryAmount {
  label: string; // "Payment amount" / "Outstanding balance"
  amount: string; // numeric as string to preserve formatting
  currency?: string; // "ILS" / "USD" — omit if unclear
}

export interface DocumentDate {
  label: string; // "Letter date" / "Hearing date" / "Payment due"
  date: string; // ISO YYYY-MM-DD when unambiguous; otherwise as written
  is_deadline: boolean;
}

export type ActionUrgency = "high" | "medium" | "low";

export interface ActionItem {
  description_he: string; // plain-Hebrew action ("שלם את החוב")
  description_en: string; // plain-English action ("Pay the outstanding balance")
  deadline_date?: string; // ISO date if there's one
  urgency: ActionUrgency;
}

export interface TranslationResult {
  tldr_he: string; // 1-2 sentences, plain Hebrew
  tldr_en: string; // 1-2 sentences, plain English
  institution: string; // human-readable institution name
  document_type: string; // "Child Benefit Payment Notice" / "Account Statement"
  reference_numbers: ReferenceNumber[];
  amounts: MonetaryAmount[];
  dates: DocumentDate[];
  action_items: ActionItem[];
  translation_he: string; // simplified plain-Hebrew rewrite of the whole letter
  translation_en: string; // English translation
}

// Quality-check verdict from the third pipeline call. `passes: false` is
// surfaced to the user as a "we're not confident in this translation"
// warning on the result card.
export interface QualityCheckResult {
  passes: boolean;
  concerns: string[];
  confidence: number;
}

// What /api/translate returns to the browser.
export interface TranslateResponse {
  classification: ClassificationResult;
  translation: TranslationResult;
  quality_check: QualityCheckResult;
}
