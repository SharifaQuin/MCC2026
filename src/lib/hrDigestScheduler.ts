// The Monday 8:00am check, called every 60s by the interval set up in
// src/instrumentation.ts (five minutes ahead of the Weekly Update send, so
// the two don't compete). Unlike the Weekly Update, this has no draft/
// approval step — it's a best-effort proactive nudge, so it never blocks
// or throws (postSlackDMToOwner already swallows its own failures) and
// simply says nothing when there's nothing to report.
import { businessTimeParts } from "@/lib/timezone";
import { postSlackDMToOwner } from "@/lib/slack";
import { getHrTodayAttentionItems, buildHrDigestMessage } from "@/lib/hrToday";

let lastFiredDateKey: string | null = null;

export async function runHrDigestSchedulerTick(now: Date = new Date()): Promise<void> {
  const { year, month, day, weekday, hour, minute } = businessTimeParts(now);
  if (weekday !== 1 || hour !== 8 || minute !== 0) return;

  const dateKey = `${year}-${month}-${day}`;
  if (lastFiredDateKey === dateKey) return;
  lastFiredDateKey = dateKey;

  const items = await getHrTodayAttentionItems();
  if (items.length === 0) return;

  await postSlackDMToOwner(buildHrDigestMessage(items));
}
