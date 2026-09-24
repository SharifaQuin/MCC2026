"use server";

import { prisma } from "@/lib/prisma";
import { bookInterviewSlot } from "@/lib/recruiting";

export interface BookSlotState {
  error?: string;
  success?: boolean;
}

// Public action — no session, no auth. The only thing standing in for
// authorization here is the unguessable interviewConfirmToken already
// embedded in the page, matching every other public applicant-facing
// action (confirm/decline) in this app.
export async function bookInterviewSlotAction(
  token: string,
  _prevState: BookSlotState,
  formData: FormData
): Promise<BookSlotState> {
  const slotId = String(formData.get("slotId") ?? "");
  if (!slotId) return { error: "Please choose a time." };

  const applicant = await prisma.applicant.findUnique({ where: { interviewConfirmToken: token } });
  if (!applicant) return { error: "This booking link is no longer valid." };

  const result = await bookInterviewSlot(applicant.id, slotId);
  if (!result.ok) return { error: result.error };

  // Deliberately no revalidatePath here: this page's token is single-use
  // and permanently invalid the instant booking succeeds, so there's
  // nothing to ever refresh it for — and revalidating would trigger Next's
  // automatic post-action route refresh, which re-renders the page's
  // server component with the (now-invalid) token and unmounts this form
  // before the success state above ever gets to render, showing the
  // candidate a confusing "link no longer valid" message on a booking
  // that actually succeeded.
  return { success: true };
}
