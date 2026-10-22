import { prisma } from "@/lib/prisma";
import { zonedTimeToUtc } from "@/lib/timezone";
import { isZoomConfigured } from "@/lib/recruitingZoom";
import type { InterviewFormat } from "@prisma/client";

// ── Per-interviewer recurring availability ──
// Each interviewer owns exactly one InterviewerAvailability row (their own
// timezone, interview length, buffers, and which formats they can
// conduct), plus any number of recurring weekly windows and one-off date
// exceptions. This is deliberately separate from "who's editing an
// applicant right now" — ownership here is always the real interviewer
// (interviewerId), never whoever happens to be the acting session.
//
// Deliberately free of any session/auth import (requireOwnAvailabilityAccess
// lives in the availability route's interviewerActions.ts instead): this
// file is imported by src/lib/recruiting.ts, which a client component
// (InterviewTab.tsx) also imports a plain value from — pulling in
// next/headers transitively here would break that client bundle.

export async function getAvailabilityForInterviewer(interviewerId: string) {
  return prisma.interviewerAvailability.findUnique({
    where: { interviewerId },
    include: {
      weeklyHours: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
      exceptions: { orderBy: { date: "asc" } },
    },
  });
}

// Every interviewer who has actually configured at least one recurring
// weekly window — used to populate the "assign to" picker when sending a
// self-schedule invite or booking directly. Never includes someone who
// simply holds a role that could theoretically interview; an unconfigured
// account offers no real hours to show a candidate, and nothing here ever
// guesses or auto-activates hours on anyone's behalf.
export async function listEligibleInterviewers() {
  const rows = await prisma.interviewerAvailability.findMany({
    where: { weeklyHours: { some: {} } },
    include: { interviewer: { select: { id: true, name: true, role: true, active: true } } },
  });
  return rows
    .filter((r) => r.interviewer.active)
    .map((r) => ({
      id: r.interviewer.id,
      name: r.interviewer.name,
      role: r.interviewer.role,
      timezone: r.timezone,
      durationMins: r.durationMins,
      supportsZoom: r.supportsZoom,
      supportsInPerson: r.supportsInPerson,
    }));
}

export function parseTimeToMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function dateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function weekdayInZone(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Subtracts [cutStart, cutEnd) from a list of [start, end) windows (all in
// minutes-from-midnight), splitting a window in two if the cut lands in
// its middle.
function subtractInterval(
  windows: Array<{ start: number; end: number }>,
  cutStart: number,
  cutEnd: number
): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  for (const w of windows) {
    if (cutEnd <= w.start || cutStart >= w.end) {
      result.push(w);
      continue;
    }
    if (cutStart > w.start) result.push({ start: w.start, end: Math.min(cutStart, w.end) });
    if (cutEnd < w.end) result.push({ start: Math.max(cutStart, w.start), end: w.end });
  }
  return result;
}

export interface GeneratedSlot {
  startsAt: Date;
  durationMins: number;
}

// The core slot-generation engine: turns one interviewer's recurring hours
// + date exceptions into a flat list of real, bookable start times over the
// next few weeks, filtering out anything that would collide with an
// already-booked appointment.
//
// Buffer handling: an existing booked appointment blocks
// [start - bufferBefore, end + bufferAfter] using *this* interviewer's own
// buffer settings — including, for a Zoom-format request, every other
// interviewer's existing Zoom appointments too, since they all share the
// one Zoom room. This is a best-effort, same-process guard against two
// dashboard-known interviews colliding; it does not — and cannot — see
// conflicts that exist only on an interviewer's personal/external calendar,
// since nothing in this app reads from one.
export async function computeAvailableSlots(
  interviewerId: string,
  format: InterviewFormat,
  opts: { excludeApplicantId?: string; horizonDays?: number } = {}
): Promise<GeneratedSlot[]> {
  const availability = await getAvailabilityForInterviewer(interviewerId);
  if (!availability) return [];
  if (format === "ZOOM" && (!availability.supportsZoom || !isZoomConfigured())) return [];
  if (format === "IN_PERSON" && !availability.supportsInPerson) return [];
  if (availability.weeklyHours.length === 0) return [];

  const duration = availability.durationMins;
  const bufferBeforeMs = availability.bufferBeforeMins * 60_000;
  const bufferAfterMs = availability.bufferAfterMins * 60_000;
  const horizonDays = opts.horizonDays ?? 21;

  const existing = await prisma.interviewAvailabilitySlot.findMany({
    where: {
      bookedById: { not: null },
      startsAt: { gt: new Date() },
      ...(opts.excludeApplicantId ? { NOT: { bookedById: opts.excludeApplicantId } } : {}),
      OR: [{ interviewerId }, ...(format === "ZOOM" ? [{ format: "ZOOM" as const }] : [])],
    },
    select: { startsAt: true, durationMins: true },
  });
  const blockedRanges = existing.map((e) => ({
    start: e.startsAt.getTime() - bufferBeforeMs,
    end: e.startsAt.getTime() + e.durationMins * 60_000 + bufferAfterMs,
  }));

  const exceptionsByDate = new Map<string, typeof availability.exceptions>();
  for (const ex of availability.exceptions) {
    const key = dateKeyInZone(ex.date, "UTC");
    const list = exceptionsByDate.get(key) ?? [];
    list.push(ex);
    exceptionsByDate.set(key, list);
  }

  const now = Date.now();
  const results: GeneratedSlot[] = [];

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
    const probe = new Date(now + dayOffset * 86_400_000);
    const dateKey = dateKeyInZone(probe, availability.timezone);
    const weekday = weekdayInZone(dateKey);
    const dayExceptions = exceptionsByDate.get(dateKey) ?? [];

    if (dayExceptions.some((e) => e.type === "UNAVAILABLE" && e.startMinute === null)) {
      continue;
    }

    let windows = availability.weeklyHours
      .filter((h) => h.dayOfWeek === weekday)
      .map((h) => ({ start: h.startMinute, end: h.endMinute }));

    for (const ex of dayExceptions) {
      if (ex.type === "EXTRA_HOURS" && ex.startMinute !== null && ex.endMinute !== null) {
        windows.push({ start: ex.startMinute, end: ex.endMinute });
      }
    }
    for (const ex of dayExceptions) {
      if (ex.type === "UNAVAILABLE" && ex.startMinute !== null && ex.endMinute !== null) {
        windows = subtractInterval(windows, ex.startMinute, ex.endMinute);
      }
    }

    for (const w of windows) {
      for (let startMin = w.start; startMin + duration <= w.end; startMin += duration) {
        const startsAt = zonedTimeToUtc(`${dateKey}T${minutesToHHMM(startMin)}`, availability.timezone);
        if (startsAt.getTime() <= now) continue;
        const candEnd = startsAt.getTime() + duration * 60_000;
        const collides = blockedRanges.some((r) => startsAt.getTime() < r.end && candEnd > r.start);
        if (collides) continue;
        results.push({ startsAt, durationMins: duration });
      }
    }
  }

  return results.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
