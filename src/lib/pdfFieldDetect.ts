// Locates where a "Signature: ____" / "Date: ____" blank sits on an uploaded
// PDF so the sign flow can type the employee's name and the date directly
// onto the document itself, DocuSign-style, instead of only on a trailing
// certificate page.
//
// pdf-lib (used elsewhere in this app) has no text-position API, so this
// uses pdfjs-dist's text-content extraction, which returns each text run's
// transform (x, y in the page's own PDF-point, bottom-left-origin space —
// the same space pdf-lib draws into, so no coordinate conversion is needed).
// Rendering pages to images would need the optional `canvas` native module,
// which this app deliberately avoids — only the text layer is read here.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

export interface PdfTextLine {
  page: number; // 0-based
  x: number;
  y: number;
  width: number;
  text: string;
}

export interface DetectedField {
  page: number; // 0-based
  x: number;
  y: number;
  labelText: string;
}

export interface FieldDetectionResult {
  signature: DetectedField | null;
  date: DetectedField | null;
}

// Anchored to the END of a short line, on purpose: a field label ("Employee
// Signature:", "Employee's Signature") ends in the word, while a sentence
// that merely mentions the word ("...has the same legal effect as an
// e-signature by hand.") does not — this is what tells a real form field
// apart from body prose.
const SIGNATURE_LABEL_RE = /(signature\s*:?\s*$)|(^sign\s+(your\s+name|here)\b)/i;
const DATE_LABEL_RE = /^date\s*:?\s*$/i;
// Some PDFs render "Employee's Signature ____________ Date: ____________"
// as a single text run rather than separate label/blank/label items — the
// run of underscores is unambiguous proof it's an actual fillable blank,
// not just descriptive text, so a combo line like this is preferred over a
// bare label found elsewhere in the document (which may just be prose
// describing the form, not the blank itself).
const COMBO_LINE_RE = /signature/i;
const UNDERSCORE_RUN_RE = /_{3,}/g;

export async function extractPdfLines(pdfBytes: Buffer): Promise<PdfTextLine[]> {
  const data = new Uint8Array(pdfBytes);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const lines: PdfTextLine[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      const text = (item.str ?? "").trim();
      if (!text) continue;
      lines.push({
        page: pageNum - 1,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width ?? 0,
        text,
      });
    }
  }
  return lines;
}

// Reading order: top of page first (larger y, since y grows upward), then
// left to right, then page ascending.
function sortReadingOrder(lines: PdfTextLine[]): PdfTextLine[] {
  return [...lines].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (Math.abs(a.y - b.y) > 1) return b.y - a.y;
    return a.x - b.x;
  });
}

function findComboLine(ordered: PdfTextLine[]): FieldDetectionResult | null {
  const combo = ordered.find((l) => COMBO_LINE_RE.test(l.text) && UNDERSCORE_RUN_RE.test(l.text));
  if (!combo) return null;

  // Approximate the x position of each blank by its character offset within
  // the string, proportional to the item's total rendered width — imperfect
  // (fonts aren't monospace) but close enough to land on the right blank,
  // and always available whereas per-character positions are not.
  const xAt = (charIndex: number) => combo.x + (charIndex / combo.text.length) * combo.width;

  UNDERSCORE_RUN_RE.lastIndex = 0;
  const runs: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = UNDERSCORE_RUN_RE.exec(combo.text))) runs.push(m);
  if (!runs.length) return null;

  const dateLabelIndex = combo.text.search(/date\s*:?/i);
  let signatureRun = runs[0];
  let dateRun: RegExpExecArray | null = null;
  if (dateLabelIndex >= 0) {
    dateRun = runs.find((r) => r.index > dateLabelIndex) ?? null;
    const sigRun = runs.find((r) => r.index < dateLabelIndex);
    if (sigRun) signatureRun = sigRun;
  }

  return {
    signature: { page: combo.page, x: xAt(signatureRun.index), y: combo.y + 2, labelText: combo.text },
    date: dateRun ? { page: combo.page, x: xAt(dateRun.index), y: combo.y + 2, labelText: combo.text } : null,
  };
}

export function detectSignatureAndDateFields(lines: PdfTextLine[]): FieldDetectionResult {
  const ordered = sortReadingOrder(lines);

  const combo = findComboLine(ordered);
  if (combo) return combo;

  // A signature label is short (a form field name, not a full sentence like
  // "By signing below, the Employee acknowledges:").
  const sigLine = ordered.find((l) => l.text.length <= 40 && SIGNATURE_LABEL_RE.test(l.text));

  let signature: DetectedField | null = null;
  if (sigLine) {
    signature = {
      page: sigLine.page,
      x: sigLine.x + sigLine.width + 4,
      y: sigLine.y + 2,
      labelText: sigLine.text,
    };
  }

  // The date field that belongs to the signature is the closest "Date:"
  // label below it on the same page (smaller y, smallest gap).
  let date: DetectedField | null = null;
  const dateCandidates = ordered.filter((l) => DATE_LABEL_RE.test(l.text));
  if (sigLine) {
    let best: PdfTextLine | null = null;
    let bestGap = Infinity;
    for (const d of dateCandidates) {
      if (d.page !== sigLine.page) continue;
      const gap = sigLine.y - d.y;
      // gap 0 covers a Date label on the same line as the signature label,
      // but only if it sits to the right of it — otherwise it's a different
      // field earlier on that same line.
      if (gap === 0 && d.x <= sigLine.x) continue;
      if (gap >= 0 && gap < bestGap) {
        best = d;
        bestGap = gap;
      }
    }
    if (best) {
      date = { page: best.page, x: best.x + best.width + 4, y: best.y + 2, labelText: best.text };
    }
  } else if (dateCandidates.length) {
    const d = dateCandidates[0];
    date = { page: d.page, x: d.x + d.width + 4, y: d.y + 2, labelText: d.text };
  }

  return { signature, date };
}

export async function autoDetectPdfFields(pdfBytes: Buffer): Promise<FieldDetectionResult> {
  const lines = await extractPdfLines(pdfBytes);
  return detectSignatureAndDateFields(lines);
}
