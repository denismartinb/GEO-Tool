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
import { checkCaptureDepth, checkScanLockout, pngHeightFrom } from "./pilot-selfcheck-checks.mjs";

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

/**
 * Refuses to start if something is already listening on the fixture port.
 *
 * Without this, a stale fixture — a killed run's orphan, or a second
 * self-check running concurrently — keeps the port, the new server fails to
 * bind, `waitForServer` succeeds against the WRONG server, and the case
 * silently validates the wrong thing. Hit for real 2026-08-03: a concurrent
 * run left a healthy fixture up, so the "overflowing fixture must FAIL" case
 * tested a healthy one and reported `expected exit 1, got 0`. A self-check
 * that can test the wrong server is the exact failure mode it exists to catch.
 */
async function assertPortIsFree() {
  try {
    await fetch(`${BASE_URL}/login`);
  } catch {
    return; // nothing listening, which is what we want
  }
  throw new Error(
    `Something is already listening on ${BASE_URL}. Stop it first — otherwise this run ` +
      "would silently test that server instead of the fixture it just started. " +
      "(pkill -f 'fixtures/server.mjs', or set PILOT_FIXTURE_PORT.)"
  );
}

async function runCase({ label, breakMode, expectedExit }) {
  await assertPortIsFree();

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

/**
 * The two assertions live in `pilot-selfcheck-checks.mjs` as pure functions so
 * they can be unit-tested in both directions (see
 * `tests/pilot/support/selfcheck-checks.test.ts`). An assertion nobody has
 * watched fail is indistinguishable from one that cannot fail — and these two
 * exist precisely to stop a broken harness reporting a comfortable PASS.
 *
 * These wrappers only supply real I/O and print the result.
 */
function readHealthyFindings() {
  if (!existsSync(".pilot/findings.jsonl")) return null;
  return readFileSync(".pilot/findings.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function report(name, result) {
  console.log(`${result.ok ? "\u2713" : "\u2717"} ${name}: ${result.message}`);
  return result.ok;
}

/** Prove captures reach past the fold — run against the healthy case's
 *  findings, before the next case clears `.pilot/`. */
function verifyCaptureDepth() {
  const findings = readHealthyFindings();
  if (!findings) return report("capture depth", { ok: false, message: "no findings.jsonl — the healthy run wrote nothing" });
  return report(
    "capture depth",
    checkCaptureDepth(findings, {
      fileExists: existsSync,
      pngHeight: (path) => pngHeightFrom(readFileSync(path))
    })
  );
}

/** Prove the per-deploy run cannot reach the journey that spends money.
 *  The self-check never sets `PILOT_SCAN_PROJECT_ID` either, so even reaching
 *  it would refuse; the two locks are meant to hold independently and this
 *  checks the outer one. */
function verifyDeployRunCannotScan() {
  const findings = readHealthyFindings();
  if (!findings) return report("scan lockout", { ok: false, message: "no findings.jsonl to inspect" });
  return report("scan lockout", checkScanLockout(findings));
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
