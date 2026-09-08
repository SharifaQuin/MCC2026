import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { STAGE_LABELS } from "@/lib/recruiting";
import { saveApplicantNotesAction } from "../actions";
import StageControls from "./StageControls";

export default async function ApplicantDetailPage({ params }: { params: { id: string } }) {
  await requireRecruitingAccess();

  const applicant = await prisma.applicant.findUnique({
    where: { id: params.id },
    include: {
      jobPosting: { select: { titleEn: true } },
      answers: {
        include: { question: true, option: true },
      },
    },
  });

  if (!applicant) {
    return <p className="text-neutral-500">Applicant not found.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recruiting/applicants" className="text-sm text-brand-700 hover:underline">
        ← Back to Applicants
      </Link>

      <div className="mb-6 mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {applicant.firstName} {applicant.lastName}
          </h1>
          <p className="text-neutral-500">{applicant.jobPosting.titleEn}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
          {STAGE_LABELS[applicant.stage]}
        </span>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-400">Email</dt>
            <dd>{applicant.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Phone</dt>
            <dd>{applicant.phone}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Applied</dt>
            <dd>{applicant.createdAt.toLocaleDateString()}</dd>
          </div>
          {applicant.resumeDataUrl && (
            <div>
              <dt className="text-neutral-400">Resume</dt>
              <dd>
                <a
                  href={applicant.resumeDataUrl}
                  download={applicant.resumeFileName ?? "resume"}
                  className="text-brand-700 hover:underline"
                >
                  {applicant.resumeFileName || "Download"}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {applicant.prescreenScore !== null && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-neutral-900">
            Prescreen Score: {applicant.prescreenScore}/{applicant.prescreenMaxScore}{" "}
            <span className={applicant.prescreenPassed ? "text-green-700" : "text-red-700"}>
              ({applicant.prescreenPassed ? "Passed" : "Below threshold"})
            </span>
          </h2>
          <ul className="space-y-2 text-sm">
            {applicant.answers.map((a) => (
              <li key={a.id}>
                <p className="text-neutral-500">{a.question.textEn}</p>
                <p className="font-medium text-neutral-900">
                  {a.option.textEn} ({a.option.points} pts)
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Move Applicant</h2>
        <StageControls applicantId={applicant.id} stage={applicant.stage} />
      </div>

      <form
        action={saveApplicantNotesAction.bind(null, applicant.id)}
        className="rounded-lg border border-neutral-200 bg-white p-4"
      >
        <label className="mb-1 block text-sm font-medium text-neutral-700">Internal Notes</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={applicant.notes ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Save Notes
        </button>
      </form>
    </div>
  );
}
