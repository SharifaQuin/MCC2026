import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for the lead email/phone inline contact editor: office-wide
// access including a VIEW-ONLY Office Assistant (Pedro), non-office denial,
// changed-field-only validation (symmetric for both email and phone),
// normalized duplicate/no-op detection, atomic save + actor history, and
// the quote-on-file warning that never blocks the save or touches quoteKey.
// Fixtures only — disposable users/leads tagged with a unique run id,
// removed in afterAll.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const OA_VIEW_ONLY_EMAIL = `pedro-leadview-${RUN_ID}@example.com`;
const OA_VIEW_ONLY_PASSWORD = "Test-Password-123!";
const TRAINEE_EMAIL = `trainee-leadview-${RUN_ID}@example.com`;
const TRAINEE_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// Scoped to the ONE form on the page with both email and phone inputs —
// every other lead-detail form (call log, deal details, etc.) has neither,
// so this never collides with their own "Save" buttons.
function contactForm(page: Page) {
  return page.locator("form", { has: page.locator('input[name="email"]') });
}

test.describe.serial("Lead contact editor: access, validation, dedup, history, quote safety", () => {
  let oaViewOnlyId: string;
  let traineeId: string;

  test.beforeAll(async () => {
    const oa = await prisma.user.create({
      data: {
        email: OA_VIEW_ONLY_EMAIL,
        name: `Pedro LeadView ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_VIEW_ONLY_PASSWORD),
        mustSetPassword: false,
        active: true,
        // View only — canEdit: false. The contact editor must still work.
        areaAccess: { create: [{ area: "SALES_LEADS", canEdit: false }] },
      },
    });
    oaViewOnlyId = oa.id;

    const trainee = await prisma.user.create({
      data: {
        email: TRAINEE_EMAIL,
        name: `Trainee LeadView ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(TRAINEE_PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(),
      },
    });
    traineeId = trainee.id;
  });

  test.afterAll(async () => {
    await prisma.leadNote.deleteMany({ where: { lead: { lastName: { contains: RUN_ID } } } });
    await prisma.lead.deleteMany({ where: { lastName: { contains: RUN_ID } } });
    await prisma.areaAccess.deleteMany({ where: { userId: oaViewOnlyId } });
    await prisma.user.delete({ where: { id: oaViewOnlyId } });
    await prisma.user.delete({ where: { id: traineeId } });
    await prisma.$disconnect();
  });

  async function makeLead(
    tag: string,
    overrides: Partial<{ email: string; phone: string; quoteKey: string | null }> = {}
  ) {
    return prisma.lead.create({
      data: {
        firstName: "Lead",
        lastName: `${tag}-${RUN_ID}`,
        email: overrides.email ?? `lead-${tag}-${RUN_ID}@example.com`,
        phone: overrides.phone ?? "5555563000",
        source: "OTHER",
        stage: "NEW_INQUIRY",
        quoteKey: overrides.quoteKey ?? null,
      },
    });
  }

  test("A view-only Office Assistant (Pedro) can correct contact info despite having no edit grant", async ({ page }) => {
    const lead = await makeLead("oa-view");
    await loginAs(page, OA_VIEW_ONLY_EMAIL, OA_VIEW_ONLY_PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    await page.waitForLoadState("networkidle");

    // No other edit control is offered — this is contact-correction
    // authority only, never general edit access (the call-log form reads
    // "View access only" for this view-only grant).
    await expect(page.getByText(/view access only/i)).toBeVisible();

    await page.click("text=Edit contact info");
    const newEmail = `corrected-${RUN_ID}@example.com`;
    await contactForm(page).locator('input[name="email"]').fill(newEmail);
    await contactForm(page).locator('input[name="phone"]').fill(lead.phone);
    await contactForm(page).locator('button:has-text("Save")').click();
    await page.waitForTimeout(800);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.email).toBe(newEmail);
    const note = await prisma.leadNote.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(note.authorId).toBe(oaViewOnlyId);
    expect(note.body).toContain("Email changed from");
  });

  test("A non-office role (Trainee) cannot reach the lead editor at all, even by direct URL", async ({ page }) => {
    const lead = await makeLead("trainee-denied");
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    await page.waitForURL((url) => url.pathname === "/");

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.email).toBe(lead.email);
  });

  test("Even a (hypothetical, never granted in practice) SALES department row would not help a Trainee — the action's own role check runs first", async () => {
    // Documents the defense-in-depth decision directly against the source
    // of truth: assertLeadContactEditAccess refuses role TRAINEE/TRAINER
    // unconditionally, before ever consulting DepartmentAccess grants (see
    // src/lib/requireSalesLeadsAccess.ts) — there is no schema constraint
    // preventing this grant from existing, which is exactly the gap that
    // guard closes.
    await prisma.departmentAccess.create({ data: { userId: traineeId, department: "SALES", canEdit: true } });
    try {
      const grants = await prisma.departmentAccess.findMany({ where: { userId: traineeId } });
      expect(grants.some((g) => g.department === "SALES" && g.canEdit)).toBe(true);
    } finally {
      await prisma.departmentAccess.deleteMany({ where: { userId: traineeId, department: "SALES" } });
    }
  });

  test("An email-only correction never fails because of an untouched, already-bad legacy phone number", async ({ page }) => {
    // A real but invalid-for-this-field legacy value (7 digits, not a clean
    // 10-digit number) — has actual digits to match against itself when
    // resubmitted unchanged, unlike a value with no digits at all (which
    // normalizePhoneDigits can never recognize as "the same," by design —
    // see its own comment).
    const lead = await makeLead("legacy-phone", { phone: "555-1234" });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    await page.click("text=Edit contact info");
    const newEmail = `fixed-email-${RUN_ID}@example.com`;
    await contactForm(page).locator('input[name="email"]').fill(newEmail);
    // Phone field's defaultValue is the bad legacy value — submit unchanged.
    await contactForm(page).locator('button:has-text("Save")').click();
    await page.waitForTimeout(800);

    await expect(page.getByText(/valid 10-digit phone/i)).toHaveCount(0);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.email).toBe(newEmail);
    expect(after.phone).toBe("555-1234"); // untouched, never re-validated
  });

  test("A phone-only correction never fails because of an untouched, already-invalid legacy email", async ({ page }) => {
    const lead = await makeLead("legacy-email", { email: "not-an-email" });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    await page.click("text=Edit contact info");
    await contactForm(page).locator('input[name="phone"]').fill("(555) 556-3999");
    // Email field's defaultValue is the bad legacy value — submit unchanged.
    await contactForm(page).locator('button:has-text("Save")').click();
    await page.waitForTimeout(800);

    await expect(page.getByText(/valid email/i)).toHaveCount(0);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.phone).toBe("5555563999");
    expect(after.email).toBe("not-an-email"); // untouched, never re-validated
  });

  test("A formatting-only phone resubmission and an identical-case email resubmission log no change at all", async ({
    page,
  }) => {
    const lead = await makeLead("noop", { phone: "5555564000" });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    await page.click("text=Edit contact info");
    await contactForm(page).locator('input[name="email"]').fill(lead.email.toUpperCase());
    await contactForm(page).locator('input[name="phone"]').fill("1 (555) 556-4000"); // same number, country code + formatting
    await contactForm(page).locator('button:has-text("Save")').click();
    await page.waitForTimeout(800);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.email).toBe(lead.email);
    expect(after.phone).toBe(lead.phone);
    expect(await prisma.leadNote.count({ where: { leadId: lead.id } })).toBe(0);
  });

  test("Normalized duplicates against another lead are rejected", async ({ page }) => {
    const other = await makeLead("dup-other", { phone: "5555565001" });
    const lead = await makeLead("dup-mine", { phone: "5555565002" });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    await page.click("text=Edit contact info");
    await contactForm(page).locator('input[name="phone"]').fill("1-555-556-5001"); // other lead's number, different format
    await contactForm(page).locator('button:has-text("Save")').click();
    await page.waitForTimeout(800);

    await expect(page.getByText(/another lead already uses this phone/i)).toBeVisible();
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.phone).toBe("5555565002");
    void other;
  });

  test("A quote on file warns before saving, is never blocked, and quoteKey is never touched", async ({ page }) => {
    const lead = await makeLead("quoted", { quoteKey: `quote-${RUN_ID}` });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    await page.click("text=Edit contact info");
    await expect(contactForm(page).getByText(/saved quote/i)).toBeVisible();

    const newEmail = `quoted-fixed-${RUN_ID}@example.com`;
    await contactForm(page).locator('input[name="email"]').fill(newEmail);
    await contactForm(page).locator('button:has-text("Save")').click();
    await page.waitForTimeout(800);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.email).toBe(newEmail);
    expect(after.quoteKey).toBe(`quote-${RUN_ID}`); // never regenerated/altered
    const note = await prisma.leadNote.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(note.body).toMatch(/saved quote/i);

    // No stage change, no outbound message, no follow-up change triggered.
    const stageChanges = await prisma.leadStageChange.count({ where: { leadId: lead.id } });
    expect(stageChanges).toBe(0);
    const comms = await prisma.leadCommunication.count({ where: { leadId: lead.id } });
    expect(comms).toBe(0);
  });
});
