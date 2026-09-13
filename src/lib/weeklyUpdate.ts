// Pure formatting + date helpers for the Monday Team Update. No AI polish —
// per the owner's choice, every field goes into the template exactly as
// typed, matching the uploaded template's USE_CLAUDE_POLISH=false path.
import { businessTimeParts } from "@/lib/timezone";

// Must stay in sync with the fixed id seeded in prisma/seed.ts — lets the
// save-draft action mark this one checklist task Done directly on submit.
export const WEEKLY_UPDATE_REMINDER_TASK_ID = "weekly_team_update_reminder";

export interface WeeklyUpdateFields {
  spotlightName: string;
  spotlightReason: string;
  homesCleaned: number;
  commercialServiced: number;
  avgRating: number;
  clientShoutout: string | null;
  companyUpdates: string | null;
  weeklyGoal: string;
  coreValue: string;
  coreValueDescription: string;
}

// The Monday strictly after `from` — if `from` is itself a Monday, this is
// the *following* Monday, never today (matches "submitted Thu/Fri for next
// Monday"). Computed in the business timezone; returned as a UTC-midnight
// Date representing that calendar day.
export function nextMondayFrom(from: Date = new Date()): Date {
  const { year, month, day, weekday } = businessTimeParts(from);
  const daysUntilMonday = ((1 - weekday + 7) % 7) || 7;
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d;
}

export function formatWeeklyUpdate(fields: WeeklyUpdateFields): string {
  const spotlightBlurb =
    `Thank you for outstanding work last week. We especially want to recognize you for ${fields.spotlightReason}. ` +
    "Your dedication does not go unnoticed, and we truly appreciate everything you do for our team.";

  const motivationLine =
    "Every home you clean is someone's safe space, and the care you bring to it matters more than you know.";

  const companyUpdatesBlock = fields.companyUpdates
    ? fields.companyUpdates
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `• ${line}`)
        .join("\n")
    : "_(none this week)_";

  const clientShoutoutBlock = fields.clientShoutout
    ? `*:star2: Client Shoutout*\n${fields.clientShoutout}\n(Reading feedback like this reminds us that the little details matter. Thank you for creating experiences that leave lasting impressions.)\n\n`
    : "";

  return `:herb: *Mama's Cleaning Crew | Monday Team Update*

Good Morning, Team! :sunny: @everyone
Happy Monday! We hope everyone had a chance to recharge this weekend. Thank you for everything you do each day to represent Mama's Cleaning Crew with professionalism, kindness, and attention to detail. Every home you clean and every client interaction helps build the reputation we've worked so hard to create.

:trophy: *Technician Spotlight*
This week's recognition goes to *${fields.spotlightName}*
${spotlightBlurb} :clap: Congratulations, and thank you for setting a great example!
Remember: Every weekly recognition is considered when selecting our Employee of the Month.

:bar_chart: *Last Week at Mama's*
Here's what we accomplished together:
:house: Homes Cleaned: ${fields.homesCleaned}
:office: Commercial Properties Serviced: ${fields.commercialServiced}
:star: Average Client Rating: ${fields.avgRating} Stars
:blue_heart: Thank you for continuing to deliver exceptional service to every client!

${clientShoutoutBlock}:loudspeaker: *Company Updates*
${companyUpdatesBlock}

:date: *This Week*
Here's our goal for the week:
:white_check_mark: ${fields.weeklyGoal}

:herb: *M.A.M.A.S. Core Value of the Week*
*${fields.coreValue}*
"${fields.coreValueDescription}"
Think about one way you can demonstrate this value during every home you clean this week.

:blue_heart: *Monday Motivation*
${motivationLine}
Let's make it an amazing week!
— Shar & The Mama's Cleaning Crew Leadership Team :herb:`;
}
