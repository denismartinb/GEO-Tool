import { Icon } from "@/components/ui/icon";
import type { AuditBlockKey } from "@/lib/web-audit/audit-blocks";

/**
 * «Si arreglas los N problemas que puntúan: X → 100», at the top of each
 * block (log §275). It comes back from the old Problemas tab (founder,
 * 2026-10-10), now in block points. `fromScore`/`toScore` are
 * `buildAuditBlock`'s score and projected score, never an estimate: fixing
 * every scored check of a block is, by definition, its full score.
 */
const NOTES: Record<AuditBlockKey, { caption: string; note: string }> = {
  geo: {
    caption: "Nota GEO",
    note: "Lo que la IA necesita para poder citarte. Que acabe citándote depende también del contenido, que trabajas en Recomendaciones."
  },
  seo: {
    caption: "Salud SEO",
    note: "Lo que Google necesita para encontrar tu web, entenderla y enseñarla rápido."
  }
};

export function BlockPotentialBanner({
  block,
  issueCount,
  fromScore,
  toScore
}: {
  block: AuditBlockKey;
  issueCount: number;
  fromScore: number;
  toScore: number;
}) {
  const { caption, note } = NOTES[block];
  return (
    <div className="tech-potential">
      <div className="tech-potential-badge">
        <Icon name="sparkles" size={18} />
      </div>
      <div className="tech-potential-body">
        <div className="tech-potential-label">
          Si arreglas {issueCount === 1 ? "el problema que puntúa" : `los ${issueCount} problemas que puntúan`}
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
        <div className="tech-potential-caption">{caption}</div>
        <p className="tech-potential-note">{note}</p>
      </div>
    </div>
  );
}
