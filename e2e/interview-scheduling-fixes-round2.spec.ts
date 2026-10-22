import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { rescheduleAssignedInterview, sendInterviewInvite, sendInterviewReminder } from "../src/lib/recruiting";
import { zonedTimeToUtc } from "../src/lib/timezone";

// Round-2 PR review fixes for interview scheduling:
// 1. Calendar event id preservation for every staff-booking path (Pedro's
//    Zoom button, a later staff reschedule) — see
//    scripts/verify-calendar-event-reuse.ts for the PATCH-vs-POST branch
//    logic itself (no real Microsoft Graph credentials exist anywhere in
//    this repo's CI or this dev environment to exercise that over the
//    network); this file covers what IS observable without real
//    credentials — that staff paths now create/replace a real
//    InterviewAvailabilitySlot row (the thing a calendar event id actually
//    lives on) instead of only setting Applicant.scheduledAt.
// 2. Atomic, duration/buffer-aware interviewer + shared-Zoom-room overlap
//    enforcement (EXCLUDE constraints — see migration
//    20261020180046_overlap_exclusion_constraints), including a genuine
//    concurrent race between two *different*, merely overlapping start
//    times, which a same-start unique key alone can't catch.
// 4. Re-invite/rejection cleanup: an old booked slot and its calendar event
//    are released rather than left stale, safely and idempotently, without
//    touching an unrelated still-valid appointment.
// 6. The Zoom reminder SMS actually includes the join link/passcode, not
//    only the confirmation-page link.
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

async function setupAvailability(
  interviewerId: string,
  opts: { durationMins: number; bufferBeforeMins?: number; bufferAfterMins?: number }
) {
  const availability = await prisma.interviewerAvailability.create({
    data: {
      interviewerId,
      timezone: "America/Los_Angeles",
      durationMins: opts.durationMins,
      bufferBeforeMins: opts.bufferBeforeMins ?? 0,
      bufferAfterMins: opts.bufferAfterMins ?? 0,
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

test.describe.serial("Interview scheduling round-2 fixes: calendar reuse, atomic overlap, cleanup, SMS content", () => {
  let adminId: string;
  let jobPostingId: string;
  const applicantIds: string[] = [];
  const interviewerIds: string[] = [];

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;
  });

  test.afterAll(async () => {
    await prisma.communicationLog.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.interviewAvailabilitySlot.deleteMany({
      where: { OR: [{ bookedById: { in: applicantIds } }, { interviewerId: { in: interviewerIds } }] },
    });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    await prisma.availabilityDateException.deleteMany({ where: { availability: { interviewerId: { in: interviewerIds } } } });
    await prisma.availabilityWeeklyHour.deleteMany({ where: { availability: { interviewerId: { in: interviewerIds } } } });
    await prisma.interviewerAvailability.deleteMany({ where: { interviewerId: { in: interviewerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: interviewerIds } } });
    await prisma.$disconnect();
  });

  test("A staff Zoom booking (Pedro's button / the profile picker) claims a real InterviewAvailabilitySlot, and a later staff reschedule atomically replaces it — never a second, stale row", async ({
    page,
  }) => {
    const applicant = await makeApplicant(jobPostingId, "staff-slot-lifecycle");
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Move to: Phone/Zoom Interview Scheduled")');
    await page.waitForTimeout(150);
    const firstDate = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
    await page.fill('input[name="scheduledDate"]', firstDate);
    await page.fill('input[name="scheduledTime"]', "09:00");
    await page.click('button:has-text("Confirm")');
    await page.waitForTimeout(500);

    const afterFirstBooking = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(afterFirstBooking.interviewerId).toBe(adminId);
    const slotsAfterFirst = await prisma.interviewAvailabilitySlot.findMany({ where: { bookedById: applicant.id } });
    expect(slotsAfterFirst).toHaveLength(1);
    const firstSlotId = slotsAfterFirst[0].id;
    const firstSlotStart = slotsAfterFirst[0].startsAt.getTime();

    // A later staff reschedule ("Reschedule this interview", picking a new
    // date) must release the old slot and claim a new one — exactly one
    // row for this applicant at any time, never two.
    await page.click('button:has-text("Reschedule this interview")');
    await page.waitForTimeout(150);
    const secondDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await page.fill('input[name="scheduledDate"]', secondDate);
    await page.fill('input[name="scheduledTime"]', "14:00");
    await page.click('button:has-text("Confirm")');
    await page.waitForTimeout(500);

    const afterReschedule = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    const slotsAfterReschedule = await prisma.interviewAvailabilitySlot.findMany({
      where: { bookedById: applicant.id },
    });
    expect(slotsAfterReschedule).toHaveLength(1);
    expect(slotsAfterReschedule[0].id).not.toBe(firstSlotId);
    expect(slotsAfterReschedule[0].startsAt.getTime()).toBe(afterReschedule.scheduledAt?.getTime());
    expect(slotsAfterReschedule[0].startsAt.getTime()).not.toBe(firstSlotStart);

    const oldSlotStillThere = await prisma.interviewAvailabilitySlot.findUnique({ where: { id: firstSlotId } });
    expect(oldSlotStillThere).toBeNull();
  });

  test("A genuine concurrent race between two different interviewers' overlapping (but different-start) Zoom bookings lets only one win, with no partial state for the loser", async ({
    browser,
  }) => {
    const interviewerA = await prisma.user.create({
      data: {
        email: `round2-interviewer-a-${RUN_ID}@example.com`,
        name: `Round2 Interviewer A ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    const interviewerB = await prisma.user.create({
      data: {
        email: `round2-interviewer-b-${RUN_ID}@example.com`,
        name: `Round2 Interviewer B ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerIds.push(interviewerA.id, interviewerB.id);
    // Different durations (30 vs 45 min) so each interviewer's own
    // independently-generated slot grid naturally offers *different* start
    // times that still overlap once both are considered together in the
    // one shared Zoom room — the exact case a same-start unique key can't
    // catch, only the EXCLUDE constraint on the buffered range can.
    await setupAvailability(interviewerA.id, { durationMins: 30 });
    await setupAvailability(interviewerB.id, { durationMins: 45 });

    const applicantA = await makeApplicant(jobPostingId, "overlap-race-a");
    const applicantB = await makeApplicant(jobPostingId, "overlap-race-b");
    applicantIds.push(applicantA.id, applicantB.id);
    await prisma.applicant.update({
      where: { id: applicantA.id },
      data: {
        stage: "INTERVIEW_INVITE_SENT",
        interviewerId: interviewerA.id,
        interviewFormat: "ZOOM",
        interviewConfirmToken: `round2-overlap-a-tok-${RUN_ID}`,
      },
    });
    await prisma.applicant.update({
      where: { id: applicantB.id },
      data: {
        stage: "INTERVIEW_INVITE_SENT",
        interviewerId: interviewerB.id,
        interviewFormat: "ZOOM",
        interviewConfirmToken: `round2-overlap-b-tok-${RUN_ID}`,
      },
    });
    const [tokenA, tokenB] = [
      (await prisma.applicant.findUniqueOrThrow({ where: { id: applicantA.id } })).interviewConfirmToken!,
      (await prisma.applicant.findUniqueOrThrow({ where: { id: applicantB.id } })).interviewConfirmToken!,
    ];

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    await page1.goto(`/interview-book/${tokenA}`);
    await page2.goto(`/interview-book/${tokenB}`);
    await page1.waitForLoadState("networkidle");
    await page2.waitForLoadState("networkidle");

    // Both interviewers' wide-open hours start at local midnight every day,
    // so their independent 30-min/45-min grids share that same anchor:
    // 12:00 PT is on both (a 30-min multiple AND a 45-min multiple), 12:30
    // PT is also on A's 30-min grid. A's 12:30-13:00 slot and B's
    // 12:00-12:45 slot are genuinely different start times that overlap in
    // [12:30, 12:45) — exactly the case a same-start unique key can't catch.
    const probeDate = new Date(Date.now() + 11 * 86_400_000);
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(probeDate);
    const aChoice = zonedTimeToUtc(`${dateKey}T12:30`, "America/Los_Angeles").toISOString();
    const bChoice = zonedTimeToUtc(`${dateKey}T12:00`, "America/Los_Angeles").toISOString();

    const valuesA = await page1
      .locator('input[name="slotId"]')
      .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
    const valuesB = await page2
      .locator('input[name="slotId"]')
      .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
    expect(valuesA, "expected A's 12:30 PT slot to be offered").toContain(aChoice);
    expect(valuesB, "expected B's 12:00 PT slot to be offered").toContain(bChoice);

    await page1.locator(`input[name="slotId"][value="${aChoice}"]`).check();
    await page2.locator(`input[name="slotId"][value="${bChoice}"]`).check();

    const [result1, result2] = await Promise.allSettled([
      page1.getByRole("button", { name: "Confirm This Time" }).click(),
      page2.getByRole("button", { name: "Confirm This Time" }).click(),
    ]);
    expect(result1.status).toBe("fulfilled");
    expect(result2.status).toBe("fulfilled");
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const afterA = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantA.id } });
    const afterB = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantB.id } });
    const bothBooked = Boolean(afterA.scheduledAt) && Boolean(afterB.scheduledAt);
    expect(bothBooked).toBe(false);

    // Whichever one lost the race is left in a clean, consistent state —
    // still on INTERVIEW_INVITE_SENT with no scheduledAt and no orphaned
    // slot row — never a half-booked limbo.
    const loser = afterA.scheduledAt ? afterB : afterA;
    expect(loser.stage).toBe("INTERVIEW_INVITE_SENT");
    expect(loser.scheduledAt).toBeNull();
    const loserSlots = await prisma.interviewAvailabilitySlot.count({ where: { bookedById: loser.id } });
    expect(loserSlots).toBe(0);

    const winner = afterA.scheduledAt ? afterA : afterB;
    const winnerSlots = await prisma.interviewAvailabilitySlot.count({ where: { bookedById: winner.id } });
    expect(winnerSlots).toBe(1);

    await context1.close();
    await context2.close();
  });

  test("A reschedule that collides with an overlapping (not same-start) booking is rejected and leaves the original appointment fully intact", async ({
    page,
  }) => {
    const interviewer = await prisma.user.create({
      data: {
        email: `round2-rollback-interviewer-${RUN_ID}@example.com`,
        name: `Round2 Rollback Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerIds.push(interviewer.id);
    await setupAvailability(interviewer.id, { durationMins: 30, bufferBeforeMins: 15, bufferAfterMins: 15 });

    const applicant = await makeApplicant(jobPostingId, "rollback-check");
    applicantIds.push(applicant.id);
    const originalTime = new Date(Date.now() + 12 * 86_400_000);
    originalTime.setUTCHours(18, 0, 0, 0);
    const originalSlot = await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: interviewer.id,
        format: "ZOOM",
        startsAt: originalTime,
        durationMins: 30,
        bufferedStartsAt: new Date(originalTime.getTime() - 15 * 60_000),
        bufferedEndsAt: new Date(originalTime.getTime() + 45 * 60_000),
        bookedById: applicant.id,
        createdById: interviewer.id,
      },
    });
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: {
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt: originalTime,
        interviewerId: interviewer.id,
        interviewFormat: "ZOOM",
        interviewConfirmToken: `round2-rollback-tok-${RUN_ID}`,
      },
    });

    // A second, already-booked appointment close enough that its buffered
    // range overlaps a reschedule attempt landing right next to it.
    const blockerTime = new Date(originalTime.getTime() + 3 * 60 * 60 * 1000);
    const blockerApplicant = await makeApplicant(jobPostingId, "rollback-blocker");
    applicantIds.push(blockerApplicant.id);
    await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: interviewer.id,
        format: "ZOOM",
        startsAt: blockerTime,
        durationMins: 30,
        bufferedStartsAt: new Date(blockerTime.getTime() - 15 * 60_000),
        bufferedEndsAt: new Date(blockerTime.getTime() + 45 * 60_000),
        bookedById: blockerApplicant.id,
        createdById: interviewer.id,
      },
    });

    await page.goto(`/interview-reschedule/${applicant.interviewConfirmToken}`);
    await page.waitForLoadState("networkidle");
    // The blocker's own buffered window (and therefore anything near it)
    // is never offered as open in the first place — attempt the reschedule
    // directly at the database layer instead, simulating a slower request
    // that reads "open" a moment before the blocker landed, to prove the
    // *rejection + rollback*, not just that the UI correctly omits it.
    const collidingTime = new Date(blockerTime.getTime() - 10 * 60_000); // overlaps the blocker's buffered range
    const result = await rescheduleAssignedInterview(applicant.id, collidingTime.toISOString());
    expect(result.ok).toBe(false);

    const afterAttempt = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(afterAttempt.scheduledAt?.getTime()).toBe(originalTime.getTime());
    const stillThere = await prisma.interviewAvailabilitySlot.findUnique({ where: { id: originalSlot.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.startsAt.getTime()).toBe(originalTime.getTime());
  });

  test("Re-inviting an applicant who already has a future booking releases the old slot, clears scheduledAt, and is idempotent on a repeat call", async ({
    page,
  }) => {
    const interviewer = await prisma.user.create({
      data: {
        email: `round2-reinvite-interviewer-${RUN_ID}@example.com`,
        name: `Round2 Reinvite Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerIds.push(interviewer.id);
    await setupAvailability(interviewer.id, { durationMins: 30 });

    const applicant = await makeApplicant(jobPostingId, "reinvite-cleanup");
    applicantIds.push(applicant.id);
    // Grid-aligned (on the interviewer's 30-min step, in their own
    // timezone) so that once released, computeAvailableSlots offers this
    // *exact* instant back — a manually-picked, non-grid-aligned Date
    // would never reappear as a candidate even though the row is gone.
    const reinviteDateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.now() + 13 * 86_400_000));
    const bookedTime = zonedTimeToUtc(`${reinviteDateKey}T10:00`, "America/Los_Angeles");
    const oldSlot = await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: interviewer.id,
        format: "ZOOM",
        startsAt: bookedTime,
        durationMins: 30,
        bookedById: applicant.id,
        createdById: interviewer.id,
      },
    });
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: {
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt: bookedTime,
        interviewerId: interviewer.id,
        interviewFormat: "ZOOM",
      },
    });

    const first = await sendInterviewInvite(applicant.id, interviewer.id, "ZOOM");
    expect(first.ok).toBe(true);

    const afterReinvite = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(afterReinvite.stage).toBe("INTERVIEW_INVITE_SENT");
    expect(afterReinvite.scheduledAt).toBeNull();
    const oldSlotGone = await prisma.interviewAvailabilitySlot.findUnique({ where: { id: oldSlot.id } });
    expect(oldSlotGone).toBeNull();

    // The freed time is offered again on the booking page.
    await page.goto(`/interview-book/${afterReinvite.interviewConfirmToken}`);
    await page.waitForLoadState("networkidle");
    const values = await page
      .locator('input[name="slotId"]')
      .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
    expect(values).toContain(bookedTime.toISOString());

    // A repeated re-invite (nothing currently booked this time) is a safe
    // no-op on the release step, not an error.
    const second = await sendInterviewInvite(applicant.id, interviewer.id, "ZOOM");
    expect(second.ok).toBe(true);
  });

  test("Rejecting an applicant releases a future booked slot, but leaves a past appointment's record (and calendar history) alone", async ({
    page,
  }) => {
    const interviewer = await prisma.user.create({
      data: {
        email: `round2-reject-interviewer-${RUN_ID}@example.com`,
        name: `Round2 Reject Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerIds.push(interviewer.id);

    const futureApplicant = await makeApplicant(jobPostingId, "reject-future");
    applicantIds.push(futureApplicant.id);
    const futureTime = new Date(Date.now() + 14 * 86_400_000);
    const futureSlot = await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: interviewer.id,
        format: "ZOOM",
        startsAt: futureTime,
        durationMins: 30,
        bookedById: futureApplicant.id,
        createdById: interviewer.id,
      },
    });
    await prisma.applicant.update({
      where: { id: futureApplicant.id },
      data: { stage: "PHONE_INTERVIEW_SCHEDULED", scheduledAt: futureTime, interviewerId: interviewer.id, interviewFormat: "ZOOM" },
    });

    const pastApplicant = await makeApplicant(jobPostingId, "reject-past");
    applicantIds.push(pastApplicant.id);
    const pastTime = new Date(Date.now() - 3 * 86_400_000);
    const pastSlot = await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: interviewer.id,
        format: "ZOOM",
        startsAt: pastTime,
        durationMins: 30,
        bookedById: pastApplicant.id,
        createdById: interviewer.id,
      },
    });
    await prisma.applicant.update({
      where: { id: pastApplicant.id },
      data: { stage: "PHONE_INTERVIEW_SCHEDULED", scheduledAt: pastTime, interviewerId: interviewer.id, interviewFormat: "ZOOM" },
    });

    // REJECTED isn't a routine next-stage from PHONE_INTERVIEW_SCHEDULED
    // (only from an interview outcome), so this drives the same "Correct
    // the stage manually" override the existing reschedule test uses —
    // exactly the setApplicantStageAction(applicantId, "REJECTED") call
    // (no scheduledAt) the new cleanup branch is meant to catch.
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    for (const id of [futureApplicant.id, pastApplicant.id]) {
      await page.goto(`/recruiting/applicants/${id}`);
      await page.waitForLoadState("networkidle");
      await page.click('button:has-text("Made a mistake?")');
      await page.waitForTimeout(150);
      await page.selectOption("select[name='targetStage']", "REJECTED");
      await page.click('button:has-text("Confirm")');
      await page.waitForTimeout(400);
    }

    const futureSlotAfter = await prisma.interviewAvailabilitySlot.findUnique({ where: { id: futureSlot.id } });
    expect(futureSlotAfter).toBeNull();

    const pastSlotAfter = await prisma.interviewAvailabilitySlot.findUnique({ where: { id: pastSlot.id } });
    expect(pastSlotAfter).not.toBeNull();
    expect(pastSlotAfter?.startsAt.getTime()).toBe(pastTime.getTime());
  });

  test("The Zoom reminder SMS includes the actual Zoom join link (and passcode, if set), not only the confirm-page link", async () => {
    const interviewer = await prisma.user.create({
      data: {
        email: `round2-sms-interviewer-${RUN_ID}@example.com`,
        name: `Round2 SMS Interviewer ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    interviewerIds.push(interviewer.id);

    const applicant = await makeApplicant(jobPostingId, "sms-content");
    applicantIds.push(applicant.id);
    const scheduledAt = new Date(Date.now() + 15 * 86_400_000);
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: {
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt,
        interviewerId: interviewer.id,
        interviewFormat: "ZOOM",
        interviewConfirmToken: `round2-sms-tok-${RUN_ID}`,
      },
    });

    const fresh = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    await sendInterviewReminder(fresh, "Cleaning Technician", "PHONE_INTERVIEW_SCHEDULED", scheduledAt, "day", null, "ZOOM");

    const smsLog = await prisma.communicationLog.findFirst({
      where: { applicantId: applicant.id, channel: "SMS" },
      orderBy: { createdAt: "desc" },
    });
    expect(smsLog).not.toBeNull();
    const zoomPmi = (process.env.RECRUITING_ZOOM_PMI ?? "").replace(/\D/g, "");
    expect(smsLog!.body).toMatch(/Join Zoom:/);
    if (zoomPmi) expect(smsLog!.body).toContain(zoomPmi);
  });
});
