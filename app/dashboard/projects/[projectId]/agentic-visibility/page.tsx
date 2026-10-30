import type { Metadata } from "next";
import Link from "next/link";
import { VisibilityCluster, type ClusterBand, type ClusterDial, type ClusterLight } from "@/components/ins/agents/visibility-cluster";
import { Ic } from "@/components/ins/ic";
import { Motion } from "@/components/ins/kit/motion";
import type { AgenticCheckResult, AgenticComponentId } from "@/lib/agentic-audit/api-contract";
import { readAgenticAudits } from "@/lib/agentic-audit/console-audit";
import { componentLine, componentStatus, firstSteps, type Tone } from "@/lib/agentic-audit/console-model";
import { loadPurchaseQuestions } from "@/lib/agentic-audit/purchase-data";
import { fixbarLine, interopLine, stepTone, visibilityHeadline } from "@/lib/agentic-audit/visibility-model";
import { requireUser } from "@/lib/auth";
import { isProOrAbove, resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import { requireActiveProject } from "@/lib/project-workspace";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { PurchaseQuestionsCard } from "./_components/purchase-questions-card";

/**
 * «Visibilidad en agentes»: AGENTIC-COMMERCE-1 Fase 2d (log §332), rebuilt on
 * the «Instrumento» prototype (`i-src/screens/agents.js`, log §370): the
 * cluster of dials and warning lights, «Preguntas de compra» and «Qué hacer
 * primero». «Auditoría agéntica» is the technical screen, with its own menu
 * entry. Reads only; no LLM, no migration of its own.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Visibilidad en agentes", async () => (await requireActiveProject(projectId)).domain);
}

const BAND: Record<Tone, ClusterBand> = { ok: "ok", warn: "mid", bad: "bad", na: "na" };
const BAND_WORD: Record<ClusterBand, string> = { ok: "Bien", mid: "Mejorable", bad: "Se frena", na: "Sin medir" };
const CARD_ORDER: AgenticComponentId[] = ["discovery", "understanding", "trust", "purchase"];
const LIGHT_ICON: Record<AgenticComponentId | "interop", string> = {
  discovery: "c-globe",
  understanding: "eye",
  trust: "shield",
  purchase: "cart",
  interop: "link"
};

/** Dials and warning lights of the cluster, all from the stored review. */
function clusterParts(result: AgenticCheckResult) {
  const dials: ClusterDial[] = [];
  const lights: ClusterLight[] = [];
  for (const id of CARD_ORDER) {
    const component = result.components.find((c) => c.id === id);
    if (!component) continue;
    const band = BAND[componentStatus(component, result).tone];
    dials.push({
      id,
      name: component.name,
      value: component.score,
      band,
      label: component.score === null ? BAND_WORD.na : `${component.score} de 100, ${BAND_WORD[band]}`
    });
    lights.push({ id, icon: LIGHT_ICON[id], band, title: component.name, line: componentLine(result, component) });
  }
  const interop = interopLine(result);
  lights.push({ id: "interop", icon: LIGHT_ICON.interop, band: BAND[interop.tone], title: "Interoperabilidad", line: interop.line });
  return { dials, lights };
}

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
  const latest = audits.available ? audits.latest : null;
  const result = latest?.result ?? null;
  const report = purchase.state === "ready" ? purchase.report : null;
  const steps = result ? firstSteps(result) : [];
  const fixbar = result ? fixbarLine(result, steps.slice(0, 2)) : null;
  const auditHref = `/dashboard/projects/${projectId}/agentic-audit`;
  const head = (
    <>
      <div className="eyebrow bare">
        Comercio agéntico · <span className="mono" style={{ letterSpacing: 0, textTransform: "none" }}>{project.domain}</span>
      </div>
      <h1 style={{ marginTop: 14 }}>Visibilidad en agentes</h1>
      <p className="lead">Si un agente de IA puede encontrarte, entrar, entender lo que vendes, fiarse y llegar a comprar.</p>
    </>
  );

  const parts = result && result.score !== null ? clusterParts(result) : null;

  return (
    <div className="ins">
      <Motion id={`agentic-visibility:${projectId}`}>
        <div className="page sc-ag">
          {head}

          {!canRun ? (
            <div className="card agx-up">
              <div className="card-b">
                <span className="ic">
                  <Ic n="agent" />
                </span>
                <div>
                  <h2>Visibilidad en agentes está en Pro y Agencia</h2>
                  <p>
                    Mira si la IA te nombra cuando alguien va a comprar, o si le manda a un marketplace, junto a lo que ve un
                    agente en tu web.
                  </p>
                  <Link className="btn ink" href="/dashboard/settings?openPlan=pro#plan">
                    <Ic n="arrowup" sm />
                    Pasar a Pro
                  </Link>
                </div>
              </div>
            </div>
          ) : result && result.found === "none" ? (
            <div className="card agx-none">
              <div className="card-b">
                <span className="ic">
                  <Ic n="cart" />
                </span>
                <h2>No hemos encontrado qué vendes en tu web</h2>
                <p>Buscamos en tu catálogo, tu sitemap y tu portada. Lo volvemos a buscar en cada visita.</p>
                <Link className="btn line" href={auditHref}>
                  Elegir una página
                  <Ic n="arrowr" sm />
                </Link>
              </div>
            </div>
          ) : (
            <>
              {result && parts && result.score !== null ? (
                <VisibilityCluster
                  score={result.score}
                  target={fixbar ? fixbar.to : null}
                  dials={parts.dials}
                  lights={parts.lights}
                  headline={visibilityHeadline(result)}
                  note={
                    fixbar ? (
                      <>
                        Si arreglas {fixbar.what} de «Qué hacer primero», subes de <b>{fixbar.from}</b> a <b>{fixbar.to}</b>.
                      </>
                    ) : (
                      "El detalle de cada comprobación está en la auditoría."
                    )
                  }
                  auditHref={auditHref}
                />
              ) : (
                <section className="sec">
                  <div className="card">
                    <div className="card-b">
                      <h2 style={{ fontSize: 20, fontWeight: 400 }}>{visibilityHeadline(result)}</h2>
                      {result ? <p className="lead">La nota se calcula sobre una página donde vendes algo.</p> : null}
                      <Link className="btn line" href={auditHref} style={{ marginTop: 16 }}>
                        Ver la auditoría
                        <Ic n="arrowr" sm />
                      </Link>
                    </div>
                  </div>
                </section>
              )}

              <section className="sec agx-g75">
                <PurchaseQuestionsCard projectId={projectId} report={report} />
                <div className="card agx-first">
                  <div className="card-h">
                    <h3>Qué hacer primero</h3>
                  </div>
                  <div className="card-b">
                    {steps.length > 0 && result ? (
                      <ol>
                        {steps.map((step, i) => (
                          <li key={step.key}>
                            <span className="n num">{i + 1}</span>
                            <div>
                              <div className="ch">
                                <span className={`dot ${stepTone(result, step) === "warn" ? "warn" : ""}`} aria-hidden="true" />
                                <span>{result.components.find((c) => c.id === step.component)?.name}</span>
                              </div>
                              <b>{step.title}</b>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="none">
                        {result ? "No vemos nada urgente que arreglar." : "Aparecerá cuando termine la auditoría agéntica."}
                      </p>
                    )}
                    <Link className="more" href={auditHref}>
                      Ver todas las comprobaciones
                      <Ic n="arrowr" sm />
                    </Link>
                  </div>
                </div>
              </section>
              <p className="agx-ex">«Preguntas de compra» sale de tu último escaneo y no entra en la Visibilidad agéntica ni en la Puntuación GEO.</p>
            </>
          )}
        </div>
      </Motion>
    </div>
  );
}
