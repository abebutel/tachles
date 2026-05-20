"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { pickSoonestDeadline, type SoonestDeadline } from "@/lib/dates";
import type { ActionItem, TranslateResponse, TranslationResult } from "@/lib/prompts/types";

type Status =
  | { kind: "idle" }
  | { kind: "ocr" }
  | { kind: "translate"; ocrText: string }
  | { kind: "done"; ocrText: string; result: TranslateResponse }
  | { kind: "error"; messageKey: string; concerns?: string };

const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

export default function UploadForm() {
  const t = useTranslations("Upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isBusy = status.kind === "ocr" || status.kind === "translate";

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (!SUPPORTED_TYPES.includes(f.type)) {
      setStatus({ kind: "error", messageKey: "errorUnsupportedType" });
      return;
    }
    if (f.size > MAX_BYTES) {
      setStatus({ kind: "error", messageKey: "errorTooLarge" });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStatus({ kind: "idle" });
  }, [previewUrl]);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setStatus({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [previewUrl]);

  const submit = useCallback(async () => {
    if (!file) return;
    setStatus({ kind: "ocr" });

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setStatus({ kind: "error", messageKey: "errorAuth" });
      return;
    }
    const authHeader = `Bearer ${session.access_token}`;

    // 1. OCR
    let ocrText: string;
    try {
      const ocrRes = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "content-type": file.type,
          authorization: authHeader,
        },
        body: file,
      });
      if (!ocrRes.ok) {
        if (ocrRes.status === 429) {
          setStatus({ kind: "error", messageKey: "errorRateLimited" });
          return;
        }
        if (ocrRes.status === 401) {
          setStatus({ kind: "error", messageKey: "errorAuth" });
          return;
        }
        setStatus({ kind: "error", messageKey: "errorGeneric" });
        return;
      }
      const json = (await ocrRes.json()) as { text: string };
      ocrText = json.text;
    } catch {
      setStatus({ kind: "error", messageKey: "errorGeneric" });
      return;
    }

    setStatus({ kind: "translate", ocrText });

    // 2. Translate
    try {
      const translateRes = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: authHeader,
        },
        body: JSON.stringify({ ocr_text: ocrText }),
      });
      if (!translateRes.ok) {
        if (translateRes.status === 429) {
          setStatus({ kind: "error", messageKey: "errorRateLimited" });
          return;
        }
        if (translateRes.status === 401) {
          setStatus({ kind: "error", messageKey: "errorAuth" });
          return;
        }
        setStatus({ kind: "error", messageKey: "errorGeneric" });
        return;
      }
      const result = (await translateRes.json()) as TranslateResponse;
      setStatus({ kind: "done", ocrText, result });
    } catch {
      setStatus({ kind: "error", messageKey: "errorGeneric" });
    }
  }, [file]);

  const progressMessage = useMemo(() => {
    if (status.kind === "ocr") return t("ocrInProgress");
    if (status.kind === "translate") return t("translateInProgress");
    return null;
  }, [status, t]);

  if (status.kind === "done") {
    return <ResultsView result={status.result} ocrText={status.ocrText} onReset={reset} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-gray-700">{t("intro")}</p>

      <div className="space-y-3">
        <label
          htmlFor="upload-input"
          className="block rounded-lg border-2 border-dashed border-gray-300 p-6 text-center cursor-pointer hover:border-gray-400 focus-within:border-gray-400"
        >
          {previewUrl ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                className="max-h-64 mx-auto rounded"
              />
              <span className="block text-sm text-gray-600">{t("replace")}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="block text-base font-medium">{t("takePhoto")}</span>
              <span className="block text-sm text-gray-600">{t("pickFile")}</span>
            </div>
          )}
        </label>
        <input
          ref={fileInputRef}
          id="upload-input"
          type="file"
          accept={SUPPORTED_TYPES.join(",")}
          capture="environment"
          onChange={onFileChange}
          className="sr-only"
          disabled={isBusy}
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!file || isBusy}
        className="w-full rounded-lg bg-black text-white py-3 px-6 font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {isBusy ? t("submitting") : t("submit")}
      </button>

      {progressMessage && (
        <div className="rounded-lg bg-blue-50 text-blue-900 p-4 text-center">
          <Spinner />
          <p className="mt-2">{progressMessage}</p>
        </div>
      )}

      {status.kind === "error" && (
        <div className="rounded-lg bg-red-50 text-red-900 p-4">
          {t(status.messageKey)}
        </div>
      )}

      <p className="text-xs text-gray-500 leading-relaxed">{t("privacyReminder")}</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="inline-block animate-spin h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LangPref = "he" | "en" | "both";

function ResultsView({
  result,
  ocrText,
  onReset,
}: {
  result: TranslateResponse;
  ocrText: string;
  onReset: () => void;
}) {
  const t = useTranslations("Upload");
  const locale = useLocale();
  const [showOcr, setShowOcr] = useState(false);
  const [lang, setLang] = useState<LangPref>(locale === "en" ? "en" : "he");
  const [copied, setCopied] = useState(false);
  const { classification, translation, quality_check } = result;

  const deadline = useMemo(
    () => pickSoonestDeadline(translation.dates),
    [translation.dates],
  );

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildPlainTextSummary(translation, lang));
      setCopied(true);
    } catch {
      // Clipboard API can fail in insecure contexts or when permission denied —
      // we just don't show the "copied" feedback.
    }
  }, [translation, lang]);

  useEffect(() => {
    if (!copied) return;
    const handle = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(handle);
  }, [copied]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">{t("resultsHeading")}</h2>
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-blue-700 hover:underline"
        >
          {t("startOver")}
        </button>
      </div>

      {/* Deadline banner (above everything else when present) */}
      {deadline && <DeadlineBanner deadline={deadline} />}

      {/* Quality-check banner */}
      {quality_check.passes ? (
        <div className="rounded-lg bg-green-50 text-green-900 p-3 text-sm">
          ✓ {t("resultsQualityCheckPassed")}
        </div>
      ) : (
        <div className="rounded-lg bg-yellow-50 text-yellow-900 p-3 text-sm">
          ⚠{" "}
          {t("resultsQualityCheckFailed", {
            concerns: quality_check.concerns.join("; ") || "—",
          })}
        </div>
      )}

      {/* Toolbar: language toggle + copy */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <LanguageToggle value={lang} onChange={setLang} />
        <button
          type="button"
          onClick={onCopy}
          className="text-sm rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
        >
          {copied ? `✓ ${t("copied")}` : t("copyAsText")}
        </button>
      </div>

      {/* TL;DR */}
      <Section title={t("resultsTldr")}>
        {(lang === "he" || lang === "both") && (
          <p className="font-medium">{translation.tldr_he}</p>
        )}
        {(lang === "en" || lang === "both") && (
          <p
            className={`text-gray-700 text-sm ${lang === "both" ? "mt-1" : ""}`}
          >
            {translation.tldr_en}
          </p>
        )}
      </Section>

      {/* Classification + confidence badge */}
      <Section title={t("resultsClassification")}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p>
            <strong>{translation.institution}</strong> — {translation.document_type}
          </p>
          <ConfidenceBadge confidence={classification.confidence} />
        </div>
      </Section>

      {/* Action items */}
      {translation.action_items.length > 0 && (
        <Section title={t("resultsActionItems")}>
          <ul className="space-y-2">
            {translation.action_items.map((a, i) => (
              <ActionItemView key={i} item={a} lang={lang} />
            ))}
          </ul>
        </Section>
      )}

      {/* Amounts */}
      {translation.amounts.length > 0 && (
        <Section title={t("resultsAmounts")}>
          <ul className="space-y-1 text-sm">
            {translation.amounts.map((a, i) => (
              <li key={i}>
                <span className="text-gray-600">{a.label}:</span>{" "}
                <span className="font-medium">
                  {a.amount} {a.currency ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Dates */}
      {translation.dates.length > 0 && (
        <Section title={t("resultsDates")}>
          <ul className="space-y-1 text-sm">
            {translation.dates.map((d, i) => (
              <li key={i}>
                <span className="text-gray-600">{d.label}:</span>{" "}
                <span className="font-medium">{d.date}</span>
                {d.is_deadline && (
                  <span className="ms-2 inline-block px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">
                    deadline
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Reference numbers */}
      {translation.reference_numbers.length > 0 && (
        <Section title={t("resultsReferences")}>
          <ul className="space-y-1 text-sm">
            {translation.reference_numbers.map((r, i) => (
              <li key={i}>
                <span className="text-gray-600">{r.label}:</span>{" "}
                <span className="font-mono">{r.value}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Full translations — visible based on lang toggle */}
      {(lang === "he" || lang === "both") && (
        <Section title={t("resultsTranslationHe")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="rtl">
            {translation.translation_he}
          </p>
        </Section>
      )}
      {(lang === "en" || lang === "both") && (
        <Section title={t("resultsTranslationEn")}>
          <p
            className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700"
            dir="ltr"
          >
            {translation.translation_en}
          </p>
        </Section>
      )}

      {/* OCR text (collapsed) */}
      <div>
        <button
          type="button"
          onClick={() => setShowOcr((s) => !s)}
          className="text-sm text-blue-700 hover:underline"
        >
          {showOcr ? t("resultsHideOcr") : t("resultsShowOcr")}
        </button>
        {showOcr && (
          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs whitespace-pre-wrap font-mono">
            {ocrText}
          </pre>
        )}
      </div>
    </div>
  );
}

function DeadlineBanner({ deadline }: { deadline: SoonestDeadline }) {
  const t = useTranslations("Upload");
  const daysAway = deadline.daysAway ?? 0;

  let message: string;
  if (deadline.urgency === "overdue") {
    message = t("deadlineOverdue", { date: deadline.date });
  } else if (deadline.urgency === "today") {
    message = t("deadlineToday");
  } else if (daysAway === 1) {
    message = t("deadlineSoonOne", { date: deadline.date });
  } else if (deadline.urgency === "soon") {
    message = t("deadlineSoonMany", { days: daysAway, date: deadline.date });
  } else {
    message = t("deadlineLater", { label: deadline.label, date: deadline.date });
  }

  const tone =
    deadline.urgency === "overdue" || deadline.urgency === "today"
      ? "bg-red-50 text-red-900 border-red-200"
      : deadline.urgency === "soon"
        ? "bg-yellow-50 text-yellow-900 border-yellow-200"
        : "bg-blue-50 text-blue-900 border-blue-200";

  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <p className="text-sm font-medium">{message}</p>
      {deadline.urgency !== "later" && (
        <p className="text-xs mt-0.5 opacity-80">{deadline.label}</p>
      )}
    </div>
  );
}

function LanguageToggle({
  value,
  onChange,
}: {
  value: LangPref;
  onChange: (v: LangPref) => void;
}) {
  const t = useTranslations("Upload");
  const options: { value: LangPref; label: string }[] = [
    { value: "he", label: t("showHebrew") },
    { value: "en", label: t("showEnglish") },
    { value: "both", label: t("showBoth") },
  ];

  return (
    <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-white" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`text-sm px-3 py-1 rounded-md transition-colors ${
            value === o.value ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const t = useTranslations("Upload");
  let tier: "high" | "medium" | "low";
  let color: string;
  if (confidence >= 0.8) {
    tier = "high";
    color = "bg-green-100 text-green-800";
  } else if (confidence >= 0.5) {
    tier = "medium";
    color = "bg-yellow-100 text-yellow-800";
  } else {
    tier = "low";
    color = "bg-red-100 text-red-800";
  }
  const label =
    tier === "high"
      ? t("confidenceHigh")
      : tier === "medium"
        ? t("confidenceMedium")
        : t("confidenceLow");
  return (
    <span className={`text-xs px-2 py-1 rounded ${color}`}>
      {label} · {(confidence * 100).toFixed(0)}%
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

function ActionItemView({ item, lang }: { item: ActionItem; lang: LangPref }) {
  const urgencyColor =
    item.urgency === "high"
      ? "bg-red-100 text-red-800"
      : item.urgency === "medium"
        ? "bg-yellow-100 text-yellow-800"
        : "bg-gray-100 text-gray-800";

  return (
    <li className="rounded border border-gray-200 p-3">
      <div className="flex items-start gap-2">
        <span className={`text-xs px-2 py-0.5 rounded ${urgencyColor}`}>
          {item.urgency}
        </span>
        <div className="flex-1">
          {(lang === "he" || lang === "both") && (
            <p className="font-medium" dir="rtl">{item.description_he}</p>
          )}
          {(lang === "en" || lang === "both") && (
            <p
              className={`text-sm text-gray-600 ${lang === "both" ? "mt-0.5" : ""}`}
              dir="ltr"
            >
              {item.description_en}
            </p>
          )}
          {item.deadline_date && (
            <p className="text-xs text-gray-500 mt-1">{item.deadline_date}</p>
          )}
        </div>
      </div>
    </li>
  );
}

// Build a plain-text summary the user can paste into WhatsApp / email / etc.
// Picks the side matching the user's current language preference; "both"
// includes Hebrew first then English.
export function buildPlainTextSummary(t: TranslationResult, lang: LangPref): string {
  const lines: string[] = [];

  if (lang === "he" || lang === "both") lines.push(t.tldr_he);
  if (lang === "en" || lang === "both") lines.push(t.tldr_en);
  lines.push("");
  lines.push(`${t.institution} — ${t.document_type}`);

  if (t.action_items.length > 0) {
    lines.push("");
    lines.push("Action items:");
    for (const a of t.action_items) {
      const desc = lang === "en" ? a.description_en : a.description_he;
      const deadline = a.deadline_date ? ` (${a.deadline_date})` : "";
      lines.push(`  • [${a.urgency}] ${desc}${deadline}`);
    }
  }

  if (t.amounts.length > 0) {
    lines.push("");
    lines.push("Amounts:");
    for (const a of t.amounts) {
      lines.push(`  • ${a.label}: ${a.amount} ${a.currency ?? ""}`);
    }
  }

  if (t.dates.length > 0) {
    lines.push("");
    lines.push("Dates:");
    for (const d of t.dates) {
      const marker = d.is_deadline ? " (deadline)" : "";
      lines.push(`  • ${d.label}: ${d.date}${marker}`);
    }
  }

  if (t.reference_numbers.length > 0) {
    lines.push("");
    lines.push("Reference:");
    for (const r of t.reference_numbers) {
      lines.push(`  • ${r.label}: ${r.value}`);
    }
  }

  return lines.join("\n");
}
