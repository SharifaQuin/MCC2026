import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import {
  LEAD_PIPELINE_COLUMNS,
  ARCHIVED_LEAD_STAGES,
  LEAD_SOURCE_LABELS,
  getLeadFunnelBySource,
} from "@/lib/leads";
import LeadPipelineBoard from "./LeadPipelineBoard";
import AddLeadPanel from "./AddLeadPanel";
import type { LeadSource } from "@prisma/client";

const VALID_LEAD_SOURCES = new Set(Object.keys(LEAD_SOURCE_LABELS));

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { q?: string; source?: string; assigned?: string };
}) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");

  const q = searchParams.q?.trim();
  const source = searchParams.source?.trim();
  const mineOnly = searchParams.assigned === "mine";

  const [leads, lostCount, funnel] = await Promise.all([
    prisma.lead.findMany({
      where: {
        stage: { notIn: ARCHIVED_LEAD_STAGES },
        ...(source && VALID_LEAD_SOURCES.has(source) ? { source: source as LeadSource } : {}),
        ...(mineOnly ? { assignedToId: session.sub } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { assignedTo: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lead.count({ where: { stage: { in: ARCHIVED_LEAD_STAGES } } }),
    getLeadFunnelBySource(),
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
        assignedToName: l.assignedTo?.name ?? null,
      })),
  }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/sales" className="text-sm text-brand-700 hover:underline">
            ← Back to Sales
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Lead Pipeline</h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/lead-form"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            View Lead Form ↗
          </a>
          <a
            href="/api/sales/leads/export"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Export CSV
          </a>
          {canEdit && (
            <>
              <Link href="/sales/leads/form-settings" className="text-sm text-brand-700 hover:underline">
                Form Settings
              </Link>
              <AddLeadPanel />
            </>
          )}
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" method="GET">
        <input
          type="search"
          name="q"
          placeholder="Search by name, email, or phone"
          defaultValue={q ?? ""}
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="source"
          defaultValue={source ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">All sources</option>
          {Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Filter
        </button>
        {(q || source) && (
          <Link
            href="/sales/leads"
            className="rounded-md px-4 py-2 text-sm font-medium text-neutral-500 hover:underline"
          >
            Clear
          </Link>
        )}

        <div className="ml-auto flex overflow-hidden rounded-md border border-neutral-300 text-sm">
          <Link
            href={{
              pathname: "/sales/leads",
              query: { ...(q ? { q } : {}), ...(source ? { source } : {}) },
            }}
            className={`px-3 py-2 font-medium ${!mineOnly ? "bg-brand-600 text-white" : "text-neutral-700 hover:bg-neutral-50"}`}
          >
            All
          </Link>
          <Link
            href={{
              pathname: "/sales/leads",
              query: { ...(q ? { q } : {}), ...(source ? { source } : {}), assigned: "mine" },
            }}
            className={`px-3 py-2 font-medium ${mineOnly ? "bg-brand-600 text-white" : "text-neutral-700 hover:bg-neutral-50"}`}
          >
            Mine
          </Link>
        </div>
      </form>

      <LeadPipelineBoard columns={columns} />

      {lostCount > 0 && (
        <p className="mt-6 text-sm text-neutral-400">
          <Link href="/sales/leads/lost" className="text-brand-700 hover:underline">
            {lostCount} lost lead{lostCount === 1 ? "" : "s"}
          </Link>{" "}
          not shown here.
        </p>
      )}

      {funnel.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
          <p className="mb-3 font-medium text-neutral-900">Leads by Source (All Time)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Open</th>
                  <th className="py-2 pr-4">Won</th>
                  <th className="py-2 pr-4">Lost</th>
                  <th className="py-2 pr-4">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((s) => (
                  <tr key={s.source} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-neutral-900">{s.label}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.total}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.open}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.won}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.lost}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.winRatePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Win rate is won / (won + lost) — open leads aren&apos;t counted either way yet.
          </p>
        </div>
      )}
    </div>
  );
}
