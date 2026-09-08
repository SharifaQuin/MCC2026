import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { STAGE_LABELS } from "@/lib/recruiting";

const STAGE_TONE: Record<string, string> = {
  NEW: "bg-neutral-100 text-neutral-600",
  PRESCREEN_FAILED: "bg-red-100 text-red-700",
  PRESCREEN_PASSED: "bg-green-100 text-green-700",
  PHONE_INTERVIEW_SCHEDULED: "bg-amber-100 text-amber-700",
  PHONE_INTERVIEW_PASSED: "bg-green-100 text-green-700",
  PHONE_INTERVIEW_FAILED: "bg-red-100 text-red-700",
  IN_PERSON_SCHEDULED: "bg-amber-100 text-amber-700",
  IN_PERSON_PASSED: "bg-green-100 text-green-700",
  IN_PERSON_FAILED: "bg-red-100 text-red-700",
  OFFER_SENT: "bg-brand-100 text-brand-700",
  HIRED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  BENCH: "bg-neutral-100 text-neutral-600",
};

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: { postingId?: string };
}) {
  await requireRecruitingAccess();

  const applicants = await prisma.applicant.findMany({
    where: searchParams.postingId ? { jobPostingId: searchParams.postingId } : undefined,
    include: { jobPosting: { select: { titleEn: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Applicants</h1>
        <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
          ← Back to Recruiting
        </Link>
      </div>

      {applicants.length === 0 ? (
        <p className="text-neutral-500">No applicants yet.</p>
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
