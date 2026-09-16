"use client";

import { useTransition } from "react";
import { toggleOnboardingChecklistItemAction } from "../actions";

interface ChecklistItem {
  key: string;
  label: string;
  autoDetectable: boolean;
  completed: boolean;
  completedAt: string | null;
  completedByName: string | null;
}

export default function OnboardingChecklistTab({
  applicantId,
  items,
}: {
  applicantId: string;
  items: ChecklistItem[];
}) {
  const [pending, startTransition] = useTransition();

  const doneCount = items.filter((i) => i.completed).length;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-neutral-900">Onboarding Checklist</h2>
        <span className="text-sm text-neutral-500">
          {doneCount} of {items.length} complete
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <label
            key={item.key}
            className={`flex items-start gap-3 rounded-md border p-3 ${
              item.completed ? "border-green-200 bg-green-50" : "border-neutral-200 bg-white"
            }`}
          >
            <input
              type="checkbox"
              checked={item.completed}
              disabled={pending}
              onChange={(e) =>
                startTransition(async () => {
                  await toggleOnboardingChecklistItemAction(applicantId, item.key, e.target.checked);
                })
              }
              className="mt-1"
            />
            <div className="flex-1">
              <p className={`text-sm font-medium ${item.completed ? "text-green-900" : "text-neutral-900"}`}>
                {item.label}
                {item.autoDetectable && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">(auto-detected)</span>
                )}
              </p>
              {item.completed && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  {item.completedByName ? `Checked by ${item.completedByName}` : "Auto-detected"}
                  {item.completedAt ? ` — ${new Date(item.completedAt).toLocaleDateString()}` : ""}
                </p>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
