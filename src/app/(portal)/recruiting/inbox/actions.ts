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

  // setApplicantStageAction returns a result rather than throwing for its
  // own expected refusals (see its own comment) — re-thrown here so this
  // action's existing external contract (throw on failure, used by
  // ApplicantQuickCard's onBook) is unchanged.
  const result = await setApplicantStageAction(
    applicantId,
    "PHONE_INTERVIEW_SCHEDULED",
    scheduledAtLocal,
    getTrueActorId(session)
  );
  if (!result.ok) throw new Error(result.error);
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
// Office Assistant never has a "Pass" button to click (see
// ApplicantQuickCard's canPass) — rejectApplicantAction's own
// OFFICE_ASSISTANT guard still refuses a direct/forged call here too, as a
// result rather than a throw, so the real reason reaches the client even in
// production (see setApplicantStageAction's own comment on why).
export async function passApplicantAction(
  applicantId: string
): Promise<{ ok: boolean; error?: string }> {
  await requireRecruitingAccess();
  const result = await rejectApplicantAction(applicantId, true);
  if (result.ok) revalidatePath("/recruiting/inbox");
  return result;
}
