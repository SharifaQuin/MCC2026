import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { SessionPayload } from "@/lib/session";
import { getTrueActorId, getTrueActorName } from "@/lib/impersonation";
import { sendEmail as realSendEmail } from "@/lib/email";
import { t } from "@/lib/i18n";
import type {
  ProblemReportCategory,
  ProblemReportFeedbackOutcome,
  Prisma,
} from "@prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireOwnerAccess() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session;
}

// Not authorized at all (used by read-only queries, which have no
// legitimate non-ADMIN caller — the queue page itself redirects anyone else
// away before this could ever be reached) stays a thrown error, matching
// the rest of this file's existing convention. resolveProblemReport and
// reopenProblemReport below take the session as a parameter instead of
// fetching it themselves, both so tests can call them directly with a
// synthetic session (the same reason submitProblemReportFeedback already
// does, and the same dependency-injection reasoning as sendEmailFn) and so
// the ADMIN check is a plain, readable { ok: false } result here rather
// than a thrown error a legitimate caller could never actually trigger
// anyway.
function assertOwnerSession(session: SessionPayload): ActionResult | null {
  if (session.role !== "ADMIN") return { ok: false, error: "Not authorized." };
  return null;
}

// Any logged-in role can file one — this is intentionally wide open, unlike
// the queue that reads them back.
export async function submitProblemReport(category: ProblemReportCategory, description: string) {
  const session = await getSession();
  if (!session) throw new Error("Not authorized");
  const trimmed = description.trim();
  if (!trimmed) throw new Error("Please describe what happened.");

  // reporterName/reporterRole are a denormalized snapshot of who actually
  // filed this, read back verbatim in the Owner's queue — while acting as
  // someone, that has to be the real Owner throughout (id, name, and role
  // together), never a mix of the Owner's id with the employee's own name,
  // which would misrepresent whose voice this report is in.
  await prisma.problemReport.create({
    data: {
      reporterId: getTrueActorId(session),
      reporterName: getTrueActorName(session),
      reporterRole: session.actingAs ? "ADMIN" : session.role,
      category,
      description: trimmed,
    },
  });
}

const PROBLEM_REPORT_LIST_INCLUDE = {
  resolutions: { orderBy: { resolvedAt: "desc" as const }, include: { resolvedBy: { select: { name: true } } } },
  feedback: { orderBy: { createdAt: "desc" as const } },
};

// ADMIN (the Owner) only — not Service Manager, since a report might be
// about a Service Manager, and this is explicitly "my owner dashboard," not
// a general management queue like Pending Approvals.
export async function getProblemReportsForOwner() {
  await requireOwnerAccess();
  return prisma.problemReport.findMany({
    orderBy: { createdAt: "desc" },
    include: PROBLEM_REPORT_LIST_INCLUDE,
  });
}

// Drives the nav badge — ADMIN only, same reasoning as the queue above.
// Counts OPEN only: a CONFIRMED or still-RESOLVED report needs nothing
// further from the owner, so it never inflates this count. A fresh
// submission and a reporter's "Still having trouble" (which reopens the
// report) both land here on the very next read, the same way the existing
// Pending Approvals badge already works — no extra wiring needed, this
// just counts current rows.
export async function getOpenProblemReportCount(): Promise<number> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return 0;
  return prisma.problemReport.count({ where: { status: "OPEN" } });
}

// Thrown only to abort the transaction below when the report wasn't in the
// expected state — never surfaced to the client directly, always turned
// back into a plain { ok: false, error } result first.
class InvalidTransitionError extends Error {}

// Owner-only. Requires a non-empty, reporter-visible note; records who
// resolved it and when as its own new row (never overwriting an earlier
// resolution's note, even across a later reopen). Only succeeds if the
// report is currently OPEN — a stale or doubled-up submission (a double
// click, a retried request, a form left open from before someone else
// already resolved it) is rejected with no partial write: the resolution
// row and the status flip happen in one transaction, so a rejected
// transition never leaves an orphaned resolution behind either.
//
// sendEmailFn defaults to the real Microsoft Graph sender and is only ever
// overridden by tests — the same dependency-injection pattern
// scheduledMessageScheduler.ts/leadAutoReply.ts already use for
// sendEmail/sendSms (see src/lib/messageSenders.ts), so tests can assert on
// the exact recipient/subject/body and simulate a failed send without ever
// making a real network call.
export async function resolveProblemReport(
  session: SessionPayload,
  reportId: string,
  note: string,
  sendEmailFn: typeof realSendEmail = realSendEmail
): Promise<ActionResult> {
  const denied = assertOwnerSession(session);
  if (denied) return denied;
  const trimmedNote = note.trim();
  if (!trimmedNote) return { ok: false, error: "A resolution note is required." };

  let resolutionId: string;
  try {
    resolutionId = await prisma.$transaction(async (tx) => {
      const resolution = await tx.problemReportResolution.create({
        data: { reportId, note: trimmedNote, resolvedById: getTrueActorId(session) },
      });
      const updated = await tx.problemReport.updateMany({
        where: { id: reportId, status: "OPEN" },
        data: { status: "RESOLVED", latestResolutionId: resolution.id },
      });
      if (updated.count === 0) throw new InvalidTransitionError();
      return resolution.id;
    });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { ok: false, error: "This report isn't open anymore — someone may have already resolved it." };
    }
    throw err;
  }

  await sendProblemReportResolutionEmail(reportId, resolutionId, sendEmailFn);
  return { ok: true };
}

// Looks up the reporter's own account email server-side from reporterId —
// never a client-supplied recipient. Claims the SENDING state the same
// compare-and-swap way ScheduledMessage does, so a retried call for the
// same resolution (a double click before the UI disables, a resubmitted
// form) can never send a second copy: only the caller that wins the
// PENDING -> SENDING claim actually calls sendEmail. An uncertain delivery
// (crashed mid-send, left on SENDING) is never auto-resent — a human
// resolving again creates a brand new resolution/attempt instead.
async function sendProblemReportResolutionEmail(
  reportId: string,
  resolutionId: string,
  sendEmailFn: typeof realSendEmail
): Promise<void> {
  const claimed = await prisma.problemReportResolution.updateMany({
    where: { id: resolutionId, emailStatus: "PENDING" },
    data: { emailStatus: "SENDING" },
  });
  if (claimed.count === 0) return;

  const [report, resolution] = await Promise.all([
    prisma.problemReport.findUnique({
      where: { id: reportId },
      select: {
        category: true,
        reporter: { select: { email: true, language: true } },
      },
    }),
    prisma.problemReportResolution.findUniqueOrThrow({ where: { id: resolutionId }, select: { note: true } }),
  ]);

  if (!report) {
    await prisma.problemReportResolution.update({
      where: { id: resolutionId },
      data: { emailStatus: "FAILED", emailError: "Report no longer exists." },
    });
    return;
  }

  const language = report.reporter.language;
  const labels = t(language);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const reportUrl = `${appUrl}/my-reports/${reportId}`;

  const body = [
    labels.problemReportEmailIntro,
    "",
    labels.problemReportEmailResolutionLabel,
    resolution.note,
    "",
    labels.problemReportEmailLinkIntro,
    reportUrl,
    "",
    labels.problemReportEmailClosing,
  ].join("\n");

  const result = await sendEmailFn({ to: report.reporter.email, subject: labels.problemReportEmailSubject, body });

  await prisma.problemReportResolution.update({
    where: { id: resolutionId },
    data: result.ok
      ? { emailStatus: "SENT", emailSentAt: new Date() }
      : { emailStatus: "FAILED", emailError: result.error },
  });
}

// Owner-only. Preserves the existing, unconditional "reopen" ability —
// unlike resolve, this never needs a note and isn't gated on the current
// status (reopening an already-OPEN report is a harmless no-op). Resolution
// and feedback history are untouched; only status changes.
export async function reopenProblemReport(session: SessionPayload, reportId: string): Promise<ActionResult> {
  const denied = assertOwnerSession(session);
  if (denied) return denied;
  const updated = await prisma.problemReport.updateMany({ where: { id: reportId }, data: { status: "OPEN" } });
  if (updated.count === 0) return { ok: false, error: "Report not found." };
  return { ok: true };
}

// A signed-in user's own reports — enforced by reporterId, the TRUE actor
// (never the impersonated target), the same identity submitProblemReport
// stamps at filing time. Never returns another reporter's rows.
export async function getMyProblemReports(session: SessionPayload) {
  return prisma.problemReport.findMany({
    where: { reporterId: getTrueActorId(session) },
    orderBy: { createdAt: "desc" },
    include: PROBLEM_REPORT_LIST_INCLUDE,
  });
}

// A single report, only if it belongs to the signed-in user — null (never
// another reporter's data, not even an error that would hint it exists)
// otherwise.
export async function getMyProblemReportDetail(session: SessionPayload, reportId: string) {
  const report = await prisma.problemReport.findUnique({
    where: { id: reportId },
    include: PROBLEM_REPORT_LIST_INCLUDE,
  });
  if (!report || report.reporterId !== getTrueActorId(session)) return null;
  return report;
}

// The reporter's own response to a specific resolution. expectedResolutionId
// is whatever the reporter's page was actually rendered with (the report's
// latestResolutionId at page-load time, including null for a legacy
// RESOLVED report with no resolution row on file) — compared against the
// CURRENT latestResolutionId in the same conditional update that applies
// the outcome, so a stale page (the owner reopened and resolved again,
// or someone else already answered, since this was loaded) can never
// silently land feedback against the wrong resolution or overwrite a newer
// one. Only reachable while the report is RESOLVED — not OPEN, not already
// CONFIRMED (no repeated-feedback / already-decided double-submits).
export async function submitProblemReportFeedback(
  session: SessionPayload,
  reportId: string,
  expectedResolutionId: string | null,
  outcome: ProblemReportFeedbackOutcome,
  note: string
): Promise<ActionResult> {
  const report = await prisma.problemReport.findUnique({
    where: { id: reportId },
    select: { reporterId: true },
  });
  if (!report || report.reporterId !== getTrueActorId(session)) {
    return { ok: false, error: "Not authorized." };
  }

  const trimmedNote = note.trim() || null;
  const nextStatus = outcome === "CONFIRMED_WORKING" ? "CONFIRMED" : "OPEN";

  const whereClause: Prisma.ProblemReportWhereInput = {
    id: reportId,
    status: "RESOLVED",
    latestResolutionId: expectedResolutionId,
  };

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.problemReport.updateMany({ where: whereClause, data: { status: nextStatus } });
    if (updated.count === 0) return null;
    return tx.problemReportFeedback.create({
      data: { reportId, resolutionId: expectedResolutionId, outcome, note: trimmedNote },
    });
  });

  if (!result) {
    return {
      ok: false,
      error: "This report changed since you last loaded it — refresh to see the latest update before responding.",
    };
  }
  return { ok: true };
}
