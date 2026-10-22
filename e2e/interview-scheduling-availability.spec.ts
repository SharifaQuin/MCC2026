import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { isZoomConfigured } from "../src/lib/recruitingZoom";

// Interview scheduling built around each interviewer's own recurring
// availability (src/lib/interviewerAvailability.ts) and the actual
// interview format (InterviewFormat on Applicant/InterviewAvailabilitySlot,
// never re-inferred from ApplicantStage). Covers: availability ownership/
// permission, recurring-hours + exception + buffer slot generation, self-
// booking both formats, atomic self-reschedule (claim new/release old,
// idempotent retry), interviewer + shared-Zoom-room collision prevention,
// and that Zoom content/office content never cross paths through either the
// self-service or the staff-driven ("profile reschedule") route. Local fake
// accounts/applicants only, tagged with a unique run id and removed in
// afterAll — no real candidate is contacted and RECRUITING_ZOOM_PASSCODE in
// this dev environment is a disposable placeholder, never a real secret.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
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

// Checks a slot radio whose value is comfortably (>1 day) in the future —
// never the nearest upcoming one, which can tick from future to past
// between this page's render and the booking/reschedule action's own
// re-validation a moment later, causing a spurious "that time was just
// taken" on an otherwise-correct flow.
async function checkASafelyFutureSlot(page: Page) {
  const values = await page
    .locator('input[name="slotId"]')
    .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
  const cutoff = Date.now() + 25 * 60 * 60 * 1000;
  const safeValue = values.find((v) => new Date(v).getTime() > cutoff);
  if (!safeValue) throw new Error("No comfortably-future slot was offered.");
  await page.locator(`input[name="slotId"][value="${safeValue}"]`).check();
  return safeValue;
}

async function setupWideOpenAvailability(
  interviewerId: string,
  opts: { supportsZoom: boolean; supportsInPerson: boolean; bufferBeforeMins?: number; bufferAfterMins?: number }
) {
  const availability = await prisma.interviewerAvailability.create({
    data: {
      interviewerId,
      timezone: "America/Los_Angeles",
      durationMins: 30,
      bufferBeforeMins: opts.bufferBeforeMins ?? 0,
      bufferAfterMins: opts.bufferAfterMins ?? 0,
      supportsZoom: opts.supportsZoom,
      supportsInPerson: opts.supportsInPerson,
    },
  });
  // Wide-open hours every day so the test is never at the mercy of which
  // real-world day/time it happens to run on.
  await prisma.availabilityWeeklyHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      availabilityId: availability.id,
      dayOfWeek,
      startMinute: 0,
      endMinute: 23 * 60 + 30,
    })),
  });
  return availability;
}

test.describe.serial("Interview scheduling: per-interviewer availability + self-service booking", () => {
  let adminId: string;
  let interviewerAId: string; // supports both formats
  let interviewerBId: string; // Zoom-only, used for the shared-room collision test
  let officeAssistantId: string;
  let jobPostingId: string;
  const applicantIds: string[] = [];
  const interviewerAEmail = `interviewer-a-${RUN_ID}@example.com`;
  const interviewerBEmail = `interviewer-b-${RUN_ID}@example.com`;
  const oaEmail = `oa-sched-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;

    const interviewerA = await prisma.user.create({
      data: {
        email: interviewerAEmail,
        name: `Interviewer A ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerAId = interviewerA.id;
    await setupWideOpenAvailability(interviewerAId, { supportsZoom: true, supportsInPerson: true });

    const interviewerB = await prisma.user.create({
      data: {
        email: interviewerBEmail,
        name: `Interviewer B ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerBId = interviewerB.id;
    await setupWideOpenAvailability(interviewerBId, { supportsZoom: true, supportsInPerson: false });

    const oa = await prisma.user.create({
      data: {
        email: oaEmail,
        name: `OA Sched ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: { create: [{ area: "RECRUITING", canEdit: true }] },
      },
    });
    officeAssistantId = oa.id;
  });

  test.afterAll(async () => {
    await prisma.communicationLog.deleteMany({ where: { applicantId: { in: applicantIds } } });
    // Covers both this file's own fixture interviewers AND any slot booked
    // *by* one of this run's applicants through a different interviewer
    // (e.g. the profile stage/reschedule test, which books through
    // whichever admin account is logged in — a real InterviewAvailabilitySlot
    // row now, see claimSlotAtomically in lib/recruiting.ts, not just an
    // Applicant.scheduledAt value) — otherwise a hardcoded test date leaves
    // a stale slot behind that collides with the same test on its next run.
    await prisma.interviewAvailabilitySlot.deleteMany({
      where: {
        OR: [{ interviewerId: { in: [interviewerAId, interviewerBId] } }, { bookedById: { in: applicantIds } }],
      },
    });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    await prisma.availabilityDateException.deleteMany({
      where: { availability: { interviewerId: { in: [interviewerAId, interviewerBId] } } },
    });
    await prisma.availabilityWeeklyHour.deleteMany({
      where: { availability: { interviewerId: { in: [interviewerAId, interviewerBId] } } },
    });
    await prisma.interviewerAvailability.deleteMany({
      where: { interviewerId: { in: [interviewerAId, interviewerBId] } },
    });
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.deleteMany({ where: { id: { in: [interviewerAId, interviewerBId, officeAssistantId] } } });
    await prisma.$disconnect();
  });

  async function makeInvitedApplicant(label: string, interviewerId: string, format: "ZOOM" | "IN_PERSON") {
    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Fake",
        lastName: `${label}-${RUN_ID}`,
        email: `fake-${label}-${RUN_ID}@example.com`,
        phone: "5555550100",
        stage: "INTERVIEW_INVITE_SENT",
        interviewerId,
        interviewFormat: format,
        interviewConfirmToken: `tok-${label}-${RUN_ID}`,
      },
    });
    applicantIds.push(applicant.id);
    return applicant;
  }

  test("isZoomConfigured refuses cleanly instead of sending incomplete joining details", () => {
    expect(isZoomConfigured("", "")).toBe(false);
  });

  test("An interviewer can configure their own recurring hours, buffers, and formats", async ({ page }) => {
    const soloInterviewer = await prisma.user.create({
      data: {
        email: `solo-interviewer-${RUN_ID}@example.com`,
        name: `Solo Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });

    await loginAs(page, soloInterviewer.email, PASSWORD);
    await page.goto("/recruiting/availability");
    await page.waitForLoadState("networkidle");

    await page.selectOption('select[name="timezone"]', "America/Denver");
    await page.fill('input[name="durationMins"]', "45");
    await page.fill('input[name="bufferBeforeMins"]', "10");
    await page.fill('input[name="bufferAfterMins"]', "5");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await page.waitForTimeout(500);

    const saved = await prisma.interviewerAvailability.findUnique({
      where: { interviewerId: soloInterviewer.id },
    });
    expect(saved?.timezone).toBe("America/Denver");
    expect(saved?.durationMins).toBe(45);
    expect(saved?.bufferBeforeMins).toBe(10);

    await page.reload();
    await page.selectOption('select[name="dayOfWeek"]', "1");
    await page.fill('input[name="startTime"]', "09:00");
    await page.fill('input[name="endTime"]', "17:00");
    await page.getByRole("button", { name: "Add Window" }).click();
    await page.waitForTimeout(500);

    const hours = await prisma.availabilityWeeklyHour.findMany({ where: { availabilityId: saved!.id } });
    expect(hours.length).toBe(1);
    expect(hours[0].dayOfWeek).toBe(1);
    expect(hours[0].startMinute).toBe(9 * 60);

    await prisma.availabilityWeeklyHour.deleteMany({ where: { availabilityId: saved!.id } });
    await prisma.interviewerAvailability.delete({ where: { id: saved!.id } });
    await prisma.user.delete({ where: { id: soloInterviewer.id } });
  });

  test("An Office Assistant with Recruiting edit access can configure their own availability, and only their own", async ({
    page,
  }) => {
    await loginAs(page, oaEmail, PASSWORD);
    await page.goto("/recruiting/availability");
    await page.waitForLoadState("networkidle");

    // The page is always rendered for the viewer's own id — every action on
    // it (saveAvailabilityConfigAction.bind(null, interviewerId), etc.) is
    // server-bound to session.sub, so there is no form here that could ever
    // target interviewerAId; this OA session structurally never sees or
    // touches anyone else's schedule.
    await expect(page.getByText(`Interviewer A ${RUN_ID}`)).toHaveCount(0);

    await page.selectOption('select[name="timezone"]', "America/Los_Angeles");
    await page.fill('input[name="durationMins"]', "30");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await page.waitForTimeout(500);

    const saved = await prisma.interviewerAvailability.findUnique({ where: { interviewerId: officeAssistantId } });
    expect(saved).not.toBeNull();

    const beforeCount = await prisma.availabilityWeeklyHour.count({
      where: { availability: { interviewerId: interviewerAId } },
    });
    expect(beforeCount).toBeGreaterThan(0); // the fixture's own wide-open hours, untouched

    await prisma.interviewerAvailability.delete({ where: { interviewerId: officeAssistantId } });
  });

  test("Self-booking a Zoom-assigned invite sends Zoom content, never office content", async ({ page }) => {
    const applicant = await makeInvitedApplicant("zoom-book", interviewerAId, "ZOOM");

    await page.goto(`/interview-book/${applicant.interviewConfirmToken}`);
    await page.waitForLoadState("networkidle");
    await checkASafelyFutureSlot(page);
    await page.getByRole("button", { name: "Confirm This Time" }).click();
    await expect(page.getByText("You're booked!")).toBeVisible();

    const updated = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(updated.stage).toBe("PHONE_INTERVIEW_SCHEDULED");
    expect(updated.interviewFormat).toBe("ZOOM");
    expect(updated.interviewerId).toBe(interviewerAId);
    expect(updated.scheduledAt).not.toBeNull();

    const slot = await prisma.interviewAvailabilitySlot.findFirst({ where: { bookedById: applicant.id } });
    expect(slot?.interviewerId).toBe(interviewerAId);
    expect(slot?.format).toBe("ZOOM");

    const comms = await prisma.communicationLog.findMany({ where: { applicantId: applicant.id, channel: "EMAIL" } });
    expect(comms.length).toBeGreaterThan(0);
    expect(comms[0].body).toMatch(/Zoom/i);
    expect(comms[0].body).not.toMatch(/Brookhollow|arrive|professionally dressed/i);
  });

  test("Self-booking an in-person-assigned invite sends office content, never Zoom content", async ({ page }) => {
    const applicant = await makeInvitedApplicant("inperson-book", interviewerAId, "IN_PERSON");

    await page.goto(`/interview-book/${applicant.interviewConfirmToken}`);
    await page.waitForLoadState("networkidle");
    await checkASafelyFutureSlot(page);
    await page.getByRole("button", { name: "Confirm This Time" }).click();
    await expect(page.getByText("You're booked!")).toBeVisible();

    const updated = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(updated.stage).toBe("IN_PERSON_SCHEDULED");
    expect(updated.interviewFormat).toBe("IN_PERSON");

    const comms = await prisma.communicationLog.findMany({ where: { applicantId: applicant.id, channel: "EMAIL" } });
    expect(comms.length).toBeGreaterThan(0);
    expect(comms[0].body).toMatch(/Brookhollow/i);
    expect(comms[0].body).not.toMatch(/Zoom link|Join Zoom/i);
  });

  test("Self-service reschedule atomically claims the new time and releases the old one, preserving format/interviewer", async ({
    page,
  }) => {
    const applicant = await makeInvitedApplicant("reschedule", interviewerAId, "ZOOM");

    // Book an initial time directly in the DB (equivalent to the self-book
    // flow already proven above) so this test can focus on reschedule.
    const initialSlot = await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: interviewerAId,
        format: "ZOOM",
        startsAt: new Date(Date.now() + 2 * 86_400_000),
        durationMins: 30,
        bookedById: applicant.id,
        createdById: interviewerAId,
      },
    });
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { stage: "PHONE_INTERVIEW_SCHEDULED", scheduledAt: initialSlot.startsAt },
    });

    await page.goto(`/interview-reschedule/${applicant.interviewConfirmToken}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('input[name="slotId"]').first()).toBeVisible();
    await checkASafelyFutureSlot(page);
    await page.getByRole("button", { name: "Confirm New Time" }).click();
    await expect(page.getByText("You're all set!")).toBeVisible();

    const afterFirstReschedule = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(afterFirstReschedule.interviewFormat).toBe("ZOOM");
    expect(afterFirstReschedule.interviewerId).toBe(interviewerAId);
    expect(afterFirstReschedule.scheduledAt?.getTime()).not.toBe(initialSlot.startsAt.getTime());

    // The old slot is gone (released), exactly one slot remains booked for
    // this applicant.
    const oldSlotStillThere = await prisma.interviewAvailabilitySlot.findUnique({
      where: { id: initialSlot.id },
    });
    expect(oldSlotStillThere).toBeNull();
    const slotsForApplicant = await prisma.interviewAvailabilitySlot.count({
      where: { bookedById: applicant.id },
    });
    expect(slotsForApplicant).toBe(1);

    const commsAfterFirst = await prisma.communicationLog.count({ where: { applicantId: applicant.id } });
    const slotsAfterFirst = await prisma.interviewAvailabilitySlot.count({ where: { bookedById: applicant.id } });

    // Idempotent retry: a fresh reschedule-page load still lists the
    // applicant's own current time as an option (its own booking is
    // excluded from the collision check) — re-submitting that exact same
    // time is a no-op success, not a resend, which is exactly what a
    // repeated click/retry on the same choice needs to do.
    const retryToken = (await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } }))
      .interviewConfirmToken!;
    const currentScheduledAt = (await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } }))
      .scheduledAt!;
    await page.goto(`/interview-reschedule/${retryToken}`);
    await page.waitForLoadState("networkidle");
    const sameTimeRadio = page.locator(`input[name="slotId"][value="${currentScheduledAt.toISOString()}"]`);
    await expect(sameTimeRadio).toHaveCount(1);
    await sameTimeRadio.check();
    await page.getByRole("button", { name: "Confirm New Time" }).click();
    await expect(page.getByText("You're all set!")).toBeVisible();

    const commsAfterRetry = await prisma.communicationLog.count({ where: { applicantId: applicant.id } });
    expect(commsAfterRetry).toBe(commsAfterFirst);
    const slotsAfterRetry = await prisma.interviewAvailabilitySlot.count({ where: { bookedById: applicant.id } });
    expect(slotsAfterRetry).toBe(slotsAfterFirst);
  });

  test("The same interviewer can't be double-booked at the exact same instant, even under a genuine concurrent race", async ({
    browser,
  }) => {
    const slotTime = new Date(Date.now() + 5 * 86_400_000);
    slotTime.setUTCHours(12, 0, 0, 0);
    const first = await makeInvitedApplicant("doublebook-1", interviewerAId, "ZOOM");
    const second = await makeInvitedApplicant("doublebook-2", interviewerAId, "ZOOM");

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto(`/interview-book/${first.interviewConfirmToken}`);
    await page2.goto(`/interview-book/${second.interviewConfirmToken}`);
    await page1.waitForLoadState("networkidle");
    await page2.waitForLoadState("networkidle");

    // Both candidates are offered the exact same still-open instant (wide-
    // open hours, nobody's booked it yet) — select it on both pages, then
    // submit at essentially the same moment to force a genuine race on the
    // one DB insert that can actually succeed for it.
    await page1.locator(`input[name="slotId"][value="${slotTime.toISOString()}"]`).check();
    await page2.locator(`input[name="slotId"][value="${slotTime.toISOString()}"]`).check();

    const [result1, result2] = await Promise.allSettled([
      page1.getByRole("button", { name: "Confirm This Time" }).click(),
      page2.getByRole("button", { name: "Confirm This Time" }).click(),
    ]);
    expect(result1.status).toBe("fulfilled");
    expect(result2.status).toBe("fulfilled");
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const firstAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: first.id } });
    const secondAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: second.id } });
    const bothLandedOnThatInstant =
      firstAfter.scheduledAt?.getTime() === slotTime.getTime() &&
      secondAfter.scheduledAt?.getTime() === slotTime.getTime();
    expect(bothLandedOnThatInstant).toBe(false);
    const slotCount = await prisma.interviewAvailabilitySlot.count({
      where: { interviewerId: interviewerAId, startsAt: slotTime },
    });
    expect(slotCount).toBe(1);

    await context1.close();
    await context2.close();
  });

  test("A shared Zoom room collision across two different interviewers is excluded from generated slots", async ({
    page,
  }) => {
    const bookedTime = new Date(Date.now() + 6 * 86_400_000);
    bookedTime.setUTCMinutes(0, 0, 0);
    await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: interviewerAId,
        format: "ZOOM",
        startsAt: bookedTime,
        durationMins: 30,
        bookedById: (await makeInvitedApplicant("room-collision-holder", interviewerAId, "ZOOM")).id,
        createdById: interviewerAId,
      },
    });

    const applicant = await makeInvitedApplicant("room-collision-check", interviewerBId, "ZOOM");
    await page.goto(`/interview-book/${applicant.interviewConfirmToken}`);
    await page.waitForLoadState("networkidle");

    const labels = await page.locator('input[name="slotId"]').evaluateAll((inputs) =>
      inputs.map((i) => (i as HTMLInputElement).value)
    );
    expect(labels).not.toContain(bookedTime.toISOString());
  });

  test("A date exception blocks a whole day, and extra hours open time outside the recurring schedule", async ({
    page,
  }) => {
    const soloInterviewer = await prisma.user.create({
      data: {
        email: `exception-interviewer-${RUN_ID}@example.com`,
        name: `Exception Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    const availability = await setupWideOpenAvailability(soloInterviewer.id, { supportsZoom: true, supportsInPerson: false });

    const blockedDate = new Date(Date.now() + 2 * 86_400_000);
    const blockedDateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(blockedDate);
    await prisma.availabilityDateException.create({
      data: {
        availabilityId: availability.id,
        date: new Date(`${blockedDateKey}T00:00:00.000Z`),
        type: "UNAVAILABLE",
        startMinute: null,
        endMinute: null,
      },
    });

    const applicant = await makeInvitedApplicant("exception-check", soloInterviewer.id, "ZOOM");
    await page.goto(`/interview-book/${applicant.interviewConfirmToken}`);
    await page.waitForLoadState("networkidle");

    const values = await page.locator('input[name="slotId"]').evaluateAll((inputs) =>
      inputs.map((i) => (i as HTMLInputElement).value)
    );
    const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const anyOnBlockedDate = values.some((iso) => dateKeyFormatter.format(new Date(iso)) === blockedDateKey);
    expect(anyOnBlockedDate).toBe(false);

    await prisma.availabilityDateException.deleteMany({ where: { availabilityId: availability.id } });
    await prisma.availabilityWeeklyHour.deleteMany({ where: { availabilityId: availability.id } });
    await prisma.interviewerAvailability.delete({ where: { id: availability.id } });
    await prisma.user.delete({ where: { id: soloInterviewer.id } });
  });

  test("The profile stage/reschedule route (setApplicantStageAction) never sends office content for a Zoom-format interview", async ({
    page,
  }) => {
    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Fake",
        lastName: `profile-reschedule-${RUN_ID}`,
        email: `fake-profile-reschedule-${RUN_ID}@example.com`,
        phone: "5555550100",
        stage: "PRESCREEN_PASSED",
      },
    });
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Move to: Phone/Zoom Interview Scheduled")');
    await page.waitForTimeout(150);
    await page.fill('input[name="scheduledDate"]', "2026-12-10");
    await page.fill('input[name="scheduledTime"]', "09:00");
    await page.click('button:has-text("Confirm")');
    await page.waitForTimeout(500);

    const updated = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(updated.interviewFormat).toBe("ZOOM");
    expect(updated.interviewerId).toBe(adminId);

    const comms = await prisma.communicationLog.findMany({ where: { applicantId: applicant.id, channel: "EMAIL" } });
    expect(comms.length).toBeGreaterThan(0);
    for (const c of comms) {
      expect(c.body).not.toMatch(/Brookhollow|arrive|professionally dressed/i);
    }
  });

  test("The interview-confirm page only offers self-service reschedule for an appointment with an assigned interviewer/format", async ({
    page,
  }) => {
    const legacyApplicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Legacy",
        lastName: `NoInterviewer-${RUN_ID}`,
        email: `legacy-no-interviewer-${RUN_ID}@example.com`,
        phone: "5555550100",
        stage: "IN_PERSON_SCHEDULED",
        scheduledAt: new Date(Date.now() + 7 * 86_400_000),
        interviewConfirmToken: `legacy-tok-${RUN_ID}`,
      },
    });
    applicantIds.push(legacyApplicant.id);

    await page.goto(`/interview-confirm/${legacyApplicant.interviewConfirmToken}`);
    await expect(page.getByText("Need a different time?")).toHaveCount(0);

    const assignedApplicant = await makeInvitedApplicant("confirm-link", interviewerAId, "ZOOM");
    await prisma.applicant.update({
      where: { id: assignedApplicant.id },
      data: {
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt: new Date(Date.now() + 8 * 86_400_000),
        interviewConfirmedAt: new Date(),
      },
    });
    await page.goto(`/interview-confirm/${assignedApplicant.interviewConfirmToken}`);
    await expect(page.getByText("Need a different time?")).toBeVisible();
  });
});
