// Manual verification script (not part of the Playwright suite — see the
// same rationale in scripts/verify-calendar-event-reuse.ts: CommunicationLog
// stores subject/body/status, never the Reply-To header actually sent, and
// no credentials exist anywhere in this repo's CI or this dev environment
// to exercise the real Microsoft Graph sendMail call over the network).
//
// This fakes a configured Graph app registration and stubs global.fetch to
// behave like the real Graph API, then calls the real, unmodified
// src/lib/recruiting.ts candidate-facing email functions directly and
// inspects the actual outgoing JSON payload's replyTo field — proving every
// candidate-facing email routes replies to Info (RECRUITING_NOTIFY_EMAIL),
// and that a staff-internal notification does NOT set one (nothing for a
// staffer's own inbox to be confused by).
//
// Run with: npx tsx scripts/verify-reply-to-routing.ts
export {}; // Force module scope — see verify-calendar-event-reuse.ts.
process.env.MS_GRAPH_TENANT_ID = "fake-tenant";
process.env.MS_GRAPH_CLIENT_ID = "fake-client";
process.env.MS_GRAPH_CLIENT_SECRET = "fake-secret";
process.env.MS_GRAPH_SENDER_EMAIL = "fake-sender@example.com";
process.env.RECRUITING_NOTIFY_EMAIL = "fake-info@example.com";
process.env.RECRUITING_CALENDAR_MAILBOX = "";
process.env.RECRUITING_ZOOM_PMI = "123 456 7890";

type SendMailCall = { to: string; replyTo: string | null };
const sendMailCalls: SendMailCall[] = [];

function fakeFetch(url: string, init?: RequestInit): Promise<Response> {
  if (url.includes("login.microsoftonline.com")) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 }));
  }
  if (url.endsWith("/sendMail")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const message = body.message ?? {};
    sendMailCalls.push({
      to: message.toRecipients?.[0]?.emailAddress?.address ?? "",
      replyTo: message.replyTo?.[0]?.emailAddress?.address ?? null,
    });
    return Promise.resolve(new Response(JSON.stringify({}), { status: 202 }));
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
  const {
    sendApplicantAcknowledgmentEmail,
    sendInterviewConfirmationEmail,
    sendInterviewReminder,
    sendInterviewInvite,
    notifyNewApplicant,
  } = await import("../src/lib/recruiting");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true, titleEn: true, titleEs: true } });
  const interviewer = await prisma.user.create({
    data: {
      email: `verify-replyto-interviewer-${Date.now()}@example.com`,
      name: "Verify ReplyTo Interviewer",
      role: "SERVICE_MANAGER",
      passwordHash: "x",
      mustSetPassword: false,
      active: true,
    },
  });
  const availability = await prisma.interviewerAvailability.create({
    data: { interviewerId: interviewer.id, timezone: "America/Los_Angeles", durationMins: 30, supportsZoom: true, supportsInPerson: true },
  });
  await prisma.availabilityWeeklyHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ availabilityId: availability.id, dayOfWeek, startMinute: 0, endMinute: 23 * 60 })),
  });
  const applicant = await prisma.applicant.create({
    data: {
      jobPostingId: jobPosting.id,
      firstName: "Verify",
      lastName: `ReplyTo-${Date.now()}`,
      email: `verify-replyto-candidate-${Date.now()}@example.com`,
      phone: "5555550100",
      stage: "PRESCREEN_PASSED",
      interviewConfirmToken: `verify-replyto-tok-${Date.now()}`,
    },
  });

  sendMailCalls.length = 0;
  await sendApplicantAcknowledgmentEmail(applicant, jobPosting.titleEn);
  check("application-received email sets Reply-To to Info", sendMailCalls.at(-1)?.replyTo, "fake-info@example.com");

  sendMailCalls.length = 0;
  await sendInterviewConfirmationEmail(applicant, jobPosting.titleEn, "PHONE_INTERVIEW_SCHEDULED", new Date(Date.now() + 86_400_000), null, jobPosting.titleEs, "ZOOM");
  check("interview confirmation email sets Reply-To to Info", sendMailCalls.at(-1)?.replyTo, "fake-info@example.com");

  sendMailCalls.length = 0;
  await sendInterviewReminder(
    { ...applicant, interviewConfirmToken: applicant.interviewConfirmToken },
    jobPosting.titleEn,
    "PHONE_INTERVIEW_SCHEDULED",
    new Date(Date.now() + 86_400_000),
    "day",
    jobPosting.titleEs,
    "ZOOM"
  );
  check("interview reminder email sets Reply-To to Info", sendMailCalls.at(-1)?.replyTo, "fake-info@example.com");

  sendMailCalls.length = 0;
  await sendInterviewInvite(applicant.id, interviewer.id, "ZOOM");
  check("interview invite email sets Reply-To to Info", sendMailCalls.at(-1)?.replyTo, "fake-info@example.com");

  sendMailCalls.length = 0;
  await notifyNewApplicant(applicant, jobPosting.titleEn);
  check("internal staff notification (notifyNewApplicant) sets no Reply-To", sendMailCalls.at(-1)?.replyTo, null);
  check("internal staff notification still goes to Info, not the candidate", sendMailCalls.at(-1)?.to, "fake-info@example.com");

  // Cleanup
  await prisma.communicationLog.deleteMany({ where: { applicantId: applicant.id } });
  await prisma.interviewAvailabilitySlot.deleteMany({ where: { interviewerId: interviewer.id } });
  await prisma.applicant.delete({ where: { id: applicant.id } });
  await prisma.availabilityWeeklyHour.deleteMany({ where: { availabilityId: availability.id } });
  await prisma.interviewerAvailability.delete({ where: { id: availability.id } });
  await prisma.user.delete({ where: { id: interviewer.id } });
  await prisma.$disconnect();

  console.log(failures === 0 ? "\nAll Reply-To routing checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
