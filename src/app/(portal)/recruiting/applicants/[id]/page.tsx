import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { STAGE_LABELS, SCHEDULING_STAGES } from "@/lib/recruiting";
import { formatInBusinessTimezone } from "@/lib/timezone";
import { saveApplicantNotesAction } from "../actions";
import StageControls from "./StageControls";
import CommunicationPanel from "./CommunicationPanel";

export default async function ApplicantDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { duplicate?: string };
}) {
  await requireRecruitingAccess();

  const applicant = await prisma.applicant.findUnique({
    where: { id: params.id },
    include: {
      jobPosting: { select: { titleEn: true } },
      hiredUser: { select: { id: true, name: true } },
      answers: {
        include: { question: true, option: true },
      },
      communications: {
        orderBy: { createdAt: "desc" },
        include: { sentBy: { select: { name: true } } },
      },
    },
  });

  if (!applicant) {
    return <p className="text-neutral-500">Applicant not found.</p>;
  }

  const commHistory = applicant.communications.map((c) => ({
    id: c.id,
    channel: c.channel,
    direction: c.direction,
    subject: c.subject,
    body: c.body,
    status: c.status,
    errorMessage: c.errorMessage,
    createdAt: c.createdAt.toISOString(),
    sentByName: c.sentBy?.name ?? null,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recruiting/applicants" className="text-sm text-brand-700 hover:underline">
        ← Back to Applicants
      </Link>

      {searchParams.duplicate === "1" && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          An applicant with this email was already on file for this posting, so we brought you
          to their existing profile instead of creating a duplicate.
        </div>
      )}

      {applicant.hiredUser && (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Hired — training account created.{" "}
          <Link
            href={`/admin/employees/${applicant.hiredUser.id}`}
            className="font-medium hover:underline"
          >
            View {applicant.hiredUser.name}&apos;s employee profile →
          </Link>
        </div>
      )}

      {applicant.scheduledAt && (SCHEDULING_STAGES as string[]).includes(applicant.stage) && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {STAGE_LABELS[applicant.stage]}: {formatInBusinessTimezone(applicant.scheduledAt)} PT
        </div>
      )}

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
              <dd className="flex items-center gap-3">
                <a
                  href={applicant.resumeDataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  View{applicant.resumeFileName ? ` (${applicant.resumeFileName})` : ""}
                </a>
                <a
                  href={applicant.resumeDataUrl}
                  download={applicant.resumeFileName ?? "resume"}
                  className="text-xs text-neutral-500 hover:underline"
                >
                  Download
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mb-6">
        <CommunicationPanel applicantId={applicant.id} history={commHistory} />
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
