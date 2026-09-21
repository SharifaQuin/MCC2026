// Runs once when the persistent `next start` server process boots
// (requires experimental.instrumentationHook in next.config.mjs). Two
// separate jobs live in this one hook, since Next.js only calls register()
// once per runtime:
//   1. Load Sentry's server/edge config (no-ops if SENTRY_DSN isn't set).
//   2. Poll every 60s for Monday 8:05am business time and, when it hits,
//      send that week's approved Weekly Update to Slack — an in-process
//      scheduler, not a real cron, since the app has no separate job-runner
//      infrastructure. `sendWeeklyUpdateNowAction` in
//      src/app/actions/weeklyUpdate.ts is the manual fallback in case a
//      server restart happens to land on exactly the wrong minute.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  // The scheduler below only makes sense (and only has the deps available)
  // in the Node.js runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Next.js dev mode can re-invoke register() on hot reload; guard against
  // starting a second interval in the same process.
  const globalForScheduler = globalThis as unknown as { __weeklyUpdateSchedulerStarted?: boolean };
  if (globalForScheduler.__weeklyUpdateSchedulerStarted) return;
  globalForScheduler.__weeklyUpdateSchedulerStarted = true;

  const { runWeeklyUpdateSchedulerTick } = await import("@/lib/weeklyUpdateScheduler");
  const { runHrDigestSchedulerTick } = await import("@/lib/hrDigestScheduler");
  const { runLeadDigestSchedulerTick } = await import("@/lib/leadDigestScheduler");
  const { runInterviewReminderSchedulerTick } = await import("@/lib/interviewReminderScheduler");
  const { runPayrollReminderSchedulerTick } = await import("@/lib/payrollReminderScheduler");

  setInterval(() => {
    runWeeklyUpdateSchedulerTick().catch((err) => {
      console.error("[weeklyUpdateScheduler] tick failed:", err);
    });
    runHrDigestSchedulerTick().catch((err) => {
      console.error("[hrDigestScheduler] tick failed:", err);
    });
    runLeadDigestSchedulerTick().catch((err) => {
      console.error("[leadDigestScheduler] tick failed:", err);
    });
    runInterviewReminderSchedulerTick().catch((err) => {
      console.error("[interviewReminderScheduler] tick failed:", err);
    });
    runPayrollReminderSchedulerTick().catch((err) => {
      console.error("[payrollReminderScheduler] tick failed:", err);
    });
  }, 60_000);
}

// Reports uncaught errors from nested React Server Components (the cases
// Next.js's own error boundaries can't catch) to Sentry — a no-op when
// SENTRY_DSN isn't set, since Sentry.init() above never ran.
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
