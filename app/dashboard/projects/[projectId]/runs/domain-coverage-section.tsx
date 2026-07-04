"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { auditDomainCoverageAction } from "../actions";

/**
 * Coverage-map shapes, defined locally rather than imported from the
 * server-only lib/recommendations/domain-coverage.ts (same reason the
 * recommendations client defines GeneratedSolution locally).
 */
type CoveragePage = { url: string; title: string };
type CoverageTopic = {
  promptId: string;
  topic: string;
  found: boolean;
  pages: CoveragePage[];
  note: string;
};
type CoverageMap = {
  scanId: string;
  generatedAt: string;
  topics: CoverageTopic[];
};

function TopicRow({ topic }: { topic: CoverageTopic }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        {topic.found ? (
          <span className="badge badge-pos">
            <Icon name="check" size={11} />
            Con contenido propio
          </span>
        ) : (
          <span className="badge badge-neutral">Sin cobertura verificada</span>
        )}
        <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>
          {topic.topic}
        </span>
      </div>

      {topic.pages.length > 0 && (
        <ul style={{ fontSize: 12.5, color: "var(--ink-3)", paddingLeft: 16, margin: "0 0 6px" }}>
          {topic.pages.map((page, i) => (
            <li key={i}>
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", overflowWrap: "anywhere" }}
              >
                {page.url}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>
        {topic.note}
        {topic.found && (
          <span style={{ color: "var(--ink-4)" }}> (interpretación de la IA, revísala antes de confiar en ella)</span>
        )}
      </p>
    </div>
  );
}

export function DomainCoverageSection({
  projectId,
  canAuditCoverage
}: {
  projectId: string;
  canAuditCoverage: boolean;
}) {
  const [isPending, startAudit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageMap | null>(null);

  function handleClick() {
    setError(null);
    startAudit(async () => {
      try {
        const result = await auditDomainCoverageAction({ projectId });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setCoverage(result.coverage as CoverageMap);
      } catch {
        setError("No se ha podido auditar la cobertura de tu dominio en este momento. Inténtalo de nuevo en unos minutos.");
      }
    });
  }

  const coveredCount = coverage?.topics.filter((t) => t.found).length ?? 0;
  const totalCount = coverage?.topics.length ?? 0;

  return (
    <div
      className="card"
      style={{ marginTop: 14, padding: "16px 17px", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--surface-sunk)",
            display: "grid",
            placeItems: "center",
            color: "var(--accent)",
            flexShrink: 0
          }}
        >
          <Icon name="search" size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 750, color: "var(--ink)" }}>Cobertura del dominio</span>
            <span className="badge badge-outline" style={{ fontSize: 10 }}>
              Pro
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5 }}>
            Comprueba, tema a tema, si tu propio dominio publica contenido que Google encuentra — para distinguir un
            hueco de contenido de un hueco de citación.
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {canAuditCoverage ? (
            <Button type="button" onClick={handleClick} disabled={isPending}>
              {isPending ? <span className="btn-spinner" /> : <Icon name="search" size={14} />}
              {isPending ? "Auditando…" : "Auditar cobertura"}
            </Button>
          ) : (
            <span className="badge badge-outline">
              <Icon name="search" size={11} />
              Disponible en plan Pro
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="feedback error" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      {coverage && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 650 }}>
            {coveredCount} de {totalCount} {totalCount === 1 ? "tema" : "temas"} con contenido propio detectado
          </div>
          {coverage.topics.map((topic) => (
            <TopicRow key={topic.promptId} topic={topic} />
          ))}
        </div>
      )}
    </div>
  );
}
