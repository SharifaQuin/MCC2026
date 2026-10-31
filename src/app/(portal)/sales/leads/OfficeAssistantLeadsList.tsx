import Link from "next/link";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/lib/leads";
import { formatPhone } from "@/lib/formatPhone";
import type { LeadSource, LeadStage } from "@prisma/client";

export interface OfficeAssistantLeadRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  source: LeadSource;
  serviceInterest: string | null;
  stage: LeadStage;
  languageNote: string | null;
  followUpDueAt: string | null;
  createdAt: string;
  assignedToName: string | null;
}

// No estimated value, no CSV export, no win-rate funnel, no lost-lead
// link — this role only ever sees the fields its narrow grant covers
// (see src/app/(portal)/sales/leads/actions.ts for what it can edit).
export default function OfficeAssistantLeadsList({ leads }: { leads: OfficeAssistantLeadRow[] }) {
  if (leads.length === 0) {
    return <p className="text-sm text-neutral-400">No open leads right now.</p>;
  }

  // Purely a visibility aid for leads no one has ever set a follow-up date
  // for — never a due callback, and never gets one invented for it here.
  const needsFollowUpDate = leads.filter((l) => l.followUpDueAt === null);

  return (
    <div className="space-y-6">
      {needsFollowUpDate.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-medium text-neutral-900">Needs Follow-up Date</h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Stage</th>
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
                    <td className="px-4 py-3 text-neutral-600">{formatPhone(l.phone)}</td>
                    <td className="px-4 py-3 text-neutral-600">{LEAD_STAGE_LABELS[l.stage] ?? l.stage}</td>
                    <td className="px-4 py-3 text-neutral-600">{l.assignedToName ?? "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Language Note</th>
              <th className="px-4 py-3">Next Follow-up</th>
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
                <td className="px-4 py-3 text-neutral-600">{formatPhone(l.phone)}</td>
                <td className="px-4 py-3 text-neutral-600">{LEAD_SOURCE_LABELS[l.source] ?? l.source}</td>
                <td className="px-4 py-3 text-neutral-600">{LEAD_STAGE_LABELS[l.stage] ?? l.stage}</td>
                <td className="px-4 py-3 text-neutral-600">{l.languageNote ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {l.followUpDueAt ? new Date(l.followUpDueAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600">{l.assignedToName ?? "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
