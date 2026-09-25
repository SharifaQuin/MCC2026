"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordFieldCheckoffAction } from "@/app/actions/rookieJourney";
import type { FieldSkillRating } from "@prisma/client";

const EARLY_OPTIONS: { value: FieldSkillRating; label: string }[] = [
  { value: "INTRODUCED", label: "Introduced" },
  { value: "PRACTICING", label: "Practicing" },
  { value: "DEMONSTRATED", label: "Demonstrated" },
];

const LATER_OPTIONS: { value: FieldSkillRating; label: string }[] = [
  { value: "NEEDS_COACHING", label: "Needs Coaching" },
  { value: "MEETS_STANDARD", label: "Meets Standard" },
  { value: "CONSISTENT", label: "Consistent" },
];

interface FieldSkillOption {
  id: string;
  labelEn: string;
  labelEs: string;
}

export default function CheckoffForm({
  traineeId,
  rookieDayNumber,
  fieldSkills,
  isEarlyPhase,
}: {
  traineeId: string;
  rookieDayNumber: number;
  fieldSkills: FieldSkillOption[];
  isEarlyPhase: boolean;
}) {
  const options = isEarlyPhase ? EARLY_OPTIONS : LATER_OPTIONS;
  const [ratings, setRatings] = useState<Record<string, FieldSkillRating>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [wentWell, setWentWell] = useState("");
  const [needsCoaching, setNeedsCoaching] = useState("");
  const [tomorrowFocus, setTomorrowFocus] = useState("");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const allRated = fieldSkills.length === 0 || fieldSkills.every((s) => ratings[s.id]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await recordFieldCheckoffAction(
            traineeId,
            rookieDayNumber,
            fieldSkills
              .filter((s) => ratings[s.id])
              .map((s) => ({ fieldSkillId: s.id, rating: ratings[s.id], note: notes[s.id] })),
            { wentWell, needsCoaching, tomorrowFocus }
          );
          setSaved(true);
          router.refresh();
        });
      }}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Today's Field Focus</h2>

      {fieldSkills.length === 0 && (
        <p className="text-sm text-neutral-400">No field skills assigned to this day yet.</p>
      )}

      {fieldSkills.map((skill) => (
        <fieldset key={skill.id} className="rounded-md border border-neutral-200 p-3">
          <legend className="px-1 text-sm font-medium">{skill.labelEn}</legend>
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRatings((r) => ({ ...r, [skill.id]: opt.value }))}
                className={`rounded-md border px-2 py-2.5 text-xs font-medium ${
                  ratings[skill.id] === opt.value
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Note (optional)"
            value={notes[skill.id] ?? ""}
            onChange={(e) => setNotes((n) => ({ ...n, [skill.id]: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />
        </fieldset>
      ))}

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">What went well today?</label>
        <textarea
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">What needs coaching?</label>
        <textarea
          value={needsCoaching}
          onChange={(e) => setNeedsCoaching(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Tomorrow's focus</label>
        <textarea
          value={tomorrowFocus}
          onChange={(e) => setTomorrowFocus(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending || !allRated}
        className="w-full rounded-md bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save Daily Training Record"}
      </button>
      {!allRated && fieldSkills.length > 0 && (
        <p className="text-center text-xs text-neutral-400">Rate every skill above to save.</p>
      )}
      {saved && !pending && <p className="text-center text-sm text-green-700">Saved.</p>}
    </form>
  );
}
