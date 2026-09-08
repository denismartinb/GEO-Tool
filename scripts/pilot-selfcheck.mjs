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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { checkActionsLockout, checkCaptureDepth, checkScanLockout, pngHeightFrom } from "./pilot-selfcheck-checks.mjs";

const PORT = process.env.PILOT_FIXTURE_PORT ?? "4321";
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Cada caso se archiva aquí en cuanto termina.
 *
 * Dos motivos, los dos observados: `pilot.mjs` borra `.pilot/` al arrancar, así
 * que al acabar la tanda sólo sobrevive el ÚLTIMO caso — y el que interesa
 * mirar cuando algo falla es casi siempre el sano, el primero. Y el directorio
 * empieza por punto: `actions/upload-artifact` ignora los ocultos salvo que se
 * le diga lo contrario, de modo que la pasada del 2026-08-09 subió un artefacto
 * vacío («No files were found with the provided path: .pilot/») justo cuando
 * hacía falta para diagnosticarla. Una evidencia que sólo existe cuando no se
 * necesita no es evidencia.
 */
const ARCHIVE_DIR = "pilot-selfcheck-output";

function archiveCase(label) {
  if (!existsSync(".pilot")) return;
  const slug = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  cpSync(".pilot", `${ARCHIVE_DIR}/${slug}`, { recursive: true });
}

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
    // Antes de que el siguiente caso borre `.pilot/`, y pase lo que pase con
    // este: el caso que hay que mirar es justamente el que ha fallado.
    archiveCase(label);
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

/** Same argument as verifyDeployRunCannotScan, for the journey that dismisses
 *  a real recommendation with no undo (AUDIT-REPRO-1, Fase 0). */
function verifyDeployRunCannotDismissRecommendations() {
  const findings = readHealthyFindings();
  if (!findings) return report("actions lockout", { ok: false, message: "no findings.jsonl to inspect" });
  return report("actions lockout", checkActionsLockout(findings));
}

rmSync(ARCHIVE_DIR, { recursive: true, force: true });

const results = [];
results.push(
  await runCase({ label: "healthy fixture → PILOT PASS", breakMode: "", expectedExit: 0 })
);
results.push(verifyCaptureDepth());
results.push(verifyDeployRunCannotScan());
results.push(verifyDeployRunCannotDismissRecommendations());
results.push(
  await runCase({
    label: "overflowing fixture → PILOT FAIL",
    breakMode: "overflow",
    expectedExit: 1
  })
);
// The regression this exists for is not hypothetical: on 2026-08-02 the pilot
// reported PILOT PASS, with ✅ on all three viewports, for a PR that redesigned
// the whole web-audit screen — because the pilot account had no data and every
// capture showed an empty state. Nothing was broken, so nothing failed. This
// case pins that hole shut: screens that load perfectly and show placeholders
// must FAIL, not pass.
results.push(
  await runCase({
    label: "empty-state fixture (loads clean, shows placeholders) → PILOT FAIL",
    breakMode: "empty",
    expectedExit: 1
  })
);
// Pins the 2026-08-03 finding shut: on every real dashboard screen, the
// element that actually scrolls and clips is `.dash-content`
// (`.shell { height: 100vh; overflow: hidden }` above it), never
// `document.documentElement` — so a wide element placed INSIDE `.dash-content`
// (this fixture mode reproduces that exact CSS chain, see server.mjs) must
// still flip the run to FAIL. Before the SHELL_CLIPPING_CLASSES fix in
// journey.ts, this case passed clean: document.documentElement.scrollWidth
// never saw it, because `.dash-content`'s own overflow-y:auto clips and
// scrolls it independently. Revert that fix and this case is the one that
// goes red.
results.push(
  await runCase({
    label: "shell-clip fixture (overflow trapped inside .dash-content) → PILOT FAIL",
    breakMode: "shell-clip",
    expectedExit: 1
  })
);
// Los dos fallos que el fundador encontró a ojo el 2026-08-11, DESPUÉS de que
// el piloto pasara (log §55): un CTA duplicado en el hero y un CTA gris sobre
// azul en el cajón móvil. Ninguno rompía nada, así que nada falló — la captura
// del primero existe y lo enseña. Estos dos casos son lo que impide que la
// próxima vez vuelva a depender de que alguien mire la foto.
results.push(
  await runCase({
    label: "duplicated-CTA fixture (same control twice in one section) → PILOT FAIL",
    breakMode: "duplicate",
    expectedExit: 1
  })
);
results.push(
  await runCase({
    label: "low-contrast fixture (grey CTA text on blue) → PILOT FAIL",
    breakMode: "contrast",
    expectedExit: 1
  })
);

const allPassed = results.every(Boolean);
console.log(allPassed ? "\nPilot harness self-check PASSED" : "\nPilot harness self-check FAILED");
process.exit(allPassed ? 0 : 1);
