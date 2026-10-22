import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import {
  bookAssignedInterviewSlot,
  rescheduleAssignedInterview,
  sendInterviewReminder,
} from "../src/lib/recruiting";
import { zonedTimeToUtc, businessDateKey } from "../src/lib/timezone";

// computeAvailableSlots only ever generates slots within a 21-day horizon of
// the real current moment (see src/lib/interviewerAvailability.ts), so any
// test that books/reschedules through the real slot-generation path (as
// opposed to sendInterviewReminder, which just formats text and never
// touches availability) needs a near-term, horizon-safe date — a fixed
// future date like "2027-04-05" would always fall outside that window and
// every booking attempt would correctly refuse it as unavailable.
function nearTermDateKey(daysFromNow: number): string {
  return businessDateKey(new Date(Date.now() + daysFromNow * 86_400_000));
}

// Round-3 fixes, consolidated before PR9 can merge:
// 1. An immediate text confirmation now fires for every Zoom booking —
//    self-booked (bookAssignedInterviewSlot), staff-booked
//    (setApplicantStageAction, driven here via the real "Move to: Phone/
//    Zoom Interview Scheduled" UI), and a reschedule
//    (rescheduleAssignedInterview) — alongside the existing day/hour
//    reminders. All three share one function (sendInterviewConfirmationEmail
//    in src/lib/recruiting.ts), which is why one set of checks below covers
//    every call site.
// 2. The day-tier reminder said "tomorrow"/"mañana" for ANY interview within
//    the next 24h, including one scheduled later the same day — fixed to
//    compare calendar days (businessDateKey) instead.
// 3. A calendar create/update failure used to be entirely silent. The
//    retry/no-duplicate logic itself is proven against a mocked Graph in
//    scripts/verify-calendar-event-reuse.ts (no real Microsoft Graph
//    credentials exist anywhere in this repo's CI or this dev environment);
//    this file proves the live dashboard banner doesn't false-positive when
//    the calendar feature is simply turned off (this sandbox's actual
//    state — RECRUITING_CALENDAR_MAILBOX is unset), and that the same
//    shared Zoom join info shown to the candidate is also visible to staff.
//
// All fixture accounts/applicants are fake, tagged with a unique run id,
// and removed in afterAll. RECRUITING_ZOOM_PMI in this dev .env is a
// disposable placeholder, never a real secret.
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

async function makeApplicant(jobPostingId: string, label: string) {
  return prisma.applicant.create({
    data: {
      jobPostingId,
      firstName: "Fake",
      lastName: `${label}-${RUN_ID}`,
      email: `fake-${label}-${RUN_ID}@example.com`,
      phone: "5555550100",
      stage: "PRESCREEN_PASSED",
    },
  });
}

async function setupAvailability(interviewerId: string) {
  const availability = await prisma.interviewerAvailability.create({
    data: {
      interviewerId,
      timezone: "America/Los_Angeles",
      durationMins: 30,
      supportsZoom: true,
      supportsInPerson: true,
    },
  });
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

function latestSms(applicantId: string) {
  return prisma.communicationLog.findFirst({
    where: { applicantId, channel: "SMS" },
    orderBy: { createdAt: "desc" },
  });
}

test.describe.serial("Interview scheduling round-3 fixes: SMS confirmation, reminder wording, calendar visibility", () => {
  let jobPostingId: string;
  const applicantIds: string[] = [];
  const interviewerIds: string[] = [];

  test.beforeAll(async () => {
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;
  });

  test.afterAll(async () => {
    await prisma.communicationLog.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.interviewAvailabilitySlot.deleteMany({
      where: { OR: [{ bookedById: { in: applicantIds } }, { interviewerId: { in: interviewerIds } }] },
    });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    await prisma.availabilityWeeklyHour.deleteMany({ where: { availability: { interviewerId: { in: interviewerIds } } } });
    await prisma.interviewerAvailability.deleteMany({ where: { interviewerId: { in: interviewerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: interviewerIds } } });
    await prisma.$disconnect();
  });

  test("A self-booked Zoom interview gets an immediate SMS confirmation with the Zoom join info", async () => {
    const interviewer = await prisma.user.create({
      data: {
        email: `round3-self-interviewer-${RUN_ID}@example.com`,
        name: `Round3 Self Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerIds.push(interviewer.id);
    await setupAvailability(interviewer.id);

    const applicant = await makeApplicant(jobPostingId, "self-sms");
    applicantIds.push(applicant.id);
    const startsAt = zonedTimeToUtc(`${nearTermDateKey(5)}T10:00`, "America/Los_Angeles");
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: {
        stage: "INTERVIEW_INVITE_SENT",
        interviewerId: interviewer.id,
        interviewFormat: "ZOOM",
        interviewConfirmToken: `round3-self-sms-tok-${RUN_ID}`,
      },
    });

    const result = await bookAssignedInterviewSlot(applicant.id, startsAt.toISOString());
    expect(result.ok).toBe(true);

    const sms = await latestSms(applicant.id);
    expect(sms).not.toBeNull();
    expect(sms!.body).toMatch(/booked|confirmed/i);
    expect(sms!.body).toMatch(/Join Zoom:/);
    const zoomPmi = (process.env.RECRUITING_ZOOM_PMI ?? "").replace(/\D/g, "");
    if (zoomPmi) expect(sms!.body).toContain(zoomPmi);
  });

  test("A staff-booked Zoom interview (the real stage-move UI) also gets an immediate SMS confirmation", async ({
    page,
  }) => {
    const applicant = await makeApplicant(jobPostingId, "staff-sms");
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Move to: Phone/Zoom Interview Scheduled" }).click();
    await page.waitForTimeout(150);
    await page.fill('input[name="scheduledDate"]', nearTermDateKey(6));
    await page.fill('input[name="scheduledTime"]', "11:00");
    await page.click('button:has-text("Confirm")');
    await page.waitForTimeout(1000);

    const updated = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(updated.stage).toBe("PHONE_INTERVIEW_SCHEDULED");

    const sms = await latestSms(applicant.id);
    expect(sms).not.toBeNull();
    expect(sms!.body).toMatch(/booked|confirmed/i);
    expect(sms!.body).toMatch(/Join Zoom:/);
  });

  test("Rescheduling a Zoom interview sends a fresh SMS confirmation for the new time", async () => {
    const interviewer = await prisma.user.create({
      data: {
        email: `round3-reschedule-interviewer-${RUN_ID}@example.com`,
        name: `Round3 Reschedule Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerIds.push(interviewer.id);
    await setupAvailability(interviewer.id);

    const applicant = await makeApplicant(jobPostingId, "reschedule-sms");
    applicantIds.push(applicant.id);
    const originalStartsAt = zonedTimeToUtc(`${nearTermDateKey(7)}T10:00`, "America/Los_Angeles");
    await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: interviewer.id,
        format: "ZOOM",
        startsAt: originalStartsAt,
        durationMins: 30,
        bookedById: applicant.id,
        createdById: interviewer.id,
      },
    });
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: {
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt: originalStartsAt,
        interviewerId: interviewer.id,
        interviewFormat: "ZOOM",
        interviewConfirmToken: `round3-reschedule-sms-tok-${RUN_ID}`,
      },
    });
    const originalSms = await latestSms(applicant.id);
    expect(originalSms).toBeNull(); // nothing sent yet — the slot was inserted directly, not via a real booking path

    const newStartsAt = zonedTimeToUtc(`${nearTermDateKey(8)}T10:00`, "America/Los_Angeles");
    const result = await rescheduleAssignedInterview(applicant.id, newStartsAt.toISOString());
    expect(result.ok).toBe(true);

    const sms = await latestSms(applicant.id);
    expect(sms).not.toBeNull();
    expect(sms!.body).toMatch(/booked|confirmed/i);
    expect(sms!.body).toMatch(/Join Zoom:/);
  });

  test("The day-tier reminder says 'today'/'hoy' for a same-calendar-day interview, not 'tomorrow'/'mañana' (Zoom)", async () => {
    const applicant = await makeApplicant(jobPostingId, "wording-zoom-today");
    applicantIds.push(applicant.id);
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { interviewConfirmToken: `round3-wording-zoom-today-tok-${RUN_ID}` },
    });
    const fresh = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });

    const now = zonedTimeToUtc("2027-05-10T09:00", "America/Los_Angeles");
    const scheduledAt = zonedTimeToUtc("2027-05-10T14:00", "America/Los_Angeles"); // later the same Pacific day
    await sendInterviewReminder(fresh, "Cleaning Technician", "PHONE_INTERVIEW_SCHEDULED", scheduledAt, "day", null, "ZOOM", now);

    const emailLog = await prisma.communicationLog.findFirst({
      where: { applicantId: applicant.id, channel: "EMAIL" },
      orderBy: { createdAt: "desc" },
    });
    const smsLog = await latestSms(applicant.id);
    expect(emailLog!.body).toMatch(/\btoday\b/i);
    expect(emailLog!.body).not.toMatch(/\btomorrow\b/i);
    expect(smsLog!.body).toMatch(/\btoday\b/i);
    expect(smsLog!.body).not.toMatch(/\btomorrow\b/i);
  });

  test("The day-tier reminder says 'today'/'hoy' for a same-calendar-day interview, not 'tomorrow'/'mañana' (in-person, bilingual)", async () => {
    const applicant = await makeApplicant(jobPostingId, "wording-inperson-today");
    applicantIds.push(applicant.id);
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { interviewConfirmToken: `round3-wording-inperson-today-tok-${RUN_ID}` },
    });
    const fresh = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });

    const now = zonedTimeToUtc("2027-05-11T09:00", "America/Los_Angeles");
    const scheduledAt = zonedTimeToUtc("2027-05-11T15:00", "America/Los_Angeles");
    await sendInterviewReminder(
      fresh,
      "Cleaning Technician",
      "IN_PERSON_SCHEDULED",
      scheduledAt,
      "day",
      "Técnico de Limpieza",
      "IN_PERSON",
      now
    );

    const emailLog = await prisma.communicationLog.findFirst({
      where: { applicantId: applicant.id, channel: "EMAIL" },
      orderBy: { createdAt: "desc" },
    });
    expect(emailLog!.body).toMatch(/\btoday\b/i);
    expect(emailLog!.body).not.toMatch(/\btomorrow\b/i);
    expect(emailLog!.body).toMatch(/\bhoy\b/i);
    expect(emailLog!.body).not.toMatch(/mañana/i);
  });

  test("The day-tier reminder still says 'tomorrow'/'mañana' for a genuinely next-calendar-day interview (regression control)", async () => {
    const applicant = await makeApplicant(jobPostingId, "wording-control-tomorrow");
    applicantIds.push(applicant.id);
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { interviewConfirmToken: `round3-wording-control-tok-${RUN_ID}` },
    });
    const fresh = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });

    const now = zonedTimeToUtc("2027-05-12T20:00", "America/Los_Angeles");
    const scheduledAt = zonedTimeToUtc("2027-05-13T09:00", "America/Los_Angeles"); // next Pacific calendar day
    await sendInterviewReminder(fresh, "Cleaning Technician", "PHONE_INTERVIEW_SCHEDULED", scheduledAt, "day", null, "ZOOM", now);

    const emailLog = await prisma.communicationLog.findFirst({
      where: { applicantId: applicant.id, channel: "EMAIL" },
      orderBy: { createdAt: "desc" },
    });
    expect(emailLog!.body).toMatch(/\btomorrow\b/i);
    expect(emailLog!.body).not.toMatch(/\btoday\b/i);
  });

  test("The applicant dashboard shows the shared Zoom join info, and never a false 'calendar invite missing' problem while the calendar feature itself is off", async ({
    page,
  }) => {
    const interviewer = await prisma.user.create({
      data: {
        email: `round3-dashboard-interviewer-${RUN_ID}@example.com`,
        name: `Round3 Dashboard Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerIds.push(interviewer.id);
    await setupAvailability(interviewer.id);

    const applicant = await makeApplicant(jobPostingId, "dashboard-banner");
    applicantIds.push(applicant.id);
    const startsAt = zonedTimeToUtc(`${nearTermDateKey(9)}T10:00`, "America/Los_Angeles");
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: {
        stage: "INTERVIEW_INVITE_SENT",
        interviewerId: interviewer.id,
        interviewFormat: "ZOOM",
        interviewConfirmToken: `round3-dashboard-tok-${RUN_ID}`,
      },
    });
    const result = await bookAssignedInterviewSlot(applicant.id, startsAt.toISOString());
    expect(result.ok).toBe(true);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    // This sandbox's own .env has no RECRUITING_CALENDAR_MAILBOX configured
    // at all (confirmed before writing this test) — the calendar feature is
    // intentionally off, so the "missing" banner must never appear here;
    // it would be a false positive nagging staff about a feature nobody
    // turned on.
    await expect(page.getByText("Calendar invite missing")).toHaveCount(0);

    // The same shared-room join info just texted/emailed to the candidate
    // is also visible to staff right here — scoped to the banner itself,
    // since the communication history panel below it also quotes the same
    // link/passcode in the logged SMS/email bodies.
    const zoomBanner = page.getByText("Shared Zoom room", { exact: false });
    await expect(zoomBanner).toBeVisible();
    const zoomPmi = (process.env.RECRUITING_ZOOM_PMI ?? "").replace(/\D/g, "");
    if (zoomPmi) await expect(zoomBanner).toContainText(zoomPmi);
  });
});
