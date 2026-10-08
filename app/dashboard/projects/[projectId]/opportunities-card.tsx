import Link from "next/link";
import { Icon } from "@/components/ui/icon";

type OpportunityRec = { id: string; title: string; impact: string | null; effort: string | null };

/**
 * Visión general · Oportunidades. Extraído de `page.tsx` sin cambiar su salida
 * para poder renderizarlo con una fixture (sin base de datos).
 *
 * Sin cifras de puntos (founder, 2026-10-08, log §236): el contrafactual de
 * ADR 0017 no tiene resultados medidos detrás y se leía como previsión. La
 * cabecera es el recuento real de recomendaciones activas; cada fila, el
 * impacto cualitativo del motor. «Prioridad estimada» y no «impacto en tu
 * visibilidad»: el orden es `planScore` (regla de producto), no un efecto
 * medido, y el texto no debe sugerir retorno.
 */
export function OpportunitiesCard({
  projectId,
  recommendations,
  activeCount,
  highPriorityCount
}: {
  projectId: string;
  recommendations: OpportunityRec[];
  activeCount: number | null;
  highPriorityCount: number;
}) {
  const count = activeCount ?? recommendations.length;
  return (
    <>
      <div className="ov2-sec-lbl">
        Oportunidades
        <Link href={`/dashboard/projects/${projectId}/recommendations`}>
          Ver todo <Icon name="arrRight" size={13} />
        </Link>
      </div>
      <div className="card ov2-opps">
        <div className="ov2-opps-hero">
          <div className="ov2-opps-gain">
            <div className="ov2-opps-gain-n">{count}</div>
            <div className="ov2-opps-gain-l">{count === 1 ? "Recomendación" : "Recomendaciones"}</div>
          </div>
          <div>
            <div className="ov2-opps-h">
              {highPriorityCount > 0
                ? `${highPriorityCount} ${highPriorityCount === 1 ? "acción" : "acciones"} de alta prioridad`
                : "Acciones priorizadas para ti"}
            </div>
            <div className="ov2-opps-s">Ordenadas por prioridad estimada.</div>
          </div>
        </div>
        <div className="ov2-opps-list">
          {recommendations.map((rec) => {
            const effort = (rec.effort ?? "medium").toLowerCase();
            const isQuick = effort === "low";
            const impact = (rec.impact ?? "low").toLowerCase();
            const impactLabel = impact === "high" ? "Alto" : impact === "medium" || impact === "med" ? "Medio" : "Bajo";
            return (
              <div key={rec.id} className="ov2-opp">
                <span className="ov2-opp-dot" style={{ background: isQuick ? "var(--pos)" : "var(--brand-neg)" }} />
                <span className="ov2-opp-t">
                  <span>{rec.title}</span>
                  {isQuick && <span className="ov2-opp-quick">rápida</span>}
                </span>
                <span className="ov2-opp-r">
                  <span className="impact-lbl">Impacto {impactLabel.toLowerCase()}</span>
                </span>
              </div>
            );
          })}
        </div>
        <Link href={`/dashboard/projects/${projectId}/recommendations`} className="ov2-opps-cta">
          Ver todas las recomendaciones <Icon name="arrRight" size={13} />
        </Link>
      </div>
    </>
  );
}
