import * as Sentry from "@sentry/nextjs";

// Covers middleware.ts, which runs on the edge runtime.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
