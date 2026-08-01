"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import { classifySourceType, SOURCE_TYPE_LABEL } from "@/lib/citations/source-type";
import type {
  CitationEngine,
  CitationRow,
  EngineTotal,
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

function CitationRowItem({ row, open, onToggle }: { row: CitationRow; open: boolean; onToggle: () => void }) {
  const { domain, path } = pageDisplay(row);
  const badge = typeBadge(row);
  const uniquePrompts = Array.from(new Map(row.prompts.map((p) => [p.text, p])).values());

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
            <span className={`cit2-tchip ${badge.className}`}>{badge.label}</span>
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
          {uniquePrompts.length > 0 ? (
            <>
              <div className="cit2-detail-lbl">Citada al responder estos prompts</div>
              <ul className="cit2-detail-list">
                {uniquePrompts.map((p, i) => (
                  <li key={i}>{p.text}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="cit2-detail-empty">Sin prompts asociados.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ImpactBar({ breakdown }: { breakdown: ImpactBreakdown }) {
  const total = breakdown.own + breakdown.favorable + breakdown.adverse + breakdown.competitor + breakdown.neutral;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const segments: Array<{ key: keyof ImpactBreakdown; className: string }> = [
    { key: "own", className: "s-own" },
    { key: "favorable", className: "s-fav" },
    { key: "adverse", className: "s-adv" },
    { key: "competitor", className: "s-comp" },
    { key: "neutral", className: "s-neu" }
  ];

  return (
    <div className="cit2-block">
      <div className="cit2-blk-t">
        Impacto de {total} {total === 1 ? "cita" : "citas"}
      </div>
      <div className="cit2-split">
        {segments.map(
          (s) =>
            breakdown[s.key] > 0 && (
              <div key={s.key} className={s.className} style={{ flex: pct(breakdown[s.key]) }}>
                {pct(breakdown[s.key]) >= 9 ? `${Math.round(pct(breakdown[s.key]))}%` : ""}
              </div>
            )
        )}
      </div>
      <div className="cit2-split-key">
        <span>
          <i className="fav" />
          Terceros que te mencionan
        </span>
        <span>
          <i className="adv" />
          Terceros que mencionan a un rival y no a ti
        </span>
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

  let acc = 0;
  const withColorVar = breakdown
    .filter((s) => s.pct > 0)
    .map((s) => ({ ...s, colorClass: colorClass(s.type) }));
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
          aria-label="Reparto de citas por tipo de fuente"
        />
        <div className="cit2-donut-key">
          {withColorVar
            .filter((s) => s.cited > 0)
            .map((s) => (
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
  const visible = showAll ? rows : rows.slice(0, 5);

  return (
    <div className="cit2-block cit2-opps">
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
            {visible.map((row) => (
              <div className="cit2-opp-row" key={row.id}>
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
              </div>
            ))}
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
  uniqueDomains,
  yours,
  engineTotals,
  citationScore,
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
  uniqueDomains: number;
  yours: number;
  engineTotals: EngineTotal[];
  citationScore: number | null;
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
      {/* KPI strip */}
      <div className="cit2-kpis">
        <div>
          <div className="cit2-k">Respuestas con cita</div>
          <div className="cit2-v blue">
            {citationRateAnyDomain !== null ? Math.round(citationRateAnyDomain) : "—"}
            {citationRateAnyDomain !== null && <small>%</small>}
          </div>
        </div>
        <div>
          <div className="cit2-k">Citas totales</div>
          <div className="cit2-v">{totalCited}</div>
        </div>
        <div>
          <div className="cit2-k">Citas propias</div>
          <div className="cit2-v">{impactBreakdown.own}</div>
        </div>
        <div>
          <div className="cit2-k">Páginas tuyas citadas</div>
          <div className="cit2-v">{yours}</div>
        </div>
        <div>
          <div className="cit2-k">Dominios únicos</div>
          <div className="cit2-v">{uniqueDomains}</div>
        </div>
        <div>
          <div className="cit2-k">Puntuación de citas</div>
          <div className="cit2-v">
            {citationScore !== null ? Math.round(citationScore) : "—"}
            {citationScore !== null && <small>/100</small>}
          </div>
        </div>
      </div>

      {engineTotals.length > 0 && (
        <div className="cit2-engtotals">
          {engineTotals.map((e) => {
            const meta = getEngineMeta(e.provider);
            return (
              <span key={e.provider}>
                <i style={{ background: meta.color }} />
                {meta.label} citó {e.domains} {e.domains === 1 ? "fuente" : "fuentes"}
              </span>
            );
          })}
        </div>
      )}

      <ImpactBar breakdown={impactBreakdown} />
      <SourceDonut breakdown={sourceTypeBreakdown} />

      <div className="cit2-cols">
        <div className="cit2-rail">
          <OpportunitiesBlock rows={opportunityRows} projectId={projectId} brandLabel={brandLabel} />
        </div>
        <div className="cit2-main">
          <div className="cit2-toolbar">
            <div className="cit2-search">
              <Icon name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar página o dominio…" />
            </div>
            <div className="cit2-tabs">
              {(Object.keys(CATEGORY_TAB_LABEL) as Array<"all" | CitationRow["category"]>).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`cit2-tab${tab === key ? " on" : ""}`}
                  onClick={() => setTab(key)}
                >
                  {CATEGORY_TAB_LABEL[key]} {tabCounts[key]}
                </button>
              ))}
            </div>
          </div>

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
