"use client";

import React, { useMemo, useState } from "react";
import { PromptDrawer } from "@/components/prompts/prompt-drawer";
import { Icon } from "@/components/ui/icon";
import { Gauge } from "@/components/ui/gauge";
import { EngineGlyph } from "@/components/ui/engine-glyph";
import { getEngineMeta, normalizeProvider } from "@/lib/scan/engine-meta";
import { AddPromptsButton } from "./add-prompts-button";
import type { ResultRow, TopicGroup } from "./page";

type Competitor = {
  id: string;
  name: string;
  domain: string;
};

type PromptsClientProps = {
  projectId: string;
  projectDomain: string;
  projectBrand: string;
  results: ResultRow[];
  hasTopics: boolean;
  topicGroups: TopicGroup[];
  competitors: Competitor[];
  totalPrompts: number;
  scannedPrompts: number;
  totalTopics: number;
  addPromptsDisabled: boolean;
  addPromptsDisabledReason?: string;
};

type ExtractedCompetitor = { name?: string; mentioned?: boolean };
type ExtractedJsonShape = { competitors?: ExtractedCompetitor[] };

type PromptGroup = {
  key: string;
  promptText: string | null;
  engines: ResultRow[];
  brandMentioned: boolean;
  citationsTotal: number;
  competitorsCount: number;
  sentimentDominant: string | null;
};

function sentimentLabel(s: string | null): string {
  const map: Record<string, string> = {
    positive: "Positivo",
    neutral: "Neutral",
    negative: "Negativo",
    mixed: "Mixto",
    // Founder decision: extraction's "unknown" reads as "Neutral" in the UI
    // instead of leaking the raw English value.
    unknown: "Neutral",
  };
  return s ? (map[s] ?? s) : "—";
}

function sentimentBadgeClass(s: string | null): string {
  if (s === "positive") return "badge-pos";
  if (s === "negative") return "badge-neg";
  return "badge-neutral";
}

// Space-efficient icon paired with the sentiment badge text (founder request:
// text alone is easy to skim past; a glyph makes positive/neutral/negative/
// mixed readable at a glance without adding a second text badge).
function sentimentIconName(s: string | null): string {
  if (s === "positive") return "sentimentPos";
  if (s === "negative") return "sentimentNeg";
  if (s === "mixed") return "sentimentMixed";
  return "sentimentNeutral";
}

function parseExtracted(raw: unknown): ExtractedJsonShape {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJsonShape;
}

// Mirrors the sentiment-mode aggregation already used server-side for topic
// groups (page.tsx) — same logic, applied across an individual prompt's
// per-engine rows instead of a whole category's rows.
function dominantSentiment(rows: ResultRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.sentiment) continue;
    counts.set(r.sentiment, (counts.get(r.sentiment) ?? 0) + 1);
  }
  let dominant: string | null = null;
  let topCount = 0;
  for (const [sentiment, count] of counts) {
    if (count > topCount) {
      topCount = count;
      dominant = sentiment;
    }
  }
  return dominant;
}

// Union (not sum) across engines: the same competitor mentioned by both
// Gemini and Claude must count once, not twice.
function mentionedCompetitorsUnion(rows: ResultRow[]): number {
  const names = new Set<string>();
  for (const r of rows) {
    const ext = parseExtracted(r.extracted_json);
    for (const c of ext.competitors ?? []) {
      if (c.mentioned && c.name) names.add(c.name.trim().toLowerCase());
    }
  }
  return names.size;
}

// Only engines that actually mentioned the brand get a chip here (Task
// Intake 2026-07-31: the old per-engine mention dot read as a stray
// notification badge, and the row already leads with the "Mencionada" /
// "Ausente" badge for the overall prompt — so the gap/absent states don't
// need their own chip). Citation-per-engine is intentionally not shown here;
// that signal is being surfaced in Recommendations instead.
function EngineChipsWithGaps({
  engines,
  allProviders,
}: {
  engines: ResultRow[];
  allProviders: string[];
}) {
  // Aggregated per engine, not last-row-wins. Since SAMPLING-1 (ADR 0027) a
  // run can hold several samples of the same (prompt, engine), so building a
  // Map keyed by provider would keep whichever sample happened to come last
  // and show a mention chip decided by row order — with 2 samples where
  // Gemini named the brand once, the chip was a coin flip. "This engine
  // named the brand in at least one of its answers" is both stable and the
  // same rule the row's own `brandMentioned` already uses across engines.
  const mentioningProviders = new Set(
    engines.filter((r) => r.brand_mentioned).map((r) => normalizeProvider(r.provider))
  );
  const mentioning = allProviders.filter((p) => mentioningProviders.has(p));
  // Fragment, not a wrapper div: `.pr2-prow-engs` is itself the flex
  // container, and an inner flex box would trap the pills in a non-wrapping
  // line. Rendering nothing when no engine mentioned the brand also lets
  // `.pr2-prow-engs:empty` collapse the row's stacked gap on mobile.
  return (
    <>
      {mentioning.map((p) => {
        const meta = getEngineMeta(p);
        return (
          <span key={p} className="pr2-eng" style={{ color: meta.color }} title={`${meta.label}: marca mencionada`}>
            <EngineGlyph provider={p} />
            <span className="pr2-eng-nm">{meta.label}</span>
          </span>
        );
      })}
    </>
  );
}

// Multi-engine execution means a prompt can have up to one
// scan_prompt_results row per active engine (Gemini, Claude). Group them
// back into one row per prompt for list display; the full per-engine array
// is still passed to the drawer for drill-down.
function groupByPrompt(rows: ResultRow[]): PromptGroup[] {
  const order: string[] = [];
  const groups = new Map<string, ResultRow[]>();
  for (const r of rows) {
    const key = r.prompt_id ?? r.id;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }
  return order.map((key) => {
    const engines = groups.get(key)!;
    return {
      key,
      promptText: engines[0].prompt_text_snapshot,
      engines,
      brandMentioned: engines.some((r) => r.brand_mentioned),
      citationsTotal: engines.reduce((sum, r) => sum + (r.citations_count ?? 0), 0),
      competitorsCount: mentionedCompetitorsUnion(engines),
      sentimentDominant: dominantSentiment(engines),
    };
  });
}

function matchesQuery(text: string | null, query: string): boolean {
  if (!query) return true;
  return (text ?? "").toLowerCase().includes(query.toLowerCase());
}

function PromptRow({
  group,
  indent,
  allProviders,
  onClick,
}: {
  group: PromptGroup;
  indent: boolean;
  allProviders: string[];
  onClick: () => void;
}) {
  return (
    <div className="pr2-prow" style={indent ? { paddingLeft: 34 } : undefined} onClick={onClick}>
      <div className="pr2-prow-main">
        <div className="pr2-prow-text">{group.promptText ?? "—"}</div>
        <div className="pr2-prow-tags">
          <span className={`badge ${group.brandMentioned ? "badge-pos" : "badge-neg"}`}>
            {group.brandMentioned ? "Mencionada" : "Ausente"}
          </span>
          <span className={`badge ${sentimentBadgeClass(group.sentimentDominant)}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name={sentimentIconName(group.sentimentDominant)} size={12} />
            {sentimentLabel(group.sentimentDominant)}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
            {group.competitorsCount} competidores · {group.citationsTotal} citas
          </span>
        </div>
      </div>
      <div className="pr2-prow-engs">
        <EngineChipsWithGaps engines={group.engines} allProviders={allProviders} />
      </div>
    </div>
  );
}

export function PromptsClient({
  projectId,
  projectDomain,
  projectBrand,
  results,
  hasTopics,
  topicGroups,
  competitors,
  totalPrompts,
  scannedPrompts,
  totalTopics,
  addPromptsDisabled,
  addPromptsDisabledReason,
}: PromptsClientProps) {
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");

  const selectedEngineResults =
    selectedPromptId !== null
      ? results.filter((r) => (r.prompt_id ?? r.id) === selectedPromptId)
      : [];

  // Every provider that appears anywhere in this run — the candidate pool
  // EngineChipsWithGaps filters down to only the engines that mentioned the
  // brand on that specific prompt.
  const allProviders = useMemo(
    () => Array.from(new Set(results.map((r) => normalizeProvider(r.provider)))).sort(),
    [results]
  );

  const flatGroups = groupByPrompt(results).sort((a, b) => {
    if (a.brandMentioned === b.brandMentioned) return 0;
    return a.brandMentioned ? 1 : -1;
  });

  // Header insight: how many scanned prompts actually name the brand, and which
  // topics carry / drag the brand's visibility. Derived from the same data
  // already rendered in the table — no extra fetch.
  const scannedGroups = flatGroups.length;
  const brandPresent = flatGroups.filter((g) => g.brandMentioned).length;
  const brandAbsent = scannedGroups - brandPresent;
  const presentPct = scannedGroups > 0 ? Math.round((brandPresent / scannedGroups) * 100) : 0;
  const rankedTopics = [...topicGroups].sort((a, b) => b.visibilidad - a.visibilidad);
  const bestTopic = rankedTopics[0] ?? null;
  const worstTopic = rankedTopics.length > 1 ? rankedTopics[rankedTopics.length - 1] : null;

  const filteredTopicGroups = hasTopics
    ? topicGroups
        .map((g) => ({
          ...g,
          results: g.results.filter(
            (r) => matchesQuery(r.prompt_text_snapshot, query) || matchesQuery(g.category, query)
          ),
        }))
        .filter((g) => g.results.length > 0 || matchesQuery(g.category, query))
    : [];

  const filteredFlatGroups = flatGroups.filter((g) => matchesQuery(g.promptText, query));

  function toggleTopic(cat: string) {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  const addButton = (
    <AddPromptsButton
      projectId={projectId}
      disabled={addPromptsDisabled}
      disabledReason={addPromptsDisabledReason}
    />
  );

  return (
    <div className="pr2-scope pr2-page">
      {/* Insight banner */}
      <div className="pr2-insight">
        <div className="pr2-insight-ico">
          <Icon name="sparkles" size={16} />
        </div>
        <p className="pr2-insight-txt">
          GenScore monitoriza <b>{totalPrompts} {totalPrompts === 1 ? "prompt" : "prompts"}</b>
          {hasTopics ? <> en <b>{totalTopics} topics</b></> : null}.{" "}
          {scannedGroups > 0 ? (
            <>
              Tu marca aparece en <b>{brandPresent} de {scannedGroups}</b> ({presentPct}%)
              {scannedPrompts < totalPrompts ? " escaneados" : ""}.
              {hasTopics && bestTopic && worstTopic && bestTopic.category !== worstTopic.category ? (
                <>
                  {" "}Fuerte en <b>«{bestTopic.category}»</b> ({bestTopic.visibilidad}%), floja en{" "}
                  <b>«{worstTopic.category}»</b> ({worstTopic.visibilidad}%).
                </>
              ) : null}
            </>
          ) : (
            "Aún no hay resultados de escaneo para estos prompts."
          )}
        </p>
      </div>

      {/* Toolbar: search + add prompts, below the desktop rail breakpoint.
          At ≥1200px this whole row hides — both controls move into the
          list card's own header (.pr2-listhead below) so the page doesn't
          spend a whole row on them once there's room to fold it into the
          list header instead (founder: more compact). No filter tabs for
          category/engine — Prompts has no such filter today, so we don't
          render controls that look interactive but do nothing. */}
      <div className="pr2-toolbar">
        <label className="pr2-search pr2-search-toolbar">
          <Icon name="search" size={14} />
          <input
            type="text"
            placeholder="Buscar prompt…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar prompt"
          />
        </label>
        <span className="pr2-add-toolbar">{addButton}</span>
      </div>

      <div className="pr2-cols">
        {/* Proportion summary — static, real data already computed above.
            Rendered before .pr2-main so mobile/tablet keeps its original
            document order (split card above the list); the ≥1200px grid
            below places it in its own 360px column via explicit
            grid-column, independent of DOM order. */}
        {scannedGroups > 0 && (
          <div className="pr2-rail">
            <div className="card pr2-split">
              <div className="pr2-split-top">
                <span>Visibilidad del conjunto</span>
                <b>{presentPct}%</b>
              </div>
              <div className="pr2-split-bar">
                <i style={{ width: `${presentPct}%`, background: "var(--brand-pos)" }} />
                <i style={{ width: `${100 - presentPct}%`, background: "var(--brand-neg)" }} />
              </div>
              <div className="pr2-split-legend">
                <span><span className="d" style={{ background: "var(--brand-pos)" }} />{brandPresent} con visibilidad</span>
                <span><span className="d" style={{ background: "var(--brand-neg)" }} />{brandAbsent} sin visibilidad</span>
              </div>
            </div>
          </div>
        )}

        <div className="pr2-main">
          {/* Modo flat sin topics */}
          {!hasTopics && (
            <>
              <div
                style={{
                  border: "1.5px dashed var(--line-strong)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 13,
                  color: "var(--ink-3)",
                  marginTop: 16,
                }}
              >
                Tus prompts no tienen topics asignados todavía. Cuando GenScore genere
                topics automáticamente, aparecerán agrupados aquí.
              </div>

              <div className="pr2-listhead">
                <span className="pr2-sec-lbl">Prompts</span>
                <div className="pr2-listhead-actions">
                  <label className="pr2-search pr2-search-listhead">
                    <Icon name="search" size={14} />
                    <input
                      type="text"
                      placeholder="Buscar prompt…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Buscar prompt"
                    />
                  </label>
                  <span className="pr2-add-listhead">{addButton}</span>
                </div>
              </div>
              <div className="card">
                {filteredFlatGroups.length === 0 ? (
                  <p style={{ padding: 16, fontSize: 13, color: "var(--ink-4)" }}>
                    Ningún prompt coincide con «{query}».
                  </p>
                ) : (
                  filteredFlatGroups.map((g) => (
                    <PromptRow
                      key={g.key}
                      group={g}
                      indent={false}
                      allProviders={allProviders}
                      onClick={() => setSelectedPromptId(g.key)}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {/* Modo Topics — acordeón: anillo de visibilidad real (Gauge) por
              topic, prompts desplegables al pulsar. */}
          {hasTopics && (
            <>
              <div className="pr2-listhead">
                <span className="pr2-sec-lbl">Topics</span>
                <div className="pr2-listhead-actions">
                  <label className="pr2-search pr2-search-listhead">
                    <Icon name="search" size={14} />
                    <input
                      type="text"
                      placeholder="Buscar prompt…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Buscar prompt"
                    />
                  </label>
                  <span className="pr2-add-listhead">{addButton}</span>
                </div>
              </div>
              <div className="card">
                {filteredTopicGroups.length === 0 ? (
                  <p style={{ padding: 16, fontSize: 13, color: "var(--ink-4)" }}>
                    Ningún topic o prompt coincide con «{query}».
                  </p>
                ) : (
                  filteredTopicGroups.map((group) => {
                    const isOpen = expandedTopics.has(group.category) || query.trim().length > 0;
                    const promptsInTopic = groupByPrompt(group.results);
                    return (
                      <React.Fragment key={`topic-${group.category}`}>
                        <div
                          className={`pr2-trow${isOpen ? " open" : ""}`}
                          onClick={() => toggleTopic(group.category)}
                        >
                          <div className="pr2-ring">
                            <Gauge value={group.visibilidad} size={46} stroke={6} label="" />
                          </div>
                          <div className="pr2-trow-main">
                            <div className="pr2-trow-title">
                              <span className={`pr2-chev${isOpen ? " down" : ""}`}>
                                <Icon name="chevRight" size={15} />
                              </span>
                              {group.category}
                            </div>
                            <div className="pr2-trow-meta">
                              {/* Deduped prompt count, not the raw per-engine row
                                  count (a prompt answered by 2 engines has 2 rows
                                  in group.results but is still 1 prompt). */}
                              {promptsInTopic.length} {promptsInTopic.length === 1 ? "prompt" : "prompts"}
                              <span className="pr2-trow-sep" />
                              <span className={`badge ${sentimentBadgeClass(group.sentimentDominant)}`} style={{ fontSize: 10.5, padding: "1px 7px" }}>
                                {sentimentLabel(group.sentimentDominant)}
                              </span>
                            </div>
                          </div>
                          <div className="pr2-trow-mentions">
                            <div className="v">{group.menciones}</div>
                            <div className="k">menciones</div>
                          </div>
                        </div>
                        {isOpen &&
                          promptsInTopic.map((g) => (
                            <PromptRow
                              key={g.key}
                              group={g}
                              indent
                              allProviders={allProviders}
                              onClick={() => setSelectedPromptId(g.key)}
                            />
                          ))}
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <PromptDrawer
        projectId={projectId}
        projectDomain={projectDomain}
        projectBrand={projectBrand}
        results={selectedEngineResults}
        competitors={competitors}
        onClose={() => setSelectedPromptId(null)}
      />
    </div>
  );
}
