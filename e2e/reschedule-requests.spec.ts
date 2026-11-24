import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import {
  createRescheduleRequest,
  generateStatusToken,
  hashStatusToken,
  isOddAppointmentDate,
  isAppointmentWithin7Days,
  isPickupOverdue,
  is48hResponseDue,
  isDateOnlyPreference,
  findBlockingEarlierRequest,
  findPossibleDuplicates,
  canApprove,
  canComplete,
  canDecline,
  canWithdrawOrDuplicate,
  claimRequest,
  markMatchedInTcs,
  markTcsUpdated,
  markCustomerInformed,
  setFeeReview,
  setConfirmedResult,
  approveRequest,
  completeRequest,
  declineRequest,
  closeAsWithdrawnOrDuplicate,
  offerOption,
  sendStaffMessage,
  maybeSendAutomaticReceipt,
  isAutoReceiptEnabled,
  setAutoReceiptEnabled,
  markMessageNotSent,
  resendFailedMessage,
  getActiveSalesQueueViewerEmails,
  getOpenRequestsSummary,
  buildReceiptBody,
  TERMS_TEXT,
  TERMS_DATE_READ,
  type RawRescheduleInput,
} from "../src/lib/rescheduleRequests";
import { getPublicOpenOptions, recheckOpenOption, getCurrentTeamsOpen, getBlockWindowsSnapshot } from "../src/lib/slotCapacitySummary";
import { checkRateLimit, resetRateLimit } from "../src/lib/rateLimit";

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

async function logout(page: Page) {
  await page.evaluate(() => fetch("/logout", { method: "POST" }));
}

// Same capture/replay technique as sales-revenue-entry.spec.ts: captures a
// real, well-formed Server Action request's exact wire bytes, then replays
// those same bytes under a different session's cookies — proves
// authorization is what's refusing it, not a malformed payload.
interface CapturedAction {
  actionId: string;
  body: Buffer;
  contentType: string;
}

async function captureAction(page: Page, trigger: () => Promise<void>): Promise<CapturedAction> {
  let captured: CapturedAction | null = null;
  const listener = (req: import("@playwright/test").Request) => {
    const header = req.headers()["next-action"];
    if (header && !captured) {
      captured = { actionId: header, body: req.postDataBuffer() ?? Buffer.alloc(0), contentType: req.headers()["content-type"] ?? "text/plain;charset=UTF-8" };
    }
  };
  page.on("request", listener);
  await trigger();
  await page.waitForTimeout(800);
  page.off("request", listener);
  if (!captured) throw new Error("Failed to capture a Server Action request — trigger() didn't fire one.");
  return captured;
}

async function replayAction(page: Page, path: string, captured: CapturedAction) {
  return page.request.post(path, {
    headers: { "next-action": captured.actionId, "content-type": captured.contentType },
    data: captured.body,
  });
}

function validInput(overrides: Partial<RawRescheduleInput> = {}): RawRescheduleInput {
  return {
    name: "Jamie Customer",
    email: `jamie-${RUN_ID}-${Math.random().toString(36).slice(2)}@example.com`,
    phone: "",
    address: "",
    note: "",
    currentAppointmentDate: "2026-12-15",
    type: "MOVE_KEEP_SCHEDULE",
    arrivalWindow: "FLEXIBLE",
    frequency: "",
    chosenOptionDate: "",
    chosenOptionBlock: "",
    chosenOptionFeedMonthId: "",
    preferredDateText: "No preference, any weekday morning",
    ...overrides,
  };
}

test.describe("Reschedule requests: per-type submission and validation (direct lib calls)", () => {
  const createdIds: string[] = [];

  test.afterAll(async () => {
    await prisma.rescheduleMessage.deleteMany({ where: { requestId: { in: createdIds } } });
    await prisma.rescheduleNote.deleteMany({ where: { requestId: { in: createdIds } } });
    await prisma.rescheduleRequest.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.auditLogEntry.deleteMany({ where: { recordType: "RescheduleRequest", recordId: { in: createdIds } } });
  });

  test("MOVE_KEEP_SCHEDULE: valid submission with a preferred-date fallback succeeds", async () => {
    const result = await createRescheduleRequest(validInput());
    expect(result.ok).toBe(true);
    if (result.ok) createdIds.push(result.id);
  });

  test("MOVE_AND_RESTART: requires a frequency; valid submission succeeds", async () => {
    const missingFrequency = await createRescheduleRequest(validInput({ type: "MOVE_AND_RESTART", frequency: "" }));
    expect(missingFrequency.ok).toBe(false);

    const result = await createRescheduleRequest(validInput({ type: "MOVE_AND_RESTART", frequency: "EVERY_2_WEEKS" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      createdIds.push(result.id);
      const row = await prisma.rescheduleRequest.findUnique({ where: { id: result.id } });
      expect(row?.frequency).toBe("EVERY_2_WEEKS");
      expect(row?.arrivalWindow).toBe("FLEXIBLE");
    }
  });

  test("SKIP_ONE: needs only a current appointment date — no arrival window, frequency, or new-time fields stored even if submitted", async () => {
    const result = await createRescheduleRequest(
      validInput({
        type: "SKIP_ONE",
        arrivalWindow: "WINDOW_830_930",
        frequency: "WEEKLY",
        preferredDateText: "ignored for a skip",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      createdIds.push(result.id);
      const row = await prisma.rescheduleRequest.findUnique({ where: { id: result.id } });
      expect(row?.arrivalWindow).toBeNull();
      expect(row?.frequency).toBeNull();
      expect(row?.preferredDateText).toBeNull();
    }
  });

  test("a MOVE type needs either a chosen option or a preferred date — neither is rejected", async () => {
    const result = await createRescheduleRequest(validInput({ preferredDateText: "" }));
    expect(result.ok).toBe(false);
  });

  test("blank name, invalid email, and a malformed appointment date are all rejected", async () => {
    expect((await createRescheduleRequest(validInput({ name: "" }))).ok).toBe(false);
    expect((await createRescheduleRequest(validInput({ email: "not-an-email" }))).ok).toBe(false);
    expect((await createRescheduleRequest(validInput({ currentAppointmentDate: "2026-02-30" }))).ok).toBe(false);
    expect((await createRescheduleRequest(validInput({ currentAppointmentDate: "" }))).ok).toBe(false);
  });

  test("a past or otherwise odd current appointment date is accepted, never rejected — and reads as flagged", async () => {
    const pastResult = await createRescheduleRequest(validInput({ currentAppointmentDate: "2000-01-01" }));
    expect(pastResult.ok).toBe(true);
    if (pastResult.ok) {
      createdIds.push(pastResult.id);
      expect(isOddAppointmentDate(new Date("2000-01-01T00:00:00Z"))).toBe(true);
    }
    expect(isOddAppointmentDate(new Date("2026-12-20T00:00:00Z"), new Date("2026-12-15T00:00:00Z"))).toBe(false);
  });

  test("a status token is a 128-bit random value whose hash (not the token itself) is stored", async () => {
    const result = await createRescheduleRequest(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdIds.push(result.id);

    expect(result.statusToken).toMatch(/^[0-9a-f]{32}$/);
    const row = await prisma.rescheduleRequest.findUnique({ where: { id: result.id } });
    expect(row?.statusTokenHash).toBe(hashStatusToken(result.statusToken));
    expect(row?.statusTokenHash).not.toBe(result.statusToken);

    // A different random token never generates the same hash.
    expect(hashStatusToken(generateStatusToken())).not.toBe(row?.statusTokenHash);
  });
});

test.describe("Reschedule requests: terms constant, no fee computed", () => {
  test("the terms constant is the exact same value regardless of request type or date", () => {
    // It's a plain module constant, never interpolated per-request — the
    // strongest possible proof it's "shown identically to everyone" is that
    // building the receipt for two wildly different requests embeds the
    // exact same terms substring both times.
    const a = buildReceiptBody(
      { name: "A One", type: "SKIP_ONE", currentAppointmentDate: new Date("2000-01-01T00:00:00Z") },
      "/reschedule/status/aaa"
    );
    const b = buildReceiptBody(
      { name: "B Two", type: "MOVE_AND_RESTART", currentAppointmentDate: new Date("2099-06-15T00:00:00Z") },
      "/reschedule/status/bbb"
    );
    expect(a).toContain(TERMS_TEXT);
    expect(b).toContain(TERMS_TEXT);
  });

  test("the dollar figures and percentages in the terms are the source's own static published text, never computed or interpolated per request", () => {
    // The published text does name its own fixed figures (e.g. "$50 fee",
    // "100% of your cleaning fee") — this app never calculates a fee itself,
    // it only ever displays this one unchanging constant. Proof: no leftover
    // template-interpolation artifact, and the exact published figures.
    expect(TERMS_TEXT).not.toMatch(/\$\{/);
    expect(TERMS_TEXT).toContain("a $50 fee will apply");
    expect(TERMS_TEXT).toContain("100% of your cleaning fee");
  });

  test("the published text replaced the placeholder: no PLACEHOLDER wording remains, and the date read is set", () => {
    expect(TERMS_TEXT).not.toMatch(/PLACEHOLDER/i);
    expect(TERMS_DATE_READ).not.toMatch(/PLACEHOLDER|NOT YET READ/i);
    expect(TERMS_DATE_READ).toBe("2026-11-24");
    expect(TERMS_TEXT).toContain("Cancellation & Schedule Changes");
    expect(TERMS_TEXT).toContain("Skip Service Policy: Keeping It Consistent");
    expect(TERMS_TEXT).toContain(
      "Moves and skips are requested through this form. To pause or end service, please call or email us."
    );
  });

  test("the receipt body contains the terms text exactly, with no PLACEHOLDER wording", () => {
    const receipt = buildReceiptBody(
      { name: "Receipt Checker", type: "MOVE_KEEP_SCHEDULE", currentAppointmentDate: new Date("2026-12-01T00:00:00Z") },
      "/reschedule/status/ccc"
    );
    expect(receipt).toContain(TERMS_TEXT);
    expect(receipt).not.toMatch(/PLACEHOLDER/i);
  });
});

test.describe("Reschedule requests: badges (direct lib calls)", () => {
  test("appointment-within-7-days is true only for 0-7 days out, inclusive", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(isAppointmentWithin7Days(new Date("2026-06-15T00:00:00Z"), now)).toBe(true);
    expect(isAppointmentWithin7Days(new Date("2026-06-22T00:00:00Z"), now)).toBe(true);
    expect(isAppointmentWithin7Days(new Date("2026-06-23T00:00:00Z"), now)).toBe(false);
    expect(isAppointmentWithin7Days(new Date("2026-06-10T00:00:00Z"), now)).toBe(false);
  });

  test("pickup-overdue fires once 10 business-hours-minutes have passed unclaimed, never once claimed", async () => {
    // A Monday 9:00am submission, checked 15 real minutes later (well within
    // business hours both times) — 15 business minutes have passed.
    const createdAt = new Date("2026-06-15T09:00:00-07:00");
    const checkedAt = new Date("2026-06-15T09:15:00-07:00");
    expect(await isPickupOverdue(createdAt, null, checkedAt)).toBe(true);
    expect(await isPickupOverdue(createdAt, null, new Date("2026-06-15T09:05:00-07:00"))).toBe(false);
    expect(await isPickupOverdue(createdAt, new Date("2026-06-15T09:02:00-07:00"), checkedAt)).toBe(false);
  });

  test("48h-response-due is literal elapsed time, cleared by a first response or a close — never by the receipt", () => {
    const createdAt = new Date("2026-06-01T00:00:00Z");
    const notYet = new Date("2026-06-02T00:00:00Z");
    const overdue = new Date("2026-06-03T01:00:00Z");
    expect(is48hResponseDue(createdAt, null, "NEW", notYet)).toBe(false);
    expect(is48hResponseDue(createdAt, null, "NEW", overdue)).toBe(true);
    expect(is48hResponseDue(createdAt, new Date("2026-06-01T12:00:00Z"), "NEW", overdue)).toBe(false);
    expect(is48hResponseDue(createdAt, null, "CLOSED", overdue)).toBe(false);
  });

  test("date-only or free-text preferences are flagged for review and never block another request's specific opening", () => {
    expect(isDateOnlyPreference({ type: "MOVE_KEEP_SCHEDULE", chosenOptionBlock: null, preferredDateText: "sometime in July" })).toBe(true);
    expect(isDateOnlyPreference({ type: "MOVE_KEEP_SCHEDULE", chosenOptionBlock: "Midday", preferredDateText: null })).toBe(false);
    expect(isDateOnlyPreference({ type: "SKIP_ONE", chosenOptionBlock: null, preferredDateText: null })).toBe(false);
  });

  test("possible-duplicate matches same email + same current appointment date only", () => {
    const base = { id: "a", email: "x@example.com", currentAppointmentDate: new Date("2026-07-01T00:00:00Z") };
    const sameEmailSameDate = { id: "b", email: "X@EXAMPLE.COM", currentAppointmentDate: new Date("2026-07-01T00:00:00Z") };
    const sameEmailDiffDate = { id: "c", email: "x@example.com", currentAppointmentDate: new Date("2026-07-02T00:00:00Z") };
    const diffEmail = { id: "d", email: "y@example.com", currentAppointmentDate: new Date("2026-07-01T00:00:00Z") };
    const dupes = findPossibleDuplicates(base, [sameEmailSameDate, sameEmailDiffDate, diffEmail]);
    expect(dupes.map((d) => d.id)).toEqual(["b"]);
  });
});

interface FifoTestRow {
  id: string;
  createdAt: Date;
  chosenOptionDate: Date | null;
  chosenOptionBlock: string | null;
  workStatus: "NEW" | "IN_PROGRESS" | "WAITING_ON_CUSTOMER" | "CLOSED";
  closeOutcome: "COMPLETED" | "DECLINED" | "WITHDRAWN" | "DUPLICATE_OR_INVALID" | null;
}

test.describe("Reschedule requests: FIFO blocking (direct lib calls)", () => {
  // The FIFO key is the (date, block) opening the customer saw — never the
  // underlying feed window, which is never shown to them in the first
  // place. Two requests picking the same (date, block) are the same
  // candidate opening even if the server captured a different feed window
  // snapshot for each (e.g. the feed changed which window(s) a block lists
  // between the two submissions).
  const sameOpening = { chosenOptionDate: new Date("2026-08-10T00:00:00Z"), chosenOptionBlock: "Midday" };

  test("an older still-open request for the exact same opening blocks a newer one", () => {
    const older: FifoTestRow = { id: "r1", createdAt: new Date("2026-01-01T00:00:00Z"), workStatus: "NEW", closeOutcome: null, ...sameOpening };
    const newer: FifoTestRow = { id: "r2", createdAt: new Date("2026-01-02T00:00:00Z"), workStatus: "NEW", closeOutcome: null, ...sameOpening };
    expect(findBlockingEarlierRequest(newer, [older])?.id).toBe("r1");
    expect(findBlockingEarlierRequest(older, [newer])).toBeNull();
  });

  test("a COMPLETED request still holds its opening — staff must recheck TCS, it never silently releases", () => {
    const older: FifoTestRow = { id: "r1", createdAt: new Date("2026-01-01T00:00:00Z"), workStatus: "CLOSED", closeOutcome: "COMPLETED", ...sameOpening };
    const newer: FifoTestRow = { id: "r2", createdAt: new Date("2026-01-02T00:00:00Z"), workStatus: "NEW", closeOutcome: null, ...sameOpening };
    expect(findBlockingEarlierRequest(newer, [older])?.id).toBe("r1");
  });

  test("DECLINED, WITHDRAWN, and DUPLICATE_OR_INVALID all release the opening — but merely being CLOSED with no outcome set never does", () => {
    for (const outcome of ["DECLINED", "WITHDRAWN", "DUPLICATE_OR_INVALID"] as const) {
      const older: FifoTestRow = { id: "r1", createdAt: new Date("2026-01-01T00:00:00Z"), workStatus: "CLOSED", closeOutcome: outcome, ...sameOpening };
      const newer: FifoTestRow = { id: "r2", createdAt: new Date("2026-01-02T00:00:00Z"), workStatus: "NEW", closeOutcome: null, ...sameOpening };
      expect(findBlockingEarlierRequest(newer, [older]), `outcome: ${outcome}`).toBeNull();
    }
  });

  test("a date-only preference (no chosen option at all) never blocks, and is never blocked", () => {
    const dateOnly: FifoTestRow = { id: "r1", createdAt: new Date("2026-01-01T00:00:00Z"), workStatus: "NEW", closeOutcome: null, chosenOptionDate: null, chosenOptionBlock: null };
    const specific: FifoTestRow = { id: "r2", createdAt: new Date("2026-01-02T00:00:00Z"), workStatus: "NEW", closeOutcome: null, ...sameOpening };
    expect(findBlockingEarlierRequest(dateOnly, [specific])).toBeNull();
    expect(findBlockingEarlierRequest(specific, [dateOnly])).toBeNull();
  });

  test("a DIFFERENT date never blocks", () => {
    const older: FifoTestRow = { id: "r1", createdAt: new Date("2026-01-01T00:00:00Z"), workStatus: "NEW", closeOutcome: null, ...sameOpening };
    const differentDate: FifoTestRow = {
      id: "r2",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      workStatus: "NEW",
      closeOutcome: null,
      chosenOptionDate: new Date("2026-08-11T00:00:00Z"),
      chosenOptionBlock: sameOpening.chosenOptionBlock,
    };
    expect(findBlockingEarlierRequest(differentDate, [older])).toBeNull();
  });

  test("two requests for the same (date, block) block the later one; a DIFFERENT block on the same date never blocks, even though the feed window is no longer part of the key", () => {
    const older: FifoTestRow = { id: "r1", createdAt: new Date("2026-01-01T00:00:00Z"), workStatus: "NEW", closeOutcome: null, ...sameOpening };

    const sameDateAndBlock: FifoTestRow = {
      id: "r2",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      workStatus: "NEW",
      closeOutcome: null,
      chosenOptionDate: sameOpening.chosenOptionDate,
      chosenOptionBlock: sameOpening.chosenOptionBlock,
    };
    expect(findBlockingEarlierRequest(sameDateAndBlock, [older])?.id).toBe("r1");

    const differentBlock: FifoTestRow = {
      id: "r3",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      workStatus: "NEW",
      closeOutcome: null,
      chosenOptionDate: sameOpening.chosenOptionDate,
      chosenOptionBlock: "Afternoon",
    };
    expect(findBlockingEarlierRequest(differentBlock, [older])).toBeNull();
  });
});

test.describe("Reschedule requests: completion matrix (direct lib calls + DB-backed flow)", () => {
  let adminId: string;
  const createdIds: string[] = [];

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    adminId = admin.id;
  });

  test.afterAll(async () => {
    await prisma.rescheduleMessage.deleteMany({ where: { requestId: { in: createdIds } } });
    await prisma.rescheduleNote.deleteMany({ where: { requestId: { in: createdIds } } });
    await prisma.rescheduleRequest.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.auditLogEntry.deleteMany({ where: { recordType: { in: ["RescheduleRequest", "RescheduleMessage"] }, recordId: { in: createdIds } } });
  });

  test("canApprove/canComplete/canDecline/canWithdrawOrDuplicate pure preconditions", () => {
    expect(canApprove({ matchedInTcsAt: null })).toBe(false);
    expect(canApprove({ matchedInTcsAt: new Date() })).toBe(true);

    const completeBase = {
      decision: "APPROVED" as const,
      tcsUpdatedAt: new Date(),
      confirmedDate: new Date(),
      confirmedOriginalOutcome: "cancelled",
      confirmedRecurrenceText: "every 2 weeks",
      confirmedFeeNotice: "No fee applies",
      feeReview: "NO_FEE" as const,
      customerInformedAt: new Date(),
    };
    expect(canComplete(completeBase)).toBe(true);
    expect(canComplete({ ...completeBase, decision: "PENDING" })).toBe(false);
    expect(canComplete({ ...completeBase, tcsUpdatedAt: null })).toBe(false);
    expect(canComplete({ ...completeBase, feeReview: "NOT_DECIDED" })).toBe(false);
    expect(canComplete({ ...completeBase, customerInformedAt: null })).toBe(false);
    expect(canComplete({ ...completeBase, confirmedFeeNotice: null })).toBe(false);

    expect(canDecline("", new Date())).toBe(false);
    expect(canDecline("a note", null)).toBe(false);
    expect(canDecline("a note", new Date())).toBe(true);

    expect(canWithdrawOrDuplicate("")).toBe(false);
    expect(canWithdrawOrDuplicate("a note")).toBe(true);
  });

  test("the full happy path: claim, match in TCS, approve, TCS updated, confirmed result, fee review, customer informed, complete", async () => {
    const created = await createRescheduleRequest(validInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.push(created.id);
    const id = created.id;

    await claimRequest(id, adminId);
    let row = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id } });
    expect(row.claimedById).toBe(adminId);
    expect(row.workStatus).toBe("IN_PROGRESS");

    // Approve is refused before "client and appointment matched in TCS".
    const tooEarly = await approveRequest(id, adminId);
    expect(tooEarly.ok).toBe(false);

    await markMatchedInTcs(id, adminId);
    const approved = await approveRequest(id, adminId);
    expect(approved.ok).toBe(true);

    // Complete is refused before every precondition is met.
    const tooEarlyComplete = await completeRequest(id, adminId);
    expect(tooEarlyComplete.ok).toBe(false);

    await markTcsUpdated(id, adminId);
    await setConfirmedResult(
      id,
      {
        confirmedDate: "2026-12-20",
        confirmedWindow: "10:30 AM-1:30 PM",
        confirmedOriginalOutcome: "Cancelled, no further action needed",
        confirmedRecurrenceText: "Stays every 2 weeks going forward",
        confirmedFeeNotice: "No fee applies",
      },
      adminId
    );
    await setFeeReview(id, "NO_FEE", "", adminId);

    const stillTooEarly = await completeRequest(id, adminId);
    expect(stillTooEarly.ok).toBe(false);

    await markCustomerInformed(id, adminId);
    const completed = await completeRequest(id, adminId);
    expect(completed.ok).toBe(true);

    row = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id } });
    expect(row.workStatus).toBe("CLOSED");
    expect(row.closeOutcome).toBe("COMPLETED");
    expect(row.statusTokenExpiresAt).not.toBeNull();
  });

  test("decline requires both a note and customer-informed; withdrawn/duplicate require only a note", async () => {
    const created = await createRescheduleRequest(validInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.push(created.id);
    const id = created.id;

    const noNote = await declineRequest(id, "", adminId);
    expect(noNote.ok).toBe(false);
    const notInformed = await declineRequest(id, "Customer no longer wants this", adminId);
    expect(notInformed.ok).toBe(false);

    await markCustomerInformed(id, adminId);
    const declined = await declineRequest(id, "Customer no longer wants this", adminId);
    expect(declined.ok).toBe(true);
    const row = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id } });
    expect(row.decision).toBe("DECLINED");
    expect(row.closeOutcome).toBe("DECLINED");
    expect(row.closeNote).toBe("Customer no longer wants this");

    const second = await createRescheduleRequest(validInput());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    createdIds.push(second.id);
    const withdrawn = await closeAsWithdrawnOrDuplicate(second.id, "WITHDRAWN", "Customer withdrew by phone", adminId);
    expect(withdrawn.ok).toBe(true);
    const emptyNote = await closeAsWithdrawnOrDuplicate(second.id, "DUPLICATE_OR_INVALID", "", adminId);
    expect(emptyNote.ok).toBe(false);
  });
});

test.describe("Reschedule requests: automatic receipt and message sending (direct lib calls)", () => {
  const createdIds: string[] = [];
  let originalSetting: { value: string } | null;

  test.beforeAll(async () => {
    originalSetting = await prisma.salesToolData.findUnique({ where: { key: "reschedule:autoReceiptEnabled" } });
  });

  test.afterAll(async () => {
    await prisma.rescheduleMessage.deleteMany({ where: { requestId: { in: createdIds } } });
    await prisma.rescheduleRequest.deleteMany({ where: { id: { in: createdIds } } });
    if (originalSetting) {
      await prisma.salesToolData.upsert({
        where: { key: "reschedule:autoReceiptEnabled" },
        create: { key: "reschedule:autoReceiptEnabled", value: originalSetting.value },
        update: { value: originalSetting.value },
      });
    } else {
      await prisma.salesToolData.deleteMany({ where: { key: "reschedule:autoReceiptEnabled" } });
    }
  });

  test("the receipt is off by default, and the toggle round-trips", async () => {
    await prisma.salesToolData.deleteMany({ where: { key: "reschedule:autoReceiptEnabled" } });
    expect(await isAutoReceiptEnabled()).toBe(false);
    await setAutoReceiptEnabled(true);
    expect(await isAutoReceiptEnabled()).toBe(true);
    await setAutoReceiptEnabled(false);
    expect(await isAutoReceiptEnabled()).toBe(false);
  });

  test("while off, no attempt is made at all", async () => {
    await setAutoReceiptEnabled(false);
    const created = await createRescheduleRequest(validInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.push(created.id);

    const sendEmailFn = async () => ({ ok: true as const });
    const result = await maybeSendAutomaticReceipt(created.id, "/reschedule/status/x", sendEmailFn);
    expect(result).toEqual({ attempted: false });
    const messages = await prisma.rescheduleMessage.findMany({ where: { requestId: created.id } });
    expect(messages).toHaveLength(0);
  });

  test("once on: exactly one EMAIL receipt per request, claimed before sending, never a second attempt", async () => {
    await setAutoReceiptEnabled(true);
    const created = await createRescheduleRequest(validInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.push(created.id);

    let calls = 0;
    const sendEmailFn = async () => {
      calls++;
      return { ok: true as const };
    };
    const first = await maybeSendAutomaticReceipt(created.id, "/reschedule/status/x", sendEmailFn);
    expect(first).toEqual({ attempted: true, ok: true });
    const second = await maybeSendAutomaticReceipt(created.id, "/reschedule/status/x", sendEmailFn);
    expect(second).toEqual({ attempted: false });
    expect(calls).toBe(1);

    const messages = await prisma.rescheduleMessage.findMany({ where: { requestId: created.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].channel).toBe("EMAIL");
    expect(messages[0].kind).toBe("RECEIPT");
    expect(messages[0].status).toBe("SENT");
  });

  test("a failed send is logged as FAILED and never breaks the submission", async () => {
    await setAutoReceiptEnabled(true);
    const created = await createRescheduleRequest(validInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.push(created.id);

    const sendEmailFn = async () => ({ ok: false as const, error: "simulated provider outage" });
    const result = await maybeSendAutomaticReceipt(created.id, "/reschedule/status/x", sendEmailFn);
    expect(result).toEqual({ attempted: true, ok: false });

    const message = await prisma.rescheduleMessage.findFirstOrThrow({ where: { requestId: created.id } });
    expect(message.status).toBe("FAILED");
    expect(message.errorMessage).toBe("simulated provider outage");
  });

  test("resend only ever applies to FAILED — a PENDING ('send uncertain') row is never auto-resent, and SENT is never resent", async () => {
    const created = await createRescheduleRequest(validInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.push(created.id);

    const pendingMessage = await prisma.rescheduleMessage.create({
      data: { requestId: created.id, channel: "EMAIL", kind: "RECEIPT", status: "PENDING", body: "uncertain" },
    });
    const resendPending = await resendFailedMessage(pendingMessage.id, await adminIdFor());
    expect(resendPending.ok).toBe(false);
    const stillPending = await prisma.rescheduleMessage.findUniqueOrThrow({ where: { id: pendingMessage.id } });
    expect(stillPending.status).toBe("PENDING");

    // Staff marks it not sent — now eligible for resend.
    await markMessageNotSent(pendingMessage.id, await adminIdFor());
    const markedNotSent = await prisma.rescheduleMessage.findUniqueOrThrow({ where: { id: pendingMessage.id } });
    expect(markedNotSent.status).toBe("FAILED");

    const resendOk = await resendFailedMessage(pendingMessage.id, await adminIdFor(), async () => ({ ok: true }));
    expect(resendOk.ok).toBe(true);
    const sent = await prisma.rescheduleMessage.findUniqueOrThrow({ where: { id: pendingMessage.id } });
    expect(sent.status).toBe("SENT");

    // SENT is never resent again — resendFailedMessage refuses non-FAILED rows.
    const resendAgain = await resendFailedMessage(pendingMessage.id, await adminIdFor(), async () => ({ ok: true }));
    expect(resendAgain.ok).toBe(false);
  });

  async function adminIdFor(): Promise<string> {
    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    return admin.id;
  }

  test("a staff-sent text is refused when no phone is on file; an email always works", async () => {
    const created = await createRescheduleRequest(validInput({ phone: "" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.push(created.id);

    const adminId = await adminIdFor();
    const smsResult = await sendStaffMessage(created.id, "SMS", "hello", adminId, {
      sendEmail: async () => ({ ok: true }),
      sendSms: async () => ({ ok: true }),
    });
    expect(smsResult.ok).toBe(false);

    const emailResult = await sendStaffMessage(created.id, "EMAIL", "hello", adminId, {
      sendEmail: async () => ({ ok: true }),
      sendSms: async () => ({ ok: true }),
    });
    expect(emailResult.ok).toBe(true);

    const row = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.firstStaffResponseAt).not.toBeNull();
  });
});

test.describe("Reschedule requests: alert recipients (direct lib calls)", () => {
  let salesRepWithGrantId: string;
  let salesRepNoGrantId: string;
  let serviceManagerWithGrantId: string;
  let officeAssistantId: string;
  let inactiveAdminId: string;
  const salesRepWithGrantEmail = `resched-sr-grant-${RUN_ID}@example.com`;
  const salesRepNoGrantEmail = `resched-sr-nograft-${RUN_ID}@example.com`;
  const smWithGrantEmail = `resched-sm-grant-${RUN_ID}@example.com`;
  const officeAssistantEmail = `resched-oa-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    const salesRepWithGrant = await prisma.user.create({
      data: {
        email: salesRepWithGrantEmail,
        name: "Resched Sales Rep Grant",
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepWithGrantId = salesRepWithGrant.id;

    const salesRepNoGrant = await prisma.user.create({
      data: {
        email: salesRepNoGrantEmail,
        name: "Resched Sales Rep No Grant",
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    salesRepNoGrantId = salesRepNoGrant.id;

    const serviceManagerWithGrant = await prisma.user.create({
      data: {
        email: smWithGrantEmail,
        name: "Resched SM Grant",
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: false }] },
      },
    });
    serviceManagerWithGrantId = serviceManagerWithGrant.id;

    const officeAssistant = await prisma.user.create({
      data: {
        email: officeAssistantEmail,
        name: "Resched OA",
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    officeAssistantId = officeAssistant.id;

    const inactiveAdmin = await prisma.user.create({
      data: {
        email: `resched-inactive-${RUN_ID}@example.com`,
        name: "Resched Inactive",
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: false,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    inactiveAdminId = inactiveAdmin.id;
  });

  test.afterAll(async () => {
    const ids = [salesRepWithGrantId, salesRepNoGrantId, serviceManagerWithGrantId, officeAssistantId, inactiveAdminId];
    await prisma.departmentAccess.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  test("only active, non-test, Sales-canView users are included — Office Assistant (whole-department Sales access doesn't apply to it), a Sales Rep with no grant, and an inactive account are all excluded", async () => {
    const emails = await getActiveSalesQueueViewerEmails();
    expect(emails).toContain(salesRepWithGrantEmail);
    expect(emails).toContain(smWithGrantEmail);
    expect(emails).not.toContain(salesRepNoGrantEmail);
    expect(emails).not.toContain(officeAssistantEmail);
    expect(emails).not.toContain(`resched-inactive-${RUN_ID}@example.com`);
  });

  test("the excludeEmail argument omits that one address (used to avoid BCC'ing the primary notify address twice)", async () => {
    const emails = await getActiveSalesQueueViewerEmails(salesRepWithGrantEmail);
    expect(emails).not.toContain(salesRepWithGrantEmail);
    expect(emails).toContain(smWithGrantEmail);
  });
});

test.describe("Reschedule requests: open options — order, projection, and recheck (direct lib calls)", () => {
  const monthDigit = (Number(RUN_ID.slice(-1)) % 9) + 1;
  const testMonth = `2099-0${monthDigit}`;
  const testMonth2 = `2100-0${monthDigit}`;
  const testMonth3 = `2101-0${monthDigit}`;
  const WINDOW_A = "9:00am-12:00pm";
  const WINDOW_B = "1:00pm-4:00pm";
  let feedMonthId: string;
  let feedMonthId2: string;
  let feedMonthId3: string;
  // dateA's one Midday block lists TWO windows sharing a single team count —
  // it must still collapse to exactly one public option.
  const dateA = "2099-03-10";
  const dateB = "2099-03-11";
  const dateC = "2100-03-05";
  const dateD = "2100-03-06";
  const dateE = "2100-03-07";
  const dateF = "2101-03-05";
  const allTestMonths = [testMonth, testMonth2, testMonth3];

  test.beforeAll(async () => {
    await prisma.slotBooking.deleteMany({ where: { month: { in: allTestMonths } } });
    await prisma.slotFeedMonth.deleteMany({ where: { month: { in: allTestMonths } } });

    const feedMonth = await prisma.slotFeedMonth.create({
      data: {
        month: testMonth,
        schema: "mcc-open-slots/v1",
        generatedAt: new Date(),
        settings: { min_lead_days: 1 },
        windowValuePerHour: { [WINDOW_A]: 90, [WINDOW_B]: 90 },
        routeBoard: {},
        dates: {
          create: [
            { date: new Date(dateA + "T00:00:00Z"), weekday: "Tuesday", status: "Open", openPersonHours: 20, openDollars: 2000, blocks: { Midday: { open: 1, windows: [WINDOW_A, WINDOW_B] } }, bookedJobs: [] },
            { date: new Date(dateB + "T00:00:00Z"), weekday: "Wednesday", status: "Open", openPersonHours: 20, openDollars: 2000, blocks: { Afternoon: { open: 2, windows: [WINDOW_B] } }, bookedJobs: [] },
          ],
        },
      },
    });
    feedMonthId = feedMonth.id;

    const feedMonth2 = await prisma.slotFeedMonth.create({
      data: {
        month: testMonth2,
        schema: "mcc-open-slots/v1",
        generatedAt: new Date(),
        settings: { min_lead_days: 1 },
        windowValuePerHour: { [WINDOW_A]: 90, [WINDOW_B]: 90 },
        routeBoard: {},
        dates: {
          create: [
            { date: new Date(dateC + "T00:00:00Z"), weekday: "Thursday", status: "Open", openPersonHours: 20, openDollars: 2000, blocks: { Morning: { open: 1, windows: [WINDOW_A] } }, bookedJobs: [] },
            { date: new Date(dateD + "T00:00:00Z"), weekday: "Friday", status: "Open", openPersonHours: 20, openDollars: 2000, blocks: { Midday: { open: 1, windows: [WINDOW_B] } }, bookedJobs: [] },
            { date: new Date(dateE + "T00:00:00Z"), weekday: "Saturday", status: "Open", openPersonHours: 20, openDollars: 2000, blocks: { Afternoon: { open: 1, windows: [WINDOW_A, WINDOW_B] } }, bookedJobs: [] },
          ],
        },
      },
    });
    feedMonthId2 = feedMonth2.id;

    const feedMonth3 = await prisma.slotFeedMonth.create({
      data: {
        month: testMonth3,
        schema: "mcc-open-slots/v1",
        generatedAt: new Date(),
        settings: { min_lead_days: 1 },
        windowValuePerHour: { [WINDOW_A]: 90 },
        routeBoard: {},
        dates: {
          create: [
            { date: new Date(dateF + "T00:00:00Z"), weekday: "Tuesday", status: "Open", openPersonHours: 20, openDollars: 2000, blocks: { Morning: { open: 1, windows: [WINDOW_A] } }, bookedJobs: [] },
          ],
        },
      },
    });
    feedMonthId3 = feedMonth3.id;
  });

  test.afterAll(async () => {
    await prisma.slotBooking.deleteMany({ where: { month: { in: allTestMonths } } });
    await prisma.slotFeedMonth.deleteMany({ where: { month: { in: allTestMonths } } });
  });

  test("options are returned earliest-first, whitelisted to exactly {date, weekday, block, feedMonthId} — never window, teamsOpen, or $/hr", async () => {
    const options = await getPublicOpenOptions(5, new Date("2099-01-01T00:00:00Z"));
    const thisMonthOptions = options.filter((o) => o.date === dateA || o.date === dateB);
    expect(thisMonthOptions.length).toBeGreaterThanOrEqual(2);
    const aIdx = thisMonthOptions.findIndex((o) => o.date === dateA);
    const bIdx = thisMonthOptions.findIndex((o) => o.date === dateB);
    expect(aIdx).toBeLessThan(bIdx);

    for (const o of thisMonthOptions) {
      expect(Object.keys(o).sort()).toEqual(["block", "date", "feedMonthId", "weekday"].sort());
    }
  });

  test("a feed date whose one block lists two windows produces exactly one option, not two", async () => {
    const options = await getPublicOpenOptions(20, new Date("2099-01-01T00:00:00Z"));
    const forDateA = options.filter((o) => o.date === dateA);
    expect(forDateA).toHaveLength(1);
    expect(forDateA[0].block).toBe("Midday");
  });

  test("five distinct (date, block) openings are returned across a month boundary, earliest first", async () => {
    const options = await getPublicOpenOptions(20, new Date("2099-01-01T00:00:00Z"));
    const ours = options.filter((o) => [dateA, dateB, dateC, dateD, dateE].includes(o.date));
    expect(ours.map((o) => `${o.date}|${o.block}`)).toEqual([
      `${dateA}|Midday`,
      `${dateB}|Afternoon`,
      `${dateC}|Morning`,
      `${dateD}|Midday`,
      `${dateE}|Afternoon`,
    ]);
  });

  test("fewer than the limit are returned when fewer distinct openings exist", async () => {
    const options = await getPublicOpenOptions(20, new Date("2099-01-01T00:00:00Z"));
    const ours = options.filter((o) => o.date === dateF);
    expect(ours).toHaveLength(1);
  });

  test("getCurrentTeamsOpen reflects live bookings, server-side only", async () => {
    expect(await getCurrentTeamsOpen(feedMonthId, dateA, "Midday")).toBe(1);
    await prisma.slotBooking.create({
      data: { month: testMonth, date: new Date(dateA + "T00:00:00Z"), block: "Midday", window: WINDOW_A, city: "Irvine", address: "1 Test St", repId: (await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } })).id, personHours: 4, status: "CONFIRMED" },
    });
    expect(await getCurrentTeamsOpen(feedMonthId, dateA, "Midday")).toBe(0);
  });

  test("getBlockWindowsSnapshot joins every window a block lists, for staff-only context — never shown to the public", async () => {
    expect(await getBlockWindowsSnapshot(feedMonthId, dateA, "Midday")).toBe(`${WINDOW_A}, ${WINDOW_B}`);
    expect(await getBlockWindowsSnapshot(feedMonthId, dateB, "Afternoon")).toBe(WINDOW_B);
    expect(await getBlockWindowsSnapshot(feedMonthId, dateA, "Afternoon")).toBeNull();
  });

  test("recheckOpenOption: STILL_OPEN, NO_LONGER_OPEN (booked out), and FEED_REPLACED (feed re-imported under a new id) — keyed by (feedMonthId, date, block) only, no window input", async () => {
    expect(await recheckOpenOption(feedMonthId, dateB, "Afternoon")).toBe("STILL_OPEN");

    const adminId = (await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } })).id;
    await prisma.slotBooking.createMany({
      data: [
        { month: testMonth, date: new Date(dateB + "T00:00:00Z"), block: "Afternoon", window: WINDOW_B, city: "Irvine", address: "2 Test St", repId: adminId, personHours: 4, status: "CONFIRMED" },
        { month: testMonth, date: new Date(dateB + "T00:00:00Z"), block: "Afternoon", window: WINDOW_B, city: "Irvine", address: "3 Test St", repId: adminId, personHours: 4, status: "CONFIRMED" },
      ],
    });
    expect(await recheckOpenOption(feedMonthId, dateB, "Afternoon")).toBe("NO_LONGER_OPEN");

    expect(await recheckOpenOption("not-a-real-feed-month-id", dateB, "Afternoon")).toBe("FEED_REPLACED");
  });

  test("submitting a chosen option stores it by (feedMonthId, date, block); the feed window is captured server-side only, never from client input", async () => {
    const result = await createRescheduleRequest(
      validInput({
        chosenOptionDate: dateA,
        chosenOptionBlock: "Midday",
        chosenOptionFeedMonthId: feedMonthId,
        preferredDateText: "",
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.chosenOptionDate?.toISOString().slice(0, 10)).toBe(dateA);
    expect(row.chosenOptionBlock).toBe("Midday");
    expect(row.chosenOptionFeedMonthId).toBe(feedMonthId);
    // Derived server-side from the feed itself, never sent by the client —
    // RawRescheduleInput has no window field at all.
    expect(row.chosenOptionWindow).toBe(`${WINDOW_A}, ${WINDOW_B}`);

    await prisma.rescheduleRequest.delete({ where: { id: result.id } });
    await prisma.auditLogEntry.deleteMany({ where: { recordType: "RescheduleRequest", recordId: result.id } });
  });

  test("two open requests for the same (date, block) block the later offer; different blocks on the same date do not", async () => {
    const holder = await createRescheduleRequest(
      validInput({ chosenOptionDate: dateC, chosenOptionBlock: "Morning", chosenOptionFeedMonthId: feedMonthId2, preferredDateText: "" })
    );
    expect(holder.ok).toBe(true);
    if (!holder.ok) return;
    await new Promise((r) => setTimeout(r, 10));

    const other = await createRescheduleRequest(validInput({ name: `Offer Target ${RUN_ID}` }));
    expect(other.ok).toBe(true);
    if (!other.ok) return;

    try {
      const adminId = (await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } })).id;

      // The older holder's (date, block) — blocked.
      const blockedOffer = await offerOption(other.id, { date: dateC, block: "Morning" }, "Proposing the same Morning opening", adminId);
      expect(blockedOffer.ok).toBe(false);

      // Same date, a DIFFERENT block — never blocked by the holder.
      const differentBlockOffer = await offerOption(other.id, { date: dateC, block: "Afternoon" }, "Proposing a different block", adminId);
      expect(differentBlockOffer.ok).toBe(true);
    } finally {
      await prisma.rescheduleRequest.deleteMany({ where: { id: { in: [holder.id, other.id] } } });
      await prisma.auditLogEntry.deleteMany({ where: { recordType: "RescheduleRequest", recordId: { in: [holder.id, other.id] } } });
    }
  });
});

test.describe("Reschedule requests: open-requests summary", () => {
  const createdIds: string[] = [];

  test.afterAll(async () => {
    await prisma.rescheduleRequest.deleteMany({ where: { id: { in: createdIds } } });
  });

  test("counts only non-CLOSED requests and reports the oldest's createdAt", async () => {
    const before = await getOpenRequestsSummary();
    const a = await createRescheduleRequest(validInput());
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    createdIds.push(a.id);
    const after = await getOpenRequestsSummary();
    expect(after.count).toBe(before.count + 1);
    expect(after.oldestCreatedAt).not.toBeNull();
  });
});

test.describe("Reschedule requests: rate limiting (direct lib calls)", () => {
  test("allows up to the limit, then refuses, then recovers after the window", () => {
    const key = `test-rl-${RUN_ID}`;
    resetRateLimit(key);
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, now, 1000, 5)).toBe(true);
    }
    expect(checkRateLimit(key, now, 1000, 5)).toBe(false);
    expect(checkRateLimit(key, now + 1001, 1000, 5)).toBe(true);
    resetRateLimit(key);
  });
});

test.describe.serial("Reschedule requests: public form, honeypot, rate limit (browser)", () => {
  const createdEmails: string[] = [];

  test.afterAll(async () => {
    const rows = await prisma.rescheduleRequest.findMany({ where: { email: { in: createdEmails } }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    await prisma.rescheduleMessage.deleteMany({ where: { requestId: { in: ids } } });
    await prisma.rescheduleRequest.deleteMany({ where: { id: { in: ids } } });
  });

  test("the public page is reachable without logging in, and shows the terms notice with its source link", async ({ page }) => {
    await page.goto("/reschedule");
    await expect(page.getByText("Fee, skip, and frequency-rate terms")).toBeVisible();
    await expect(page.locator('a[href="https://mamascleaningcrew.com/policies-guidelines/"]')).toBeVisible();
  });

  test("the page shows the terms text exactly, with no PLACEHOLDER wording and the correct read date", async ({ page }) => {
    await page.goto("/reschedule");
    await expect(page.getByText("Cancellation & Schedule Changes")).toBeVisible();
    await expect(page.getByText("Skip Service Policy: Keeping It Consistent")).toBeVisible();
    // Case-sensitive: the page's own form inputs legitimately use the
    // lowercase HTML `placeholder` attribute — only the all-caps marker left
    // over from the terms placeholder would be a real leak.
    const html = await page.content();
    expect(html).not.toContain("PLACEHOLDER");
    await expect(page.getByText(`(read ${TERMS_DATE_READ})`)).toBeVisible();
  });

  test("the rendered page and its serialized props for the options contain no window range text, teamsOpen, or dollar-per-hour fields", async ({ page }) => {
    await page.goto("/reschedule");

    // The full page HTML includes the RSC flight payload embedded for
    // hydration — these internal field/value names must never appear in it
    // at all, not even unrendered.
    const html = await page.content();
    expect(html).not.toMatch(/teamsOpen/);
    expect(html).not.toMatch(/windowValuePerHour/);
    expect(html).not.toMatch(/chosenOptionWindow/);

    // Each rendered option's visible label is only "{weekday}, {date} ·
    // {block}" — never a feed time-range (always h:mm am/pm-h:mm am/pm) or a
    // dollar figure.
    const optionLabels = await page.locator('label:has(input[name="option-choice"])').allTextContents();
    const realOptionLabels = optionLabels.filter((t) => !t.includes("None of these work"));
    for (const label of realOptionLabels) {
      expect(label).not.toMatch(/\d{1,2}(:\d{2})?\s?(am|pm)/i);
      expect(label).not.toMatch(/\$/);
    }
  });

  test("a MOVE_KEEP_SCHEDULE submission with a preferred date succeeds and shows a status link, never auto-approved", async ({ page }) => {
    const email = `browser-move-${RUN_ID}@example.com`;
    createdEmails.push(email);
    await page.goto("/reschedule");
    await page.fill("#name", "Browser Move Customer");
    await page.fill("#email", email);
    await page.fill("#currentAppointmentDate", "2026-12-18");
    const otherDateRadio = page.locator('input[name="option-choice"]').last();
    if (await otherDateRadio.count()) {
      await otherDateRadio.check();
    }
    const preferredTextbox = page.locator("textarea").first();
    await preferredTextbox.fill("Anytime the following week");
    await page.click('button:has-text("Submit Request")');
    await expect(page.getByText("Request received")).toBeVisible();
    await expect(page.getByText(/not approved yet|stays scheduled/)).toBeVisible();

    const row = await prisma.rescheduleRequest.findFirstOrThrow({ where: { email } });
    expect(row.decision).toBe("PENDING");
    expect(row.workStatus).toBe("NEW");
  });

  test("a SKIP_ONE submission needs no arrival window or new-time fields", async ({ page }) => {
    const email = `browser-skip-${RUN_ID}@example.com`;
    createdEmails.push(email);
    await page.goto("/reschedule");
    await page.fill("#name", "Browser Skip Customer");
    await page.fill("#email", email);
    await page.fill("#currentAppointmentDate", "2026-12-19");
    await page.getByText("Skip this one cleaning").click();
    await page.click('button:has-text("Submit Request")');
    await expect(page.getByText("Request received")).toBeVisible();

    const row = await prisma.rescheduleRequest.findFirstOrThrow({ where: { email } });
    expect(row.type).toBe("SKIP_ONE");
    expect(row.arrivalWindow).toBeNull();
  });

  test("filling the honeypot field pretends success but creates nothing", async ({ page }) => {
    const email = `browser-honeypot-${RUN_ID}@example.com`;
    await page.goto("/reschedule");
    await page.fill("#name", "Bot");
    await page.fill("#email", email);
    await page.fill("#currentAppointmentDate", "2026-12-20");
    await page.locator('input[name="website"]').fill("http://spam.example.com");
    const preferredTextbox = page.locator("textarea").first();
    await preferredTextbox.fill("anything");
    await page.click('button:has-text("Submit Request")');
    await expect(page.getByText("Request received")).toBeVisible();

    const row = await prisma.rescheduleRequest.findFirst({ where: { email } });
    expect(row).toBeNull();
  });

  test("rate limiting refuses submissions past the per-connection limit", async ({ page }) => {
    await page.goto("/reschedule");
    let lastResult: { ok: boolean } | null = null;
    for (let i = 0; i < 6; i++) {
      const email = `browser-ratelimit-${RUN_ID}-${i}@example.com`;
      createdEmails.push(email);
      await page.goto("/reschedule");
      await page.fill("#name", "Rate Limit Test");
      await page.fill("#email", email);
      await page.fill("#currentAppointmentDate", "2026-12-21");
      const preferredTextbox = page.locator("textarea").first();
      await preferredTextbox.fill("anything");
      await page.click('button:has-text("Submit Request")');
      const succeeded = await page.getByText("Request received").isVisible().catch(() => false);
      lastResult = { ok: succeeded };
    }
    expect(lastResult?.ok).toBe(false);
    await expect(page.getByText(/too many requests/i)).toBeVisible();
  });
});

test.describe.serial("Reschedule requests: staff queue access matrix (browser)", () => {
  let salesRepEditId: string;
  let salesRepViewOnlyId: string;
  let traineeId: string;
  const salesRepEditEmail = `resched-queue-edit-${RUN_ID}@example.com`;
  const salesRepViewOnlyEmail = `resched-queue-view-${RUN_ID}@example.com`;
  const traineeEmail = `resched-queue-trainee-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    const salesRepEdit = await prisma.user.create({
      data: {
        email: salesRepEditEmail,
        name: "Resched Queue Edit",
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepEditId = salesRepEdit.id;

    const salesRepViewOnly = await prisma.user.create({
      data: {
        email: salesRepViewOnlyEmail,
        name: "Resched Queue View",
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: false }] },
      },
    });
    salesRepViewOnlyId = salesRepViewOnly.id;

    const trainee = await prisma.user.create({
      data: {
        email: traineeEmail,
        name: "Resched Queue Trainee",
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    traineeId = trainee.id;
  });

  test.afterAll(async () => {
    const ids = [salesRepEditId, salesRepViewOnlyId, traineeId];
    await prisma.departmentAccess.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  test("ADMIN sees the queue and the form link", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/reschedules");
    await expect(page.getByRole("heading", { name: "Reschedule Requests" })).toBeVisible();
    await expect(page.getByText("Open request form").first()).toBeVisible();
    await logout(page);
  });

  test("a Sales Rep WITH canEdit sees Claim buttons enabled", async ({ page }) => {
    await loginAs(page, salesRepEditEmail, PASSWORD);
    await page.goto("/sales/reschedules");
    await expect(page).toHaveURL(/\/sales\/reschedules/);
    await logout(page);
  });

  test("a Sales Rep WITHOUT a Sales grant is redirected away", async ({ page }) => {
    const noGrantEmail = `resched-queue-nograft-${RUN_ID}@example.com`;
    const noGrant = await prisma.user.create({
      data: {
        email: noGrantEmail,
        name: "No Grant",
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    await loginAs(page, noGrantEmail, PASSWORD);
    await page.goto("/sales/reschedules");
    await expect(page).not.toHaveURL(/\/sales\/reschedules/);
    await logout(page);
    await prisma.user.delete({ where: { id: noGrant.id } });
  });

  test("a non-Sales role (Trainee) is redirected away", async ({ page }) => {
    await loginAs(page, traineeEmail, PASSWORD);
    await page.goto("/sales/reschedules");
    await expect(page).not.toHaveURL(/\/sales\/reschedules/);
    await logout(page);
  });

  test("the form link equals NEXT_PUBLIC_APP_URL + /reschedule in plain selectable text, shown only inside the Sales-gated queue — viewing it sends/creates nothing", async ({ page }) => {
    const before = await prisma.rescheduleRequest.count();
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/reschedules");
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
    if (appUrl) {
      await expect(page.getByText(`${appUrl}/reschedule`, { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText("Form link unavailable")).toBeVisible();
    }
    const after = await prisma.rescheduleRequest.count();
    expect(after).toBe(before);
    await logout(page);
  });

  test("a canView-only Sales Rep's Claim button isn't even rendered, and the real captured claim request is refused and writes nothing when replayed under that session", async ({ page }) => {
    const created = await createRescheduleRequest(validInput({ name: `View Only Target ${RUN_ID}` }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Capture a genuine, well-formed claim request as the owner — control:
    // it must actually claim the request.
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/reschedules");
    const row = page.locator("div.rounded-lg", { hasText: `View Only Target ${RUN_ID}` });
    const captured = await captureAction(page, async () => {
      await row.getByRole("button", { name: "Claim" }).click();
    });
    const afterOwnerClaim = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterOwnerClaim.claimedById, "control: the owner's own claim must have written").not.toBeNull();
    await logout(page);

    // The canView-only Sales Rep never even sees a Claim button at all
    // (canEdit is false, so the whole control is omitted from the page,
    // not merely disabled).
    await loginAs(page, salesRepViewOnlyEmail, PASSWORD);
    await page.goto("/sales/reschedules");
    const viewOnlyRow = page.locator("div.rounded-lg", { hasText: `View Only Target ${RUN_ID}` });
    await expect(viewOnlyRow.getByRole("button", { name: "Claim" })).toHaveCount(0);

    // Replaying the real captured bytes under this same view-only session
    // must still be refused, with nothing further changed.
    const replayRes = await replayAction(page, "/sales/reschedules", captured);
    expect(replayRes.status(), "non-canEdit replay must surface the thrown Not-authorized error").toBe(500);
    const afterReplay = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterReplay.claimedById).toBe(afterOwnerClaim.claimedById);

    await logout(page);
    await prisma.rescheduleRequest.delete({ where: { id: created.id } });
  });
});

test.describe.serial("Reschedule requests: queue ordering and badges (browser)", () => {
  const createdIds: string[] = [];

  test.afterAll(async () => {
    await prisma.rescheduleRequest.deleteMany({ where: { id: { in: createdIds } } });
  });

  test("the queue lists requests oldest-first regardless of badges", async ({ page }) => {
    const older = await createRescheduleRequest(validInput({ name: `Older Request ${RUN_ID}` }));
    expect(older.ok).toBe(true);
    if (older.ok) createdIds.push(older.id);
    await new Promise((r) => setTimeout(r, 10));
    const newer = await createRescheduleRequest(validInput({ name: `Newer Request ${RUN_ID}`, currentAppointmentDate: "2000-01-01" }));
    expect(newer.ok).toBe(true);
    if (newer.ok) createdIds.push(newer.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/reschedules");
    const names = await page.locator("p.font-semibold").allTextContents();
    const olderIdx = names.findIndex((n) => n.includes(`Older Request ${RUN_ID}`));
    const newerIdx = names.findIndex((n) => n.includes(`Newer Request ${RUN_ID}`));
    expect(olderIdx).toBeGreaterThanOrEqual(0);
    expect(newerIdx).toBeGreaterThan(olderIdx);

    // The newer one's odd (past) current-appointment-date is flagged.
    const newerRow = page.locator("div.rounded-lg", { hasText: `Newer Request ${RUN_ID}` });
    await expect(newerRow.getByText("Odd date")).toBeVisible();
    await logout(page);
  });
});

test.describe.serial("Reschedule requests: status page states (browser)", () => {
  const createdIds: string[] = [];

  test.afterAll(async () => {
    await prisma.rescheduleRequest.deleteMany({ where: { id: { in: createdIds } } });
  });

  test("an invalid token shows the generic not-found message", async ({ page }) => {
    await page.goto("/reschedule/status/not-a-real-token-at-all");
    await expect(page.getByText(/no longer valid/)).toBeVisible();
  });

  test("pending, confirmed, and declined states each show the right text, never internal fields", async ({ page }) => {
    const adminId = (await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } })).id;

    const pending = await createRescheduleRequest(validInput());
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    createdIds.push(pending.id);
    await page.goto(`/reschedule/status/${pending.statusToken}`);
    await expect(page.getByText(/not approved yet/i)).toBeVisible();

    const confirmed = await createRescheduleRequest(validInput());
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    createdIds.push(confirmed.id);
    await markMatchedInTcs(confirmed.id, adminId);
    await approveRequest(confirmed.id, adminId);
    await setConfirmedResult(
      confirmed.id,
      {
        confirmedDate: "2026-12-22",
        confirmedWindow: "10:30 AM-1:30 PM",
        confirmedOriginalOutcome: "Cancelled",
        confirmedRecurrenceText: "Every 2 weeks",
        confirmedFeeNotice: "No fee applies",
      },
      adminId
    );
    await page.goto(`/reschedule/status/${confirmed.statusToken}`);
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
    await expect(page.getByText("Every 2 weeks")).toBeVisible();
    await expect(page.getByText("No fee applies")).not.toBeVisible();

    const declined = await createRescheduleRequest(validInput());
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    createdIds.push(declined.id);
    await markCustomerInformed(declined.id, adminId);
    await declineRequest(declined.id, "We can't accommodate this change", adminId);
    await page.goto(`/reschedule/status/${declined.statusToken}`);
    await expect(page.getByText("Not approved")).toBeVisible();
    await expect(page.getByText("We can't accommodate this change")).toBeVisible();
  });

  test("the status page is noindex", async ({ page }) => {
    const created = await createRescheduleRequest(validInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.push(created.id);
    await page.goto(`/reschedule/status/${created.statusToken}`);
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  });
});
