import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// This sandboxed dev container ships a pre-installed Chromium at a fixed
// path (see /root/.ccr/README.md) that can lag behind whatever browser
// build @playwright/test's own version expects. Use it directly when
// present; CI and other machines fall back to Playwright's own managed
// browser (installed via `npx playwright install`).
const sandboxChromium = "/opt/pw-browsers/chromium";
const executablePath = fs.existsSync(sandboxChromium) ? sandboxChromium : undefined;

// A smoke-test suite, not exhaustive coverage — it exists to catch a broken
// build/login/major-section-crash before it reaches production, not to
// verify every feature in the app. Run locally with `npm run test:e2e`
// (needs the app already built — `npm run build` first) or let CI's
// webServer boot `npm run start` itself.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
