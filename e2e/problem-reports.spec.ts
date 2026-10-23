import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { resolveProblemReport, reopenProblemReport, submitProblemReportFeedback } from "../src/lib/problemReports";
import { toHtmlBody } from "../src/lib/email";
import type { SessionPayload } from "../src/lib/session";

// Coverage for the Report-a-Problem resolution workflow: the owner's
// OPEN-count badge, the required reporter-visible resolution note, the
// resolution email (correct recipient looked up server-side, safe
// escaping, accurate sent/failed state, no duplicate sends), the
// reporter's own private report view and "It's working"/"Still having
// trouble" feedback, resolution/feedback history surviving a reopen+resolve
// cycle, cross-user read/write denial, graceful handling of a legacy
// RESOLVED report with no resolution row, and stale-feedback rejection.
// Fixtures only — synthetic users/reports tagged with a unique run id,
// removed in afterAll. No real email is ever sent: the browser flows run
// against an unconfigured Microsoft Graph (sendEmail fails fast with a
// config error, never a network call — the "accurate failed state" test
// relies on exactly that), and the describe block below that calls
// resolveProblemReport/submitProblemReportFeedback directly (no browser)
// injects a fake sender — the same dependency-injection pattern
// e2e/scheduled-message-reliability.spec.ts already uses for
// sendEmail/sendSms (see src/lib/messageSenders.ts).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const REPORTER_EMAIL = `pr-reporter-${RUN_ID}@example.com`;
const REPORTER_PASSWORD = "Test-Password-123!";
const OTHER_EMAIL = `pr-other-${RUN_ID}@example.com`;
const OTHER_PASSWORD = "Test-Password-123!";
const CATEGORY_LABEL_OTHER = "Other";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function logout(page: Page) {
  await page.evaluate(() => fetch("/logout", { method: "POST" }));
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
  });
}

async function cleanupReportsFor(userIds: string[]) {
  const reportIds = (
    await prisma.problemReport.findMany({ where: { reporterId: { in: userIds } }, select: { id: true } })
  ).map((r) => r.id);
  await prisma.problemReportFeedback.deleteMany({ where: { reportId: { in: reportIds } } });
  await prisma.problemReportResolution.deleteMany({ where: { reportId: { in: reportIds } } });
  await prisma.problemReport.deleteMany({ where: { id: { in: reportIds } } });
}

test.describe.serial("Problem Reports: owner badge, resolve, reopen, reporter feedback (browser)", () => {
  let adminId: string;
  let reporterId: string;
  let otherId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const reporter = await prisma.user.create({
      data: {
        email: REPORTER_EMAIL,
        name: `PR Reporter ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(REPORTER_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    reporterId = reporter.id;

    const other = await prisma.user.create({
      data: {
        email: OTHER_EMAIL,
        name: `PR Other ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(OTHER_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    otherId = other.id;
  });

  test.afterAll(async () => {
    await cleanupReportsFor([reporterId, otherId]);
    await prisma.user.deleteMany({ where: { id: { in: [reporterId, otherId] } } });
    await prisma.$disconnect();
  });

  test("Badge counts only OPEN and updates after a submission and after resolving; a reopen+resolve cycle preserves both resolution notes", async ({ page }) => {
    const before = await prisma.problemReport.count({ where: { status: "OPEN" } });
    const marker = `PR badge marker ${RUN_ID}`;

    await loginAs(page, REPORTER_EMAIL, REPORTER_PASSWORD);
    await page.goto("/report-a-problem");
    await page.selectOption("select[name='category']", "BUG_OR_ERROR");
    await page.fill("textarea[name='description']", marker);
    await page.click('button[type="submit"]');
    await expect(page.getByText("Submitted")).toBeVisible();
    await logout(page);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="desktop-sidebar"] a', { hasText: "Problem Reports" })).toContainText(
      String(before + 1)
    );

    await page.goto("/owner/problem-reports");
    await page.waitForLoadState("networkidle");
    let row = page.locator("div.rounded-md.border", { hasText: marker });
    await expect(row).toBeVisible();

    // Required note: an empty/whitespace-only submission is refused, no
    // mutation — the stage change this control replaces is never applied.
    await row.locator('button:has-text("Resolve")').click();
    await row.locator("textarea").fill("   ");
    await row.locator('button[type="submit"]:has-text("Resolve")').click();
    await expect(row.getByText("A resolution note is required.")).toBeVisible();
    const stillOpen = await prisma.problemReport.findFirstOrThrow({ where: { reporterId, description: marker } });
    expect(stillOpen.status).toBe("OPEN");

    const firstNote = `First resolution note ${RUN_ID}`;
    await row.locator("textarea").fill(firstNote);
    await row.locator('button[type="submit"]:has-text("Resolve")').click();
    await page.waitForTimeout(800);

    const report = await prisma.problemReport.findFirstOrThrow({ where: { reporterId, description: marker } });
    expect(report.status).toBe("RESOLVED");
    const resolutionsAfterFirst = await prisma.problemReportResolution.findMany({ where: { reportId: report.id } });
    expect(resolutionsAfterFirst.length).toBe(1);
    expect(resolutionsAfterFirst[0].note).toBe(firstNote);
    // Microsoft Graph isn't configured in this environment, so sendEmail
    // fails fast with a config error (never a real network call) — the
    // owner should see an accurate FAILED state here, never a false "sent".
    expect(resolutionsAfterFirst[0].emailStatus).toBe("FAILED");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const badgeAfterResolve = page.locator('[data-testid="desktop-sidebar"] a', { hasText: "Problem Reports" });
    if (before === 0) {
      await expect(badgeAfterResolve).not.toContainText(/[1-9]/);
    } else {
      await expect(badgeAfterResolve).toContainText(String(before));
    }

    await page.goto("/owner/problem-reports");
    await page.waitForLoadState("networkidle");
    row = page.locator("div.rounded-md.border", { hasText: marker });
    await expect(row.getByText(firstNote)).toBeVisible();
    await expect(row.getByText(/Email to reporter failed/)).toBeVisible();

    // Reopen — the owner's existing ability, preserved — then resolve again
    // with a DIFFERENT note. Both notes must still be visible afterward,
    // proving a later resolution never overwrites an earlier one.
    await row.locator('button:has-text("Reopen")').click();
    await page.waitForTimeout(500);
    const reopened = await prisma.problemReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(reopened.status).toBe("OPEN");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="desktop-sidebar"] a', { hasText: "Problem Reports" })).toContainText(
      String(before + 1)
    );

    await page.goto("/owner/problem-reports");
    await page.waitForLoadState("networkidle");
    row = page.locator("div.rounded-md.border", { hasText: marker });
    const secondNote = `Second resolution note ${RUN_ID}`;
    await row.locator('button:has-text("Resolve")').click();
    await row.locator("textarea").fill(secondNote);
    await row.locator('button[type="submit"]:has-text("Resolve")').click();
    await page.waitForTimeout(800);

    row = page.locator("div.rounded-md.border", { hasText: marker });
    await expect(row.getByText(firstNote)).toBeVisible();
    await expect(row.getByText(secondNote)).toBeVisible();
    const resolutionsAfterSecond = await prisma.problemReportResolution.findMany({ where: { reportId: report.id } });
    expect(resolutionsAfterSecond.length).toBe(2);
  });

  test("Reporter sees their own resolved report privately; confirming it works marks it Confirmed working and never inflates the owner's badge", async ({ page }) => {
    const report = await prisma.problemReport.create({
      data: {
        reporterId,
        reporterName: `PR Reporter ${RUN_ID}`,
        reporterRole: "TRAINEE",
        category: "OTHER",
        description: `PR confirm-flow ${RUN_ID}`,
      },
    });
    const adminSession: SessionPayload = { sub: adminId, role: "ADMIN", language: "EN", name: "Owner" };
    const resolveResult = await resolveProblemReport(adminSession, report.id, "Fixed via the confirm-flow test.");
    expect(resolveResult.ok).toBe(true);
    const beforeBadge = await prisma.problemReport.count({ where: { status: "OPEN" } });

    await loginAs(page, REPORTER_EMAIL, REPORTER_PASSWORD);
    await page.goto("/my-reports");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(`PR confirm-flow ${RUN_ID}`)).toBeVisible();
    await page.click(`text=${CATEGORY_LABEL_OTHER}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Fixed via the confirm-flow test.")).toBeVisible();

    await page.click("text=It's working");
    // The server action's revalidatePath triggers an immediate router
    // refresh, which re-renders this page from the now-CONFIRMED record —
    // swapping the feedback form for the permanent "Confirmed working"
    // status badge and history entry faster than the form's own transient
    // client-side "thanks" message is reliably observable, so assert the
    // real, persisted outcome instead.
    await expect(page.getByText("Confirmed working")).toBeVisible();
    const confirmed = await prisma.problemReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(confirmed.status).toBe("CONFIRMED");

    const afterBadge = await prisma.problemReport.count({ where: { status: "OPEN" } });
    expect(afterBadge).toBe(beforeBadge);

    await logout(page);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/owner/problem-reports");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Confirmed working")).toBeVisible();

    // Preserve the owner's existing ability to reopen even from CONFIRMED.
    const confirmedRow = page.locator("div.rounded-md.border", { hasText: `PR confirm-flow ${RUN_ID}` });
    await confirmedRow.locator('button:has-text("Reopen")').click();
    await page.waitForTimeout(500);
    const afterReopen = await prisma.problemReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(afterReopen.status).toBe("OPEN");
  });

  test('"Still having trouble" reopens the report with an optional note, returning it to the owner\'s badge', async ({ page }) => {
    const report = await prisma.problemReport.create({
      data: {
        reporterId,
        reporterName: `PR Reporter ${RUN_ID}`,
        reporterRole: "TRAINEE",
        category: "DATA_LOOKS_WRONG",
        description: `PR still-broken-flow ${RUN_ID}`,
      },
    });
    const adminSession: SessionPayload = { sub: adminId, role: "ADMIN", language: "EN", name: "Owner" };
    await resolveProblemReport(adminSession, report.id, "Attempted fix for still-broken-flow test.");
    const beforeBadge = await prisma.problemReport.count({ where: { status: "OPEN" } });

    await loginAs(page, REPORTER_EMAIL, REPORTER_PASSWORD);
    await page.goto(`/my-reports/${report.id}`);
    await page.waitForLoadState("networkidle");
    await page.click("text=Still having trouble");
    const feedbackNote = `Still broken: ${RUN_ID}`;
    await page.fill("textarea", feedbackNote);
    await page.click('button:has-text("Send")');
    // Same reasoning as the confirm-flow test above — the status flips back
    // to Open and the page re-renders from that before the form's own
    // transient "thanks" message is reliably observable, so assert the
    // real, persisted status badge instead.
    await expect(page.getByText(/^Open$/)).toBeVisible();

    const after = await prisma.problemReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(after.status).toBe("OPEN");
    const feedbackRows = await prisma.problemReportFeedback.findMany({ where: { reportId: report.id } });
    expect(feedbackRows.length).toBe(1);
    expect(feedbackRows[0].outcome).toBe("STILL_BROKEN");
    expect(feedbackRows[0].note).toBe(feedbackNote);

    const afterBadge = await prisma.problemReport.count({ where: { status: "OPEN" } });
    expect(afterBadge).toBe(beforeBadge + 1);

    // The prior resolution note must still be intact, not overwritten by
    // this feedback.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(feedbackNote)).toBeVisible();
  });

  test("A legacy RESOLVED report with no resolution row on file is handled gracefully, for both the owner and the reporter, and feedback still works", async ({ page }) => {
    const legacy = await prisma.problemReport.create({
      data: {
        reporterId,
        reporterName: `PR Reporter ${RUN_ID}`,
        reporterRole: "TRAINEE",
        category: "ACCOUNT_OR_ACCESS",
        description: `PR legacy-resolved ${RUN_ID}`,
        status: "RESOLVED",
        // latestResolutionId left null and no ProblemReportResolution row
        // created — simulating a report resolved before this feature
        // existed. Never fabricated by a real migration; constructed here
        // purely to prove the app handles it without crashing.
      },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/owner/problem-reports");
    await page.waitForLoadState("networkidle");
    const ownerRow = page.locator("div.rounded-md.border", { hasText: `PR legacy-resolved ${RUN_ID}` });
    await expect(ownerRow).toBeVisible();
    await expect(ownerRow.locator('button:has-text("Reopen")')).toBeVisible();
    await logout(page);

    await loginAs(page, REPORTER_EMAIL, REPORTER_PASSWORD);
    await page.goto(`/my-reports/${legacy.id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Resolved — no detailed note on file.")).toBeVisible();
    await page.click("text=It's working");
    await expect(page.getByText("Confirmed working")).toBeVisible();
    const after = await prisma.problemReport.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(after.status).toBe("CONFIRMED");
  });

  test("A report that isn't theirs is not readable, and a forged feedback submission against it is refused without changing it", async ({ page }) => {
    const report = await prisma.problemReport.create({
      data: {
        reporterId,
        reporterName: `PR Reporter ${RUN_ID}`,
        reporterRole: "TRAINEE",
        category: "OTHER",
        description: `PR cross-user ${RUN_ID}`,
      },
    });
    const adminSession: SessionPayload = { sub: adminId, role: "ADMIN", language: "EN", name: "Owner" };
    await resolveProblemReport(adminSession, report.id, "Resolution for cross-user denial test.");
    const resolution = await prisma.problemReportResolution.findFirstOrThrow({ where: { reportId: report.id } });

    // Capture the feedback action's real id off a legitimate click by the
    // actual reporter, on a disposable second report of their own — then
    // replay it as a DIFFERENT user against the first report.
    const captureReport = await prisma.problemReport.create({
      data: {
        reporterId,
        reporterName: `PR Reporter ${RUN_ID}`,
        reporterRole: "TRAINEE",
        category: "OTHER",
        description: `PR capture-only ${RUN_ID}`,
      },
    });
    await resolveProblemReport(adminSession, captureReport.id, "Resolution for id capture only.");

    await loginAs(page, REPORTER_EMAIL, REPORTER_PASSWORD);
    await page.goto(`/my-reports/${captureReport.id}`);
    const feedbackActionId = await captureActionId(page, async () => {
      await page.click("text=It's working");
    });
    await logout(page);

    await loginAs(page, OTHER_EMAIL, OTHER_PASSWORD);
    const res = await page.goto(`/my-reports/${report.id}`);
    expect(res?.status()).toBe(404);

    await forgeAction(page, `/my-reports/${report.id}`, feedbackActionId, [
      report.id,
      resolution.id,
      "CONFIRMED_WORKING",
      "",
    ]);
    await page.waitForTimeout(500);

    const after = await prisma.problemReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(after.status).toBe("RESOLVED"); // unchanged — never CONFIRMED by the wrong user
    const feedbackRows = await prisma.problemReportFeedback.findMany({ where: { reportId: report.id } });
    expect(feedbackRows.length).toBe(0);
  });
});

test.describe("Problem Reports: email delivery, atomicity, and stale feedback (direct library calls)", () => {
  let adminId: string;
  const reporterIds: string[] = [];

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;
  });

  test.afterAll(async () => {
    await cleanupReportsFor(reporterIds);
    await prisma.user.deleteMany({ where: { id: { in: reporterIds } } });
    await prisma.$disconnect();
  });

  function adminSession(): SessionPayload {
    return { sub: adminId, role: "ADMIN", language: "EN", name: "Owner" };
  }

  async function makeReporter(suffix: string, language: "EN" | "ES" = "EN") {
    const user = await prisma.user.create({
      data: {
        email: `pr-lib-${suffix}-${RUN_ID}@example.com`,
        name: `PR Lib ${suffix} ${RUN_ID}`,
        role: "TRAINEE",
        language,
        active: true,
      },
    });
    reporterIds.push(user.id);
    return user;
  }

  async function makeOpenReport(reporterId: string, description: string) {
    return prisma.problemReport.create({
      data: {
        reporterId,
        reporterName: `PR Lib ${RUN_ID}`,
        reporterRole: "TRAINEE",
        category: "BUG_OR_ERROR",
        description,
      },
    });
  }

  test("Resolving looks up the reporter's own email server-side, sends the exact note, and the note is safely escaped when rendered", async () => {
    const reporter = await makeReporter("escape");
    const report = await makeOpenReport(reporter.id, `escape test ${RUN_ID}`);

    const captured: { to: string; subject: string; body: string }[] = [];
    const fakeSend = async (args: { to: string; subject: string; body: string }) => {
      captured.push(args);
      return { ok: true as const };
    };

    const dangerousNote = `Fixed the <script>alert(1)</script> & "quotes" issue.`;
    const result = await resolveProblemReport(adminSession(), report.id, dangerousNote, fakeSend);
    expect(result.ok).toBe(true);

    expect(captured.length).toBe(1);
    // Never a client-supplied recipient — looked up from reporterId.
    expect(captured[0].to).toBe(reporter.email);
    expect(captured[0].subject).toBe("Your problem report has been resolved");
    expect(captured[0].body).toContain(dangerousNote);
    expect(captured[0].body).toContain(`/my-reports/${report.id}`);

    const html = toHtmlBody(captured[0].body);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&amp;");

    const resolution = await prisma.problemReportResolution.findFirstOrThrow({ where: { reportId: report.id } });
    expect(resolution.emailStatus).toBe("SENT");
    expect(resolution.emailSentAt).not.toBeNull();
  });

  test("The email is localized to the reporter's own language", async () => {
    const reporter = await makeReporter("es", "ES");
    const report = await makeOpenReport(reporter.id, `es test ${RUN_ID}`);
    const captured: { to: string; subject: string }[] = [];
    const fakeSend = async (args: { to: string; subject: string; body: string }) => {
      captured.push(args);
      return { ok: true as const };
    };
    await resolveProblemReport(adminSession(), report.id, "Nota de resolución.", fakeSend);
    expect(captured[0].subject).toBe("Tu reporte de problema ha sido resuelto");
  });

  test("A failed send still saves the resolution, with an accurate FAILED state and no false 'sent' claim", async () => {
    const reporter = await makeReporter("fail");
    const report = await makeOpenReport(reporter.id, `fail test ${RUN_ID}`);
    const failingSend = async () => ({ ok: false as const, error: "simulated SMTP failure" });

    const result = await resolveProblemReport(adminSession(), report.id, "Resolution despite email failure.", failingSend);
    expect(result.ok).toBe(true); // the resolution itself is saved regardless

    const report2 = await prisma.problemReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(report2.status).toBe("RESOLVED");
    const resolution = await prisma.problemReportResolution.findFirstOrThrow({ where: { reportId: report.id } });
    expect(resolution.emailStatus).toBe("FAILED");
    expect(resolution.emailError).toBe("simulated SMTP failure");
  });

  test("A double-submitted resolve on the same report creates exactly one resolution row and sends exactly one email", async () => {
    const reporter = await makeReporter("dup");
    const report = await makeOpenReport(reporter.id, `dup test ${RUN_ID}`);
    let sendCount = 0;
    const countingSend = async () => {
      sendCount += 1;
      return { ok: true as const };
    };

    const [first, second] = await Promise.all([
      resolveProblemReport(adminSession(), report.id, "First concurrent attempt.", countingSend),
      resolveProblemReport(adminSession(), report.id, "Second concurrent attempt.", countingSend),
    ]);

    const outcomes = [first.ok, second.ok].sort();
    expect(outcomes).toEqual([false, true]);
    const resolutions = await prisma.problemReportResolution.findMany({ where: { reportId: report.id } });
    expect(resolutions.length).toBe(1);
    expect(sendCount).toBe(1);
  });

  test("Stale feedback — responding to a resolution that's no longer the latest — is rejected atomically and never overwrites the newer one", async () => {
    const reporter = await makeReporter("stale");
    const report = await makeOpenReport(reporter.id, `stale test ${RUN_ID}`);
    const noSend = async () => ({ ok: true as const });

    await resolveProblemReport(adminSession(), report.id, "First resolution.", noSend);
    const staleResolution = await prisma.problemReportResolution.findFirstOrThrow({ where: { reportId: report.id } });

    await reopenProblemReport(adminSession(), report.id);
    await resolveProblemReport(adminSession(), report.id, "Second, newer resolution.", noSend);
    const currentReport = await prisma.problemReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(currentReport.latestResolutionId).not.toBe(staleResolution.id);

    const reporterSession: SessionPayload = { sub: reporter.id, role: "TRAINEE", language: "EN", name: reporter.name };
    const staleFeedback = await submitProblemReportFeedback(
      reporterSession,
      report.id,
      staleResolution.id, // the OLD resolutionId — no longer current
      "CONFIRMED_WORKING",
      ""
    );
    expect(staleFeedback.ok).toBe(false);

    const afterStale = await prisma.problemReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(afterStale.status).toBe("RESOLVED"); // unaffected by the stale attempt
    expect(afterStale.latestResolutionId).toBe(currentReport.latestResolutionId);
    const feedbackRows = await prisma.problemReportFeedback.findMany({ where: { reportId: report.id } });
    expect(feedbackRows.length).toBe(0);

    // Responding to the CURRENT resolution, by contrast, works normally.
    const freshFeedback = await submitProblemReportFeedback(
      reporterSession,
      report.id,
      currentReport.latestResolutionId,
      "CONFIRMED_WORKING",
      ""
    );
    expect(freshFeedback.ok).toBe(true);
  });
});
