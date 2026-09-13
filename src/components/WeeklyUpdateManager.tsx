"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  approveWeeklyUpdateAction,
  revertWeeklyUpdateToDraftAction,
  saveWeeklyUpdateDraftAction,
  sendWeeklyUpdateNowAction,
} from "@/app/actions/weeklyUpdate";
import { formatWeeklyUpdate, type WeeklyUpdateFields } from "@/lib/weeklyUpdate";

export interface WeeklyUpdateRow extends WeeklyUpdateFields {
  id: string;
  weekOf: string; // YYYY-MM-DD
  status: "DRAFT" | "APPROVED" | "SENT" | "FAILED";
  formattedMessage: string;
  sentAt: string | null;
}

const STATUS_STYLES: Record<WeeklyUpdateRow["status"], string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  APPROVED: "bg-amber-100 text-amber-800",
  SENT: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-700",
};

const EMPTY_FIELDS: WeeklyUpdateFields = {
  spotlightName: "",
  spotlightReason: "",
  homesCleaned: 0,
  commercialServiced: 0,
  avgRating: 0,
  clientShoutout: "",
  companyUpdates: "",
  weeklyGoal: "",
  coreValue: "",
  coreValueDescription: "",
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save draft"}
    </button>
  );
}

function HistoryRow({ update, canEdit }: { update: WeeklyUpdateRow; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  function reportError(err: unknown) {
    alert(err instanceof Error ? err.message : "Something went wrong. Please try again.");
  }

  function approve() {
    startTransition(async () => {
      try {
        await approveWeeklyUpdateAction(update.id);
      } catch (err) {
        reportError(err);
      }
    });
  }
  function revert() {
    startTransition(async () => {
      try {
        await revertWeeklyUpdateToDraftAction(update.id);
      } catch (err) {
        reportError(err);
      }
    });
  }
  function sendNow() {
    if (!confirm(`Post this week's update to Slack right now?`)) return;
    startTransition(async () => {
      try {
        await sendWeeklyUpdateNowAction(update.id);
      } catch (err) {
        reportError(err);
      }
    });
  }

  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">Week of {update.weekOf}</p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            Spotlight: {update.spotlightName || "—"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[update.status]}`}>
            {update.status.charAt(0) + update.status.slice(1).toLowerCase()}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((s) => !s)}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            {expanded ? "Hide" : "Preview"}
          </button>
        </div>
      </div>

      {expanded && (
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-xs text-neutral-700">
          {update.formattedMessage}
        </pre>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-neutral-100 pt-2">
          {update.status === "DRAFT" && (
            <button
              type="button"
              disabled={pending}
              onClick={approve}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            >
              Approve
            </button>
          )}
          {update.status === "APPROVED" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={sendNow}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
              >
                Send now
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={revert}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-white disabled:opacity-40"
              >
                Revert to draft
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function WeeklyUpdateManager({
  updates,
  canEdit,
  defaultWeekOf,
}: {
  updates: WeeklyUpdateRow[];
  canEdit: boolean;
  defaultWeekOf: string;
}) {
  const sorted = useMemo(
    () => [...updates].sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1)),
    [updates]
  );

  const [weekOf, setWeekOf] = useState(defaultWeekOf);
  const existing = sorted.find((u) => u.weekOf === weekOf);
  const [fields, setFields] = useState<WeeklyUpdateFields>(existing ?? EMPTY_FIELDS);

  function selectWeek(newWeekOf: string) {
    setWeekOf(newWeekOf);
    const match = sorted.find((u) => u.weekOf === newWeekOf);
    setFields(match ?? EMPTY_FIELDS);
  }

  function set<K extends keyof WeeklyUpdateFields>(key: K, value: WeeklyUpdateFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  const preview = formatWeeklyUpdate(fields);

  if (!canEdit) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Update history</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-neutral-400">No updates yet.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((u) => (
              <HistoryRow key={u.id} update={u} canEdit={false} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <form action={saveWeeklyUpdateDraftAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Week of (Monday)</label>
            <input
              type="date"
              name="weekOf"
              value={weekOf}
              onChange={(e) => selectWeek(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Spotlight name</label>
              <input
                name="spotlightName"
                required
                value={fields.spotlightName}
                onChange={(e) => set("spotlightName", e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Core value</label>
              <input
                name="coreValue"
                required
                value={fields.coreValue}
                onChange={(e) => set("coreValue", e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Why this person? (spotlight reason)</label>
            <textarea
              name="spotlightReason"
              required
              rows={2}
              value={fields.spotlightReason}
              onChange={(e) => set("spotlightReason", e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Core value description</label>
            <textarea
              name="coreValueDescription"
              required
              rows={2}
              value={fields.coreValueDescription}
              onChange={(e) => set("coreValueDescription", e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Homes cleaned</label>
              <input
                type="number"
                name="homesCleaned"
                required
                value={fields.homesCleaned}
                onChange={(e) => set("homesCleaned", Number(e.target.value))}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Commercial serviced</label>
              <input
                type="number"
                name="commercialServiced"
                value={fields.commercialServiced}
                onChange={(e) => set("commercialServiced", Number(e.target.value))}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Avg rating</label>
              <input
                type="number"
                step="0.1"
                name="avgRating"
                required
                value={fields.avgRating}
                onChange={(e) => set("avgRating", Number(e.target.value))}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Client shoutout (optional)</label>
            <textarea
              name="clientShoutout"
              rows={2}
              value={fields.clientShoutout ?? ""}
              onChange={(e) => set("clientShoutout", e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Company updates (optional — one per line)
            </label>
            <textarea
              name="companyUpdates"
              rows={3}
              value={fields.companyUpdates ?? ""}
              onChange={(e) => set("companyUpdates", e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">This week&apos;s goal</label>
            <textarea
              name="weeklyGoal"
              required
              rows={2}
              value={fields.weeklyGoal}
              onChange={(e) => set("weeklyGoal", e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>

          <SaveButton />
          <p className="text-xs text-neutral-400">
            Saving marks this week&apos;s reminder task Done. Approve it, then it auto-posts to Slack Monday at
            8:05am — or use Send Now on an approved update.
          </p>
        </form>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Preview</h2>
          <pre className="whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
            {preview}
          </pre>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">History</h2>
          {sorted.length === 0 ? (
            <p className="text-sm text-neutral-400">No updates yet.</p>
          ) : (
            <div className="space-y-2">
              {sorted.map((u) => (
                <HistoryRow key={u.id} update={u} canEdit={canEdit} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
