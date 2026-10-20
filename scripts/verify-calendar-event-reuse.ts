// Manual verification script (not part of the Playwright suite, and not
// wired into CI): this sandbox and this repo's CI both run without real
// Microsoft Graph credentials (see .env.example / .github/workflows/ci.yml),
// so there is no environment anywhere in this PR's pipeline that can
// exercise src/lib/calendar.ts against the real Graph API. Every existing
// calendar-touching Playwright test already runs the calendar functions in
// that same no-credentials, always-no-op mode; what's missing there is
// coverage of updateOrCreateInterviewCalendarEvent's actual branch
// decision (PATCH the existing event vs. fall back to creating a new one),
// which only matters once credentials exist and can't be observed through
// a no-op.
//
// This script fills that one gap: it fakes a configured Graph app
// registration (MS_GRAPH_*, RECRUITING_CALENDAR_MAILBOX — all obviously
// fake values, never real credentials) and stubs global.fetch to behave
// like the real Graph API would, then calls the real, unmodified
// src/lib/calendar.ts + updateOrCreateInterviewCalendarEvent functions
// directly (no DB, no server) and asserts on which HTTP method/URL each
// one actually issues. Run with: npx tsx scripts/verify-calendar-event-reuse.ts
export {}; // Force module scope — a script-mode file's top-level names are
// otherwise global across the whole TS program, colliding with this
// project's other verify-*.ts scripts.
process.env.MS_GRAPH_TENANT_ID = "fake-tenant";
process.env.MS_GRAPH_CLIENT_ID = "fake-client";
process.env.MS_GRAPH_CLIENT_SECRET = "fake-secret";
process.env.MS_GRAPH_SENDER_EMAIL = "fake-sender@example.com";
process.env.RECRUITING_CALENDAR_MAILBOX = "fake-calendar@example.com";

type Call = { method: string; url: string; body: Record<string, unknown> };
const calls: Call[] = [];

function fakeFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";

  // The OAuth2 token fetch isn't what this script is checking (every call
  // re-authenticates — there's no token cache — which would otherwise
  // drown out the one POST/PATCH per event call this is actually about).
  if (url.includes("login.microsoftonline.com")) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 }));
  }
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : {} });
  if (method === "POST" && url.endsWith("/events")) {
    return Promise.resolve(new Response(JSON.stringify({ id: "evt-new-123" }), { status: 201 }));
  }
  if (method === "PATCH" && url.includes("/events/evt-original-999")) {
    return Promise.resolve(new Response(JSON.stringify({ id: "evt-original-999" }), { status: 200 }));
  }
  if (method === "PATCH" && url.includes("/events/evt-gone-404")) {
    return Promise.resolve(new Response("not found", { status: 404 }));
  }
  if (method === "PATCH" && url.includes("/events/evt-new-123")) {
    return Promise.resolve(new Response(JSON.stringify({ id: "evt-new-123" }), { status: 200 }));
  }
  if (method === "DELETE") {
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(new Response("unexpected request in test", { status: 500 }));
}
// @ts-expect-error - test stub, not a full Fetch implementation
global.fetch = fakeFetch;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "✓" : "✗ FAIL"} ${label}${pass ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!pass) failures++;
}

async function main() {
  const { updateOrCreateInterviewCalendarEvent } = await import("../src/lib/recruiting");
  const { createCalendarEvent } = await import("../src/lib/calendar");

  const applicant = { firstName: "Test", lastName: "Candidate", email: "test@example.com", phone: "5550100" };

  // 1. A fresh booking (no existing event) creates one via POST.
  calls.length = 0;
  const created = await createCalendarEvent({
    mailbox: "fake-calendar@example.com",
    subject: "Interview",
    startsAt: new Date(Date.now() + 86_400_000),
    body: "Fake interview body for verification only.",
    attendeeEmail: applicant.email,
    attendeeName: `${applicant.firstName} ${applicant.lastName}`,
  });
  check("fresh booking issues a POST to /events", calls.some((c) => c.method === "POST" && c.url.endsWith("/events")), true);
  check("fresh booking returns the created event id", created.ok && created.eventId, "evt-new-123");

  // 2. A reschedule with a *live* existing event PATCHes that same event —
  // never a second POST/create — so the candidate's calendar invite is
  // updated in place rather than duplicated.
  calls.length = 0;
  const reschedResult = await updateOrCreateInterviewCalendarEvent(
    applicant,
    "Cleaning Technician",
    "PHONE_INTERVIEW_SCHEDULED",
    new Date(Date.now() + 2 * 86_400_000),
    "ZOOM",
    30,
    "evt-original-999"
  );
  check(
    "reschedule with a live existing event issues a PATCH, not a POST",
    calls.map((c) => c.method),
    ["PATCH"]
  );
  check("reschedule with a live existing event reuses the same event id", reschedResult, "evt-original-999");

  // 3. A reschedule whose existing event is gone (404 on PATCH) falls back
  // to creating a fresh one, rather than silently losing the invite.
  calls.length = 0;
  const fallbackResult = await updateOrCreateInterviewCalendarEvent(
    applicant,
    "Cleaning Technician",
    "PHONE_INTERVIEW_SCHEDULED",
    new Date(Date.now() + 3 * 86_400_000),
    "ZOOM",
    30,
    "evt-gone-404"
  );
  check(
    "reschedule against a gone event tries PATCH then falls back to POST",
    calls.map((c) => c.method),
    ["PATCH", "POST"]
  );
  check("that fallback returns the newly created event's id", fallbackResult, "evt-new-123");

  // 4. A fresh booking (no prior event at all — existingEventId null) goes
  // straight to POST, never attempts a PATCH on nothing.
  calls.length = 0;
  const initialBooking = await updateOrCreateInterviewCalendarEvent(
    applicant,
    "Cleaning Technician",
    "PHONE_INTERVIEW_SCHEDULED",
    new Date(Date.now() + 4 * 86_400_000),
    "ZOOM",
    30,
    null
  );
  check("initial booking (no prior event) issues a POST only", calls.map((c) => c.method), ["POST"]);
  check("initial booking returns the created event id", initialBooking, "evt-new-123");

  // 5. An in-person booking's event carries the office address in the
  // Location field (what Outlook shows next to the time), not just in the
  // body text — this is the part a candidate's email already had but the
  // calendar event itself was missing.
  calls.length = 0;
  await updateOrCreateInterviewCalendarEvent(
    applicant,
    "Cleaning Technician",
    "IN_PERSON_SCHEDULED",
    new Date(Date.now() + 5 * 86_400_000),
    "IN_PERSON",
    30,
    null
  );
  const inPersonCreate = calls.find((c) => c.method === "POST" && c.url.endsWith("/events"));
  check("in-person booking sets a non-empty Location field", Boolean(inPersonCreate?.body.location), true);
  check(
    "in-person booking's body also includes the office address",
    typeof inPersonCreate?.body.body === "object" &&
      String((inPersonCreate!.body.body as { content?: string }).content ?? "").includes("Brookhollow"),
    true
  );

  // 6. A Zoom booking's event never sets a Location field.
  calls.length = 0;
  await updateOrCreateInterviewCalendarEvent(
    applicant,
    "Cleaning Technician",
    "PHONE_INTERVIEW_SCHEDULED",
    new Date(Date.now() + 6 * 86_400_000),
    "ZOOM",
    30,
    null
  );
  const zoomCreate = calls.find((c) => c.method === "POST" && c.url.endsWith("/events"));
  check("Zoom booking sets no Location field", zoomCreate?.body.location, undefined);

  // 7. An in-person reschedule (existing event) PATCHes the Location field
  // too, not just the time/body.
  calls.length = 0;
  await updateOrCreateInterviewCalendarEvent(
    applicant,
    "IN_PERSON_SCHEDULED",
    "IN_PERSON_SCHEDULED",
    new Date(Date.now() + 7 * 86_400_000),
    "IN_PERSON",
    30,
    "evt-original-999"
  );
  const inPersonPatch = calls.find((c) => c.method === "PATCH");
  check("in-person reschedule PATCHes a non-empty Location field too", Boolean(inPersonPatch?.body.location), true);

  // 8-11. retryInterviewCalendarSync — the staff-facing "Retry calendar
  // sync" recovery button (applicant dashboard). Needs real DB fixtures
  // since, unlike the checks above, it reads/writes the applicant and its
  // InterviewAvailabilitySlot itself rather than taking plain objects.
  const { retryInterviewCalendarSync } = await import("../src/lib/recruiting");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true, titleEn: true } });
  const interviewer = await prisma.user.create({
    data: {
      email: `verify-calendarsync-interviewer-${Date.now()}@example.com`,
      name: "Verify CalendarSync Interviewer",
      role: "SERVICE_MANAGER",
      passwordHash: "x",
      mustSetPassword: false,
      active: true,
    },
  });
  const retryApplicant = await prisma.applicant.create({
    data: {
      jobPostingId: jobPosting.id,
      firstName: "Verify",
      lastName: `CalendarSync-${Date.now()}`,
      email: `verify-calendarsync-${Date.now()}@example.com`,
      phone: "5555550100",
      stage: "PHONE_INTERVIEW_SCHEDULED",
      interviewerId: interviewer.id,
      interviewFormat: "ZOOM",
      scheduledAt: new Date(Date.now() + 8 * 86_400_000),
    },
  });
  const bookedSlot = await prisma.interviewAvailabilitySlot.create({
    data: {
      interviewerId: interviewer.id,
      format: "ZOOM",
      startsAt: retryApplicant.scheduledAt!,
      durationMins: 30,
      bookedById: retryApplicant.id,
      createdById: interviewer.id,
      calendarEventId: null,
    },
  });

  calls.length = 0;
  const firstRetry = await retryInterviewCalendarSync(retryApplicant.id);
  check("retry with a missing event creates a fresh one (POST, not PATCH)", calls.map((c) => c.method), ["POST"]);
  check("retry with a missing event reports success with the new event id", firstRetry, { ok: true, eventId: "evt-new-123" });
  const slotAfterFirstRetry = await prisma.interviewAvailabilitySlot.findUniqueOrThrow({ where: { id: bookedSlot.id } });
  check("retry persists the new event id onto the booked slot", slotAfterFirstRetry.calendarEventId, "evt-new-123");

  calls.length = 0;
  const secondRetry = await retryInterviewCalendarSync(retryApplicant.id);
  check(
    "retrying again now that an event exists PATCHes it, never a second POST (no duplicate invitation)",
    calls.map((c) => c.method),
    ["PATCH"]
  );
  check("the repeat retry reports success with the same event id", secondRetry, { ok: true, eventId: "evt-new-123" });

  const mailboxBefore = process.env.RECRUITING_CALENDAR_MAILBOX;
  delete process.env.RECRUITING_CALENDAR_MAILBOX;
  const unconfiguredRetry = await retryInterviewCalendarSync(retryApplicant.id);
  check(
    "retry refuses outright when the shared calendar isn't configured at all, rather than silently no-opping",
    unconfiguredRetry.ok,
    false
  );
  process.env.RECRUITING_CALENDAR_MAILBOX = mailboxBefore;

  const noInterviewRetry = await retryInterviewCalendarSync("not-a-real-applicant-id");
  check("retry against a nonexistent applicant reports a clear error, not a crash", noInterviewRetry, {
    ok: false,
    error: "Applicant not found.",
  });

  await prisma.interviewAvailabilitySlot.deleteMany({ where: { interviewerId: interviewer.id } });
  await prisma.applicant.delete({ where: { id: retryApplicant.id } });
  await prisma.user.delete({ where: { id: interviewer.id } });
  await prisma.$disconnect();

  console.log(failures === 0 ? "\nAll calendar event-reuse checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
