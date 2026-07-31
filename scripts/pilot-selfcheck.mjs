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

const results = [];
results.push(
  await runCase({ label: "healthy fixture → PILOT PASS", breakMode: "", expectedExit: 0 })
);
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
