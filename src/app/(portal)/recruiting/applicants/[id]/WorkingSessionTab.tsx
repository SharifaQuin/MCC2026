"use client";

import { useState, useTransition } from "react";
import { saveWorkingSessionAction } from "../actions";
import { INTERVIEW_RECOMMENDATION_LABELS } from "@/lib/recruiting";

const OBSERVATION_AREAS: { key: string; label: string }[] = [
  { key: "technical", label: "Technical Cleaning Execution" },
  { key: "paceStamina", label: "Pace & Stamina" },
  { key: "attentionDetail", label: "Attention to Detail" },
  { key: "clientHome", label: "Behavior in Client Home" },
  { key: "coachability", label: "Coachability" },
  { key: "pairDynamic", label: "Pair Dynamic" },
  { key: "safety", label: "Safety Awareness" },
];

interface ChecklistItem {
  label: string;
  checked: boolean;
}

interface WorkingSessionData {
  scheduledAt: string | null;
  housesToVisit: string | null;
  preSessionChecklist: ChecklistItem[] | null;
  leadEvaluatorName: string | null;
  honestAssessment: string | null;
  concernsRaised: string | null;
  recommendation: string | null;
  updatedAt: string | null;
  [key: string]: unknown;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function WorkingSessionTab({
  applicantId,
  checklistLabels,
  record,
  canEdit,
}: {
  applicantId: string;
  checklistLabels: string[];
  record: WorkingSessionData | null;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const checkedByLabel = new Map((record?.preSessionChecklist ?? []).map((c) => [c.label, c.checked]));

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await saveWorkingSessionAction(applicantId, checklistLabels, formData);
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        })
      }
      className="space-y-6"
    >
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Session Details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">Scheduled Date/Time</label>
            <input
              type="datetime-local"
              name="scheduledAt"
              defaultValue={toDatetimeLocal(record?.scheduledAt ?? null)}
              disabled={!canEdit}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">Houses to Be Visited</label>
            <input
              name="housesToVisit"
              defaultValue={record?.housesToVisit ?? ""}
              disabled={!canEdit}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-medium text-neutral-900">Pre-Day Checklist</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Working session is paid at the offered hourly rate — even if not hired.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {checklistLabels.map((label, i) => (
            <label key={label} className="flex items-start gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                name={`checklist_${i}`}
                defaultChecked={checkedByLabel.get(label) ?? false}
                disabled={!canEdit}
                className="mt-0.5 h-4 w-4"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-medium text-neutral-900">Observed Behaviors (Lead Completes)</h2>
        <p className="mb-3 text-xs text-neutral-500">
          5 — Exceptional | 4 — Strong | 3 — Meets Bar | 2 — Below Bar | 1 — Not Demonstrated
        </p>
        <div className="space-y-3">
          {OBSERVATION_AREAS.map((area) => (
            <div key={area.key} className="grid grid-cols-[1fr_80px] gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">{area.label}</label>
                <input
                  name={`${area.key}Notes`}
                  placeholder="Specific notes"
                  defaultValue={(record?.[`${area.key}Notes`] as string | null) ?? ""}
                  disabled={!canEdit}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">Score</label>
                <select
                  name={`${area.key}Score`}
                  defaultValue={(record?.[`${area.key}Score`] as number | null)?.toString() ?? ""}
                  disabled={!canEdit}
                  className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Lead&apos;s Honest Assessment</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Would you want this person as your Assistant (or Lead)? Why or why not?
            </label>
            <textarea
              name="honestAssessment"
              rows={3}
              defaultValue={record?.honestAssessment ?? ""}
              disabled={!canEdit}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Was there anything that gave you pause?
            </label>
            <textarea
              name="concernsRaised"
              rows={2}
              defaultValue={record?.concernsRaised ?? ""}
              disabled={!canEdit}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">Overall Recommendation</label>
            <select
              name="recommendation"
              defaultValue={record?.recommendation ?? ""}
              disabled={!canEdit}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Select...</option>
              {Object.entries(INTERVIEW_RECOMMENDATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {record?.updatedAt && (
          <p className="mt-2 text-xs text-neutral-400">
            Last saved by {record.leadEvaluatorName ?? "Unknown"} on{" "}
            {new Date(record.updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save Working Session"}
          </button>
          {saved && <span className="text-sm font-medium text-green-700">✓ Saved</span>}
        </div>
      )}
    </form>
  );
}
