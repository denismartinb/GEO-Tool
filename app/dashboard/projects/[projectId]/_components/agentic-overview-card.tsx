import Link from "next/link";
import { readAgenticAudits } from "@/lib/agentic-audit/console-audit";
import type { Tone } from "@/lib/agentic-audit/console-model";
import { overviewAgenticCard, type OverviewAgenticCard } from "@/lib/agentic-audit/visibility-model";
import { requireUser } from "@/lib/auth";
import { resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";

/**
 * «Comercio agéntico» on Visión general (AGENTIC-COMMERCE-1 Fase 2b, log
 * §340), from the approved mockup (docs/design-reference/agentic-commerce-1/
 * fase-2b.html). Reads the latest agentic review, which already runs after
 * every scan; streamed in its own `Suspense` so it never holds up the page.
 */
export async function AgenticOverviewCard({ projectId }: { projectId: string }) {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, audits] = await Promise.all([
    supabase.from("profiles").select(SYSTEM_PLAN_COLUMNS).eq("id", user.id).maybeSingle(),
    readAgenticAudits(supabase, projectId, user.id)
  ]);
  // No profile reads as no plan: the card stays hidden (fails closed).
  const planId = profile ? resolveSystemPlanId(profile as Parameters<typeof resolveSystemPlanId>[0]) : null;
  const result = audits.available ? (audits.latest?.result ?? null) : null;
  return <AgenticOverviewCardView projectId={projectId} card={overviewAgenticCard(planId, result)} />;
}

const DOT: Record<Tone, string> = { ok: "is-ok", warn: "is-warn", bad: "is-bad", na: "is-na" };

function Ring({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 46;
  const arc = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <svg className="ovag-ring" viewBox="0 0 110 110" role="img" aria-label={`Visibilidad agéntica ${score} de 100`}>
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
      <text x="55" y="78" textAnchor="middle" fontSize="11" className="av-ring-s">
        de 100
      </text>
    </svg>
  );
}

export function AgenticOverviewCardView({ projectId, card }: { projectId: string; card: OverviewAgenticCard }) {
  if (card.kind === "hidden") return null;
  const href = `/dashboard/projects/${projectId}/agentic-visibility`;
  return (
    <div className="ovag">
      <div className="ov2-sec-lbl ovag-lbl">
        <span>
          Comercio agéntico <span className="sa-new">Nuevo</span>
        </span>
        {card.kind === "card" ? <Link href={href}>Ver todo</Link> : null}
      </div>
      {card.kind === "upsell" ? (
        <div className="card ovag-card ovag-upsell">
          <h3>¿Puede un agente de IA comprar en tu web?</h3>
          <p>
            Con Pro, GenScore revisa tu web tras cada escaneo y te dice si un agente de IA puede encontrarte, entenderte y
            llegar a comprar, y qué arreglar primero.
          </p>
          <Link className="btn btn-primary" href="/dashboard/settings?openPlan=pro#plan">
            Pasar a Pro
          </Link>
        </div>
      ) : (
        <div className="card ovag-card">
          <div className="ovag-top">
            <Ring score={card.score} />
            <p className="ovag-head">{card.headline}</p>
          </div>
          <div className="ovag-mini">
            {card.components.map((c) => (
              <div className="ovag-r" key={c.id}>
                <span>{c.name}</span>
                <span className="av-track" aria-hidden="true">
                  <span style={{ width: `${c.percent}%` }} />
                </span>
                <span className="ovag-v">
                  {c.points === null ? "–" : c.points}
                  <small>/{c.weight}</small>
                </span>
              </div>
            ))}
          </div>
          {card.first ? (
            <div className={`ovag-first ${DOT[card.first.tone]}`}>
              <span className={`av-dot ${DOT[card.first.tone]}`} aria-hidden="true" />
              <span>
                <span className="ovag-k">Lo primero</span>
                {card.first.title}
              </span>
            </div>
          ) : null}
          <Link className="ovag-go" href={href}>
            Ver visibilidad en agentes →
          </Link>
          <p className="ovag-foot">Mide si un agente de IA puede encontrarte, entenderte y comprarte. No entra en tu Puntuación GEO.</p>
        </div>
      )}
    </div>
  );
}
