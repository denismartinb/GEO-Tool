/**
 * SECTOR-STUDY-1 — «¿Qué marcas españolas de <sector> recomienda la IA?»
 *
 * One-off, founder-run study for marketing content (blog + LinkedIn). It asks
 * a fixed set of neutral buyer questions about one sector to the SAME three
 * engines a GenScore scan uses, with the SAME brand-blind generation prompt
 * (`generate*VisibilityAnswer`, docs/adr/0007) and the SAME extraction +
 * mention verification (`extract*StructuredData` + `verifyExtractedMentions`,
 * docs/adr/0021). So every number it prints is a GenScore measurement, not an
 * estimate — the whole point is that the content built on it invents nothing.
 *
 * What it does NOT do: touch Supabase, create projects, or run a scan. No
 * database client is imported (scripts/sector-study.test.ts asserts it), so it
 * cannot consume a customer's plan cap or show up in anyone's console.
 *
 * How brands are counted. Extraction needs a "brand" and a tracked list; here
 * there is no customer brand, so:
 *   - `seedBrands` go in as the tracked list → verified mention + position;
 *   - anything else the answer names comes back in `other_brands_mentioned`
 *     (capped at 5 per answer by the extraction prompt) → counted too, flagged
 *     `seed: false`, so a brand we did not think of still appears in the table.
 * The seed list is a list of candidates to look for, not a claim about who
 * leads: a seed brand the engines never name ends the study at 0%.
 *
 * Usage (needs GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY in
 * .env.local — the same keys the app uses):
 *   pnpm study:sector --sector facturacion-pymes --samples 2
 *   pnpm study:sector --list
 *
 * The same study runs from the operator console at /admin/estudio with the
 * production keys (lib/studies/*), for when the keys are not local.
 *
 * Output: docs/studies/<sector>/<date>/{results.json,report.md}. The JSON
 * keeps every raw answer, so any figure in the report can be traced back to
 * the sentence that produced it.
 *
 * Why NODE_OPTIONS=--conditions=react-server: same reason as
 * scripts/extraction-bench.ts — lib/llm/** opens with `import "server-only"`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  aggregateBrands,
  DEFAULT_ENGINES,
  ENGINES,
  formatReport,
  SECTORS,
  type AnswerRecord,
  type Engine
} from "../lib/studies/sector-study";

// Re-exported so scripts/sector-study.test.ts keeps covering the pure half from one place.
export * from "../lib/studies/sector-study";

export function parseArgs(argv: string[]): {
  sector?: string;
  samples: number;
  list: boolean;
  concurrency: number;
  engines: Engine[];
} {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const samples = Number(value("--samples") ?? 2);
  const concurrency = Number(value("--concurrency") ?? 3);
  if (!Number.isInteger(samples) || samples < 1 || samples > 5) throw new Error("--samples must be an integer 1..5");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6) {
    throw new Error("--concurrency must be an integer 1..6");
  }
  const enginesArg = value("--engines");
  const engines = enginesArg ? (enginesArg.split(",").map((engine) => engine.trim()) as Engine[]) : [...DEFAULT_ENGINES];
  if (engines.length === 0 || engines.some((engine) => !ENGINES.includes(engine))) {
    throw new Error(`--engines must be a comma list of ${ENGINES.join(", ")}`);
  }
  return { sector: value("--sector"), samples, list: argv.includes("--list"), concurrency, engines: [...new Set(engines)] };
}

/* ---- I/O (not covered by unit tests — needs live credentials) ---- */

/** Same minimal, non-overwriting .env.local loader as scripts/extraction-bench.ts. */
function loadDotEnvLocal(file = ".env.local"): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const unquoted = raw.replace(/^(['"])(.*)\1$/, "$2");
    if (key && process.env[key] === undefined) process.env[key] = unquoted;
  }
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list || !args.sector) {
    console.log("Sectores disponibles:");
    for (const sector of SECTORS) console.log(`  ${sector.id}  —  ${sector.label} (${sector.prompts.length} preguntas)`);
    console.log("\nUso: pnpm study:sector --sector <id> [--samples 2] [--concurrency 3]");
    return;
  }
  const sector = SECTORS.find((candidate) => candidate.id === args.sector);
  if (!sector) throw new Error(`Unknown sector "${args.sector}". Run with --list.`);

  loadDotEnvLocal();
  const keyFor: Record<Engine, string> = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY", perplexity: "PERPLEXITY_API_KEY" };
  const missing = args.engines.map((engine) => keyFor[engine]).filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} (put them in .env.local).`);

  const tasks: Array<[Engine, number, number]> = [];
  for (let sample = 1; sample <= args.samples; sample += 1) {
    for (let promptIndex = 0; promptIndex < sector.prompts.length; promptIndex += 1) {
      for (const engine of args.engines) tasks.push([engine, promptIndex, sample]);
    }
  }
  console.log(`[study] ${sector.id}: ${tasks.length} respuestas (${args.concurrency} en paralelo)…`);

  const records: AnswerRecord[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: args.concurrency }, async () => {
      while (cursor < tasks.length) {
        const [engine, promptIndex, sample] = tasks[cursor++];
        const { runSectorAnswer } = await import("../lib/studies/run-sector-answer");
        const record = await runSectorAnswer({ sector, engine, promptIndex, sample });
        records.push(record);
        console.log(
          `[study] ${records.length}/${tasks.length} ${engine} p${promptIndex + 1} s${sample} ${record.error ?? "ok"}`
        );
      }
    })
  );

  records.sort((a, b) => a.sample - b.sample || a.promptIndex - b.promptIndex || a.engine.localeCompare(b.engine));
  const rows = aggregateBrands(records, sector.seedBrands);
  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.join("docs", "studies", sector.id, date);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "results.json"),
    `${JSON.stringify({ sector, samples: args.samples, date, rows, records }, null, 2)}\n`
  );
  const report = formatReport({ sector, records, rows, samples: args.samples, date, engines: args.engines });
  writeFileSync(path.join(outDir, "report.md"), report);
  console.log(`\n${report}\n[study] Guardado en ${outDir}/`);
}

if (process.argv[1] && /sector-study\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(`[study] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
