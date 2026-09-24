"use server";

import { revalidatePath } from "next/cache";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { sendInterviewInvite } from "@/lib/recruiting";
import { rejectApplicantAction } from "../applicants/actions";

export async function inviteToInterviewAction(applicantId: string) {
  await requireRecruitingAccess();
  await sendInterviewInvite(applicantId);
  revalidatePath("/recruiting/inbox");
  revalidatePath(`/recruiting/applicants/${applicantId}`);
  revalidatePath("/recruiting");
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
