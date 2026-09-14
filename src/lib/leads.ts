import { prisma } from "@/lib/prisma";
import type { LeadStage, LeadSource } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { postSlackDMToOwner } from "@/lib/slack";
import { csvEscape } from "@/lib/export";

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  WEBSITE_FORM: "Website Form",
  PHONE_CALL: "Phone Call",
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  GOOGLE_ADS: "Google Ads",
  FACEBOOK_ADS: "Facebook Ads",
  OTHER: "Other",
};

const LEAD_SOURCE_ALIASES: Record<string, "GOOGLE_ADS" | "FACEBOOK_ADS" | "REFERRAL"> = {
  google: "GOOGLE_ADS",
  googleads: "GOOGLE_ADS",
  facebook: "FACEBOOK_ADS",
  fb: "FACEBOOK_ADS",
  facebookads: "FACEBOOK_ADS",
  referral: "REFERRAL",
};

// The public lead form always lives on the website, so it defaults to
// WEBSITE_FORM — a ?src= query param lets an ad campaign's landing link
// (pointing at the same embedded form) tag itself instead, the same way
// job-board postings tag /apply/[slug] via ?src=indeed.
export function parseLeadSource(raw: string | null | undefined): "WEBSITE_FORM" | "GOOGLE_ADS" | "FACEBOOK_ADS" | "REFERRAL" {
  const key = (raw ?? "").trim().toLowerCase();
  return LEAD_SOURCE_ALIASES[key] ?? "WEBSITE_FORM";
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
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const profileUrl = `${appUrl}/sales/leads/${lead.id}`;
  const summaryLines = [
    `${lead.firstName} ${lead.lastName} just submitted the website lead form.`,
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
  addressLabel: "Address",
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
