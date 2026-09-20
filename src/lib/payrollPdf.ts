import { PDFDocument, type PDFPage } from "pdf-lib";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN,
  BODY_FONT_SIZE,
  LINE_HEIGHT,
  HEADER_HEIGHT,
  FOOTER_Y,
  GRAY,
  drawLetterhead,
  loadLetterheadAssets,
  wrapLine,
} from "@/lib/documentPdf";
import type { PayrollAdjustmentView, PayrollJobLineView, PayrollReportTotals } from "@/lib/payroll";

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

// A PDF snapshot of a payroll entry as it looked at the moment the employee
// signed it, for HR's records — same "generate once, store the data URI"
// pattern as renderSignedDocumentPdf. Kept in its own file since the layout
// here is tabular (totals + job/adjustment line items) rather than a single
// rendered template body.
export async function renderPayrollEntryPdf(opts: {
  employeeName: string;
  payPeriodLabel: string;
  startDate: Date;
  endDate: Date;
  regularHours: number;
  overtimeHours: number;
  reportTotals: PayrollReportTotals | null;
  jobLines: PayrollJobLineView[];
  adjustments: PayrollAdjustmentView[];
  signedName: string;
  signedAt: Date;
}): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const { font, boldFont, logo } = await loadLetterheadAssets(pdfDoc);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  const pages: PDFPage[] = [];
  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  drawLetterhead(page, logo, boldFont, font);
  let y = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;

  function ensureRoom(neededHeight: number) {
    if (y - neededHeight < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      drawLetterhead(page, logo, boldFont, font);
      y = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;
    }
  }

  function drawLine(text: string, opts?: { bold?: boolean; size?: number }) {
    const size = opts?.size ?? BODY_FONT_SIZE;
    for (const line of wrapLine(text, opts?.bold ? boldFont : font, size, maxWidth)) {
      ensureRoom(LINE_HEIGHT);
      page.drawText(line, { x: MARGIN, y, size, font: opts?.bold ? boldFont : font });
      y -= LINE_HEIGHT;
    }
  }

  function drawHeading(text: string) {
    y -= LINE_HEIGHT / 2;
    drawLine(text, { bold: true });
  }

  ensureRoom(24);
  page.drawText(`Payroll Summary — ${opts.payPeriodLabel}`, { x: MARGIN, y, size: 16, font: boldFont });
  y -= 24;
  drawLine(`Employee: ${opts.employeeName}`);
  drawLine(`Pay period: ${opts.startDate.toLocaleDateString()} – ${opts.endDate.toLocaleDateString()}`);

  if (opts.reportTotals) {
    const t = opts.reportTotals;
    drawHeading("Totals");
    drawLine(`Payout: ${money(t.totalPayout)}    Jobs: ${money(t.jobsPayout)}    Adjustments: ${money(t.adjustmentsPayout)}`);
    drawLine(`Time: ${t.totalHours.toFixed(2)}h    Avg Pay/Hr: ${money(t.avgPayPerHour)}    Estimated Time: ${t.estimatedHours.toFixed(2)}h`);
  } else {
    drawHeading("Hours");
    drawLine(`Regular hours: ${opts.regularHours}    Overtime hours: ${opts.overtimeHours}`);
  }

  if (opts.jobLines.length > 0) {
    drawHeading("Jobs");
    for (const j of opts.jobLines) {
      drawLine(
        `${formatDate(j.performedDate)} — ${j.customer} (${j.serviceType}): ${j.clockIn}–${j.clockOut}, ` +
          `${j.actualTimeHours.toFixed(2)}h actual, ${j.serviceTimeHours.toFixed(2)}h service, ${money(j.payout)}`
      );
    }
  }

  if (opts.adjustments.length > 0) {
    drawHeading("Adjustments (bonuses, mileage, tips, travel time)");
    for (const a of opts.adjustments) {
      const hoursPart = a.hours !== 0 ? `, ${a.hours.toFixed(2)}h` : "";
      drawLine(`${formatDate(a.date)} — ${a.type}: ${a.description} — ${money(a.amount)}${hoursPart}`);
    }
  }

  ensureRoom(LINE_HEIGHT * 4);
  y -= LINE_HEIGHT / 2;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 220, y },
    thickness: 1,
    color: GRAY,
  });
  y -= 14;
  drawLine("I confirm that the above hours are accurate to the best of my knowledge.", { bold: true });
  drawLine(`Authorized Signature: ${opts.signedName}`);
  drawLine(`Authorized Date: ${opts.signedAt.toLocaleDateString()}`);

  if (pages.length > 1) {
    pages.forEach((p, i) => {
      p.drawText(`Page ${i + 1} of ${pages.length}`, {
        x: PAGE_WIDTH - MARGIN - 70,
        y: FOOTER_Y,
        size: 8,
        font,
        color: GRAY,
      });
    });
  }

  const bytes = await pdfDoc.save();
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}
