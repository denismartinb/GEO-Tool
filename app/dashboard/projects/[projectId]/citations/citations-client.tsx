"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { InfoTip } from "@/components/ui/info-tip";

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

export type PromptCitation = {
  title: string;
  url: string;
  domain: string;
  category: CitationRow["category"];
  cited: number;
};

export type PromptGroup = {
  id: string;
  promptText: string;
  topic: string | null;
  brandMentioned: boolean;
  citations: PromptCitation[];
  citedUrls: number;
  totalCites: number;
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
  citationScore,
  brandLabel
}: {
  promptGroups: PromptGroup[];
  totalUrls: number;
  totalCited: number;
  yours: number;
  opportunities: number;
  citationScore: number | null;
  brandLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
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
          GenScore encontró <b>{totalUrls}</b> {totalUrls === 1 ? "URL distinta" : "URLs distintas"}{" "}
          citadas por la IA al responder tus prompts (<b>{totalCited}</b>{" "}
          {totalCited === 1 ? "cita" : "citas"} en total).
          {totalUrls > 0 && (
            <>
              {" "}
              {yours === 0 ? (
                <>
                  <span className="hl-neg">Ninguna es tuya</span> — todas refuerzan a competidores
                  o a otras fuentes.
                </>
              ) : yours === totalUrls ? (
                <>
                  <span className="hl-pos">Todas son tuyas</span>: dominas las fuentes que la IA
                  usa para responder.
                </>
              ) : (
                <>
                  Solo <span className="hl-neg">{yours} {yours === 1 ? "es tuya" : "son tuyas"}</span>;
                  {" "}el resto refuerzan a competidores o a otras fuentes.
                </>
              )}
            </>
          )}
          {citationScore !== null && (
            <> Tu puntuación de citas es <b>{citationScore}/100</b>.</>
          )}
          {opportunities > 0 && (
            <>
              {" "}Hay <b>{opportunities} {opportunities === 1 ? "fuente" : "fuentes"}</b> que citan a
              un rival y no a {brandLabel}: tu lista de contactos para empezar a aparecer.
            </>
          )}
        </div>
      </div>

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
