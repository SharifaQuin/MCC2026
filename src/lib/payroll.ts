import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

export async function getPayPeriodsOverview() {
  const periods = await prisma.payPeriod.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { entries: true } } },
  });
  const disputeCounts = await prisma.payrollEntry.groupBy({
    by: ["payPeriodId"],
    where: { status: "DISPUTED" },
    _count: { _all: true },
  });
  const disputesByPeriod = new Map(disputeCounts.map((d) => [d.payPeriodId, d._count._all]));

  return periods.map((p) => ({
    id: p.id,
    label: p.label,
    startDate: p.startDate,
    endDate: p.endDate,
    entryCount: p._count.entries,
    disputeCount: disputesByPeriod.get(p.id) ?? 0,
  }));
}

export interface PayrollJobLineView {
  id: string;
  jobExternalId: string;
  customer: string;
  serviceType: string;
  performedDate: string | null;
  clockIn: string;
  clockOut: string;
  actualTimeHours: number;
  serviceTimeHours: number;
  payout: number;
  notes: string | null;
}

export interface PayrollAdjustmentView {
  id: string;
  sourceId: string;
  amount: number;
  hours: number;
  type: string;
  description: string;
  date: string | null;
  clockIn: string | null;
  clockOut: string | null;
}

export interface PayrollReportTotals {
  totalPayout: number;
  jobsPayout: number;
  adjustmentsPayout: number;
  totalHours: number;
  avgPayPerHour: number;
  estimatedHours: number;
}

function toJobLineView(j: {
  id: string;
  jobExternalId: string;
  customer: string;
  serviceType: string;
  performedDate: Date | null;
  clockIn: string;
  clockOut: string;
  actualTimeHours: number;
  serviceTimeHours: number;
  payout: number;
  notes: string | null;
}): PayrollJobLineView {
  return { ...j, performedDate: j.performedDate ? j.performedDate.toISOString() : null };
}

function toAdjustmentView(a: {
  id: string;
  sourceId: string;
  amount: number;
  hours: number;
  type: string;
  description: string;
  date: Date | null;
  clockIn: string | null;
  clockOut: string | null;
}): PayrollAdjustmentView {
  return { ...a, date: a.date ? a.date.toISOString() : null };
}

function toReportTotals(e: {
  totalPayout: number | null;
  jobsPayout: number | null;
  adjustmentsPayout: number | null;
  totalHours: number | null;
  avgPayPerHour: number | null;
  estimatedHours: number | null;
}): PayrollReportTotals | null {
  if (e.totalPayout === null) return null;
  return {
    totalPayout: e.totalPayout,
    jobsPayout: e.jobsPayout ?? 0,
    adjustmentsPayout: e.adjustmentsPayout ?? 0,
    totalHours: e.totalHours ?? 0,
    avgPayPerHour: e.avgPayPerHour ?? 0,
    estimatedHours: e.estimatedHours ?? 0,
  };
}

export interface PayrollEmployeeRow {
  employeeId: string;
  name: string;
  email: string;
  entry: {
    id: string;
    regularHours: number;
    overtimeHours: number;
    status: "PENDING" | "APPROVED" | "DISPUTED";
    attachmentFileName: string | null;
    attachmentDataUrl: string | null;
    signedAt: string | null;
    signedName: string | null;
    signedPdfDataUrl: string | null;
    signedViaOverride: boolean;
    overriddenByName: string | null;
    overrideNote: string | null;
    disputeNote: string | null;
    disputedAt: string | null;
    resolutionNotes: string | null;
    resolvedAt: string | null;
    reportTotals: PayrollReportTotals | null;
    jobLines: PayrollJobLineView[];
    adjustments: PayrollAdjustmentView[];
  } | null;
}

export async function getPayPeriodDetail(payPeriodId: string) {
  const payPeriod = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) return null;

  const [employees, entries] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TRAINEE", active: true, isTestAccount: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.payrollEntry.findMany({
      where: { payPeriodId },
      include: {
        jobLines: { orderBy: { performedDate: "asc" } },
        adjustments: { orderBy: { date: "asc" } },
        overriddenBy: { select: { name: true } },
      },
    }),
  ]);

  const entryByEmployee = new Map(entries.map((e) => [e.employeeId, e]));
  const rows: PayrollEmployeeRow[] = employees.map((emp) => {
    const e = entryByEmployee.get(emp.id);
    return {
      employeeId: emp.id,
      name: emp.name,
      email: emp.email,
      entry: e
        ? {
            id: e.id,
            regularHours: e.regularHours,
            overtimeHours: e.overtimeHours,
            status: e.status,
            attachmentFileName: e.attachmentFileName,
            attachmentDataUrl: e.attachmentDataUrl,
            signedAt: e.signedAt ? e.signedAt.toISOString() : null,
            signedName: e.signedName,
            signedPdfDataUrl: e.signedPdfDataUrl,
            signedViaOverride: e.signedViaOverride,
            overriddenByName: e.overriddenBy?.name ?? null,
            overrideNote: e.overrideNote,
            disputeNote: e.disputeNote,
            disputedAt: e.disputedAt ? e.disputedAt.toISOString() : null,
            resolutionNotes: e.resolutionNotes,
            resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
            reportTotals: toReportTotals(e),
            jobLines: e.jobLines.map(toJobLineView),
            adjustments: e.adjustments.map(toAdjustmentView),
          }
        : null,
    };
  });

  return { payPeriod, rows };
}

export async function getEmployeePayrollEntries(employeeId: string) {
  const entries = await prisma.payrollEntry.findMany({
    where: { employeeId },
    include: { payPeriod: true },
    orderBy: { payPeriod: { startDate: "desc" } },
  });

  return entries.map((e) => ({
    id: e.id,
    payPeriodId: e.payPeriodId,
    payPeriodLabel: e.payPeriod.label,
    startDate: e.payPeriod.startDate.toISOString(),
    endDate: e.payPeriod.endDate.toISOString(),
    regularHours: e.regularHours,
    overtimeHours: e.overtimeHours,
    status: e.status,
    signedPdfDataUrl: e.signedPdfDataUrl,
  }));
}

export async function getPayrollEntryDetail(entryId: string, employeeId: string) {
  const entry = await prisma.payrollEntry.findUnique({
    where: { id: entryId },
    include: {
      payPeriod: true,
      jobLines: { orderBy: { performedDate: "asc" } },
      adjustments: { orderBy: { date: "asc" } },
      overriddenBy: { select: { name: true } },
    },
  });
  if (!entry || entry.employeeId !== employeeId) return null;

  return {
    id: entry.id,
    payPeriodLabel: entry.payPeriod.label,
    startDate: entry.payPeriod.startDate.toISOString(),
    endDate: entry.payPeriod.endDate.toISOString(),
    regularHours: entry.regularHours,
    overtimeHours: entry.overtimeHours,
    status: entry.status,
    attachmentDataUrl: entry.attachmentDataUrl,
    attachmentFileName: entry.attachmentFileName,
    signedAt: entry.signedAt ? entry.signedAt.toISOString() : null,
    signedName: entry.signedName,
    signedPdfDataUrl: entry.signedPdfDataUrl,
    signedViaOverride: entry.signedViaOverride,
    overriddenByName: entry.overriddenBy?.name ?? null,
    disputeNote: entry.disputeNote,
    resolutionNotes: entry.resolutionNotes,
    reportTotals: toReportTotals(entry),
    jobLines: entry.jobLines.map(toJobLineView),
    adjustments: entry.adjustments.map(toAdjustmentView),
  };
}

export interface PayrollEntryForSigning {
  employeeName: string;
  payPeriodLabel: string;
  startDate: Date;
  endDate: Date;
  regularHours: number;
  overtimeHours: number;
  reportTotals: PayrollReportTotals | null;
  jobLines: PayrollJobLineView[];
  adjustments: PayrollAdjustmentView[];
}

// Everything renderPayrollEntryPdf needs to snapshot the entry at the
// moment it's signed — kept in the lib layer so callers stay a thin
// authorization check + PDF render + update. Shared by the employee's own
// self-sign action and the manager-override action below; each does its
// own authorization before calling this, since what counts as "allowed to
// see this" differs (ownership vs. HR role).
async function loadEntryForPdf(
  entryId: string
): Promise<(PayrollEntryForSigning & { employeeId: string }) | null> {
  const entry = await prisma.payrollEntry.findUnique({
    where: { id: entryId },
    include: {
      payPeriod: true,
      employee: { select: { name: true } },
      jobLines: { orderBy: { performedDate: "asc" } },
      adjustments: { orderBy: { date: "asc" } },
    },
  });
  if (!entry) return null;

  return {
    employeeId: entry.employeeId,
    employeeName: entry.employee.name,
    payPeriodLabel: entry.payPeriod.label,
    startDate: entry.payPeriod.startDate,
    endDate: entry.payPeriod.endDate,
    regularHours: entry.regularHours,
    overtimeHours: entry.overtimeHours,
    reportTotals: toReportTotals(entry),
    jobLines: entry.jobLines.map(toJobLineView),
    adjustments: entry.adjustments.map(toAdjustmentView),
  };
}

export async function getPayrollEntryForSigning(
  entryId: string,
  employeeId: string
): Promise<PayrollEntryForSigning | null> {
  const entry = await loadEntryForPdf(entryId);
  if (!entry || entry.employeeId !== employeeId) return null;
  return entry;
}

// No ownership check — the caller (an admin/service-manager action) has
// already authorized itself via requireHrAccess before calling this.
export async function getPayrollEntryForOverride(entryId: string): Promise<PayrollEntryForSigning | null> {
  return loadEntryForPdf(entryId);
}

export interface CsvImportResult {
  imported: number;
  errors: string[];
}

// Plain comma-split parser matching the convention used for bulk employee
// invites — not RFC-compliant CSV, just simple flat rows.
function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

// A cell from an Excel worksheet can be a plain string/number, a Date, a
// rich-text run, or a formula result — normalize all of those down to the
// same flat string the CSV path already works with.
function excelCellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value) return excelCellToString(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
}

// Blank rows are dropped entirely (not kept as empty arrays) so table
// sections in the richer report format below can be sliced out purely by
// locating their header rows, with no blank-row bookkeeping needed.
function sheetToRows(worksheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(excelCellToString(cell.value));
    });
    if (cells.some((c) => c.length > 0)) rows.push(cells);
  });
  return rows;
}

// The scheduling platform's report dates look like "Tue 08, Sep 2026" —
// weekday and day are swapped from a format JS can parse directly, so pull
// out month/day/year and reassemble.
function parseReportDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^\w+\s+(\d{1,2}),\s*(\w+)\s+(\d{4})$/);
  const candidate = m ? `${m[2]} ${m[1]}, ${m[3]}` : s;
  const d = new Date(candidate);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface ParsedJobLine {
  jobExternalId: string;
  customer: string;
  serviceType: string;
  performedDate: Date | null;
  clockIn: string;
  clockOut: string;
  actualTimeHours: number;
  serviceTimeHours: number;
  payout: number;
  notes: string | null;
}

interface ParsedAdjustment {
  sourceId: string;
  amount: number;
  hours: number;
  type: string;
  description: string;
  date: Date | null;
  clockIn: string | null;
  clockOut: string | null;
}

interface ParsedPayrollReport {
  employeeName: string;
  totalPayout: number;
  jobsPayout: number;
  adjustmentsPayout: number;
  totalHours: number;
  avgPayPerHour: number;
  estimatedHours: number;
  jobs: ParsedJobLine[];
  adjustments: ParsedAdjustment[];
}

// The scheduling platform exports one sheet per cleaner for the pay period,
// each starting with a literal "Payroll report" cell, an info row (name,
// employee ID, date range), a totals row, then a per-job table and a
// per-adjustment table. Returns null if this sheet isn't in that format,
// so callers can fall back to the plain 3-column layout.
function parsePayrollReportSheet(rows: string[][]): ParsedPayrollReport | null {
  if (rows[0]?.[0] !== "Payroll report") return null;

  const infoRow = rows[1] ?? [];
  const cleanerIdx = infoRow.indexOf("Cleaner");
  const employeeName = cleanerIdx >= 0 ? (infoRow[cleanerIdx + 1] ?? "").trim() : "";

  const totalsLabelRow = rows[2] ?? [];
  const totalsValueRow = rows[3] ?? [];
  const totals: Record<string, number> = {};
  totalsLabelRow.forEach((label, i) => {
    const n = parseFloat(totalsValueRow[i] ?? "");
    if (label && Number.isFinite(n)) totals[label] = n;
  });

  const jobHeaderIdx = rows.findIndex((r) => r[0] === "Job ID");
  const adjHeaderIdx = rows.findIndex((r) => r[0] === "ID" && r[1] === "Amount");

  const jobRows = jobHeaderIdx >= 0 ? rows.slice(jobHeaderIdx + 1, adjHeaderIdx >= 0 ? adjHeaderIdx : undefined) : [];
  const adjRows = adjHeaderIdx >= 0 ? rows.slice(adjHeaderIdx + 1) : [];

  const jobs: ParsedJobLine[] = jobRows
    .filter((r) => r[0])
    .map((r) => ({
      jobExternalId: r[0],
      customer: r[1] ?? "",
      serviceType: r[2] ?? "",
      performedDate: parseReportDate(r[3] ?? ""),
      clockIn: r[4] ?? "",
      clockOut: r[5] ?? "",
      actualTimeHours: parseFloat(r[6] ?? "") || 0,
      serviceTimeHours: parseFloat(r[7] ?? "") || 0,
      payout: parseFloat(r[8] ?? "") || 0,
      notes: (r[9] ?? "").trim() || null,
    }));

  const adjustments: ParsedAdjustment[] = adjRows
    .filter((r) => r[0])
    .map((r) => ({
      sourceId: r[0],
      amount: parseFloat(r[1] ?? "") || 0,
      hours: parseFloat(r[2] ?? "") || 0,
      type: r[3] ?? "",
      description: (r[4] ?? "").trim(),
      date: parseReportDate(r[5] ?? ""),
      clockIn: (r[6] ?? "").trim() || null,
      clockOut: (r[7] ?? "").trim() || null,
    }));

  return {
    employeeName,
    totalPayout: totals["Payout"] ?? 0,
    jobsPayout: totals["Jobs"] ?? 0,
    adjustmentsPayout: totals["Adjustments"] ?? 0,
    totalHours: totals["Time"] ?? 0,
    avgPayPerHour: totals["Average Pay Per Hour"] ?? 0,
    estimatedHours: totals["Estimated time"] ?? 0,
    jobs,
    adjustments,
  };
}

// The report's own "Time" total only covers on-the-clock job time — drive
// time between jobs comes through separately as a "Travel Time" adjustment
// line, so it has to be added in by hand to get the real number of hours
// worked. Matched loosely against the adjustment type string (as exported
// by the scheduling platform) rather than an exact literal, so it still
// catches it if that label varies slightly (e.g. "Travel", "Travel Time").
function sumTravelHours(adjustments: ParsedAdjustment[]): number {
  return adjustments.filter((a) => /travel/i.test(a.type)).reduce((sum, a) => sum + a.hours, 0);
}

// Creates/updates the entry and replaces its job/adjustment line items —
// shared by both the auto-match path and the manual "attach to employee"
// path below, so a report is applied identically either way.
async function applyPayrollReportToEmployee(
  payPeriodId: string,
  employeeId: string,
  report: ParsedPayrollReport
): Promise<void> {
  const regularHours = report.totalHours + sumTravelHours(report.adjustments);

  const entry = await prisma.payrollEntry.upsert({
    where: { payPeriodId_employeeId: { payPeriodId, employeeId } },
    create: {
      payPeriodId,
      employeeId,
      regularHours,
      overtimeHours: 0,
      totalPayout: report.totalPayout,
      jobsPayout: report.jobsPayout,
      adjustmentsPayout: report.adjustmentsPayout,
      totalHours: report.totalHours,
      avgPayPerHour: report.avgPayPerHour,
      estimatedHours: report.estimatedHours,
    },
    update: {
      regularHours,
      overtimeHours: 0,
      totalPayout: report.totalPayout,
      jobsPayout: report.jobsPayout,
      adjustmentsPayout: report.adjustmentsPayout,
      totalHours: report.totalHours,
      avgPayPerHour: report.avgPayPerHour,
      estimatedHours: report.estimatedHours,
      status: "PENDING",
      signedAt: null,
      signedName: null,
      signedPdfDataUrl: null,
      signatureReminderSentAt: null,
      disputeNote: null,
      disputedAt: null,
      resolutionNotes: null,
      resolvedAt: null,
    },
  });

  await prisma.payrollJobLine.deleteMany({ where: { payrollEntryId: entry.id } });
  await prisma.payrollAdjustment.deleteMany({ where: { payrollEntryId: entry.id } });

  if (report.jobs.length > 0) {
    await prisma.payrollJobLine.createMany({
      data: report.jobs.map((j) => ({ payrollEntryId: entry.id, ...j })),
    });
  }
  if (report.adjustments.length > 0) {
    await prisma.payrollAdjustment.createMany({
      data: report.adjustments.map((a) => ({ payrollEntryId: entry.id, ...a })),
    });
  }
}

// Prisma's Json column can't hold Date objects, so the report is flattened
// to ISO strings before being stashed and rebuilt on the way back out.
interface StashedReport extends Omit<ParsedPayrollReport, "jobs" | "adjustments"> {
  jobs: (Omit<ParsedJobLine, "performedDate"> & { performedDate: string | null })[];
  adjustments: (Omit<ParsedAdjustment, "date"> & { date: string | null })[];
}

function stashReport(report: ParsedPayrollReport): StashedReport {
  return {
    ...report,
    jobs: report.jobs.map((j) => ({ ...j, performedDate: j.performedDate ? j.performedDate.toISOString() : null })),
    adjustments: report.adjustments.map((a) => ({ ...a, date: a.date ? a.date.toISOString() : null })),
  };
}

function unstashReport(data: StashedReport): ParsedPayrollReport {
  return {
    ...data,
    jobs: data.jobs.map((j) => ({ ...j, performedDate: j.performedDate ? new Date(j.performedDate) : null })),
    adjustments: data.adjustments.map((a) => ({ ...a, date: a.date ? new Date(a.date) : null })),
  };
}

// Employees aren't identified by email in this report format, only by
// full name — match case/whitespace-insensitively against the roster's
// name or any alias HR has attached (see attachUnmatchedPayrollReport).
// A name that matches no one is held in PayrollUnmatchedReport rather than
// dropped, so HR can manually attach it instead of re-uploading the file.
async function importPayrollReport(payPeriodId: string, report: ParsedPayrollReport): Promise<string | null> {
  const name = report.employeeName.trim().toLowerCase();
  if (!name) return "A sheet is missing the cleaner's name.";

  const employees = await prisma.user.findMany({
    where: { isTestAccount: false, active: true },
    select: { id: true, name: true, payrollAliasNames: true },
  });
  const employee = employees.find(
    (e) => e.name.trim().toLowerCase() === name || e.payrollAliasNames.some((a) => a.trim().toLowerCase() === name)
  );

  if (!employee) {
    await prisma.payrollUnmatchedReport.upsert({
      where: { payPeriodId_rawName: { payPeriodId, rawName: report.employeeName } },
      create: { payPeriodId, rawName: report.employeeName, reportData: stashReport(report) as object },
      update: { reportData: stashReport(report) as object },
    });
    return `No employee found named "${report.employeeName}" — attach it to the right employee below.`;
  }

  await applyPayrollReportToEmployee(payPeriodId, employee.id, report);
  return null;
}

export interface UnmatchedPayrollReportRow {
  id: string;
  rawName: string;
  createdAt: string;
}

export async function getUnmatchedPayrollReports(payPeriodId: string): Promise<UnmatchedPayrollReportRow[]> {
  const rows = await prisma.payrollUnmatchedReport.findMany({
    where: { payPeriodId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, rawName: r.rawName, createdAt: r.createdAt.toISOString() }));
}

export async function getAttachableEmployees() {
  return prisma.user.findMany({
    where: { role: "TRAINEE", active: true, isTestAccount: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

// Applies the stashed report to the chosen employee and remembers the raw
// "Cleaner" name as a permanent alias on their account, so the same name
// auto-matches on every future import instead of needing this every time.
export async function attachUnmatchedPayrollReport(unmatchedId: string, employeeId: string): Promise<string | null> {
  const unmatched = await prisma.payrollUnmatchedReport.findUnique({ where: { id: unmatchedId } });
  if (!unmatched) return "That unmatched report no longer exists — it may have already been attached or dismissed.";

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, payrollAliasNames: true },
  });
  if (!employee) return "That employee could not be found.";

  const report = unstashReport(unmatched.reportData as unknown as StashedReport);
  await applyPayrollReportToEmployee(unmatched.payPeriodId, employeeId, report);

  const alias = unmatched.rawName.trim();
  const hasAlias = employee.payrollAliasNames.some((a) => a.trim().toLowerCase() === alias.toLowerCase());
  if (!hasAlias) {
    await prisma.user.update({
      where: { id: employeeId },
      data: { payrollAliasNames: { push: alias } },
    });
  }

  await prisma.payrollUnmatchedReport.delete({ where: { id: unmatchedId } });
  return null;
}

export async function dismissUnmatchedPayrollReport(unmatchedId: string): Promise<void> {
  await prisma.payrollUnmatchedReport.delete({ where: { id: unmatchedId } });
}

// Expected columns: email, regularHours, overtimeHours (overtime optional,
// defaults to 0). An optional header row starting with "email" is skipped.
// Any hours change on an existing entry re-opens it for the employee's
// review (clears a prior signature or dispute) since the numbers changed.
async function importPayrollRows(payPeriodId: string, initialRows: string[][]): Promise<CsvImportResult> {
  let rows = initialRows;
  if (rows[0]?.[0]?.toLowerCase() === "email") rows = rows.slice(1);

  const errors: string[] = [];
  let imported = 0;

  for (const row of rows) {
    const email = (row[0] ?? "").toLowerCase();
    const regularHours = parseFloat(row[1] ?? "");
    const overtimeHours = row[2] ? parseFloat(row[2]) : 0;

    if (!email || !Number.isFinite(regularHours)) {
      errors.push(`Skipped row "${row.join(",")}" — missing email or invalid hours.`);
      continue;
    }

    const employee = await prisma.user.findUnique({ where: { email } });
    if (!employee) {
      errors.push(`No employee found with email ${email}.`);
      continue;
    }

    await prisma.payrollEntry.upsert({
      where: { payPeriodId_employeeId: { payPeriodId, employeeId: employee.id } },
      create: { payPeriodId, employeeId: employee.id, regularHours, overtimeHours },
      update: {
        regularHours,
        overtimeHours,
        status: "PENDING",
        signedAt: null,
        signedName: null,
        signedPdfDataUrl: null,
        signatureReminderSentAt: null,
        disputeNote: null,
        disputedAt: null,
        resolutionNotes: null,
        resolvedAt: null,
      },
    });
    imported += 1;
  }

  return { imported, errors };
}

export async function importPayrollCsv(payPeriodId: string, text: string): Promise<CsvImportResult> {
  return importPayrollRows(payPeriodId, parseCsv(text));
}

export async function importPayrollExcel(
  payPeriodId: string,
  buffer: ArrayBuffer
): Promise<CsvImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const firstSheet = workbook.worksheets[0];
  if (!firstSheet) return { imported: 0, errors: ["The uploaded file has no sheets."] };

  const looksLikeReportWorkbook = firstSheet.getRow(1).getCell(1).value === "Payroll report";
  if (!looksLikeReportWorkbook) {
    return importPayrollRows(payPeriodId, sheetToRows(firstSheet));
  }

  const errors: string[] = [];
  let imported = 0;
  for (const worksheet of workbook.worksheets) {
    const report = parsePayrollReportSheet(sheetToRows(worksheet));
    if (!report) {
      errors.push(`Skipped sheet "${worksheet.name}" — not a recognized payroll report format.`);
      continue;
    }
    const error = await importPayrollReport(payPeriodId, report);
    if (error) errors.push(`${worksheet.name}: ${error}`);
    else imported += 1;
  }
  return { imported, errors };
}
