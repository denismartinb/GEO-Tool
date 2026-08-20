import { Icon } from "@/components/ui/icon";

/**
 * "Si arreglas los N problemas técnicos" — la tarjeta de potencial que abre
 * la pestaña Problemas. Founder feedback 2026-08-17: la caja plana original
 * (fondo `--pos-soft` liso, sin jerarquía visual) se leía como un aviso más
 * de la lista, no como el titular de la pestaña. Extraída de `page.tsx` a
 * `_components/` por la regla de la zona (`.claude/rules/web-audit.md`,
 * "Los componentes de presentación viven en `_components/`").
 *
 * `fromScore`/`toScore` no son una estimación: son `actualReadinessScore` y
 * `projectedReadinessScore` de `buildTechnicalIssuesReport`, ya redondeados
 * por el llamador — este componente sólo los pinta.
 */
export function TechnicalPotentialBanner({
  issueCount,
  fromScore,
  toScore
}: {
  issueCount: number;
  fromScore: number;
  toScore: number;
}) {
  return (
    <div className="tech-potential" style={{ marginTop: 12 }}>
      <div className="tech-potential-badge">
        <Icon name="sparkles" size={18} />
      </div>
      <div className="tech-potential-body">
        <div className="tech-potential-label">
          Si arreglas los {issueCount} {issueCount === 1 ? "problema técnico" : "problemas técnicos"}
        </div>
        <div className="tech-potential-scores">
          <span className="tech-potential-score tech-potential-score-from">{fromScore}</span>
          <span className="tech-potential-arrow">
            <Icon name="arrRight" size={13} />
          </span>
          <span className="tech-potential-score tech-potential-score-to">{toScore}</span>
          <span className="tech-potential-pill">
            <Icon name="check" size={10} />
            calculado
          </span>
        </div>
        <div className="tech-potential-caption">Salud técnica</div>
        <p className="tech-potential-note">
          Es una valoración técnica. Que la IA acabe citándote depende también de otros factores de GEO, que trabajas en
          Recomendaciones.
        </p>
      </div>
    </div>
  );
}
