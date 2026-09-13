import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import {
  loadRecruitingDashboard,
  getApplicantFunnelBySource,
  PIPELINE_COLUMNS,
  NEEDS_DECISION_STAGES,
  ARCHIVED_STAGES,
  STAGE_LABELS,
} from "@/lib/recruiting";
import PipelineBoard from "./PipelineBoard";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

export default async function RecruitingPage() {
  await requireRecruitingAccess();

  const [stats, funnelBySource, applicants] = await Promise.all([
    loadRecruitingDashboard(),
    getApplicantFunnelBySource(),
    prisma.applicant.findMany({
      where: { stage: { notIn: [...NEEDS_DECISION_STAGES, ...ARCHIVED_STAGES] } },
      include: { jobPosting: { select: { titleEn: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const columns = PIPELINE_COLUMNS.map((col) => ({
    ...col,
    applicants: applicants
      .filter((a) => a.stage === col.stage)
      .map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        jobPostingTitle: a.jobPosting.titleEn,
        prescreenScore: a.prescreenScore,
        prescreenMaxScore: a.prescreenMaxScore,
        stage: a.stage,
        scheduledAt: a.scheduledAt ? a.scheduledAt.toISOString() : null,
        viewedAt: a.viewedAt ? a.viewedAt.toISOString() : null,
      })),
  }));

  const needsDecisionCount = Object.entries(stats.counts)
    .filter(([stage]) => (NEEDS_DECISION_STAGES as string[]).includes(stage))
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/hr" className="text-sm text-brand-700 hover:underline">
            ← Back to HR
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Recruiting Pipeline</h1>
        </div>
        <div className="flex gap-3">
          <Link
            href="/recruiting/applicants/new"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Add Applicant
          </Link>
          <Link
            href="/recruiting/applicants"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            All Applicants
          </Link>
          <Link
            href="/recruiting/postings"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Job Postings
          </Link>
          <a
            href="/careers"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            View Careers Page ↗
          </a>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Active Applicants" value={stats.active} />
        <Stat label="Awaiting Scheduling" value={stats.awaitingScheduling} />
        <Stat label="Interviews Scheduled" value={stats.scheduledInterviews} />
        <Stat label="Offers Out" value={stats.offersOut} />
        <Stat label="Hired" value={stats.hired} />
      </div>

      <PipelineBoard columns={columns} />

      {funnelBySource.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
          <p className="mb-3 font-medium text-neutral-900">Applicants by Source</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 pr-4">Hired</th>
                  <th className="py-2 pr-4">Rejected</th>
                  <th className="py-2 pr-4">Benched</th>
                  <th className="py-2 pr-4">Hire Rate</th>
                </tr>
              </thead>
              <tbody>
                {funnelBySource.map((s) => (
                  <tr key={s.source} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-neutral-900">{s.label}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.total}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.active}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.hired}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.rejected}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.benched}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.hireRatePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Reflects each applicant&apos;s current stage — a rejected/benched applicant&apos;s prior
            progress isn&apos;t tracked separately from their final outcome.
          </p>
        </div>
      )}

      {(needsDecisionCount > 0 || stats.benched > 0) && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 font-medium text-amber-800">Needs a decision</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {NEEDS_DECISION_STAGES.filter((s) => (stats.counts[s] ?? 0) > 0).map((s) => (
              <Link
                key={s}
                href={`/recruiting/applicants?stage=${s}`}
                className="rounded-full bg-white px-3 py-1 font-medium text-amber-800 hover:underline"
              >
                {STAGE_LABELS[s]} ({stats.counts[s]})
              </Link>
            ))}
            {stats.benched > 0 && (
              <Link
                href="/recruiting/applicants?stage=BENCH"
                className="rounded-full bg-white px-3 py-1 font-medium text-amber-800 hover:underline"
              >
                Benched ({stats.benched})
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
