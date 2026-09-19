import { prisma } from "@/lib/prisma";
import { SCHEDULING_STAGES, STAGE_LABELS } from "@/lib/recruiting";
import { formatInBusinessTimezone } from "@/lib/timezone";
import Logo from "@/components/Logo";
import { confirmInterviewAction, cantMakeInterviewAction } from "./actions";

export default async function InterviewConfirmPage({ params }: { params: { token: string } }) {
  const applicant = await prisma.applicant.findUnique({
    where: { interviewConfirmToken: params.token },
    include: { jobPosting: { select: { titleEn: true } } },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" withTagline />
        </div>

        {!applicant || !(SCHEDULING_STAGES as string[]).includes(applicant.stage) || !applicant.scheduledAt ? (
          <p className="text-sm text-neutral-500">
            This link is no longer valid — your interview may have been rescheduled. Please
            contact us if you have any questions.
          </p>
        ) : (
          <>
            <p className="mb-1 text-sm text-neutral-500">
              {STAGE_LABELS[applicant.stage]} — {applicant.jobPosting.titleEn}
            </p>
            <p className="mb-6 text-lg font-semibold text-neutral-900">
              {formatInBusinessTimezone(applicant.scheduledAt)} Pacific Time
            </p>

            {applicant.interviewCantMakeItAt ? (
              <p className="rounded-md bg-neutral-100 p-3 text-sm text-neutral-600">
                Thanks for letting us know, {applicant.firstName} — someone from our team will
                reach out to reschedule.
              </p>
            ) : applicant.interviewConfirmedAt ? (
              <>
                <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                  You're all set, {applicant.firstName} — we've got you confirmed. See you then!
                </p>
                <form action={cantMakeInterviewAction.bind(null, params.token)} className="mt-4">
                  <button type="submit" className="text-xs text-neutral-400 underline hover:text-neutral-600">
                    Something come up? Let us know you can't make it
                  </button>
                </form>
              </>
            ) : (
              <div className="space-y-2">
                <form action={confirmInterviewAction.bind(null, params.token)}>
                  <button
                    type="submit"
                    className="w-full rounded-md bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Yes, I'll be there!
                  </button>
                </form>
                <form action={cantMakeInterviewAction.bind(null, params.token)}>
                  <button
                    type="submit"
                    className="w-full rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    I can't make it
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
