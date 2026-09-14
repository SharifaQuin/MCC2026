import { prisma } from "@/lib/prisma";
import type { LeadStage, LeadSource } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { postSlackDMToOwner } from "@/lib/slack";

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

export interface LeadKpis {
  avgResponseHours: number | null; // NEW_INQUIRY -> firstContactedAt, last 30 days
  pipelineValue: number; // sum of estimatedValue for leads not yet Won/Lost
  openLeadCount: number;
  staleFollowUps: {
    id: string;
    firstName: string;
    lastName: string;
    stage: LeadStage;
    followUpDueAt: string;
  }[];
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

  const [respondedLeads, openLeads, staleLeads, monthSpend, leadsThisMonth] = await Promise.all([
    prisma.lead.findMany({
      where: { firstContactedAt: { not: null }, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, firstContactedAt: true },
    }),
    prisma.lead.findMany({
      where: { stage: { notIn: ["WON", "LOST"] } },
      select: { estimatedValue: true },
    }),
    prisma.lead.findMany({
      where: {
        stage: { notIn: ["WON", "LOST"] },
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

  return {
    avgResponseHours,
    pipelineValue,
    openLeadCount: openLeads.length,
    staleFollowUps: staleLeads.map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      stage: l.stage,
      followUpDueAt: l.followUpDueAt!.toISOString(),
    })),
    bySource,
  };
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
