import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { PromptsClient } from "./prompts-client";

const sentimentLabels: Record<string, string> = {
  positive: "positivo",
  neutral: "neutral",
  negative: "negativo",
  mixed: "mixto",
  unknown: "desconocido"
};

export default async function PromptsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const [{ data: prompts }, { data: latestCompletedRun }] = await Promise.all([
    supabase
      .from("project_prompts")
      .select("id, prompt_text, category, is_active, sort_order")
      .eq("project_id", projectId)
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabase
      .from("scan_runs")
      .select("id, status, created_at, finished_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const { data: promptResults } = latestCompletedRun
    ? await supabase
        .from("scan_prompt_results")
        .select(
          "id, prompt_text_snapshot, raw_response_text, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error"
        )
        .eq("project_id", projectId)
        .eq("run_id", latestCompletedRun.id)
        .order("created_at", { ascending: true })
    : { data: null };

  const activePrompts = prompts?.filter((p) => p.is_active) ?? [];
  const inactivePrompts = prompts?.filter((p) => !p.is_active) ?? [];

  // Metrics from latest run
  const brandMentionedCount =
    promptResults?.filter((r) => r.brand_mentioned).length ?? 0;
  const totalResults = promptResults?.length ?? 0;

  // Sort: brand absent first (most problematic up top)
  const sortedResults = promptResults
    ? [...promptResults].sort((a, b) => {
        if (a.brand_mentioned === b.brand_mentioned) return 0;
        return a.brand_mentioned ? 1 : -1;
      })
    : null;

  const latestRunDate = latestCompletedRun
    ? new Date(
        latestCompletedRun.finished_at ?? latestCompletedRun.created_at
      ).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric"
      })
    : null;

  return (
    <div className="page">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <span className="kicker" style={{ flexShrink: 0 }}>
            Prompts
          </span>
          <span
            style={{
              width: 1,
              height: 14,
              background: "var(--line-strong)",
              flexShrink: 0
            }}
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 650,
              color: "var(--ink-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {project.name}
          </span>
          <span className="badge badge-neutral">{activePrompts.length} activos</span>
          {latestRunDate ? (
            <span className="badge badge-accent">Último escaneo: {latestRunDate}</span>
          ) : (
            <span className="badge badge-neutral">Sin datos</span>
          )}
        </div>
        <div className="ov-sticky-right">
          <Link
            href={`/dashboard/projects/${projectId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12.5,
              fontWeight: 650,
              color: "var(--ink-3)"
            }}
          >
            <Icon name="chevronLeft" size={14} />
            Visión general
          </Link>
        </div>
      </div>

      {/* Executive summary banner */}
      <div className="summary mt8">
        <div className="summary-ico">
          <Icon name="prompts" size={20} />
        </div>
        <div className="summary-txt">
          {!activePrompts.length ? (
            <>
              No hay prompts activos.{" "}
              <b>Añade prompts desde el wizard de onboarding.</b>
            </>
          ) : !latestCompletedRun ? (
            <>
              Tienes <b>{activePrompts.length} prompts</b> configurados.{" "}
              <b>Lanza el primer escaneo para ver resultados.</b>
            </>
          ) : (
            <>
              Monitorizas <b>{activePrompts.length} prompts</b> activos. En el
              último escaneo tu marca apareció en{" "}
              <span
                className={
                  brandMentionedCount === totalResults
                    ? "hl-pos"
                    : brandMentionedCount === 0
                    ? "hl-neg"
                    : ""
                }
              >
                <b>
                  {brandMentionedCount} de {totalResults}
                </b>
              </span>{" "}
              prompts.
            </>
          )}
        </div>
      </div>

      {/* — Empty state: no active prompts — */}
      {!activePrompts.length && (
        <div style={{ marginTop: 32 }}>
          <div className="section-empty">
            <div className="section-empty-title">No hay prompts activos</div>
            <div className="section-empty-desc" style={{ marginTop: 6 }}>
              Añade prompts monitorizados desde el wizard de onboarding antes de lanzar un análisis.
            </div>
            <Link
              href={`/dashboard/projects/new`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginTop: 14,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--accent)"
              }}
            >
              Ir al onboarding
              <Icon name="arrRight" size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* — Empty state: prompts configured but no run — */}
      {activePrompts.length > 0 && !latestCompletedRun && (
        <div style={{ marginTop: 32 }}>
          <div className="section-empty">
            <div className="section-empty-title">Todavía no hay resultados</div>
            <div className="section-empty-desc" style={{ marginTop: 6 }}>
              Los resultados por prompt aparecerán después de lanzar el primer escaneo con Gemini.
            </div>
            <Link
              href={`/dashboard/projects/${projectId}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginTop: 14,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--accent)"
              }}
            >
              Volver a visión general para lanzar el escaneo
              <Icon name="arrRight" size={14} />
            </Link>
          </div>

          {/* List configured prompts as chips */}
          <div className="section-head" style={{ marginTop: 28 }}>
            <span className="section-title">Prompts configurados</span>
            <span className="section-desc">{activePrompts.length} activos</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {activePrompts.map((p) => (
              <span
                key={p.id}
                className="badge badge-neutral"
                style={{ fontSize: 12.5, padding: "5px 10px", borderRadius: 8 }}
              >
                {p.prompt_text.length > 80
                  ? p.prompt_text.slice(0, 80) + "…"
                  : p.prompt_text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* — Run completed but no results — */}
      {activePrompts.length > 0 && latestCompletedRun && !sortedResults?.length && (
        <div style={{ marginTop: 32 }}>
          <div className="section-empty">
            <div className="section-empty-title">
              No se encontraron resultados para este escaneo
            </div>
            <div className="section-empty-desc" style={{ marginTop: 6 }}>
              El escaneo está completado, pero no hay respuestas disponibles. Revisa el detalle técnico del run.
            </div>
            <Link
              href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginTop: 14,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--accent)"
              }}
            >
              Ver detalle técnico del escaneo
              <Icon name="arrRight" size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* — Main results table — */}
      {activePrompts.length > 0 && latestCompletedRun && sortedResults && sortedResults.length > 0 && (
        <>
          <div className="section-head">
            <span className="section-title">Prompts monitorizados</span>
            <span className="section-desc">· ordenados por visibilidad</span>
          </div>

          {/* Interactive table + drawer — client component */}
          <PromptsClient
            results={sortedResults.map((r) => {
              const extracted =
                r.extracted_json && typeof r.extracted_json === "object"
                  ? (r.extracted_json as {
                      brand?: { mentioned?: boolean; evidence?: string[] };
                      competitors?: Array<{
                        name?: string;
                        mentioned?: boolean;
                        evidence?: string[];
                      }>;
                      citations?: Array<{
                        url?: string;
                        domain?: string;
                        label?: string;
                        evidence?: string;
                      }>;
                      sentiment?: string;
                      summary?: string;
                      confidence?: string;
                    })
                  : null;
              return {
                id: r.id,
                prompt_text_snapshot: r.prompt_text_snapshot,
                raw_response_text: r.raw_response_text,
                brand_mentioned: r.brand_mentioned,
                citation_found: r.citation_found,
                mentioned_competitors_count: r.mentioned_competitors_count,
                citations_count: r.citations_count,
                sentiment: r.sentiment,
                extracted_json: r.extracted_json,
                extraction_error: r.extraction_error,
                confidence: extracted?.confidence ?? null,
                sentiment_label:
                  sentimentLabels[r.sentiment ?? ""] ?? r.sentiment ?? "—"
              };
            })}
          />
        </>
      )}

      {/* Inactive prompts note */}
      {inactivePrompts.length > 0 && (
        <p
          style={{
            marginTop: 24,
            fontSize: 12,
            color: "var(--ink-4)",
            fontWeight: 500
          }}
        >
          {inactivePrompts.length}{" "}
          {inactivePrompts.length === 1
            ? "prompt inactivo permanece"
            : "prompts inactivos permanecen"}{" "}
          fuera de los próximos escaneos.
        </p>
      )}
    </div>
  );
}
