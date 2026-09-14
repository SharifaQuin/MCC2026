import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/lib/leads";
import LeadStageControls from "./LeadStageControls";
import LeadCommunicationPanel from "./LeadCommunicationPanel";
import LeadDealDetailsForm from "./LeadDealDetailsForm";
import LeadActivityFeed from "./LeadActivityFeed";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const { canEdit } = await requireDepartmentAccess("SALES");

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      communications: {
        orderBy: { createdAt: "desc" },
        include: { sentBy: { select: { name: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
      stageChanges: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
    },
  });

  if (!lead) {
    return <p className="text-neutral-500">Lead not found.</p>;
  }

  const commHistory = lead.communications.map((c) => ({
    id: c.id,
    channel: c.channel,
    direction: c.direction,
    subject: c.subject,
    body: c.body,
    status: c.status,
    errorMessage: c.errorMessage,
    createdAt: c.createdAt.toISOString(),
    sentByName: c.sentBy?.name ?? null,
  }));

  const activityEntries = [
    ...lead.notes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      createdAt: n.createdAt.toISOString(),
      body: n.body,
      authorName: n.author?.name ?? null,
    })),
    ...lead.stageChanges.map((s) => ({
      kind: "stageChange" as const,
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      fromStage: s.fromStage,
      toStage: s.toStage,
      changedByName: s.changedBy?.name ?? null,
    })),
  ];

  const customFields = Array.isArray(lead.customFields)
    ? (lead.customFields as unknown as { label: string; value: string }[])
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/sales/leads" className="text-sm text-brand-700 hover:underline">
        ← Back to Pipeline
      </Link>

      <div className="mb-6 mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {lead.firstName} {lead.lastName}
          </h1>
          <p className="text-neutral-500">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
          {LEAD_STAGE_LABELS[lead.stage]}
        </span>
      </div>

      {lead.stage === "LOST" && lead.lostReason && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Lost: {lead.lostReason}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-400">Email</dt>
            <dd>{lead.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Phone</dt>
            <dd>{lead.phone}</dd>
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
          <div>
            <dt className="text-neutral-400">Received</dt>
            <dd>{lead.createdAt.toLocaleDateString()}</dd>
          </div>
          {lead.message && (
            <div className="col-span-2">
              <dt className="text-neutral-400">Message</dt>
              <dd className="whitespace-pre-wrap">{lead.message}</dd>
            </div>
          )}
          {customFields.map((f, i) => (
            <div key={i} className="col-span-2">
              <dt className="text-neutral-400">{f.label}</dt>
              <dd className="whitespace-pre-wrap">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mb-6">
        <LeadCommunicationPanel leadId={lead.id} history={commHistory} />
      </div>

      {canEdit && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 font-medium text-neutral-900">Move Lead</h2>
          <LeadStageControls leadId={lead.id} stage={lead.stage} />
        </div>
      )}

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Deal Details</h2>
        {lead.quoteKey && (
          <p className="mb-3 text-sm">
            <Link
              href={`/sales/pricing-tool?quote=${encodeURIComponent(lead.quoteKey)}`}
              className="text-brand-700 hover:underline"
            >
              View saved quote →
            </Link>
          </p>
        )}
        {canEdit ? (
          <LeadDealDetailsForm
            leadId={lead.id}
            estimatedValue={lead.estimatedValue}
            quoteKey={lead.quoteKey}
            followUpDueAt={lead.followUpDueAt ? lead.followUpDueAt.toISOString() : null}
          />
        ) : (
          <p className="text-sm text-neutral-500">
            {lead.estimatedValue ? `Estimated value: $${lead.estimatedValue.toLocaleString()}` : "No estimated value set."}
          </p>
        )}
        <Link
          href="/sales/pricing-tool"
          className="mt-3 inline-block text-sm text-brand-700 hover:underline"
        >
          Open Pricing &amp; Quotes Tool →
        </Link>
      </div>

      {canEdit ? (
        <LeadActivityFeed leadId={lead.id} entries={activityEntries} />
      ) : (
        activityEntries.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="mb-3 font-medium text-neutral-900">Activity &amp; Notes</h2>
            <p className="text-sm text-neutral-500">
              {activityEntries.length} entr{activityEntries.length === 1 ? "y" : "ies"} — view access only.
            </p>
          </div>
        )
      )}
    </div>
  );
}
