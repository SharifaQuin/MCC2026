import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "../src/lib/password";
import { generateNextEmployeeId } from "../src/lib/employeeId";
import { seedDefaultHiringQuestions } from "../src/lib/recruiting";
import { assignDefaultOnboardingDocuments } from "../src/lib/onboarding";
import { FIELD_SKILL_LIBRARY, ROOKIE_DAY_DEFAULTS } from "../src/lib/rookieJourney";
import { LESSON_DAY_ASSIGNMENTS, ROOKIE_CONTENT_SEED } from "../src/lib/rookieCurriculumContent";

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
  const employeeId = await generateNextEmployeeId();
  await prisma.user.create({
    data: {
      employeeId,
      email,
      name,
      role: "ADMIN",
      passwordHash,
      mustSetPassword: false,
    },
  });
  console.log(`Created admin account: ${email}`);
}

interface TestAccountSeed {
  email: string;
  name: string;
  role: "TRAINEE" | "TRAINER" | "SERVICE_MANAGER";
  hireDate: Date | null;
}

// Owner-only "View As" test accounts — always active, always isTestAccount,
// and excluded from real staff/business reporting (see all the
// `isTestAccount: false` filters across src/lib). The Trainee one is
// deliberately left fresh (no hireDate, no signed onboarding docs) so
// viewing as them shows the real new-hire documents gate.
const TEST_ACCOUNTS: TestAccountSeed[] = [
  { email: "test-trainee@mamascleaningcrew.local", name: "TEST — Trainee / New Hire", role: "TRAINEE", hireDate: null },
  { email: "test-trainer@mamascleaningcrew.local", name: "TEST — Trainer", role: "TRAINER", hireDate: new Date("2024-01-15") },
  { email: "test-service-manager@mamascleaningcrew.local", name: "TEST — Service Manager", role: "SERVICE_MANAGER", hireDate: new Date("2024-01-15") },
];

async function seedTestAccounts() {
  for (const acct of TEST_ACCOUNTS) {
    let user = await prisma.user.findUnique({ where: { email: acct.email } });
    if (user) {
      console.log(`Test account ${acct.email} already exists, skipping creation.`);
    } else {
      const employeeId = await generateNextEmployeeId();
      user = await prisma.user.create({
        data: {
          employeeId,
          email: acct.email,
          name: acct.name,
          role: acct.role,
          isTestAccount: true,
          active: true,
          mustSetPassword: false,
          hireDate: acct.hireDate,
        },
      });

      if (acct.role === "TRAINEE") {
        await assignDefaultOnboardingDocuments(user.id);
      }

      console.log(`Created test account: ${acct.email} (${acct.role})`);
    }

    // The Test Service Manager gets Sales + Management access by default —
    // a bare SERVICE_MANAGER role only auto-grants HR — so "View As" shows
    // the fuller manager experience out of the box. Adjust like any real
    // employee's on the Permissions page if you want to test a narrower
    // setup. Runs every seed pass (not just on creation) so accounts seeded
    // before this grant existed still pick it up.
    if (acct.role === "SERVICE_MANAGER") {
      await prisma.departmentAccess.createMany({
        data: [
          { userId: user.id, department: "SALES", canEdit: true },
          { userId: user.id, department: "MANAGEMENT", canEdit: true },
        ],
        skipDuplicates: true,
      });
    }
  }
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
  category: "MARKETING" | "SALES" | "HR" | "MANAGEMENT";
}[] = [
  { frequency: "MILESTONE", task: "Reconcile Gusto payroll (technician vs admin, matched Gusto's own YTD total exactly)", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MILESTONE", task: "Reconcile Stripe (found + explained both Stripe Capital loans)", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MILESTONE", task: "Reconcile Square (found the extraction error, confirmed old loan closed, documented new loan)", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MILESTONE", task: "Reconcile QuickBooks/Intuit (5 clients classified Commercial/Residential)", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MILESTONE", task: "Incorporate May bank statement — all 8 months (Jan-Aug) now complete", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MILESTONE", task: "Confirm MCA loan closed, Stripe loan open (1), Square loan open (1), Affirm ongoing", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MILESTONE", task: "Reclassify Affirm, Louis Vuitton/Sephora, Westin, and Square's Custom Amount client", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MILESTONE", task: "Decide on an Owner Draw policy - $2,500/month, $2,000 cash floor", owner: "OWNER", status: "DONE", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "ONE_TIME", task: "Track new Square loan repayments once Sept data is in ($599.50/mo min, due 14th, matures Dec 14 2026)", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "ONE_TIME", task: "Start using the Marketing & Leads Tracker for every new lead going forward", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MARKETING" },
  { frequency: "ONE_TIME", task: "Send Team Updates tab to Business Coach", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "ONE_TIME", task: "Send Team Updates tab to Marketing Director", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MARKETING" },
  { frequency: "ONE_TIME", task: "Review technician payroll efficiency with Business Coach", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "DAILY", task: "Log any new lead/client in the Marketing & Leads Tracker (source, type, value)", owner: "TEAM", status: "NOT_STARTED", visibility: "TEAM", category: "MARKETING" },
  { frequency: "DAILY", task: "Quick glance at bank balance", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "WEEKLY", task: "Review the Cheat Sheet tab for anything unusual", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "WEEKLY", task: "Check in on Marketing spend vs. leads generated so far", owner: "TEAM", status: "NOT_STARTED", visibility: "TEAM", category: "MARKETING" },
  { frequency: "MONTHLY", task: "Pull new bank statement, Gusto, Stripe, Square, QuickBooks exports", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MONTHLY", task: "Update the Finance Overview tab with the new month's numbers", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MONTHLY", task: "Check Net Profit vs. 21% Target on the Cheat Sheet", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MONTHLY", task: "Before taking Owner Draw: confirm bank balance is above the $2,000 floor", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MONTHLY", task: "Take Owner Draw per policy (up to $2,500, less if balance is tight)", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MONTHLY", task: "Update and re-send Team Updates to Business Coach + Marketing Director", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "MANAGEMENT" },
  { frequency: "MONTHLY", task: "Review progress toward the $39,000/month revenue goal on Goals & Decisions", owner: "OWNER", status: "NOT_STARTED", visibility: "OWNER_ONLY", category: "SALES" },
];

interface SeedLoan {
  id: string;
  lender: string;
  loanType: string;
  status: "OPEN" | "CLOSED";
  originationDate: string | null;
  closedDate: string | null;
  loanAmount: number | null;
  feeAmount: number | null;
  totalToRepay: number | null;
  repaymentRatePct: number | null;
  minimumPayment: number | null;
  minimumPaymentFrequency: string | null;
  repaymentStartDate: string | null;
  maturityDate: string | null;
  priorLoanBalance: number | null;
  netProceeds: number | null;
  currentBalance: number | null;
  currentBalanceAsOf: string | null;
  notes: string;
}

// Reconstructed from bank/lender statements. currentBalance for open loans
// is a one-time computed starting point (totalToRepay minus repayments
// logged below through their last documented month); the owner updates it
// directly going forward rather than the app deriving it from a live ledger.
const LOANS: SeedLoan[] = [
  {
    id: "mca_2025",
    lender: "MCA Servicing / Capitalized Equipment",
    loanType: "merchant_cash_advance",
    status: "CLOSED",
    originationDate: null,
    closedDate: "2026-03-31",
    loanAmount: null,
    feeAmount: null,
    totalToRepay: null,
    repaymentRatePct: null,
    minimumPayment: null,
    minimumPaymentFrequency: null,
    repaymentStartDate: null,
    maturityDate: null,
    priorLoanBalance: null,
    netProceeds: null,
    currentBalance: 0,
    currentBalanceAsOf: "2026-03-31",
    notes:
      "Older loan, terms not documented in original paperwork - reconstructed from bank statement debits only (ACH 'Capitalized Equi' / 'MCA Servicing' + occasional card charges). No payments found after March 2026 - confirmed closed.",
  },
  {
    id: "stripe_capital_1",
    lender: "Stripe Capital (Celtic Bank)",
    loanType: "merchant_cash_advance",
    status: "CLOSED",
    originationDate: "2026-01-12",
    closedDate: "2026-07-06",
    loanAmount: 25200.0,
    feeAmount: 4838.0,
    totalToRepay: 30038.0,
    repaymentRatePct: 25.0,
    minimumPayment: 3337.56,
    minimumPaymentFrequency: "every_60_days",
    repaymentStartDate: "2026-01-19",
    maturityDate: "2027-07-13",
    priorLoanBalance: 4877.87,
    netProceeds: 20322.13,
    currentBalance: 0,
    currentBalanceAsOf: "2026-07-06",
    notes:
      "Paid off early on 2026-07-06 using proceeds from stripe_capital_2 (a $8,586.59 payoff transaction). Confirmed via signed loan agreement.",
  },
  {
    id: "stripe_capital_2",
    lender: "Stripe Capital (Celtic Bank)",
    loanType: "merchant_cash_advance",
    status: "OPEN",
    originationDate: "2026-07-06",
    closedDate: null,
    loanAmount: 28200.0,
    feeAmount: 4709.0,
    totalToRepay: 32909.0,
    repaymentRatePct: 20.0,
    minimumPayment: 3656.56,
    minimumPaymentFrequency: "every_60_days",
    repaymentStartDate: "2026-07-13",
    maturityDate: "2028-01-04",
    priorLoanBalance: 8636.59,
    netProceeds: 19563.41,
    currentBalance: 18147.01,
    currentBalanceAsOf: "2026-08-31",
    notes:
      "Prior loan balance line paid off the remainder of stripe_capital_1. Confirmed via signed loan agreement. Repayment happens automatically from daily Stripe sales - never appears as a separate bank withdrawal, it reduces the deposit amount instead. currentBalance computed from totalToRepay minus repayments logged through August 2026 — update as new statements come in.",
  },
  {
    id: "square_loan_1",
    lender: "Square Financial Services, Inc.",
    loanType: "merchant_cash_advance",
    status: "CLOSED",
    originationDate: "2024-12-23",
    closedDate: "2026-07-30",
    loanAmount: 9019.37,
    feeAmount: null,
    totalToRepay: null,
    repaymentRatePct: null,
    minimumPayment: null,
    minimumPaymentFrequency: null,
    repaymentStartDate: null,
    maturityDate: null,
    priorLoanBalance: null,
    netProceeds: 9019.37,
    currentBalance: 0,
    currentBalanceAsOf: "2026-07-30",
    notes:
      "Terms not fully documented - reconstructed from Square's transaction export. Repayments ran Dec 2024-Jul 2026 (~$500-1,275/month via automatic withholding from daily Square sales, never a separate bank withdrawal). No repayments found after 2026-07-30. CONFIRMED closed by square_loan_2's agreement, which shows Prior Loan Balance: $0.00.",
  },
  {
    id: "square_loan_2",
    lender: "Square Financial Services, Inc.",
    loanType: "merchant_cash_advance",
    status: "OPEN",
    originationDate: "2026-08-14",
    closedDate: null,
    loanAmount: 2180.0,
    feeAmount: 218.0,
    totalToRepay: 2398.0,
    repaymentRatePct: 19.98,
    minimumPayment: 599.5,
    minimumPaymentFrequency: "monthly",
    repaymentStartDate: "2026-08-18",
    maturityDate: "2026-12-14",
    priorLoanBalance: 0.0,
    netProceeds: 2180.0,
    currentBalance: 2398.0,
    currentBalanceAsOf: "2026-08-14",
    notes:
      "Confirmed via signed loan agreement. 4-month term. First minimum payment due 2026-09-14, then every month. Repayment happens automatically via 19.98% withholding from daily Square sales - will not appear as a separate bank withdrawal.",
  },
  {
    id: "affirm_equipment",
    lender: "Affirm",
    loanType: "equipment_installment",
    status: "OPEN",
    originationDate: null,
    closedDate: null,
    loanAmount: null,
    feeAmount: null,
    totalToRepay: null,
    repaymentRatePct: null,
    minimumPayment: 183.33,
    minimumPaymentFrequency: "monthly",
    repaymentStartDate: null,
    maturityDate: null,
    priorLoanBalance: null,
    netProceeds: null,
    currentBalance: 183.33,
    currentBalanceAsOf: "2026-08-31",
    notes:
      "Financing for new vacuum equipment, confirmed as a legitimate business expense. Terms/total not documented - only observed as recurring debit-card charges: May $174.48, Jun $92.61, Jul $0, Aug $183.33. Owner reports only one payment left, at the same amount as the current monthly card charge — seeded here as $183.33 (the most recent observed charge); correct it if the true final payment differs.",
  },
];

const LOAN_REPAYMENTS: {
  loanId: string;
  month: string;
  interestFeePaid: number | null;
  principalPaid: number | null;
  totalPaid: number;
}[] = [
  { loanId: "stripe_capital_1", month: "2026-01", interestFeePaid: 190.16, principalPaid: 990.44, totalPaid: 1180.6 },
  { loanId: "stripe_capital_1", month: "2026-02", interestFeePaid: 509.85, principalPaid: 2655.81, totalPaid: 3165.66 },
  { loanId: "stripe_capital_1", month: "2026-03", interestFeePaid: 604.24, principalPaid: 3147.48, totalPaid: 3751.72 },
  { loanId: "stripe_capital_1", month: "2026-04", interestFeePaid: 595.74, principalPaid: 3103.26, totalPaid: 3699.0 },
  { loanId: "stripe_capital_1", month: "2026-05", interestFeePaid: 639.65, principalPaid: 3331.84, totalPaid: 3971.49 },
  { loanId: "stripe_capital_1", month: "2026-06", interestFeePaid: 792.87, principalPaid: 4130.03, totalPaid: 4922.9 },
  { loanId: "stripe_capital_2", month: "2026-07", interestFeePaid: 1776.36, principalPaid: 9463.15, totalPaid: 11239.51 },
  { loanId: "stripe_capital_2", month: "2026-08", interestFeePaid: 504.04, principalPaid: 3018.44, totalPaid: 3522.48 },
  { loanId: "mca_2025", month: "2026-01", interestFeePaid: null, principalPaid: null, totalPaid: 3993.95 },
  { loanId: "mca_2025", month: "2026-02", interestFeePaid: null, principalPaid: null, totalPaid: 3615.0 },
  { loanId: "mca_2025", month: "2026-03", interestFeePaid: null, principalPaid: null, totalPaid: 4752.95 },
  { loanId: "square_loan_1", month: "2026-01", interestFeePaid: null, principalPaid: null, totalPaid: 511.2 },
  { loanId: "square_loan_1", month: "2026-02", interestFeePaid: null, principalPaid: null, totalPaid: 558.4 },
  { loanId: "square_loan_1", month: "2026-03", interestFeePaid: null, principalPaid: null, totalPaid: 555.98 },
  { loanId: "square_loan_1", month: "2026-04", interestFeePaid: null, principalPaid: null, totalPaid: 574.38 },
  { loanId: "square_loan_1", month: "2026-05", interestFeePaid: null, principalPaid: null, totalPaid: 553.67 },
  { loanId: "square_loan_1", month: "2026-06", interestFeePaid: null, principalPaid: null, totalPaid: 1275.04 },
  { loanId: "square_loan_1", month: "2026-07", interestFeePaid: null, principalPaid: null, totalPaid: 966.88 },
  { loanId: "affirm_equipment", month: "2026-05", interestFeePaid: null, principalPaid: null, totalPaid: 174.48 },
  { loanId: "affirm_equipment", month: "2026-06", interestFeePaid: null, principalPaid: null, totalPaid: 92.61 },
  { loanId: "affirm_equipment", month: "2026-07", interestFeePaid: null, principalPaid: null, totalPaid: 0.0 },
  { loanId: "affirm_equipment", month: "2026-08", interestFeePaid: null, principalPaid: null, totalPaid: 183.33 },
];

// Loans are created once and then left alone — status/currentBalance are
// meant to be edited by the owner over time (see LoansManager), so re-seeding
// must never overwrite them the way MonthlyFinancials/OwnerSetting do.
async function seedLoans() {
  let loansCreated = 0;
  for (let i = 0; i < LOANS.length; i++) {
    const l = LOANS[i];
    const existing = await prisma.loan.findUnique({ where: { id: l.id } });
    if (existing) continue;
    await prisma.loan.create({
      data: {
        id: l.id,
        lender: l.lender,
        loanType: l.loanType,
        status: l.status,
        originationDate: l.originationDate ? new Date(l.originationDate) : null,
        closedDate: l.closedDate ? new Date(l.closedDate) : null,
        loanAmount: l.loanAmount,
        feeAmount: l.feeAmount,
        totalToRepay: l.totalToRepay,
        repaymentRatePct: l.repaymentRatePct,
        minimumPayment: l.minimumPayment,
        minimumPaymentFrequency: l.minimumPaymentFrequency,
        repaymentStartDate: l.repaymentStartDate ? new Date(l.repaymentStartDate) : null,
        maturityDate: l.maturityDate ? new Date(l.maturityDate) : null,
        priorLoanBalance: l.priorLoanBalance,
        netProceeds: l.netProceeds,
        currentBalance: l.currentBalance,
        currentBalanceAsOf: l.currentBalanceAsOf ? new Date(l.currentBalanceAsOf) : null,
        notes: l.notes,
        order: i,
      },
    });
    loansCreated++;
  }
  console.log(`Seeded ${loansCreated} new loan(s) (existing ones left untouched).`);

  let repaymentsCreated = 0;
  for (const r of LOAN_REPAYMENTS) {
    const existing = await prisma.loanRepayment.findUnique({
      where: { loanId_month: { loanId: r.loanId, month: r.month } },
    });
    if (existing) continue;
    await prisma.loanRepayment.create({ data: r });
    repaymentsCreated++;
  }
  console.log(`Seeded ${repaymentsCreated} new loan repayment record(s).`);
}

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
        category: t.category,
        order: i,
      },
    });
    checklistCreated++;
  }
  console.log(`Seeded ${checklistCreated} new checklist task(s) (existing ones left untouched).`);

  // Fixed id so the weekly-update save action can mark this one Done
  // directly (see WEEKLY_UPDATE_REMINDER_TASK_ID in src/lib/weeklyUpdate.ts)
  // — must stay in sync with that constant.
  const weeklyUpdateReminderId = "weekly_team_update_reminder";
  const existingReminder = await prisma.checklistTask.findUnique({ where: { id: weeklyUpdateReminderId } });
  if (!existingReminder) {
    await prisma.checklistTask.create({
      data: {
        id: weeklyUpdateReminderId,
        frequency: "WEEKLY",
        task: "Fill out the Monday Team Update form (spotlight, stats, goal, core value)",
        owner: "OWNER",
        visibility: "OWNER_ONLY",
        category: "MANAGEMENT",
        dueFridayOfWeek: true,
        order: CHECKLIST_TASKS.length,
      },
    });
    console.log("Seeded the Monday Team Update reminder task.");
  }
}

// Backfills the standard phone-screen + structured-interview question banks
// onto any job posting that predates that feature (new postings already
// seed these at creation time — see createJobPostingAction). Idempotent:
// only touches postings with zero questions of either kind, so it's safe
// to run on every deploy.
async function seedHiringQuestionsBackfill() {
  const postings = await prisma.jobPosting.findMany({
    select: {
      id: true,
      titleEn: true,
      _count: { select: { phoneScreenQuestions: true, interviewQuestions: true } },
    },
  });

  let seeded = 0;
  for (const posting of postings) {
    if (posting._count.phoneScreenQuestions > 0 || posting._count.interviewQuestions > 0) continue;
    await seedDefaultHiringQuestions(posting.id);
    seeded++;
  }
  console.log(`Backfilled hiring questions onto ${seeded} job posting(s) (${postings.length} total).`);
}

// One-time default for the interview-logistics OwnerSetting row — only
// created if it doesn't exist yet, so it never overwrites an address/phone/
// arrival-instructions edit made afterward in the /recruiting/settings UI.
const INTERVIEW_LOGISTICS_KEY = "recruiting:interviewLogistics";

async function seedInterviewLogistics() {
  const existing = await prisma.ownerSetting.findUnique({ where: { key: INTERVIEW_LOGISTICS_KEY } });
  if (existing) {
    console.log("Interview logistics already set, skipping.");
    return;
  }

  await prisma.ownerSetting.create({
    data: {
      key: INTERVIEW_LOGISTICS_KEY,
      value: {
        address: "1504 Brookhollow Dr. #120\nSanta Ana, CA 92705",
        phone: "949-485-4440",
        arrivalInstructionsEn:
          "When you arrive, you'll see building 1504. Our office door is directly in the middle and you'll see our company sign in the window. Please ring the door bell and someone will be with you momentarily.",
        arrivalInstructionsEs:
          "Al llegar, verá el edificio 1504. La puerta de nuestra oficina se encuentra justo en el centro y verá el letrero de la empresa en el escaparate; por favor, toque el timbre y alguien le atenderá en un momento.",
      },
    },
  });
  console.log("Seeded default interview logistics.");
}

// Starter message templates for the team's picker in the Sales/Recruiting
// Communication panels — idempotent by (scope, channel, name), so re-runs
// never duplicate and never touch a template someone has since edited.
async function seedMessageTemplates() {
  const starters: {
    scope: "SALES" | "RECRUITING";
    channel: "EMAIL" | "SMS";
    name: string;
    subject?: string;
    body: string;
  }[] = [
    {
      scope: "SALES",
      channel: "EMAIL",
      name: "Thanks for Your Inquiry",
      subject: "Thanks for reaching out to Mama's Cleaning Crew!",
      body: "Hi {{firstName}},\n\nThank you for reaching out to Mama's Cleaning Crew! We'd love to help get your home sparkling clean.\n\nI'll follow up shortly with a few quick questions so we can put together an accurate quote for you. In the meantime, feel free to reply here with any questions.\n\nTalk soon!",
    },
    {
      scope: "SALES",
      channel: "EMAIL",
      name: "Following Up On Your Quote",
      subject: "Just checking in on your cleaning quote",
      body: "Hi {{firstName}},\n\nJust wanted to follow up on the quote we sent over — did you have any questions, or is there anything we can adjust to better fit what you're looking for?\n\nWe'd love to get you on the schedule whenever you're ready!",
    },
    {
      scope: "SALES",
      channel: "SMS",
      name: "Quick Follow-Up",
      body: "Hi {{firstName}}, this is Mama's Cleaning Crew following up on your cleaning quote — let us know if you have any questions!",
    },
    {
      scope: "RECRUITING",
      channel: "EMAIL",
      name: "Thanks for Applying",
      subject: "Thanks for applying to Mama's Cleaning Crew!",
      body: "Hi {{firstName}},\n\nThank you for applying for the {{position}} position with Mama's Cleaning Crew! We're reviewing applications now and will be in touch soon with next steps.\n\nThanks again for your interest in joining our team!",
    },
    {
      scope: "RECRUITING",
      channel: "EMAIL",
      name: "Reminder: Complete Phone Screen",
      subject: "Quick reminder — let's schedule your phone screen",
      body: "Hi {{firstName}},\n\nJust following up to schedule a quick phone screen for the {{position}} position. Let us know a few times that work for you this week!",
    },
    {
      scope: "RECRUITING",
      channel: "SMS",
      name: "Reminder: Upcoming Interview",
      body: "Hi {{firstName}}, this is Mama's Cleaning Crew with a quick reminder about your upcoming interview for the {{position}} position. See you soon!",
    },
  ];

  let created = 0;
  for (const t of starters) {
    const existing = await prisma.messageTemplate.findFirst({
      where: { scope: t.scope, channel: t.channel, name: t.name },
    });
    if (existing) continue;
    await prisma.messageTemplate.create({
      data: { scope: t.scope, channel: t.channel, name: t.name, subject: t.subject ?? null, body: t.body },
    });
    created++;
  }
  console.log(`Seeded ${created} starter message template(s) (${starters.length} total defined).`);
}

// Recruiting 2.0 — the real Cleaning Technician posting and its full
// 6-step application (see the "MCC RECRUITING 2.0 — IMPLEMENT THE CLEANING
// TECHNICIAN APPLICATION" spec). Every question lives in the existing
// PrescreenQuestion/PrescreenOption/PrescreenAnswer architecture — no
// hardcoded per-question columns — using:
//  - category: QUALIFICATION (scored, gates pass/fail) vs APPLICATION /
//    CULTURE_BEHAVIORAL (informational only, never scored or auto-rejected)
//  - type: SINGLE_SELECT / MULTI_SELECT / TEXT / DATE
//  - conditionalOnOptionId: shows/counts a question only if a specific
//    earlier option was chosen (an "Other, please explain" follow-up, or
//    the compound "≥1yr professional OR ≥3yr independent" experience rule)
//  - stepLabel: which of the 6 wizard steps a question belongs to
//  - shortLabel: the short Quick Review checklist/section label
// Idempotent by slug; if the posting already has real applicants, it skips
// the prescreen reseed entirely rather than risk deleting their answers.
const CLEANING_TECHNICIAN_SLUG = "cleaning-technician";

type CtSeedOption = { key?: string; textEn: string; points?: number };
type CtSeedQuestion = {
  key: string;
  textEn: string;
  shortLabel?: string;
  category: "QUALIFICATION" | "APPLICATION" | "CULTURE_BEHAVIORAL";
  type: "SINGLE_SELECT" | "MULTI_SELECT" | "TEXT" | "DATE";
  required?: boolean;
  maxLength?: number;
  stepLabel: string;
  options?: CtSeedOption[];
  conditionalOnKey?: string; // { parentQuestionKey}.{optionKey}
};

const YES_NO_OPTIONS: CtSeedOption[] = [
  { textEn: "Yes", points: 1 },
  { textEn: "No", points: 0 },
];

const CLEANING_TECHNICIAN_QUESTIONS: CtSeedQuestion[] = [
  // STEP 1 — About You
  {
    key: "heard",
    textEn: "How did you hear about Mama's Cleaning Crew?",
    shortLabel: "How Heard",
    category: "APPLICATION",
    type: "SINGLE_SELECT",
    stepLabel: "About You",
    options: [
      { textEn: "Facebook / Instagram" },
      { textEn: "Google" },
      { textEn: "Indeed" },
      { textEn: "ZipRecruiter" },
      { key: "referral", textEn: "Friend / Employee Referral" },
      { textEn: "Mama's Cleaning Crew Website" },
      { key: "other", textEn: "Other" },
    ],
  },
  {
    key: "heard_referral",
    textEn: "Who referred you?",
    category: "APPLICATION",
    type: "TEXT",
    maxLength: 100,
    stepLabel: "About You",
    conditionalOnKey: "heard.referral",
  },
  {
    key: "heard_other",
    textEn: "Please tell us where you heard about us.",
    category: "APPLICATION",
    type: "TEXT",
    maxLength: 100,
    stepLabel: "About You",
    conditionalOnKey: "heard.other",
  },

  // STEP 2 — Cleaning Experience
  {
    key: "experience",
    textEn: "How much residential cleaning experience do you have?",
    shortLabel: "Experience",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Cleaning Experience",
    options: [
      { textEn: "Less than 1 year", points: 0 },
      { textEn: "1–2 years", points: 1 },
      { textEn: "3–4 years", points: 1 },
      { textEn: "5+ years", points: 1 },
      { key: "independent", textEn: "I primarily cleaned independently / for my own clients", points: 0 },
      { textEn: "I do not have residential cleaning experience", points: 0 },
    ],
  },
  {
    key: "experience_independent_years",
    textEn: "How many years have you independently cleaned residential homes?",
    shortLabel: "Experience",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Cleaning Experience",
    conditionalOnKey: "experience.independent",
    options: [
      { textEn: "Less than 1 year", points: 0 },
      { textEn: "1–2 years", points: 0 },
      { textEn: "3–4 years", points: 1 },
      { textEn: "5+ years", points: 1 },
    ],
  },
  {
    key: "experience_types",
    textEn: "What type of professional cleaning experience do you have?",
    category: "APPLICATION",
    type: "MULTI_SELECT",
    stepLabel: "Cleaning Experience",
    options: [
      { textEn: "Residential cleaning company" },
      { textEn: "Independent residential cleaning / my own clients" },
      { textEn: "Hotel / housekeeping" },
      { textEn: "Commercial / office cleaning" },
      { textEn: "Move-in / move-out cleaning" },
      { textEn: "Deep cleaning" },
      { textEn: "Post-construction cleaning" },
      { key: "other", textEn: "Other" },
      { textEn: "I do not have professional cleaning experience" },
    ],
  },
  {
    key: "experience_types_other",
    textEn: "Please briefly describe your other cleaning experience.",
    category: "APPLICATION",
    type: "TEXT",
    maxLength: 200,
    stepLabel: "Cleaning Experience",
    conditionalOnKey: "experience_types.other",
  },
  {
    key: "experience_describe",
    textEn:
      "Where did you work, approximately how long did you work there, and what were you typically responsible for during a cleaning?",
    shortLabel: "Residential Experience",
    category: "APPLICATION",
    type: "TEXT",
    maxLength: 500,
    stepLabel: "Cleaning Experience",
  },

  // STEP 3 — Basic Job Requirements
  {
    key: "availability",
    textEn: "Are you available to work Monday through Friday between 8:00 AM and 6:00 PM?",
    shortLabel: "M-F Availability",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Job Requirements",
    options: YES_NO_OPTIONS,
  },
  {
    key: "transportation",
    textEn: "Do you have reliable transportation that you can use for work?",
    shortLabel: "Vehicle",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Job Requirements",
    options: YES_NO_OPTIONS,
  },
  {
    key: "license",
    textEn: "Do you currently have a valid driver's license?",
    shortLabel: "License",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Job Requirements",
    options: YES_NO_OPTIONS,
  },
  {
    key: "insurance",
    textEn: "Do you currently have active auto insurance?",
    shortLabel: "Insurance",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Job Requirements",
    options: YES_NO_OPTIONS,
  },
  {
    key: "travel",
    textEn:
      "Are you willing and able to travel between client locations throughout Mama's Cleaning Crew's Orange County service area during your workday?",
    shortLabel: "Service Area",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Job Requirements",
    options: YES_NO_OPTIONS,
  },
  {
    key: "work_auth",
    textEn: "Are you legally authorized to work in the United States?",
    shortLabel: "Work Authorization",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Job Requirements",
    options: YES_NO_OPTIONS,
  },
  {
    key: "communication",
    textEn:
      "Are you comfortable communicating in basic English with clients, teammates, and management when needed?",
    shortLabel: "Basic English",
    category: "QUALIFICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Job Requirements",
    options: YES_NO_OPTIONS,
  },

  // STEP 4 — Let's Get to Know You
  {
    key: "why_mamas",
    textEn: "What interested you in Mama's Cleaning Crew, and what are you looking for in your next workplace?",
    shortLabel: "Why Mama's",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 400,
    stepLabel: "Get to Know You",
  },
  {
    key: "attention_detail",
    textEn:
      "You're finishing a client's home and your teammate says it's time to leave. During your final check, you notice something small was missed in a room that was already completed. What would you do, and why?",
    shortLabel: "Attention to Detail",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 400,
    stepLabel: "Get to Know You",
  },
  {
    key: "accountability",
    textEn:
      "A client points out an area you cleaned that doesn't meet their expectations. You thought you cleaned it correctly. How would you handle the situation?",
    shortLabel: "Accountability",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 400,
    stepLabel: "Get to Know You",
  },
  {
    key: "professionalism",
    textEn:
      "While cleaning inside a client's home, you notice something personal or unusual that catches your attention. What would you most likely do?",
    shortLabel: "Professionalism",
    category: "CULTURE_BEHAVIORAL",
    type: "SINGLE_SELECT",
    stepLabel: "Get to Know You",
    options: [
      { textEn: "Tell my teammate about it" },
      { textEn: "Take a picture to show someone later" },
      { textEn: "Remain professional, respect the client's privacy, and continue working" },
      { textEn: "Ask the client about it" },
      { key: "other", textEn: "Other" },
    ],
  },
  {
    key: "professionalism_other",
    textEn: "Tell us what you would do.",
    shortLabel: "Professionalism",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 200,
    stepLabel: "Get to Know You",
    conditionalOnKey: "professionalism.other",
  },
  {
    key: "teamwork",
    textEn:
      "You're working with a teammate who is moving slower than expected and your team is starting to fall behind schedule. What would you do?",
    shortLabel: "Teamwork",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 400,
    stepLabel: "Get to Know You",
  },
  {
    key: "coachability",
    textEn:
      "Your trainer tells you that you've been cleaning something incorrectly and asks you to use the Mama's Cleaning Crew method instead. What would you most likely do?",
    shortLabel: "Coachability",
    category: "CULTURE_BEHAVIORAL",
    type: "SINGLE_SELECT",
    stepLabel: "Get to Know You",
    options: [
      { textEn: "Continue using my method because it has always worked for me" },
      { textEn: "Try the MCC method and ask questions if I don't understand something" },
      { textEn: "Use the MCC method while the trainer is watching but return to my method later" },
      { textEn: "Explain why I believe my method is better and continue doing it that way" },
      { textEn: "Other" },
    ],
  },
  {
    key: "coachability_why",
    textEn: "Why did you choose that answer?",
    shortLabel: "Coachability",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 300,
    stepLabel: "Get to Know You",
  },
  {
    key: "reliability",
    textEn:
      "You wake up for work and realize you're having a transportation problem that may make you late. What would you do first?",
    shortLabel: "Reliability",
    category: "CULTURE_BEHAVIORAL",
    type: "SINGLE_SELECT",
    stepLabel: "Get to Know You",
    options: [
      { textEn: "Wait to see if I can fix the problem before telling anyone" },
      { textEn: "Contact the company as soon as possible and explain what's happening" },
      { textEn: "Ask my teammate to tell management for me" },
      { textEn: "Arrive whenever I can and explain afterward" },
      { textEn: "Other" },
    ],
  },
  {
    key: "reliability_why",
    textEn: "Briefly explain your answer.",
    shortLabel: "Reliability",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 300,
    stepLabel: "Get to Know You",
  },
  {
    key: "hospitality",
    textEn:
      "You're cleaning while the client is home. The client asks you to clean something, but you're not sure whether it's included in their service. What would you most likely do?",
    shortLabel: "Hospitality",
    category: "CULTURE_BEHAVIORAL",
    type: "SINGLE_SELECT",
    stepLabel: "Get to Know You",
    options: [
      { textEn: "Tell the client no because it wasn't on my list" },
      { textEn: "Say yes and do it without telling anyone" },
      { textEn: "Politely acknowledge the request and check with my Team Lead/office before making a promise" },
      { textEn: "Ignore the request and continue cleaning" },
      { key: "other", textEn: "Other" },
    ],
  },
  {
    key: "hospitality_other",
    textEn: "What would you do?",
    shortLabel: "Hospitality",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 200,
    stepLabel: "Get to Know You",
    conditionalOnKey: "hospitality.other",
  },

  // STEP 5 — Realistic Job Preview
  {
    key: "continued_interest",
    textEn: "After reading the description above, are you still interested in being considered for this position?",
    shortLabel: "Continued Interest",
    category: "APPLICATION",
    type: "SINGLE_SELECT",
    stepLabel: "Realistic Job Preview",
    options: [{ textEn: "Yes" }, { textEn: "No" }],
  },
  {
    key: "self_awareness",
    textEn:
      "What part of this job do you think would come most naturally to you, and what part do you think might challenge you the most?",
    shortLabel: "Self-Awareness",
    category: "CULTURE_BEHAVIORAL",
    type: "TEXT",
    maxLength: 400,
    stepLabel: "Realistic Job Preview",
  },

  // STEP 6 — Final Information (Resume is handled via Applicant.resumeDataUrl
  // + JobPosting.resumeRequired, not a PrescreenQuestion.)
  {
    key: "start_date",
    textEn: "If selected, when would you be available to start?",
    shortLabel: "Start Date",
    category: "APPLICATION",
    type: "DATE",
    stepLabel: "Final Information",
  },
  {
    key: "anything_else",
    textEn: "Is there anything else you'd like us to know about you?",
    shortLabel: "Anything Else",
    category: "APPLICATION",
    type: "TEXT",
    required: false,
    maxLength: 500,
    stepLabel: "Final Information",
  },
];

async function seedCleaningTechnicianPosting() {
  let posting = await prisma.jobPosting.findUnique({ where: { slug: CLEANING_TECHNICIAN_SLUG } });
  if (!posting) {
    posting = await prisma.jobPosting.create({
      data: {
        slug: CLEANING_TECHNICIAN_SLUG,
        titleEn: "Cleaning Technician",
        positionType: "Full-Time / Part-Time",
        descriptionEn:
          "Join Mama's Cleaning Crew as a Cleaning Technician! You'll travel between client homes throughout our Orange County service area, following our structured cleaning procedures to deliver a consistently excellent result. This is active, physical, on-your-feet work — you'll be moving, lifting, and cleaning for most of your shift. We provide structured training, clear procedures and expectations, regular coaching and feedback, and a real path to grow into Lead Technician, Trainer, Field Supervisor, and beyond.",
        resumeRequired: false,
        passThresholdPct: 100,
        roleTrack: "OTHER",
        active: true,
      },
    });
    await seedDefaultHiringQuestions(posting.id);
  }

  const alreadyRichSeeded = await prisma.prescreenQuestion.findFirst({
    where: { jobPostingId: posting.id, shortLabel: "Why Mama's" },
  });
  if (alreadyRichSeeded) {
    console.log("Cleaning Technician full application already seeded, skipping.");
    return;
  }

  const applicantCount = await prisma.applicant.count({ where: { jobPostingId: posting.id } });
  if (applicantCount > 0) {
    console.log(
      "Cleaning Technician already has real applicants — skipping prescreen reseed so their submitted answers aren't lost. Reseed manually if you're sure this is safe."
    );
    return;
  }

  // Safe to replace: no real applicant has answered against the old
  // question set yet, so drop it (cascades to its options only — no
  // PrescreenAnswer rows exist to lose) and seed the full application.
  await prisma.prescreenQuestion.deleteMany({ where: { jobPostingId: posting.id } });

  const questionIds = new Map<string, string>();
  const optionIds = new Map<string, string>(); // "questionKey.optionKey" -> id

  for (const [i, q] of CLEANING_TECHNICIAN_QUESTIONS.entries()) {
    const conditionalOnOptionId = q.conditionalOnKey ? optionIds.get(q.conditionalOnKey) : undefined;
    const created = await prisma.prescreenQuestion.create({
      data: {
        jobPostingId: posting.id,
        order: i,
        textEn: q.textEn,
        shortLabel: q.shortLabel,
        category: q.category,
        type: q.type,
        required: q.required ?? true,
        maxLength: q.maxLength,
        stepLabel: q.stepLabel,
        conditionalOnOptionId,
        options: q.options
          ? { create: q.options.map((o, oi) => ({ order: oi, textEn: o.textEn, points: o.points ?? 0 })) }
          : undefined,
      },
      include: { options: true },
    });
    questionIds.set(q.key, created.id);
    for (const [oi, o] of (q.options ?? []).entries()) {
      if (o.key) optionIds.set(`${q.key}.${o.key}`, created.options[oi].id);
    }
  }

  console.log(`Seeded the full Cleaning Technician application (${CLEANING_TECHNICIAN_QUESTIONS.length} questions).`);
}

// Rookie Journey V2 — seeds the 21-skill field checklist library and the 10
// Rookie Day config shells (title/description/estimated time/field goal +
// which field skills are "today's focus"). Deliberately does NOT assign any
// of the 172 existing lessons to a day — that mapping comes later, from an
// Admin, via /admin/rookie-journey. Safe to rerun: skips anything that
// already exists by key/dayNumber, same idiom as seedLoans/seedModules.
async function seedRookieJourney() {
  let skillsCreated = 0;
  const skillIdByKey = new Map<string, string>();
  for (let i = 0; i < FIELD_SKILL_LIBRARY.length; i++) {
    const s = FIELD_SKILL_LIBRARY[i];
    const existing = await prisma.fieldSkill.findUnique({ where: { key: s.key } });
    if (existing) {
      skillIdByKey.set(s.key, existing.id);
      continue;
    }
    const created = await prisma.fieldSkill.create({
      data: { key: s.key, labelEn: s.labelEn, labelEs: s.labelEs, order: i },
    });
    skillIdByKey.set(s.key, created.id);
    skillsCreated++;
  }

  let daysCreated = 0;
  for (const d of ROOKIE_DAY_DEFAULTS) {
    const existing = await prisma.rookieDay.findUnique({ where: { dayNumber: d.dayNumber } });
    if (existing) continue;
    const day = await prisma.rookieDay.create({
      data: {
        dayNumber: d.dayNumber,
        titleEn: d.titleEn,
        titleEs: d.titleEs,
        descriptionEn: d.descriptionEn,
        descriptionEs: d.descriptionEs,
        estimatedAcademyMinutes: d.estimatedAcademyMinutes,
        fieldGoalEn: d.fieldGoalEn,
        fieldGoalEs: d.fieldGoalEs,
      },
    });
    await prisma.rookieDayFieldSkill.createMany({
      data: d.fieldSkillKeys.map((key, i) => ({
        rookieDayId: day.id,
        fieldSkillId: skillIdByKey.get(key)!,
        order: i,
      })),
    });
    daysCreated++;
  }

  // Phase 2 content correction: Days 1/2/3/9/10 originally shipped with
  // Phase-1 placeholder titles/descriptions/field-skill sets. Refresh them
  // to the approved Phase-2 curriculum content — but ONLY if the row still
  // exactly matches its known Phase-1 baseline below, so this never
  // clobbers a change an Admin has since made via /admin/rookie-journey.
  const PHASE1_BASELINE: Record<number, { titleEn: string; descriptionEn: string; fieldSkillKeys: string[] }> = {
    1: {
      titleEn: "Fundamentals + First Clean",
      descriptionEn:
        "Welcome to Mama's, the MAMAS values, hospitality, a day in the life, basic team roles, TCS essentials, the Golden Rules, essential safety, and essential supplies/tools — then an afternoon of hands-on field training covering dusting, floors, and bathroom basics.",
      fieldSkillKeys: ["dusting", "floors_vacuuming", "bathroom", "tool_setup", "chemical_safety"],
    },
    2: {
      titleEn: "Kitchen + Complete Room Flow",
      descriptionEn:
        "Kitchen, bedrooms, living areas, the complete MCC room flow, and proper reset/final inspection — reinforcing dusting, floors, and bathroom. Most of the day is field time.",
      fieldSkillKeys: ["kitchen", "bedroom", "living_area", "complete_room_flow", "final_quality_check"],
    },
    3: {
      titleEn: "Full Home Flow",
      descriptionEn:
        "The complete-home workflow, team flow, speed with purpose, Dirt Codes/time expectations, quality control, field communication, and escalation basics. By the end of today you should understand how to independently move through an entire standard MCC home — you're not expected to have mastered speed yet.",
      fieldSkillKeys: ["complete_home_flow", "team_flow", "speed_with_purpose", "tcs_usage", "office_escalation"],
    },
    9: {
      titleEn: "Independence",
      descriptionEn: "Completing assigned areas with minimal trainer intervention.",
      fieldSkillKeys: ["complete_home_flow", "returns_items"],
    },
    10: {
      titleEn: "Consistency + Rookie Evaluation",
      descriptionEn: "Repeatable, MCC-standard performance — today wraps up with the Rookie Training Review.",
      fieldSkillKeys: ["complete_home_flow", "final_quality_check", "speed_with_purpose"],
    },
  };

  let daysRefreshed = 0;
  for (const [dayNumberStr, baseline] of Object.entries(PHASE1_BASELINE)) {
    const dayNumber = Number(dayNumberStr);
    const target = ROOKIE_DAY_DEFAULTS.find((d) => d.dayNumber === dayNumber);
    if (!target) continue;
    const existing = await prisma.rookieDay.findUnique({
      where: { dayNumber },
      include: { fieldSkills: { include: { fieldSkill: true } } },
    });
    if (!existing) continue;
    const stillBaselineContent = existing.titleEn === baseline.titleEn && existing.descriptionEn === baseline.descriptionEn;
    if (!stillBaselineContent) {
      console.log(`Rookie Journey: Day ${dayNumber} content was already customized, leaving it as-is.`);
      continue;
    }

    await prisma.rookieDay.update({
      where: { id: existing.id },
      data: {
        titleEn: target.titleEn,
        titleEs: target.titleEs,
        descriptionEn: target.descriptionEn,
        descriptionEs: target.descriptionEs,
        estimatedAcademyMinutes: target.estimatedAcademyMinutes,
        fieldGoalEn: target.fieldGoalEn,
        fieldGoalEs: target.fieldGoalEs,
      },
    });

    const currentSkillKeys = existing.fieldSkills.map((s) => s.fieldSkill.key).sort().join(",");
    const stillBaselineSkills = currentSkillKeys === [...baseline.fieldSkillKeys].sort().join(",");
    if (stillBaselineSkills) {
      await prisma.$transaction([
        prisma.rookieDayFieldSkill.deleteMany({ where: { rookieDayId: existing.id } }),
        prisma.rookieDayFieldSkill.createMany({
          data: target.fieldSkillKeys.map((key, i) => ({
            rookieDayId: existing.id,
            fieldSkillId: skillIdByKey.get(key)!,
            order: i,
          })),
        }),
      ]);
    }
    daysRefreshed++;
  }

  console.log(
    `Rookie Journey: seeded ${skillsCreated} field skills, ${daysCreated} Rookie Days, refreshed ${daysRefreshed} Days to Phase-2 content.`
  );
}

// Rookie Curriculum V2 (Phase 2) — resolves LESSON_DAY_ASSIGNMENTS against
// the real Module/Lesson rows and creates RookieLessonAssignment rows, and
// seeds the 15 new condensed practical-lesson/scenario/recap
// RookieContentItem cards (+ their RookieContentSourceLesson traceability
// links). Never touches an existing Lesson row. Safe to rerun: an
// assignment is only created if that lessonId has none yet (an Admin's
// later reassignment is never overwritten); a content item is only
// created if no item with that title exists yet on that day.
async function seedRookieCurriculumContent() {
  const days = await prisma.rookieDay.findMany({ select: { id: true, dayNumber: true } });
  const dayIdByNumber = new Map(days.map((d) => [d.dayNumber, d.id]));

  const modules = await prisma.module.findMany({ select: { id: true, order: true } });
  const moduleOrderByModuleId = new Map(modules.map((m) => [m.id, m.order]));
  const lessons = await prisma.lesson.findMany({ select: { id: true, order: true, moduleId: true } });
  const lessonIdByKey = new Map<string, string>();
  for (const l of lessons) {
    const moduleOrder = moduleOrderByModuleId.get(l.moduleId);
    if (moduleOrder == null) continue;
    lessonIdByKey.set(`${moduleOrder}-${l.order}`, l.id);
  }

  let assignmentsCreated = 0;
  let assignmentsSkipped = 0;
  for (const a of LESSON_DAY_ASSIGNMENTS) {
    const lessonId = lessonIdByKey.get(`${a.moduleOrder}-${a.lessonOrder}`);
    if (!lessonId) {
      console.warn(`Rookie Curriculum: no lesson found for module ${a.moduleOrder} lesson ${a.lessonOrder}, skipping.`);
      continue;
    }
    const existing = await prisma.rookieLessonAssignment.findUnique({ where: { lessonId } });
    if (existing) {
      assignmentsSkipped++;
      continue;
    }

    const rookieDayId = "dayNumber" in a.target ? dayIdByNumber.get(a.target.dayNumber) ?? null : null;
    const slot = "dayNumber" in a.target ? "ROOKIE_DAY" : "KNOWLEDGE_LIBRARY";
    const order = rookieDayId ? await prisma.rookieLessonAssignment.count({ where: { rookieDayId } }) : 0;
    await prisma.rookieLessonAssignment.create({ data: { lessonId, rookieDayId, slot, order } });
    assignmentsCreated++;
  }

  let contentCreated = 0;
  let contentSkipped = 0;
  for (const c of ROOKIE_CONTENT_SEED) {
    const rookieDayId = dayIdByNumber.get(c.dayNumber);
    if (!rookieDayId) continue;
    const existing = await prisma.rookieContentItem.findFirst({ where: { rookieDayId, titleEn: c.titleEn } });
    if (existing) {
      contentSkipped++;
      continue;
    }

    const created = await prisma.rookieContentItem.create({
      data: {
        rookieDayId,
        kind: c.kind,
        order: c.order,
        titleEn: c.titleEn,
        titleEs: c.titleEs,
        bodyEn: c.bodyEn,
        bodyEs: c.bodyEs,
        promptEn: c.promptEn ?? null,
        promptEs: c.promptEs ?? null,
        revealEn: c.revealEn ?? null,
        revealEs: c.revealEs ?? null,
        hasFutureVideoSlot: c.hasFutureVideoSlot ?? false,
        estimatedMinutes: c.estimatedMinutes ?? null,
      },
    });
    const sourceLessonIds = c.sourceLessonKeys.map((key) => lessonIdByKey.get(key)).filter((id): id is string => !!id);
    if (sourceLessonIds.length) {
      await prisma.rookieContentSourceLesson.createMany({
        data: sourceLessonIds.map((lessonId) => ({ contentItemId: created.id, lessonId })),
      });
    }
    contentCreated++;
  }

  console.log(
    `Rookie Curriculum: ${assignmentsCreated} lesson assignments created (${assignmentsSkipped} already assigned), ${contentCreated} content items created (${contentSkipped} already existed).`
  );
}

// Sep-2026 pre-merge UX adjustment: (1) Day 1 no longer shows 21 individual
// lessons — their content is now in the 4 ORIENTATION cards seeded above,
// so any leftover Day-1 lesson assignment for those 21 lessons is removed
// (the Lesson rows themselves are never touched — they become Unassigned,
// still reachable at /modules). (2) Days 4-10's Academy time targets are
// reduced. (3) Module 15 Lesson 6 is flagged as superseded by Module 24
// Lesson 1 so it isn't accidentally assigned as current training. All
// steps are idempotent/guarded so a later Admin customization is never
// silently overwritten.
async function seedRookieCurriculumDay1Adjustment() {
  const DAY1_CONSOLIDATED_LESSON_KEYS = [
    "1-1", "1-2", "1-3", "1-5", "1-6", "1-8",
    "2-1", "3-1", "4-1",
    "5-1", "5-2", "5-3",
    "8-1", "8-2",
    "15-1", "15-2", "15-3", "15-8", "15-11",
    "24-1", "23-1",
  ];

  const modules = await prisma.module.findMany({ select: { id: true, order: true } });
  const moduleIdByOrder = new Map(modules.map((m) => [m.order, m.id]));
  const day1 = await prisma.rookieDay.findUnique({ where: { dayNumber: 1 }, select: { id: true } });

  let day1Unassigned = 0;
  if (day1) {
    for (const key of DAY1_CONSOLIDATED_LESSON_KEYS) {
      const [mo, lo] = key.split("-").map(Number);
      const moduleId = moduleIdByOrder.get(mo);
      if (!moduleId) continue;
      const lesson = await prisma.lesson.findFirst({ where: { moduleId, order: lo }, select: { id: true } });
      if (!lesson) continue;
      const assignment = await prisma.rookieLessonAssignment.findUnique({ where: { lessonId: lesson.id } });
      if (assignment && assignment.rookieDayId === day1.id && assignment.slot === "ROOKIE_DAY") {
        await prisma.rookieLessonAssignment.delete({ where: { lessonId: lesson.id } });
        day1Unassigned++;
      }
    }
  }

  // Days 4-10 Academy time reduction — guarded: only touches a day still
  // at its Phase-2 launch value of 30 minutes.
  const NEW_TIME_BY_DAY: Record<number, number> = { 4: 20, 5: 20, 6: 15, 7: 20, 8: 15, 9: 15, 10: 10 };
  let daysTimeUpdated = 0;
  for (const [dayNumberStr, newMinutes] of Object.entries(NEW_TIME_BY_DAY)) {
    const dayNumber = Number(dayNumberStr);
    const existing = await prisma.rookieDay.findUnique({ where: { dayNumber }, select: { id: true, estimatedAcademyMinutes: true } });
    if (!existing || existing.estimatedAcademyMinutes !== 30) continue;
    await prisma.rookieDay.update({ where: { id: existing.id }, data: { estimatedAcademyMinutes: newMinutes } });
    daysTimeUpdated++;
  }

  // Uniform duplication: flag M15L6 as superseded by M24L1, once.
  let supersessionSet = false;
  const m15Id = moduleIdByOrder.get(15);
  const m24Id = moduleIdByOrder.get(24);
  if (m15Id && m24Id) {
    const m15l6 = await prisma.lesson.findFirst({ where: { moduleId: m15Id, order: 6 } });
    const m24l1 = await prisma.lesson.findFirst({ where: { moduleId: m24Id, order: 1 } });
    if (m15l6 && m24l1 && !m15l6.supersededByLessonId) {
      await prisma.lesson.update({ where: { id: m15l6.id }, data: { supersededByLessonId: m24l1.id } });
      supersessionSet = true;
    }
  }

  console.log(
    `Rookie Curriculum Day-1 adjustment: unassigned ${day1Unassigned} consolidated Day-1 lessons, updated Academy time on ${daysTimeUpdated} day(s), uniform supersession flag ${supersessionSet ? "set" : "already set/skipped"}.`
  );
}

async function main() {
  await seedAdmin();
  await seedTestAccounts();
  await seedModules();
  await seedOwnerDashboard();
  await seedLoans();
  await seedHiringQuestionsBackfill();
  await seedInterviewLogistics();
  await seedMessageTemplates();
  await seedCleaningTechnicianPosting();
  await seedRookieJourney();
  await seedRookieCurriculumContent();
  await seedRookieCurriculumDay1Adjustment();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
