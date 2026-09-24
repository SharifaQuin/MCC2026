import { prisma } from "@/lib/prisma";
import { listOpenInterviewSlots } from "@/lib/recruiting";
import { formatInBusinessTimezone } from "@/lib/timezone";
import Logo from "@/components/Logo";
import BookingForm from "./BookingForm";

export default async function InterviewBookPage({ params }: { params: { token: string } }) {
  const applicant = await prisma.applicant.findUnique({
    where: { interviewConfirmToken: params.token },
    include: { jobPosting: { select: { id: true, titleEn: true } } },
  });

  const validState = applicant && applicant.stage === "INTERVIEW_INVITE_SENT";
  const slots = validState
    ? (await listOpenInterviewSlots(applicant!.jobPosting.id)).map((s) => ({
        id: s.id,
        label: formatInBusinessTimezone(new Date(s.startsAt)),
      }))
    : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" withTagline />
        </div>

        {!validState ? (
          <p className="text-sm text-neutral-500">
            This booking link is no longer valid — your interview may already be scheduled, or this
            invitation has expired. Please contact us if you have any questions.
          </p>
        ) : (
          <>
            <p className="mb-1 text-sm text-neutral-500">{applicant!.jobPosting.titleEn}</p>
            <p className="mb-5 text-lg font-bold text-brand-800">
              Hi {applicant!.firstName}! Pick a time that works for you.
            </p>
            <BookingForm token={params.token} slots={slots} />
          </>
        )}
      </div>
    </main>
  );
}
