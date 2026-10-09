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
 * Output: docs/studies/<sector>/<date>/{results.json,report.md}. The JSON
 * keeps every raw answer, so any figure in the report can be traced back to
 * the sentence that produced it.
 *
 * Why NODE_OPTIONS=--conditions=react-server: same reason as
 * scripts/extraction-bench.ts — lib/llm/** opens with `import "server-only"`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/* ---- Sector definitions ---- */

export type SectorConfig = {
  id: string;
  /** Human label, used in the report title: «¿Qué marcas españolas de <label> recomienda la IA?» */
  label: string;
  country: string;
  language: string;
  /** Neutral buyer questions. Never name a brand here — that would bias the answer. */
  prompts: string[];
  /** Candidates to look for. Not a ranking, not a claim. */
  seedBrands: string[];
};

export const SECTORS: SectorConfig[] = [
  {
    id: "facturacion-pymes",
    label: "software de facturación y contabilidad para autónomos y pymes",
    country: "ES",
    language: "es",
    prompts: [
      "¿Cuál es el mejor programa de facturación para autónomos en España?",
      "¿Qué software de contabilidad me recomiendas para una pyme española?",
      "Necesito un programa para hacer facturas que cumpla con Verifactu, ¿cuál uso?",
      "¿Qué aplicación de facturación online es más fácil de usar para un autónomo que empieza?",
      "Comparativa de programas de contabilidad en la nube para pequeñas empresas en España",
      "¿Qué software de gestión empresarial (facturación, gastos e impuestos) usan las pymes en España?",
      "¿Qué programa de facturación gratuito o barato me recomiendas para autónomos?",
      "¿Con qué programa puedo llevar la contabilidad y presentar los modelos 303 y 130 yo mismo?",
      "Mejores alternativas a Excel para llevar la facturación de una pequeña empresa",
      "¿Qué software de facturación electrónica recomiendas para una empresa de servicios con 10 empleados?",
      "¿Qué herramienta de contabilidad usan las gestorías y asesorías en España?",
      "Busco un ERP sencillo para una pyme española que venda productos, ¿cuál me recomiendas?"
    ],
    seedBrands: [
      "Holded",
      "Quipu",
      "Sage",
      "Contasimple",
      "Anfix",
      "Billin",
      "FacturaDirecta",
      "Odoo",
      "Zoho",
      "a3 (Wolters Kluwer)",
      "ContaSol",
      "Declarando"
    ]
  },
  {
    id: "seguros-hogar",
    label: "seguros de hogar",
    country: "ES",
    language: "es",
    prompts: [
      "¿Cuál es el mejor seguro de hogar en España?",
      "¿Qué aseguradora de hogar me recomiendas para un piso de alquiler?",
      "Seguro de hogar barato y con buena atención al cliente, ¿cuál contrato?",
      "¿Qué compañía tiene el mejor seguro de hogar para una vivienda en propiedad con hipoteca?",
      "Comparativa de seguros de hogar en España: ¿cuáles son los más recomendados?",
      "¿Qué seguro de hogar cubre mejor los daños por agua?",
      "¿Qué aseguradora de hogar responde más rápido en caso de siniestro?",
      "Seguro de hogar online para jóvenes, ¿cuál me recomiendas?",
      "¿Merece la pena cambiar el seguro de hogar del banco? ¿A qué compañía?",
      "¿Qué seguro de hogar incluye asistencia de manitas o reparaciones?"
    ],
    seedBrands: [
      "Mapfre",
      "Línea Directa",
      "Mutua Madrileña",
      "AXA",
      "Allianz",
      "Generali",
      "Zurich",
      "Santalucía",
      "Ocaso",
      "Caser",
      "Verti",
      "Pelayo"
    ]
  }
];

export const ENGINES = ["gemini", "openai", "claude"] as const;
export type Engine = (typeof ENGINES)[number];

const ENGINE_LABEL: Record<Engine, string> = { gemini: "Gemini", openai: "ChatGPT", claude: "Claude" };

/** Never matches a real brand; extraction requires one. */
const STUDY_SENTINEL_BRAND = "Marca de control del estudio";

/* ---- Pure helpers (covered by sector-study.test.ts, no network) ---- */

export type AnswerRecord = {
  engine: Engine;
  promptIndex: number;
  sample: number;
  model: string | null;
  /** null when generation or extraction failed — counted as a failure, never as "no brands". */
  error: string | null;
  rawText: string | null;
  /** Seed brands with a verified mention, with their 1-based position in the answer. */
  seedMentions: Array<{ name: string; position: number | null }>;
  /** Non-seed brands the extractor surfaced (max 5 per answer). */
  otherBrands: string[];
};

export type BrandRow = {
  name: string;
  seed: boolean;
  /** Answers naming the brand / valid answers, over all engines. */
  mentions: number;
  rate: number;
  perEngine: Record<Engine, { mentions: number; valid: number }>;
  /** Times it was the first brand named (seed brands only — others have no position). */
  firstPlace: number;
  /** Distinct prompts in which it appeared at least once. */
  promptsCovered: number;
};

/**
 * Canonical key for counting: "Holded" / "holded" / "Holded." are the same
 * brand. Deliberately conservative — no fuzzy matching, so two genuinely
 * different names are never merged by accident; near-duplicates surface in
 * the table for a human to judge.
 */
export function brandKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function aggregateBrands(records: AnswerRecord[], seedBrands: string[]): BrandRow[] {
  const valid = records.filter((record) => record.error === null);
  const validPerEngine = Object.fromEntries(
    ENGINES.map((engine) => [engine, valid.filter((record) => record.engine === engine).length])
  ) as Record<Engine, number>;
  const seedKeys = new Set(seedBrands.map(brandKey));
  const rows = new Map<string, BrandRow & { prompts: Set<number> }>();

  const rowFor = (name: string, seed: boolean) => {
    const key = brandKey(name);
    let row = rows.get(key);
    if (!row) {
      row = {
        name,
        seed,
        mentions: 0,
        rate: 0,
        perEngine: Object.fromEntries(
          ENGINES.map((engine) => [engine, { mentions: 0, valid: validPerEngine[engine] }])
        ) as BrandRow["perEngine"],
        firstPlace: 0,
        promptsCovered: 0,
        prompts: new Set<number>()
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const seed of seedBrands) rowFor(seed, true);

  for (const record of valid) {
    // One answer counts once per brand, however many times it repeats the name.
    const seen = new Set<string>();
    for (const mention of record.seedMentions) {
      const key = brandKey(mention.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const row = rowFor(mention.name, true);
      row.mentions += 1;
      row.perEngine[record.engine].mentions += 1;
      row.prompts.add(record.promptIndex);
      if (mention.position === 1) row.firstPlace += 1;
    }
    for (const other of record.otherBrands) {
      const key = brandKey(other);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const row = rowFor(other, seedKeys.has(key));
      row.mentions += 1;
      row.perEngine[record.engine].mentions += 1;
      row.prompts.add(record.promptIndex);
    }
  }

  return [...rows.values()]
    .map(({ prompts, ...row }) => ({
      ...row,
      rate: valid.length === 0 ? 0 : row.mentions / valid.length,
      promptsCovered: prompts.size
    }))
    .sort((a, b) => b.mentions - a.mentions || b.firstPlace - a.firstPlace || a.name.localeCompare(b.name, "es"));
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function formatReport(input: {
  sector: SectorConfig;
  records: AnswerRecord[];
  rows: BrandRow[];
  samples: number;
  date: string;
}): string {
  const { sector, records, rows, samples, date } = input;
  const valid = records.filter((record) => record.error === null);
  const failed = records.length - valid.length;
  const models = [...new Set(valid.map((record) => `${ENGINE_LABEL[record.engine]}: ${record.model ?? "?"}`))].sort();
  const answersWithoutBrands = valid.filter((r) => r.seedMentions.length === 0 && r.otherBrands.length === 0).length;
  const shown = rows.filter((row) => row.mentions > 0);
  const neverNamed = rows.filter((row) => row.seed && row.mentions === 0).map((row) => row.name);

  if (valid.length === 0) {
    const causes = [...new Set(records.map((record) => record.error))].join(", ");
    return `# Estudio sin datos: ${sector.label}\n\nNinguna de las ${records.length} respuestas fue válida (${causes}). No hay nada publicable; revisa las claves y vuelve a ejecutarlo.\n`;
  }
  const failureWarning =
    failed / records.length > 0.2
      ? [`> **Atención:** fallaron ${failed} de ${records.length} respuestas (más del 20%). Las cifras pueden estar sesgadas hacia los motores que sí respondieron; conviene repetir antes de publicar.`, ""]
      : [];

  const lines = [
    `# ¿Qué marcas españolas de ${sector.label} recomienda la IA?`,
    "",
    `Estudio GenScore · ${date} · ${sector.prompts.length} preguntas × ${ENGINES.length} motores × ${samples} muestra(s) = ${records.length} respuestas pedidas, **${valid.length} válidas**${failed ? ` (${failed} fallidas, excluidas del cálculo)` : ""}.`,
    "",
    `Modelos: ${models.join(" · ") || "—"}`,
    "",
    ...failureWarning,
    "## Ranking por presencia",
    "",
    "Presencia = porcentaje de respuestas válidas que nombran la marca (cada respuesta cuenta una vez por marca).",
    "",
    `| # | Marca | Presencia | ${ENGINES.map((engine) => ENGINE_LABEL[engine]).join(" | ")} | 1.ª nombrada | Preguntas (de ${sector.prompts.length}) |`,
    `|---|---|---|${ENGINES.map(() => "---").join("|")}|---|---|`,
    ...shown.map((row, index) => {
      const perEngine = ENGINES.map((engine) => {
        const cell = row.perEngine[engine];
        return cell.valid === 0 ? "—" : `${pct(cell.mentions / cell.valid)} (${cell.mentions}/${cell.valid})`;
      });
      const first = row.seed ? String(row.firstPlace) : "n/d";
      return `| ${index + 1} | ${row.name}${row.seed ? "" : " ·"} | ${pct(row.rate)} (${row.mentions}/${valid.length}) | ${perEngine.join(" | ")} | ${first} | ${row.promptsCovered} |`;
    }),
    "",
    "`·` = marca que no estaba en la lista inicial de candidatas y que los motores nombraron por su cuenta. Para estas no se mide la posición (n/d), y el extractor recoge como máximo 5 por respuesta, así que su presencia es un mínimo.",
    "",
    `Respuestas que no nombran ninguna marca: ${answersWithoutBrands} de ${valid.length}.`,
    "",
    neverNamed.length
      ? `Candidatas que ningún motor nombró: ${neverNamed.join(", ")}.`
      : "Todas las candidatas aparecieron al menos una vez.",
    "",
    "## Metodología",
    "",
    "- Las preguntas no nombran ninguna marca. Son las que haría un comprador real.",
    "- Cada motor recibe la misma instrucción neutral que usa un escaneo de GenScore: responder como a un usuario normal, sin favorecer ni evitar marcas.",
    "- Una mención solo cuenta si el nombre aparece literalmente en la respuesta (verificación de GenScore, no una inferencia del modelo).",
    "- Las respuestas de la IA varían entre ejecuciones. Esto es una foto de una fecha, no una clasificación permanente.",
    "",
    "## Preguntas",
    "",
    ...sector.prompts.map((prompt, index) => `${index + 1}. ${prompt}`)
  ];
  return `${lines.join("\n")}\n`;
}

export function parseArgs(argv: string[]): { sector?: string; samples: number; list: boolean; concurrency: number } {
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
  return { sector: value("--sector"), samples, list: argv.includes("--list"), concurrency };
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

async function runOne(
  sector: SectorConfig,
  engine: Engine,
  promptIndex: number,
  sample: number
): Promise<AnswerRecord> {
  const gemini = await import("../lib/llm/gemini");
  const openai = await import("../lib/llm/openai");
  const claude = await import("../lib/llm/claude");
  const { verifyExtractedMentions } = await import("../lib/scan/extraction");

  const prompt = sector.prompts[promptIndex];
  const base = { engine, promptIndex, sample };
  try {
    const generate =
      engine === "gemini"
        ? gemini.generateGeminiVisibilityAnswer
        : engine === "openai"
          ? openai.generateOpenAIVisibilityAnswer
          : claude.generateClaudeVisibilityAnswer;
    const answer = await generate({ prompt, country: sector.country, language: sector.language });

    // Same pairing as a scan: each engine's answer is read by that engine's extractor.
    const extract =
      engine === "gemini"
        ? gemini.extractGeminiStructuredData
        : engine === "openai"
          ? openai.extractOpenAIStructuredData
          : claude.extractClaudeStructuredData;
    const extracted = await extract({
      brand: STUDY_SENTINEL_BRAND,
      competitors: sector.seedBrands,
      rawResponseText: answer.text,
      promptText: prompt
    });
    const verified = verifyExtractedMentions(extracted.data, answer.text, STUDY_SENTINEL_BRAND);
    return {
      ...base,
      model: answer.model,
      error: null,
      rawText: answer.text,
      seedMentions: verified.competitors
        .filter((competitor) => competitor.mentioned)
        .map((competitor) => ({ name: competitor.name, position: competitor.position })),
      otherBrands: verified.other_brands_mentioned
    };
  } catch (error) {
    // Class name only — never a raw provider message (.claude/rules/gemini.md).
    const kind = error instanceof Error ? error.name : "UnknownError";
    const detail = (error as { category?: unknown })?.category;
    const category = typeof detail === "string" ? `${kind}:${detail}` : kind;
    return { ...base, model: null, error: category, rawText: null, seedMentions: [], otherBrands: [] };
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
  const missing = ["GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} (put them in .env.local).`);

  const tasks: Array<[Engine, number, number]> = [];
  for (let sample = 1; sample <= args.samples; sample += 1) {
    for (let promptIndex = 0; promptIndex < sector.prompts.length; promptIndex += 1) {
      for (const engine of ENGINES) tasks.push([engine, promptIndex, sample]);
    }
  }
  console.log(`[study] ${sector.id}: ${tasks.length} respuestas (${args.concurrency} en paralelo)…`);

  const records: AnswerRecord[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: args.concurrency }, async () => {
      while (cursor < tasks.length) {
        const [engine, promptIndex, sample] = tasks[cursor++];
        const record = await runOne(sector, engine, promptIndex, sample);
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
  const report = formatReport({ sector, records, rows, samples: args.samples, date });
  writeFileSync(path.join(outDir, "report.md"), report);
  console.log(`\n${report}\n[study] Guardado en ${outDir}/`);
}

if (process.argv[1] && /sector-study\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(`[study] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
