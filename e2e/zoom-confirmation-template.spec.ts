import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// The "Zoom Interview Confirmation" template used to leave the date/time as
// a manual "[agreed date/time — see the applicant's profile]" placeholder
// and said "phone interview" instead of "phone/Zoom interview". It now
// auto-fills {{scheduledAt}} from the applicant's own booked
// scheduledAt, formatted in the business timezone (America/Los_Angeles) and
// labeled PT, the same way the "Phone/Zoom Interview Scheduled" banner
// elsewhere on this page already does. Two scheduledAt values a few months
// apart (one PST, one PDT) prove the DST transition renders the correct
// wall-clock hour, not a fixed UTC offset. No real applicant is contacted —
// the template is only loaded into the compose textarea, never sent.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();

const prisma = new PrismaClient();

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe("Zoom Interview Confirmation template", () => {
  test("the starter template in the database no longer has the manual placeholder or 'phone interview'", async () => {
    const template = await prisma.messageTemplate.findFirst({
      where: { scope: "RECRUITING", channel: "EMAIL", name: "Zoom Interview Confirmation" },
    });
    expect(template).not.toBeNull();
    expect(template!.body).toContain("{{scheduledAt}}");
    expect(template!.body).toContain("phone/Zoom interview");
    expect(template!.body).not.toContain("agreed date/time");
    expect(template!.body).not.toContain("your phone interview");
  });

  test.describe.serial("Rendered confirmation matches the booked date/time, across a DST boundary", () => {
    let jobPostingId: string;
    const applicantIds: string[] = [];

    test.beforeAll(async () => {
      const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
      jobPostingId = jobPosting.id;
    });

    test.afterAll(async () => {
      await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
      await prisma.$disconnect();
    });

    async function makeScheduledApplicant(label: string, scheduledAt: Date) {
      const applicant = await prisma.applicant.create({
        data: {
          jobPostingId,
          firstName: "Fake",
          lastName: `${label}-${RUN_ID}`,
          email: `fake-${label}-${RUN_ID}@example.com`,
          phone: "5555550100",
          stage: "PHONE_INTERVIEW_SCHEDULED",
          scheduledAt,
        },
      });
      applicantIds.push(applicant.id);
      return applicant;
    }

    async function renderedTemplateBody(page: Page, applicantId: string) {
      await loginAsAdmin(page);
      await page.goto(`/recruiting/applicants/${applicantId}?tab=comms`);
      await page.waitForLoadState("networkidle");
      await page.click('button:has-text("Communication")');
      await page.click('button:has-text("Send Email")');
      await page.getByTestId("email-template-select").selectOption({ label: "Zoom Interview Confirmation" });
      return page.getByPlaceholder("Message").inputValue();
    }

    test("a winter (PST, UTC-8) booking renders the correct Pacific wall-clock time", async ({ page }) => {
      // 2026-01-15T18:00:00Z is 10:00 AM in Los Angeles while PST (UTC-8) is
      // in effect.
      const applicant = await makeScheduledApplicant("winter", new Date("2026-01-15T18:00:00Z"));
      const body = await renderedTemplateBody(page, applicant.id);
      expect(body).toContain("phone/Zoom interview");
      expect(body).toMatch(/When: 1\/15\/26, 10:00\s?AM PT/);
      expect(body).not.toContain("{{scheduledAt}}");
      expect(body).not.toContain("agreed date/time");
    });

    test("a summer (PDT, UTC-7) booking renders the correct Pacific wall-clock time", async ({ page }) => {
      // 2026-07-15T17:00:00Z is 10:00 AM in Los Angeles while PDT (UTC-7) is
      // in effect — same local hour as the winter case above, one hour
      // earlier in UTC, proving the DST offset (not a fixed UTC-8) is applied.
      const applicant = await makeScheduledApplicant("summer", new Date("2026-07-15T17:00:00Z"));
      const body = await renderedTemplateBody(page, applicant.id);
      expect(body).toContain("phone/Zoom interview");
      expect(body).toMatch(/When: 7\/15\/26, 10:00\s?AM PT/);
      expect(body).not.toContain("{{scheduledAt}}");
      expect(body).not.toContain("agreed date/time");
    });

    test("an applicant with no scheduledAt gets a graceful fallback, never a blank or stale date", async ({
      page,
    }) => {
      const applicant = await prisma.applicant.create({
        data: {
          jobPostingId,
          firstName: "Fake",
          lastName: `unscheduled-${RUN_ID}`,
          email: `fake-unscheduled-${RUN_ID}@example.com`,
          phone: "5555550100",
          stage: "PRESCREEN_PASSED",
        },
      });
      applicantIds.push(applicant.id);
      const body = await renderedTemplateBody(page, applicant.id);
      expect(body).not.toContain("{{scheduledAt}}");
      expect(body).toContain("not yet scheduled");
    });
  });
});
