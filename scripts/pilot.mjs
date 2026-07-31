#!/usr/bin/env node
/**
 * Agentic user pilot runner (UX-PILOT-1).
 *
 * Resolves the deployment to test, runs the Playwright journeys against it, and
 * classifies the outcome into the three verdicts the `ux-pilot` agent reports:
 *
 *   PILOT PASS         (exit 0)  — every journey rendered clean
 *   PILOT FAIL         (exit 1)  — the product is broken on the deployment
 *   PILOT INCONCLUSIVE (exit 78) — the pilot could not see the product at all
 *
 * The third verdict is the important one. A pilot that cannot reach the
 * deployment must never report PASS by absence of failures — that would hand
 * the founder exactly the false confidence this whole phase exists to remove.
 *
 * Usage:
 *   pnpm pilot --url https://<preview>.vercel.app
 *   pnpm pilot --pr 276            # needs GITHUB_TOKEN
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_INCONCLUSIVE = 78;

/**
 * Error signatures that mean "the pilot never got to see the product": DNS,
 * TLS, egress-policy denials, proxy refusals. Anything matching these is an
 * environment problem and must not be reported as a product failure.
 */
const UNREACHABLE_SIGNATURES = [
  /net::ERR_/i,
  /ERR_TUNNEL_CONNECTION_FAILED/i,
  /ERR_PROXY_CONNECTION_FAILED/i,
  /ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i,
  /CONNECT tunnel failed/i,
  /Timeout .* exceeded.*goto/i,
  /deployment may be unreachable or gated/i
];

function parseArgs(argv) {
  const args = { url: undefined, pr: undefined, passthrough: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") args.url = argv[++i];
    else if (arg === "--pr") args.pr = argv[++i];
    else args.passthrough.push(arg);
  }
  return args;
}

/**
 * Pulls the preview URL out of the Vercel bot's PR comment. This is a
 * convenience path only — it needs a GITHUB_TOKEN, which agent sessions
 * generally do not have (they reach GitHub through MCP instead). Those sessions
 * resolve the URL themselves and pass `--url`.
 */
async function resolvePreviewUrlFromPr(pr) {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      "--pr needs GITHUB_TOKEN (or GH_TOKEN) to read the Vercel bot comment.\n" +
        "If you are an agent with GitHub MCP access, resolve the preview URL " +
        "yourself and pass --url instead."
    );
  }

  const repo = process.env.PILOT_REPO ?? "denismartinb/GEO-Tool";
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} for PR ${pr} comments.`);
  }

  const comments = await response.json();
  const vercelComments = comments.filter((comment) =>
    comment.user?.login?.startsWith("vercel")
  );

  // Take the most recent bot comment: Vercel edits one comment in place, but on
  // a redeploy an older stale one can linger.
  for (const comment of vercelComments.reverse()) {
    const match = comment.body?.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    if (match) return match[0];
  }

  throw new Error(
    `No Vercel preview URL found on PR ${pr}. Is the deployment still building?`
  );
}

function readReport() {
  if (!existsSync(".pilot/report.json")) return undefined;
  try {
    return JSON.parse(readFileSync(".pilot/report.json", "utf8"));
  } catch {
    return undefined;
  }
}

function collectFailures(report) {
  const failures = [];
  const walk = (suites = []) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const testCase of spec.tests ?? []) {
          for (const result of testCase.results ?? []) {
            if (result.status === "passed" || result.status === "skipped") continue;
            failures.push({
              title: spec.title,
              project: testCase.projectName,
              message: result.error?.message ?? result.status
            });
          }
        }
      }
      walk(suite.suites);
    }
  };
  walk(report?.suites);
  return failures;
}

function classify(failures) {
  if (failures.length === 0) return "PILOT PASS";
  const allUnreachable = failures.every((failure) =>
    UNREACHABLE_SIGNATURES.some((pattern) => pattern.test(failure.message ?? ""))
  );
  return allUnreachable ? "PILOT INCONCLUSIVE" : "PILOT FAIL";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let baseUrl = args.url ?? process.env.PILOT_BASE_URL;
  if (!baseUrl && args.pr) baseUrl = await resolvePreviewUrlFromPr(args.pr);

  if (!baseUrl) {
    console.error("Missing target. Pass --url <deployment-url> or --pr <number>.");
    process.exit(EXIT_INCONCLUSIVE);
  }
  baseUrl = baseUrl.replace(/\/$/, "");

  const missing = ["PILOT_EMAIL", "PILOT_PASSWORD"].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(
      `Missing pilot credentials: ${missing.join(", ")}.\n` +
        "See docs/agentic-user-pilot.md. Never pass these on the command line."
    );
    process.exit(EXIT_INCONCLUSIVE);
  }

  // Start from a clean evidence directory so the agent can never read stale
  // screenshots from a previous run and report on the wrong deployment.
  rmSync(".pilot", { recursive: true, force: true });

  console.log(`▶ Pilot target: ${baseUrl}`);

  const run = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--config=playwright.config.ts", ...args.passthrough],
    {
      stdio: "inherit",
      env: { ...process.env, PILOT_BASE_URL: baseUrl }
    }
  );

  if (run.error) {
    console.error(`\n⚠ PILOT INCONCLUSIVE — could not start Playwright: ${run.error.message}`);
    process.exit(EXIT_INCONCLUSIVE);
  }

  const report = readReport();

  if (!report) {
    console.error(
      "\n⚠ PILOT INCONCLUSIVE — Playwright produced no report. " +
        "The run did not start; this says nothing about the product."
    );
    process.exit(EXIT_INCONCLUSIVE);
  }

  const failures = collectFailures(report);
  const verdict = classify(failures);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Verdict: ${verdict}`);
  console.log(`Target:  ${baseUrl}`);
  console.log(`Evidence: .pilot/screens/  |  Signals: .pilot/findings.jsonl`);

  if (failures.length > 0) {
    console.log(`\nFailures (${failures.length}):`);
    for (const failure of failures) {
      const firstLine = (failure.message ?? "").split("\n")[0];
      console.log(`  • [${failure.project}] ${failure.title}\n      ${firstLine}`);
    }
  }

  if (verdict === "PILOT INCONCLUSIVE") {
    console.log(
      "\nEvery failure was a reachability error, not a product error.\n" +
        "The deployment could not be opened from this environment — most often\n" +
        "an egress policy blocking the host, or Vercel deployment protection.\n" +
        "Re-run from an environment that can reach the preview. Do NOT report\n" +
        "this as a pass and do NOT hand it to the Human Gate as verified."
    );
    process.exit(EXIT_INCONCLUSIVE);
  }

  console.log(`${"─".repeat(60)}\n`);
  process.exit(verdict === "PILOT PASS" ? EXIT_PASS : EXIT_FAIL);
}

main().catch((error) => {
  console.error(`\n⚠ PILOT INCONCLUSIVE — ${error.message}`);
  process.exit(EXIT_INCONCLUSIVE);
});
