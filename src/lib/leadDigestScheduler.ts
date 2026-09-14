// Checked every 60s by the interval set up in src/instrumentation.ts. Fires
// three times a day (any day — leads can come in any day of the week,
// unlike the Monday-only HR/Weekly Update checks) so an uncontacted or
// overdue lead doesn't sit unnoticed until someone happens to open the
// Sales dashboard. Best-effort: never blocks or throws (postSlackDMToOwner
// already swallows its own failures) and says nothing when there's nothing
// to report.
import { businessTimeParts } from "@/lib/timezone";
import { postSlackDMToOwner } from "@/lib/slack";
import { loadLeadKpis, buildLeadDigestMessage } from "@/lib/leads";

const FIRE_HOURS = [9, 13, 17];

let lastFiredKey: string | null = null;

export async function runLeadDigestSchedulerTick(now: Date = new Date()): Promise<void> {
  const { year, month, day, hour, minute } = businessTimeParts(now);
  if (!FIRE_HOURS.includes(hour) || minute !== 30) return;

  const fireKey = `${year}-${month}-${day}-${hour}`;
  if (lastFiredKey === fireKey) return;
  lastFiredKey = fireKey;

  const { needsAttention } = await loadLeadKpis();
  if (needsAttention.length === 0) return;

  await postSlackDMToOwner(buildLeadDigestMessage(needsAttention));
}
