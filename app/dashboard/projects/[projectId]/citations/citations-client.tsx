"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { InfoTip } from "@/components/ui/info-tip";
import type { CitationRow, PromptCitation, PromptGroup } from "@/lib/citations/aggregate-citations";

export type { CitationRow, PromptCitation, PromptGroup };

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

function BrandMentioned({ value }: { value: boolean }) {
  if (value) {
    return (
      <span className="badge badge-pos">
        <Icon name="check" size={11} />
        Sí
      </span>
    );
  }
  return (
    <span className="badge badge-neg">
      <Icon name="info" size={11} />
      No
    </span>
  );
}

function PromptGroupCard({
  group,
  open,
  onToggle
}: {
  group: PromptGroup;
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
            <div className="cit-title">{group.promptText}</div>
            <div className="cit-url" style={{ gap: 6 }}>
              <Icon name="layers" size={11} />
              {group.topic ?? "Sin topic asignado"}
            </div>
          </div>
        </div>
        <div className="c">
          <BrandMentioned value={group.brandMentioned} />
        </div>
        <div>
          {group.citedUrls > 0 ? (
            <span style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600 }}>
              {group.citedUrls} {group.citedUrls === 1 ? "URL" : "URLs"}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Sin citas</span>
          )}
        </div>
        <div className="num">
          <span className="tnum" style={{ fontWeight: 800, fontSize: 15 }}>
            {group.totalCites}
          </span>
        </div>
      </div>
      {open && (
        <div className="cit-detail">
          {group.citations.length > 0 ? (
            <>
              <div className="cit-detail-head">
                <span>URL</span>
                <span>Categoría</span>
                <span className="num">Citas</span>
              </div>
              {group.citations.map((c, i) => (
                <div className="cit-prow" key={i}>
                  <div className="cit-pq" style={{ minWidth: 0 }}>
                    <Icon name="link" size={13} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {c.title}
                      {c.url && c.url !== c.title && (
                        <span style={{ color: "var(--ink-4)", marginLeft: 6 }}>{c.url}</span>
                      )}
                    </span>
                  </div>
                  <span className={CATEGORY_BADGE[c.category]}>{CATEGORY_LABEL[c.category]}</span>
                  <span className="num tnum" style={{ fontWeight: 700 }}>
                    {c.cited}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ padding: "14px 4px", color: "var(--ink-4)", fontSize: 12.5 }}>
              La IA no citó ninguna fuente al responder este prompt.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CitationsClient({
  promptGroups,
  totalUrls,
  totalCited,
  yours,
  opportunities,
  opportunityRows,
  citationScore,
  brandLabel,
  projectId
}: {
  promptGroups: PromptGroup[];
  totalUrls: number;
  totalCited: number;
  yours: number;
  opportunities: number;
  opportunityRows: CitationRow[];
  citationScore: number | null;
  brandLabel: string;
  projectId: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const [q, setQ] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");

  const topics = Array.from(new Set(promptGroups.map((g) => g.topic).filter((t): t is string => Boolean(t))));

  const filtered = promptGroups.filter((g) => {
    if (topicFilter !== "all" && g.topic !== topicFilter) return false;
    if (q) {
      const needle = q.toLowerCase();
      const matchesPrompt = g.promptText.toLowerCase().includes(needle);
      const matchesCitation = g.citations.some(
        (c) => c.title.toLowerCase().includes(needle) || c.domain.toLowerCase().includes(needle)
      );
      if (!matchesPrompt && !matchesCitation) return false;
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
          La IA citó <b>{totalUrls}</b> {totalUrls === 1 ? "URL distinta" : "URLs distintas"} al
          responder tus prompts, con <b>{totalCited}</b> {totalCited === 1 ? "cita" : "citas"} en
          total.
          {totalUrls > 0 && (
            <>
              {" "}
              {yours === 0 ? (
                <>
                  <span className="hl-neg">Ninguna es tuya</span> — todas alimentan a competidores
                  o a otras fuentes.
                </>
              ) : yours === totalUrls ? (
                <>
                  <span className="hl-pos">Todas son tuyas</span> — buen dominio de tus propias
                  páginas en las respuestas.
                </>
              ) : (
                <>
                  Solo <span className="hl-neg">{yours} {yours === 1 ? "es tuya" : "son tuyas"}</span>
                  {" "}— el resto alimentan a competidores o a otras fuentes.
                </>
              )}
            </>
          )}
          {citationScore !== null && (
            <> Tu puntuación de citas en el último escaneo es <b>{citationScore}/100</b>.</>
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
              <div style={{ minWidth: 0 }}>
                <div className="ct-t">Consigue menciones donde ya citan a tus rivales</div>
                {opportunityRows.length > 0 ? (
                  <>
                    <div className="ct-d">
                      Estas fuentes citan a un competidor y no a {brandLabel} — tu lista de
                      outreach:
                    </div>
                    <ul className="cit-opp-list">
                      {opportunityRows.map((r) => (
                        <li key={r.id} className="cit-opp-item">
                          <span className="cit-opp-domain">{r.domain}</span>
                          <span className="cit-opp-meta">
                            {r.cited} {r.cited === 1 ? "cita" : "citas"}
                            {r.competitors.length > 0 && <> · cita a {r.competitors.join(", ")}</>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="ct-d">
                    En este escaneo no hay fuentes que citen a un competidor sin mencionar a{" "}
                    {brandLabel}.
                  </div>
                )}
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
          {/* Links these tactics to the real, evidence-backed action plans the
              recommendation engine already generates for this exact gap
              (pursue_citation_sources, add_citation_block…) instead of leaving
              the tactics as generic unlinked advice
              (docs/ux-qa-audit-2026-07.md, finding 5). */}
          <div style={{ marginTop: 16 }}>
            <Link
              href={`/dashboard/projects/${projectId}/recommendations`}
              className="btn btn-soft btn-sm"
              style={{ display: "inline-flex" }}
            >
              <Icon name="sparkles" size={14} />
              Ver el plan de acción para estas fuentes
              <Icon name="arrRight" size={13} />
            </Link>
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
            placeholder="Buscar por prompt, dominio o URL…"
          />
        </div>
        <select
          className="cit-select"
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
        >
          <option value="all">Todos los topics</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: "auto" }} />
        <span style={{ fontSize: 12.5, color: "var(--ink-4)", fontWeight: 600 }}>
          {filtered.length} {filtered.length === 1 ? "prompt" : "prompts"}
        </span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="cit-head">
          <span>Prompt</span>
          <span className="c" style={{ display: "inline-flex", alignItems: "center" }}>
            Marca mencionada
            <InfoTip text="Que la IA nombre tu marca no depende de tus URLs citadas — puede venir solo de lo que el modelo ya sabe de ella. Las columnas de citas, a la derecha, son la señal que sí depende de contenido tuyo que la IA usó como fuente." />
          </span>
          <span>URLs citadas</span>
          <span className="num">Citas</span>
        </div>
        {filtered.map((group) => (
          <PromptGroupCard
            key={group.id}
            group={group}
            open={open === group.id}
            onToggle={() => setOpen((o) => (o === group.id ? null : group.id))}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 36, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
            No hay prompts con estos filtros.
          </div>
        )}
      </div>
    </>
  );
}
