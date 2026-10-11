/**
 * SECTOR-STUDY-1 — «¿Qué marcas españolas de <sector> recomienda la IA?»
 *
 * Pure half of the sector study: sector definitions, how mentions are
 * counted, and the report. No network, no `server-only`, so the same code
 * runs in the founder's local script (`scripts/sector-study.ts`) and in the
 * operator page (`app/admin/estudio`), which aggregates in the browser.
 * The provider calls live in `run-sector-answer.ts`.
 *
 * Every number in the report is a GenScore measurement: same brand-blind
 * generation prompt as a scan (docs/adr/0007), same extraction and literal
 * mention verification (docs/adr/0021). Seed brands are candidates to look
 * for, never a claim about who leads.
 */

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
  /**
   * Custom study only: the brand being analysed. It goes into the extractor's
   * brand slot (verified literally, as in a scan) and leads the seed list.
   */
  brand?: string;
  /** True when an operator wrote the questions (they may name brands). */
  custom?: boolean;
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

export const ENGINES = ["gemini", "openai", "claude", "perplexity"] as const;
export type Engine = (typeof ENGINES)[number];

export const ENGINE_LABEL: Record<Engine, string> = { gemini: "Gemini", openai: "ChatGPT", claude: "Claude", perplexity: "Perplexity" };

/**
 * Engines ticked by default. Public studies name ChatGPT, Gemini and Claude
 * only, so Perplexity is opt-in on the page (PERPLEXITY-ENGINE-1, log §274).
 */
export const DEFAULT_ENGINES: Engine[] = ["gemini", "openai", "claude"];

/** Never matches a real brand; extraction requires one. */
export const STUDY_SENTINEL_BRAND = "Marca de control del estudio";

export const CUSTOM_STUDY_LIMITS = { maxPrompts: 20, maxPromptChars: 300, maxCompetitors: 15, maxNameChars: 80 } as const;

/** `https://www.Acme.es/x` → `acme.es`; null when it is not a plausible domain. */
export function normalizeStudyDomain(raw: string): string | null {
  const domain = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

export function brandFromDomain(domain: string): string {
  return domain
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Builds and validates a one-off study for one brand with the operator's own
 * questions and competitors. The server action runs it again: it never
 * trusts what the browser sends. Returns an error code instead of throwing.
 */
export function buildCustomStudy(input: {
  domain: string;
  brand?: string;
  prompts: string[];
  competitors: string[];
}): { ok: true; sector: SectorConfig } | { ok: false; error: string } {
  const domain = normalizeStudyDomain(input.domain);
  if (!domain) return { ok: false, error: "bad_domain" };
  const brand = (input.brand?.trim() || brandFromDomain(domain)).slice(0, CUSTOM_STUDY_LIMITS.maxNameChars);
  const prompts = input.prompts.map((prompt) => prompt.trim()).filter(Boolean);
  if (prompts.length === 0 || prompts.length > CUSTOM_STUDY_LIMITS.maxPrompts) return { ok: false, error: "bad_prompt_count" };
  if (prompts.some((prompt) => prompt.length < 5 || prompt.length > CUSTOM_STUDY_LIMITS.maxPromptChars)) {
    return { ok: false, error: "bad_prompt_length" };
  }
  const competitors = [...new Set(input.competitors.map((name) => name.trim()).filter(Boolean))].filter(
    (name) => brandKey(name) !== brandKey(brand)
  );
  if (competitors.length > CUSTOM_STUDY_LIMITS.maxCompetitors) return { ok: false, error: "too_many_competitors" };
  if (competitors.some((name) => name.length > CUSTOM_STUDY_LIMITS.maxNameChars)) return { ok: false, error: "bad_competitor" };
  return {
    ok: true,
    sector: { id: `custom-${domain}`, label: domain, country: "ES", language: "es", prompts, seedBrands: competitors, brand, custom: true }
  };
}

/** Seeds to count, the analysed brand first. */
export function studySeeds(sector: SectorConfig): string[] {
  return sector.brand ? [sector.brand, ...sector.seedBrands] : sector.seedBrands;
}

/* ---- Counting and report (covered by scripts/sector-study.test.ts) ---- */

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
  /** Non-seed brands the extractor surfaced (max 5 per answer), AI assistants and GEO jargon removed. */
  otherBrands: string[];
  /** Sentiment about the analysed brand — only set when the answer names it. */
  sentiment?: string | null;
  /** Pages the engine grounded its answer on (Gemini redirects resolved; `domain` null when resolution failed). */
  citations?: Array<{ url: string; domain: string | null }>;
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
  /** Those prompts, 0-based, ascending. */
  promptIndexes: number[];
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
        promptIndexes: [],
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
      promptsCovered: prompts.size,
      promptIndexes: [...prompts].sort((a, b) => a - b)
    }))
    .sort((a, b) => b.mentions - a.mentions || b.firstPlace - a.firstPlace || a.name.localeCompare(b.name, "es"));
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export type CitedDomainRow = { domain: string; answers: number; engines: Engine[]; prompts: number[] };

/** Grounded domains across valid answers; one count per answer per domain. Unresolved citations (domain null) are counted apart, never guessed. */
export function aggregateCitedDomains(records: AnswerRecord[]): { rows: CitedDomainRow[]; unresolved: number } {
  const rows = new Map<string, { answers: number; engines: Set<Engine>; prompts: Set<number> }>();
  let unresolved = 0;
  for (const record of records) {
    if (record.error !== null) continue;
    const seen = new Set<string>();
    for (const citation of record.citations ?? []) {
      if (!citation.domain) {
        unresolved += 1;
        continue;
      }
      const domain = citation.domain.replace(/^www\./, "");
      if (seen.has(domain)) continue;
      seen.add(domain);
      const row = rows.get(domain) ?? { answers: 0, engines: new Set<Engine>(), prompts: new Set<number>() };
      row.answers += 1;
      row.engines.add(record.engine);
      row.prompts.add(record.promptIndex);
      rows.set(domain, row);
    }
  }
  return {
    unresolved,
    rows: [...rows.entries()]
      .map(([domain, row]) => ({
        domain,
        answers: row.answers,
        engines: ENGINES.filter((engine) => row.engines.has(engine)),
        prompts: [...row.prompts].sort((a, b) => a - b)
      }))
      .sort((a, b) => b.answers - a.answers || a.domain.localeCompare(b.domain))
  };
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "positivo",
  neutral: "neutro",
  negative: "negativo",
  mixed: "mixto",
  unknown: "sin determinar"
};

const promptRefs = (indexes: number[]) => indexes.map((index) => `#${index + 1}`).join(", ");

/** The one-brand part of the report: per-engine rate, average position, sentiment, cited domains and the per-question detail. */
function brandDetail(sector: SectorConfig, records: AnswerRecord[], engines: readonly Engine[], brandRow: BrandRow | undefined): string[] {
  const brand = sector.brand ?? "";
  const key = brandKey(brand);
  const valid = records.filter((record) => record.error === null);
  const named = valid.filter((record) => record.seedMentions.some((mention) => brandKey(mention.name) === key));
  const positions = named
    .map((record) => record.seedMentions.find((mention) => brandKey(mention.name) === key)?.position ?? null)
    .filter((position): position is number => position !== null);
  const sentiments = new Map<string, number>();
  for (const record of named) {
    const label = SENTIMENT_LABEL[record.sentiment ?? "unknown"] ?? "sin determinar";
    sentiments.set(label, (sentiments.get(label) ?? 0) + 1);
  }
  const cited = aggregateCitedDomains(records);
  const ownDomain = sector.label;
  const ownCited = cited.rows.find((row) => row.domain === ownDomain || row.domain.endsWith(`.${ownDomain}`));

  const out = [
    "## Detalle de la marca",
    "",
    `- **Por motor:** ${engines
      .map((engine) => {
        const cell = brandRow?.perEngine[engine];
        return !cell || cell.valid === 0 ? `${ENGINE_LABEL[engine]} sin respuestas válidas` : `${ENGINE_LABEL[engine]} ${pct(cell.mentions / cell.valid)} (${cell.mentions}/${cell.valid})`;
      })
      .join(" · ")}.`,
    `- **Puesto medio cuando aparece:** ${
      positions.length ? `${(positions.reduce((sum, value) => sum + value, 0) / positions.length).toFixed(1)} (sobre ${positions.length} respuestas con posición)` : "sin dato (no aparece o sin posición)"
    }.`,
    `- **Sentimiento cuando se la nombra:** ${
      named.length ? [...sentiments.entries()].map(([label, count]) => `${label} ${count}`).join(" · ") : "no aplica (no se la nombra)"
    }.`,
    `- **Consultas en que aparece:** ${brandRow && brandRow.promptIndexes.length ? promptRefs(brandRow.promptIndexes) : "ninguna"}.`,
    `- **Su propia web citada como fuente:** ${ownCited ? `en ${ownCited.answers} respuestas (${ownCited.engines.map((engine) => ENGINE_LABEL[engine]).join(", ")})` : "en ninguna respuesta"}.`,
    "",
    "## Dominios citados",
    "",
    "Páginas en las que los motores con búsqueda (Gemini, ChatGPT) apoyaron su respuesta; Claude responde sin búsqueda y no cita.",
    ""
  ];
  if (cited.rows.length === 0) {
    out.push("Ninguna respuesta válida citó fuentes.", "");
  } else {
    out.push("| Dominio | Respuestas | Motores | Consultas |", "|---|---|---|---|");
    for (const row of cited.rows.slice(0, 20)) {
      out.push(`| ${row.domain} | ${row.answers} | ${row.engines.map((engine) => ENGINE_LABEL[engine]).join(", ")} | ${promptRefs(row.prompts)} |`);
    }
    out.push("");
  }
  if (cited.unresolved > 0) out.push(`Citas cuyo destino no se pudo resolver (excluidas de la tabla): ${cited.unresolved}.`, "");

  out.push("## Detalle por consulta", "", "El texto completo de cada respuesta está en el .json (`records[].rawText`).", "");
  sector.prompts.forEach((prompt, index) => {
    out.push(`**#${index + 1}. ${prompt}**`, "");
    for (const record of records.filter((candidate) => candidate.promptIndex === index)) {
      const who = `${ENGINE_LABEL[record.engine]}${record.sample > 1 ? ` (muestra ${record.sample})` : ""}`;
      if (record.error !== null) {
        out.push(`- ${who}: **fallo** (${record.error}).`);
        continue;
      }
      const mention = record.seedMentions.find((candidate) => brandKey(candidate.name) === key);
      const brandText = mention ? `nombra a ${brand}${mention.position ? ` en el puesto ${mention.position}` : ""}` : `no nombra a ${brand}`;
      const others = [
        ...record.seedMentions.filter((candidate) => brandKey(candidate.name) !== key).map((candidate) => candidate.name),
        ...record.otherBrands
      ];
      const domains = [...new Set((record.citations ?? []).map((citation) => citation.domain ?? "sin resolver"))];
      out.push(
        `- ${who}: ${brandText} · otras marcas: ${others.length ? others.join(", ") : "ninguna"} · fuentes: ${domains.length ? domains.join(", ") : "ninguna"}.`
      );
    }
    out.push("");
  });
  return out;
}

export function formatReport(input: {
  sector: SectorConfig;
  records: AnswerRecord[];
  rows: BrandRow[];
  samples: number;
  date: string;
  /** Engines actually run. Defaults to all three. */
  engines?: readonly Engine[];
}): string {
  const { sector, records, rows, samples, date } = input;
  const engines = input.engines ?? ENGINES;
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

  const brandRow = sector.brand ? rows.find((row) => brandKey(row.name) === brandKey(sector.brand ?? "")) : undefined;
  const brandSummary = sector.brand
    ? [
        `**${sector.brand}** aparece en el ${pct(brandRow?.rate ?? 0)} de las respuestas válidas (${brandRow?.mentions ?? 0} de ${valid.length}) y es la primera marca nombrada en ${brandRow?.firstPlace ?? 0}.`,
        ""
      ]
    : [];

  const lines = [
    sector.brand
      ? `# ¿Recomienda la IA a ${sector.brand} (${sector.label})?`
      : `# ¿Qué marcas españolas de ${sector.label} recomienda la IA?`,
    "",
    `Estudio GenScore · ${date} · ${sector.prompts.length} preguntas × ${engines.length} motores × ${samples} muestra(s) = ${records.length} respuestas pedidas, **${valid.length} válidas**${failed ? ` (${failed} fallidas, excluidas del cálculo)` : ""}.`,
    "",
    `Modelos: ${models.join(" · ") || "—"}`,
    "",
    ...failureWarning,
    ...brandSummary,
    "## Ranking por presencia",
    "",
    "Presencia = porcentaje de respuestas válidas que nombran la marca (cada respuesta cuenta una vez por marca).",
    "",
    `| # | Marca | Presencia | ${engines.map((engine) => ENGINE_LABEL[engine]).join(" | ")} | 1.ª nombrada | Preguntas (de ${sector.prompts.length}) |`,
    `|---|---|---|${engines.map(() => "---").join("|")}|---|---|`,
    ...shown.map((row, index) => {
      const perEngine = engines.map((engine) => {
        const cell = row.perEngine[engine];
        return cell.valid === 0 ? "—" : `${pct(cell.mentions / cell.valid)} (${cell.mentions}/${cell.valid})`;
      });
      const first = row.seed ? String(row.firstPlace) : "n/d";
      const promptsCell = sector.custom ? `${row.promptsCovered} (${promptRefs(row.promptIndexes)})` : String(row.promptsCovered);
      return `| ${index + 1} | ${row.name}${row.seed ? "" : " ·"} | ${pct(row.rate)} (${row.mentions}/${valid.length}) | ${perEngine.join(" | ")} | ${first} | ${promptsCell} |`;
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
    ...(sector.brand ? brandDetail(sector, records, engines, brandRow) : []),
    "## Metodología",
    "",
    sector.custom
      ? "- Las preguntas las eligió el operador para este estudio (escritas a mano o sugeridas por IA desde la web de la marca y revisadas); léelas abajo antes de citar ninguna cifra."
      : "- Las preguntas no nombran ninguna marca. Son las que haría un comprador real.",
    "- Cada motor recibe la misma instrucción neutral que usa un escaneo de GenScore: responder como a un usuario normal, sin favorecer ni evitar marcas.",
    "- Una mención solo cuenta si el nombre aparece literalmente en la respuesta (verificación de GenScore, no una inferencia del modelo).",
    "- Asistentes de IA (ChatGPT, Gemini…) y términos genéricos del sector no cuentan como marcas.",
    "- Las respuestas de la IA varían entre ejecuciones. Esto es una foto de una fecha, no una clasificación permanente.",
    "",
    "## Preguntas",
    "",
    ...sector.prompts.map((prompt, index) => `${index + 1}. ${prompt}`)
  ];
  return `${lines.join("\n")}\n`;
}
