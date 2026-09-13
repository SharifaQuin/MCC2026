// The actual Monday-8:05am check, called every 60s by the interval set up
// in src/instrumentation.ts. Split out from instrumentation.ts so the
// Prisma/Slack imports only load in the Node.js runtime path.
import { prisma } from "@/lib/prisma";
import { businessTimeParts } from "@/lib/timezone";
import { postToSlackTeamChannel, postSlackDMToOwner } from "@/lib/slack";

// In-process guard so a tick landing twice in the same minute (or the
// interval drifting slightly) can't fire the send twice from this process.
// A restart exactly at 8:05 is still safe: the status check below means a
// second attempt only re-sends if the first one never got marked SENT.
let lastFiredDateKey: string | null = null;

export async function runWeeklyUpdateSchedulerTick(now: Date = new Date()): Promise<void> {
  const { year, month, day, weekday, hour, minute } = businessTimeParts(now);
  if (weekday !== 1 || hour !== 8 || minute !== 5) return;

  const dateKey = `${year}-${month}-${day}`;
  if (lastFiredDateKey === dateKey) return;
  lastFiredDateKey = dateKey;

  const weekOf = new Date(Date.UTC(year, month - 1, day));
  const update = await prisma.weeklyUpdate.findUnique({ where: { weekOf } });

  if (!update) {
    await postSlackDMToOwner(
      `:warning: No Monday Team Update was drafted for this week (${dateKey}) — nothing was sent to the team channel.`
    );
    return;
  }

  if (update.status !== "APPROVED") {
    await postSlackDMToOwner(
      `:warning: This week's Monday Team Update is still "${update.status}" (not approved) — it was NOT sent to the team channel. Approve it and use Send Now on the Management page.`
    );
    return;
  }

  try {
    await postToSlackTeamChannel(update.formattedMessage);
    await prisma.weeklyUpdate.update({
      where: { id: update.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch (err) {
    await prisma.weeklyUpdate.update({ where: { id: update.id }, data: { status: "FAILED" } });
    await postSlackDMToOwner(
      `:x: Failed to send this week's Monday Team Update automatically: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
