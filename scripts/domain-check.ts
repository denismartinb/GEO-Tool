/**
 * DOMAIN-CHECK-BATCH-1 — answer a LinkedIn "leave your domain in the comments"
 * post in bulk, with real checks.
 *
 * Runs the SAME check as the public free checker (`runPublicCheck`, with the
 * same deps as app/api/gratis/comprobar/route.ts: ChatGPT answers, Gemini
 * reads the site and derives the question) for a list of domains, and prints
 * a ready-to-paste public reply per domain. Every sentence in a reply comes
 * from that domain's real outcome; nothing is templated beyond the wording.
 *
 * Why a script and not the public page: the page allows 3 checks per IP per
 * day (lib/free-checker/rate-limit.ts), so the founder could answer three
 * comments a day by hand. This runs locally with the founder's own keys, never
 * writes `public_checks` and never touches the database, so it neither counts
 * against nor reads anyone's limits.
 *
 * Usage (needs GEMINI_API_KEY and OPENAI_API_KEY in .env.local):
 *   pnpm check:domains --domains acme.es,otra.com
 *   pnpm check:domains --file dominios.txt      (one per line)
 *
 * Output: printed, and saved to docs/studies/domain-checks/<date>.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PublicCheckOutcome } from "../lib/free-checker/run-check";

const CHECKER_URL = "https://www.genscore.es/gratis/aparece-mi-marca-en-chatgpt";

/* ---- Pure helpers (covered by domain-check.test.ts, no network) ---- */

/** Same normalization the public route applies: no scheme, no www, no path. */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0];
}

export function parseDomains(input: string): string[] {
  const seen = new Set<string>();
  for (const piece of input.split(/[\n,;]+/)) {
    const domain = normalizeDomain(piece);
    if (domain && domain.includes(".")) seen.add(domain);
  }
  return [...seen];
}

/**
 * The public reply. Rules it keeps (all from the free checker's own history,
 * docs/brand/design-decisions-log.md): never a position (with no tracked set
 * the brand's rank is structural, not measured); other names are "marcas que
 * nombró", never "competidores" (the list mixes in non-competitors); and it
 * always says it is one question on one engine, because that is all it is.
 */
export function formatCommentReply(domain: string, outcome: PublicCheckOutcome): string {
  if (outcome.status !== "completed") {
    return `${domain}: no he podido completar la comprobación (${outcome.error}). Puedes probarla tú aquí: ${CHECKER_URL}`;
  }
  const others = outcome.otherBrands.slice(0, 4);
  const othersText = others.length ? ` En esa respuesta aparecieron: ${others.join(", ")}.` : "";
  const verdict = outcome.brandMentioned
    ? `y sí nombra a ${outcome.brand}.${othersText}`
    : `y no nombra a ${outcome.brand}.${others.length ? ` Sí nombró a ${others.join(", ")} (alguna puede no ser competencia directa).` : ""}`;
  return [
    `${domain}: le he preguntado a ChatGPT «${outcome.prompt}» ${verdict}`,
    `Es una sola pregunta en un motor y la IA varía entre respuestas, así que tómalo como una primera foto. Puedes repetirlo aquí: ${CHECKER_URL}`
  ].join(" ");
}

export function parseArgs(argv: string[]): { domains: string[] } {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const inline = value("--domains");
  const file = value("--file");
  const raw = [inline ?? "", file ? readFileSync(file, "utf8") : ""].join("\n");
  const domains = parseDomains(raw);
  if (domains.length === 0) throw new Error("Pass --domains a.com,b.es or --file dominios.txt");
  if (domains.length > 50) throw new Error("At most 50 domains per run.");
  return { domains };
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

/** Mirrors INVOCATION_BUDGET_MS in the public route, so results match what a visitor would get. */
const PER_CHECK_BUDGET_MS = 52_000;

async function main() {
  const { domains } = parseArgs(process.argv.slice(2));
  loadDotEnvLocal();
  const missing = ["GEMINI_API_KEY", "OPENAI_API_KEY"].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} (put them in .env.local).`);

  // Same deps as app/api/gratis/comprobar/route.ts — kept identical on purpose.
  const { runPublicCheck } = await import("../lib/free-checker/run-check");
  const { resolveBusinessContext } = await import("../lib/projects/business-profile");
  const { suggestPrompts } = await import("../lib/projects/prompt-suggestions-llm");
  const { generateOpenAIVisibilityAnswer, extractOpenAIStructuredData } = await import("../lib/llm/openai");
  const { extractGeminiStructuredData } = await import("../lib/llm/gemini");
  const { verifyExtractedMentions } = await import("../lib/scan/extraction");

  const replies: string[] = [];
  for (const domain of domains) {
    const outcome = await runPublicCheck(
      domain,
      {
        resolveBusinessContext,
        suggestPrompts,
        generateAnswer: generateOpenAIVisibilityAnswer,
        extract: extractOpenAIStructuredData,
        extractFallback: extractGeminiStructuredData,
        verify: (data, rawResponseText, brand) =>
          verifyExtractedMentions(data as never, rawResponseText, brand) as never
      },
      { deadlineAt: Date.now() + PER_CHECK_BUDGET_MS }
    );
    const reply = formatCommentReply(domain, outcome);
    replies.push(reply);
    console.log(`\n${reply}`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.join("docs", "studies", "domain-checks");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${date}.md`);
  writeFileSync(outFile, `# Respuestas a comentarios · ${date}\n\n${replies.join("\n\n")}\n`, { flag: "a" });
  console.log(`\n[check] Guardado en ${outFile}`);
}

if (process.argv[1] && /domain-check\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(`[check] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
