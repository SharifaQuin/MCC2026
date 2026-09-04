"use client";

import { FIELD_EVAL_CATEGORIES } from "@/lib/fieldEval";

export interface FieldEvalDefaultCategory {
  score: number;
  checkedItems: string[];
  notes: string | null;
}

export default function FieldEvalFields({
  defaultFieldDate,
  defaultGeneralNotes,
  defaultCategories,
}: {
  defaultFieldDate?: string;
  defaultGeneralNotes?: string | null;
  defaultCategories?: Record<string, FieldEvalDefaultCategory>;
}) {
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium">Field Day Date</label>
        <input
          type="date"
          name="fieldDate"
          required
          defaultValue={defaultFieldDate ?? new Date().toISOString().slice(0, 10)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {FIELD_EVAL_CATEGORIES.map((cat) => {
        const existing = defaultCategories?.[cat.key];
        return (
          <fieldset key={cat.key} className="rounded-md border border-neutral-200 p-4">
            <legend className="px-1 font-medium">{cat.label}</legend>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Score (1 = needs significant work, 5 = excellent)
              </label>
              <select
                name={`score_${cat.key}`}
                required
                defaultValue={existing?.score ?? ""}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select a score
                </option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3 space-y-1">
              <p className="text-xs font-medium text-neutral-500">Observed behaviors</p>
              {cat.checklistItems.map((item, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`check_${cat.key}_${i}`}
                    defaultChecked={existing?.checkedItems.includes(item) ?? false}
                    className="h-4 w-4"
                  />
                  {item}
                </label>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Notes (internal only, not shown to employee)
              </label>
              <textarea
                name={`notes_${cat.key}`}
                rows={2}
                defaultValue={existing?.notes ?? ""}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </fieldset>
        );
      })}

      <div>
        <label className="mb-1 block text-sm font-medium">
          General Notes (internal only, not shown to employee)
        </label>
        <textarea
          name="generalNotes"
          rows={3}
          defaultValue={defaultGeneralNotes ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
    </>
  );
}
