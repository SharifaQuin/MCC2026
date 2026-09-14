import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { LEAD_PIPELINE_COLUMNS, ARCHIVED_LEAD_STAGES } from "@/lib/leads";
import LeadPipelineBoard from "./LeadPipelineBoard";
import AddLeadPanel from "./AddLeadPanel";

export default async function LeadsPage() {
  const { canEdit } = await requireDepartmentAccess("SALES");

  const [leads, lostCount] = await Promise.all([
    prisma.lead.findMany({
      where: { stage: { notIn: ARCHIVED_LEAD_STAGES } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lead.count({ where: { stage: { in: ARCHIVED_LEAD_STAGES } } }),
  ]);

  const columns = LEAD_PIPELINE_COLUMNS.map((col) => ({
    ...col,
    leads: leads
      .filter((l) => l.stage === col.stage)
      .map((l) => ({
        id: l.id,
        firstName: l.firstName,
        lastName: l.lastName,
        serviceInterest: l.serviceInterest,
        estimatedValue: l.estimatedValue,
        stage: l.stage,
      })),
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/sales" className="text-sm text-brand-700 hover:underline">
            ← Back to Sales
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Lead Pipeline</h1>
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            <Link href="/sales/leads/form-settings" className="text-sm text-brand-700 hover:underline">
              Form Settings
            </Link>
            <AddLeadPanel />
          </div>
        )}
      </div>

      <LeadPipelineBoard columns={columns} />

      {lostCount > 0 && (
        <p className="mt-6 text-sm text-neutral-400">
          <Link href="/sales/leads/lost" className="text-brand-700 hover:underline">
            {lostCount} lost lead{lostCount === 1 ? "" : "s"}
          </Link>{" "}
          not shown here.
        </p>
      )}
    </div>
  );
}
