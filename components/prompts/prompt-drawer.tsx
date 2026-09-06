"use client";

import { Fragment, useState } from "react";
import type { ResultRow } from "@/app/dashboard/projects/[projectId]/prompts/page";
import { DeletePromptButton } from "@/app/dashboard/projects/[projectId]/prompts/delete-prompt-button";
import { InfoTip } from "@/components/ui/info-tip";
import { Icon } from "@/components/ui/icon";
import { EngineGlyph } from "@/components/ui/engine-glyph";
import { FormattedResponse } from "@/components/ui/formatted-response";
import { buildRanking } from "@/components/prompts/mention-coverage";
import { computeDominantBrandSentiment } from "@/lib/metrics/brand-sentiment";
import { getEngineMeta, normalizeProvider } from "@/lib/scan/engine-meta";
import { sampleCountOf, sampleLabel } from "@/lib/scan/sample-display";
import { matchDisplayName } from "@/lib/brand-aliases/match-display-name";
// Same brand-domain matching the Citations page and run-scoring use, so
// "Citada" here can never disagree with own_citation_share / citation_score
// over what counts as the brand's own domain (BRAND-DOMAIN-1).
import { isBrandDomain } from "@/lib/domains/brand-domain";

type Competitor = {
  id: string;
  name: string;
  domain: string;
};

type Props = {
  projectId: string;
  projectDomain: string;
  projectBrand: string;
  results: ResultRow[];
  competitors: Competitor[];
  onClose: () => void;
};

type ExtractedJson = {
  brand?: { mentioned?: boolean; evidence?: string[]; display_name_found?: string | null };
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
  citations?: Array<{
    url?: string | null;
    domain?: string | null;
    title?: string | null;
    source?: "grounding" | "inline";
  }>;
  sentiment?: string;
  summary?: string;
};

const sentimentLabels: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutral",
  negative: "Negativo",
  mixed: "Mixto",
  // Founder decision: extraction's "unknown" reads as "Neutral" in the UI
  // instead of leaking the raw English value.
  unknown: "Neutral",
};

// SCREEN-POLISH-1 Fase A: distinct from "Neutral" above on purpose — this is
// not a computed neutral/unknown sentiment, it's "no brand mention, so no
// brand sentiment to report at all". Reusing "Neutral" here would still be
// affirming a sentiment reading that doesn't exist.
const SENTIMENT_NA_LABEL = "No aplica";

function sentimentBadgeClass(s: string | null | undefined): string {
  if (s === "positive") return "badge-pos";
  if (s === "negative") return "badge-neg";
  return "badge-neutral";
}

type Tab = "resumen" | "respuestas";

/**
 * Mirrors the frontend display rule from docs/adr/0006: the raw Google
 * grounding-redirect URL (vertexaisearch.cloud.google.com/...) must never be
 * rendered. Unresolved grounding citations (domain: null) fall back to
 * title, then a generic label. Inline citations without a domain keep
 * showing their raw url, since those are not Google redirect wrappers.
 */
function citationDisplayLabel(cite: {
  url?: string | null;
  domain?: string | null;
  title?: string | null;
  source?: "grounding" | "inline";
}): string {
  if (cite.domain) return cite.domain;
  if (cite.source === "grounding") return cite.title?.trim() || "Fuente sin resolver";
  return cite.url ?? "—";
}

function parseExtracted(raw: unknown): ExtractedJson | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as ExtractedJson)
    : null;
}

export function PromptDrawer({ projectId, projectDomain, projectBrand, results, competitors, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resumen");
  // Un prompt con muchos competidores es, casi siempre, un muro de ceros
  // (founder feedback, 2026-08-23: "9 marcas, 8 a 0%"). Las no mencionadas
  // quedan plegadas detrás de un botón hasta que alguien pide verlas; la
  // marca propia nunca se pliega, mencionada o no, porque es la razón por la
  // que se abrió el cajón.
  const [showAllRanking, setShowAllRanking] = useState(false);

  if (!results.length) return null;

  const extractedList = results.map((r) => parseExtracted(r.extracted_json));

  const brandMentioned = results.some((r) => r.brand_mentioned);
  const brandEvidence = Array.from(
    new Set(extractedList.flatMap((e) => e?.brand?.evidence ?? []))
  );

  // Evidence and citations organized by engine (founder feedback 2026-07-24:
  // a flat list merged across engines was harder to scan than one grouped by
  // motor). Each engine keeps its own de-duplicated citation list — the same
  // source cited by two engines legitimately appears once under each.
  const engineGroups = results.map((r, i) => {
    const ext = extractedList[i];
    const evidence = ext?.brand?.evidence ?? [];
    const citations: Array<{
      url?: string | null;
      domain?: string | null;
      title?: string | null;
      source?: "grounding" | "inline";
    }> = [];
    const seen = new Set<string>();
    for (const cite of ext?.citations ?? []) {
      const key = (cite.domain ?? cite.title ?? cite.url ?? "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      citations.push(cite);
    }
    // The project's own domain, when this engine used it, goes first — it's
    // the one source in the list that's actually yours.
    citations.sort((a, b) => {
      const aOwn = isBrandDomain(a.domain, projectDomain);
      const bOwn = isBrandDomain(b.domain, projectDomain);
      if (aOwn === bOwn) return 0;
      return aOwn ? -1 : 1;
    });
    // Fase −1c (docs/geo-score-variability-2026-08.md §3): WHICH of the
    // brand's known names this mention actually matched — the tracked brand
    // string, or one of its aliases. Purely presentational, computed over
    // this row's OWN snapshot (frozen at scan time, ADR 0025), never over the
    // project's current brand_aliases, so a later alias edit can't relabel
    // how an old mention is explained. Falls back to `projectBrand` only for
    // rows persisted before brand_snapshot existed.
    const displayNameMatch = matchDisplayName(
      ext?.brand?.display_name_found,
      r.brand_snapshot ?? projectBrand,
      r.brand_aliases_snapshot ?? []
    );
    // PROMPT-DRAWER-TRUTH-1: se lee de `extracted_json`, no de la columna
    // `brand_mentioned`. Las dos coinciden cuando la extracción funcionó, pero
    // en una fila cuya extracción falló la columna conserva el valor ingenuo
    // del momento de generar (una subcadena en `prompt-job.ts`) y no hay
    // ninguna verificación detrás — decir «mención verificada» de eso sería
    // afirmar algo que nadie comprobó (MENTION-VERIFY-1, docs/adr/0021).
    const verifiedMention = Boolean(ext?.brand?.mentioned);
    return { row: r, meta: getEngineMeta(r.provider), evidence, citations, displayNameMatch, verifiedMention };
  });
  /**
   * PROMPT-DRAWER-TRUTH-1 (log §147): un motor entra en el panel si aporta
   * citas **o** si su mención está verificada y no las trae.
   *
   * Antes sólo entraba con citas, así que el 10% de las menciones verificadas
   * que no dejan una cita utilizable —186 filas de Gemini, 39 de ChatGPT y 12
   * de Claude sobre 2.367 medidas el 2026-08-23— hacían desaparecer la sección
   * entera sin decir nada, debajo de un «La IA menciona tu marca» en verde. El
   * usuario que abre justo una de ésas concluye que la herramienta se lo
   * inventa, que es exactamente lo que le pasó al fundador.
   */
  const evidenceGroups = engineGroups.filter((g) => g.evidence.length > 0 || g.verifiedMention);
  const citationGroups = engineGroups.filter((g) => g.citations.length > 0);
  const totalCitations = citationGroups.reduce((sum, g) => sum + g.citations.length, 0);
  const hasOwnCitation = engineGroups.some((g) =>
    g.citations.some((c) => isBrandDomain(c.domain, projectDomain))
  );

  // PROMPT-DRAWER-TRUTH-1 (log §147): la cobertura sale de contar respuestas,
  // no de `some(...)` pintado como 100%/0%. El cálculo y su orden viven en
  // `mention-coverage.ts` porque son la parte verificable sin navegador.
  const allRows = buildRanking({
    results,
    extractedList,
    competitors,
    brandEvidence,
    brandSentiment: computeDominantBrandSentiment(results),
    brandName: projectBrand,
  });

  const mentionedRankingCount = allRows.filter((row) => row.mentioned).length;
  const visibleRankingRows = allRows.filter((row) => row.isOwn || row.mentioned || showAllRanking);
  const hiddenRankingCount = allRows.length - visibleRankingRows.length;

  const category = results[0].category;

  /**
   * SAMPLING-SURFACE-1 (ADR 0030): with repetitions, `results` arrives in
   * whatever order the query returned, so the same engine's answers can be
   * scattered through the "Por motor" list. Sorting by engine and then by
   * sample puts an engine's own repetitions next to each other, which is what
   * makes "this engine said different things on different tries" legible at a
   * glance. `sampleCount` is derived once and shared with the label so the two
   * cannot disagree about how many times the prompt was asked.
   */
  const sampleCount = sampleCountOf(results);
  const enginesBySample = [...results].sort((a, b) => {
    const byProvider = normalizeProvider(a.provider).localeCompare(normalizeProvider(b.provider));
    if (byProvider !== 0) return byProvider;
    return Number(a.sample_index ?? 0) - Number(b.sample_index ?? 0);
  });

  return (
    <>
      {/* Overlay */}
      <div
        className="prompt-drawer-overlay"
        onClick={onClose}
        aria-label="Cerrar panel"
      />

      {/* Drawer */}
      <div className="prompt-drawer pr2-scope" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="drawer-header">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {category ? <span className="drawer-tag">{category}</span> : null}
              <p
                style={{
                  fontSize: 14,
                  color: "var(--ink)",
                  lineHeight: 1.45,
                  fontWeight: 600,
                }}
              >
                {results[0].prompt_text_snapshot ?? "Prompt"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {results[0].prompt_id ? (
                <DeletePromptButton projectId={projectId} promptId={results[0].prompt_id} onDeleted={onClose} />
              ) : null}
              <button
                onClick={onClose}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 26,
                  height: 26,
                  borderRadius: "var(--r-sm)",
                  background: "var(--surface-sunk)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  color: "var(--ink-4)",
                  lineHeight: 1,
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab${tab === "resumen" ? " active" : ""}`}
            onClick={() => setTab("resumen")}
          >
            Resumen
          </button>
          <button
            className={`drawer-tab${tab === "respuestas" ? " active" : ""}`}
            onClick={() => setTab("respuestas")}
          >
            Respuestas
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {tab === "resumen" && (
            <>
              {/* Presencia: mencionada vs. citada */}
              <div className="pr2-presence">
                <div className="pr2-presence-cell">
                  <div className="stmt" style={{ color: brandMentioned ? "var(--pos-ink)" : "var(--neg-ink)" }}>
                    {brandMentioned ? "La IA menciona tu marca" : "La IA no menciona tu marca"}
                  </div>
                  <div className="hint">La IA te nombra por lo que ya sabe de tu marca, no por tu web.</div>
                </div>
                <div className="pr2-presence-cell">
                  <div className="stmt" style={{ color: hasOwnCitation ? "var(--accent-ink)" : "var(--ink-4)" }}>
                    {hasOwnCitation ? "La IA cita tu web" : "La IA no cita tu web"}{" "}
                    <InfoTip text="Que la IA use fuentes reales (grounding) no basta: exige que al menos una de esas fuentes sea tu propio dominio — la única de estas dos señales que depende de contenido que publiques." />
                  </div>
                  <div className="hint">
                    {hasOwnCitation
                      ? "Al menos una fuente usada es tuya."
                      : "La IA responde sin citar tu web ni tu contenido."}
                  </div>
                </div>
              </div>

              {/* Por motor */}
              <div>
                <p className="ac-title">Por motor</p>
                <div className="aside-card">
                  {enginesBySample.map((r) => {
                    const meta = getEngineMeta(r.provider);
                    const label = sampleLabel(r.sample_index, sampleCount);
                    return (
                      <div key={r.id} className="pr2-erow">
                        <span className="pr2-eav" style={{ color: meta.color }}>
                          <EngineGlyph provider={normalizeProvider(r.provider)} />
                        </span>
                        {/* SAMPLING-SURFACE-1 (ADR 0030): with repetitions this
                            list showed "Gemini / Gemini / Gemini / Claude /
                            ..." with nothing saying why — three rows that look
                            like a rendering bug but are in fact three separate
                            answers to the same question, and whose disagreement
                            is the entire point of sampling. The label only
                            appears when there is more than one sample. */}
                        <span className="pr2-erow-name">
                          {meta.label}
                          {label ? (
                            <span style={{ color: "var(--ink-4)", fontWeight: 500 }}> · {label}</span>
                          ) : null}
                        </span>
                        <span className={`badge ${r.brand_mentioned ? "badge-pos" : "badge-neutral"}`}>
                          {r.brand_mentioned ? "Mencionada" : "Ausente"}
                        </span>
                        {r.brand_mentioned ? (
                          r.sentiment ? (
                            <span className={`badge ${sentimentBadgeClass(r.sentiment)}`}>
                              {sentimentLabels[r.sentiment] ?? r.sentiment}
                            </span>
                          ) : null
                        ) : (
                          // SCREEN-POLISH-1 Fase A: no brand mention on this
                          // row → no brand sentiment to report, however the
                          // LLM filled `sentiment` for it.
                          <span className="badge badge-outline">{SENTIMENT_NA_LABEL}</span>
                        )}
                        <span className="pr2-erow-cit">
                          {r.citations_count ?? 0} {r.citations_count === 1 ? "cita" : "citas"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ranking de marcas */}
              <div>
                <div className="pr2-rk-head">
                  <p className="ac-title">Ranking de marcas</p>
                  {/* Rotula la columna numérica de abajo (fracción +
                      porcentaje) — sin esto, un «33%» suelto no dice de qué es
                      el 33% (founder feedback, 2026-08-23). */}
                  <span className="pr2-rk-col-label">Aparición en motores</span>
                </div>
                <div className="aside-card">
                  {/* Resumen antes que la lista: con muchos competidores no
                      mencionados, la lista es puro 0% y el dato que importa
                      —cuántos SÍ salieron— se pierde en el muro. */}
                  <p className="pr2-rk-summary">
                    {mentionedRankingCount} de {allRows.length} marcas mencionadas en este prompt.
                  </p>
                  {visibleRankingRows.map((row, i) => (
                    <div key={row.name} className={`pr2-rk${row.isOwn ? " you" : ""}`}>
                      <span className="pr2-rk-n">{i + 1}</span>
                      <span className="pr2-rk-av">{row.name[0].toUpperCase()}</span>
                      <span className="pr2-rk-name">
                        {row.name}
                        {row.isOwn && <span className="pr2-rk-tag">Tú</span>}
                        {row.isOwn && row.sentiment ? (
                          <span className={`badge ${sentimentBadgeClass(row.sentiment)}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                            {sentimentLabels[row.sentiment] ?? row.sentiment}
                          </span>
                        ) : null}
                      </span>
                      {/* La fracción va al lado del porcentaje, no escondida
                          en un `title`: «33%» sin denominador no se puede
                          juzgar, y el denominador cambia de un prompt a otro
                          en cuanto hay muestreo (ADR 0030). Se omite cuando
                          sólo hubo una respuesta, donde no aporta nada. */}
                      {row.evaluatedCount > 1 ? (
                        <span style={{ fontSize: 10.5, color: "var(--ink-4)", flex: "0 0 auto" }}>
                          {row.mentionCount}/{row.evaluatedCount}
                        </span>
                      ) : null}
                      <span
                        className="pr2-rk-cov"
                        style={{ color: row.mentioned ? "var(--pos-ink)" : "var(--ink-4)" }}
                        title={
                          row.coverage === null
                            ? "Ninguna respuesta de este prompt llegó a evaluar esta marca."
                            : `Nombrada en ${row.mentionCount} de ${row.evaluatedCount} ${row.evaluatedCount === 1 ? "respuesta" : "respuestas"}.`
                        }
                      >
                        {/* Sin evaluar no es 0%: un cero es una afirmación
                            sobre una marca que nadie llegó a mirar. */}
                        {row.coverage === null ? "—" : `${row.coverage}%`}
                      </span>
                    </div>
                  ))}
                  {hiddenRankingCount > 0 ? (
                    <button type="button" className="pr2-rk-more" onClick={() => setShowAllRanking(true)}>
                      Ver {hiddenRankingCount} {hiddenRankingCount === 1 ? "marca más sin mención" : "marcas más sin mención"}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Evidencias de la marca, agrupadas por motor. El nombre de la
                  marca va tanto en el título de la sección como delante de
                  cada cita individual — leída suelta, una cita genérica
                  ("especialistas en X, atención personalizada...") no deja
                  claro a qué negocio se refiere, y con varios motores/citas
                  en la misma tarjeta el título solo no basta (founder
                  feedback, 2026-07-31). El corchete es una anotación nuestra,
                  fuera de las comillas — nunca se añade dentro de la cita
                  textual, que sigue siendo exactamente lo verificado contra
                  la respuesta real (MENTION-VERIFY-1). */}
              {evidenceGroups.length > 0 && (
                <div>
                  <p className="ac-title">Evidencias de mención de {projectBrand}</p>
                  <div className="aside-card">
                    {evidenceGroups.map((g) => (
                      <Fragment key={g.row.id}>
                        <div className="pr2-eng-group-h">
                          <span className="ico" style={{ color: g.meta.color }}>
                            <EngineGlyph provider={normalizeProvider(g.row.provider)} />
                          </span>
                          <span className="nm">{g.meta.label}</span>
                          {/* Fase −1c: dice explícitamente si la mención contó
                              a través de un alias, no de "{projectBrand}"
                              literal — el hueco que ADR 0025 dejó documentado
                              sin arreglar ("este panel muestra la cita pero
                              nunca dice que la mención contó porque casó con
                              'Firefox' en vez de con 'Mozilla'"). */}
                          {g.displayNameMatch?.isAlias ? (
                            <span className="badge badge-accent" style={{ fontSize: 10 }}>
                              vía alias «{g.displayNameMatch.matchedName}»
                            </span>
                          ) : null}
                        </div>
                        {g.evidence.length > 0 ? (
                          g.evidence.map((ev, i) => (
                            <p key={i} className="pr2-evi">
                              <strong style={{ fontStyle: "normal" }}>[{projectBrand}]</strong> «{ev}»
                            </p>
                          ))
                        ) : (
                          // Lo que este texto puede afirmar y lo que no: la
                          // mención SÍ está verificada (el nombre aparece de
                          // verdad en la respuesta, MENTION-VERIFY-1), y lo que
                          // falta es la frase que la rodea. Decir «no te
                          // menciona» aquí sería tan falso como enseñar una
                          // cita inventada.
                          // `pr2-evi` y no `pr2-cit-note`: comparte la fila con
                          // las citas de los otros motores, así que va en su
                          // misma celda. Sin cursiva —no es una cita— y en tono
                          // apagado, porque `pr2-cit-note b` pinta en rojo de
                          // error y aquí no ha fallado nada del usuario.
                          <p className="pr2-evi" style={{ fontStyle: "normal", color: "var(--ink-4)" }}>
                            Mención verificada, pero este motor no dejó una cita textual recuperable. La
                            respuesta completa está en «Respuestas», con el nombre resaltado.
                          </p>
                        )}
                      </Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Fuentes usadas, agrupadas por motor. No son necesariamente
                  páginas que citen la marca — son las páginas que la IA usó
                  (búsqueda/grounding) para construir su respuesta. */}
              {citationGroups.length > 0 && (
                <div>
                  <p className="ac-title">
                    Fuentes usadas ({totalCitations}){" "}
                    <InfoTip text="Páginas que la IA usó para construir esta respuesta (búsqueda o grounding) — no implica que hablen de tu marca en concreto. Que una sea tu dominio es lo que cuenta como 'Citada'." />
                  </p>
                  <div className="aside-card">
                    {citationGroups.map((g) => (
                      <Fragment key={g.row.id}>
                        <div className="pr2-eng-group-h">
                          <span className="ico" style={{ color: g.meta.color }}>
                            <EngineGlyph provider={normalizeProvider(g.row.provider)} />
                          </span>
                          <span className="nm">{g.meta.label}</span>
                        </div>
                        {g.citations.map((cite, i) => {
                          const isOwn =
                            isBrandDomain(cite.domain, projectDomain);
                          return (
                            <div key={i} className={`pr2-cit${isOwn ? " own" : ""}`}>
                              <Icon name="globe" size={13} />
                              <span className="pr2-cit-d">{citationDisplayLabel(cite)}</span>
                              {isOwn && <span className="pr2-rk-tag">Tú</span>}
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                    {!hasOwnCitation && (
                      <p className="pr2-cit-note">
                        <b>Ninguna es {projectDomain}</b> — por eso «Citada: No». Publicar contenido que la IA
                        use como fuente es tu palanca aquí.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "respuestas" && (
            <>
              <div className="aside-card">
                <table className="pr2-rtbl">
                  <thead>
                    <tr>
                      <th>Motor</th>
                      <th>Marca</th>
                      <th>Sentimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const meta = getEngineMeta(r.provider);
                      return (
                        <tr key={r.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="pr2-eav" style={{ width: 20, height: 20, color: meta.color }}>
                                <EngineGlyph provider={normalizeProvider(r.provider)} />
                              </span>
                              {meta.label}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${r.brand_mentioned ? "badge-pos" : "badge-neutral"}`}>
                              {r.brand_mentioned ? "Sí" : "No"}
                            </span>
                          </td>
                          <td>
                            {r.brand_mentioned ? (
                              r.sentiment ? (
                                <span className={`badge ${sentimentBadgeClass(r.sentiment)}`}>
                                  {sentimentLabels[r.sentiment] ?? r.sentiment}
                                </span>
                              ) : (
                                <span style={{ color: "var(--ink-4)" }}>—</span>
                              )
                            ) : (
                              // SCREEN-POLISH-1 Fase A: no mention, no brand
                              // sentiment to report.
                              <span className="badge badge-outline">{SENTIMENT_NA_LABEL}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {results.map(
                (r) =>
                  r.raw_response_text && (
                    <div key={r.id} className="resp-full">
                      <div className="eng-head">
                        <span className="pr2-eav" style={{ width: 20, height: 20, color: getEngineMeta(r.provider).color }}>
                          <EngineGlyph provider={normalizeProvider(r.provider)} />
                        </span>
                        <span className="nm">{getEngineMeta(r.provider).label}</span>
                      </div>
                      <div className="body">
                        <FormattedResponse text={r.raw_response_text} brand={projectBrand} />
                      </div>
                    </div>
                  )
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
