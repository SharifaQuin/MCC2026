import ExcelJS from "exceljs";

// Reads the owner's own "MCC Finance Overview" tracker workbook (the one
// behind /financials before this app existed, and the one the
// mcc-monthly-close process still produces) and extracts one month's
// numbers straight onto the MonthlyFinancials fields — so closing a month
// that's already reconciled in that workbook is an upload, not a re-type.
//
// Deliberately NOT a Prisma write: this only returns parsed values for the
// Financials form to pre-fill, same trust model as pullFromQuickBooksAction
// (the owner still reviews and clicks Save — nothing here is persisted on
// its own).

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type FinanceOverviewFieldKey =
  | "revenueTotal"
  | "revenueCommercial"
  | "revenueResidential"
  | "cleanerTipsMemo"
  | "technicianPayroll"
  | "mileageReimbursements"
  | "supplies"
  | "cogsTotal"
  | "grossProfit"
  | "grossMarginPct"
  | "adminPayroll"
  | "rent"
  | "hiringRecruiting"
  | "fuel"
  | "insurance"
  | "vehicle"
  | "marketing"
  | "fees"
  | "misc"
  | "creditCard"
  | "loanPayoff"
  | "stripeCapitalInterest"
  | "equipmentFinancing"
  | "opexTotal"
  | "netProfit"
  | "netMarginPct"
  | "target21pct"
  | "varianceToTarget"
  | "ownerDraw"
  | "endingBankBalance";

// Checked in order, first match per row wins — the workbook's row labels
// carry extra parenthetical source notes (e.g. "Technician Payroll (PROVEN
// — Gusto Payroll Journal)"), so matching is startsWith/includes on the
// normalized (trimmed, lowercased) label rather than an exact string.
// `combine: true` fields (just `misc`) sum every matching row instead of
// only keeping the last one — the workbook has two catch-all expense rows
// ("Miscellaneous" and "Other Operating Costs") where the app has one.
const ROW_MATCHERS: { field: FinanceOverviewFieldKey; test: (label: string) => boolean; combine?: boolean }[] = [
  { field: "revenueTotal", test: (l) => l === "revenue (total)" },
  { field: "revenueCommercial", test: (l) => l.includes("commercial revenue") },
  { field: "revenueResidential", test: (l) => l.includes("residential revenue") },
  { field: "cleanerTipsMemo", test: (l) => l.includes("cleaner tips") },
  { field: "technicianPayroll", test: (l) => l.startsWith("technician payroll") },
  { field: "mileageReimbursements", test: (l) => l.startsWith("mileage") },
  { field: "supplies", test: (l) => l.startsWith("supplies") },
  { field: "cogsTotal", test: (l) => l === "total cost of goods sold" },
  { field: "grossProfit", test: (l) => l === "gross profit" },
  { field: "grossMarginPct", test: (l) => l.includes("gross margin") },
  { field: "adminPayroll", test: (l) => l.startsWith("operation / admin payroll") || l.startsWith("admin payroll") },
  { field: "rent", test: (l) => l === "rent" },
  { field: "hiringRecruiting", test: (l) => l.startsWith("hiring") },
  { field: "fuel", test: (l) => l === "fuel" },
  { field: "insurance", test: (l) => l.startsWith("insurance") },
  { field: "vehicle", test: (l) => l.startsWith("vehicle") },
  { field: "marketing", test: (l) => l.startsWith("marketing") },
  { field: "fees", test: (l) => l.startsWith("fees") },
  { field: "misc", test: (l) => l === "miscellaneous", combine: true },
  { field: "creditCard", test: (l) => l.startsWith("credit card payments") },
  { field: "misc", test: (l) => l.startsWith("other operating costs"), combine: true },
  { field: "loanPayoff", test: (l) => l === "loan payoff" },
  { field: "stripeCapitalInterest", test: (l) => l.startsWith("stripe capital loan") },
  { field: "equipmentFinancing", test: (l) => l.startsWith("equipment financing") },
  { field: "opexTotal", test: (l) => l === "total operating expenses" },
  { field: "netProfit", test: (l) => l === "net profit" },
  { field: "netMarginPct", test: (l) => l.includes("net margin") },
  { field: "target21pct", test: (l) => l.includes("target net profit") },
  { field: "varianceToTarget", test: (l) => l.startsWith("variance") },
  { field: "endingBankBalance", test: (l) => l === "ending bank balance" },
  { field: "ownerDraw", test: (l) => l.startsWith("owner draw") },
];

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("text" in value) return String((value as { text: unknown }).text);
    if ("richText" in value) {
      return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

// "Sep 2026" -> { month: "2026-09", monthLabel: "Sep" }. Also accepts a
// 3+ letter month name of any case ("September 2026") since the only part
// that matters for matching is the first three letters.
function parseMonthHeader(raw: string): { month: string; monthLabel: string } | null {
  const m = raw.trim().match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (!m) return null;
  const abbr = m[1].slice(0, 3).toLowerCase();
  const idx = MONTH_ABBR.findIndex((a) => a.toLowerCase() === abbr);
  if (idx === -1) return null;
  return { month: `${m[2]}-${String(idx + 1).padStart(2, "0")}`, monthLabel: MONTH_ABBR[idx] };
}

export interface FinanceOverviewMonthOption {
  month: string;
  monthLabel: string;
  columnNumber: number;
}

export interface FinanceOverviewParseResult {
  month: string;
  monthLabel: string;
  values: Partial<Record<FinanceOverviewFieldKey, number>>;
  // Every month column the sheet has a header for, in sheet order — used
  // both to report "available months" in an error and, when no month is
  // requested, to pick the rightmost one with real revenue data.
  availableMonths: FinanceOverviewMonthOption[];
}

export interface FinanceOverviewParseError {
  error: string;
  availableMonths?: FinanceOverviewMonthOption[];
}

// monthHint: "YYYY-MM" (what the Financials form's Month field already
// holds) — used as the target column when it matches one of the sheet's
// month headers. Left out, or not found, falls back to the rightmost
// column that actually has a Revenue (Total) value.
export async function parseFinanceOverviewWorkbook(
  buffer: ArrayBuffer,
  monthHint?: string
): Promise<FinanceOverviewParseResult | FinanceOverviewParseError> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { error: "That file doesn't look like a valid .xlsx workbook." };
  }

  const sheet = workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === "finance overview");
  if (!sheet) {
    return {
      error: 'No "Finance Overview" tab found in that workbook — is this the MCC Finance Overview tracker?',
    };
  }

  let headerRowNumber: number | null = null;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRowNumber !== null) return;
    if (cellToString(row.getCell(1).value).trim().toLowerCase() === "category") {
      headerRowNumber = rowNumber;
    }
  });
  if (headerRowNumber === null) {
    return { error: 'Couldn\'t find the "Category" header row on the Finance Overview tab.' };
  }

  const monthColumns = new Map<number, { month: string; monthLabel: string }>();
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const parsed = parseMonthHeader(cellToString(cell.value));
    if (parsed) monthColumns.set(colNumber, parsed);
  });
  if (monthColumns.size === 0) {
    return { error: 'No month columns (e.g. "Sep 2026") found next to "Category" on the Finance Overview tab.' };
  }

  let revenueRowNumber: number | null = null;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (revenueRowNumber !== null || rowNumber <= headerRowNumber!) return;
    if (cellToString(row.getCell(1).value).trim().toLowerCase() === "revenue (total)") {
      revenueRowNumber = rowNumber;
    }
  });

  const sortedColumns = [...monthColumns.entries()].sort((a, b) => a[0] - b[0]);
  const availableMonths: FinanceOverviewMonthOption[] = sortedColumns
    .filter(([colNumber]) => {
      if (revenueRowNumber === null) return true;
      return parseNumber(cellToString(sheet.getRow(revenueRowNumber).getCell(colNumber).value)) !== null;
    })
    .map(([columnNumber, m]) => ({ ...m, columnNumber }));

  if (availableMonths.length === 0) {
    return { error: "None of the month columns on the Finance Overview tab have a Revenue (Total) entered yet." };
  }

  let target = monthHint
    ? availableMonths.find((m) => m.month === monthHint)
    : undefined;
  if (!target) target = availableMonths[availableMonths.length - 1];

  const values: Partial<Record<FinanceOverviewFieldKey, number>> = {};

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber!) return;
    const rawLabel = cellToString(row.getCell(1).value);
    if (!rawLabel) return;
    const label = rawLabel.trim().toLowerCase();
    if (label.startsWith("memo")) return;

    const matcher = ROW_MATCHERS.find((m) => m.test(label));
    if (!matcher) return;

    const value = parseNumber(cellToString(row.getCell(target!.columnNumber).value));
    if (value === null) return;

    if (matcher.combine) {
      values[matcher.field] = (values[matcher.field] ?? 0) + value;
    } else {
      values[matcher.field] = value;
    }
  });

  return { month: target.month, monthLabel: target.monthLabel, values, availableMonths };
}
