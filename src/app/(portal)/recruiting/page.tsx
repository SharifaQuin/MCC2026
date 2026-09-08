import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";

export default async function RecruitingPage() {
  await requireRecruitingAccess();

  const postings = await prisma.jobPosting.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { applicants: true } } },
  });

  const openApplicants = await prisma.applicant.count({
    where: { stage: { notIn: ["HIRED", "REJECTED", "BENCH"] } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recruiting</h1>
        <div className="flex gap-3">
          <Link
            href="/recruiting/applicants"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            All Applicants ({openApplicants} open)
          </Link>
          <Link
            href="/recruiting/postings/new"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New Job Posting
          </Link>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-medium text-neutral-900">Job Postings</h2>
      {postings.length === 0 ? (
        <p className="text-neutral-500">
          No job postings yet. Create one to get an application link you can post on Indeed or
          ZipRecruiter.
        </p>
      ) : (
        <ul className="space-y-3">
          {postings.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div>
                <Link
                  href={`/recruiting/postings/${p.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {p.titleEn}
                </Link>
                {p.positionType && <p className="text-sm text-neutral-500">{p.positionType}</p>}
                <p className="mt-1 text-xs text-neutral-400">
                  {p._count.applicants} applicant{p._count.applicants === 1 ? "" : "s"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  p.active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {p.active ? "Accepting Applications" : "Closed"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
