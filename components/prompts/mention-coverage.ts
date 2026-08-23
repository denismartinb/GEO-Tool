/**
 * PROMPT-DRAWER-TRUTH-1 — la cobertura del ranking del cajón de Prompts,
 * fuera del componente para poder probarla sin navegador.
 *
 * Estaba dentro de `prompt-drawer.tsx` y era binaria: `results.some(...)`
 * pintado como `100%` o `0%`. Un prompt respondido por tres motores donde
 * sólo uno nombraba a la marca se leía como **100%** justo debajo de la lista
 * «Mencionada · Ausente · Ausente» que decía lo contrario — las dos
 * afirmaciones caben en la misma captura de pantalla, y el fundador las vio
 * juntas el 2026-08-23 (log §145). Con muestreo (ADR 0030) el error crece:
 * nueve respuestas y una mención siguen siendo «100%».
 *
 * La puntuación real nunca tuvo este fallo (`lib/scoring/run-scoring.ts`
 * calcula `brandMentionedCount / totalResults`), así que esto era una mentira
 * de pantalla, no de scoring. Este módulo existe para que no vuelva a serlo
 * sin que un test se entere.
 */

/** Lo que la cobertura necesita de una fila de `scan_prompt_results`. */
export type CoverageResultRow = {
  brand_mentioned: boolean | null;
  sentiment?: string | null;
};

/** Lo que la cobertura necesita de `extracted_json`. */
export type CoverageExtractedJson = {
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
};

export type RankingRow = {
  name: string;
  isOwn: boolean;
  /** Respuestas de este prompt en las que la entidad aparece. */
  mentionCount: number;
  /** Respuestas que de verdad la evaluaron — el denominador. */
  evaluatedCount: number;
  /** `mentionCount / evaluatedCount` en %, o `null` si no se evaluó nunca. */
  coverage: number | null;
  mentioned: boolean;
  evidence: string[];
  sentiment: string | null;
};

/**
 * Cobertura de una entidad DENTRO de este prompt: en cuántas de las respuestas
 * que se le dieron aparece.
 *
 * El denominador son **respuestas, no motores distintos**: con muestreo el
 * mismo motor contesta varias veces y cada respuesta cuenta, que es justo lo
 * que hace legible que un motor se contradiga a sí mismo (ADR 0030).
 *
 * `null` cuando la entidad no se evaluó en ninguna respuesta. Un `0%` ahí sería
 * una afirmación sobre una marca que nadie llegó a mirar — mismo criterio que
 * `ScoreGauge` en Auditoría web, donde un dato ausente no se pinta como un cero
 * (`.claude/rules/web-audit.md`, «ningún número de relleno»).
 */
export function coveragePercent(mentionCount: number, evaluatedCount: number): number | null {
  if (evaluatedCount <= 0) return null;
  return Math.round((mentionCount / evaluatedCount) * 100);
}

/**
 * Orden del ranking: cobertura descendente y, **sólo al empatar**, la marca
 * propia arriba.
 *
 * Antes la marca propia se clavaba en el primer puesto siempre que estuviera
 * mencionada, con lo que el «ranking» no ordenaba nada: salías primero por
 * construcción. Un competidor al que la IA nombra más veces que a ti tiene que
 * salir por encima, o la pantalla no es un ranking sino un adorno.
 *
 * Una entidad sin evaluar (`coverage: null`) va al final, nunca mezclada con
 * las que sí se midieron y salieron a cero.
 */
function compareRankingRows(a: RankingRow, b: RankingRow): number {
  const aCoverage = a.coverage ?? -1;
  const bCoverage = b.coverage ?? -1;
  if (aCoverage !== bCoverage) return bCoverage - aCoverage;
  if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
  if (b.evidence.length !== a.evidence.length) return b.evidence.length - a.evidence.length;
  return a.name.localeCompare(b.name);
}

/**
 * Construye el ranking de marcas de un prompt a partir de sus respuestas.
 *
 * `extractedList` va en paralelo a `results` (misma longitud, mismo orden);
 * una posición `null` es una fila cuya extracción falló.
 *
 * **Denominadores distintos por entidad, a propósito.** La marca se mide sobre
 * TODAS las respuestas, porque `brand_mentioned` existe en todas las filas
 * — es el mismo denominador que usa `visibilityScore`. Un competidor se mide
 * sólo sobre las respuestas que llegaron a evaluarlo: una fila cuya extracción
 * falló no tiene opinión sobre ese competidor, y meterla en su denominador
 * convertiría un fallo nuestro en un 0% suyo. Es el criterio que
 * `computeBrandPosition` (`lib/scoring/run-scoring.ts`) ya aplica al saltarse
 * las filas sin `extracted_json`, no uno nuevo.
 */
export function buildRanking(input: {
  results: CoverageResultRow[];
  extractedList: Array<CoverageExtractedJson | null>;
  competitors: Array<{ name: string }>;
  brandEvidence: string[];
  brandSentiment: string | null;
}): RankingRow[] {
  const { results, extractedList, competitors, brandEvidence, brandSentiment } = input;

  const brandMentionCount = results.filter((r) => r.brand_mentioned).length;
  const brandRow: RankingRow = {
    name: "Tu marca",
    isOwn: true,
    mentionCount: brandMentionCount,
    evaluatedCount: results.length,
    coverage: coveragePercent(brandMentionCount, results.length),
    mentioned: brandMentionCount > 0,
    evidence: brandEvidence,
    sentiment: brandSentiment
  };

  const stats = new Map<string, { mentionCount: number; evaluatedCount: number; evidence: string[] }>();
  for (const extracted of extractedList) {
    for (const competitor of extracted?.competitors ?? []) {
      if (!competitor.name) continue;
      const key = competitor.name.toLowerCase();
      const previous = stats.get(key) ?? { mentionCount: 0, evaluatedCount: 0, evidence: [] };
      stats.set(key, {
        mentionCount: previous.mentionCount + (competitor.mentioned ? 1 : 0),
        evaluatedCount: previous.evaluatedCount + 1,
        evidence: Array.from(new Set([...previous.evidence, ...(competitor.evidence ?? [])]))
      });
    }
  }

  const competitorRows: RankingRow[] = competitors.map((competitor) => {
    const entry = stats.get(competitor.name.toLowerCase());
    const mentionCount = entry?.mentionCount ?? 0;
    const evaluatedCount = entry?.evaluatedCount ?? 0;
    return {
      name: competitor.name,
      isOwn: false,
      mentionCount,
      evaluatedCount,
      coverage: coveragePercent(mentionCount, evaluatedCount),
      mentioned: mentionCount > 0,
      evidence: entry?.evidence ?? [],
      sentiment: null
    };
  });

  return [brandRow, ...competitorRows].sort(compareRankingRows);
}
