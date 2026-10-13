"use client";

import { useRef, useState, useTransition } from "react";
import { submitProblemReportAction } from "@/app/actions/problemReports";
import type { ProblemReportCategory } from "@prisma/client";
import type { Language } from "@/lib/session";
import { t } from "@/lib/i18n";

const CATEGORY_LABELS: Record<ProblemReportCategory, { en: string; es: string }> = {
  BUG_OR_ERROR: { en: "Something's broken", es: "Algo está roto" },
  ACCOUNT_OR_ACCESS: { en: "Account or access issue", es: "Problema de cuenta o acceso" },
  DATA_LOOKS_WRONG: { en: "Data looks wrong", es: "Los datos se ven incorrectos" },
  OTHER: { en: "Other", es: "Otro" },
};

export default function ReportProblemForm({ language }: { language: Language }) {
  const labels = t(language);
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const category = formData.get("category") as ProblemReportCategory;
    const description = String(formData.get("description") ?? "");

    startTransition(async () => {
      try {
        await submitProblemReportAction(category, description);
        formRef.current?.reset();
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't submit — please try again.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">{labels.reportProblemCategory}</label>
        <select name="category" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {language === "ES" ? label.es : label.en}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">{labels.reportProblemDescription}</label>
        <textarea
          name="description"
          required
          rows={5}
          onChange={() => setSubmitted(false)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? labels.reportProblemSubmitting : labels.reportProblemSubmit}
        </button>
        {submitted && !pending && (
          <span className="text-sm font-medium text-green-700">{labels.reportProblemConfirmation}</span>
        )}
      </div>
    </form>
  );
}
