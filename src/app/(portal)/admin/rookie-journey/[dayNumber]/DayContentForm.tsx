"use client";

import { useTransition } from "react";
import { updateRookieDayContentAction } from "@/app/actions/rookieJourney";

interface DayForForm {
  dayNumber: number;
  titleEn: string;
  titleEs: string;
  descriptionEn: string;
  descriptionEs: string;
  estimatedAcademyMinutes: number;
  fieldGoalEn: string | null;
  fieldGoalEs: string | null;
}

export default function DayContentForm({ day }: { day: DayForForm }) {
  const [pending, startTransition] = useTransition();
  const action = updateRookieDayContentAction.bind(null, day.dayNumber);

  return (
    <form
      action={(formData) => startTransition(() => action(formData))}
      className="grid gap-4 md:grid-cols-2"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Title (English)</label>
        <input
          name="titleEn"
          defaultValue={day.titleEn}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Title (Español)</label>
        <input
          name="titleEs"
          defaultValue={day.titleEs}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Description (English)</label>
        <textarea
          name="descriptionEn"
          defaultValue={day.descriptionEn}
          rows={4}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Description (Español)</label>
        <textarea
          name="descriptionEs"
          defaultValue={day.descriptionEs}
          rows={4}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Estimated Academy Time (minutes)</label>
        <input
          type="number"
          name="estimatedAcademyMinutes"
          defaultValue={day.estimatedAcademyMinutes}
          min={0}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div />
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Field Goal (English)</label>
        <textarea
          name="fieldGoalEn"
          defaultValue={day.fieldGoalEn ?? ""}
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Field Goal (Español)</label>
        <textarea
          name="fieldGoalEs"
          defaultValue={day.fieldGoalEs ?? ""}
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save Day Content"}
        </button>
      </div>
    </form>
  );
}
