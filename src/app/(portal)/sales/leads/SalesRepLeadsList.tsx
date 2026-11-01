import Link from "next/link";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/lib/leads";
import type { LeadSource, LeadStage } from "@prisma/client";

export interface SalesRepLeadRow {
  id: string;
  firstName: string;
  lastName: string;
  serviceInterest: string | null;
  estimatedValue: number | null;
  stage: LeadStage;
  source: LeadSource;
  followUpDueAt: string | null;
  // Business-day-aware — computed server-side by getFollowUpUrgency (see
  // src/lib/leads.ts) so this list and Home's Today card never disagree
  // about what's overdue. null when there's no follow-up date at all.
  followUpUrgency: "overdue" | "due_today" | null;
  assignedToName: string | null;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// The owner's own pipeline board stays a Kanban view (LeadPipelineBoard) —
// a Sales Rep gets this "Leads & Callbacks" shape instead: outstanding
// follow-ups first, ordered by due date with overdue ones visually
// distinct, then the full open-lead list below. Every other Sales ability
// (search/filter, export, Add Lead, Mine/All, lead detail, permitted
// edits) lives in the surrounding page chrome, unchanged for her.
export default function SalesRepLeadsList({ leads }: { leads: SalesRepLeadRow[] }) {
  const callbacks = leads
    .filter((l) => l.followUpDueAt !== null)
    .sort((a, b) => new Date(a.followUpDueAt!).getTime() - new Date(b.followUpDueAt!).getTime());
  // Not a due callback — just a lead no one has ever set a follow-up date
  // for, so it would otherwise never surface in the Callbacks list above
  // (which only ever looks at leads that already have one). Never invents
  // a date for these; it's purely a visibility aid.
  const needsFollowUpDate = leads.filter((l) => l.followUpDueAt === null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Callbacks</h2>
        {callbacks.length === 0 ? (
          <p className="text-sm text-neutral-400">No outstanding callbacks right now.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Follow-up Due</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody>
                {callbacks.map((l) => {
                  const overdue = l.followUpUrgency === "overdue";
                  return (
                    <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/sales/leads/${l.id}`} className="font-medium text-brand-700 hover:underline">
                          {l.firstName} {l.lastName}
                        </Link>
                        {l.serviceInterest && <p className="text-xs text-neutral-500">{l.serviceInterest}</p>}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{LEAD_STAGE_LABELS[l.stage] ?? l.stage}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            overdue ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {new Date(l.followUpDueAt!).toLocaleDateString()}
                          {overdue ? " — overdue" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{l.assignedToName ?? "Unassigned"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Needs Follow-up Date</h2>
        {needsFollowUpDate.length === 0 ? (
          <p className="text-sm text-neutral-400">Every open lead has a follow-up date set.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody>
                {needsFollowUpDate.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/sales/leads/${l.id}`} className="font-medium text-brand-700 hover:underline">
                        {l.firstName} {l.lastName}
                      </Link>
                      {l.serviceInterest && <p className="text-xs text-neutral-500">{l.serviceInterest}</p>}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{LEAD_STAGE_LABELS[l.stage] ?? l.stage}</td>
                    <td className="px-4 py-3 text-neutral-600">{LEAD_SOURCE_LABELS[l.source] ?? l.source}</td>
                    <td className="px-4 py-3 text-neutral-600">{l.assignedToName ?? "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Leads</h2>
        {leads.length === 0 ? (
          <p className="text-sm text-neutral-400">No open leads right now.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Est. Value</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/sales/leads/${l.id}`} className="font-medium text-brand-700 hover:underline">
                        {l.firstName} {l.lastName}
                      </Link>
                      {l.serviceInterest && <p className="text-xs text-neutral-500">{l.serviceInterest}</p>}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{LEAD_SOURCE_LABELS[l.source] ?? l.source}</td>
                    <td className="px-4 py-3 text-neutral-600">{LEAD_STAGE_LABELS[l.stage] ?? l.stage}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {l.estimatedValue ? money(l.estimatedValue) : "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{l.assignedToName ?? "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
