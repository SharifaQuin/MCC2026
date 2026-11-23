"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setLeadStageAction } from "./actions";
import { PRIMARY_NEXT_LEAD_STAGE } from "@/lib/leads";
import type { LeadStage } from "@prisma/client";

interface Card {
  id: string;
  firstName: string;
  lastName: string;
  serviceInterest: string | null;
  estimatedValue: number | null;
  stage: LeadStage;
  assignedToName: string | null;
}

// Subtle, consistent per-column tint so a glance tells the stages apart —
// purely visual, same four stages/order as LEAD_PIPELINE_COLUMNS.
const COLUMN_STYLES: Record<string, string> = {
  NEW_INQUIRY: "bg-neutral-50",
  CONTACTED: "bg-blue-50/60",
  QUOTED: "bg-amber-50/60",
  WON: "bg-green-50/60",
};

function LeadCard({ lead }: { lead: Card }) {
  const [pending, startTransition] = useTransition();
  const primary = PRIMARY_NEXT_LEAD_STAGE[lead.stage];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <Link
        href={`/sales/leads/${lead.id}`}
        className="font-medium text-brand-700 hover:underline"
      >
        {lead.firstName} {lead.lastName}
      </Link>
      {lead.serviceInterest && (
        <p className="truncate text-xs text-neutral-500">{lead.serviceInterest}</p>
      )}
      {lead.estimatedValue !== null && (
        <p className="mt-1 text-xs text-neutral-400">
          ${lead.estimatedValue.toLocaleString()}
        </p>
      )}
      {lead.assignedToName && (
        <p className="mt-1 truncate text-xs text-neutral-400">{lead.assignedToName}</p>
      )}
      {primary && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setLeadStageAction(lead.id, primary.stage))}
          className="mt-2 w-full rounded-md bg-brand-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Moving..." : `→ ${primary.label}`}
        </button>
      )}
    </div>
  );
}

export default function LeadPipelineBoard({
  columns,
}: {
  columns: { stage: string; label: string; leads: Card[] }[];
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.stage} className={`w-64 shrink-0 rounded-2xl p-2 ${COLUMN_STYLES[col.stage] ?? "bg-neutral-50"}`}>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-neutral-700">{col.label}</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-500 shadow-sm">
              {col.leads.length}
            </span>
          </div>
          <div className="space-y-2">
            {col.leads.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 p-3 text-center text-xs text-neutral-400">
                Empty
              </p>
            ) : (
              col.leads.map((l) => <LeadCard key={l.id} lead={l} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
