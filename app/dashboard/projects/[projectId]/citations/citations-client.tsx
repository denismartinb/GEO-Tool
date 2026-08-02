"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { InfoTip } from "@/components/ui/info-tip";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import { classifySourceType, SOURCE_TYPE_LABEL } from "@/lib/citations/source-type";
import type {
  CitationEngine,
  CitationRow,
  ImpactBreakdown,
  SourceTypeSlice
} from "@/lib/citations/aggregate-citations";

export type { CitationRow };

const CATEGORY_TAB_LABEL: Record<"all" | CitationRow["category"], string> = {
  all: "Todas",
  brand: "Tuyas",
  competitor: "Competidores",
  third_party: "Terceros"
};

// Same idea as the domain-grid favicon fallback (Escaneos page): a
// deterministic color per domain so the list reads at a glance without a
// live favicon fetch (and its broken-image edge cases) for every cited page.
const AVATAR_COLORS = ["#2563EB", "#0d9488", "#d9772b", "#9333a8", "#C0392B", "#6D28D9", "#0B7285", "#C2410C"];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function avatarInitial(row: CitationRow): string {
  const label = (row.domain || row.title || "?").replace(/^www\./, "");
  return label.slice(0, 1).toUpperCase();
}

/** Splits a row into its displayable domain + path, preferring the real
 * per-page URL when we have one (OpenAI) over the bare domain (Gemini,
 * grounding-only — see aggregate-citations.ts's isRealDestinationUrl). */
function pageDisplay(row: CitationRow): { domain: string; path: string } {
  if (row.url) {
    try {
      const u = new URL(row.url);
      const domain = u.hostname.replace(/^www\./, "");
      const path = u.pathname === "/" ? "" : u.pathname;
      return { domain, path };
    } catch {
      // fall through to the domain-only branch below
    }
  }
  return { domain: row.domain || row.title, path: "" };
}

function typeBadge(row: CitationRow): { label: string; className: string } {
  if (row.category === "brand") return { label: "Tuya", className: "ty-own" };
  if (row.category === "competitor") return { label: "Competidor", className: "ty-comp" };
  const type = classifySourceType(row.domain);
  const classByType = {
    community: "ty-com",
    encyclopedia: "ty-enc",
    comparator: "ty-rev",
    media: "ty-med",
    unknown: "ty-unk"
  } as const;
  return { label: SOURCE_TYPE_LABEL[type], className: classByType[type] };
}

function EngineChips({ engines }: { engines: CitationEngine[] }) {
  if (engines.length === 0) return null;
  return (
    <div className="cit2-engs">
      {engines.map((e) => {
        const meta = getEngineMeta(e.provider);
        return (
          <span
            key={e.provider}
            className="cit2-echip"
            style={{ background: meta.color }}
            title={`Citado por ${meta.label}: ${e.cited} ${e.cited === 1 ? "vez" : "veces"}`}
          >
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Shared expand-panel content: which prompts cited this page, and — the real
 * "why was this cited" evidence — the model's actual answer to each one.
 * Used by both tables on this screen (the full list and the opportunities
 * shortlist), so clicking a row behaves identically in either place (founder
 * request, 2026-08-01).
 *
 * Deduped by (provider, text): the same prompt can be answered by two
 * engines with two different responses, and both are genuine evidence —
 * deduping by text alone would silently drop one engine's answer.
 */
function PromptEvidenceList({ prompts }: { prompts: CitationRow["prompts"] }) {
  const unique = Array.from(new Map(prompts.map((p) => [`${p.provider}::${p.text}`, p])).values());

  if (unique.length === 0) {
    return <div className="cit2-detail-empty">Sin prompts asociados.</div>;
  }

  return (
    <>
      <div className="cit2-detail-lbl">Citada al responder estos prompts</div>
      <ul className="cit2-detail-list">
        {unique.map((p, i) => {
          const meta = getEngineMeta(p.provider);
          return (
            <li key={i}>
              <div className="cit2-detail-prompt">
                <span>{p.text}</span>
                <span className="cit2-echip" style={{ background: meta.color }}>
                  {meta.label}
                </span>
              </div>
              {/* What THIS specific answer named — scoped to this one
                  (prompt, provider) result, not the row-level union. Makes a
                  row's "Cita a un competidor" claim checkable against the
                  actual evidence right below it, instead of a row-wide
                  label with no visible source (founder review, 2026-08-01:
                  a claim with no attributable answer read as unsubstantiated).
                  One pill PER name, not one joined-by-commas pill: a single
                  `white-space: nowrap` pill listing five brands ran off the
                  edge of the 320px opportunities rail — genuinely past the
                  viewport, not just visually tight (caught in the ux-pilot's
                  own search-filter evidence, 2026-08-02, a state the earlier
                  row-expand capture happened not to reach). Separate pills
                  wrap via the container's existing `flex-wrap`, which was
                  already built for this shape. */}
              {(p.competitors.length > 0 || p.otherBrands.length > 0) && (
                <div className="cit2-detail-mentions">
                  {p.competitors.map((name, ci) => (
                    <span key={`comp-${ci}`} className="cit2-mtag comp">
                      Menciona a {name}
                    </span>
                  ))}
                  {p.otherBrands.map((name, oi) => (
                    <span key={`oth-${oi}`} className="cit2-mtag oth">
                      Menciona {name} (marca no trackeada)
                    </span>
                  ))}
                </div>
              )}
              {p.rawResponseText && <div className="cit2-detail-evidence">{p.rawResponseText}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function CitationRowItem({ row, open, onToggle }: { row: CitationRow; open: boolean; onToggle: () => void }) {
  const { domain, path } = pageDisplay(row);
  const badge = typeBadge(row);
  // "Otras webs" (ty-unk) is the default bucket for anything not curated in
  // source-type.ts, and in real data it covers almost every third-party row —
  // repeating it on every single line adds noise without adding information;
  // the donut above already tells that aggregate story. Brand/competitor/
  // classified types (community, comparator, media, encyclopedia) stay,
  // since those ARE worth knowing per row (own UX review, 2026-08-02).
  const showBadge = badge.className !== "ty-unk";

  return (
    <div className={`cit2-row${open ? " open" : ""}`}>
      <button type="button" className="cit2-rowmain" onClick={onToggle} aria-expanded={open}>
        <span className="cit2-fav" style={{ background: avatarColor(row.domain || row.title) }}>
          {avatarInitial(row)}
        </span>
        <span className="cit2-urlcell">
          <span className="cit2-u">
            <b>{domain}</b>
            {path}
          </span>
          <span className="cit2-meta">
            {showBadge && <span className={`cit2-tchip ${badge.className}`}>{badge.label}</span>}
            <EngineChips engines={row.engines} />
          </span>
        </span>
        <span className="cit2-cites">
          {row.cited}
          <small>{row.cited === 1 ? "cita" : "citas"}</small>
        </span>
        <span className="cit2-chev" style={open ? undefined : { transform: "rotate(180deg)" }}>
          <Icon name={open ? "chevDown" : "chevronLeft"} size={15} />
        </span>
      </button>
      {open && (
        <div className="cit2-detail">
          <PromptEvidenceList prompts={row.prompts} />
        </div>
      )}
    </div>
  );
}

function ImpactBar({ breakdown, brandLabel }: { breakdown: ImpactBreakdown; brandLabel: string }) {
  // Summed over every bucket present on the object, NOT a hand-written list of
  // keys: the hand-written version silently went stale the moment a sixth
  // bucket (`otherBrands`) was added, and shipped a bar reading "100%" and
  // "267%" over a total that excluded it (caught by the ux-pilot design
  // checklist, 2026-08-01). Adding a bucket must never again require
  // remembering to update a second place.
  const total = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  // Every bucket gets an explicit legend line when it has citations — a
  // dominant bucket (in real scan data, usually "Neutras": third-party
  // pages that mention neither the brand nor a tracked competitor) must
  // never render as an unexplained block of color (found via ux-pilot
  // reviewing a real preview, 2026-08-01: 73% of a project's citations
  // fell in "neutral" and the bar shipped with only 2 of 5 buckets
  // explained).
  // Labels + tooltips reworded 2026-08-01 (founder review): "Terceros que
  // mencionan a un rival y no a ti" and "Terceros que mencionan otras
  // marcas" read as the same bucket at a glance. The distinction is real —
  // one is a TRACKED competitor, the other is any other brand the AI
  // happened to name — but only the tooltip actually explains it; the
  // label alone wasn't carrying that weight.
  const segments: Array<{ key: keyof ImpactBreakdown; className: string; label: string; tooltip: string }> = [
    {
      key: "own",
      className: "s-own",
      label: `Páginas de ${brandLabel}`,
      tooltip: `Páginas de tu propio dominio (${brandLabel}) citadas por la IA.`
    },
    {
      key: "favorable",
      className: "s-fav",
      label: "Terceros que te mencionan",
      tooltip: "La respuesta que citó esta página también mencionó tu marca."
    },
    {
      key: "adverse",
      className: "s-adv",
      label: "Terceros que mencionan a un competidor tuyo",
      tooltip:
        "La respuesta mencionó a uno de los competidores que trackeas, sin mencionar tu marca — distinto de 'otras marcas', que no son competidores que sigas."
    },
    {
      key: "otherBrands",
      className: "s-oth",
      label: "Terceros que mencionan otra marca",
      tooltip:
        "La respuesta mencionó alguna marca que no es la tuya ni uno de tus competidores trackeados — puede ser un competidor real que aún no sigues, u otra empresa sin relación."
    },
    {
      key: "competitor",
      className: "s-comp",
      label: "Páginas de un competidor",
      tooltip: "La propia página citada pertenece al dominio de uno de tus competidores trackeados."
    },
    {
      key: "neutral",
      className: "s-neu",
      label: "Terceros que no mencionan ninguna marca",
      tooltip: "La respuesta que citó esta página no mencionó tu marca ni ninguna otra marca reconocible."
    }
  ];
  const present = segments.filter((s) => breakdown[s.key] > 0);

  return (
    <div className="cit2-block">
      <div className="cit2-blk-t">
        Impacto de {total} {total === 1 ? "cita" : "citas"}
      </div>
      <div className="cit2-split">
        {present.map((s) => (
          <div key={s.key} className={s.className} style={{ flex: pct(breakdown[s.key]) }}>
            {pct(breakdown[s.key]) >= 9 ? `${Math.round(pct(breakdown[s.key]))}%` : ""}
          </div>
        ))}
      </div>
      <div className="cit2-split-key">
        {present.map((s) => (
          <span key={s.key}>
            <i className={s.className} />
            {s.label}
            <InfoTip text={s.tooltip} />
          </span>
        ))}
      </div>
    </div>
  );
}

function SourceDonut({ breakdown }: { breakdown: SourceTypeSlice[] }) {
  const colorClass = (type: SourceTypeSlice["type"]) =>
    type === "own"
      ? "own"
      : type === "competitor"
        ? "comp"
        : type === "community"
          ? "com"
          : type === "comparator"
            ? "rev"
            : type === "media"
              ? "med"
              : type === "encyclopedia"
                ? "enc"
                : "unk";

  // "Otras webs" (unclassified) is deliberately excluded from this chart —
  // founder decision, 2026-08-01: the donut exists to give a read on WHICH
  // recognizable source families cite you, not to account for every last
  // citation. Recomputed as a share of the CLASSIFIED subset (not of all
  // citations), so the wedges always sum to 100% and stay legible even when
  // most of the real domain list is long-tail and unrecognized — an honest
  // relative read, not a claim about the true share of total citations.
  const classified = breakdown.filter((s) => s.type !== "unknown" && s.cited > 0);
  const classifiedTotal = classified.reduce((sum, s) => sum + s.cited, 0);
  if (classifiedTotal === 0) return null;

  const withColorVar = classified
    .map((s) => ({ ...s, colorClass: colorClass(s.type), pct: Math.round((s.cited / classifiedTotal) * 100) }))
    .sort((a, b) => b.cited - a.cited);

  let acc = 0;
  const stops = withColorVar
    .map((s) => {
      const from = acc;
      acc += s.pct;
      return `var(--cit-${s.colorClass}) ${from}% ${acc}%`;
    })
    .join(", ");

  return (
    <div className="cit2-block">
      <div className="cit2-blk-t">Qué tipo de fuente te cita</div>
      <div className="cit2-donut-wrap">
        <div
          className="cit2-donut"
          style={{ background: `conic-gradient(${stops})` }}
          role="img"
          aria-label="Reparto de citas por tipo de fuente, entre las fuentes reconocidas"
        />
        <div className="cit2-donut-key">
          {withColorVar.map((s) => (
            <span key={s.type}>
              <i className={s.colorClass} />
              {s.label} <b>{s.pct}%</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function OpportunitiesBlock({ rows, projectId, brandLabel }: { rows: CitationRow[]; projectId: string; brandLabel: string }) {
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const visible = showAll ? rows : rows.slice(0, 5);

  return (
    <div className="cit2-block cit2-opps">
      {/* The two lists on this screen were reported as indistinguishable
          (founder, 2026-08-01). Both now carry an explicit eyebrow saying
          which subset they show, so "a shortlist of outreach targets" can't
          be mistaken for "the full list of cited pages" below it. */}
      <div className="cit2-blk-eyebrow">Oportunidades · subconjunto</div>
      <div className="cit2-blk-t">
        {rows.length > 0
          ? `${rows.length} ${rows.length === 1 ? "fuente cita" : "fuentes citan"} a un rival y no a ${brandLabel}`
          : "Sin oportunidades pendientes"}
      </div>
      {rows.length === 0 ? (
        <div className="cit2-opps-empty">
          Ninguna fuente de terceros cita a un competidor sin citar también a {brandLabel}.
        </div>
      ) : (
        <>
          <div className="cit2-opps-list">
            {/* Same click-to-expand behavior as the full list below (founder
                request, 2026-08-01): a row here is a real CitationRow, so it
                carries the same prompts/evidence — no reason the two tables
                should behave differently. */}
            {visible.map((row) => {
              const isOpen = open === row.id;
              return (
                <div className={`cit2-opp-item${isOpen ? " open" : ""}`} key={row.id}>
                  <button
                    type="button"
                    className="cit2-opp-row"
                    onClick={() => setOpen((o) => (o === row.id ? null : row.id))}
                    aria-expanded={isOpen}
                  >
                    <span className="cit2-fav sm" style={{ background: avatarColor(row.domain) }}>
                      {avatarInitial(row)}
                    </span>
                    <span className="cit2-opp-body">
                      <span className="cit2-opp-domain">{row.domain}</span>
                      <span className="cit2-opp-why">
                        Cita a <b>{row.competitors.slice(0, 2).join(", ") || "un competidor"}</b> ·{" "}
                        {row.engines.length} {row.engines.length === 1 ? "motor" : "motores"}
                      </span>
                    </span>
                    <span className="cit2-chev" style={isOpen ? undefined : { transform: "rotate(180deg)" }}>
                      <Icon name={isOpen ? "chevDown" : "chevronLeft"} size={14} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="cit2-detail">
                      <PromptEvidenceList prompts={row.prompts} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {rows.length > 5 && (
            <button type="button" className="cit2-btn-mini cit2-btn-block" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Ver menos" : `Ver las ${rows.length}`}
            </button>
          )}
        </>
      )}
      <Link href={`/dashboard/projects/${projectId}/web-audit`} className="cit2-btn-mini cit2-btn-block cit2-opps-audit">
        Abrir Auditoría web
        <Icon name="arrRight" size={13} />
      </Link>
    </div>
  );
}

export function CitationsClient({
  projectId,
  citationRows,
  opportunityRows,
  impactBreakdown,
  sourceTypeBreakdown,
  totalUrls,
  totalCited,
  yours,
  citationRateAnyDomain,
  brandLabel
}: {
  projectId: string;
  citationRows: CitationRow[];
  opportunityRows: CitationRow[];
  impactBreakdown: ImpactBreakdown;
  sourceTypeBreakdown: SourceTypeSlice[];
  totalUrls: number;
  totalCited: number;
  yours: number;
  citationRateAnyDomain: number | null;
  brandLabel: string;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | CitationRow["category"]>("all");
  const [open, setOpen] = useState<string | null>(null);

  const competitorCount = citationRows.filter((r) => r.category === "competitor").length;
  const thirdPartyCount = totalUrls - yours - competitorCount;
  const tabCounts: Record<"all" | CitationRow["category"], number> = {
    all: totalUrls,
    brand: yours,
    competitor: competitorCount,
    third_party: thirdPartyCount
  };

  const filtered = citationRows.filter((r) => {
    if (tab !== "all" && r.category !== tab) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${r.domain} ${r.title} ${r.url}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div className="cit2-scope cit2-page">
      {/* KPI strip — deliberately three metrics, matching the approved
          mockup. An earlier build shipped six here plus a per-engine line;
          the founder cut it back (2026-08-01): "Puntuación de citas" already
          lives on Visión general, "Páginas tuyas citadas" was near-identical
          to "Citas propias" in every real scan, and "Dominios únicos" is
          answered better by the list's own tab counts. */}
      <div className="cit2-kpis">
        <div>
          <div className="cit2-k">
            Respuestas con cita
            <InfoTip text="% de respuestas de motores con búsqueda real (Gemini, ChatGPT) que citaron alguna fuente al responder, sea cual sea el dominio citado." />
          </div>
          <div className="cit2-v blue">
            {citationRateAnyDomain !== null ? Math.round(citationRateAnyDomain) : "—"}
            {citationRateAnyDomain !== null && <small>%</small>}
          </div>
        </div>
        <div>
          <div className="cit2-k">
            Citas totales
            <InfoTip text="Cuántas veces, en total, la IA citó alguna página al responder los prompts escaneados — sumando todas las páginas citadas." />
          </div>
          <div className="cit2-v">{totalCited}</div>
        </div>
        <div>
          <div className="cit2-k">
            Citas propias
            <InfoTip text={`De esas citas totales, cuántas apuntan a una página de ${brandLabel}.`} />
          </div>
          <div className="cit2-v">{impactBreakdown.own}</div>
        </div>
      </div>

      {/* "Citas propias: 0" is the most important number on this screen and,
          on its own, a dead end — it states a problem and offers no next
          step (own UX review, 2026-08-02). This line only appears when the
          count is actually 0, and says nothing the data doesn't support. */}
      {totalCited > 0 && impactBreakdown.own === 0 && (
        <div className="cit2-zero">
          <Icon name="info" size={15} />
          <span>
            Ninguna de las {totalCited} citas apunta a {brandLabel}.{" "}
            {opportunityRows.length > 0 ? (
              <>
                Las <b>{opportunityRows.length} fuentes</b> de «Oportunidades» son terceros que la IA ya
                cita y donde todavía no apareces — es por donde se empieza.
              </>
            ) : (
              <>
                Revisa en <b>Auditoría web</b> si tus páginas son accesibles y citables para los motores
                de IA.
              </>
            )}
          </span>
        </div>
      )}

      {/* Impact split and source-type donut sit side by side from 900px:
          both answer "how are the citations distributed", so as two stacked
          full-width cards they read as competing blocks rather than one
          section (own UX review, 2026-08-02). */}
      <div className="cit2-dist">
        <ImpactBar breakdown={impactBreakdown} brandLabel={brandLabel} />
        <SourceDonut breakdown={sourceTypeBreakdown} />
      </div>

      <div className="cit2-cols">
        <div className="cit2-rail">
          <OpportunitiesBlock rows={opportunityRows} projectId={projectId} brandLabel={brandLabel} />
        </div>
        <div className="cit2-main">
          <div className="cit2-listtitle">
            <div className="cit2-blk-eyebrow">Todas las fuentes · lista completa</div>
            <div className="cit2-blk-t">
              {totalUrls} {totalUrls === 1 ? "página citada" : "páginas citadas"} en los prompts escaneados
            </div>
            {/* The list has always been sorted by citation count, but nothing
                on screen said so — a reader could reasonably assume it was
                chronological or alphabetical. Stated here because the table's
                own header row (`.cit2-listhead`) is `display: none`. */}
            {totalUrls > 1 && <div className="cit2-listhint">De más a menos citada</div>}
          </div>
          <div className="cit2-toolbar">
            <div className="cit2-search">
              <Icon name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar página o dominio…" />
            </div>
            <div className="cit2-tabs">
              {/* A tab whose count is 0 is disabled rather than hidden: the
                  count itself is information worth keeping ("you have no
                  pages of your own here" is the point of this screen), but
                  clicking it only ever led to an empty list — a dead end
                  dressed as a filter. */}
              {(Object.keys(CATEGORY_TAB_LABEL) as Array<"all" | CitationRow["category"]>).map((key) => {
                const empty = tabCounts[key] === 0;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`cit2-tab${tab === key ? " on" : ""}${empty ? " empty" : ""}`}
                    onClick={() => setTab(key)}
                    disabled={empty}
                    title={empty ? "Ninguna página en esta categoría" : undefined}
                  >
                    {CATEGORY_TAB_LABEL[key]} {tabCounts[key]}
                  </button>
                );
              })}
            </div>
          </div>
          {/* The search box narrowed the list silently — no confirmation of
              how many of the 32 rows actually matched (founder review,
              2026-08-02: "Escribes algo y la lista se acorta sin confirmar
              cuántas quedan"). Only shown once a filter is actually active;
              at rest the list title above already states the full count. */}
          {filtered.length !== citationRows.length && (
            <div className="cit2-filtercount">
              {filtered.length} de {citationRows.length} {citationRows.length === 1 ? "página" : "páginas"}
            </div>
          )}

          <div className="cit2-block cit2-list">
            <div className="cit2-listhead">
              <span>Página citada</span>
              <span>Citas</span>
            </div>
            {filtered.map((row) => (
              <CitationRowItem
                key={row.id}
                row={row}
                open={open === row.id}
                onToggle={() => setOpen((o) => (o === row.id ? null : row.id))}
              />
            ))}
            {filtered.length === 0 && <div className="cit2-list-empty">No hay páginas con estos filtros.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
