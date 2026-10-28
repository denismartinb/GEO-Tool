// Franja de la Puntuación GEO como la nombra el prototipo v51: Inicial,
// Emergente, Competitivo. Los cortes (40 y 70) son los que la esfera graba.
export type ScoreBand = "Inicial" | "Emergente" | "Competitivo";

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "Competitivo";
  if (score >= 40) return "Emergente";
  return "Inicial";
}
