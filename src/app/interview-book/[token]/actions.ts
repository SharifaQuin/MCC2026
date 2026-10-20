"use server";

import { prisma } from "@/lib/prisma";
import { bookInterviewSlot, bookAssignedInterviewSlot } from "@/lib/recruiting";

export interface BookSlotState {
  error?: string;
  success?: boolean;
}

// Public action — no session, no auth. The only thing standing in for
// authorization here is the unguessable interviewConfirmToken already
// embedded in the page, matching every other public applicant-facing
// action (confirm/decline) in this app. Legacy path — only reached when the
// applicant has no assigned interviewer (an invite sent before per-
// interviewer availability existed).
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

// The interviewer-assigned counterpart — `slotId` here is actually the
// slot's ISO startsAt (see listOpenSlotsForApplicant), since these slots
// are generated on the fly rather than pre-existing rows to look up by id.
export async function bookAssignedInterviewSlotAction(
  token: string,
  _prevState: BookSlotState,
  formData: FormData
): Promise<BookSlotState> {
  const startsAtIso = String(formData.get("slotId") ?? "");
  if (!startsAtIso) return { error: "Please choose a time." };

  const applicant = await prisma.applicant.findUnique({ where: { interviewConfirmToken: token } });
  if (!applicant) return { error: "This booking link is no longer valid." };

  const result = await bookAssignedInterviewSlot(applicant.id, startsAtIso);
  if (!result.ok) return { error: result.error };

  return { success: true };
}
