import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Editing an existing applicant's own email/phone — there was previously no
// way to fix a typo or an out-of-date number after the fact. Deliberately
// narrow feature: it only ever touches Applicant.email/phone plus a visible
// internal-history entry. It never resends any message, never touches
// stage/scheduledAt, and never creates/updates a calendar event. All
// fixture accounts/applicants are fake, tagged with a unique run id, and
// removed in afterAll.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const OA_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Applicant contact-info editing", () => {
  let jobPostingId: string;
  const applicantIds: string[] = [];
  const userIds: string[] = [];

  function makeApplicant(label: string, extra: Record<string, unknown> = {}) {
    return prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Fake",
        lastName: `${label}-${RUN_ID}`,
        email: `fake-${label}-${RUN_ID}@example.com`,
        phone: "5555550100",
        stage: "PRESCREEN_PASSED",
        ...extra,
      },
    });
  }

  test.beforeAll(async () => {
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;
  });

  test.afterAll(async () => {
    await prisma.interviewAvailabilitySlot.deleteMany({ where: { bookedById: { in: applicantIds } } });
    await prisma.applicantNote.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    await prisma.areaAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  test("Staff with edit access can save a new email and phone, recorded in internal history", async ({ page }) => {
    const applicant = await makeApplicant("save");
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    const newEmail = `fake-save-updated-${RUN_ID}@example.com`;
    await page.locator('input[name="email"]').fill(newEmail);
    await page.locator('input[name="phone"]').fill("(555) 555-0199");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    // The form collapses back to view mode on success, showing the new values.
    await expect(page.locator("dd", { hasText: newEmail })).toBeVisible();
    await expect(page.locator("dd", { hasText: "(555) 555-0199" })).toBeVisible();

    const updated = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(updated.email).toBe(newEmail);
    expect(updated.phone).toBe("5555550199");

    await page.getByRole("button", { name: "Notes" }).click();
    await expect(page.getByText(`Email changed from ${applicant.email} to ${newEmail}`)).toBeVisible();
    await expect(page.getByText(/Phone changed from/)).toBeVisible();
    const note = await prisma.applicantNote.findFirstOrThrow({ where: { applicantId: applicant.id } });
    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    expect(note.authorId).toBe(admin.id);
  });

  test("An invalid email is rejected with a clear error and nothing is saved", async ({ page }) => {
    const applicant = await makeApplicant("bad-email");
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    await page.locator('input[name="email"]').fill("not-an-email");
    await page.locator('input[name="phone"]').fill("5555550100");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    const unchanged = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(unchanged.email).toBe(applicant.email);
  });

  test("An invalid phone number is rejected with a clear error and nothing is saved", async ({ page }) => {
    const applicant = await makeApplicant("bad-phone");
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    await page.locator('input[name="email"]').fill(applicant.email);
    await page.locator('input[name="phone"]').fill("12345");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Enter a valid 10-digit phone number.")).toBeVisible();
    const unchanged = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(unchanged.phone).toBe(applicant.phone);
  });

  test("An email-only change succeeds even when the stored phone is a legacy format that wouldn't itself pass the 10-digit rule", async ({
    page,
  }) => {
    // A pre-existing row from before this app had any phone validation at
    // all (see formatPhone.ts) — short, not a clean 10/11 digits. The form
    // resubmits this exact value unedited (its defaultValue), so saving an
    // email change must not force it through the 10-digit acceptance check.
    const applicant = await makeApplicant("legacy-phone", { phone: "555-0100" });
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    const newEmail = `fake-legacy-phone-updated-${RUN_ID}@example.com`;
    await page.locator('input[name="email"]').fill(newEmail);
    // Phone field is left exactly as it loaded (the legacy stored value).
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Enter a valid 10-digit phone number.")).toHaveCount(0);
    const updated = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(updated.email).toBe(newEmail);
    expect(updated.phone).toBe("555-0100");

    await page.getByRole("button", { name: "Notes" }).click();
    await expect(page.getByText(`Email changed from ${applicant.email} to ${newEmail}`)).toBeVisible();
    await expect(page.getByText(/Phone changed/)).toHaveCount(0);
  });

  test("Resubmitting the stored phone in a different format (punctuation, leading country code) is a no-op — no false history entry", async ({
    page,
  }) => {
    const applicant = await makeApplicant("phone-reformat", { phone: "5555550199" });
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    await page.locator('input[name="email"]').fill(applicant.email);
    // Same number as stored, just with a leading country code and
    // punctuation — a formatting-only difference, not a real change.
    await page.locator('input[name="phone"]').fill("+1 (555) 555-0199");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    const unchanged = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(unchanged.phone).toBe("5555550199");
    const notesCount = await prisma.applicantNote.count({ where: { applicantId: applicant.id } });
    expect(notesCount).toBe(0);
  });

  test("Duplicate-phone detection catches another applicant's own punctuated, country-code-prefixed stored number", async ({
    page,
  }) => {
    const applicantA = await makeApplicant("phone-conflict-legacy-a", { phone: "5555550177" });
    applicantIds.push(applicantA.id);
    // Same real number as what A will try to change to, but stored in a
    // legacy punctuated format with a leading country code — duplicate
    // detection must still catch this, not just an exact string match.
    const applicantB = await makeApplicant("phone-conflict-legacy-b", { phone: "+1-555-555-0188" });
    applicantIds.push(applicantB.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantA.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    await page.locator('input[name="email"]').fill(applicantA.email);
    await page.locator('input[name="phone"]').fill("5555550188");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Another applicant already uses this phone number.")).toBeVisible();
    const freshA = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantA.id } });
    expect(freshA.phone).toBe("5555550177");
  });

  test("Editing to another applicant's existing email is rejected, without overwriting that applicant", async ({ page }) => {
    const applicantA = await makeApplicant("conflict-a");
    applicantIds.push(applicantA.id);
    const applicantB = await makeApplicant("conflict-b");
    applicantIds.push(applicantB.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantA.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    // Mixed case / different trim on purpose — the conflict check is
    // case-insensitive, same as the create-time duplicate check elsewhere.
    await page.locator('input[name="email"]').fill(applicantB.email.toUpperCase());
    await page.locator('input[name="phone"]').fill("5555550100");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Another applicant already uses this email address.")).toBeVisible();

    const freshA = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantA.id } });
    const freshB = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantB.id } });
    expect(freshA.email).toBe(applicantA.email);
    expect(freshB.email).toBe(applicantB.email);
  });

  test("A staff member without recruiting edit access gets no edit control at all", async ({ page }) => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    const viewer = await prisma.user.create({
      data: {
        email: `contact-edit-viewer-${RUN_ID}@example.com`,
        name: `Contact Edit Viewer ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: admin.id,
        areaAccess: { create: [{ area: "RECRUITING", canEdit: false }] },
      },
    });
    userIds.push(viewer.id);

    const applicant = await makeApplicant("view-only");
    applicantIds.push(applicant.id);

    await loginAs(page, viewer.email, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: "Edit contact info" })).toHaveCount(0);

    const unchanged = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(unchanged.email).toBe(applicant.email);
  });

  test("Resaving the exact same values is a no-op — no new history entry", async ({ page }) => {
    const applicant = await makeApplicant("noop");
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    await page.locator('input[name="email"]').fill(applicant.email);
    await page.locator('input[name="phone"]').fill(applicant.phone);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    const notesCount = await prisma.applicantNote.count({ where: { applicantId: applicant.id } });
    expect(notesCount).toBe(0);
  });

  test("Editing contact info never changes stage/scheduledAt/interviewFormat or an existing calendar event, and sends no outgoing messages", async ({
    page,
  }) => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    const scheduledAt = new Date(Date.now() + 5 * 86_400_000);
    const applicant = await makeApplicant("no-side-effects", {
      stage: "PHONE_INTERVIEW_SCHEDULED",
      scheduledAt,
      interviewFormat: "ZOOM",
    });
    applicantIds.push(applicant.id);
    await prisma.interviewAvailabilitySlot.create({
      data: {
        startsAt: scheduledAt,
        bookedById: applicant.id,
        calendarEventId: `fake-event-no-side-effects-${RUN_ID}`,
        createdById: admin.id,
      },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    await page.locator('input[name="email"]').fill(`fake-no-side-effects-updated-${RUN_ID}@example.com`);
    await page.locator('input[name="phone"]').fill("5555550177");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    const updated = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
      include: { bookedSlot: true },
    });
    expect(updated.stage).toBe("PHONE_INTERVIEW_SCHEDULED");
    expect(updated.scheduledAt?.getTime()).toBe(scheduledAt.getTime());
    expect(updated.interviewFormat).toBe("ZOOM");
    expect(updated.bookedSlot?.calendarEventId).toBe(`fake-event-no-side-effects-${RUN_ID}`);
    expect(updated.bookedSlot?.startsAt.getTime()).toBe(scheduledAt.getTime());
    // No new outgoing message of any kind — only the two rejected email/
    // phone duplicate-conflict tests ever produce zero here too, but this
    // applicant has no prior communications at all, so any count above
    // zero would mean something besides the history note sent something.
    const commCount = await prisma.communicationLog.count({ where: { applicantId: applicant.id } });
    expect(commCount).toBe(0);
  });

  test("The stale-calendar-invite warning shows only for an applicant with a real calendar event, not just a scheduled stage", async ({ page }) => {
    const scheduledApplicant = await makeApplicant("warning-shown", {
      stage: "PHONE_INTERVIEW_SCHEDULED",
      scheduledAt: new Date(Date.now() + 5 * 86_400_000),
    });
    applicantIds.push(scheduledApplicant.id);
    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    await prisma.interviewAvailabilitySlot.create({
      data: {
        startsAt: new Date(Date.now() + 5 * 86_400_000),
        bookedById: scheduledApplicant.id,
        calendarEventId: `fake-event-${RUN_ID}`,
        createdById: admin.id,
      },
    });

    // Same scheduled stage/time as above, but no real calendar event was
    // ever created for it (e.g. calendar sync is unconfigured, or every
    // create attempt has failed so far) — the warning must not fire off the
    // stage/scheduledAt alone.
    const scheduledNoEventApplicant = await makeApplicant("warning-hidden-no-event", {
      stage: "PHONE_INTERVIEW_SCHEDULED",
      scheduledAt: new Date(Date.now() + 5 * 86_400_000),
    });
    applicantIds.push(scheduledNoEventApplicant.id);

    const freshApplicant = await makeApplicant("warning-hidden");
    applicantIds.push(freshApplicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto(`/recruiting/applicants/${scheduledApplicant.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Edit contact info" }).click();
    await expect(page.getByText(/has an existing calendar invitation/)).toBeVisible();

    await page.goto(`/recruiting/applicants/${scheduledNoEventApplicant.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Edit contact info" }).click();
    await expect(page.getByText(/has an existing calendar invitation/)).toHaveCount(0);

    await page.goto(`/recruiting/applicants/${freshApplicant.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Edit contact info" }).click();
    await expect(page.getByText(/has an existing calendar invitation/)).toHaveCount(0);
  });

  test("The pre-save warning also covers a prior interview invitation/confirmation email, with no calendar event involved", async ({
    page,
  }) => {
    const emailedApplicant = await makeApplicant("warning-prior-email");
    applicantIds.push(emailedApplicant.id);
    // Mirrors exactly what sendInterviewConfirmationEmail logs for a real
    // Zoom confirmation send — same channel/direction/status/subject
    // prefix the action checks for.
    await prisma.communicationLog.create({
      data: {
        applicantId: emailedApplicant.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: "SENT",
        subject: "Your interview with Mama's Cleaning Crew — Monday at 10:00 AM Pacific Time",
        body: "placeholder",
      },
    });

    // Same shape, but the send FAILED — must not count as "already sent".
    const failedSendApplicant = await makeApplicant("warning-failed-email");
    applicantIds.push(failedSendApplicant.id);
    await prisma.communicationLog.create({
      data: {
        applicantId: failedSendApplicant.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: "FAILED",
        subject: "Your interview with Mama's Cleaning Crew — Monday at 10:00 AM Pacific Time",
        body: "placeholder",
      },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto(`/recruiting/applicants/${emailedApplicant.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Edit contact info" }).click();
    await expect(page.getByText(/already sent to this applicant/)).toBeVisible();
    // No calendar event exists for this applicant — the two warnings are
    // independent triggers, not one combined condition.
    await expect(page.getByText(/has an existing calendar invitation/)).toHaveCount(0);

    const newEmail = `fake-warning-prior-email-updated-${RUN_ID}@example.com`;
    await page.locator('input[name="email"]').fill(newEmail);
    await page.locator('input[name="phone"]').fill(emailedApplicant.phone);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Notes" }).click();
    await expect(page.getByText(/already sent to this applicant's previous email address — it was NOT resent/)).toBeVisible();
    // Saving the edit itself never sends anything — the fixture row above
    // is still the only communication on record.
    const commCount = await prisma.communicationLog.count({ where: { applicantId: emailedApplicant.id } });
    expect(commCount).toBe(1);

    await page.goto(`/recruiting/applicants/${failedSendApplicant.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Edit contact info" }).click();
    await expect(page.getByText(/already sent to this applicant/)).toHaveCount(0);
  });

  test("Editing to another applicant's existing phone is rejected, without overwriting that applicant", async ({ page }) => {
    const applicantA = await makeApplicant("phone-conflict-a", { phone: "5555550111" });
    applicantIds.push(applicantA.id);
    const applicantB = await makeApplicant("phone-conflict-b", { phone: "5555550122" });
    applicantIds.push(applicantB.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantA.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    await page.locator('input[name="email"]').fill(applicantA.email);
    // Different formatting on purpose — the conflict check compares
    // normalized 10-digit values, same as the email check is case-insensitive.
    await page.locator('input[name="phone"]').fill("(555) 555-0122");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Another applicant already uses this phone number.")).toBeVisible();

    const freshA = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantA.id } });
    const freshB = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantB.id } });
    expect(freshA.phone).toBe(applicantA.phone);
    expect(freshB.phone).toBe(applicantB.phone);
  });

  test("Cancel discards edits without saving", async ({ page }) => {
    const applicant = await makeApplicant("cancel");
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Edit contact info" }).click();
    await page.locator('input[name="email"]').fill(`fake-should-not-save-${RUN_ID}@example.com`);
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.locator('input[name="email"]')).toHaveCount(0);
    const unchanged = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(unchanged.email).toBe(applicant.email);
  });
});
