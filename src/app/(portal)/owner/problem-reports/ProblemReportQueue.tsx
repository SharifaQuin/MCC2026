"use client";

import { useTransition } from "react";
import { setProblemReportStatusAction } from "@/app/actions/problemReports";
import type { ProblemReportCategory, ProblemReportStatus, Role } from "@prisma/client";

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
};

export interface ProblemReportRow {
  id: string;
  reporterName: string;
  reporterRole: Role;
  category: ProblemReportCategory;
  description: string;
  status: ProblemReportStatus;
  createdAt: string;
}

function Row({ report }: { report: ProblemReportRow }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">{CATEGORY_LABELS[report.category]}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {report.reporterName} · {ROLE_LABELS[report.reporterRole]} ·{" "}
            {new Date(report.createdAt).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              setProblemReportStatusAction(report.id, report.status === "OPEN" ? "RESOLVED" : "OPEN")
            )
          }
          className="shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {report.status === "OPEN" ? "Mark resolved" : "Reopen"}
        </button>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{report.description}</p>
    </div>
  );
}

export default function ProblemReportQueue({ reports }: { reports: ProblemReportRow[] }) {
  const open = reports.filter((r) => r.status === "OPEN");
  const resolved = reports.filter((r) => r.status === "RESOLVED");

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
