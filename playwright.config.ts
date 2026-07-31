import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the agentic user pilot (UX-PILOT-1).
 *
 * This config drives `tests/pilot/**` only. It is NOT a unit-test runner —
 * `pnpm test` (Vitest, `**\/*.test.ts`) and the pilot (`**\/*.spec.ts`) are
 * deliberately kept on non-overlapping filename patterns so neither runner
 * picks up the other's files.
 *
 * The base URL is always injected from outside (`PILOT_BASE_URL`), normally a
 * Vercel preview deployment resolved by `scripts/pilot.mjs`. There is no
 * default and no `webServer` block on purpose: the pilot's whole job is to
 * exercise the deployed artifact the founder would open, not a local dev
 * server that nobody is going to ship.
 */

/**
 * Sandboxed agent environments ship a prebuilt Chromium at a fixed path and
 * block Playwright's own browser download, so the bundled revision Playwright
 * expects is absent. A developer laptop has the opposite setup. Resolve the
 * pinned binary when it exists and otherwise let Playwright pick its own.
 */
function resolveChromiumPath(): string | undefined {
  const explicit = process.env.PILOT_CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsersRoot) {
    const pinned = `${browsersRoot}/chromium`;
    if (existsSync(pinned)) return pinned;
  }

  return undefined;
}

const executablePath = resolveChromiumPath();

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 }
] as const;

export default defineConfig({
  testDir: "./tests/pilot",
  testMatch: "**/*.spec.ts",
  outputDir: ".pilot/output",
  // The pilot reports findings; it does not gate CI. Never retry: a flake that
  // passes on attempt 2 is a finding the founder needs to hear about, not noise
  // to be swallowed.
  retries: 0,
  // Journeys hit a real deployment and a real database. Run them serially so a
  // failure is attributable and so we never hammer the preview.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: ".pilot/report.json" }]],
  use: {
    baseURL: process.env.PILOT_BASE_URL,
    // Screenshots are the pilot's primary evidence: the agent reads these PNGs
    // back with vision and judges them, so capture unconditionally.
    screenshot: "on",
    trace: "retain-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: executablePath ? { executablePath } : {},
    // Agent sandboxes route all egress through a policy proxy that Chromium
    // does not pick up from the environment on its own. Its CA is already in
    // the browser trust store, so this only tells Chromium where to go — TLS
    // verification stays on.
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {})
  },
  projects: [
    {
      name: "auth",
      testMatch: "**/support/auth.setup.ts",
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS[2] }
    },
    ...VIEWPORTS.map((viewport) => ({
      name: viewport.name,
      testMatch: "**/journeys/*.spec.ts",
      dependencies: ["auth"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: false,
        storageState: ".pilot/auth.json"
      }
    }))
  ]
});
