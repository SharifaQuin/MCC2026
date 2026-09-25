"use client";

import { useState, useTransition } from "react";
import { setRookieDayFieldSkillsAction } from "@/app/actions/rookieJourney";

export default function FieldSkillPicker({
  dayNumber,
  library,
  selectedIds,
}: {
  dayNumber: number;
  library: { id: string; labelEn: string }[];
  selectedIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {library.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(s.id);
                else next.delete(s.id);
                setSelected(next);
                setSaved(false);
              }}
              className="h-4 w-4"
            />
            {s.labelEn}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setRookieDayFieldSkillsAction(dayNumber, Array.from(selected));
            setSaved(true);
          })
        }
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save Field Skills"}
      </button>
      {saved && !pending && <span className="ml-3 text-sm text-green-700">Saved.</span>}
    </div>
  );
}
