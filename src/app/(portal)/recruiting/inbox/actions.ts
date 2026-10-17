"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { sendInterviewInvite } from "@/lib/recruiting";
import { rejectApplicantAction, setApplicantStageAction } from "../applicants/actions";
import { isZoomConfigured } from "@/lib/recruitingZoom";

export async function inviteToInterviewAction(applicantId: string) {
  await requireRecruitingAccess();
  await sendInterviewInvite(applicantId);
  revalidatePath("/recruiting/inbox");
  revalidatePath(`/recruiting/applicants/${applicantId}`);
  revalidatePath("/recruiting");
}

// The direct-booking counterpart to inviteToInterviewAction's "pick your own
// time" link — lets staff enter an already-agreed date/time themselves
// instead of only being able to send a self-schedule invite. Reuses
// setApplicantStageAction for the actual stage/scheduledAt/pipeline-count
// effects (see its own comment for why an Office Assistant's booking never
// triggers the automatic candidate email/calendar invite that would hand
// out Shar's real Zoom passcode with no review).
export async function bookZoomInterviewAction(applicantId: string, scheduledAtLocal: string) {
  const { canEdit } = await requireRecruitingAccess();
  if (!canEdit) throw new Error("Not authorized to make changes here.");

  // Without a configured Zoom room there's nothing to give the candidate to
  // join with — refuse the booking outright rather than schedule an
  // interview with no way to attend it.
  if (!isZoomConfigured()) {
    throw new Error(
      "Zoom isn't set up yet — ask Shar to configure the Zoom room (RECRUITING_ZOOM_PMI or RECRUITING_ZOOM_LINK) before booking interviews."
    );
  }

  await setApplicantStageAction(applicantId, "PHONE_INTERVIEW_SCHEDULED", scheduledAtLocal);
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
