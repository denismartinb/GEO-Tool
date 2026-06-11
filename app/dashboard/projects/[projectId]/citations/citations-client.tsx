"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

export type CitationRow = {
  id: string;
  title: string;
  url: string;
  domain: string;
  category: "brand" | "competitor" | "third_party";
  brandMentioned: "yes" | "no" | "na";
  competitors: string[];
  cited: number;
  prompts: Array<{ text: string; brandMentioned: boolean }>;
};

const CATEGORY_LABEL: Record<CitationRow["category"], string> = {
  brand: "Tu marca",
  competitor: "Competidor",
  third_party: "Otra fuente"
};

const CATEGORY_BADGE: Record<CitationRow["category"], string> = {
  brand: "badge badge-accent",
  competitor: "badge badge-neg",
  third_party: "badge badge-neutral"
};

function BrandMentioned({ value }: { value: CitationRow["brandMentioned"] }) {
  if (value === "yes") {
    return (
      <span className="badge badge-pos">
        <Icon name="check" size={11} />
        Sí
      </span>
    );
  }
  if (value === "no") {
    return (
      <span className="badge badge-neg">
        <Icon name="info" size={11} />
        No
      </span>
    );
  }
  return <span style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600 }}>N/A</span>;
}

function CitationCard({
  row,
  open,
  onToggle
}: {
  row: CitationRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`cit-card${open ? " open" : ""}`}>
      <div className="cit-row" onClick={onToggle}>
        <div className="cit-urlcell">
          <button type="button" className="cit-exp" aria-label={open ? "Contraer" : "Expandir"}>
            {open ? (
              <Icon name="chevDown" size={15} />
            ) : (
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
                <Icon name="chevronLeft" size={15} />
              </span>
            )}
          </button>
          <div style={{ minWidth: 0 }}>
            <div className="cit-title">{row.title}</div>
            <div className="cit-url">
              <Icon name="link" size={11} />
              {row.url}
            </div>
          </div>
        </div>
        <div className="c">
          <BrandMentioned value={row.brandMentioned} />
        </div>
        <div className="cit-comps">
          {row.competitors.length ? (
            row.competitors.map((name) => (
              <span key={name} className="badge badge-outline" style={{ fontSize: 11 }}>
                {name}
              </span>
            ))
          ) : (
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>—</span>
          )}
        </div>
        <div>
          <span className={CATEGORY_BADGE[row.category]}>{CATEGORY_LABEL[row.category]}</span>
        </div>
        <div className="num">
          <span className="tnum" style={{ fontWeight: 800, fontSize: 15 }}>
            {row.cited}
          </span>
        </div>
      </div>
      {open && (
        <div className="cit-detail">
          <div className="cit-detail-head">
            <span>Prompt</span>
            <span className="c">Tu marca en la respuesta</span>
          </div>
          {row.prompts.map((p, i) => (
            <div className="cit-prow" key={i}>
              <div className="cit-pq">
                <Icon name="search" size={13} />
                {p.text}
              </div>
              <div className="c">
                {p.brandMentioned ? (
                  <span className="badge badge-pos">
                    <Icon name="check" size={11} />
                    Sí
                  </span>
                ) : (
                  <span className="badge badge-neg">
                    <Icon name="info" size={11} />
                    No
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CitationsClient({
  rows,
  totalUrls,
  totalCited,
  yours,
  opportunities,
  citationScore,
  brandLabel
}: {
  rows: CitationRow[];
  totalUrls: number;
  totalCited: number;
  yours: number;
  opportunities: number;
  citationScore: number | null;
  brandLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [guide, setGuide] = useState(true);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<"all" | CitationRow["category"]>("all");

  const filtered = rows.filter((r) => {
    if (catFilter !== "all" && r.category !== catFilter) return false;
    if (q) {
      const needle = q.toLowerCase();
      if (!r.title.toLowerCase().includes(needle) && !r.url.toLowerCase().includes(needle)) {
        return false;
      }
    }
    return true;
  });

  return (
    <>
      {/* Summary banner */}
      <div className="summary mt8" style={{ alignItems: "center" }}>
        <div className="summary-ico">
          <Icon name="cite" size={20} />
        </div>
        <div className="summary-txt" style={{ flex: 1 }}>
          La IA cita <b>{totalUrls}</b> {totalUrls === 1 ? "URL" : "URLs"} al responder tus
          prompts, con <b>{totalCited}</b> {totalCited === 1 ? "cita" : "citas"} en total.
          {totalUrls > 0 && (
            <>
              {" "}
              Solo <span className="hl-neg">{yours} {yours === 1 ? "es tuya" : "son tuyas"}</span>
              {" "}— el resto alimentan a competidores o terceros.
            </>
          )}
          {citationScore !== null && (
            <> Puntuación de citas del último escaneo: <b>{citationScore}</b>.</>
          )}
        </div>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setGuide((g) => !g)}>
          <Icon name="sparkles" size={14} />
          {guide ? "Ocultar guía" : "Cómo usar esto"}
        </button>
      </div>

      {/* Guide */}
      {guide && (
        <div className="cit-guide fade-in">
          <div className="cit-guide-head">
            <div className="cit-guide-ico">
              <Icon name="sparkles" size={17} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="cit-guide-t">De páginas citadas a más visibilidad en IA</div>
              <div className="cit-guide-d">
                Las fuentes que cita la IA son tu hoja de ruta de contenido y enlaces. Tienes{" "}
                <b>{opportunities} {opportunities === 1 ? "oportunidad" : "oportunidades"}</b>{" "}
                donde la IA cita una fuente y {brandLabel} no aparece en esa respuesta.
              </div>
            </div>
            <button
              type="button"
              className="cit-guide-x"
              onClick={() => setGuide(false)}
              title="Ocultar"
            >
              <Icon name="info" size={15} />
            </button>
          </div>
          <div className="cit-tactics">
            <div className="cit-tactic">
              <div className="ct-num">
                <Icon name="competitors" size={15} />
              </div>
              <div>
                <div className="ct-t">Consigue menciones donde ya citan a tus rivales</div>
                <div className="ct-d">
                  Las fuentes que citan a competidores y no a ti son tu lista de outreach:
                  contacta para aparecer también en su contenido.
                </div>
              </div>
            </div>
            <div className="cit-tactic">
              <div className="ct-num">
                <Icon name="prompts" size={15} />
              </div>
              <div>
                <div className="ct-t">Crea contenido para los prompts que no cubres</div>
                <div className="ct-d">
                  Si una fuente externa responde a un prompt donde no apareces, crea una página
                  equivalente — mejor estructurada y citable — para esa intención.
                </div>
              </div>
            </div>
            <div className="cit-tactic">
              <div className="ct-num">
                <Icon name="link" size={15} />
              </div>
              <div>
                <div className="ct-t">Refuerza tus propias páginas citadas</div>
                <div className="ct-d">
                  Las URLs de tu marca ya funcionan: amplíalas con datos y FAQ claros para que la
                  IA las cite en más prompts.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="pr-toolbar" style={{ marginTop: 16 }}>
        <div className="pr-search">
          <Icon name="search" size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por dominio o URL…"
          />
        </div>
        <select
          className="cit-select"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value as typeof catFilter)}
        >
          <option value="all">Todas las categorías</option>
          <option value="brand">Tu marca</option>
          <option value="competitor">Competidor</option>
          <option value="third_party">Otras fuentes</option>
        </select>
        <div style={{ marginLeft: "auto" }} />
        <span style={{ fontSize: 12.5, color: "var(--ink-4)", fontWeight: 600 }}>
          {filtered.length} {filtered.length === 1 ? "URL" : "URLs"}
        </span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="cit-head">
          <span>URL</span>
          <span className="c">Marca mencionada</span>
          <span>Competidores</span>
          <span>Categoría</span>
          <span className="num">Citas</span>
        </div>
        {filtered.map((row) => (
          <CitationCard
            key={row.id}
            row={row}
            open={open === row.id}
            onToggle={() => setOpen((o) => (o === row.id ? null : row.id))}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 36, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
            No hay URLs con estos filtros.
          </div>
        )}
      </div>
    </>
  );
}
