import * as Sentry from "@sentry/nextjs";

// The DSN is meant to be public (it's where to send events, not a secret
// like an API key), which is why it's NEXT_PUBLIC_ — the browser bundle
// needs it to report client-side errors.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
