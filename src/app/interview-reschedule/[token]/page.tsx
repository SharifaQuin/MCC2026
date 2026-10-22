import { prisma } from "@/lib/prisma";
import { SCHEDULING_STAGES, listOpenSlotsForApplicant } from "@/lib/recruiting";
import { formatInBusinessTimezone } from "@/lib/timezone";
import Logo from "@/components/Logo";
import BookingForm from "@/app/interview-book/[token]/BookingForm";
import { rescheduleInterviewSlotAction } from "./actions";

export default async function InterviewReschedulePage({ params }: { params: { token: string } }) {
  const applicant = await prisma.applicant.findUnique({
    where: { interviewConfirmToken: params.token },
    include: { jobPosting: { select: { titleEn: true } } },
  });

  // Self-service reschedule is only offered when the appointment actually
  // carries an assigned interviewer + format — an older appointment booked
  // before that existed falls back to "contact us", same as it always has.
  const eligible =
    applicant &&
    (SCHEDULING_STAGES as string[]).includes(applicant.stage) &&
    applicant.scheduledAt &&
    applicant.interviewerId &&
    applicant.interviewFormat &&
    !applicant.interviewCantMakeItAt;

  const slots = eligible
    ? (
        await listOpenSlotsForApplicant(applicant!.interviewerId!, applicant!.interviewFormat!, applicant!.id)
      ).map((s) => ({ id: s.id, label: formatInBusinessTimezone(new Date(s.startsAt)) }))
    : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" withTagline />
        </div>

        {!eligible ? (
          <p className="text-sm text-neutral-500">
            This link is no longer valid, or this interview can&apos;t be rescheduled online — please contact us
            if you need to change your time.
          </p>
        ) : (
          <>
            <p className="mb-1 text-sm text-neutral-500">{applicant!.jobPosting.titleEn}</p>
            <p className="mb-5 text-lg font-bold text-brand-800">
              Hi {applicant!.firstName}! Pick a new time that works for you.
            </p>
            <BookingForm
              token={params.token}
              slots={slots}
              action={rescheduleInterviewSlotAction}
              submitLabel="Confirm New Time"
              submitPendingLabel="Rescheduling…"
              successTitle="You're all set!"
              successDescription="We've updated your interview and sent you a fresh confirmation. See you then!"
            />
          </>
        )}
      </div>
    </main>
  );
}
