import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Fix: the public lead-form's Unable-to-Contact reopen (src/app/lead-form/
// actions.ts) previously read a lead's stage, then unconditionally wrote
// stage: "CONTACTED" — a classic TOCTOU race that could silently take a
// Scam-classified lead back out of Scam if the classification landed between
// that read and that write, without ever going through the explicit Restore
// action. The reopen is now atomic (prisma.$transaction wrapping a
// conditional updateMany keyed on stage: "UNABLE_TO_CONTACT", evaluated by
// the database at write time, plus the history row and note written only
// when that update actually matched) and a lost race falls through to the
// SAME active-lead/fresh-inquiry rules used everywhere else in this
// function — the inquiry is still handled, just never by clobbering
// whatever a concurrent change already decided.
//
// No real email/SMS is sent by anything here: this test environment has no
// MS_GRAPH_*/RINGCENTRAL_* credentials configured, so notifyNewLead/
// maybeSendAfterHoursAutoReply (and sendEmail/sendSms generally) fail closed
// before any outbound network call — same reasoning already established in
// e2e/lead-scam-classification.spec.ts and
// e2e/send-email-transport.spec.ts. All fixtures are throwaway rows created
// and destroyed per test.
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function fillAndSubmitLeadForm(
  page: Page,
  opts: { email: string; message?: string; serviceKey?: string }
) {
  await page.goto("/lead-form");
  await page.fill('input[name="firstName"]', "Repeat");
  await page.fill('input[name="lastName"]', "Inquiry");
  await page.fill('input[name="email"]', opts.email);
  await page.fill('input[name="phone"]', "9495557777");
  await page.selectOption('select[name="serviceInterest"]', opts.serviceKey ?? "deep");
  await page.fill('input[name="squareFootage"]', "2000");
  await page.selectOption('select[name="frequency"]', "weekly");
  await page.selectOption('select[name="howHeard"]', "REFERRAL");
  if (opts.message) {
    await page.fill('textarea[name="message"]', opts.message);
  }
  await page.click('button[type="submit"]');
  await page.waitForURL("**/lead-form/thank-you");
}

async function captureActionId(page: Page, trigger: () => Promise<void>): Promise<string> {
  let captured: string | null = null;
  const listener = (req: import("@playwright/test").Request) => {
    const header = req.headers()["next-action"];
    if (header && !captured) captured = header;
  };
  page.on("request", listener);
  await trigger();
  await page.waitForTimeout(800);
  page.off("request", listener);
  if (!captured) throw new Error("Failed to capture a Server Action id — trigger() didn't fire one.");
  return captured;
}

async function forgeAction(page: Page, path: string, actionId: string, args: unknown[]) {
  return page.request.post(path, {
    headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
}

// markLeadScamAction's own server-side guard only excludes SCAM/WON — it
// does NOT exclude UNABLE_TO_CONTACT (SCAM_ELIGIBLE_STAGES on
// LeadStageControls.tsx is UI-level politeness only, per its own comment:
// "this list just keeps the button from appearing somewhere it would only
// ever be refused" — the real guard is this action's own atomic updateMany).
// So the "Mark as Scam" button is never offered for an Unable-to-Contact
// lead today, but the server action itself doesn't refuse one — forging the
// call (same technique e2e/lead-scam-classification.spec.ts already uses
// for its own concurrency tests) is what actually exercises the real,
// server-side race this fix closes, independent of today's UI affordance.
async function classifyAsScamForged(page: Page, actionId: string, leadId: string, reason: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  return forgeAction(page, `/sales/leads/${leadId}`, actionId, [leadId, lead.updatedAt.toISOString(), reason]);
}

async function cleanupLead(leadId: string) {
  await prisma.leadNote.deleteMany({ where: { leadId } });
  await prisma.leadStageChange.deleteMany({ where: { leadId } });
  await prisma.leadCommunication.deleteMany({ where: { leadId } });
  await prisma.auditLogEntry.deleteMany({ where: { recordId: leadId } });
  await prisma.lead.deleteMany({ where: { id: leadId } });
}

test.describe.serial("Public lead-form race: Scam classification vs. Unable-to-Contact reopen", () => {
  let salesRepId: string;
  let salesRepEmail: string;
  let scamActionId: string;

  test.beforeAll(async ({ browser }) => {
    salesRepEmail = `leadform-race-rep-${RUN_ID}@example.com`;
    const rep = await prisma.user.create({
      data: {
        email: salesRepEmail,
        name: `Lead Form Race Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = rep.id;

    // Capture markLeadScamAction's real Server Action id once, via a real
    // click-through on a disposable, genuinely Scam-eligible lead — then
    // throw that scratch lead away. The captured id is reused to forge
    // calls against the actual UNABLE_TO_CONTACT race fixtures below (see
    // classifyAsScamForged's own comment for why forging, not the button,
    // is what actually exercises this fix).
    const scratchLead = await prisma.lead.create({
      data: {
        firstName: "Scratch",
        lastName: `ActionIdCapture ${RUN_ID}`,
        email: `leadform-race-scratch-${RUN_ID}@example.com`,
        phone: "9495551000",
        source: "WEBSITE_FORM",
        stage: "NEW_INQUIRY",
      },
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${scratchLead.id}`);
    scamActionId = await captureActionId(page, async () => {
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Mark as Scam" }).click();
      await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
    });
    await context.close();
    await cleanupLead(scratchLead.id);
  });

  test.afterAll(async () => {
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.user.delete({ where: { id: salesRepId } });
    await prisma.$disconnect();
  });

  test("ordinary Unable-to-Contact reopening still works: exactly one stage change and one note, no duplicate lead", async ({
    page,
  }) => {
    const email = `leadform-race-ordinary-${RUN_ID}@example.com`;
    const lead = await prisma.lead.create({
      data: {
        firstName: "Ordinary",
        lastName: `Reopen ${RUN_ID}`,
        email,
        phone: "9495551001",
        source: "WEBSITE_FORM",
        stage: "UNABLE_TO_CONTACT",
      },
    });

    try {
      await fillAndSubmitLeadForm(page, { email, message: "Trying again, please call." });

      const leads = await prisma.lead.findMany({ where: { email: { equals: email, mode: "insensitive" } } });
      expect(leads.length).toBe(1);
      expect(leads[0].id).toBe(lead.id);
      expect(leads[0].stage).toBe("CONTACTED");

      const stageChanges = await prisma.leadStageChange.findMany({
        where: { leadId: lead.id, fromStage: "UNABLE_TO_CONTACT", toStage: "CONTACTED" },
      });
      expect(stageChanges.length).toBe(1);

      const notes = await prisma.leadNote.findMany({ where: { leadId: lead.id } });
      const reopenNotes = notes.filter((n) => n.body.includes("Automatically reopened"));
      expect(reopenNotes.length).toBe(1);
      expect(reopenNotes[0].body).toContain("Trying again, please call.");
    } finally {
      await cleanupLead(lead.id);
    }
  });

  test("fresh inquiry where only an old Scam record exists: a new lead is created, the Scam record is completely untouched", async ({
    page,
  }) => {
    const email = `leadform-race-oldscam-${RUN_ID}@example.com`;
    const scamLead = await prisma.lead.create({
      data: {
        firstName: "Old",
        lastName: `Scam ${RUN_ID}`,
        email,
        phone: "9495551002",
        source: "WEBSITE_FORM",
        stage: "SCAM",
        scamReason: "Asked for a wire transfer before any walkthrough",
      },
    });
    await prisma.leadStageChange.create({
      data: { leadId: scamLead.id, fromStage: "NEW_INQUIRY", toStage: "SCAM", changedById: salesRepId },
    });
    const notesBefore = await prisma.leadNote.count({ where: { leadId: scamLead.id } });
    const stageChangesBefore = await prisma.leadStageChange.count({ where: { leadId: scamLead.id } });

    const newLeadIds: string[] = [];
    try {
      await fillAndSubmitLeadForm(page, { email, message: "Hi, interested in a quote." });

      const leads = await prisma.lead.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
      });
      expect(leads.length).toBe(2);
      newLeadIds.push(...leads.filter((l) => l.id !== scamLead.id).map((l) => l.id));

      // The Scam record is untouched — same stage, same reason, no new
      // history or notes (never a false reopening entry on it).
      const scamAfter = await prisma.lead.findUniqueOrThrow({ where: { id: scamLead.id } });
      expect(scamAfter.stage).toBe("SCAM");
      expect(scamAfter.scamReason).toBe("Asked for a wire transfer before any walkthrough");
      expect(await prisma.leadNote.count({ where: { leadId: scamLead.id } })).toBe(notesBefore);
      expect(await prisma.leadStageChange.count({ where: { leadId: scamLead.id } })).toBe(stageChangesBefore);

      // The new lead is a genuinely fresh inquiry, not a reopened one.
      const newLead = leads.find((l) => l.id !== scamLead.id)!;
      expect(newLead.stage).toBe("NEW_INQUIRY");
      expect(await prisma.leadStageChange.count({ where: { leadId: newLead.id } })).toBe(0);
      const newLeadNotes = await prisma.leadNote.findMany({ where: { leadId: newLead.id } });
      expect(newLeadNotes.some((n) => n.body.includes("Automatically reopened"))).toBe(false);
    } finally {
      await cleanupLead(scamLead.id);
      for (const id of newLeadIds) await cleanupLead(id);
    }
  });

  test("concurrent resubmissions racing to reopen the same Unable-to-Contact lead: exactly one reopen, no duplicate lead or duplicate history/notes", async ({
    browser,
  }) => {
    const email = `leadform-race-concurrent-${RUN_ID}@example.com`;
    const lead = await prisma.lead.create({
      data: {
        firstName: "Concurrent",
        lastName: `Resubmit ${RUN_ID}`,
        email,
        phone: "9495551003",
        source: "WEBSITE_FORM",
        stage: "UNABLE_TO_CONTACT",
      },
    });

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const newLeadIds: string[] = [];
    try {
      await Promise.all([
        fillAndSubmitLeadForm(pageA, { email, message: "Submission A" }),
        fillAndSubmitLeadForm(pageB, { email, message: "Submission B" }),
      ]);

      const leads = await prisma.lead.findMany({ where: { email: { equals: email, mode: "insensitive" } } });
      expect(leads.length).toBe(1);
      newLeadIds.push(...leads.filter((l) => l.id !== lead.id).map((l) => l.id));
      expect(leads[0].id).toBe(lead.id);
      expect(leads[0].stage).toBe("CONTACTED");

      const stageChanges = await prisma.leadStageChange.findMany({
        where: { leadId: lead.id, fromStage: "UNABLE_TO_CONTACT", toStage: "CONTACTED" },
      });
      expect(stageChanges.length).toBe(1);

      const reopenNotes = (await prisma.leadNote.findMany({ where: { leadId: lead.id } })).filter((n) =>
        n.body.includes("Automatically reopened")
      );
      expect(reopenNotes.length).toBe(1);
      // Whichever submission actually won the race wrote the note — either
      // message is an acceptable, self-consistent outcome; what matters is
      // there is exactly one, not a note from one and a silently dropped
      // duplicate lead from the other.
      expect(reopenNotes[0].body.includes("Submission A") || reopenNotes[0].body.includes("Submission B")).toBe(true);
    } finally {
      await contextA.close();
      await contextB.close();
      await cleanupLead(lead.id);
      for (const id of newLeadIds) await cleanupLead(id);
    }
  });

  test("Scam classification racing the lookup-to-update window: the lead can never end up both Contacted and Scam, and the inquiry is never lost", async ({
    browser,
  }) => {
    const email = `leadform-race-scam-${RUN_ID}@example.com`;
    const lead = await prisma.lead.create({
      data: {
        firstName: "Race",
        lastName: `Candidate ${RUN_ID}`,
        email,
        phone: "9495551004",
        source: "WEBSITE_FORM",
        stage: "UNABLE_TO_CONTACT",
      },
    });

    const formContext = await browser.newContext();
    const salesContext = await browser.newContext();
    const formPage = await formContext.newPage();
    const salesPage = await salesContext.newPage();
    await loginAs(salesPage, salesRepEmail, PASSWORD);

    const newLeadIds: string[] = [];
    try {
      await Promise.all([
        fillAndSubmitLeadForm(formPage, { email, message: "Please reach me this time." }),
        classifyAsScamForged(salesPage, scamActionId, lead.id, "Fake address, asked for wire transfer"),
      ]);

      const final = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      // The one invariant that must hold regardless of which side won the
      // race: never both at once (a lead silently taken back out of Scam
      // without ever going through Restore).
      expect(final.stage === "SCAM" && final.scamReason !== null).not.toBe(
        final.stage === "CONTACTED"
      );

      const allLeadsForEmail = await prisma.lead.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      newLeadIds.push(...allLeadsForEmail.filter((l) => l.id !== lead.id).map((l) => l.id));

      if (final.stage === "SCAM") {
        // Scam won: the lead must show no trace of ever having been
        // reopened, and the inquiry must still have been handled as a
        // fresh lead (never silently dropped).
        expect(final.scamReason).toBe("Fake address, asked for wire transfer");
        const stageChanges = await prisma.leadStageChange.findMany({
          where: { leadId: lead.id, toStage: "CONTACTED" },
        });
        expect(stageChanges.length).toBe(0);
        const reopenNotes = (await prisma.leadNote.findMany({ where: { leadId: lead.id } })).filter((n) =>
          n.body.includes("Automatically reopened")
        );
        expect(reopenNotes.length).toBe(0);

        expect(allLeadsForEmail.length).toBe(2);
        const freshLead = allLeadsForEmail.find((l) => l.id !== lead.id)!;
        expect(freshLead.stage).toBe("NEW_INQUIRY");
      } else {
        // Reopen won first: the Scam attempt must have been refused by its
        // own existing atomic guard (stale updatedAt), not silently
        // succeeded on top of the reopen.
        expect(final.stage).toBe("CONTACTED");
        expect(final.scamReason).toBeNull();
        const scamChanges = await prisma.leadStageChange.findMany({
          where: { leadId: lead.id, toStage: "SCAM" },
        });
        expect(scamChanges.length).toBe(0);
        const reopenNotes = (await prisma.leadNote.findMany({ where: { leadId: lead.id } })).filter((n) =>
          n.body.includes("Automatically reopened")
        );
        expect(reopenNotes.length).toBe(1);
        expect(allLeadsForEmail.length).toBe(1);
      }
    } finally {
      await formContext.close();
      await salesContext.close();
      await cleanupLead(lead.id);
      for (const id of newLeadIds) await cleanupLead(id);
    }
  });
});
