"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type {
  TranslateResponse,
  ActionItem,
  ReferenceNumber,
  MonetaryAmount,
  DocumentDate,
} from "@/lib/prompts/types";

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
  const [showOcr, setShowOcr] = useState(false);
  const { classification, translation, quality_check } = result;

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

      {/* TL;DR */}
      <Section title={t("resultsTldr")}>
        <p className="font-medium">{translation.tldr_he}</p>
        <p className="text-gray-700 text-sm mt-1">{translation.tldr_en}</p>
      </Section>

      {/* Classification */}
      <Section title={t("resultsClassification")}>
        <p>
          <strong>{translation.institution}</strong> — {translation.document_type}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {t("resultsConfidence")}: {(classification.confidence * 100).toFixed(0)}%
        </p>
      </Section>

      {/* Action items */}
      {translation.action_items.length > 0 && (
        <Section title={t("resultsActionItems")}>
          <ul className="space-y-2">
            {translation.action_items.map((a, i) => (
              <ActionItemView key={i} item={a} />
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
                  <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">
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

      {/* Full translations */}
      <Section title={t("resultsTranslationHe")}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {translation.translation_he}
        </p>
      </Section>
      <Section title={t("resultsTranslationEn")}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
          {translation.translation_en}
        </p>
      </Section>

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

function ActionItemView({ item }: { item: ActionItem }) {
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
          <p className="font-medium">{item.description_he}</p>
          <p className="text-sm text-gray-600 mt-0.5">{item.description_en}</p>
          {item.deadline_date && (
            <p className="text-xs text-gray-500 mt-1">
              {item.deadline_date}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

// Suppress unused-import warnings for the typed shape references in this file's
// type-only contexts. (Keeps the imports semantically alive for refactors.)
export type _DayKeepAlive = ReferenceNumber | MonetaryAmount | DocumentDate;
