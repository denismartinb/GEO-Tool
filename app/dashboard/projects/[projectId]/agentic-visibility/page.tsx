import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { readAgenticAudits } from "@/lib/agentic-audit/console-audit";
import { firstSteps, projectedSentence } from "@/lib/agentic-audit/console-model";
import { loadPurchaseQuestions } from "@/lib/agentic-audit/purchase-data";
import { agentPath } from "@/lib/agentic-audit/visibility-model";
import { isProOrAbove, resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import { requireActiveProject } from "@/lib/project-workspace";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { AgenticTabs } from "../_components/agentic-tabs";
import { ScoreGauge } from "../agentic-audit/_components/agentic-audit-screen";
import { PurchaseQuestionsCard } from "./_components/purchase-questions-card";

/**
 * «Visibilidad en agentes»: AGENTIC-COMMERCE-1 Fase 2d (log §330), design in
 * docs/design-reference/agentic-commerce-1/fase-2d.html. The agentic review
 * (Fase 2a) summed up as the path an agent takes, plus «Preguntas de compra»
 * from the latest scan. Reads only: the review itself runs on «Auditoría
 * agéntica» and after each scan. No LLM, no migration of its own.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Visibilidad en agentes", async () => (await requireActiveProject(projectId)).domain);
}

const MARK: Record<string, string> = { ok: "✓", warn: "!", bad: "✕", na: "i", neutral: "1" };

export default async function AgenticVisibilityPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  const [{ data: profile }, audits, purchase] = await Promise.all([
    supabase.from("profiles").select(SYSTEM_PLAN_COLUMNS).eq("id", user.id).maybeSingle(),
    readAgenticAudits(supabase, projectId, user.id),
    loadPurchaseQuestions(supabase, project)
  ]);
  const canRun = isProOrAbove(resolveSystemPlanId(profile as Parameters<typeof resolveSystemPlanId>[0]));
  const result = audits.available ? (audits.latest?.result ?? null) : null;
  const report = purchase.state === "ready" ? purchase.report : null;
  const steps = result ? firstSteps(result) : [];
  const projected = result ? projectedSentence(result, steps) : null;
  const auditHref = `/dashboard/projects/${projectId}/agentic-audit`;

  return (
    <div className="page">
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Visibilidad en agentes</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                {project.name}
              </span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                {project.domain}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="ag-page">
        <div className="ag-screen">
          <AgenticTabs projectId={projectId} current="visibility" />
          <p className="ag-intro">
            Si un agente de IA puede encontrarte, entrar, entender lo que vendes, fiarse y llegar a comprar o reservar.
          </p>

          {!canRun ? (
            <div className="card ag-upsell">
              <h3>Visibilidad en agentes está en Pro y Agencia</h3>
              <p>
                Mira si la IA te nombra cuando alguien va a comprar, o si le manda a un marketplace, junto a lo que ve un
                agente en tu web.
              </p>
              <Link className="btn btn-primary" href="/dashboard/settings?openPlan=pro#plan">
                Pasar a Pro
              </Link>
            </div>
          ) : (
            <>
              <div className="card">
                {result && result.score !== null ? (
                  <div className="ag-score">
                    <ScoreGauge score={result.score} />
                    <div className="ag-score-what">
                      <b>Visibilidad agéntica: {result.score} de 100</b>
                      {projected ? <span>{projected}</span> : null}
                    </div>
                  </div>
                ) : (
                  <p className="ag-muted">
                    {!result
                      ? "La auditoría agéntica revisa tu web sola tras cada escaneo. Cuando esté, verás aquí tu nota."
                      : result.found === "none"
                        ? "No hemos encontrado qué vendes en tu web, así que no hay nota todavía. Preguntas de compra sí se ve, porque sale de tus escaneos."
                        : "La nota se calcula sobre la página donde vendes algo. Elige una en la auditoría."}
                  </p>
                )}
                <Link className="ag-link" href={auditHref}>
                  Ver la auditoría
                </Link>
              </div>

              <div className="card">
                <h2 className="ag-h">El camino de un agente por tu web</h2>
                <ol className="ag-path">
                  {agentPath(result, report).map((step) => (
                    <li key={step.id}>
                      <span className="ag-path-head">
                        <span className={`ag-mk is-${step.tone}`} aria-hidden="true">
                          {MARK[step.tone]}
                        </span>
                        <b>{step.title}</b>
                      </span>
                      <span>{step.line}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {report ? (
                <PurchaseQuestionsCard projectId={projectId} report={report} />
              ) : (
                <div className="card">
                  <h2 className="ag-h">Preguntas de compra</h2>
                  <p className="ag-muted">Saldrán de tu primer escaneo, cuando termine.</p>
                </div>
              )}

              {steps.length > 0 ? (
                <div className="card">
                  <h2 className="ag-h">Qué hacer primero</h2>
                  {steps.map((step) => (
                    <div className="ag-fix" key={step.key}>
                      <b>{step.title}</b>
                      <span>{step.seen}</span>
                    </div>
                  ))}
                  <Link className="ag-link" href={auditHref}>
                    Ver la auditoría completa
                  </Link>
                </div>
              ) : null}

              <p className="ag-muted">
                Preguntas de compra sale de tu último escaneo y no entra en la Visibilidad agéntica ni en la Puntuación GEO.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
