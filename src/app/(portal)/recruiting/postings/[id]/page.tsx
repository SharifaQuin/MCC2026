import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { updateJobPostingAction } from "../../actions";
import PrescreenQuestionEditor from "./PrescreenQuestionEditor";

export default async function JobPostingDetailPage({ params }: { params: { id: string } }) {
  await requireRecruitingAccess();

  const posting = await prisma.jobPosting.findUnique({
    where: { id: params.id },
    include: {
      prescreenQuestions: { include: { options: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
      _count: { select: { applicants: true } },
    },
  });

  if (!posting) {
    return <p className="text-neutral-500">Job posting not found.</p>;
  }

  const applyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/apply/${posting.slug}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
        ← Back to Recruiting
      </Link>
      <div className="mb-6 mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{posting.titleEn}</h1>
        <Link
          href={`/recruiting/applicants?postingId=${posting.id}`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          View Applicants ({posting._count.applicants})
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-brand-200 bg-brand-50 p-4">
        <p className="text-sm font-medium text-neutral-700">Application link — post this on Indeed / ZipRecruiter:</p>
        <p className="mt-1 break-all font-mono text-sm text-brand-700">{applyUrl}</p>
      </div>

      <form
        action={updateJobPostingAction.bind(null, posting.id)}
        className="mb-8 space-y-4 rounded-lg border border-neutral-200 bg-white p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Title</label>
          <input
            name="titleEn"
            defaultValue={posting.titleEn}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Position Type</label>
          <input
            name="positionType"
            defaultValue={posting.positionType ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Description</label>
          <textarea
            name="descriptionEn"
            rows={5}
            defaultValue={posting.descriptionEn}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Prescreen Pass Threshold (%)
          </label>
          <input
            type="number"
            name="passThresholdPct"
            defaultValue={posting.passThresholdPct}
            min={0}
            max={100}
            className="w-32 rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="active" defaultChecked={posting.active} className="h-4 w-4" />
          Accepting applications
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Save Changes
        </button>
      </form>

      <h2 className="mb-3 text-lg font-medium text-neutral-900">Prescreening Questions</h2>
      <PrescreenQuestionEditor jobPostingId={posting.id} questions={posting.prescreenQuestions} />
    </div>
  );
}
