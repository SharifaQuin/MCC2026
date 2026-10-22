"use server";

import { prisma } from "@/lib/prisma";
import { rescheduleAssignedInterview } from "@/lib/recruiting";
import type { BookSlotState } from "@/app/interview-book/[token]/actions";

// Public action — same token-based authorization idiom as every other
// applicant-facing public action in this app (book/confirm/decline).
export async function rescheduleInterviewSlotAction(
  token: string,
  _prevState: BookSlotState,
  formData: FormData
): Promise<BookSlotState> {
  const startsAtIso = String(formData.get("slotId") ?? "");
  if (!startsAtIso) return { error: "Please choose a time." };

  const applicant = await prisma.applicant.findUnique({ where: { interviewConfirmToken: token } });
  if (!applicant) return { error: "This link is no longer valid." };

  const result = await rescheduleAssignedInterview(applicant.id, startsAtIso);
  if (!result.ok) return { error: result.error };

  return { success: true };
}
