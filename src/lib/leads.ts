import { prisma } from "@/lib/prisma";
import type { LeadStage, LeadSource } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { postSlackDMToOwner } from "@/lib/slack";
import { csvEscape } from "@/lib/export";

// Mirrors the Pricing Calculator's SERVICES/SERVICE_LABELS in
// src/content/sales-pricing-tool.html exactly (same key strings) — a lead
// submitted with one of these services gets an auto-generated draft quote
// (see notifyNewLead's caller in the lead-form action) that opens straight
// into the calculator, pre-seeded with the same service. "commercial" is
// the one exception: there's no pricing logic for it in the tool at all,
// so it's shown for lead capture only — no minimum shown, no auto-quote.
export const LEAD_SERVICE_OPTIONS: {
  key: string;
  label: string;
  minPrice: number | null;
  sqftApplicable: boolean;
  inPricingTool: boolean;
}[] = [
  { key: "standard", label: "Standard Clean", minPrice: 200, sqftApplicable: true, inPricingTool: true },
  { key: "alacarte", label: "A la Carte", minPrice: null, sqftApplicable: false, inPricingTool: true },
  { key: "deep", label: "Top to Bottom Deep Clean", minPrice: 300, sqftApplicable: true, inPricingTool: true },
  { key: "movein", label: "Move In / Move Out", minPrice: 350, sqftApplicable: true, inPricingTool: true },
  { key: "construction", label: "Post Construction", minPrice: null, sqftApplicable: true, inPricingTool: true },
  { key: "housekeeping", label: "Housekeeping", minPrice: null, sqftApplicable: false, inPricingTool: true },
  { key: "airbnb", label: "Airbnb Turnover", minPrice: null, sqftApplicable: true, inPricingTool: true },
  { key: "commercial", label: "Commercial Cleaning", minPrice: null, sqftApplicable: false, inPricingTool: false },
];

export const LEAD_SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_SERVICE_OPTIONS.map((s) => [s.key, s.label])
);

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  WEBSITE_FORM: "Website Form",
  PHONE_CALL: "Phone Call",
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  GOOGLE_ADS: "Google Ads",
  FACEBOOK_ADS: "Facebook Ads",
  NEXTDOOR: "Nextdoor",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  CURRENT_CLIENT: "Current Client",
  LEAVE_BEHIND_CARD: "Leave-Behind Card",
  OTHER: "Other",
};

// The options shown on the public lead form's "How did you hear about us?"
// dropdown — a curated, ordered subset of LeadSource. Deliberately leaves
// out staff-only/manual-entry sources (PHONE_CALL, WALK_IN, GOOGLE_ADS,
// FACEBOOK_ADS) since those describe how *staff* logged a lead, not how a
// customer would describe discovering the business themselves.
export const LEAD_HOW_HEARD_OPTIONS: { value: string; label: string }[] = [
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "NEXTDOOR", label: "Nextdoor" },
  { value: "CURRENT_CLIENT", label: "Current Client" },
  { value: "REFERRAL", label: "Referral (friend/family)" },
  { value: "LEAVE_BEHIND_CARD", label: "Leave-Behind Card" },
  { value: "OTHER", label: "Other" },
];

const LEAD_SOURCE_ALIASES: Record<string, "GOOGLE_ADS" | "FACEBOOK_ADS" | "REFERRAL" | "NEXTDOOR" | "INSTAGRAM" | "FACEBOOK"> = {
  google: "GOOGLE_ADS",
  googleads: "GOOGLE_ADS",
  facebookads: "FACEBOOK_ADS",
  facebook: "FACEBOOK",
  fb: "FACEBOOK",
  referral: "REFERRAL",
  nextdoor: "NEXTDOOR",
  instagram: "INSTAGRAM",
  insta: "INSTAGRAM",
  ig: "INSTAGRAM",
};

// The public lead form always lives on the website, so it defaults to
// WEBSITE_FORM — a ?src= query param lets an ad campaign's landing link
// (pointing at the same embedded form) tag itself instead, the same way
// job-board postings tag /apply/[slug] via ?src=indeed. This is now only
// a fallback/pre-fill for the visible "How did you hear about us?"
// dropdown — the customer's own answer on submit is authoritative.
export function parseLeadSource(
  raw: string | null | undefined
): "WEBSITE_FORM" | "GOOGLE_ADS" | "FACEBOOK_ADS" | "REFERRAL" | "NEXTDOOR" | "INSTAGRAM" | "FACEBOOK" {
  const key = (raw ?? "").trim().toLowerCase();
  return LEAD_SOURCE_ALIASES[key] ?? "WEBSITE_FORM";
}

// Maps a ?src= campaign tag to a pre-selected option on the visible
// "How did you hear about us?" dropdown — only when it lands on one of the
// dropdown's own choices, so a paid-ads tag (which isn't a dropdown option)
// just leaves the field for the customer to fill in themselves.
export function guessHowHeardFromSrc(raw: string | null | undefined): string | null {
  const guess = parseLeadSource(raw);
  const isDropdownOption = LEAD_HOW_HEARD_OPTIONS.some((o) => o.value === guess);
  return isDropdownOption ? guess : null;
}

export const LEAD_STAGE_LABELS: Record<string, string> = {
  NEW_INQUIRY: "New Inquiry",
  CONTACTED: "Contacted",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
};

export const LEAD_STAGE_TONE: Record<string, string> = {
  NEW_INQUIRY: "bg-neutral-100 text-neutral-600",
  CONTACTED: "bg-amber-100 text-amber-700",
  QUOTED: "bg-brand-100 text-brand-700",
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
};

export const LEAD_PIPELINE_COLUMNS: { stage: LeadStage; label: string }[] = [
  { stage: "NEW_INQUIRY", label: "New Inquiry" },
  { stage: "CONTACTED", label: "Contacted" },
  { stage: "QUOTED", label: "Quoted" },
  { stage: "WON", label: "Won" },
];

export const ARCHIVED_LEAD_STAGES: LeadStage[] = ["LOST"];

// The one obvious "move it forward" action for each pipeline-board column —
// anything else (mark lost, jump stages) lives on the lead's own detail page.
export const PRIMARY_NEXT_LEAD_STAGE: Record<string, { stage: LeadStage; label: string } | undefined> = {
  NEW_INQUIRY: { stage: "CONTACTED", label: "Mark Contacted" },
  CONTACTED: { stage: "QUOTED", label: "Mark Quoted" },
  QUOTED: { stage: "WON", label: "Mark Won" },
};

// Pings the owner (email + best-effort Slack DM) whenever a new lead comes
// in from the public website form — response-time is a tracked KPI, so fast
// visibility matters here more than it does for most notifications.
// Best-effort: never blocks or throws, since a missed notification shouldn't
// fail the form submission itself.
export async function notifyNewLead(lead: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  serviceInterest: string | null;
  message: string | null;
  source?: LeadSource;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const profileUrl = `${appUrl}/sales/leads/${lead.id}`;
  const originLine =
    lead.source === "PHONE_CALL"
      ? `${lead.firstName} ${lead.lastName} was just logged from a phone call-in.`
      : `${lead.firstName} ${lead.lastName} just submitted the website lead form.`;
  const summaryLines = [
    originLine,
    "",
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    ...(lead.serviceInterest ? [`Interested in: ${lead.serviceInterest}`] : []),
    ...(lead.message ? ["", `Message: ${lead.message}`] : []),
    "",
    `View this lead: ${profileUrl}`,
  ];

  const notifyEmail = process.env.SALES_NOTIFY_EMAIL || process.env.MS_GRAPH_SENDER_EMAIL;
  if (notifyEmail) {
    try {
      await sendEmail({
        to: notifyEmail,
        subject: `New lead: ${lead.firstName} ${lead.lastName}`,
        body: summaryLines.join("\n"),
      });
    } catch {
      // Swallow — a notification failure should never break the lead form.
    }
  }

  await postSlackDMToOwner(
    [`:tada: New lead: *${lead.firstName} ${lead.lastName}*`, `<${profileUrl}|View lead>`].join("\n")
  );
}

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export interface AttentionLead {
  id: string;
  firstName: string;
  lastName: string;
  stage: LeadStage;
  reason: "new" | "overdue_followup";
  since: string; // createdAt for "new", followUpDueAt for "overdue_followup"
}

export interface LeadKpis {
  avgResponseHours: number | null; // NEW_INQUIRY -> firstContactedAt, last 30 days
  pipelineValue: number; // sum of estimatedValue for leads not yet Won/Lost
  openLeadCount: number;
  needsAttention: AttentionLead[];
  bySource: {
    source: string;
    label: string;
    leadCount: number;
    wonCount: number;
    amountSpent: number;
    costPerLead: number | null;
    costPerWon: number | null;
  }[];
}

export async function loadLeadKpis(): Promise<LeadKpis> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [respondedLeads, openLeads, newUncontacted, overdueFollowUps, monthSpend, leadsThisMonth] =
    await Promise.all([
      prisma.lead.findMany({
        where: { firstContactedAt: { not: null }, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, firstContactedAt: true },
      }),
      prisma.lead.findMany({
        where: { stage: { notIn: ["WON", "LOST"] } },
        select: { estimatedValue: true },
      }),
      // Every New Inquiry needs a first response, regardless of age — unlike
      // overdue follow-ups, this doesn't wait for someone to have set a due
      // date, since a brand-new lead nobody has touched yet is exactly the
      // case a due date wouldn't exist for.
      prisma.lead.findMany({
        where: { stage: "NEW_INQUIRY" },
        select: { id: true, firstName: true, lastName: true, stage: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.lead.findMany({
        where: {
          stage: { notIn: ["NEW_INQUIRY", "WON", "LOST"] },
          followUpDueAt: { not: null, lt: new Date() },
        },
        select: { id: true, firstName: true, lastName: true, stage: true, followUpDueAt: true },
        orderBy: { followUpDueAt: "asc" },
      }),
      prisma.leadSourceSpend.findMany({ where: { monthKey: currentMonthKey() } }),
      prisma.lead.groupBy({
        by: ["source", "stage"],
        _count: true,
        where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
    ]);

  const avgResponseHours = respondedLeads.length
    ? respondedLeads.reduce(
        (sum, l) => sum + (l.firstContactedAt!.getTime() - l.createdAt.getTime()) / 3_600_000,
        0
      ) / respondedLeads.length
    : null;

  const pipelineValue = openLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);

  const bySourceMap = new Map<LeadSource, { leadCount: number; wonCount: number }>();
  for (const row of leadsThisMonth) {
    const entry = bySourceMap.get(row.source) ?? { leadCount: 0, wonCount: 0 };
    entry.leadCount += row._count;
    if (row.stage === "WON") entry.wonCount += row._count;
    bySourceMap.set(row.source, entry);
  }
  const spendBySource = new Map(monthSpend.map((s) => [s.source, s.amountSpent]));
  const sources = new Set([...bySourceMap.keys(), ...spendBySource.keys()]);

  const bySource = Array.from(sources).map((source) => {
    const stats = bySourceMap.get(source) ?? { leadCount: 0, wonCount: 0 };
    const amountSpent = spendBySource.get(source) ?? 0;
    return {
      source,
      label: LEAD_SOURCE_LABELS[source] ?? source,
      leadCount: stats.leadCount,
      wonCount: stats.wonCount,
      amountSpent,
      costPerLead: amountSpent > 0 && stats.leadCount > 0 ? amountSpent / stats.leadCount : null,
      costPerWon: amountSpent > 0 && stats.wonCount > 0 ? amountSpent / stats.wonCount : null,
    };
  });

  const needsAttention: AttentionLead[] = [
    ...newUncontacted.map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      stage: l.stage,
      reason: "new" as const,
      since: l.createdAt.toISOString(),
    })),
    ...overdueFollowUps.map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      stage: l.stage,
      reason: "overdue_followup" as const,
      since: l.followUpDueAt!.toISOString(),
    })),
  ].sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());

  return {
    avgResponseHours,
    pipelineValue,
    openLeadCount: openLeads.length,
    needsAttention,
    bySource,
  };
}

// Proactive Slack nudge (src/lib/leadDigestScheduler.ts) so overdue/
// uncontacted leads don't sit unnoticed until someone happens to open the
// Sales dashboard — mirrors buildHrDigestMessage's format.
export function buildLeadDigestMessage(items: AttentionLead[]): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const lines = items.map((item) => {
    const label =
      item.reason === "new"
        ? `New — not yet contacted since ${new Date(item.since).toLocaleDateString()}`
        : `Follow-up overdue since ${new Date(item.since).toLocaleDateString()}`;
    return `• <${appUrl}/sales/leads/${item.id}|${item.firstName} ${item.lastName}> — ${label}`;
  });
  return [":email: *Leads Needing Attention*", "", ...lines].join("\n");
}

// Mirrors the Pricing Calculator's CITY_DATA keys in
// src/content/sales-pricing-tool.html exactly — used to best-effort match
// a submitted street address to one of its known cities (for the city
// premium) when auto-generating a quote. Falls back to "Other" (no
// premium) rather than guessing wrong.
const PRICING_TOOL_CITIES = [
  "Corona Del Mar",
  "Rancho Santa Margarita",
  "Laguna Beach",
  "Laguna Niguel",
  "Irvine",
  "Huntington Beach",
  "Costa Mesa",
  "Newport Beach",
  "Dana Point",
  "Mission Viejo",
  "Lake Forest",
  "San Clemente",
  "Aliso Viejo",
  "San Juan Capistrano",
  "Laguna Hills",
  "Tustin",
];

export function matchCityFromAddress(address: string | null): string {
  if (!address) return "Other";
  const lower = address.toLowerCase();
  const match = PRICING_TOOL_CITIES.find((city) => lower.includes(city.toLowerCase()));
  return match ?? "Other";
}

// Pulls a 5-digit ZIP out of a full address string ("123 Main St, Irvine,
// CA 92618") — depends on the lead form asking for the complete address
// including city and ZIP, not just a street address.
export function extractZipFromAddress(address: string | null): string {
  if (!address) return "";
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : "";
}

function slugifyQuoteId(clientName: string): string {
  const base = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const mmdd = `${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}`;
  return `${base || "lead"}-${mmdd}`;
}

// Auto-creates a draft quote (in the same SalesToolData "quote:<id>" shape
// the Pricing Calculator's saveQuoteForClient() writes) from a freshly
// submitted lead, so a real quote already exists and is linked (via the
// returned id, set as Lead.quoteKey) the moment staff open it — no price is
// computed here (that stays entirely inside the Pricing Calculator's own
// formula, so there's exactly one place that formula lives); this just
// seeds the inputs (service, sqft, city, contact info) so the calculator
// shows a live number the instant it's opened. Returns null for services
// with no pricing-tool formula (e.g. Commercial Cleaning).
export async function createDraftQuoteForLead(lead: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string | null;
  message: string | null;
  serviceKey: string;
  squareFootage: number | null;
}): Promise<string | null> {
  const serviceOption = LEAD_SERVICE_OPTIONS.find((s) => s.key === lead.serviceKey);
  if (!serviceOption || !serviceOption.inPricingTool) return null;

  const clientName = `${lead.firstName} ${lead.lastName}`.trim();
  const baseId = slugifyQuoteId(clientName);
  let id = baseId;
  // Avoid clobbering an existing quote of the same client-name+date.
  for (let suffix = 2; await prisma.salesToolData.findUnique({ where: { key: `quote:${id}` } }); suffix++) {
    id = `${baseId}-${suffix}`;
  }

  const city = matchCityFromAddress(lead.address);
  const sqft = serviceOption.sqftApplicable ? lead.squareFootage ?? 1800 : 1800;
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const quote = {
    clientName,
    id,
    phone: lead.phone,
    clientEmail: lead.email,
    zip: extractZipFromAddress(lead.address),
    city,
    address: lead.address ?? "",
    walkthroughDate: "",
    collectedVia: "leadform",
    collectedDate: today,
    service: lead.serviceKey,
    frequency: "One-Time",
    low: "",
    high: "",
    suggested: "",
    time: "",
    timeLowHrs: 0,
    timeHighHrs: 0,
    validUntil: "",
    addons: { linens: false, baseboards: false, laundry: false, fridge: false, oven: false, glass: false, pet: false },
    mailbox: "",
    sender: "",
    homeDetails: { bedrooms: 0, fullBaths: 0, halfBaths: 0, floorTypes: {}, floorDetails: "", notes: lead.message ?? "" },
    formState: {
      service: lead.serviceKey,
      sqft,
      condition: "moderate",
      frequency: "onetime",
      addons: {},
      areaQty: {},
      glassDoors: 0,
      hkHours: 4,
      hkTerm: "monthly",
      pcTeamSize: 2,
      airbnbFreq: 1,
      airbnbExtraLoads: 0,
      targetMargin: 21,
      firstTimeClient: true,
      bedrooms: 0,
      fullBaths: 0,
      halfBaths: 0,
      floorTypes: {},
      floorDetails: "",
      notes: lead.message ?? "",
      collectedVia: "leadform",
      collectedDate: today,
    },
    savedAt: nowIso,
    status: "pending",
    sentAt: null,
  };

  await prisma.salesToolData.create({ data: { key: `quote:${id}`, value: JSON.stringify(quote) } });
  return id;
}

interface CallInQuoteData {
  clientName?: string;
  phone?: string;
  clientEmail?: string;
  address?: string;
  service?: string;
  suggested?: string;
  collectedVia?: string;
  formState?: { sqft?: number };
}

// The reverse of createDraftQuoteForLead: a Called-In quote is created
// quote-first (a staff member takes the call and builds it straight in the
// Pricing Tool), so there's no Lead yet to auto-link the way a web-form
// submission gets one. The first time such a quote is saved with enough
// info to log a real lead (name, phone, email — skips half-filled drafts),
// this creates the matching Lead and links it via quoteKey immediately, so
// phone inquiries land in the pipeline and monthly lead tracking the same
// way website leads do. No-ops if a Lead is already linked to this quote.
export async function createLeadFromCallInQuote(quoteId: string, quoteData: CallInQuoteData, authorId: string | null) {
  if (quoteData.collectedVia !== "calledin") return null;
  if (!quoteData.clientName || !quoteData.phone || !quoteData.clientEmail) return null;

  const existing = await prisma.lead.findFirst({ where: { quoteKey: quoteId } });
  if (existing) return existing;

  const nameParts = quoteData.clientName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ");
  const sqft = quoteData.formState?.sqft;
  const suggested = quoteData.suggested ? parseFloat(quoteData.suggested) : NaN;

  const lead = await prisma.lead.create({
    data: {
      firstName,
      lastName,
      email: quoteData.clientEmail,
      phone: quoteData.phone,
      address: quoteData.address || null,
      source: "PHONE_CALL",
      serviceInterest: quoteData.service ? (LEAD_SERVICE_LABELS[quoteData.service] ?? quoteData.service) : null,
      squareFootage: typeof sqft === "number" && sqft > 0 ? sqft : null,
      // Starts at Quoted, not the default New Inquiry — a quote already
      // exists by the time this Lead is created, so "new inquiry" would
      // misrepresent where the deal actually is (and could wrongly trip
      // the stale-new-inquiry attention alert).
      stage: "QUOTED",
      estimatedValue: Number.isFinite(suggested) ? suggested : null,
      quoteKey: quoteId,
    },
  });

  await prisma.leadNote.create({
    data: {
      leadId: lead.id,
      authorId,
      body: "Automatically created from a Called-In quote saved in the Pricing Tool.",
    },
  });

  await notifyNewLead(lead);

  return lead;
}

export async function getLeadSourceSpend(monthKey: string = currentMonthKey()) {
  return prisma.leadSourceSpend.findMany({ where: { monthKey } });
}

export async function setLeadSourceSpendAmount(
  source: LeadSource,
  amountSpent: number,
  monthKey: string = currentMonthKey()
) {
  await prisma.leadSourceSpend.upsert({
    where: { source_monthKey: { source, monthKey } },
    create: { source, monthKey, amountSpent },
    update: { amountSpent },
  });
}

// Page copy + toggles for the three built-in "soft" fields on the public
// lead form (address/service interest/message) — kept in the same
// SalesToolData key-value store the rest of Sales already uses (goal,
// actuals), so relabeling or hiding one of these needs no migration. The
// core fields (name/email/phone) stay fixed: too much of the app — SMS,
// email, dedup-by-email — depends on them always being present.
const FORM_CONFIG_KEY = "leadform:config";

export interface LeadFormConfig {
  headline: string;
  intro: string;
  submitLabel: string;
  addressEnabled: boolean;
  addressRequired: boolean;
  addressLabel: string;
  serviceInterestEnabled: boolean;
  serviceInterestRequired: boolean;
  serviceInterestLabel: string;
  messageEnabled: boolean;
  messageRequired: boolean;
  messageLabel: string;
}

export const DEFAULT_LEAD_FORM_CONFIG: LeadFormConfig = {
  headline: "Get a Free Cleaning Quote",
  intro:
    "Tell us a little about what you need, and someone from Mama's Cleaning Crew will reach out shortly.",
  submitLabel: "Get My Free Quote",
  addressEnabled: true,
  addressRequired: false,
  addressLabel: "Home Address (street, city, and zip code)",
  serviceInterestEnabled: true,
  serviceInterestRequired: false,
  serviceInterestLabel: "What service are you interested in?",
  messageEnabled: true,
  messageRequired: false,
  messageLabel: "Anything else we should know?",
};

export async function getLeadFormConfig(): Promise<LeadFormConfig> {
  const row = await prisma.salesToolData.findUnique({ where: { key: FORM_CONFIG_KEY } });
  if (!row) return DEFAULT_LEAD_FORM_CONFIG;
  try {
    return { ...DEFAULT_LEAD_FORM_CONFIG, ...(JSON.parse(row.value) as Partial<LeadFormConfig>) };
  } catch {
    return DEFAULT_LEAD_FORM_CONFIG;
  }
}

export async function setLeadFormConfig(config: LeadFormConfig): Promise<void> {
  await prisma.salesToolData.upsert({
    where: { key: FORM_CONFIG_KEY },
    create: { key: FORM_CONFIG_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  });
}

export async function getActiveLeadFormFields() {
  return prisma.leadFormField.findMany({ orderBy: { order: "asc" } });
}

// All-time conversion funnel by source — complements the Sales dashboard's
// this-month Source ROI table (spend-focused) with a longer-view "which
// sources actually turn into paying jobs" answer, mirroring the Recruiting
// pipeline's Applicants-by-Source table.
export async function getLeadFunnelBySource() {
  const rows = await prisma.lead.groupBy({ by: ["source", "stage"], _count: true });

  const bySource = new Map<string, { total: number; won: number; lost: number; open: number }>();
  for (const row of rows) {
    const entry = bySource.get(row.source) ?? { total: 0, won: 0, lost: 0, open: 0 };
    entry.total += row._count;
    if (row.stage === "WON") entry.won += row._count;
    else if (row.stage === "LOST") entry.lost += row._count;
    else entry.open += row._count;
    bySource.set(row.source, entry);
  }

  return Array.from(bySource.entries())
    .map(([source, stats]) => ({
      source,
      label: LEAD_SOURCE_LABELS[source] ?? source,
      total: stats.total,
      open: stats.open,
      won: stats.won,
      lost: stats.lost,
      winRatePct:
        stats.won + stats.lost > 0 ? Math.round((stats.won / (stats.won + stats.lost)) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// Lost leads are pulled off the active pipeline board (same treatment as
// Rejected/Benched applicants), but stay fully on file — this is the one
// place to browse all of them, since the board itself only shows a count.
export async function getLostLeads() {
  const leads = await prisma.lead.findMany({
    where: { stage: "LOST" },
    include: {
      stageChanges: {
        where: { toStage: "LOST" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { changedBy: { select: { name: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return leads.map((l) => {
    const lostChange = l.stageChanges[0];
    return {
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      source: l.source,
      estimatedValue: l.estimatedValue,
      lostReason: l.lostReason,
      lostAt: lostChange?.createdAt ?? l.updatedAt,
      lostByName: lostChange?.changedBy?.name ?? null,
    };
  });
}

export async function buildLeadExportCsv(): Promise<string> {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });

  const headers = [
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Address",
    "Source",
    "Stage",
    "Service Interest",
    "Estimated Value",
    "Quote Reference",
    "Lost Reason",
    "Created At",
    "First Contacted At",
    "Follow-up Due",
  ];

  const lines = [headers.join(",")];
  for (const l of leads) {
    lines.push(
      [
        csvEscape(l.firstName),
        csvEscape(l.lastName),
        csvEscape(l.email),
        csvEscape(l.phone),
        csvEscape(l.address),
        csvEscape(LEAD_SOURCE_LABELS[l.source] ?? l.source),
        csvEscape(LEAD_STAGE_LABELS[l.stage] ?? l.stage),
        csvEscape(l.serviceInterest),
        csvEscape(l.estimatedValue),
        csvEscape(l.quoteKey),
        csvEscape(l.lostReason),
        csvEscape(l.createdAt.toISOString()),
        csvEscape(l.firstContactedAt ? l.firstContactedAt.toISOString() : null),
        csvEscape(l.followUpDueAt ? l.followUpDueAt.toISOString() : null),
      ].join(",")
    );
  }

  return lines.join("\n");
}

// Direction A of the Lead <-> Pricing Tool Won/Lost sync (direction B lives
// in src/app/api/sales/storage/route.ts, triggered when the quote itself
// changes) — called when a Lead's own stage moves to Won/Lost so its linked
// quote (if any) reflects the same outcome. Best-effort: a missing or
// malformed quote record just means there's nothing to sync.
export async function syncQuoteStatusForLead(
  quoteKey: string | null,
  status: "won" | "lost"
): Promise<void> {
  if (!quoteKey) return;
  const key = `quote:${quoteKey}`;
  const row = await prisma.salesToolData.findUnique({ where: { key } });
  if (!row) return;
  try {
    const data = JSON.parse(row.value) as { status?: string; wonAt?: string | null };
    if (data.status === status) return;
    data.status = status;
    if (status === "won") data.wonAt = new Date().toISOString();
    await prisma.salesToolData.update({ where: { key }, data: { value: JSON.stringify(data) } });
  } catch {
    // Malformed quote JSON — best-effort sync, skip silently.
  }
}

// Eligible assignees for a lead — anyone with Sales department access, plus
// Admins (who implicitly have every department per resolveUserDepartments).
export async function getSalesTeamMembers() {
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [{ role: "ADMIN" }, { departmentAccess: { some: { department: "SALES" } } }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
