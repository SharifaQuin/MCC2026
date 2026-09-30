// MCC Slot Booking Recommender — scoring engine.
//
// Ported from the owner-supplied slotRecommender.js reference implementation.
// Reads the currently-loaded monthly capacity feed (SlotFeedMonth/SlotFeedDate)
// plus any live SlotBooking rows, and ranks day+window options for a new
// lead's address by route efficiency, profit, and repeat-visit fit.
//
// Open capacity is computed at read time (feed capacity minus active
// SlotBooking rows for that date/block) rather than mutated on the feed
// rows, so re-importing a month never loses or double-counts an engine
// booking — see the SlotBooking model comment in schema.prisma.

import { prisma } from "@/lib/prisma";

export const DEFAULT_CONFIG = {
  weights: { route: 0.55, profit: 0.3, recurrence: 0.15 },
  crewSize: 2,
  loadedCostPerHour: 28.09,
  mileageRatePerMile: null as number | null,
  roadFactor: 1.3,
  avgMph: 28,
  onRouteMinutes: 10,
  minorDetourMinutes: 20,
  maxResults: 3,
  officeCoords: null as { lat: number; lng: number } | null,
};

const BLOCK_ORDER = ["Morning", "Midday", "Afternoon"] as const;
type Block = (typeof BLOCK_ORDER)[number];
const ADJACENT: Record<Block, Block[]> = {
  Morning: ["Morning", "Midday"],
  Midday: ["Morning", "Midday", "Afternoon"],
  Afternoon: ["Midday", "Afternoon"],
};

// FREQ_DAYS keys match the pricing tool's own state.frequency vocabulary
// (onetime/weekly/biweekly/triweekly/monthly) plus the Lead.frequency
// vocabulary's two non-committal answers, which score as one-time —
// there's no repeat interval to check room against.
const FREQ_DAYS: Record<string, number | null> = {
  weekly: 7,
  biweekly: 14,
  triweekly: 21,
  monthly: 28,
  onetime: null,
  asneeded: null,
  unsure: null,
};

// Approximate city centers — FALLBACK ONLY. Every job in the same city
// scores as 0 minutes away; swap in a real geocoder (Google Maps / Mapbox)
// before relying on this for real routing decisions.
const CITY_CENTROIDS: Record<string, [number, number]> = {
  Irvine: [33.6846, -117.8265],
  "Huntington Beach": [33.6603, -117.9992],
  "Laguna Beach": [33.5427, -117.7854],
  "Laguna Niguel": [33.5225, -117.7076],
  "Laguna Hills": [33.6125, -117.712],
  "Mission Viejo": [33.6, -117.672],
  "Lake Forest": [33.6469, -117.6861],
  "Corona Del Mar": [33.6003, -117.8726],
  "Newport Beach": [33.6189, -117.9289],
  "Costa Mesa": [33.6411, -117.9187],
  Tustin: [33.7459, -117.8262],
  "Rancho Santa Margarita": [33.6409, -117.6031],
  "Aliso Viejo": [33.5676, -117.7256],
  "San Clemente": [33.427, -117.612],
  "Dana Point": [33.4672, -117.6981],
  "Ladera Ranch": [33.5708, -117.6364],
  "Laguna Woods": [33.6103, -117.7253],
  "San Juan Capistrano": [33.5017, -117.6625],
  "Long Beach": [33.7701, -118.1937],
  Anaheim: [33.8366, -117.9143],
  "Foothill Ranch": [33.6864, -117.6609],
};

export type LatLng = { lat: number; lng: number; approximate?: boolean };

export interface GeoAdapter {
  geocode(address: string): Promise<LatLng | null>;
  driveMinutes(
    a: LatLng,
    b: LatLng,
    cfg: typeof DEFAULT_CONFIG
  ): Promise<{ minutes: number; miles: number }>;
}

export function cityFromAddress(address: string): string {
  const parts = String(address)
    .split(",")
    .map((s) => s.trim());
  return parts.length > 1 ? parts[1] : "";
}

function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Ship-with-caveat default (BUILD_SPEC §7 explicitly allows this for v1,
// flagged). Swap for a real provider (Google Maps Geocoding + Distance
// Matrix, cached) before this matters for a real dispatch decision.
export const fallbackGeo: GeoAdapter = {
  async geocode(address: string): Promise<LatLng | null> {
    const c = CITY_CENTROIDS[cityFromAddress(address)];
    return c ? { lat: c[0], lng: c[1], approximate: true } : null;
  },
  async driveMinutes(a, b, cfg) {
    const miles = haversineMiles(a, b) * cfg.roadFactor;
    return { minutes: (miles / cfg.avgMph) * 60, miles };
  },
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function prettyDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

type FeedBlocks = Record<Block, { open: number; windows: string[] }>;
type BookedJob = {
  block: string;
  window: string;
  city: string;
  address: string;
  coords?: LatLng | null;
};

interface DateRow {
  date: string; // YYYY-MM-DD
  weekday: string;
  status: string;
  openPersonHours: number;
  openDollars: number;
  blocks: FeedBlocks;
  bookedJobs: BookedJob[];
}

export interface RecommendInput {
  month: string; // "2026-10"
  address: string;
  quote?: { price?: number; personHours?: number; frequency?: string };
  today?: string;
  constraints?: {
    weekdays?: string[];
    blocks?: string[];
    earliest?: string;
    latest?: string;
  };
  geo?: GeoAdapter;
  config?: Partial<typeof DEFAULT_CONFIG>;
}

export interface RecommendCard {
  date: string;
  weekday: string;
  block: string;
  window: string;
  headline: string;
  routeTier: "On route" | "Minor detour" | "Off route";
  addedDriveMinutes: number;
  nearestJobCity: string | null;
  nearestJobWindow: string | null;
  estDriveCost: number;
  windowValuePerHour: number | null;
  dayStatus: string;
  dayOpenHours: number;
  repeatNote: string | null;
  script: string;
  // Assembled rep-facing reason line (BUILD_SPEC §4's worked example): drive
  // context + window profit + this city's history on this weekday.
  reason: string;
  // internal-only — never send to a rep-role response
  score: number;
}

export interface RecommendResult {
  lead: { address: string; city: string; personHours: number };
  results: RecommendCard[];
  warnings: string[];
}

/** Currently-booked engine holds/confirms for a date+block, minus expired holds. */
async function activeBookingsForMonth(month: string) {
  const now = new Date();
  const rows = await prisma.slotBooking.findMany({
    where: {
      month,
      OR: [
        { status: "CONFIRMED" },
        { status: "HOLD", holdExpiresAt: { gt: now } },
      ],
    },
  });
  return rows;
}

/** Load the currently-loaded feed for a month, folded with live engine bookings. */
async function loadFeed(month: string): Promise<{
  settings: any;
  windowValuePerHour: Record<string, number>;
  routeBoard: Record<string, Record<string, number>>;
  dates: DateRow[];
} | null> {
  const feedMonth = await prisma.slotFeedMonth.findUnique({
    where: { month },
    include: { dates: true },
  });
  if (!feedMonth) return null;

  const active = await activeBookingsForMonth(month);
  const byDate = new Map<string, typeof active>();
  for (const b of active) {
    const key = b.date.toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(b);
  }

  const dates: DateRow[] = feedMonth.dates.map((d) => {
    const iso = d.date.toISOString().slice(0, 10);
    const blocks = JSON.parse(JSON.stringify(d.blocks)) as FeedBlocks;
    const feedBooked = (d.bookedJobs as unknown as BookedJob[]) || [];
    const engineBooked = (byDate.get(iso) || []).map((b) => ({
      block: b.block,
      window: b.window,
      city: b.city,
      address: b.address,
    }));

    let openPersonHours = d.openPersonHours;
    let openDollars = d.openDollars;
    for (const b of byDate.get(iso) || []) {
      if (blocks[b.block as Block]) blocks[b.block as Block].open = Math.max(0, blocks[b.block as Block].open - 1);
      openPersonHours = Math.max(0, openPersonHours - b.personHours);
    }
    const pace = feedMonth.settings && (feedMonth.settings as any).pace_per_person_hour;
    if (pace) openDollars = Math.max(0, Math.round(openPersonHours * pace * 100) / 100);

    return {
      date: iso,
      weekday: d.weekday,
      status: d.status,
      openPersonHours,
      openDollars,
      blocks,
      bookedJobs: [...feedBooked, ...engineBooked],
    };
  });

  return {
    settings: feedMonth.settings,
    windowValuePerHour: feedMonth.windowValuePerHour as Record<string, number>,
    routeBoard: feedMonth.routeBoard as Record<string, Record<string, number>>,
    dates,
  };
}

export async function recommendSlots(input: RecommendInput): Promise<RecommendResult> {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...input.config,
    weights: { ...DEFAULT_CONFIG.weights, ...(input.config?.weights || {}) },
  };
  const geo = input.geo || fallbackGeo;
  const quote = input.quote || {};
  const constraints = input.constraints || {};

  const feed = await loadFeed(input.month);
  if (!feed) {
    return {
      lead: { address: input.address, city: cityFromAddress(input.address), personHours: 0 },
      results: [],
      warnings: [`No capacity feed loaded for ${input.month} yet.`],
    };
  }

  const pace = feed.settings.pace_per_person_hour;
  const todayIso = input.today || new Date().toISOString().slice(0, 10);
  const earliest = constraints.earliest || addDays(todayIso, feed.settings.min_lead_days ?? 1);
  const leadCity = cityFromAddress(input.address);
  const lead = await geo.geocode(input.address);
  const warnings: string[] = [];
  if (!lead) warnings.push("Could not locate this address — route scoring is off; check the address.");
  else if (lead.approximate) warnings.push("Using approximate city location (real geocoder not connected).");

  const personHours = quote.personHours || (quote.price ? quote.price / pace : 3);
  const freqKey = (quote.frequency || "onetime").toLowerCase();
  const interval = FREQ_DAYS[freqKey] ?? null;

  const wv = feed.windowValuePerHour;
  const vals = Object.values(wv);
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const profitScore = (w: string) => (vMax > vMin ? ((wv[w] ?? vMin) - vMin) / (vMax - vMin) : 1);

  const byDate = new Map(feed.dates.map((d) => [d.date, d]));
  const fits = (d: DateRow | undefined, block: Block) =>
    !!d && !!d.blocks[block] && d.blocks[block].open > 0 && d.openPersonHours >= personHours;

  const candidates: (RecommendCard & { _sortDriveMinutes: number; _sortOpenHours: number })[] = [];

  for (const d of feed.dates) {
    if (d.date < earliest || (constraints.latest && d.date > constraints.latest)) continue;
    if (constraints.weekdays && !constraints.weekdays.includes(d.weekday)) continue;

    for (const block of BLOCK_ORDER) {
      if (constraints.blocks && !constraints.blocks.includes(block)) continue;
      if (!fits(d, block)) continue;

      let nearest: { minutes: number; city: string; window: string | null } | null = null;
      if (lead) {
        const neighbors = d.bookedJobs.filter((j) => ADJACENT[block].includes(j.block as Block));
        const pool = neighbors.length ? neighbors : d.bookedJobs;
        for (const j of pool) {
          const coords = j.coords || (await geo.geocode(j.address));
          if (!coords) continue;
          const r = await geo.driveMinutes(lead, coords, cfg);
          if (!nearest || r.minutes < nearest.minutes) {
            nearest = { minutes: r.minutes, city: j.city, window: j.window };
          }
        }
        if (!nearest && cfg.officeCoords) {
          const r = await geo.driveMinutes(lead, cfg.officeCoords, cfg);
          nearest = { minutes: r.minutes, city: "office", window: null };
        }
      }
      const added = nearest ? nearest.minutes : 45;
      const routeScore = Math.max(0, Math.min(1, 1 - added / 30));
      const tier: RecommendCard["routeTier"] =
        added <= cfg.onRouteMinutes ? "On route" : added <= cfg.minorDetourMinutes ? "Minor detour" : "Off route";
      const driveCost = (added / 60) * cfg.crewSize * cfg.loadedCostPerHour;

      let recurrenceScore = 1;
      let repeatNote: string | null = null;
      if (interval) {
        let ok = 0;
        let total = 0;
        let n = d.date;
        for (let i = 0; i < 6; i++) {
          n = addDays(n, interval);
          const nd = byDate.get(n);
          if (!nd) {
            repeatNote = `Repeat visits after ${prettyDate(addDays(n, -interval))} fall in next month — confirm when next month's slots load.`;
            break;
          }
          total++;
          if (fits(nd, block)) ok++;
        }
        recurrenceScore = total ? ok / total : 1;
        if (total && ok < total) {
          repeatNote = `Only ${ok} of ${total} repeat visits this month have room in the ${block.toLowerCase()} block.`;
        }
      }

      const cityHistory = (feed.routeBoard[leadCity] || {})[d.weekday] || 0;

      for (const window of d.blocks[block].windows) {
        const w = cfg.weights;
        const score = w.route * routeScore + w.profit * profitScore(window) + w.recurrence * recurrenceScore;
        const wPerHr = wv[window];

        const reasonParts: string[] = [];
        reasonParts.push(
          nearest
            ? `${Math.round(added)} min from ${nearest.city === "office" ? "the office" : `a ${nearest.city} job`}${nearest.window ? ` at ${nearest.window}` : ""}`
            : `${Math.round(added)} min — no other jobs running this day to route around`
        );
        if (typeof wPerHr === "number") reasonParts.push(`this window earns $${Math.round(wPerHr)}/hr`);
        if (cityHistory > 0) reasonParts.push(`${leadCity} runs ${cityHistory} job${cityHistory === 1 ? "" : "s"} on ${d.weekday}s`);

        candidates.push({
          date: d.date,
          weekday: d.weekday,
          block,
          window,
          headline: `${prettyDate(d.date)} · ${window}`,
          routeTier: tier,
          addedDriveMinutes: Math.round(added),
          nearestJobCity: nearest ? nearest.city : null,
          nearestJobWindow: nearest ? nearest.window : null,
          estDriveCost: Math.round(driveCost * 100) / 100,
          windowValuePerHour: wPerHr ?? null,
          dayStatus: d.status,
          dayOpenHours: d.openPersonHours,
          repeatNote,
          reason: reasonParts.join(" · "),
          script: `We have an opening ${prettyDate(d.date)}, arrival window ${window}.`,
          score: Math.round(score * 100) / 100,
          _sortDriveMinutes: added,
          _sortOpenHours: d.openPersonHours,
        });
      }
    }
  }

  candidates.sort(
    (a, b) => b.score - a.score || a._sortDriveMinutes - b._sortDriveMinutes || b._sortOpenHours - a._sortOpenHours
  );

  const seen = new Set<string>();
  const results: RecommendCard[] = [];
  for (const c of candidates) {
    if (seen.has(c.date)) continue;
    seen.add(c.date);
    const { _sortDriveMinutes, _sortOpenHours, ...card } = c;
    results.push(card);
    if (results.length >= cfg.maxResults) break;
  }
  if (!results.length) {
    warnings.push("No open slot fits this job this month — offer next month or ask the owner about overtime.");
  }

  return {
    lead: { address: input.address, city: leadCity, personHours: Math.round(personHours * 10) / 10 },
    results,
    warnings,
  };
}

export const HOLD_MINUTES = 15;

export interface HoldSlotInput {
  month: string;
  date: string; // YYYY-MM-DD
  block: string;
  window: string;
  city: string;
  address: string;
  personHours: number;
  price?: number;
  frequency?: string;
  leadId?: string;
  repId: string;
}

/**
 * Re-checks availability (another rep may have just taken the same slot)
 * then creates a 15-minute HOLD. Deliberately re-derives capacity from the
 * feed + live bookings rather than trusting whatever the client last saw.
 */
export async function holdSlot(input: HoldSlotInput): Promise<{ ok: true; bookingId: string; holdExpiresAt: Date } | { ok: false; reason: string }> {
  return prisma.$transaction(async (tx) => {
    const feedMonth = await tx.slotFeedMonth.findUnique({ where: { month: input.month } });
    if (!feedMonth) return { ok: false, reason: "No capacity feed loaded for this month." };

    const feedDate = await tx.slotFeedDate.findUnique({
      where: { feedMonthId_date: { feedMonthId: feedMonth.id, date: new Date(input.date + "T00:00:00Z") } },
    });
    if (!feedDate) return { ok: false, reason: "Slot no longer available — re-run recommendations." };

    const now = new Date();
    const active = await tx.slotBooking.findMany({
      where: {
        month: input.month,
        date: new Date(input.date + "T00:00:00Z"),
        OR: [{ status: "CONFIRMED" }, { status: "HOLD", holdExpiresAt: { gt: now } }],
      },
    });

    const blocks = feedDate.blocks as Record<string, { open: number; windows: string[] }>;
    const blockDef = blocks[input.block];
    if (!blockDef) return { ok: false, reason: "Slot no longer available — re-run recommendations." };

    const bookedInBlock = active.filter((b) => b.block === input.block).length;
    const openInBlock = blockDef.open - bookedInBlock;
    const usedHours = active.reduce((s, b) => s + b.personHours, 0);
    const openHours = feedDate.openPersonHours - usedHours;

    if (openInBlock <= 0 || openHours < input.personHours) {
      return { ok: false, reason: "Slot no longer available — re-run recommendations." };
    }

    const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
    const booking = await tx.slotBooking.create({
      data: {
        month: input.month,
        date: new Date(input.date + "T00:00:00Z"),
        block: input.block,
        window: input.window,
        city: input.city,
        address: input.address,
        leadId: input.leadId,
        repId: input.repId,
        personHours: input.personHours,
        price: input.price,
        frequency: input.frequency,
        status: "HOLD",
        holdExpiresAt,
      },
    });

    return { ok: true, bookingId: booking.id, holdExpiresAt };
  });
}

/** Set/clear the rep's "entered in TCS" checkbox; first check confirms the hold. */
export async function setEnteredInTcs(bookingId: string, entered: boolean) {
  const booking = await prisma.slotBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false as const, reason: "Booking not found." };

  const now = new Date();
  const isExpiredHold = booking.status === "HOLD" && booking.holdExpiresAt && booking.holdExpiresAt < now;
  if (isExpiredHold) return { ok: false as const, reason: "This hold already released — re-book the slot." };

  await prisma.slotBooking.update({
    where: { id: bookingId },
    data: {
      enteredTcsAt: entered ? now : null,
      status: entered ? "CONFIRMED" : booking.status,
      confirmedAt: entered && !booking.confirmedAt ? now : booking.confirmedAt,
    },
  });
  return { ok: true as const };
}
