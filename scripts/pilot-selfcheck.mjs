#!/usr/bin/env node
/**
 * Self-check for the pilot harness (UX-PILOT-1).
 *
 * Runs the real pilot against a local fixture app twice:
 *   1. healthy fixture  → must exit 0   (PILOT PASS)
 *   2. broken fixture   → must exit 1   (PILOT FAIL, horizontal overflow)
 *
 * This proves the harness can both pass and fail. It says nothing about the
 * product — that is what a real run against a deployment is for. Its value is
 * that a harness which silently stopped working would otherwise report a
 * comfortable PASS forever.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const PORT = process.env.PILOT_FIXTURE_PORT ?? "4321";
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/login`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await delay(200);
  }
  return false;
}

async function runCase({ label, breakMode, expectedExit }) {
  const server = spawn("node", ["tests/pilot/fixtures/server.mjs"], {
    env: {
      ...process.env,
      PILOT_FIXTURE_PORT: PORT,
      PILOT_FIXTURE_BREAK: breakMode,
      // The fixture is local; the egress proxy must not swallow it.
      NO_PROXY: "127.0.0.1,localhost",
      HTTPS_PROXY: "",
      HTTP_PROXY: ""
    },
    stdio: "ignore"
  });

  try {
    if (!(await waitForServer())) {
      throw new Error("fixture server did not start");
    }

    const run = spawnSync("node", ["scripts/pilot.mjs", "--url", BASE_URL], {
      encoding: "utf8",
      env: {
        ...process.env,
        // Fixture accepts anything; never reuse the real pilot account here.
        PILOT_EMAIL: "selfcheck@example.invalid",
        PILOT_PASSWORD: "selfcheck-not-a-real-password",
        PILOT_PROJECT_ID: "",
        // Above the production cap on purpose: the fixture's safety decoys
        // (a dead control and a destructive-looking one) sit past the first
        // four explorable elements, and the whole point of the self-check is
        // to prove the detector and the refusal still fire.
        PILOT_MAX_INTERACTIONS: "8",
        NO_PROXY: "127.0.0.1,localhost",
        HTTPS_PROXY: "",
        HTTP_PROXY: ""
      }
    });

    const actualExit = run.status;
    const ok = actualExit === expectedExit;
    console.log(
      `${ok ? "✓" : "✗"} ${label}: expected exit ${expectedExit}, got ${actualExit}`
    );
    if (!ok) {
      console.log(run.stdout?.slice(-3000) ?? "");
      console.log(run.stderr?.slice(-2000) ?? "");
    }
    return ok;
  } finally {
    server.kill();
  }
}

/** Pixel height straight out of the PNG's IHDR chunk (bytes 20..24, big-endian). */
function pngHeight(path) {
  return readFileSync(path).readUInt32BE(20);
}

/**
 * Third case, and the reason the fixture wraps authenticated pages in a
 * viewport-pinned shell: prove the capture actually reaches below the fold.
 *
 * `fullPage: true` grows to `document.documentElement.scrollHeight`, which
 * never exceeds one viewport when the shell pins itself and scrolls an inner
 * element — so every dashboard screenshot was cropped at the fold while
 * looking exactly like a complete one. A harness that captures half a screen
 * reports a comfortable PASS over content nobody ever saw, which is the same
 * failure mode this whole self-check exists to prevent.
 *
 * Run against the findings of the healthy case, before the next run clears
 * `.pilot/`.
 */
function verifyCaptureDepth() {
  if (!existsSync(".pilot/findings.jsonl")) {
    console.log("✗ capture depth: no findings.jsonl — the healthy run wrote nothing");
    return false;
  }

  const findings = readFileSync(".pilot/findings.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  // Pages whose real content runs past the tallest viewport the pilot uses.
  const shellPages = findings.filter((f) => f.contentHeight > 1_024);

  if (shellPages.length === 0) {
    console.log(
      "✗ capture depth: no page reported content taller than a viewport — the fixture shell is not reproducing the real one"
    );
    return false;
  }

  for (const f of shellPages) {
    if (f.capturedHeight < f.contentHeight && !f.captureTruncated) {
      console.log(
        `✗ capture depth: ${f.label} @ ${f.viewport} captured ${f.capturedHeight}px of ${f.contentHeight}px without flagging truncation`
      );
      return false;
    }
    if (!existsSync(f.screenshot)) {
      console.log(`✗ capture depth: ${f.label} @ ${f.viewport} screenshot missing at ${f.screenshot}`);
      return false;
    }
    // The PNG itself is the evidence — the findings could claim anything.
    const height = pngHeight(f.screenshot);
    if (height < f.capturedHeight - 4) {
      console.log(
        `✗ capture depth: ${f.label} @ ${f.viewport} PNG is only ${height}px tall, expected ~${f.capturedHeight}px (content ${f.contentHeight}px)`
      );
      return false;
    }
  }

  console.log(
    `✓ capture depth: ${shellPages.length} shell page(s) captured to full content height (tallest ${Math.max(
      ...shellPages.map((f) => f.contentHeight)
    )}px)`
  );
  return true;
}

/**
 * Fourth case: prove the always-on, per-deploy run cannot reach the one
 * journey that spends money (UX-PILOT-3).
 *
 * The guard is structural — `journeys/scan/*.spec.ts` is matched only by the
 * `scan` Playwright project, which `PROJECT_SETS` includes only for an explicit
 * `--journeys scan` — but "structural" is a claim until something checks it.
 * This is a behavioural check on the default invocation, which is exactly what
 * every preview deploy runs. If a future refactor widens a testMatch or adds
 * `scan` to the read set, this fails.
 *
 * The self-check never sets `PILOT_SCAN_PROJECT_ID` either, so even reaching
 * the journey would refuse. The two locks are meant to hold independently;
 * this checks the outer one.
 */
function verifyDeployRunCannotScan() {
  if (!existsSync(".pilot/findings.jsonl")) {
    console.log("✗ scan lockout: no findings.jsonl to inspect");
    return false;
  }

  const findings = readFileSync(".pilot/findings.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const leaked = findings.filter(
    (f) => f.label?.startsWith("scan-") || f.viewport === "scan" || f.path?.includes("/scan")
  );

  if (leaked.length > 0) {
    console.log(
      `✗ scan lockout: the default read run reached ${leaked.length} scan journey page(s) — ` +
        `e.g. "${leaked[0].label}". The per-deploy pilot must never be able to spend money.`
    );
    return false;
  }

  console.log(`✓ scan lockout: default read run reached 0 scan journeys across ${findings.length} pages`);
  return true;
}

const results = [];
results.push(
  await runCase({ label: "healthy fixture → PILOT PASS", breakMode: "", expectedExit: 0 })
);
results.push(verifyCaptureDepth());
results.push(verifyDeployRunCannotScan());
results.push(
  await runCase({
    label: "overflowing fixture → PILOT FAIL",
    breakMode: "overflow",
    expectedExit: 1
  })
);

const allPassed = results.every(Boolean);
console.log(allPassed ? "\nPilot harness self-check PASSED" : "\nPilot harness self-check FAILED");
process.exit(allPassed ? 0 : 1);
