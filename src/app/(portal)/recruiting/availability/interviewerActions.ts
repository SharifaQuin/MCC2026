"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { parseTimeToMinutes } from "@/lib/interviewerAvailability";
import type { AvailabilityExceptionType } from "@prisma/client";

async function requireOwnAvailabilityAccess(targetInterviewerId: string) {
  const { session, canEdit } = await requireRecruitingAccess();
  if (!canEdit) throw new Error("Not authorized to make changes here.");
  // Admin/Owner can manage anyone's schedule (e.g. setting it up on behalf
  // of a new interviewer); everyone else can only ever manage their own —
  // this is what "ownership separate from whoever last edits an applicant"
  // means in practice: holding RECRUITING edit access lets you touch
  // applicants, but never someone else's calendar.
  if (session.role !== "ADMIN" && session.sub !== targetInterviewerId) {
    throw new Error("You can only manage your own interview availability.");
  }
  return session;
}

export interface SaveAvailabilityConfigState {
  error?: string;
  success?: boolean;
}

export async function saveAvailabilityConfigAction(
  interviewerId: string,
  _prevState: SaveAvailabilityConfigState,
  formData: FormData
): Promise<SaveAvailabilityConfigState> {
  try {
    await requireOwnAvailabilityAccess(interviewerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authorized." };
  }

  const timezone = String(formData.get("timezone") ?? "").trim();
  const durationMins = parseInt(String(formData.get("durationMins") ?? "30"), 10);
  const bufferBeforeMins = parseInt(String(formData.get("bufferBeforeMins") ?? "0"), 10);
  const bufferAfterMins = parseInt(String(formData.get("bufferAfterMins") ?? "0"), 10);
  const supportsZoom = formData.get("supportsZoom") === "on";
  const supportsInPerson = formData.get("supportsInPerson") === "on";

  if (!timezone) return { error: "Please choose a timezone." };
  try {
    // Validates the IANA zone name — throws RangeError on garbage input.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: "That timezone isn't recognized." };
  }
  if (!Number.isFinite(durationMins) || durationMins < 5 || durationMins > 240) {
    return { error: "Interview length must be between 5 and 240 minutes." };
  }
  if (!Number.isFinite(bufferBeforeMins) || bufferBeforeMins < 0 || bufferBeforeMins > 120) {
    return { error: "Buffer before must be between 0 and 120 minutes." };
  }
  if (!Number.isFinite(bufferAfterMins) || bufferAfterMins < 0 || bufferAfterMins > 120) {
    return { error: "Buffer after must be between 0 and 120 minutes." };
  }
  if (!supportsZoom && !supportsInPerson) {
    return { error: "Pick at least one interview format you can conduct." };
  }

  await prisma.interviewerAvailability.upsert({
    where: { interviewerId },
    create: {
      interviewerId,
      timezone,
      durationMins,
      bufferBeforeMins,
      bufferAfterMins,
      supportsZoom,
      supportsInPerson,
    },
    update: { timezone, durationMins, bufferBeforeMins, bufferAfterMins, supportsZoom, supportsInPerson },
  });

  revalidatePath("/recruiting/availability");
  return { success: true };
}

export async function addWeeklyHourAction(
  interviewerId: string,
  _prevState: SaveAvailabilityConfigState,
  formData: FormData
): Promise<SaveAvailabilityConfigState> {
  try {
    await requireOwnAvailabilityAccess(interviewerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authorized." };
  }

  const availability = await prisma.interviewerAvailability.findUnique({ where: { interviewerId } });
  if (!availability) return { error: "Set up your general schedule settings first." };

  const dayOfWeek = parseInt(String(formData.get("dayOfWeek") ?? ""), 10);
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const startMinute = parseTimeToMinutes(startTime);
  const endMinute = parseTimeToMinutes(endTime);

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { error: "Please choose a day." };
  }
  if (startMinute === null || endMinute === null || endMinute <= startMinute) {
    return { error: "Please enter a valid start and end time, with end after start." };
  }

  await prisma.availabilityWeeklyHour.create({
    data: { availabilityId: availability.id, dayOfWeek, startMinute, endMinute },
  });

  revalidatePath("/recruiting/availability");
  return { success: true };
}

export async function deleteWeeklyHourAction(interviewerId: string, weeklyHourId: string) {
  await requireOwnAvailabilityAccess(interviewerId);
  const availability = await prisma.interviewerAvailability.findUnique({ where: { interviewerId } });
  if (!availability) return;
  await prisma.availabilityWeeklyHour.deleteMany({
    where: { id: weeklyHourId, availabilityId: availability.id },
  });
  revalidatePath("/recruiting/availability");
}

export async function addDateExceptionAction(
  interviewerId: string,
  _prevState: SaveAvailabilityConfigState,
  formData: FormData
): Promise<SaveAvailabilityConfigState> {
  try {
    await requireOwnAvailabilityAccess(interviewerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authorized." };
  }

  const availability = await prisma.interviewerAvailability.findUnique({ where: { interviewerId } });
  if (!availability) return { error: "Set up your general schedule settings first." };

  const dateStr = String(formData.get("date") ?? "");
  const type = String(formData.get("type") ?? "") as AvailabilityExceptionType;
  const wholeDay = formData.get("wholeDay") === "on";
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!dateStr) return { error: "Please pick a date." };
  if (type !== "UNAVAILABLE" && type !== "EXTRA_HOURS") return { error: "Invalid exception type." };

  let startMinute: number | null = null;
  let endMinute: number | null = null;
  if (type === "EXTRA_HOURS" || !wholeDay) {
    startMinute = parseTimeToMinutes(startTime);
    endMinute = parseTimeToMinutes(endTime);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      return { error: "Please enter a valid start and end time, with end after start." };
    }
  }

  const date = new Date(`${dateStr}T00:00:00.000Z`);
  await prisma.availabilityDateException.create({
    data: { availabilityId: availability.id, date, type, startMinute, endMinute, note },
  });

  revalidatePath("/recruiting/availability");
  return { success: true };
}

export async function deleteDateExceptionAction(interviewerId: string, exceptionId: string) {
  await requireOwnAvailabilityAccess(interviewerId);
  const availability = await prisma.interviewerAvailability.findUnique({ where: { interviewerId } });
  if (!availability) return;
  await prisma.availabilityDateException.deleteMany({
    where: { id: exceptionId, availabilityId: availability.id },
  });
  revalidatePath("/recruiting/availability");
}
