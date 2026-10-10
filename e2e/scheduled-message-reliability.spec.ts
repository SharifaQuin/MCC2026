import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { runScheduledMessageSchedulerTick, processScheduledMessage } from "../src/lib/scheduledMessageScheduler";
import { maybeSendAfterHoursAutoReply } from "../src/lib/leadAutoReply";
import { setBusinessHours, DEFAULT_BUSINESS_HOURS } from "../src/lib/businessHours";
import type { MessageSenders } from "../src/lib/messageSenders";

// Reliability tests for the scheduled-send scheduler and the after-hours
// auto-reply: the edit/reschedule race around the claim step, and a
// provider (sendEmail/sendSms) throwing instead of returning { ok: false }.
// These talk to Prisma and the library functions directly — no browser
// needed — so this file never requests the `page` fixture. Runs against a
// real dev database; every row it creates is tagged with a unique run id
// and removed in afterAll.
const RUN_ID = Date.now().toString();
const prisma = new PrismaClient();

function throwingSenders(message = "simulated provider network error"): MessageSenders {
  return {
    sendEmail: async () => {
      throw new Error(message);
    },
    sendSms: async () => {
      throw new Error(message);
    },
  };
}

function failingSenders(error = "simulated provider failure"): MessageSenders {
  return {
    sendEmail: async () => ({ ok: false, error }),
    sendSms: async () => ({ ok: false, error }),
  };
}

async function createTestLead(suffix: string, overrides: Partial<{ phone: string; email: string; stage: "NEW_INQUIRY" | "WON" }> = {}) {
  return prisma.lead.create({
    data: {
      firstName: "SchedTest",
      lastName: suffix,
      email: overrides.email ?? `sched-reliability-${RUN_ID}-${suffix}@example.com`,
      phone: overrides.phone ?? "5555550000",
      source: "OTHER",
      stage: overrides.stage ?? "NEW_INQUIRY",
    },
  });
}

async function createDueScheduledMessage(leadId: string, overrides: Partial<{ sendAt: Date; body: string; status: "PENDING" | "SENDING" | "FAILED" }> = {}) {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  return prisma.scheduledMessage.create({
    data: {
      channel: "SMS",
      leadId,
      body: overrides.body ?? "original scheduled body",
      sendAt: overrides.sendAt ?? new Date(Date.now() - 60_000),
      status: overrides.status ?? "PENDING",
      createdById: admin.id,
    },
  });
}

test.describe.serial("scheduled message reliability", () => {
  const leadIds: string[] = [];

  test.afterAll(async () => {
    await prisma.leadCommunication.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.scheduledMessage.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await setBusinessHours(DEFAULT_BUSINESS_HOURS);
    await prisma.$disconnect();
  });

  test("edited into the future between fetch and claim is skipped, not sent stale", async () => {
    const lead = await createTestLead("race-reschedule");
    leadIds.push(lead.id);
    const now = new Date();
    const msg = await createDueScheduledMessage(lead.id, { sendAt: new Date(now.getTime() - 60_000) });

    // Simulate the tick's outer query having already read this id as due,
    // then — in the gap before the claim — a user edits it: pushes sendAt
    // into the future and changes the body. This is exactly what
    // updateScheduledMessageAction does, reproduced directly here so the
    // test doesn't need an authenticated browser session.
    const future = new Date(now.getTime() + 60 * 60_000);
    await prisma.scheduledMessage.update({
      where: { id: msg.id },
      data: { sendAt: future, body: "edited body — must not be sent" },
    });

    // Now run the per-message claim/send step for that same id, using the
    // *same* `now` the outer query would have used — proving the claim
    // re-checks sendAt itself rather than trusting the earlier read.
    const senders = failingSenders("should never be called");
    let sendersCalled = false;
    const spySenders: MessageSenders = {
      sendEmail: async (...args) => {
        sendersCalled = true;
        return senders.sendEmail(...args);
      },
      sendSms: async (...args) => {
        sendersCalled = true;
        return senders.sendSms(...args);
      },
    };
    await processScheduledMessage(msg.id, now, spySenders);

    const after = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(sendersCalled).toBe(false);
    expect(after.status).toBe("PENDING");
    expect(after.body).toBe("edited body — must not be sent");
    expect(after.sendAt.getTime()).toBe(future.getTime());

    const comms = await prisma.leadCommunication.count({ where: { leadId: lead.id } });
    expect(comms).toBe(0);
  });

  test("a provider throw is recorded as Failed, not left stuck on SENDING", async () => {
    const lead = await createTestLead("throw-single");
    leadIds.push(lead.id);
    const msg = await createDueScheduledMessage(lead.id, { body: "will throw" });

    await runScheduledMessageSchedulerTick(new Date(), throwingSenders("boom"));

    const after = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(after.status).toBe("FAILED");
    expect(after.errorMessage).toContain("boom");

    const comm = await prisma.leadCommunication.findFirst({ where: { leadId: lead.id } });
    expect(comm?.status).toBe("FAILED");
    expect(comm?.errorMessage).toContain("boom");
  });

  test("a throw on one message doesn't stop the rest of the batch", async () => {
    const leadA = await createTestLead("throw-batch-a");
    const leadB = await createTestLead("throw-batch-b");
    leadIds.push(leadA.id, leadB.id);
    const msgA = await createDueScheduledMessage(leadA.id, { body: "first, throws" });
    const msgB = await createDueScheduledMessage(leadB.id, { body: "second, should still be processed" });

    await runScheduledMessageSchedulerTick(new Date(), throwingSenders("batch boom"));

    const afterA = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msgA.id } });
    const afterB = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msgB.id } });
    expect(afterA.status).toBe("FAILED");
    expect(afterB.status).toBe("FAILED"); // same throwing senders, but the point is it was *attempted*
    expect(afterB.errorMessage).toContain("batch boom");
  });

  test("a stale SENDING row from a simulated crash is reconciled to Failed without resending", async () => {
    const lead = await createTestLead("stale-sending");
    leadIds.push(lead.id);
    const msg = await createDueScheduledMessage(lead.id, { status: "SENDING", body: "orphaned mid-send" });
    // Back-date updatedAt well past the staleness threshold, simulating a
    // process that crashed mid-send several minutes ago.
    await prisma.$executeRawUnsafe(
      `UPDATE "ScheduledMessage" SET "updatedAt" = $1 WHERE id = $2`,
      new Date(Date.now() - 10 * 60_000),
      msg.id
    );

    let sendersCalled = false;
    const spySenders: MessageSenders = {
      sendEmail: async () => {
        sendersCalled = true;
        return { ok: true };
      },
      sendSms: async () => {
        sendersCalled = true;
        return { ok: true };
      },
    };
    await runScheduledMessageSchedulerTick(new Date(), spySenders);

    const after = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(sendersCalled).toBe(false); // reconciliation never attempts a send
    expect(after.status).toBe("FAILED");
    expect(after.errorMessage).toContain("interrupted");

    // No LeadCommunication should exist — this message was never actually
    // sent, only reconciled away from a stuck state.
    const comms = await prisma.leadCommunication.count({ where: { leadId: lead.id } });
    expect(comms).toBe(0);
  });

  test("after-hours auto-reply logs a Failed lead-history entry when the provider throws", async () => {
    await setBusinessHours(DEFAULT_BUSINESS_HOURS);
    const lead = await createTestLead("autoreply-throw", { phone: "5555551234" });
    leadIds.push(lead.id);
    const wedNightPacificUtc = new Date("2026-10-08T05:00:00.000Z"); // 10pm PDT Wednesday night, after hours

    await maybeSendAfterHoursAutoReply(lead, wedNightPacificUtc, throwingSenders("autoreply boom"));

    const leadAfter = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadAfter.autoReplySentAt).not.toBeNull();

    const comm = await prisma.leadCommunication.findFirst({ where: { leadId: lead.id } });
    expect(comm?.status).toBe("FAILED");
    expect(comm?.errorMessage).toContain("autoreply boom");

    // Calling it again must still never repeat, throw or not.
    await maybeSendAfterHoursAutoReply(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }), wedNightPacificUtc, throwingSenders("autoreply boom"));
    const commCountAfterSecondCall = await prisma.leadCommunication.count({ where: { leadId: lead.id } });
    expect(commCountAfterSecondCall).toBe(1);
  });
});
