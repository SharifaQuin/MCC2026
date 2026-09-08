import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import {
  loadRecruitingDashboard,
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

  const [stats, applicants] = await Promise.all([
    loadRecruitingDashboard(),
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
