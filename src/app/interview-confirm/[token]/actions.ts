"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function confirmInterviewAction(token: string) {
  const applicant = await prisma.applicant.findUnique({ where: { interviewConfirmToken: token } });
  if (!applicant || applicant.interviewConfirmedAt) return;

  await prisma.applicant.update({
    where: { id: applicant.id },
    data: { interviewConfirmedAt: new Date() },
  });

  revalidatePath(`/interview-confirm/${token}`);
  revalidatePath(`/recruiting/applicants/${applicant.id}`);
}
