import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";

export default async function JobPostingsPage() {
  await requireRecruitingAccess();

  const postings = await prisma.jobPosting.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { applicants: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
            ← Back to Pipeline
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Job Postings</h1>
        </div>
        <Link
          href="/recruiting/postings/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New Job Posting
        </Link>
      </div>

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
