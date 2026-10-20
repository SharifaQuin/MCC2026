import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { isZoomConfigured } from "../src/lib/recruitingZoom";

// Direct Zoom-interview booking for Pedro (Office Assistant): a "Schedule
// Zoom Interview" action wherever "Invite to Interview" used to be the only
// option, reusing setApplicantStageAction for the stage/scheduledAt/
// pipeline-count effects. Sharifa has since approved automatic candidate
// confirmations for this role too (the interview-scheduling-availability
// brief), so an Office Assistant's Zoom booking now sends the same
// automatic confirmation/calendar invite any other role's booking does —
// the opposite of this suite's original assertion, which existed back when
// that send was deliberately suppressed to avoid handing out Shar's real
// Zoom passcode with no review step. OFFICE_ASSISTANT_BLOCKED_STAGES and
// the self-schedule invite are unchanged. Fixtures are fake local
// applicants only, tagged with a unique run id and removed in afterAll —
// no real candidate is contacted.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const OA_EMAIL = `pedro-zoom-oa-${RUN_ID}@example.com`;
const OA_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe("isZoomConfigured", () => {
  test("true only when a PMI or link is present", () => {
    // Explicit undefined intentionally falls through to the default
    // parameter (the real process.env.RECRUITING_ZOOM_PMI/LINK) — that's
    // the live-env-var behavior the function is meant to have, not
    // something to assert "nothing configured" with. Explicit empty
    // strings are the correct way to test the "nothing configured" case.
    expect(isZoomConfigured("", "")).toBe(false);
    expect(isZoomConfigured("123 456 7890", undefined)).toBe(true);
    expect(isZoomConfigured(undefined, "https://zoom.us/j/123")).toBe(true);
  });
});

test.describe.serial("Office Assistant direct Zoom interview booking", () => {
  let officeAssistantId: string;
  let jobPostingId: string;
  const applicantIds: string[] = [];

  test.beforeAll(async () => {
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });

    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `Pedro Zoom E2E ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: admin.id,
        areaAccess: { create: [{ area: "RECRUITING", canEdit: true }] },
      },
    });
    officeAssistantId = oa.id;
  });

  test.afterAll(async () => {
    await prisma.communicationLog.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.delete({ where: { id: officeAssistantId } });
    await prisma.$disconnect();
  });

  async function makeApplicant(label: string) {
    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Fake",
        lastName: `${label}-${RUN_ID}`,
        email: `fake-${label}-${RUN_ID}@example.com`,
        phone: "5555550100",
        stage: "PRESCREEN_PASSED",
      },
    });
    applicantIds.push(applicant.id);
    return applicant;
  }

  test("Inbox card offers Schedule Zoom Interview as primary and self-schedule invite as a labeled secondary option", async ({
    page,
  }) => {
    await makeApplicant("quickcard");
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto("/recruiting/inbox");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button", { hasText: "Schedule Zoom Interview" })).toBeVisible();
    await expect(
      page.locator("button", { hasText: "Or send a self-schedule invite instead" })
    ).toBeVisible();
  });

  test("Booking sets the scheduled stage/date, sends the automatic candidate confirmation, and updates the pipeline count", async ({
    page,
  }) => {
    const applicant = await makeApplicant("booking");
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto("/recruiting/inbox");
    await page.waitForLoadState("networkidle");

    const card = page.getByTestId(`applicant-quick-card-${applicant.id}`);
    await card.locator("button", { hasText: "Schedule Zoom Interview" }).click();
    await page.waitForTimeout(150);
    await card.locator('input[name="date"]').fill("2026-12-01");
    await card.locator('input[name="time"]').fill("10:00");
    await card.locator("button", { hasText: "Book" }).click();
    await page.waitForURL((url) => url.pathname === `/recruiting/applicants/${applicant.id}`);

    const updated = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(updated.stage).toBe("PHONE_INTERVIEW_SCHEDULED");
    expect(updated.scheduledAt).not.toBeNull();
    expect(updated.interviewFormat).toBe("ZOOM");
    expect(updated.interviewerId).toBe(officeAssistantId);

    // Sharifa has approved automatic Zoom confirmations for an Office
    // Assistant's own booking, same as every other role — this used to be
    // suppressed and is the core change this feature makes.
    const comms = await prisma.communicationLog.findMany({ where: { applicantId: applicant.id } });
    expect(comms.length).toBeGreaterThan(0);
    const emailComm = comms.find((c) => c.channel === "EMAIL");
    expect(emailComm?.body).toContain("Zoom");
    expect(emailComm?.body).not.toMatch(/Brookhollow|office|arrive/i);

    await expect(page.getByText(/Phone\/Zoom Interview Scheduled:.*PT/)).toBeVisible();

    // Pipeline board reflects the new stage/count.
    await page.goto("/recruiting");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(`Fake booking-${RUN_ID}`)).toBeVisible();
  });

  test("Office Assistant restrictions on Offer Sent/Hired/Rejected/Talent Pool still hold after a Zoom booking", async ({
    page,
  }) => {
    const applicant = await makeApplicant("restricted");
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { stage: "PHONE_INTERVIEW_SCHEDULED", scheduledAt: new Date("2026-12-01T18:00:00Z") },
    });

    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    const visibleMoves = await page.locator("button", { hasText: "Move to:" }).allTextContents();
    for (const blocked of ["Offer Sent", "Hired", "Reject", "Bench"]) {
      expect(visibleMoves.some((m) => m.includes(blocked))).toBe(false);
    }

    // The manual "Correct the stage manually" override lists every stage
    // (unlike the routine Move-to buttons) and is reachable regardless of
    // role — it's the real server-side check (assertRoutineStageTransition
    // in applicants/actions.ts, unchanged by this feature) that must still
    // reject a blocked stage, not just the UI hiding its own buttons.
    await page.locator("button", { hasText: "Made a mistake?" }).click();
    await page.selectOption("select[name='targetStage']", "OFFER_SENT");
    await page.click('button:has-text("Confirm")');
    await page.waitForTimeout(500);

    const stillBlocked = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(stillBlocked.stage).toBe("PHONE_INTERVIEW_SCHEDULED");
  });

  test("A non-Office-Assistant (Admin) booking the same way still gets the automatic candidate confirmation", async ({
    page,
  }) => {
    const applicant = await makeApplicant("admin-booking");
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Move to: Phone/Zoom Interview Scheduled" }).click();
    await page.waitForTimeout(150);
    await page.fill('input[name="scheduledDate"]', "2026-12-02");
    await page.fill('input[name="scheduledTime"]', "11:00");
    await page.click('button:has-text("Confirm")');
    await page.waitForTimeout(1000);

    const comms = await prisma.communicationLog.findMany({ where: { applicantId: applicant.id } });
    expect(comms.length).toBeGreaterThan(0);
  });
});
