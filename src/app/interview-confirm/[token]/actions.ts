"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { notifyStaffApplicantCantMakeIt } from "@/lib/recruiting";

export async function confirmInterviewAction(token: string) {
  const applicant = await prisma.applicant.findUnique({ where: { interviewConfirmToken: token } });
  if (!applicant || applicant.interviewConfirmedAt || applicant.interviewCantMakeItAt) return;

  await prisma.applicant.update({
    where: { id: applicant.id },
    data: { interviewConfirmedAt: new Date() },
  });

  revalidatePath(`/interview-confirm/${token}`);
  revalidatePath(`/recruiting/applicants/${applicant.id}`);
}

// Deliberately does NOT let the applicant pick a new time — it just flags
// this interview for a staffer to see and reach out, per how the owner
// wants rescheduling handled (never a self-service rebooking).
export async function cantMakeInterviewAction(token: string) {
  const applicant = await prisma.applicant.findUnique({
    where: { interviewConfirmToken: token },
    include: { jobPosting: { select: { titleEn: true } } },
  });
  if (!applicant || applicant.interviewCantMakeItAt || !applicant.scheduledAt) return;

  await prisma.applicant.update({
    where: { id: applicant.id },
    data: { interviewCantMakeItAt: new Date() },
  });

  await notifyStaffApplicantCantMakeIt(applicant, applicant.jobPosting.titleEn, applicant.scheduledAt);

  revalidatePath(`/interview-confirm/${token}`);
  revalidatePath(`/recruiting/applicants/${applicant.id}`);
}
