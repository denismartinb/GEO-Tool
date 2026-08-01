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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Loads `.env.local` (matching the convention every other script in this repo
 * follows — see docs/environment-contract.md) into process.env, without
 * overwriting variables the caller already set. This is a standalone script,
 * not a Next.js process, so nothing loads it automatically otherwise.
 *
 * Deliberately minimal: KEY=VALUE per line, no export keyword, no expansion,
 * no multiline values — matches the flat shape already used in .env.example.
 */
function loadDotEnvLocal(path = ".env.local") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

loadDotEnvLocal();

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
  const args = { url: undefined, pr: undefined, summaryMd: undefined, passthrough: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") args.url = argv[++i];
    else if (arg === "--pr") args.pr = argv[++i];
    else if (arg === "--summary-md") args.summaryMd = argv[++i];
    else args.passthrough.push(arg);
  }
  return args;
}

const VIEWPORT_ORDER = ["mobile", "tablet", "desktop"];

function readFindings() {
  if (!existsSync(".pilot/findings.jsonl")) return [];
  return readFileSync(".pilot/findings.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
}

function cellFor(finding) {
  if (!finding) return "⚠️ no ejecutado";
  const problems = [];
  if (finding.bouncedToLogin) problems.push("sesión rechazada");
  if (finding.horizontalOverflow) {
    problems.push(`overflow ${finding.scrollWidth}px > ${finding.viewportWidth}px`);
  }
  if (finding.failedRequests?.length) problems.push(`${finding.failedRequests.length} req ≥400`);
  if (finding.consoleErrors?.length) problems.push(`${finding.consoleErrors.length} err consola`);
  return problems.length === 0 ? "✅" : `❌ ${problems.join(", ")}`;
}

/**
 * Renders the PR comment body. Built here rather than in the workflow so the
 * formatting stays testable, stays in one language, and is identical whether the
 * pilot ran in CI or on a laptop.
 */
function writeSummaryMarkdown(path, { verdict, baseUrl, sha, failures }) {
  const findings = readFindings();
  const labels = [...new Set(findings.map((finding) => finding.label))];

  const byKey = new Map(
    findings.map((finding) => [`${finding.viewport}::${finding.label}`, finding])
  );

  const header =
    `<!-- agentic:ux-pilot-result -->\n` +
    `## Agentic User Pilot — ${verdict}\n\n` +
    `**Deployment:** ${baseUrl}${sha ? ` (commit \`${sha.slice(0, 7)}\`)` : ""}\n` +
    `**Ejecutado por:** ${process.env.GITHUB_ACTIONS === "true" ? "GitHub Actions" : "sesión local"}\n\n`;

  let table = "";
  if (labels.length > 0) {
    table =
      `| Pantalla | Mobile 375 | Tablet 768 | Desktop 1280 |\n|---|---|---|---|\n` +
      labels
        .map((label) => {
          const cells = VIEWPORT_ORDER.map((viewport) => cellFor(byKey.get(`${viewport}::${label}`)));
          return `| ${label} | ${cells.join(" | ")} |`;
        })
        .join("\n") +
      "\n\n";
  } else {
    table = "_El piloto no llegó a cargar ninguna pantalla._\n\n";
  }

  let failureBlock = "";
  if (failures.length > 0) {
    failureBlock =
      `**Fallos (${failures.length}):**\n\n` +
      failures
        .map((failure) => {
          const firstLine = (failure.message ?? "").split("\n")[0];
          return `- \`[${failure.project}]\` ${failure.title}\n  - ${firstLine}`;
        })
        .join("\n") +
      "\n\n";
  }

  const guidance =
    verdict === "PILOT PASS"
      ? "Todas las pantallas cargaron limpias. **Esto no sustituye el juicio visual**: " +
        "descarga el artefacto `pilot-screenshots` y mira las capturas antes de dar por " +
        "verificado que se ve lo que el PR prometía.\n"
      : verdict === "PILOT INCONCLUSIVE"
        ? "El piloto no llegó a ver el producto. Esto **no** es un pase y no despeja el " +
          "Human Gate. Causas habituales: credenciales del piloto ausentes o inválidas, " +
          "cuenta sin proyectos sembrados, o el preview inaccesible.\n"
        : "Hay algo roto en el deployment. Revisa la tabla y las capturas del artefacto " +
          "`pilot-screenshots` antes de tocar código.\n";

  const footer =
    `\n**Evidencia:** artefacto \`pilot-screenshots\` de este run ` +
    `(capturas a 375/768/1280 + \`findings.jsonl\`).\n\n` +
    `---\n_Generated by [Claude Code](https://claude.ai/code)_\n`;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, header + table + failureBlock + guidance + footer);
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
  const sha = process.env.PILOT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "";

  let baseUrl = args.url ?? process.env.PILOT_BASE_URL;
  if (!baseUrl && args.pr) baseUrl = await resolvePreviewUrlFromPr(args.pr);

  // Start from a clean evidence directory so neither the agent nor the PR
  // comment can ever be built from a previous run's screenshots.
  rmSync(".pilot", { recursive: true, force: true });

  /** Writes the summary (when asked for) and exits with the verdict's code. */
  const bail = (verdict, consoleMessage) => {
    console.error(consoleMessage);
    if (args.summaryMd) {
      writeSummaryMarkdown(args.summaryMd, {
        verdict,
        baseUrl: baseUrl ?? "(sin resolver)",
        sha,
        failures: [{ project: "setup", title: "Arranque del piloto", message: consoleMessage }]
      });
    }
    process.exit(verdict === "PILOT FAIL" ? EXIT_FAIL : EXIT_INCONCLUSIVE);
  };

  if (!baseUrl) {
    bail("PILOT INCONCLUSIVE", "Missing target. Pass --url <deployment-url> or --pr <number>.");
  }
  baseUrl = baseUrl.replace(/\/$/, "");

  const missing = ["PILOT_EMAIL", "PILOT_PASSWORD"].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    bail(
      "PILOT INCONCLUSIVE",
      `Missing pilot credentials: ${missing.join(", ")}. ` +
        "See docs/agentic-user-pilot.md. Never pass these on the command line."
    );
  }

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
    bail(
      "PILOT INCONCLUSIVE",
      `Could not start Playwright: ${run.error.message}`
    );
  }

  const report = readReport();

  if (!report) {
    bail(
      "PILOT INCONCLUSIVE",
      "Playwright produced no report. The run did not start; this says nothing about the product."
    );
  }

  const failures = collectFailures(report);
  const verdict = classify(failures);

  if (args.summaryMd) {
    writeSummaryMarkdown(args.summaryMd, { verdict, baseUrl, sha, failures });
  }

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
