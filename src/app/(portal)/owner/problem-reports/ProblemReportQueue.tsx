"use client";

import { useState, useTransition } from "react";
import {
  resolveProblemReportAction,
  reopenProblemReportAction,
} from "@/app/actions/problemReports";
import type {
  ProblemReportCategory,
  ProblemReportStatus,
  ProblemReportEmailStatus,
  ProblemReportFeedbackOutcome,
  Role,
} from "@prisma/client";

const CATEGORY_LABELS: Record<ProblemReportCategory, string> = {
  BUG_OR_ERROR: "Something's broken",
  ACCOUNT_OR_ACCESS: "Account or access issue",
  DATA_LOOKS_WRONG: "Data looks wrong",
  OTHER: "Other",
};

const ROLE_LABELS: Record<Role, string> = {
  TRAINEE: "Trainee / New Hire",
  TRAINER: "Trainer",
  SERVICE_MANAGER: "Service Manager",
  ADMIN: "Admin / Owner",
  OFFICE_ASSISTANT: "Office Assistant",
  SALES_REP: "Sales Rep",
};

const EMAIL_STATUS_LABELS: Record<ProblemReportEmailStatus, string> = {
  PENDING: "Not sent yet",
  SENDING: "Sending…",
  SENT: "✓ Emailed reporter",
  FAILED: "⚠ Email to reporter failed",
};

const EMAIL_STATUS_STYLES: Record<ProblemReportEmailStatus, string> = {
  PENDING: "text-neutral-400",
  SENDING: "text-amber-600",
  SENT: "text-green-700",
  FAILED: "text-red-700",
};

const FEEDBACK_OUTCOME_LABELS: Record<ProblemReportFeedbackOutcome, string> = {
  CONFIRMED_WORKING: "✓ Reporter said it's working",
  STILL_BROKEN: "⚠ Reporter said they're still having trouble",
};

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong — please try again.";
}

export interface ProblemReportResolutionRow {
  id: string;
  note: string;
  resolvedByName: string;
  resolvedAt: string;
  emailStatus: ProblemReportEmailStatus;
  emailError: string | null;
}

export interface ProblemReportFeedbackRow {
  id: string;
  outcome: ProblemReportFeedbackOutcome;
  note: string | null;
  createdAt: string;
}

export interface ProblemReportRow {
  id: string;
  reporterName: string;
  reporterRole: Role;
  category: ProblemReportCategory;
  description: string;
  status: ProblemReportStatus;
  createdAt: string;
  latestResolutionId: string | null;
  resolutions: ProblemReportResolutionRow[];
  feedback: ProblemReportFeedbackRow[];
}

function ResolveForm({ reportId, onDone }: { reportId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setError("A resolution note is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await resolveProblemReportAction(reportId, trimmed);
        if (result.ok) onDone();
        else setError(result.error ?? "Couldn't resolve this report.");
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <label className="block text-xs font-medium text-neutral-700">
        Resolution note (shown and emailed to the reporter)
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        required
        placeholder="What did you do? Avoid internal-only details — this is sent to the reporter."
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Resolving..." : "Resolve"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Row({ report }: { report: ProblemReportRow }) {
  const [pending, startTransition] = useTransition();
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reopen() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await reopenProblemReportAction(report.id);
        if (!result.ok) setError(result.error ?? "Couldn't reopen this report.");
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">
            {CATEGORY_LABELS[report.category]}
            {report.status === "CONFIRMED" && (
              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                Confirmed working
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {report.reporterName} · {ROLE_LABELS[report.reporterRole]} ·{" "}
            {new Date(report.createdAt).toLocaleString()}
          </p>
        </div>
        {report.status === "OPEN" ? (
          !resolving && (
            <button
              type="button"
              onClick={() => setResolving(true)}
              className="shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Resolve
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={reopen}
            className="shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            Reopen
          </button>
        )}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{report.description}</p>

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}

      {resolving && <ResolveForm reportId={report.id} onDone={() => setResolving(false)} />}

      {report.resolutions.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          {report.resolutions.map((res) => (
            <div key={res.id} className="rounded-md bg-neutral-50 p-2.5 text-xs">
              <p className="whitespace-pre-wrap text-neutral-700">{res.note}</p>
              <p className="mt-1 text-neutral-400">
                {res.resolvedByName} · {new Date(res.resolvedAt).toLocaleString()} ·{" "}
                <span className={EMAIL_STATUS_STYLES[res.emailStatus]}>{EMAIL_STATUS_LABELS[res.emailStatus]}</span>
              </p>
              {res.emailStatus === "FAILED" && res.emailError && (
                <p className="mt-1 text-red-700">{res.emailError}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {report.feedback.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {report.feedback.map((f) => (
            <p key={f.id} className="text-xs text-neutral-600">
              {FEEDBACK_OUTCOME_LABELS[f.outcome]}
              {f.note ? `: ${f.note}` : ""} — {new Date(f.createdAt).toLocaleString()}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProblemReportQueue({ reports }: { reports: ProblemReportRow[] }) {
  const open = reports.filter((r) => r.status === "OPEN");
  const resolved = reports.filter((r) => r.status !== "OPEN");

  if (reports.length === 0) {
    return <p className="text-sm text-neutral-400">No problem reports yet.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Open ({open.length})</p>
        {open.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing open right now.</p>
        ) : (
          <div className="space-y-2">
            {open.map((r) => (
              <Row key={r.id} report={r} />
            ))}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Resolved ({resolved.length})
          </p>
          <div className="space-y-2 opacity-70">
            {resolved.map((r) => (
              <Row key={r.id} report={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
