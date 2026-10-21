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
  if (method === "PATCH" && url.includes("/events/evt-transient-fail")) {
    // A non-404 failure (rate-limited here; same handling for a 401/403 or
    // a 5xx) — deliberately NOT 404, since that's the one status that means
    // "confirmed gone, safe to replace."
    return Promise.resolve(new Response("too many requests", { status: 429 }));
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
  check("reschedule with a live existing event reuses the same event id", reschedResult.eventId, "evt-original-999");
  check("a successful reschedule reports no sync failure", reschedResult.syncFailed, false);

  // 3. A reschedule whose existing event is CONFIRMED gone (a real 404 on
  // PATCH) falls back to creating a fresh one — the only status that means
  // "safe to replace," since the original is provably no longer there to
  // duplicate.
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
    "reschedule against a confirmed-404 event tries PATCH then falls back to POST",
    calls.map((c) => c.method),
    ["PATCH", "POST"]
  );
  check("that fallback returns the newly created event's id", fallbackResult.eventId, "evt-new-123");
  check("a confirmed-404 replacement reports no sync failure once it succeeds", fallbackResult.syncFailed, false);

  // 3b. A reschedule whose existing event's update fails for a reason OTHER
  // than a confirmed 404 (rate-limited, an auth hiccup, a 5xx) must NEVER
  // fall back to creating a replacement — the original event may well
  // still be fine on the real calendar, and creating a second one here
  // would be exactly the duplicate-invitation bug this is fixing. The
  // existing id is preserved and the failure is reported instead.
  calls.length = 0;
  const transientResult = await updateOrCreateInterviewCalendarEvent(
    applicant,
    "Cleaning Technician",
    "PHONE_INTERVIEW_SCHEDULED",
    new Date(Date.now() + 10 * 86_400_000),
    "ZOOM",
    30,
    "evt-transient-fail"
  );
  check(
    "a transient (non-404) update failure PATCHes once and never falls back to POST",
    calls.map((c) => c.method),
    ["PATCH"]
  );
  check("a transient failure preserves the existing event id, not null", transientResult.eventId, "evt-transient-fail");
  check("a transient failure reports a sync failure", transientResult.syncFailed, true);

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
  check("initial booking returns the created event id", initialBooking.eventId, "evt-new-123");
  check("a successful initial booking reports no sync failure", initialBooking.syncFailed, false);

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

  // 12-14. A retry whose update attempt fails transiently (not a confirmed
  // 404) must come back reporting failure, while still preserving the
  // existing event id (never nulling it, never creating a second event)
  // and persisting the failure onto the slot so the dashboard banner
  // reflects it — this is the exact bug this round fixes.
  await prisma.interviewAvailabilitySlot.update({
    where: { id: bookedSlot.id },
    data: { calendarEventId: "evt-transient-fail", calendarSyncFailedAt: null },
  });
  calls.length = 0;
  const stillFailingRetry = await retryInterviewCalendarSync(retryApplicant.id);
  check("a retry that still fails transiently reports failure", stillFailingRetry.ok, false);
  const slotAfterStillFailing = await prisma.interviewAvailabilitySlot.findUniqueOrThrow({ where: { id: bookedSlot.id } });
  check(
    "a still-failing retry preserves the existing event id rather than nulling or replacing it",
    slotAfterStillFailing.calendarEventId,
    "evt-transient-fail"
  );
  check(
    "a still-failing retry persists the sync failure onto the slot (for the dashboard banner)",
    slotAfterStillFailing.calendarSyncFailedAt !== null,
    true
  );
  check(
    "a retry against a known-transient-failing event PATCHes it, never falls back to creating another",
    calls.map((c) => c.method),
    ["PATCH"]
  );

  // Fixing the underlying problem and retrying again clears the failure —
  // the banner should disappear once the calendar is actually back in sync.
  await prisma.interviewAvailabilitySlot.update({
    where: { id: bookedSlot.id },
    data: { calendarEventId: "evt-original-999" },
  });
  calls.length = 0;
  const recoveredRetry = await retryInterviewCalendarSync(retryApplicant.id);
  check("a retry against a now-healthy event reports success", recoveredRetry.ok, true);
  const slotAfterRecovery = await prisma.interviewAvailabilitySlot.findUniqueOrThrow({ where: { id: bookedSlot.id } });
  check("a successful retry clears the sync-failure flag", slotAfterRecovery.calendarSyncFailedAt, null);

  // 15-18. describeCalendarSyncProblem (src/lib/calendar.ts) — the pure
  // function deciding what the applicant dashboard's banner shows. No
  // network or live calendar integration needed: this is exactly why it's
  // a separate, parameterized function rather than inlined on the page.
  const { describeCalendarSyncProblem } = await import("../src/lib/calendar");
  check(
    "no problem when the calendar feature isn't configured at all, regardless of slot state",
    describeCalendarSyncProblem({ calendarConfigured: false, bookedSlot: { calendarEventId: null, calendarSyncFailedAt: new Date() } }),
    null
  );
  check(
    "'missing' when there's no event id at all",
    describeCalendarSyncProblem({ calendarConfigured: true, bookedSlot: { calendarEventId: null, calendarSyncFailedAt: null } }),
    "missing"
  );
  check(
    "'stale' when an event id exists but the last sync attempt failed — the exact case this round adds",
    describeCalendarSyncProblem({
      calendarConfigured: true,
      bookedSlot: { calendarEventId: "evt-original-999", calendarSyncFailedAt: new Date() },
    }),
    "stale"
  );
  check(
    "no problem when an event id exists and nothing is flagged as failed",
    describeCalendarSyncProblem({
      calendarConfigured: true,
      bookedSlot: { calendarEventId: "evt-original-999", calendarSyncFailedAt: null },
    }),
    null
  );

  // 19-20. The warning actually appears — a real React render of
  // CalendarSyncBanner (the component the applicant dashboard page uses),
  // not just the pure decision function above. This sandbox's live
  // calendar integration can never actually be "configured" (no Microsoft
  // Graph credentials exist anywhere here), so a live Playwright browser
  // test can only ever prove the negative case (no banner when the
  // feature is off, covered in e2e/interview-scheduling-fixes-round3.spec.ts)
  // — rendering the component directly, the same way it was factored out
  // specifically to allow, is how the positive "stale" case gets proven.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = await import("react");
  // This script runs under plain `tsx` (esbuild), not Next's own SWC
  // pipeline — esbuild falls back to the classic JSX transform for this
  // tsconfig's "preserve" setting, which compiles JSX to bare
  // React.createElement calls expecting a free `React` identifier, same as
  // every other .tsx file in this app relies on Next's SWC (always
  // automatic-runtime) to supply. Only needed for this ad hoc render; the
  // real app never needs it.
  (globalThis as unknown as { React: typeof React }).React = React;
  const { default: CalendarSyncBanner } = await import(
    "../src/app/(portal)/recruiting/applicants/[id]/CalendarSyncBanner"
  );
  const noopRetry = async () => {};
  const staleHtml = renderToStaticMarkup(
    React.createElement(CalendarSyncBanner, { problem: "stale", applicantId: "x", canEdit: true, retryAction: noopRetry })
  );
  check("the 'stale' banner actually renders the sync-failed warning text", staleHtml.includes("Calendar sync failed"), true);
  check("the 'stale' banner does not render the 'invite missing' text", staleHtml.includes("Calendar invite missing"), false);
  check("the 'stale' banner renders the Retry button", staleHtml.includes("Retry calendar sync"), true);

  const missingHtml = renderToStaticMarkup(
    React.createElement(CalendarSyncBanner, { problem: "missing", applicantId: "x", canEdit: true, retryAction: noopRetry })
  );
  check("the 'missing' banner renders the invite-missing warning text", missingHtml.includes("Calendar invite missing"), true);
  check("the 'missing' banner does not render the sync-failed text", missingHtml.includes("Calendar sync failed"), false);

  const noProblemHtml = renderToStaticMarkup(
    React.createElement(CalendarSyncBanner, { problem: null, applicantId: "x", canEdit: true, retryAction: noopRetry })
  );
  check("no problem renders nothing at all", noProblemHtml, "");

  await prisma.interviewAvailabilitySlot.deleteMany({ where: { interviewerId: interviewer.id } });
  await prisma.applicant.delete({ where: { id: retryApplicant.id } });
  await prisma.user.delete({ where: { id: interviewer.id } });
  await prisma.$disconnect();

  console.log(failures === 0 ? "\nAll calendar event-reuse checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
