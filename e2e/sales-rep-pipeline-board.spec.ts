import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for "give the Sales Rep role the pipeline board": /sales/leads
// must show BOTH the Kanban pipeline board (LeadPipelineBoard) AND the
// existing Leads & Callbacks table for SALES_REP, purely because of the
// role — no per-user special-casing anywhere. The pipeline board surfaces
// nothing a Sales Rep doesn't already see in her own table (no
// costs/labor/profit/margins/Actuals), and her existing stage-advance
// ability (setLeadStageAction, unrestricted for SALES_REP) must work from
// the board exactly as it already does for every other role.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const SALES_REP_EMAIL = `pipeline-salesrep-${RUN_ID}@example.com`;
const SALES_REP_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Sales Rep gets the pipeline board, role-gated", () => {
  let salesRepId: string;
  let leadId: string;
  const ESTIMATED_VALUE = 487; // distinctive, unlikely to collide with other rendered numbers

  test.beforeAll(async () => {
    // A fresh, role-appropriate fixture user — never a hardcoded named
    // identity — proving the behavior follows the SALES_REP role alone.
    const salesRep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `Pipeline Board Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(SALES_REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    const lead = await prisma.lead.create({
      data: {
        firstName: `PipelineTest${RUN_ID}`,
        lastName: "Lead",
        email: `pipeline-lead-${RUN_ID}@example.com`,
        phone: "9495551234",
        source: "WEBSITE_FORM",
        stage: "NEW_INQUIRY",
        estimatedValue: ESTIMATED_VALUE,
      },
    });
    leadId = lead.id;
  });

  test.afterAll(async () => {
    await prisma.lead.deleteMany({ where: { id: leadId } });
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.user.deleteMany({ where: { id: salesRepId } });
    await prisma.$disconnect();
  });

  test("Sales Rep sees BOTH the pipeline board (correct columns/card) and the Leads & Callbacks table", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/leads");

    await expect(page.getByRole("heading", { name: "Pipeline Board" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Leads & Callbacks" })).toBeVisible();

    // Exact column labels from LEAD_PIPELINE_COLUMNS.
    for (const label of ["New Inquiry", "Contacted", "Quoted", "Won"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // The fixture lead's card shows up in the New Inquiry column.
    const card = page.locator("div", { hasText: `PipelineTest${RUN_ID} Lead` }).first();
    await expect(card).toBeVisible();

    // The approved sales number (estimatedValue) is visible somewhere on
    // the page (board card or table), but no owner-only financial term
    // ever appears.
    const html = await page.content();
    expect(html).toContain(String(ESTIMATED_VALUE));
    for (const forbidden of ["Profit", "Margin", "Labor Cost", "Actuals"]) {
      expect(html).not.toContain(forbidden);
    }
  });

  test("Clicking the pipeline board's stage-advance button actually moves the lead", async ({ page }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/leads");

    const card = page.locator("div", { hasText: `PipelineTest${RUN_ID} Lead` }).first();
    await card.getByRole("button", { name: /Mark Contacted/ }).click();
    await page.waitForTimeout(1000);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(after.stage).toBe("CONTACTED");
  });
});
