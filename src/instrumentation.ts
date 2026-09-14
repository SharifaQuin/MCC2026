// Runs once when the persistent `next start` server process boots
// (requires experimental.instrumentationHook in next.config.mjs). Polls
// every 60s for Monday 8:05am business time and, when it hits, sends that
// week's approved Weekly Update to Slack. This is an in-process scheduler,
// not a real cron — the app has no separate job-runner infrastructure and
// no way to provision one from here — so `sendWeeklyUpdateNowAction` in
// src/app/actions/weeklyUpdate.ts exists as a manual fallback in case a
// server restart happens to land on exactly the wrong minute.
export async function register() {
  // `register()` also runs for the edge runtime in some Next.js versions;
  // this scheduler only makes sense (and only has the deps available) in
  // the Node.js runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Next.js dev mode can re-invoke register() on hot reload; guard against
  // starting a second interval in the same process.
  const globalForScheduler = globalThis as unknown as { __weeklyUpdateSchedulerStarted?: boolean };
  if (globalForScheduler.__weeklyUpdateSchedulerStarted) return;
  globalForScheduler.__weeklyUpdateSchedulerStarted = true;

  const { runWeeklyUpdateSchedulerTick } = await import("@/lib/weeklyUpdateScheduler");
  const { runHrDigestSchedulerTick } = await import("@/lib/hrDigestScheduler");

  setInterval(() => {
    runWeeklyUpdateSchedulerTick().catch((err) => {
      console.error("[weeklyUpdateScheduler] tick failed:", err);
    });
    runHrDigestSchedulerTick().catch((err) => {
      console.error("[hrDigestScheduler] tick failed:", err);
    });
  }, 60_000);
}
