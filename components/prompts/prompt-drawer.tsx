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
import { matchDisplayName } from "@/lib/brand-aliases/match-display-name";
// Same brand-domain matching the Citations page and run-scoring use, so
// "Citada" here can never disagree with own_citation_share / citation_score
// over what counts as the brand's own domain (BRAND-DOMAIN-1).
import { isBrandDomain } from "@/lib/domains/brand-domain";
import {
  mentionLine,
  ownCitationLine,
  sourceFrequency,
  summarizeEngines,
} from "@/components/prompts/engine-summary";

type Competitor = {
  id: string;
  name: string;
  domain: string;
};

/**
 * GS-04 (log §277): the hint under "La IA (no) menciona tu marca" used to be
 * one fixed sentence, "La IA te nombra por lo que ya sabe de tu marca", shown
 * even when the brand was NOT named. It also claimed where the model's
 * knowledge came from, which nothing here measures. It now only restates
 * what the answers show.
 */
export function mentionHint(hasResults: boolean, mentioned: boolean, cited: boolean): string {
  if (!hasResults) return "Esta pregunta todavía no tiene respuestas escaneadas.";
  if (!mentioned) return "Ninguna respuesta a esta pregunta nombra tu marca.";
  return cited
    ? "Te nombra y, además, usa tu web como fuente."
    : "Te nombra en la respuesta, aunque sin citar tu web.";
}

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
const SENTIMENT_NA_LABEL = "Sin sentimiento";

function sentimentBadgeClass(s: string | null | undefined): string {
  if (s === "positive") return "badge-pos";
  if (s === "negative") return "badge-neg";
  return "badge-neutral";
}

type Tab = "resumen" | "respuestas";

/** Sources shown per engine before «Ver N fuentes más». */
const SOURCES_PER_ENGINE = 4;

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
  // Engines whose full source list was asked for ("Ver N fuentes más").
  const [openSources, setOpenSources] = useState<ReadonlySet<string>>(() => new Set());
  // Respuestas tab: which engine and which of its answers is on screen.
  const [respEngine, setRespEngine] = useState(0);
  const [respIndex, setRespIndex] = useState(0);

  if (!results.length) return null;

  const extractedList = results.map((r) => parseExtracted(r.extracted_json));

  const brandMentioned = results.some((r) => r.brand_mentioned);
  const brandEvidence = Array.from(
    new Set(extractedList.flatMap((e) => e?.brand?.evidence ?? []))
  );

  // PROMPT-DRAWER-ENGINES-1 (log §279): one block per ENGINE, not per answer.
  // With sampling (ADR 0030) a prompt can hold five answers per engine, and
  // listing each one as its own row repeated "Gemini · muestra 1 de 5" fifteen
  // times (founder, 2026-10-11). Counts per engine live in engine-summary.ts.
  const engines = summarizeEngines(results, extractedList, projectDomain);
  const rowById = new Map(results.map((r, i) => [r.id, { row: r, ext: extractedList[i] }]));
  const answersPerEngine = new Set(engines.map((e) => e.answers));
  const sameAnswerCount = answersPerEngine.size === 1 ? engines[0].answers : null;

  // Evidence grouped per engine and de-duplicated: five answers of the same
  // engine often quote the very same sentence.
  const evidenceGroups = engines
    .map((e) => {
      const entries = e.rowIds.map((id) => rowById.get(id)!);
      const evidence = Array.from(new Set(entries.flatMap(({ ext }) => ext?.brand?.evidence ?? [])));
      // PROMPT-DRAWER-TRUTH-1: se lee de `extracted_json`, no de la columna
      // `brand_mentioned`. Las dos coinciden cuando la extracción funcionó, pero
      // en una fila cuya extracción falló la columna conserva el valor ingenuo
      // del momento de generar (una subcadena en `prompt-job.ts`) y no hay
      // ninguna verificación detrás — decir «mención verificada» de eso sería
      // afirmar algo que nadie comprobó (MENTION-VERIFY-1, docs/adr/0021).
      const verifiedMention = entries.some(({ ext }) => Boolean(ext?.brand?.mentioned));
      // Fase −1c (docs/geo-score-variability-2026-08.md §3): WHICH of the
      // brand's known names this mention actually matched — the tracked brand
      // string, or one of its aliases. Computed over each row's OWN snapshot
      // (frozen at scan time, ADR 0025), never over the project's current
      // brand_aliases. The first alias match of the engine is the one shown.
      const aliasMatch =
        entries
          .map(({ row, ext }) =>
            matchDisplayName(
              ext?.brand?.display_name_found,
              row.brand_snapshot ?? projectBrand,
              row.brand_aliases_snapshot ?? []
            )
          )
          .find((m) => m?.isAlias) ?? null;
      return { provider: e.provider, meta: getEngineMeta(e.provider), evidence, verifiedMention, aliasMatch };
    })
    /**
     * PROMPT-DRAWER-TRUTH-1 (log §147): un motor entra en el panel si aporta
     * citas **o** si su mención está verificada y no las trae. Antes sólo
     * entraba con citas, y una mención verificada sin cita utilizable hacía
     * desaparecer la sección entera debajo de un «La IA menciona tu marca».
     */
    .filter((g) => g.evidence.length > 0 || g.verifiedMention);

  const hasAnySource = engines.some((e) => e.sources.length > 0);
  const hasOwnCitation = engines.some((e) => e.ownCited > 0);

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

  // Respuestas tab: clamp the selection, since the rows can change under an
  // open drawer (a new scan lands) and leave an index past the end.
  const engineIdx = Math.min(respEngine, engines.length - 1);
  const currentEngine = engines[engineIdx];
  const answerIdx = Math.min(respIndex, currentEngine.answers - 1);
  const current = rowById.get(currentEngine.rowIds[answerIdx]) ?? null;
  const currentCitations = current?.ext?.citations ?? [];
  const currentCitesOwn = currentCitations.some((c) => isBrandDomain(c.domain, projectDomain));
  const currentSources = new Set(
    currentCitations.map((c) => (c.domain ?? c.title ?? c.url ?? "").toLowerCase()).filter(Boolean)
  ).size;

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
                  <div className="hint">{mentionHint(results.length > 0, brandMentioned, hasOwnCitation)}</div>
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

              {/* Por motor: one row per engine (PROMPT-DRAWER-ENGINES-1, log §279).
                  The per-answer detail lives only in «Respuestas». */}
              <div>
                <div className="pr2-rk-head">
                  <p className="ac-title">Por motor</p>
                  {sameAnswerCount !== null && sameAnswerCount > 1 ? (
                    <span className="pr2-eng-sub">Cada motor respondió {sameAnswerCount} veces en este escaneo</span>
                  ) : null}
                </div>
                <div className="aside-card">
                  {engines.map((e) => {
                    const meta = getEngineMeta(e.provider);
                    return (
                      <div key={e.provider} className="pr2-erow">
                        <span className="pr2-eav" style={{ color: meta.color }}>
                          <EngineGlyph provider={e.provider} />
                        </span>
                        <span className="pr2-erow-name">
                          {meta.label}
                          <small>{mentionLine(e)}</small>
                        </span>
                        <span className="pr2-erow-stats">
                          {e.mentioned > 0 ? (
                            e.sentiment ? (
                              <span className={`badge ${sentimentBadgeClass(e.sentiment)}`}>
                                {sentimentLabels[e.sentiment] ?? e.sentiment}
                              </span>
                            ) : null
                          ) : (
                            // SCREEN-POLISH-1 Fase A: no brand mention from this
                            // engine → no brand sentiment to report.
                            <span className="badge badge-outline">{SENTIMENT_NA_LABEL}</span>
                          )}
                          <span className={`badge ${e.ownCited > 0 ? "badge-accent" : "badge-neutral"}`}>
                            {ownCitationLine(e)}
                          </span>
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
                      <Fragment key={g.provider}>
                        <div className="pr2-eng-group-h">
                          <span className="ico" style={{ color: g.meta.color }}>
                            <EngineGlyph provider={g.provider} />
                          </span>
                          <span className="nm">{g.meta.label}</span>
                          {/* Fase −1c: dice explícitamente si la mención contó
                              a través de un alias, no de "{projectBrand}"
                              literal (ADR 0025). */}
                          {g.aliasMatch ? (
                            <span className="badge badge-accent" style={{ fontSize: 10 }}>
                              vía alias «{g.aliasMatch.matchedName}»
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
                          // La mención SÍ está verificada (MENTION-VERIFY-1); lo
                          // que falta es la frase que la rodea. Decir «no te
                          // menciona» aquí sería tan falso como enseñar una
                          // cita inventada. Tono apagado: no ha fallado nada
                          // del usuario.
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
              {hasAnySource && (
                <div>
                  <div className="pr2-rk-head">
                    <p className="ac-title">
                      Fuentes usadas{" "}
                      <InfoTip text="Páginas que la IA usó para construir sus respuestas (búsqueda o grounding) — no implica que hablen de tu marca en concreto. Que una sea tu dominio es lo que cuenta como 'Citada'." />
                    </p>
                    <span className="pr2-eng-sub">Sin repetir, por motor</span>
                  </div>
                  <div className="aside-card">
                    {engines.map((e) => {
                      const meta = getEngineMeta(e.provider);
                      const open = openSources.has(e.provider);
                      const shown = open ? e.sources : e.sources.slice(0, SOURCES_PER_ENGINE);
                      const hidden = e.sources.length - shown.length;
                      return (
                        <Fragment key={e.provider}>
                          <div className="pr2-eng-group-h">
                            <span className="ico" style={{ color: meta.color }}>
                              <EngineGlyph provider={e.provider} />
                            </span>
                            <span className="nm">{meta.label}</span>
                          </div>
                          {e.sources.length === 0 ? (
                            <p className="pr2-cit-none">Respondió sin buscar en la web.</p>
                          ) : (
                            shown.map((src) => {
                              const freq = sourceFrequency(src.answers, e.answers);
                              return (
                                <div
                                  key={citationDisplayLabel(src.citation)}
                                  className={`pr2-cit${src.isOwn ? " own" : ""}`}
                                >
                                  <Icon name="globe" size={13} />
                                  <span className="pr2-cit-d">{citationDisplayLabel(src.citation)}</span>
                                  {src.isOwn && <span className="pr2-rk-tag">Tú</span>}
                                  {freq ? <span className="pr2-cit-f">{freq}</span> : null}
                                </div>
                              );
                            })
                          )}
                          {hidden > 0 ? (
                            <button
                              type="button"
                              className="pr2-rk-more"
                              onClick={() => setOpenSources((prev) => new Set(prev).add(e.provider))}
                            >
                              Ver {hidden} {hidden === 1 ? "fuente más" : "fuentes más"} de {meta.label}
                            </button>
                          ) : null}
                        </Fragment>
                      );
                    })}
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

          {tab === "respuestas" && current && (
            <>
              {/* PROMPT-DRAWER-ENGINES-1 (log §279): one answer at a time,
                  chosen by engine and answer, instead of a table plus every
                  full text one after another. */}
              {engines.length > 1 ? (
                <div className="pr2-seg" role="group" aria-label="Motor">
                  {engines.map((e, i) => (
                    <button
                      key={e.provider}
                      type="button"
                      className={i === engineIdx ? "on" : undefined}
                      aria-pressed={i === engineIdx}
                      onClick={() => {
                        setRespEngine(i);
                        setRespIndex(0);
                      }}
                    >
                      <span style={{ color: getEngineMeta(e.provider).color, display: "inline-grid", width: 14, height: 14 }}>
                        <EngineGlyph provider={e.provider} />
                      </span>
                      {getEngineMeta(e.provider).label}
                    </button>
                  ))}
                </div>
              ) : null}
              {currentEngine.answers > 1 ? (
                <div className="pr2-chips" role="group" aria-label="Respuesta">
                  {currentEngine.rowIds.map((id, k) => (
                    <button
                      key={id}
                      type="button"
                      className={`pr2-chip${k === answerIdx ? " on" : ""}`}
                      aria-pressed={k === answerIdx}
                      onClick={() => setRespIndex(k)}
                    >
                      Respuesta {k + 1}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="resp-full">
                <div className="eng-head pr2-resp-meta">
                  <span className="pr2-eav" style={{ width: 20, height: 20, color: getEngineMeta(current.row.provider).color }}>
                    <EngineGlyph provider={normalizeProvider(current.row.provider)} />
                  </span>
                  <span className="nm">{getEngineMeta(current.row.provider).label}</span>
                  <span className={`badge ${current.row.brand_mentioned ? "badge-pos" : "badge-neutral"}`}>
                    {current.row.brand_mentioned ? "Te nombra" : "No te nombra"}
                  </span>
                  {current.row.brand_mentioned && current.row.sentiment ? (
                    <span className={`badge ${sentimentBadgeClass(current.row.sentiment)}`}>
                      {sentimentLabels[current.row.sentiment] ?? current.row.sentiment}
                    </span>
                  ) : null}
                  {currentCitesOwn ? <span className="badge badge-accent">Cita tu web</span> : null}
                  <span className="pr2-resp-src">
                    {currentSources === 0
                      ? "Sin fuentes"
                      : `${currentSources} ${currentSources === 1 ? "fuente" : "fuentes"}`}
                  </span>
                </div>
                <div className="body">
                  {current.row.raw_response_text ? (
                    <FormattedResponse text={current.row.raw_response_text} brand={projectBrand} />
                  ) : (
                    <p style={{ color: "var(--ink-4)" }}>El texto de esta respuesta no se guardó.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
