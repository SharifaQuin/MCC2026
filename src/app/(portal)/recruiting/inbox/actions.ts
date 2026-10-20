"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { sendInterviewInvite } from "@/lib/recruiting";
import { rejectApplicantAction, setApplicantStageAction } from "../applicants/actions";
import { getTrueActorId } from "@/lib/impersonation";
import type { InterviewFormat } from "@prisma/client";

export async function inviteToInterviewAction(
  applicantId: string,
  interviewerId: string,
  format: InterviewFormat
) {
  await requireRecruitingAccess();
  const result = await sendInterviewInvite(applicantId, interviewerId, format);
  if (!result.ok) throw new Error(result.error);
  revalidatePath("/recruiting/inbox");
  revalidatePath(`/recruiting/applicants/${applicantId}`);
  revalidatePath("/recruiting");
}

// The direct-booking counterpart to inviteToInterviewAction's "pick your own
// time" link — lets staff enter an already-agreed date/time themselves
// instead of only being able to send a self-schedule invite. Reuses
// setApplicantStageAction for the actual stage/scheduledAt/pipeline-count
// effects, including its own Zoom-config validation and (for every role,
// Office Assistant included) the automatic candidate confirmation.
export async function bookZoomInterviewAction(applicantId: string, scheduledAtLocal: string) {
  const { session, canEdit } = await requireRecruitingAccess();
  if (!canEdit) throw new Error("Not authorized to make changes here.");

  await setApplicantStageAction(
    applicantId,
    "PHONE_INTERVIEW_SCHEDULED",
    scheduledAtLocal,
    getTrueActorId(session)
  );
  revalidatePath("/recruiting/inbox");

  const applicant = await prisma.applicant.findUniqueOrThrow({
    where: { id: applicantId },
    select: { scheduledAt: true },
  });
  return { scheduledAt: applicant.scheduledAt!.toISOString() };
}

// "Pass" from the Quick Review card is the same rejection the full pipeline
// already supports — reused directly rather than re-implemented. Sends the
// existing warm rejection email by default; a recruiter who wants the silent
// variant (spam/duplicate) can still do that from the full profile.
export async function passApplicantAction(applicantId: string) {
  await requireRecruitingAccess();
  await rejectApplicantAction(applicantId, true);
  revalidatePath("/recruiting/inbox");
}
