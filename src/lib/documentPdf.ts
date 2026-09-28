import fs from "fs";
import path from "path";
import crypto from "crypto";
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

export interface OnboardingSignatureStampInput {
  title: string;
  contentText: string | null;
  originalFileDataUrl: string | null;
  employeeName: string;
  employeeEmail: string;
  signedName: string;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  // Where to draw the typed name / date directly onto the original document
  // (page index is 0-based, x/y are PDF points in that page's own space) —
  // auto-detected from the PDF's text or placed manually by an admin. Either
  // may be null if no matching field exists on the document.
  sigField: { page: number; x: number; y: number } | null;
  dateField: { page: number; x: number; y: number } | null;
}

// Produces the permanent, tamper-evident signed copy for an Onboarding
// Document: the original uploaded PDF (or, if the document is plain text
// instead, that text rendered onto letterhead pages) with a signing
// certificate page appended — name, timestamp, IP, user agent, and a
// SHA-256 fingerprint of the original file so tampering with the source
// afterward would be detectable. Generated once at sign time and never
// regenerated, same as a DocuSign "completed" copy.
export async function stampOnboardingSignature(input: OnboardingSignatureStampInput): Promise<string> {
  let pdfDoc: PDFDocument;
  let originalFingerprint: string | null = null;

  if (input.originalFileDataUrl) {
    const base64 = input.originalFileDataUrl.split(",")[1] ?? "";
    const originalBytes = Buffer.from(base64, "base64");
    originalFingerprint = crypto.createHash("sha256").update(originalBytes).digest("hex");
    pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  } else {
    pdfDoc = await PDFDocument.create();
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = fs.readFileSync(path.join(process.cwd(), "public", "brand", "mcc-logo-mark.png"));
  const logo = await pdfDoc.embedPng(logoBytes);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  // A text-only document (no uploaded PDF) has no pages yet — render its
  // body onto letterhead pages first, exactly what the trainee read on
  // the sign page, so the permanent copy still contains the full text.
  if (!input.originalFileDataUrl && input.contentText) {
    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawLetterhead(page, logo, boldFont, font);
    let y = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;
    page.drawText(input.title, { x: MARGIN, y, size: 16, font: boldFont, color: rgb(0, 0, 0) });
    y -= 28;

    const paragraphs = input.contentText.split(/\n{2,}/);
    for (const paragraph of paragraphs) {
      for (const rawLine of paragraph.split("\n")) {
        for (const line of wrapLine(rawLine, font, BODY_FONT_SIZE, maxWidth)) {
          if (y - LINE_HEIGHT < MARGIN) {
            page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            drawLetterhead(page, logo, boldFont, font);
            y = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;
          }
          page.drawText(line, { x: MARGIN, y, size: BODY_FONT_SIZE, font, color: rgb(0, 0, 0) });
          y -= LINE_HEIGHT;
        }
      }
      y -= LINE_HEIGHT / 2;
    }
  }

  // Stamp the typed name and date directly onto the original document's own
  // Signature/Date blank, DocuSign-style, in addition to (never instead of)
  // the certificate page below.
  const pages = pdfDoc.getPages();
  const dateText = input.signedAt.toLocaleDateString("en-US");
  if (input.sigField && pages[input.sigField.page]) {
    pages[input.sigField.page].drawText(input.signedName, {
      x: input.sigField.x,
      y: input.sigField.y,
      size: BODY_FONT_SIZE,
      font: boldFont,
      color: NAVY,
    });
  }
  if (input.dateField && pages[input.dateField.page]) {
    pages[input.dateField.page].drawText(dateText, {
      x: input.dateField.x,
      y: input.dateField.y,
      size: BODY_FONT_SIZE,
      font: boldFont,
      color: NAVY,
    });
  }

  // The signing certificate — always its own trailing page(s), appended
  // after the original document/content, never mixed into it.
  let certPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawLetterhead(certPage, logo, boldFont, font);
  let y = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;

  certPage.drawText("Certificate of Signature", { x: MARGIN, y, size: 18, font: boldFont, color: rgb(0, 0, 0) });
  y -= 32;

  function row(label: string, value: string) {
    if (y - LINE_HEIGHT * 2 < MARGIN) {
      certPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawLetterhead(certPage, logo, boldFont, font);
      y = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;
    }
    certPage.drawText(label, { x: MARGIN, y, size: 9, font: boldFont, color: GRAY });
    y -= 13;
    for (const line of wrapLine(value, font, BODY_FONT_SIZE, maxWidth)) {
      certPage.drawText(line, { x: MARGIN, y, size: BODY_FONT_SIZE, font, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
    }
    y -= 8;
  }

  row("Document", input.title);
  row("Signed by (typed name)", input.signedName);
  row("Employee account", `${input.employeeName} (${input.employeeEmail})`);
  row("Date & time signed", input.signedAt.toLocaleString("en-US", { timeZoneName: "short" }));
  row("IP address", input.ipAddress ?? "Not captured");
  row("Browser / device", input.userAgent ?? "Not captured");
  if (originalFingerprint) {
    row("Original file fingerprint (SHA-256)", originalFingerprint);
  }

  y -= 4;
  for (const line of wrapLine(
    "By typing the name above and checking the agreement box, the signer affirmed they read and agreed to the " +
      "terms of the attached document. This certificate, together with the document it is attached to, " +
      "constitutes the complete, permanent record of that electronic signature.",
    font,
    9,
    maxWidth
  )) {
    if (y - 12 < MARGIN) {
      certPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawLetterhead(certPage, logo, boldFont, font);
      y = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;
    }
    certPage.drawText(line, { x: MARGIN, y, size: 9, font, color: GRAY });
    y -= 12;
  }

  const bytes = await pdfDoc.save();
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}
