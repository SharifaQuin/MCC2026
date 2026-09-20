import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export const PAGE_WIDTH = 612; // US Letter, points
export const PAGE_HEIGHT = 792;
export const MARGIN = 54;
export const BODY_FONT_SIZE = 11;
export const LINE_HEIGHT = 16;

export const NAVY = rgb(0x1b / 255, 0x2a / 255, 0x4a / 255);
export const GOLD = rgb(0xc9 / 255, 0xa2 / 255, 0x27 / 255);
export const GRAY = rgb(0.45, 0.45, 0.45);

const LOGO_SIZE = 28;
export const HEADER_HEIGHT = 58;
export const FOOTER_Y = 28;

export async function loadLetterheadAssets(pdfDoc: PDFDocument) {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = fs.readFileSync(path.join(process.cwd(), "public", "brand", "mcc-logo-mark.png"));
  const logo = await pdfDoc.embedPng(logoBytes);
  return { font, boldFont, logo };
}

export function drawLetterhead(page: PDFPage, logo: PDFImage, boldFont: PDFFont, font: PDFFont) {
  const logoY = PAGE_HEIGHT - MARGIN - LOGO_SIZE + 4;
  page.drawImage(logo, { x: MARGIN, y: logoY, width: LOGO_SIZE, height: LOGO_SIZE });
  page.drawText("Mama's Cleaning Crew", {
    x: MARGIN + LOGO_SIZE + 10,
    y: logoY + LOGO_SIZE / 2 - 6,
    size: 14,
    font: boldFont,
    color: NAVY,
  });
  const ruleY = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT + 12;
  page.drawLine({
    start: { x: MARGIN, y: ruleY },
    end: { x: PAGE_WIDTH - MARGIN, y: ruleY },
    thickness: 2,
    color: GOLD,
  });
  page.drawText("Mama's Cleaning Crew", { x: MARGIN, y: FOOTER_Y, size: 8, font, color: GRAY });
}

export function wrapLine(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
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

  const logoBytes = fs.readFileSync(path.join(process.cwd(), "public", "brand", "mcc-logo-mark.png"));
  const logo = await pdfDoc.embedPng(logoBytes);

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
