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
    // Vercel Deployment Protection puts an SSO wall in front of preview
    // deployments. When a bypass token is configured, this header lets the
    // pilot through without disabling protection for human visitors.
    ...(process.env.PILOT_VERCEL_BYPASS
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": process.env.PILOT_VERCEL_BYPASS,
            "x-vercel-set-bypass-cookie": "true"
          }
        }
      : {}),
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
    })),
    {
      // UX-PILOT-2a. Deliberately excluded from every automatic invocation:
      // scripts/pilot.mjs only adds this project to the run when explicitly
      // asked for `--journeys write` (see PROJECT_SETS there). The always-on
      // per-deploy workflow never passes that flag, so this project simply
      // does not exist as far as that workflow is concerned. A single
      // viewport is enough — this journey verifies behaviour, not layout.
      name: "scan",
      testMatch: "**/journeys/scan/*.spec.ts",
      dependencies: ["auth"],
      // UX-PILOT-3. The only journey in the harness that spends money, so it
      // gets the same treatment as `write`: `scripts/pilot.mjs` includes this
      // project only for an explicit `--journeys scan`, and the always-on
      // per-deploy workflow never passes that. Being its own project — rather
      // than a file the read set could pick up — is what makes "the deploy
      // pilot cannot scan" a fact about the code instead of a promise.
      // The authorization guard in tests/pilot/support/scan-authorization.ts
      // refuses independently of any of this.
      //
      // A full-project scan runs every active prompt across every active
      // engine, and the journey waits for two of them in sequence.
      timeout: 900_000,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: VIEWPORTS[2].width, height: VIEWPORTS[2].height },
        isMobile: false,
        storageState: ".pilot/auth.json"
      }
    },
    {
      name: "write",
      testMatch: "**/journeys/write/*.spec.ts",
      dependencies: ["auth"],
      // Longer than the global 60s: the scan this journey triggers runs
      // synchronously server-side, bounded by Vercel's own maxDuration=60,
      // plus UI round-trip time on top of that.
      timeout: 90_000,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: VIEWPORTS[2].width, height: VIEWPORTS[2].height },
        isMobile: false,
        storageState: ".pilot/auth.json"
      }
    },
    {
      // AUDIT-REPRO-1 (Fase 0). Su propio proyecto, no un fichero dentro de
      // `write` — mismo argumento que `scan` frente a `write`: el flag que lo
      // alcanza (`--journeys actions`) tiene que ser una cosa del código, no
      // de convención, y `PROJECT_SETS` en `scripts/pilot.mjs` sólo lo añade
      // cuando alguien lo pide explícitamente. El siempre-activo nunca lo
      // toca. Reutiliza el proyecto de escritura como objetivo (mismo
      // `storageState`, mismo dominio reservado) — el aislamiento es de
      // ejecución, no de destino.
      name: "actions",
      testMatch: "**/journeys/actions/*.spec.ts",
      dependencies: ["auth"],
      timeout: 90_000,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: VIEWPORTS[2].width, height: VIEWPORTS[2].height },
        isMobile: false,
        storageState: ".pilot/auth.json"
      }
    }
  ]
});
