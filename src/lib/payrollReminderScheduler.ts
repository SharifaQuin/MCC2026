// Checked every 60s by the interval set up in src/instrumentation.ts.
// Unlike the interview reminder scheduler (each applicant has one fixed
// target time), an unsigned payroll entry should nag repeatedly until it's
// dealt with — so this fires once REMINDER_INTERVAL after the entry was
// opened for review, then every REMINDER_INTERVAL again as long as it's
// still PENDING, using the persisted signatureReminderSentAt column so the
// cadence survives a server restart.
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

export async function runPayrollReminderSchedulerTick(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_MS);

  const candidates = await prisma.payrollEntry.findMany({
    where: {
      status: "PENDING",
      OR: [{ signatureReminderSentAt: null, createdAt: { lte: cutoff } }, { signatureReminderSentAt: { lte: cutoff } }],
    },
    include: {
      employee: { select: { name: true, email: true, active: true, isTestAccount: true } },
      payPeriod: { select: { label: true, startDate: true, endDate: true } },
    },
  });

  for (const entry of candidates) {
    if (!entry.employee.active || entry.employee.isTestAccount) continue;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const subject = `Action needed: review & sign your hours — ${entry.payPeriod.label}`;
    const body =
      `Hi ${entry.employee.name},\n\n` +
      `Your hours for the pay period "${entry.payPeriod.label}" ` +
      `(${entry.payPeriod.startDate.toLocaleDateString()} – ${entry.payPeriod.endDate.toLocaleDateString()}) ` +
      `are ready for you to review.\n\n` +
      `Please log in and approve & sign your hours, or flag a question if something looks off: ${appUrl}/payroll\n\n` +
      `— Mama's Cleaning Crew`;

    const result = await sendEmail({ to: entry.employee.email, subject, body });
    if (!result.ok) {
      console.error(`[payrollReminderScheduler] failed to email ${entry.employee.email}:`, result.error);
    }

    await prisma.payrollEntry.update({
      where: { id: entry.id },
      data: { signatureReminderSentAt: new Date() },
    });
  }
}
