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
    disputeNote: string | null;
    disputedAt: string | null;
    resolutionNotes: string | null;
    resolvedAt: string | null;
  } | null;
}

export async function getPayPeriodDetail(payPeriodId: string) {
  const payPeriod = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) return null;

  const [employees, entries] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TRAINEE", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.payrollEntry.findMany({ where: { payPeriodId } }),
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
            disputeNote: e.disputeNote,
            disputedAt: e.disputedAt ? e.disputedAt.toISOString() : null,
            resolutionNotes: e.resolutionNotes,
            resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
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
    payPeriodLabel: e.payPeriod.label,
    startDate: e.payPeriod.startDate.toISOString(),
    endDate: e.payPeriod.endDate.toISOString(),
    regularHours: e.regularHours,
    overtimeHours: e.overtimeHours,
    status: e.status,
  }));
}

export async function getPayrollEntryDetail(entryId: string, employeeId: string) {
  const entry = await prisma.payrollEntry.findUnique({
    where: { id: entryId },
    include: { payPeriod: true },
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
    disputeNote: entry.disputeNote,
    resolutionNotes: entry.resolutionNotes,
  };
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

// Expected columns: email, regularHours, overtimeHours (overtime optional,
// defaults to 0). An optional header row starting with "email" is skipped.
// Any hours change on an existing entry re-opens it for the employee's
// review (clears a prior signature or dispute) since the numbers changed.
export async function importPayrollCsv(payPeriodId: string, text: string): Promise<CsvImportResult> {
  let rows = parseCsv(text);
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
