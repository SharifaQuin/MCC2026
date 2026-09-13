import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { STAGE_LABELS, STAGE_TONE } from "@/lib/recruiting";
import type { ApplicantStage } from "@prisma/client";

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: { postingId?: string; stage?: string; q?: string };
}) {
  await requireRecruitingAccess();

  const q = searchParams.q?.trim();

  const applicants = await prisma.applicant.findMany({
    where: {
      ...(searchParams.postingId ? { jobPostingId: searchParams.postingId } : {}),
      ...(searchParams.stage ? { stage: searchParams.stage as ApplicantStage } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
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
        <div className="flex items-center gap-4">
          <Link
            href="/recruiting/applicants/new"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Add Applicant Manually
          </Link>
          <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
            ← Back to Pipeline
          </Link>
        </div>
      </div>

      <form className="mb-4 flex gap-2" method="GET">
        {searchParams.postingId && (
          <input type="hidden" name="postingId" value={searchParams.postingId} />
        )}
        {searchParams.stage && <input type="hidden" name="stage" value={searchParams.stage} />}
        <input
          type="search"
          name="q"
          placeholder="Search by name or email"
          defaultValue={q ?? ""}
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Search
        </button>
        {q && (
          <Link
            href={{
              pathname: "/recruiting/applicants",
              query: {
                ...(searchParams.postingId ? { postingId: searchParams.postingId } : {}),
                ...(searchParams.stage ? { stage: searchParams.stage } : {}),
              },
            }}
            className="rounded-md px-4 py-2 text-sm font-medium text-neutral-500 hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

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
                  <p className="flex items-center gap-2 font-medium text-neutral-900">
                    {a.firstName} {a.lastName}
                    {a.viewedAt && (
                      <span
                        title={`Viewed ${new Date(a.viewedAt).toLocaleDateString()}`}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500"
                      >
                        Viewed
                      </span>
                    )}
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
