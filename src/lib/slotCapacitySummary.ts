// Summaries and the permanent lost-opportunity record for the MCC Slot
// Booking Recommender's monthly capacity feed. See schema.prisma's
// SlotCapacitySnapshot comment for why a passed date is snapshotted rather
// than computed live: its SlotFeedDate numbers disappear the moment the
// next month's (or a corrected) feed replaces them.

import { prisma } from "@/lib/prisma";
import { businessDateKey } from "@/lib/timezone";

/** Idempotent — snapshots every SlotFeedDate whose date has passed and isn't
 *  snapshotted yet. Safe to call as often as you like (scheduler tick). */
export async function snapshotPassedDates(now: Date = new Date()): Promise<number> {
  const todayIso = businessDateKey(now);
  const passed = await prisma.slotFeedDate.findMany({
    where: { date: { lt: new Date(todayIso + "T00:00:00Z") } },
    include: { feedMonth: { select: { month: true } } },
  });
  if (!passed.length) return 0;

  const already = await prisma.slotCapacitySnapshot.findMany({
    where: { OR: passed.map((d) => ({ month: d.feedMonth.month, date: d.date })) },
    select: { month: true, date: true },
  });
  const seen = new Set(already.map((s) => `${s.month}|${s.date.toISOString()}`));

  let written = 0;
  for (const d of passed) {
    const key = `${d.feedMonth.month}|${d.date.toISOString()}`;
    if (seen.has(key)) continue;

    const booked = await prisma.slotBooking.aggregate({
      where: { month: d.feedMonth.month, date: d.date, status: "CONFIRMED" },
      _sum: { price: true, personHours: true },
    });
    const bookedDollars = booked._sum.price || 0;
    const bookedPersonHours = booked._sum.personHours || 0;

    try {
      await prisma.slotCapacitySnapshot.create({
        data: {
          month: d.feedMonth.month,
          date: d.date,
          weekday: d.weekday,
          openDollarsAtImport: d.openDollars,
          openPersonHoursAtImport: d.openPersonHours,
          bookedDollars,
          bookedPersonHours,
          lostDollars: Math.max(0, d.openDollars - bookedDollars),
        },
      });
      written++;
    } catch {
      // unique constraint race (another tick beat us to it) — fine to skip
    }
  }
  return written;
}

export interface SlotCapacityMonthSummary {
  month: string;
  loaded: boolean;
  totalOpenDollars: number;
  openRemainingDollars: number; // still-fillable: today onward, live
  bookedDollars: number; // whole month to date, snapshot (past) + live (today/future)
  lostDollars: number; // past days only, from snapshots
  daysPassed: number;
  daysRemaining: number;
}

export async function getSlotCapacityMonthSummary(month: string, now: Date = new Date()): Promise<SlotCapacityMonthSummary> {
  const todayIso = businessDateKey(now);
  const todayDate = new Date(todayIso + "T00:00:00Z");

  const feedMonth = await prisma.slotFeedMonth.findUnique({
    where: { month },
    include: { dates: true },
  });
  if (!feedMonth) {
    return { month, loaded: false, totalOpenDollars: 0, openRemainingDollars: 0, bookedDollars: 0, lostDollars: 0, daysPassed: 0, daysRemaining: 0 };
  }

  const totalOpenDollars = feedMonth.dates.reduce((s, d) => s + d.openDollars, 0);
  const pastDates = feedMonth.dates.filter((d) => d.date < todayDate);
  const futureDates = feedMonth.dates.filter((d) => d.date >= todayDate);

  const snapshots = await prisma.slotCapacitySnapshot.findMany({ where: { month } });
  const snapByDate = new Map(snapshots.map((s) => [s.date.toISOString(), s]));

  let bookedDollars = 0;
  let lostDollars = 0;
  for (const d of pastDates) {
    const snap = snapByDate.get(d.date.toISOString());
    if (snap) {
      bookedDollars += snap.bookedDollars;
      lostDollars += snap.lostDollars;
    }
    // A past date with no snapshot yet (scheduler hasn't ticked since it
    // passed) is left out of both totals rather than guessed at — the next
    // tick fills it in within a minute.
  }

  const liveBooked = await prisma.slotBooking.aggregate({
    where: { month, date: { gte: todayDate }, status: { in: ["CONFIRMED", "HOLD"] } },
    _sum: { price: true },
  });
  bookedDollars += liveBooked._sum.price || 0;

  const futureOpenGross = futureDates.reduce((s, d) => s + d.openDollars, 0);
  const openRemainingDollars = Math.max(0, futureOpenGross - (liveBooked._sum.price || 0));

  return {
    month,
    loaded: true,
    totalOpenDollars: Math.round(totalOpenDollars * 100) / 100,
    openRemainingDollars: Math.round(openRemainingDollars * 100) / 100,
    bookedDollars: Math.round(bookedDollars * 100) / 100,
    lostDollars: Math.round(lostDollars * 100) / 100,
    daysPassed: pastDates.length,
    daysRemaining: futureDates.length,
  };
}

export interface SlotCapacityDayRow {
  date: string;
  weekday: string;
  status: string;
  openDollars: number;
  bookedDollars: number;
  lostDollars: number | null; // null until the date has passed and been snapshotted
  isPast: boolean;
}

export async function getSlotCapacityDayBreakdown(month: string, now: Date = new Date()): Promise<SlotCapacityDayRow[]> {
  const todayIso = businessDateKey(now);
  const todayDate = new Date(todayIso + "T00:00:00Z");

  const feedMonth = await prisma.slotFeedMonth.findUnique({ where: { month }, include: { dates: true } });
  if (!feedMonth) return [];

  const snapshots = await prisma.slotCapacitySnapshot.findMany({ where: { month } });
  const snapByDate = new Map(snapshots.map((s) => [s.date.toISOString(), s]));

  const liveBookings = await prisma.slotBooking.findMany({
    where: { month, status: { in: ["CONFIRMED", "HOLD"] } },
  });
  const liveByDate = new Map<string, number>();
  for (const b of liveBookings) {
    const key = b.date.toISOString();
    liveByDate.set(key, (liveByDate.get(key) || 0) + (b.price || 0));
  }

  return feedMonth.dates
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((d) => {
      const isPast = d.date < todayDate;
      const snap = snapByDate.get(d.date.toISOString());
      const bookedDollars = snap ? snap.bookedDollars : liveByDate.get(d.date.toISOString()) || 0;
      return {
        date: d.date.toISOString().slice(0, 10),
        weekday: d.weekday,
        status: d.status,
        openDollars: Math.round(d.openDollars * 100) / 100,
        bookedDollars: Math.round(bookedDollars * 100) / 100,
        lostDollars: snap ? Math.round(snap.lostDollars * 100) / 100 : isPast ? null : null,
        isPast,
      };
    });
}

const BLOCK_ORDER = ["Morning", "Midday", "Afternoon"] as const;

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface NextOpenSlot {
  date: string;
  weekday: string;
  block: string;
  window: string;
  teamsOpen: number;
  windowValuePerHour: number | null;
}

/** The soonest bookable block+window combos with room, earliest first —
 *  rep-safe fields only (no score/drive-cost/day-status; see BUILD_SPEC
 *  §4 on what managers see that reps don't). Mirrors the same "today +
 *  min_lead_days, active bookings subtracted" rules recommendSlots uses,
 *  but isn't scored against any one lead's address. */
export async function getNextOpenSlots(month: string, limit = 5, now: Date = new Date()): Promise<NextOpenSlot[]> {
  const feedMonth = await prisma.slotFeedMonth.findUnique({ where: { month } });
  if (!feedMonth) return [];

  const todayIso = businessDateKey(now);
  const minLeadDays = (feedMonth.settings as { min_lead_days?: number })?.min_lead_days ?? 1;
  const earliest = addDaysIso(todayIso, minLeadDays);
  const wv = feedMonth.windowValuePerHour as Record<string, number>;

  const dates = await prisma.slotFeedDate.findMany({
    where: { feedMonthId: feedMonth.id, date: { gte: new Date(earliest + "T00:00:00Z") } },
    orderBy: { date: "asc" },
  });
  if (!dates.length) return [];

  const active = await prisma.slotBooking.findMany({
    where: {
      month,
      date: { gte: new Date(earliest + "T00:00:00Z") },
      OR: [{ status: "CONFIRMED" }, { status: "HOLD", holdExpiresAt: { gt: now } }],
    },
  });
  const bookedByDateBlock = new Map<string, number>();
  for (const b of active) {
    const key = `${b.date.toISOString()}|${b.block}`;
    bookedByDateBlock.set(key, (bookedByDateBlock.get(key) || 0) + 1);
  }

  const results: NextOpenSlot[] = [];
  for (const d of dates) {
    const blocks = d.blocks as Record<string, { open: number; windows: string[] }>;
    for (const block of BLOCK_ORDER) {
      const blockDef = blocks[block];
      if (!blockDef) continue;
      const booked = bookedByDateBlock.get(`${d.date.toISOString()}|${block}`) || 0;
      const teamsOpen = blockDef.open - booked;
      if (teamsOpen <= 0) continue;
      for (const window of blockDef.windows) {
        results.push({
          date: d.date.toISOString().slice(0, 10),
          weekday: d.weekday,
          block,
          window,
          teamsOpen,
          windowValuePerHour: wv[window] ?? null,
        });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

/** Which month's feed the sales/reporting UI should treat as "current":
 *  this calendar month if loaded, else next month (the owner typically
 *  loads next month's feed during the last week of the prior month). */
export async function resolveActiveSlotMonth(now: Date = new Date()): Promise<string | null> {
  const todayIso = businessDateKey(now);
  const thisMonth = todayIso.slice(0, 7);
  const [y, m] = thisMonth.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  const found = await prisma.slotFeedMonth.findFirst({
    where: { month: { in: [thisMonth, next] } },
    orderBy: { month: "asc" },
  });
  return found ? found.month : null;
}
