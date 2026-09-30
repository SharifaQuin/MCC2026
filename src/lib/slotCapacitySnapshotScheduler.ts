// Checked every 60s by the interval in src/instrumentation.ts. Idempotent —
// snapshotPassedDates() only ever writes a date once (unique [month, date]),
// so ticking often just costs one cheap query most of the time.
import { snapshotPassedDates } from "@/lib/slotCapacitySummary";

export async function runSlotCapacitySnapshotSchedulerTick(): Promise<void> {
  await snapshotPassedDates();
}
