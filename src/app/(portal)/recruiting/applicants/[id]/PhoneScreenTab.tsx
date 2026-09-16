"use client";

import { useTransition } from "react";
import { savePhoneScreenAction } from "../actions";
import { PHONE_SCREEN_OUTCOME_LABELS } from "@/lib/recruiting";

interface Question {
  id: string;
  textEn: string;
  textEs: string | null;
}

interface ChecklistItem {
  label: string;
  checked: boolean;
}

export default function PhoneScreenTab({
  applicantId,
  questions,
  answers,
  criteriaLabels,
  criteriaChecklist,
  languageNote,
  outcome,
  redFlagsNotes,
  completedAt,
  completedByName,
  canEdit,
}: {
  applicantId: string;
  questions: Question[];
  answers: Record<string, string | null>;
  criteriaLabels: string[];
  criteriaChecklist: ChecklistItem[] | null;
  languageNote: string | null;
  outcome: string | null;
  redFlagsNotes: string | null;
  completedAt: string | null;
  completedByName: string | null;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const questionIds = questions.map((q) => q.id);

  const checkedByLabel = new Map((criteriaChecklist ?? []).map((c) => [c.label, c.checked]));

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await savePhoneScreenAction(applicantId, questionIds, criteriaLabels, formData);
        })
      }
      className="space-y-6"
    >
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-medium text-neutral-900">Screening Criteria — Pass/Fail</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Hard requirements. Check off what the candidate confirmed during the call.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {criteriaLabels.map((label, i) => (
            <label key={label} className="flex items-start gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                name={`criteria_${i}`}
                defaultChecked={checkedByLabel.get(label) ?? false}
                disabled={!canEdit}
                className="mt-0.5 h-4 w-4"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Language spoken (English, Spanish, or both — note which)
          </label>
          <input
            name="languageNote"
            defaultValue={languageNote ?? ""}
            disabled={!canEdit}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Phone Screen Questions</h2>
        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={q.id}>
              <label className="mb-1 block text-sm font-medium text-neutral-800">
                {i + 1}. {q.textEn}
              </label>
              {q.textEs && <p className="mb-1 text-xs italic text-neutral-500">{q.textEs}</p>}
              <textarea
                name={`answer_${q.id}`}
                rows={2}
                placeholder="What did the candidate say?"
                defaultValue={answers[q.id] ?? ""}
                disabled={!canEdit}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
          {questions.length === 0 && (
            <p className="text-sm text-neutral-400">
              No phone-screen questions on this posting yet — add some from the job posting page.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Outcome</h2>
        <div className="space-y-2">
          {Object.entries(PHONE_SCREEN_OUTCOME_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="radio"
                name="outcome"
                value={value}
                defaultChecked={outcome === value}
                disabled={!canEdit}
                className="h-4 w-4"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-neutral-700">Notes / Red Flags</label>
          <textarea
            name="redFlagsNotes"
            rows={3}
            defaultValue={redFlagsNotes ?? ""}
            disabled={!canEdit}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        {completedAt && (
          <p className="mt-2 text-xs text-neutral-400">
            Last saved by {completedByName ?? "Unknown"} on {new Date(completedAt).toLocaleString()}
          </p>
        )}
      </div>

      {canEdit && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save Phone Screen"}
        </button>
      )}
    </form>
  );
}
