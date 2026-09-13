import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

interface SeedOption {
  order: number;
  textEn: string;
  textEs: string | null;
}
interface SeedQuestion {
  order: number;
  textEn: string;
  textEs: string | null;
  correctIndex: number;
  options: SeedOption[];
}
interface SeedLesson {
  order: number;
  titleEn: string;
  titleEs: string | null;
  contentEn: string;
  contentEs: string | null;
  videoUrl: string | null;
}
interface SeedModule {
  order: number;
  slug: string;
  titleEn: string;
  titleEs: string | null;
  lessons: SeedLesson[];
  quiz: SeedQuestion[];
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = process.env.ADMIN_NAME ?? "Admin";
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("Skipping admin seed — ADMIN_EMAIL / ADMIN_PASSWORD not set.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      name,
      role: "ADMIN",
      passwordHash,
      mustSetPassword: false,
    },
  });
  console.log(`Created admin account: ${email}`);
}

async function seedModules() {
  const filePath = path.join(__dirname, "content", "modules.json");
  const modules: SeedModule[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  for (const mod of modules) {
    const existing = await prisma.module.findUnique({ where: { slug: mod.slug } });
    if (existing) {
      console.log(`Module "${mod.titleEn}" already exists, skipping (edit it in the admin content editor instead).`);
      continue;
    }

    await prisma.module.create({
      data: {
        slug: mod.slug,
        order: mod.order,
        titleEn: mod.titleEn,
        titleEs: mod.titleEs,
        lessons: {
          create: mod.lessons.map((l) => ({
            order: l.order,
            titleEn: l.titleEn,
            titleEs: l.titleEs,
            contentEn: l.contentEn,
            contentEs: l.contentEs,
            videoUrl: l.videoUrl,
          })),
        },
        quizQuestions: {
          create: mod.quiz.map((q) => ({
            order: q.order,
            textEn: q.textEn,
            textEs: q.textEs,
            options: {
              create: q.options.map((o, i) => ({
                order: o.order,
                textEn: o.textEn,
                textEs: o.textEs,
                isCorrect: i === q.correctIndex,
              })),
            },
          })),
        },
      },
    });
    console.log(`Seeded module: ${mod.titleEn}`);
  }
}

interface SeedMonthlyFinancials {
  month: string;
  monthLabel: string;
  revenueTotal: number;
  revenueCommercial: number;
  revenueResidential: number;
  cleanerTipsMemo: number | null;
  technicianPayroll: number;
  mileageReimbursements: number;
  supplies: number;
  cogsTotal: number;
  grossProfit: number;
  grossMarginPct: number;
  adminPayroll: number;
  rent: number;
  hiringRecruiting: number;
  fuel: number;
  insurance: number;
  vehicle: number;
  marketing: number;
  fees: number;
  misc: number | null;
  creditCard: number;
  loanPayoff: number;
  stripeCapitalInterest: number;
  equipmentFinancing: number;
  opexTotal: number;
  netProfit: number;
  netMarginPct: number;
  target21pct: number;
  varianceToTarget: number;
  ownerDraw: number;
  endingBankBalance: number;
}

// Straight transcription of the owner's own reconciled monthly P&L export —
// every field entered as given, not recomputed (see the MonthlyFinancials
// model comment for why: her own opex_total doesn't equal a simple sum of
// the line items shown, so there's a cost factor in her spreadsheet that
// isn't broken out into its own column here).
const MONTHLY_FINANCIALS: SeedMonthlyFinancials[] = [
  { month: "2026-01", monthLabel: "Jan", revenueTotal: 15032.32, revenueCommercial: 4605.23, revenueResidential: 10427.09, cleanerTipsMemo: 266, technicianPayroll: 6464.67, mileageReimbursements: 486.57, supplies: 254.01, cogsTotal: 7205.25, grossProfit: 7827.07, grossMarginPct: 0.520682768860695, adminPayroll: 800, rent: 1502.49, hiringRecruiting: 843.32, fuel: 600, insurance: 638.75, vehicle: 851.24, marketing: 600, fees: 630.51, misc: 509.95, creditCard: 632, loanPayoff: 3993.95, stripeCapitalInterest: 190.16, equipmentFinancing: 0, opexTotal: 12566.52, netProfit: -4739.45, netMarginPct: -0.315284001404973, target21pct: 3156.7872, varianceToTarget: -7896.2372, ownerDraw: 0, endingBankBalance: 5559.21 },
  { month: "2026-02", monthLabel: "Feb", revenueTotal: 13802.91, revenueCommercial: 3780.23, revenueResidential: 10022.68, cleanerTipsMemo: 502, technicianPayroll: 6148.58, mileageReimbursements: 372.45, supplies: 243.55, cogsTotal: 6764.58, grossProfit: 7038.33, grossMarginPct: 0.509916387196613, adminPayroll: 559.21, rent: 1502.49, hiringRecruiting: 85, fuel: 600, insurance: 535.78, vehicle: 0, marketing: 456.41, fees: 630.51, misc: 9.95, creditCard: 0, loanPayoff: 3615, stripeCapitalInterest: 509.85, equipmentFinancing: 0, opexTotal: 8769.96, netProfit: -1731.63, netMarginPct: -0.125453980356316, target21pct: 2898.6111, varianceToTarget: -4630.2411, ownerDraw: 1500, endingBankBalance: -471.71 },
  { month: "2026-03", monthLabel: "Mar", revenueTotal: 23762.51, revenueCommercial: 6380.23, revenueResidential: 17382.28, cleanerTipsMemo: 561, technicianPayroll: 7208.22, mileageReimbursements: 388.44, supplies: 1074.15, cogsTotal: 8670.81, grossProfit: 15091.7, grossMarginPct: 0.635105466552145, adminPayroll: 0, rent: 1502.49, hiringRecruiting: 0, fuel: 410.38, insurance: 1129.44, vehicle: 306.56, marketing: 400, fees: 619.86, misc: 427.65, creditCard: 682.75, loanPayoff: 4752.95, stripeCapitalInterest: 604.24, equipmentFinancing: 0, opexTotal: 11290.5, netProfit: 3801.2, netMarginPct: 0.159966266189893, target21pct: 4990.1271, varianceToTarget: -1188.9271, ownerDraw: 651.72, endingBankBalance: 2562.61 },
  { month: "2026-04", monthLabel: "Apr", revenueTotal: 17318.02, revenueCommercial: 3805.23, revenueResidential: 13512.79, cleanerTipsMemo: 460, technicianPayroll: 5256.58, mileageReimbursements: 261.26, supplies: 513.42, cogsTotal: 6031.26, grossProfit: 11286.76, grossMarginPct: 0.651735013587004, adminPayroll: 1000, rent: 1502.49, hiringRecruiting: 909.94, fuel: 1000, insurance: 842.22, vehicle: 20, marketing: 0, fees: 1289.22, misc: 107.08, creditCard: 157.6, loanPayoff: 0, stripeCapitalInterest: 595.74, equipmentFinancing: 0, opexTotal: 7834.39, netProfit: 3452.37, netMarginPct: 0.199351311524066, target21pct: 3636.7842, varianceToTarget: -184.4142, ownerDraw: 2440, endingBankBalance: 4395.5 },
  { month: "2026-05", monthLabel: "May", revenueTotal: 20586.28, revenueCommercial: 4555.23, revenueResidential: 16031.05, cleanerTipsMemo: 471, technicianPayroll: 7429.65, mileageReimbursements: 533.25, supplies: 806.68, cogsTotal: 8769.58, grossProfit: 11816.7, grossMarginPct: 0.574008514408626, adminPayroll: 1663.26, rent: 1502.49, hiringRecruiting: 351.07, fuel: 500, insurance: 1497.3, vehicle: 2238.96, marketing: 4.55, fees: 95.28, misc: 1893.58, creditCard: 550.79, loanPayoff: 0, stripeCapitalInterest: 639.65, equipmentFinancing: 174.48, opexTotal: 11852.44, netProfit: -35.7400000000016, netMarginPct: -0.00173610773777495, target21pct: 4323.1188, varianceToTarget: -4358.8588, ownerDraw: 2523, endingBankBalance: 4971.25 },
  { month: "2026-06", monthLabel: "Jun", revenueTotal: 22159.83, revenueCommercial: 4305.23, revenueResidential: 17854.6, cleanerTipsMemo: 442, technicianPayroll: 9508.59, mileageReimbursements: 716.76, supplies: 513.85, cogsTotal: 10739.2, grossProfit: 11420.63, grossMarginPct: 0.515375343583412, adminPayroll: 2476.29, rent: 1502.49, hiringRecruiting: 415.44, fuel: 500, insurance: 919.18, vehicle: 221.46, marketing: 0, fees: 123.92, misc: null, creditCard: 1225.7, loanPayoff: 0, stripeCapitalInterest: 792.87, equipmentFinancing: 92.61, opexTotal: 8740.03, netProfit: 2680.6, netMarginPct: 0.120966631964234, target21pct: 4653.5643, varianceToTarget: -1972.9643, ownerDraw: 4261.73, endingBankBalance: 110.51 },
  { month: "2026-07", monthLabel: "Jul", revenueTotal: 20400.38, revenueCommercial: 4805.23, revenueResidential: 15595.15, cleanerTipsMemo: 458, technicianPayroll: 18497.94, mileageReimbursements: 1272.47, supplies: 413.07, cogsTotal: 20183.48, grossProfit: 216.899999999998, grossMarginPct: 0.0106321548912323, adminPayroll: 3860, rent: 1502.49, hiringRecruiting: 519.03, fuel: 800, insurance: 1948.2, vehicle: 290.67, marketing: 0, fees: 46.09, misc: 600, creditCard: 905.45, loanPayoff: 0, stripeCapitalInterest: 1776.36, equipmentFinancing: 0, opexTotal: 12738.91, netProfit: -12522.01, netMarginPct: -0.613812585843989, target21pct: 4284.0798, varianceToTarget: -16806.0898, ownerDraw: 6650, endingBankBalance: 7355.54 },
  { month: "2026-08", monthLabel: "Aug", revenueTotal: 21995.64, revenueCommercial: 3805.23, revenueResidential: 18190.41, cleanerTipsMemo: 475, technicianPayroll: 12693.04, mileageReimbursements: 771.31, supplies: 1267.09, cogsTotal: 14731.44, grossProfit: 7264.2, grossMarginPct: 0.33025635989678, adminPayroll: 200, rent: 1552.49, hiringRecruiting: 125.17, fuel: 268.08, insurance: 2073.5, vehicle: 294.49, marketing: 0, fees: 113.99, misc: null, creditCard: 950, loanPayoff: 0, stripeCapitalInterest: 504.04, equipmentFinancing: 183.33, opexTotal: 6766.37, netProfit: 497.829999999998, netMarginPct: 0.022633121836873, target21pct: 4619.0844, varianceToTarget: -4121.2544, ownerDraw: 7135.06, endingBankBalance: 3274.73 },
];

const OWNER_SETTINGS: { key: string; value: unknown }[] = [
  {
    key: "owner_draw_policy",
    value: {
      fixed_monthly_amount: 2500,
      cash_floor_minimum: 2000,
      note: "Set 2026-09. Started at the low end of owner's stated $2,500-$4,000 personal need, because average monthly Net Profit Jan-Aug was -$1,007. Revisit as revenue grows.",
    },
  },
  {
    key: "profitability_target",
    value: {
      target_net_margin_pct: 0.21,
      estimated_revenue_needed_monthly: 39000,
      note: "SCENARIO estimate, not a guarantee. Holds current gross margin (~46%) and fixed OpEx (~$10,069/mo) roughly constant.",
    },
  },
  {
    key: "loans_open",
    value: [
      { lender: "Stripe Capital", status: "open", note: "Two originations (Jan 12, Jul 6); Jul loan paid off the Jan loan, so effectively 1 open balance." },
      { lender: "Square (Square Financial Services)", status: "open", origination_date: "2026-08-14", loan_amount: 2180.0, loan_fee: 218.0, total_to_repay: 2398.0, repayment_rate_pct: 19.98, minimum_payment: 599.5, minimum_payment_due_day: 14, maturity_date: "2026-12-14" },
      { lender: "Affirm", status: "open", note: "Installment payments for new vacuums (equipment financing)." },
      { lender: "MCA / Capitalized Equipment", status: "closed", note: "Confirmed fully paid off, no payments after March 2026." },
    ],
  },
];

const TEAM_GOALS: { key: string; value: unknown }[] = [
  { key: "growth_staircase_monthly_revenue", value: [30000, 40000, 50000, 65000, 80000, 100000] },
  { key: "current_stage_status", value: "Below Stage 1 ($30K/month) as of Aug 2026 — focus is reaching Stage 1 profitably before any expansion talk." },
  { key: "profitability_goal", value: "21% net profit margin (company-wide target, not team-facing detail)" },
  { key: "marketing_budget_monthly", value: 500 },
  { key: "marketing_budget_note", value: "Restarting marketing at a modest, controlled level after stopping in March 2026. Track every lead's source in the Leads table so we can measure what's working before increasing this." },
];

const CHECKLIST_TASKS: {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "ONE_TIME" | "MILESTONE";
  task: string;
  owner: "OWNER" | "TEAM";
  status: "NOT_STARTED" | "DONE";
  visibility: "OWNER_ONLY" | "TEAM";
}[] = [
  { frequency: "MILESTONE", task: "Reconcile Gusto payroll (technician vs admin, matched Gusto's own YTD total exactly)", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY" },
  { frequency: "MILESTONE", task: "Reconcile Stripe (found + explained both Stripe Capital loans)", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY" },
  { frequency: "MILESTONE", task: "Reconcile Square (found the extraction error, confirmed old loan closed, documented new loan)", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY" },
  { frequency: "MILESTONE", task: "Reconcile QuickBooks/Intuit (5 clients classified Commercial/Residential)", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY" },
  { frequency: "MILESTONE", task: "Incorporate May bank statement — all 8 months (Jan-Aug) now complete", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY" },
  { frequency: "MILESTONE", task: "Confirm MCA loan closed, Stripe loan open (1), Square loan open (1), Affirm ongoing", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY" },
  { frequency: "MILESTONE", task: "Reclassify Affirm, Louis Vuitton/Sephora, Westin, and Square's Custom Amount client", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY" },
  { frequency: "MILESTONE", task: "Decide on an Owner Draw policy - $2,500/month, $2,000 cash floor", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY" },
  { frequency: "ONE_TIME", task: "Track new Square loan repayments once Sept data is in ($599.50/mo min, due 14th, matures Dec 14 2026)", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "ONE_TIME", task: "Start using the Marketing & Leads Tracker for every new lead going forward", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "ONE_TIME", task: "Send Team Updates tab to Business Coach", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "ONE_TIME", task: "Send Team Updates tab to Marketing Director", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "ONE_TIME", task: "Review technician payroll efficiency with Business Coach", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "DAILY", task: "Log any new lead/client in the Marketing & Leads Tracker (source, type, value)", owner: "TEAM", status: "NOT_STARTED", visibility: "TEAM" },
  { frequency: "DAILY", task: "Quick glance at bank balance", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "WEEKLY", task: "Review the Cheat Sheet tab for anything unusual", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "WEEKLY", task: "Check in on Marketing spend vs. leads generated so far", owner: "TEAM", status: "NOT_STARTED", visibility: "TEAM" },
  { frequency: "MONTHLY", task: "Pull new bank statement, Gusto, Stripe, Square, QuickBooks exports", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "MONTHLY", task: "Update the Finance Overview tab with the new month's numbers", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "MONTHLY", task: "Check Net Profit vs. 21% Target on the Cheat Sheet", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "MONTHLY", task: "Before taking Owner Draw: confirm bank balance is above the $2,000 floor", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "MONTHLY", task: "Take Owner Draw per policy (up to $2,500, less if balance is tight)", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "MONTHLY", task: "Update and re-send Team Updates to Business Coach + Marketing Director", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
  { frequency: "MONTHLY", task: "Review progress toward the $39,000/month revenue goal on Goals & Decisions", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY" },
];

async function seedOwnerDashboard() {
  for (const m of MONTHLY_FINANCIALS) {
    await prisma.monthlyFinancials.upsert({
      where: { month: m.month },
      create: m,
      update: m,
    });
  }
  console.log(`Seeded ${MONTHLY_FINANCIALS.length} months of financials.`);

  for (const s of OWNER_SETTINGS) {
    await prisma.ownerSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value as never },
      update: { value: s.value as never },
    });
  }

  for (const g of TEAM_GOALS) {
    await prisma.teamGoal.upsert({
      where: { key: g.key },
      create: { key: g.key, value: g.value as never },
      update: { value: g.value as never },
    });
  }
  console.log("Seeded owner settings and team goals.");

  let checklistCreated = 0;
  for (let i = 0; i < CHECKLIST_TASKS.length; i++) {
    const t = CHECKLIST_TASKS[i];
    const existing = await prisma.checklistTask.findFirst({ where: { task: t.task } });
    if (existing) continue;
    await prisma.checklistTask.create({
      data: {
        frequency: t.frequency,
        task: t.task,
        owner: t.owner,
        status: t.status,
        completedAt: t.status === "DONE" ? new Date() : null,
        visibility: t.visibility,
        order: i,
      },
    });
    checklistCreated++;
  }
  console.log(`Seeded ${checklistCreated} new checklist task(s) (existing ones left untouched).`);
}

async function main() {
  await seedAdmin();
  await seedModules();
  await seedOwnerDashboard();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
