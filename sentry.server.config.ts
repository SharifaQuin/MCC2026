import * as Sentry from "@sentry/nextjs";

// Skips init entirely when unset, so local dev/CI never needs a Sentry
// account — errors just log to the console like they always have.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
