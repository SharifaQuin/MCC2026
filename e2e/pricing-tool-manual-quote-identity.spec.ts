import { test, expect, type Page, type FrameLocator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// A3: the pricing tool's manual "Fill In By Hand" quote-entry form used to
// have no email field and unconditionally REPLACED the global `currentQuote`
// on every Generate, silently discarding whatever quote (id + clientEmail)
// was already loaded — an unsaved/orphaned quote could then be edited and
// "sent" with no way to tell its identity had been lost mid-flow. This spec
// proves the fix keeps a single quote's identity (id + recipient email)
// intact through calculator-loaded → manual edit → regenerate → save/send,
// asserting against the ACTUAL stored `quote:<id>` record via the same
// /api/sales/storage RPC the tool itself uses for persistence — not just
// what the preview UI displays, which is exactly how the original bug went
// undetected. No real email is ever sent: this test environment has no
// MS_GRAPH_* credentials configured, so src/lib/email.ts's sendEmail()
// fails closed with a clear "not configured" error before any outbound
// network call — see that file's getGraphAccessToken() guard — and the
// scenarios below that matter here (stale quote, duplicate click) are
// caught by this fix's own client-side guards before any send is attempted.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";
const FRAME_TITLE = "Pricing & Client Quotes";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function openManualBuilder(page: Page): Promise<FrameLocator> {
  await page.goto("/sales/pricing-tool");
  const frame = page.frameLocator(`iframe[title="${FRAME_TITLE}"]`);
  await frame.locator("#tabbtn-quote").click();
  const toggle = frame.locator("#builder-toggle-btn");
  await expect(toggle).toBeVisible();
  if ((await toggle.textContent())?.includes("Open")) {
    await toggle.click();
  }
  await expect(frame.locator("#f-name")).toBeVisible();
  return frame;
}

async function getStoredQuote(page: Page, id: string): Promise<Record<string, unknown> | null> {
  const res = await page.request.post("/api/sales/storage", {
    data: { op: "get", key: `quote:${id}` },
  });
  if (res.status() === 404) return null;
  if (!res.ok()) throw new Error(`storage get failed: ${res.status()}`);
  const body = await res.json();
  return JSON.parse(body.value);
}

async function seedQuote(page: Page, id: string, data: Record<string, unknown>) {
  const res = await page.request.post("/api/sales/storage", {
    data: { op: "set", key: `quote:${id}`, value: JSON.stringify(data) },
  });
  expect(res.ok()).toBeTruthy();
}

async function deleteStoredQuote(page: Page, id: string) {
  await page.request.post("/api/sales/storage", { data: { op: "delete", key: `quote:${id}` } });
}

test.describe.serial("Pricing tool: manual quote-entry flow preserves quote identity (A3)", () => {
  let salesRepId: string;
  const email = `manual-quote-identity-${RUN_ID}@example.com`;
  const createdQuoteKeys = new Set<string>();

  test.beforeAll(async () => {
    const rep = await prisma.user.create({
      data: {
        email,
        name: `Manual Quote Identity Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = rep.id;
  });

  test.afterAll(async () => {
    for (const key of createdQuoteKeys) {
      const lead = await prisma.lead.findFirst({ where: { quoteKey: key } });
      if (lead) {
        await prisma.leadStageChange.deleteMany({ where: { leadId: lead.id } });
        await prisma.lead.delete({ where: { id: lead.id } });
      }
      await prisma.salesToolData.deleteMany({ where: { key: `quote:${key}` } });
    }
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.user.deleteMany({ where: { id: salesRepId } });
    await prisma.$disconnect();
  });

  test("calculator → manual builder transition: a loaded quote's id/email survive a manual edit+regenerate+save", async ({
    page,
  }) => {
    await loginAs(page, email, PASSWORD);
    const clientName = `Jordan Rivera ${RUN_ID}`;
    const clientEmail = `jordan.rivera.${RUN_ID}@example.com`;
    const quoteId = `jordan-rivera-${RUN_ID}`;

    // Seed a saved quote directly (equivalent to having saved it from the
    // Pricing Calculator's own already-working "Save Quote" box) rather than
    // re-deriving that flow here.
    await page.goto("/sales/pricing-tool");
    await seedQuote(page, quoteId, {
      id: quoteId,
      clientName,
      clientEmail,
      service: "standard",
      frequency: "One-Time",
      low: "280.00",
      high: "280.00",
      suggested: "280.00",
      status: "pending",
      sentAt: null,
      savedAt: new Date().toISOString(),
    });
    createdQuoteKeys.add(quoteId);

    const frame = await openManualBuilder(page);
    await frame.locator("#load-id").fill(quoteId);
    await frame.getByRole("button", { name: "Load", exact: true }).click();
    await expect(frame.locator("#load-status")).toContainText(clientName);

    // The manual form now reflects the loaded quote, including identity.
    await expect(frame.locator("#f-name")).toHaveValue(clientName);
    await expect(frame.locator("#f-recipient-email")).toHaveValue(clientEmail);
    await expect(frame.locator("#f-quote-id")).toHaveValue(quoteId);

    // Edit a manual-form-only field and regenerate — must merge, not replace.
    await frame.locator("#f-city").fill("Irvine");
    await frame.getByRole("button", { name: "Preview Client Quote →" }).click();
    await expect(frame.locator("#q-location")).toContainText("Irvine");

    // Save — must update the SAME id, not fork a new quote.
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText(quoteId);
    await expect(frame.locator("#f-quote-id")).toHaveValue(quoteId);

    const stored = await getStoredQuote(page, quoteId);
    expect(stored?.id).toBe(quoteId);
    expect(stored?.clientEmail).toBe(clientEmail);
    expect(stored?.city).toBe("Irvine");

    // No second, disconnected quote was created under a different key.
    const listRes = await page.request.post("/api/sales/storage", {
      data: { op: "list", prefix: `quote:${quoteId}` },
    });
    const listBody = await listRes.json();
    expect(listBody.keys).toEqual([`quote:${quoteId}`]);
  });

  test("recipient correction persists on re-save; a missing/invalid email is rejected before save, not silently accepted", async ({
    page,
  }) => {
    await loginAs(page, email, PASSWORD);
    const clientName = `Pat Alvarez ${RUN_ID}`;
    const frame = await openManualBuilder(page);

    await frame.locator("#f-name").fill(clientName);
    await frame.locator("#f-recipient-email").fill("");
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("Enter the client's email");

    await frame.locator("#f-recipient-email").fill("not-an-email");
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("doesn't look valid");

    const correctedEmail = `pat.alvarez.${RUN_ID}@example.com`;
    await frame.locator("#f-recipient-email").fill(correctedEmail);
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("Saved");
    const id = await frame.locator("#f-quote-id").inputValue();
    expect(id).toBeTruthy();
    createdQuoteKeys.add(id);

    let stored = await getStoredQuote(page, id);
    expect(stored?.clientEmail).toBe(correctedEmail);

    // Correction: edit the already-saved quote's recipient and re-save — same id, new email.
    const updatedEmail = `pat.updated.${RUN_ID}@example.com`;
    await frame.locator("#f-recipient-email").fill(updatedEmail);
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("Saved");
    stored = await getStoredQuote(page, id);
    expect(stored?.id).toBe(id);
    expect(stored?.clientEmail).toBe(updatedEmail);
  });

  test("'New Client / Clear' actually clears id+recipient; a subsequent save creates a genuinely new, separate quote", async ({
    page,
  }) => {
    await loginAs(page, email, PASSWORD);
    const frame = await openManualBuilder(page);

    const firstName = `Casey First ${RUN_ID}`;
    const firstEmail = `casey.first.${RUN_ID}@example.com`;
    await frame.locator("#f-name").fill(firstName);
    await frame.locator("#f-recipient-email").fill(firstEmail);
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("Saved");
    const firstId = await frame.locator("#f-quote-id").inputValue();
    createdQuoteKeys.add(firstId);

    await frame.getByRole("button", { name: "New Client / Clear" }).click();
    await expect(frame.locator("#f-recipient-email")).toHaveValue("");
    await expect(frame.locator("#f-quote-id")).toHaveValue("");
    await expect(frame.locator("#f-name")).toHaveValue("");

    const secondName = `Casey Second ${RUN_ID}`;
    const secondEmail = `casey.second.${RUN_ID}@example.com`;
    await frame.locator("#f-name").fill(secondName);
    await frame.locator("#f-recipient-email").fill(secondEmail);
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("Saved");
    const secondId = await frame.locator("#f-quote-id").inputValue();
    createdQuoteKeys.add(secondId);

    expect(secondId).not.toBe(firstId);
    const first = await getStoredQuote(page, firstId);
    const second = await getStoredQuote(page, secondId);
    expect(first?.clientEmail).toBe(firstEmail);
    expect(second?.clientEmail).toBe(secondEmail);
  });

  test("Send is gated until saved; a quote deleted from storage after being loaded cannot be sent (stale context)", async ({
    page,
  }) => {
    await loginAs(page, email, PASSWORD);
    const clientName = `Morgan Stale ${RUN_ID}`;
    const clientEmail = `morgan.stale.${RUN_ID}@example.com`;
    const frame = await openManualBuilder(page);

    // Before any save, Send must be disabled and explain why — never a
    // silent no-op.
    await frame.locator("#f-name").fill(clientName);
    await frame.locator("#f-recipient-email").fill(clientEmail);
    await frame.getByRole("button", { name: "Preview Client Quote →" }).click();
    await expect(frame.locator("#sc-send-btn")).toBeDisabled();
    await expect(frame.locator("#sc-send-status")).toContainText("Save this quote");

    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("Saved");
    const id = await frame.locator("#f-quote-id").inputValue();
    createdQuoteKeys.add(id);
    await expect(frame.locator("#sc-send-btn")).toBeEnabled();

    // Simulate the quote having been deleted elsewhere while this tab still
    // holds it loaded in memory, then attempt to send — must refuse loudly,
    // not silently send or silently do nothing.
    await deleteStoredQuote(page, id);
    await frame.getByRole("button", { name: "Send Quote to Client →" }).click();
    await expect(frame.locator("#sc-send-status")).toContainText("no longer exists in storage");
  });

  test("duplicate-click on Send cannot double-send (at most one send-quote request fires)", async ({ page }) => {
    await loginAs(page, email, PASSWORD);
    const clientName = `Riley Duplicate ${RUN_ID}`;
    const clientEmail = `riley.duplicate.${RUN_ID}@example.com`;
    const frame = await openManualBuilder(page);

    await frame.locator("#f-name").fill(clientName);
    await frame.locator("#f-recipient-email").fill(clientEmail);
    await frame.getByRole("button", { name: "Preview Client Quote →" }).click();
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("Saved");
    const id = await frame.locator("#f-quote-id").inputValue();
    createdQuoteKeys.add(id);

    let sendRequestCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/sales/send-quote")) sendRequestCount++;
    });

    const sendBtn = frame.locator("#sc-send-btn");
    // Two rapid clicks — the synchronous disable-on-first-click guard must
    // keep the second one from ever reaching the fetch, regardless of how
    // slowly (or quickly, in this no-Graph-configured test environment) the
    // first click's own request resolves.
    await Promise.all([sendBtn.click(), sendBtn.click()]);
    await page.waitForTimeout(500);
    expect(sendRequestCount).toBeLessThanOrEqual(1);
  });

  test("stale/unsaved recipient edit is refused on send, not sent to the old address", async ({ page }) => {
    await loginAs(page, email, PASSWORD);
    const clientName = `Taylor Unsaved ${RUN_ID}`;
    const originalEmail = `taylor.original.${RUN_ID}@example.com`;
    const frame = await openManualBuilder(page);

    await frame.locator("#f-name").fill(clientName);
    await frame.locator("#f-recipient-email").fill(originalEmail);
    await frame.getByRole("button", { name: "Preview Client Quote →" }).click();
    await frame.getByRole("button", { name: "Save Quote →" }).click();
    await expect(frame.locator("#f-save-status")).toContainText("Saved");
    const id = await frame.locator("#f-quote-id").inputValue();
    createdQuoteKeys.add(id);

    // Edit the recipient in the manual form and regenerate the preview, but
    // do NOT save — currentQuote.clientEmail now differs from storage.
    await frame.locator("#f-recipient-email").fill(`taylor.edited-not-saved.${RUN_ID}@example.com`);
    await frame.getByRole("button", { name: "Preview Client Quote →" }).click();

    await frame.getByRole("button", { name: "Send Quote to Client →" }).click();
    await expect(frame.locator("#sc-send-status")).toContainText("save your changes before sending");

    const stored = await getStoredQuote(page, id);
    expect(stored?.clientEmail).toBe(originalEmail);
  });
});
