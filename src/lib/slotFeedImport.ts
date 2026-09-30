// Validates and imports the owner's monthly mcc-open-slots/v1 capacity feed.
// Re-importing a month replaces that month's SlotFeedMonth/SlotFeedDate rows
// wholesale — SlotBooking (engine-made bookings) is untouched and keeps
// subtracting from whatever feed is currently loaded (see slotRecommender.ts).

import { prisma } from "@/lib/prisma";

const BLOCK_NAMES = ["Morning", "Midday", "Afternoon"] as const;

export interface ParsedFeedSummary {
  month: string;
  dateCount: number;
  totalOpenDollars: number;
  totalOpenPersonHours: number;
  replacesExisting: boolean;
}

function fail(msg: string): never {
  throw new Error(msg);
}

export interface ValidatedFeed {
  schema: string;
  month: string;
  generated_at: string;
  settings: Record<string, unknown>;
  window_value_per_hour: Record<string, number>;
  route_board: Record<string, Record<string, number>>;
  dates: Array<{
    date: string;
    weekday: string;
    status: string;
    open_dollars: number;
    open_person_hours: number;
    blocks: Record<string, { open: number; windows: string[] }>;
    booked: Array<{ block: string; window: string; city: string; address: string }>;
  }>;
}

function validateFeed(data: any): asserts data is ValidatedFeed {
  if (!data || typeof data !== "object") fail("File is not a JSON object.");
  if (data.schema !== "mcc-open-slots/v1") fail(`Unrecognized schema "${data.schema}" — expected "mcc-open-slots/v1".`);
  if (typeof data.month !== "string" || !/^\d{4}-\d{2}$/.test(data.month)) fail('"month" must look like "2026-10".');
  if (!data.generated_at) fail('Missing "generated_at".');
  if (!data.settings || typeof data.settings !== "object") fail('Missing "settings".');
  if (typeof data.settings.pace_per_person_hour !== "number") fail('"settings.pace_per_person_hour" must be a number.');
  if (!data.window_value_per_hour || typeof data.window_value_per_hour !== "object") fail('Missing "window_value_per_hour".');
  if (!data.route_board || typeof data.route_board !== "object") fail('Missing "route_board".');
  if (!Array.isArray(data.dates) || data.dates.length === 0) fail('"dates" must be a non-empty array.');

  for (const d of data.dates) {
    if (typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) fail(`Bad date "${d.date}" — expected "YYYY-MM-DD".`);
    if (typeof d.weekday !== "string") fail(`Date ${d.date} is missing "weekday".`);
    if (typeof d.status !== "string") fail(`Date ${d.date} is missing "status".`);
    if (typeof d.open_person_hours !== "number") fail(`Date ${d.date} is missing "open_person_hours".`);
    if (typeof d.open_dollars !== "number") fail(`Date ${d.date} is missing "open_dollars".`);
    if (!d.blocks || typeof d.blocks !== "object") fail(`Date ${d.date} is missing "blocks".`);
    for (const b of BLOCK_NAMES) {
      if (!d.blocks[b]) continue; // a block can legitimately be absent
      if (typeof d.blocks[b].open !== "number") fail(`Date ${d.date}, block ${b} is missing "open".`);
      if (!Array.isArray(d.blocks[b].windows)) fail(`Date ${d.date}, block ${b} is missing "windows".`);
    }
    if (d.booked && !Array.isArray(d.booked)) fail(`Date ${d.date}'s "booked" must be an array.`);
  }
}

export async function parseAndValidateFeed(raw: string): Promise<{ data: ValidatedFeed; summary: ParsedFeedSummary }> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    fail("Not valid JSON.");
  }
  validateFeed(data);

  const existing = await prisma.slotFeedMonth.findUnique({ where: { month: data.month } });
  const totalOpenDollars = data.dates.reduce((s, d) => s + d.open_dollars, 0);
  const totalOpenPersonHours = data.dates.reduce((s, d) => s + d.open_person_hours, 0);

  return {
    data,
    summary: {
      month: data.month,
      dateCount: data.dates.length,
      totalOpenDollars: Math.round(totalOpenDollars * 100) / 100,
      totalOpenPersonHours: Math.round(totalOpenPersonHours * 100) / 100,
      replacesExisting: !!existing,
    },
  };
}

export async function importFeed(data: ValidatedFeed, importedById: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.slotFeedMonth.findUnique({ where: { month: data.month } });
    if (existing) {
      await tx.slotFeedMonth.delete({ where: { id: existing.id } });
    }
    await tx.slotFeedMonth.create({
      data: {
        month: data.month,
        schema: data.schema,
        generatedAt: new Date(data.generated_at),
        settings: data.settings as object,
        windowValuePerHour: data.window_value_per_hour,
        routeBoard: data.route_board,
        importedById,
        dates: {
          create: data.dates.map((d) => ({
            date: new Date(d.date + "T00:00:00Z"),
            weekday: d.weekday,
            status: d.status,
            openPersonHours: d.open_person_hours,
            openDollars: d.open_dollars,
            blocks: d.blocks,
            bookedJobs: d.booked || [],
          })),
        },
      },
    });
  });
}
