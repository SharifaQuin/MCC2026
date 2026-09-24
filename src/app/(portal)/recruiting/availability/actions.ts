"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { zonedTimeToUtc } from "@/lib/timezone";

export interface CreateSlotState {
  error?: string;
}

// Deliberately minimal — Shar types in a specific date/time by hand, no
// recurrence, no calendar sync, no auto-generation. jobPostingId is
// optional and left blank by default so the everyday case is "general
// availability," not tied to any one posting (per the approved plan).
export async function createAvailabilitySlotAction(
  _prevState: CreateSlotState,
  formData: FormData
): Promise<CreateSlotState> {
  const { session } = await requireRecruitingAccess();

  const date = String(formData.get("slotDate") ?? "");
  const time = String(formData.get("slotTime") ?? "");
  const durationMins = parseInt(String(formData.get("durationMins") ?? "30"), 10) || 30;
  const jobPostingId = String(formData.get("jobPostingId") ?? "") || null;

  if (!date || !time) return { error: "Please pick a date and time." };

  const startsAt = zonedTimeToUtc(`${date}T${time}`);
  if (startsAt.getTime() <= Date.now()) return { error: "Please pick a time in the future." };

  const existing = await prisma.interviewAvailabilitySlot.findFirst({
    where: { startsAt, jobPostingId },
  });
  if (existing) return { error: "A slot already exists at that exact time." };

  await prisma.interviewAvailabilitySlot.create({
    data: { startsAt, durationMins, jobPostingId, createdById: session.sub },
  });

  revalidatePath("/recruiting/availability");
  return {};
}

export async function deleteAvailabilitySlotAction(slotId: string) {
  await requireRecruitingAccess();
  // Only ever deletes an unbooked slot — an already-booked one is a real
  // candidate's interview time and shouldn't disappear out from under them
  // via this list; cancelling a booked interview happens on the applicant's
  // own profile instead.
  await prisma.interviewAvailabilitySlot.deleteMany({ where: { id: slotId, bookedById: null } });
  revalidatePath("/recruiting/availability");
}
