import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_FONT_SIZE = 11;
const LINE_HEIGHT = 16;

function wrapLine(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// No cloud storage in this app — the resulting PDF is stored the same way
// lesson images and onboarding-document uploads are: a base64 data URI in a
// Postgres column, per the pattern established elsewhere in the codebase.
export async function renderSignedDocumentPdf(opts: {
  title: string;
  bodyText: string;
  employeeName: string;
  signedName: string;
  signedAt: Date;
}): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureRoom(neededHeight: number) {
    if (y - neededHeight < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  ensureRoom(24);
  page.drawText(opts.title, { x: MARGIN, y, size: 16, font: boldFont, color: rgb(0, 0, 0) });
  y -= 28;

  const paragraphs = opts.bodyText.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    for (const rawLine of paragraph.split("\n")) {
      for (const line of wrapLine(rawLine, font, BODY_FONT_SIZE, maxWidth)) {
        ensureRoom(LINE_HEIGHT);
        page.drawText(line, { x: MARGIN, y, size: BODY_FONT_SIZE, font, color: rgb(0, 0, 0) });
        y -= LINE_HEIGHT;
      }
    }
    y -= LINE_HEIGHT / 2;
  }

  ensureRoom(LINE_HEIGHT * 4);
  y -= LINE_HEIGHT / 2;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 220, y },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 14;
  page.drawText(`Signed: ${opts.signedName}`, { x: MARGIN, y, size: BODY_FONT_SIZE, font: boldFont });
  y -= LINE_HEIGHT;
  page.drawText(`Employee: ${opts.employeeName}`, { x: MARGIN, y, size: BODY_FONT_SIZE, font });
  y -= LINE_HEIGHT;
  page.drawText(`Date: ${opts.signedAt.toLocaleString()}`, { x: MARGIN, y, size: BODY_FONT_SIZE, font });

  const bytes = await pdfDoc.save();
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}
