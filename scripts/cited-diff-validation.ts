/**
 * CITED-DIFF-1 Fase 0 — validación barata, de usar y tirar (Task Intake
 * founder-approved 2026-08-27, data-guardian review incorporada).
 *
 * Pregunta que responde: cuando un competidor sale citado en una respuesta de
 * IA, ¿el contenido real de esa página citada tiene algo que de verdad valga
 * la pena mostrarle a un usuario ("esto cubre que tú no cubres"), o la
 * diferencia es marginal la mayoría de las veces? No hay forma de saberlo sin
 * mirar páginas reales — este script las trae, sanea el texto, y te lo
 * enseña para que lo juzgues tú. No persiste nada, no llama a ningún LLM, no
 * toca ninguna tabla de escritura.
 *
 * PRECONDICIÓN OBLIGATORIA, no una nota al pie: este script tiene que
 * ejecutarse en TU máquina, nunca desde un agente. El proxy de este entorno
 * bloquea toda conexión saliente a un host arbitrario (comprobado con
 * data-guardian, 403 en el CONNECT) — si un agente lo ejecuta, todas las
 * páginas fallan y el resultado es un falso negativo uniforme, no una
 * respuesta real a la pregunta de arriba.
 *
 * Primer resultado, y es en sí mismo una respuesta parcial a la pregunta de
 * negocio: qué fracción de las citas de Gemini tienen una URL real
 * recuperable. `citation.url` es siempre el wrapper de redirección de Google
 * para Gemini — la página real sólo se conoce si `resolveCitation` (lib/
 * citations/aggregate-citations.ts, la MISMA función que ya usa la pantalla
 * de Páginas citadas — no reimplementada aquí) pudo emparejar `domain` con la
 * URL. Si ese reparto sale muy bajo, el techo de la feature ya está aquí, sin
 * necesidad de mirar ni una página.
 *
 * Guardián de fetch: `hostnameResolvesToPublicIp` y `readBodyCapped` se
 * IMPORTAN de lib/web-audit/fetch-page.ts (probados, revisados) — no se
 * reimplementan. A diferencia de ese módulo, aquí no hay lista de dominio
 * permitido: aterrizar en cualquier sitio público es el objetivo. Cada salto
 * de redirección se verifica antes de conectar, igual que fetchPageSafely y
 * que CITATION-REDIRECT-SSRF-1 (lib/scan/citation-resolution.ts).
 *
 * Lo que este script NUNCA hace, ni de usar y tirar: guardar el HTML crudo en
 * ningún sitio compartido, ni pasarlo tal cual a un LLM. El texto se sanea con
 * `sanitizeField` (lib/text/sanitize.ts, la única copia del repo) antes de
 * imprimirse — sólo a TU terminal, para que lo leas tú.
 *
 * No comprueba robots.txt del competidor: el módulo existente
 * (lib/web-audit/robots.ts) sólo entiende `Disallow: /` completo, y usarlo
 * para una ruta concreta sería peor que no comprobar nada (avisa el propio
 * fichero). Aceptado conscientemente para esta validación de una sola vez;
 * cualquier fase permanente futura necesita su propia decisión sobre esto.
 *
 * Uso:
 *   pnpm cited-diff:validate --domain tudominio.es --limit 15
 *   pnpm cited-diff:validate --limit 15   # sin --domain: TODOS los proyectos, avisa fuerte
 */

import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { createServiceClient } from "../lib/supabase/service";
import { hostnameResolvesToPublicIp, readBodyCapped } from "../lib/web-audit/fetch-page";
import { resolveCitation } from "../lib/citations/aggregate-citations";
import { sanitizeField } from "../lib/text/sanitize";

const PER_PAGE_TIMEOUT_MS = 4_000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const EXCERPT_CHARS = 600;
const USER_AGENT =
  "GenScoreCitedDiffValidation/0.1 (one-off founder-run research script, not a recurring crawler — docs/brand/design-decisions-log.md CITED-DIFF-1 Fase 0)";

/* ---- Pure helpers (covered by cited-diff-validation.test.ts, no network) ---- */

export function parseLimitArg(argv: string[], defaultLimit: number): number {
  const idx = argv.indexOf("--limit");
  if (idx === -1 || idx + 1 >= argv.length) return defaultLimit;
  const parsed = Number.parseInt(argv[idx + 1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultLimit;
}

export function parseDomainArg(argv: string[]): string | null {
  const idx = argv.indexOf("--domain");
  if (idx === -1 || idx + 1 >= argv.length) return null;
  const value = argv[idx + 1].trim().toLowerCase();
  return value.length > 0 ? value : null;
}

export type LocalCitation = {
  url?: string | null;
  domain?: string | null;
  title?: string | null;
  source?: "grounding" | "inline";
};

export type ClassifiedCitation = {
  provider: string;
  domain: string;
  recoverableUrl: string | null;
};

/** Mirrors promptCitationPages' own filter (recommendation-engine.ts): only
 * grounded citations with a domain are candidates at all. */
export function classifyCitation(provider: string, citation: LocalCitation): ClassifiedCitation | null {
  if (citation.source !== "grounding" || !citation.domain) return null;
  const resolved = resolveCitation(citation);
  return { provider, domain: citation.domain, recoverableUrl: resolved?.url || null };
}

export type ProviderSplit = { provider: string; total: number; recoverable: number };

export function summarizeSplit(classified: ClassifiedCitation[]): ProviderSplit[] {
  const byProvider = new Map<string, ProviderSplit>();
  for (const c of classified) {
    const entry = byProvider.get(c.provider) ?? { provider: c.provider, total: 0, recoverable: 0 };
    entry.total += 1;
    if (c.recoverableUrl) entry.recoverable += 1;
    byProvider.set(c.provider, entry);
  }
  return Array.from(byProvider.values()).sort((a, b) => a.provider.localeCompare(b.provider));
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? sanitizeField(match[1], 200) : "(sin <title>)";
}

/* ---- I/O (not covered by unit tests — needs live network/DB credentials) ---- */

/** Same minimal, non-overwriting .env.local loader as scripts/extraction-bench.ts. */
function loadDotEnvLocal(path = ".env.local"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function isSafeToFetch(url: URL): Promise<boolean> {
  if (url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase();
  if (isIP(hostname)) return false; // reject IP-literal hosts outright, never resolve/allow them
  return hostnameResolvesToPublicIp(hostname);
}

type FetchOutcome =
  | { status: "fetched"; finalUrl: string; title: string; excerpt: string; htmlBytes: number }
  | { status: "skipped_unsafe" | "skipped_not_html" | "skipped_error" | "skipped_timeout" };

/** Manual redirect loop, every hop verified before connecting — same shape as
 * fetchPageSafely (lib/web-audit/fetch-page.ts) and resolveGroundingRedirect
 * (lib/scan/citation-resolution.ts), but with no domain allowlist: landing on
 * any public site is the point of this validation. */
async function fetchPublicPage(rawUrl: string): Promise<FetchOutcome> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { status: "skipped_error" };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafeToFetch(current))) return { status: "skipped_unsafe" };

    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(PER_PAGE_TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT }
      });
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return { status: isTimeout ? "skipped_timeout" : "skipped_error" };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: "skipped_error" };
      try {
        current = new URL(location, current);
      } catch {
        return { status: "skipped_error" };
      }
      continue; // next iteration re-verifies the NEW host before following
    }

    if (!response.ok) return { status: "skipped_error" };

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) return { status: "skipped_not_html" };

    const html = await readBodyCapped(response, MAX_HTML_BYTES);
    return {
      status: "fetched",
      finalUrl: current.toString(),
      title: extractTitle(html),
      excerpt: sanitizeField(html, EXCERPT_CHARS),
      htmlBytes: Buffer.byteLength(html, "utf-8")
    };
  }

  return { status: "skipped_error" }; // exceeded MAX_REDIRECTS
}

type SampleRow = { provider: string | null; extracted_json: unknown };

async function fetchCitationSample(domain: string | null): Promise<SampleRow[]> {
  const service = createServiceClient();

  let projectId: string | null = null;
  if (domain) {
    const { data, error } = await service.from("projects").select("id").eq("domain", domain).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Ningún proyecto con domain="${domain}".`);
    projectId = (data as { id: string }).id;
  }

  let query = service
    .from("scan_prompt_results")
    .select("provider, extracted_json")
    .eq("status", "completed")
    .not("extracted_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SampleRow[];
}

function extractCitations(row: SampleRow): LocalCitation[] {
  const ext = row.extracted_json;
  if (!ext || typeof ext !== "object") return [];
  const citations = (ext as Record<string, unknown>).citations;
  return Array.isArray(citations) ? (citations as LocalCitation[]) : [];
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const argv = process.argv.slice(2);
  const limit = parseLimitArg(argv, 15);
  const domain = parseDomainArg(argv);

  if (!domain) {
    console.warn(
      "⚠ Sin --domain: leyendo citas de TODOS los proyectos de esta cuenta de Supabase, no solo los tuyos. " +
        "Usa --domain tudominio.es para acotarlo a un proyecto concreto.\n"
    );
  }

  console.log(`CITED-DIFF-1 Fase 0 — muestreando citas${domain ? ` de ${domain}` : ""}...`);
  const rows = await fetchCitationSample(domain);
  console.log(`${rows.length} filas de scan_prompt_results leídas.`);

  const classified: ClassifiedCitation[] = [];
  for (const row of rows) {
    const provider = row.provider ?? "unknown";
    for (const citation of extractCitations(row)) {
      const result = classifyCitation(provider, citation);
      if (result) classified.push(result);
    }
  }

  console.log(`\n${classified.length} citas grounded con dominio (de cualquier motor).\n`);
  console.log("Reparto de URL real recuperable, por motor:\n");
  for (const split of summarizeSplit(classified)) {
    const pct = split.total > 0 ? ((split.recoverable / split.total) * 100).toFixed(1) : "—";
    console.log(`  ${split.provider}: ${split.recoverable}/${split.total} recuperable (${pct}%)`);
  }

  const recoverableUrls = Array.from(new Set(classified.map((c) => c.recoverableUrl).filter((u): u is string => Boolean(u))));
  const sample = recoverableUrls.slice(0, limit);
  console.log(
    `\n${recoverableUrls.length} URLs únicas recuperables. Trayendo ${sample.length} (--limit ${limit}) para que las leas...\n`
  );

  let fetched = 0;
  for (const [index, url] of sample.entries()) {
    console.log(`[${index + 1}/${sample.length}] ${url}`);
    const outcome = await fetchPublicPage(url);
    if (outcome.status !== "fetched") {
      console.log(`  → ${outcome.status}\n`);
      continue;
    }
    fetched += 1;
    console.log(`  → OK · ${outcome.htmlBytes} bytes · "${outcome.title}"`);
    console.log(`  ${outcome.excerpt}\n`);
  }

  console.log(`Hecho. ${fetched}/${sample.length} páginas leídas correctamente.`);
  console.log(
    "\nEsto no es un veredicto — es lo que hay para que lo juzgues tú: ¿hay algo en estas páginas que de " +
      "verdad valga la pena mostrarle a un usuario (\"esto cubre que tú no cubres\"), o la diferencia es " +
      "marginal la mayoría de las veces? La respuesta decide si CITED-DIFF-1 pasa a su fase permanente."
  );
}

// Only run when invoked directly (`pnpm cited-diff:validate`) — NOT when this
// module is imported for its pure helpers, which is exactly what
// cited-diff-validation.test.ts does (same guard as extraction-bench.ts).
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error("CITED-DIFF-1 Fase 0 falló:", err);
    process.exitCode = 1;
  });
}
