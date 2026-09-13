import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import ResumeUpload from "@/components/ResumeUpload";
import { createManualApplicantAction } from "../actions";

export default async function NewApplicantPage({
  searchParams,
}: {
  searchParams: { postingId?: string };
}) {
  await requireRecruitingAccess();

  const postings = await prisma.jobPosting.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, titleEn: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recruiting/applicants" className="text-sm text-brand-700 hover:underline">
        ← Back to Applicants
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold">Add Applicant Manually</h1>
      <p className="mb-6 text-sm text-neutral-500">
        For a walk-in, referral, or anyone recruited outside the online application — a phone
        call, an in-person conversation. This skips the prescreening questions and adds them
        straight to the pipeline as a New Applicant.
      </p>

      {postings.length === 0 ? (
        <p className="text-neutral-500">
          You need at least one active job posting first.{" "}
          <Link href="/recruiting/postings/new" className="text-brand-700 hover:underline">
            Create one
          </Link>
          .
        </p>
      ) : (
        <form
          action={createManualApplicantAction}
          className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Job Posting *
            </label>
            <select
              name="jobPostingId"
              required
              defaultValue={searchParams.postingId ?? ""}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              <option value="" disabled>
                Select a posting
              </option>
              {postings.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titleEn}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                First Name *
              </label>
              <input
                name="firstName"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Last Name *
              </label>
              <input
                name="lastName"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Email *</label>
              <input
                type="email"
                name="email"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Phone *</label>
              <input
                type="tel"
                name="phone"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </div>
          </div>

          <ResumeUpload required={false} />

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Notes (optional)
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="How you connected with them, what they said, etc."
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add Applicant
          </button>
        </form>
      )}
    </div>
  );
}
