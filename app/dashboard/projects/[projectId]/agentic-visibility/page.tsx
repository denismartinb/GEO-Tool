import { Motion } from "@/components/ins/kit/motion";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AgenticCheckResult, AgenticComponentId } from "@/lib/agentic-audit/api-contract";
import { readAgenticAudits } from "@/lib/agentic-audit/console-audit";
import { componentLine, componentStatus, firstSteps, type Tone } from "@/lib/agentic-audit/console-model";
import { loadPurchaseQuestions } from "@/lib/agentic-audit/purchase-data";
import {
  agentPath,
  COMPONENT_PURPOSE,
  componentPoints,
  fixbarLine,
  interopLine,
  reviewedPill,
  stepTone,
  visibilityDetail,
  visibilityHeadline,
  type PathTone
} from "@/lib/agentic-audit/visibility-model";
import { requireUser } from "@/lib/auth";
import { isProOrAbove, resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import { requireActiveProject } from "@/lib/project-workspace";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { PurchaseQuestionsCard } from "./_components/purchase-questions-card";

/**
 * «Visibilidad en agentes»: AGENTIC-COMMERCE-1 Fase 2d (log §332), laid out as
 * the approved prototype (docs/design-reference/agentic-commerce-1/
 * prototipo.html, «Consola · Visibilidad en agentes»). The summary of the
 * agentic review for someone who is not technical: what holds an agent back,
 * the path it takes, the five components and «Preguntas de compra» from the
 * latest scan. «Auditoría agéntica» is the technical screen, with its own
 * menu entry. Reads only; no LLM, no migration of its own.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Visibilidad en agentes", async () => (await requireActiveProject(projectId)).domain);
}

const ICON_PATHS: Record<string, ReactNode> = {
  find: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ),
  discovery: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V3h11v18" />
      <path d="M16 5h3v16" />
      <circle cx="13" cy="12" r=".8" />
    </>
  ),
  understanding: (
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  trust: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  purchase: (
    <>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </>
  )
};

function StepIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[id]}
    </svg>
  );
}

/** The 0–100 ring of the prototype: arc proportional to the score. */
function Ring({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 46;
  const arc = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <svg className="av-ring" viewBox="0 0 110 110" role="img" aria-label={`Visibilidad agéntica ${score} de 100`}>
      <circle cx="55" cy="55" r="46" fill="none" stroke="var(--av-track)" strokeWidth="10" />
      <circle
        cx="55"
        cy="55"
        r="46"
        fill="none"
        stroke="var(--brand-blue)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${arc} ${circumference}`}
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="60" textAnchor="middle" fontSize="30" className="av-ring-n">
        {score}
      </text>
      <text x="55" y="77" textAnchor="middle" fontSize="10" className="av-ring-s">
        de 100
      </text>
    </svg>
  );
}

const DOT: Record<Tone, string> = { ok: "is-ok", warn: "is-warn", bad: "is-bad", na: "is-na" };
const NODE: Record<PathTone, string> = { ok: "", warn: "is-warn", bad: "is-bad", na: "is-na", neutral: "is-neutral" };
const CARD_ORDER: AgenticComponentId[] = ["discovery", "understanding", "trust", "purchase"];

function ComponentCards({ result, auditHref }: { result: AgenticCheckResult; auditHref: string }) {
  const interop = interopLine(result);
  return (
    <div className="av-comps">
      {CARD_ORDER.map((id) => {
        const component = result.components.find((c) => c.id === id);
        if (!component) return null;
        const points = componentPoints(component);
        const tone = componentStatus(component, result).tone;
        return (
          <Link key={id} className={`av-cc${points === null ? " is-na" : ""}`} href={`${auditHref}?componente=${id}`}>
            <span className="av-cc-t">{component.name}</span>
            <span className="av-cc-sc">
              {points === null ? "–" : points}
              <small>/{component.weight}</small>
            </span>
            <span className="av-track" aria-hidden="true">
              <span style={{ width: `${component.score ?? 0}%` }} />
            </span>
            <p>{COMPONENT_PURPOSE[id]}</p>
            <span className="av-cc-find">
              <span className={`av-dot ${DOT[tone]}`} aria-hidden="true" />
              {componentLine(result, component)}
            </span>
          </Link>
        );
      })}
      <Link className="av-cc" href={`${auditHref}?componente=interop`}>
        <span className="av-cc-t">Interoperabilidad</span>
        <span className="av-cc-sc">
          {result.interop.found}
          <small> de {result.interop.total}</small>
        </span>
        <span className="av-track" aria-hidden="true">
          <span style={{ width: `${result.interop.total ? (result.interop.found / result.interop.total) * 100 : 0}%` }} />
        </span>
        <p>{COMPONENT_PURPOSE.interop}</p>
        <span className="av-cc-find">
          <span className={`av-dot ${DOT[interop.tone]}`} aria-hidden="true" />
          {interop.line}
        </span>
      </Link>
    </div>
  );
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
  const detail = visibilityDetail(result);
  const auditHref = `/dashboard/projects/${projectId}/agentic-audit`;

  return (
    <div className="ins">
      <Motion id={`agentic-visibility:${projectId}`}>
      <div className="page sc-ag">
        <div className="eyebrow bare">
          Visibilidad en agentes · <span className="mono" style={{ letterSpacing: 0, textTransform: "none" }}>{project.domain}</span>
        </div>

      <div className="ag-page av-page">
        <div className="av-ph">
          <div>
            <h1>Visibilidad en agentes</h1>
            <p>Si un agente de IA puede encontrarte, entrar, entender lo que vendes, fiarse y llegar a comprar o reservar.</p>
          </div>
          {latest ? <span className="av-date">{reviewedPill(latest.createdAt, new Date())}</span> : null}
        </div>

        {!canRun ? (
          <div className="av-box ag-upsell">
            <h3>Visibilidad en agentes está en Pro y Agencia</h3>
            <p>
              Mira si la IA te nombra cuando alguien va a comprar, o si le manda a un marketplace, junto a lo que ve un agente en
              tu web.
            </p>
            <Link className="btn btn-primary" href="/dashboard/settings?openPlan=pro#plan">
              Pasar a Pro
            </Link>
          </div>
        ) : (
          <>
            <div className="av-box av-summary">
              {result && result.score !== null ? <Ring score={result.score} /> : null}
              <div className="av-summary-copy">
                <div className="av-eyebrow">Visibilidad agéntica</div>
                <div className="av-headline">{visibilityHeadline(result)}</div>
                {detail ? <div className="av-detail">{detail}</div> : null}
                {result && result.score === null && result.found !== "none" ? (
                  <div className="av-detail">La nota se calcula sobre una página donde vendes algo.</div>
                ) : null}
              </div>
              <div className="av-fixbar">
                <span>
                  {fixbar ? (
                    <>
                      Si arreglas {fixbar.what} de «Qué hacer primero», subes de <b>{fixbar.from}</b> a <b>{fixbar.to}</b>.
                    </>
                  ) : result ? (
                    "El detalle de cada comprobación está en la auditoría."
                  ) : (
                    "La auditoría agéntica revisa tu web sola tras cada escaneo."
                  )}
                </span>
                <Link className="btn btn-primary av-btn" href={auditHref}>
                  Ver la auditoría
                </Link>
              </div>
            </div>

            <div className="av-lbl">El camino de un agente por tu web</div>
            <div className="av-box">
              <ol className="av-journey">
                {agentPath(result, report).map((step) => (
                  <li key={step.id} className={`av-jn ${NODE[step.tone]}`}>
                    <span className="av-jn-c">
                      <StepIcon id={step.id} />
                    </span>
                    <div>
                      <b>{step.title}</b>
                      <small>{step.line}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {result ? (
              <>
                <div className="av-lbl">
                  Componentes <span>Pulsa uno para ver sus comprobaciones</span>
                </div>
                <ComponentCards result={result} auditHref={auditHref} />
              </>
            ) : null}

            <div className="av-cols">
              <PurchaseQuestionsCard projectId={projectId} report={report} />
              <div className="av-box">
                <h3>Qué hacer primero</h3>
                <p className="av-hs">Los arreglos que más suben tu Visibilidad agéntica.</p>
                {steps.length > 0 && result ? (
                  steps.map((step) => (
                    <div className="av-fix" key={step.key}>
                      <span className={`av-dot ${DOT[stepTone(result, step)]}`} aria-hidden="true" />
                      <span>{step.title}</span>
                    </div>
                  ))
                ) : (
                  <p className="av-empty">
                    {result ? "No vemos nada urgente que arreglar." : "Aparecerá cuando termine la auditoría agéntica."}
                  </p>
                )}
                <Link className="av-go" href={auditHref}>
                  Ver todas las comprobaciones →
                </Link>
              </div>
            </div>
            <p className="av-ex">«Preguntas de compra» sale de tu último escaneo y no entra en la Visibilidad agéntica ni en la Puntuación GEO.</p>
          </>
        )}
      </div>
      </div>
      </Motion>
    </div>
  );
}
