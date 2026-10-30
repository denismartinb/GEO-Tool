import Link from "next/link";
import { Ic } from "@/components/ins/ic";
import { Bar } from "@/components/ins/kit/bar";
import { TickRing } from "@/components/ins/kit/charts";
import { readAgenticAudits } from "@/lib/agentic-audit/console-audit";
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

export function AgenticOverviewCardView({ projectId, card }: { projectId: string; card: OverviewAgenticCard }) {
  if (card.kind === "hidden") return null;
  const href = `/dashboard/projects/${projectId}/agentic-visibility`;
  return (
    <div className="card">
      <div className="card-h">
        <h3>Comercio agéntico</h3>
        <span className="new">Nuevo</span>
        {card.kind === "card" ? (
          <Link className="see" href={href}>
            Ver todo
            <Ic n="chevr" sm />
          </Link>
        ) : null}
      </div>
      {card.kind === "upsell" ? (
        <div className="card-b ag-up">
          <p style={{ fontSize: 15, fontWeight: 550, letterSpacing: "-.01em", color: "var(--ink)" }}>
            ¿Puede un agente de IA comprar en tu web?
          </p>
          <p>
            Con Pro, GenScore revisa tu web tras cada escaneo y te dice si un agente de IA puede encontrarte, entenderte y
            llegar a comprar, y qué arreglar primero.
          </p>
          <Link className="btn blue" href="/dashboard/settings?openPlan=pro#plan">
            Pasar a Pro
          </Link>
        </div>
      ) : (
        <div className="card-b">
          <div className="ag">
            <TickRing value={card.score} label="Visibilidad agéntica" />
            <div>
              <p style={{ fontSize: 15, fontWeight: 550, letterSpacing: "-.01em" }}>{card.headline}</p>
              <div className="rows" style={{ marginTop: 10 }}>
                {card.components.map((c, i) => (
                  <div key={c.id}>
                    <span>{c.name}</span>
                    <Bar
                      value={c.points ?? 0}
                      max={c.weight}
                      cls={`thin ${c.points !== null && c.points / c.weight < 0.5 ? "warm" : ""}`.trim()}
                      delay={i * 80}
                    />
                    <b className="num">
                      {c.points === null ? "–" : c.points}
                      <small>/{c.weight}</small>
                    </b>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {card.first ? (
            <div className="fx-w">
              <div className="fx-k">Recomendaciones</div>
              <Link className="fixln" href={`/dashboard/projects/${projectId}/agentic-audit`}>
                <span className="sd" style={card.first.tone === "ok" || card.first.tone === "na" ? { background: "var(--ink-4)" } : undefined} />
                {card.first.title}
                <Ic n="chevr" sm />
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
