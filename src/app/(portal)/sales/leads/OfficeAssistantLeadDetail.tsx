import Link from "next/link";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/lib/leads";
import { formatPhone } from "@/lib/formatPhone";
import type { LeadSource, LeadStage } from "@prisma/client";
import OfficeAssistantLeadCallLogForm from "./OfficeAssistantLeadCallLogForm";

export interface OfficeAssistantLeadDetailData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string | null;
  serviceInterest: string | null;
  squareFootage: number | null;
  frequency: string | null;
  message: string | null;
  source: LeadSource;
  stage: LeadStage;
  languageNote: string | null;
  followUpDueAt: string | null;
  createdAt: string;
  assignedToName: string | null;
  notes: { id: string; body: string; authorName: string | null; createdAt: string }[];
}

// Deliberately separate from the full admin lead detail page — no
// estimated value, no quote key, no pricing-tool links, no reassignment,
// and no outbound email/SMS sending. Only the fields and actions this
// role's narrow grant covers (contact details, notes, stage up to
// Contacted, follow-up date, and a Spanish/language-evidence note).
export default function OfficeAssistantLeadDetail({
  lead,
  canEdit,
}: {
  lead: OfficeAssistantLeadDetailData;
  canEdit: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/sales/leads" className="text-sm text-brand-700 hover:underline">
        ← Back to Leads &amp; Callbacks
      </Link>

      <div className="mb-6 mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {lead.firstName} {lead.lastName}
          </h1>
          <p className="text-neutral-500">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
            {LEAD_STAGE_LABELS[lead.stage] ?? lead.stage}
          </span>
          <span className="text-xs text-neutral-400">Owner: {lead.assignedToName ?? "Unassigned"}</span>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-400">Email</dt>
            <dd>{lead.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Phone</dt>
            <dd>{formatPhone(lead.phone)}</dd>
          </div>
          {lead.address && (
            <div>
              <dt className="text-neutral-400">Address</dt>
              <dd>{lead.address}</dd>
            </div>
          )}
          {lead.serviceInterest && (
            <div>
              <dt className="text-neutral-400">Service Interest</dt>
              <dd>{lead.serviceInterest}</dd>
            </div>
          )}
          {lead.squareFootage && (
            <div>
              <dt className="text-neutral-400">Square Footage</dt>
              <dd>{lead.squareFootage.toLocaleString()} sqft</dd>
            </div>
          )}
          {lead.frequency && (
            <div>
              <dt className="text-neutral-400">Cleaning Frequency</dt>
              <dd>{lead.frequency}</dd>
            </div>
          )}
          <div>
            <dt className="text-neutral-400">Received</dt>
            <dd>{new Date(lead.createdAt).toLocaleDateString()}</dd>
          </div>
          {lead.message && (
            <div className="col-span-2">
              <dt className="text-neutral-400">Message</dt>
              <dd className="whitespace-pre-wrap">{lead.message}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Log a Call</h2>
        <OfficeAssistantLeadCallLogForm
          leadId={lead.id}
          stage={lead.stage}
          languageNote={lead.languageNote}
          followUpDueAt={lead.followUpDueAt}
          canEdit={canEdit}
        />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Notes &amp; History</h2>
        {lead.notes.length === 0 ? (
          <p className="text-sm text-neutral-400">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {lead.notes.map((n) => (
              <li key={n.id} className="rounded-md bg-neutral-50 p-2 text-sm">
                <p className="text-neutral-700">{n.body}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {n.authorName ?? "Unknown"} · {new Date(n.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
