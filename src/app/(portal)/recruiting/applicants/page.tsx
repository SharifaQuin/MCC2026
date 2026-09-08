import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { STAGE_LABELS, STAGE_TONE } from "@/lib/recruiting";
import type { ApplicantStage } from "@prisma/client";

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: { postingId?: string; stage?: string };
}) {
  await requireRecruitingAccess();

  const applicants = await prisma.applicant.findMany({
    where: {
      ...(searchParams.postingId ? { jobPostingId: searchParams.postingId } : {}),
      ...(searchParams.stage ? { stage: searchParams.stage as ApplicantStage } : {}),
    },
    include: { jobPosting: { select: { titleEn: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Applicants{searchParams.stage ? `: ${STAGE_LABELS[searchParams.stage]}` : ""}
        </h1>
        <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
          ← Back to Pipeline
        </Link>
      </div>

      {applicants.length === 0 ? (
        <p className="text-neutral-500">No applicants here.</p>
      ) : (
        <ul className="space-y-2">
          {applicants.map((a) => (
            <li key={a.id}>
              <Link
                href={`/recruiting/applicants/${a.id}`}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
              >
                <div>
                  <p className="font-medium text-neutral-900">
                    {a.firstName} {a.lastName}
                  </p>
                  <p className="text-sm text-neutral-500">{a.jobPosting.titleEn}</p>
                  {a.prescreenScore !== null && (
                    <p className="mt-1 text-xs text-neutral-400">
                      Prescreen: {a.prescreenScore}/{a.prescreenMaxScore}
                    </p>
                  )}
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${STAGE_TONE[a.stage]}`}
                >
                  {STAGE_LABELS[a.stage]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
