"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {acceptConsent} from "./actions";

export default function OnboardingForm() {
  const t = useTranslations("Onboarding");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted || submitting) return;
    setSubmitting(true);
    await acceptConsent();
    // Server action redirects to /dashboard
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
          required
        />
        <span className="text-sm">{t("acceptCheckbox")}</span>
      </label>
      <p className="text-sm">
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          {t("privacyLink")}
        </a>
      </p>
      <button
        type="submit"
        disabled={!accepted || submitting}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
      >
        {t("submit")}
      </button>
    </form>
  );
}
