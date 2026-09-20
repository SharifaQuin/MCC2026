import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Lesson photos are stored as base64 data URIs (no separate file
    // storage backend), which inflates size ~33% over the compressed
    // JPEG — the default 1MB server action body limit is too tight.
    serverActions: {
      bodySizeLimit: "6mb",
    },
    // Runs src/instrumentation.ts once when the persistent `next start`
    // server process boots — used to schedule the Monday Team Update send,
    // and to load Sentry's server/edge config.
    instrumentationHook: true,
  },
};

// Wrapping is safe even without a Sentry account/DSN configured — it just
// skips the source-map upload step (which needs SENTRY_AUTH_TOKEN) and
// error reporting stays off until NEXT_PUBLIC_SENTRY_DSN is set.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
});
