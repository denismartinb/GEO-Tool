/**
 * Lectura comparada de los temas de la pantalla Prompts («Fuerte en X, floja
 * en Y»).
 *
 * Con todos los temas al 0% la frase decía «Fuerte en Precio y planes (0%),
 * floja en Cómo hacer / guía (0%)»: un empate total presentado como fortaleza
 * relativa, sólo porque el orden de un `sort` estable puso uno primero
 * (auditoría 2026-10-08, hallazgo 3). Sólo hay contraste si hay diferencia, y
 * «fuerte» no se dice de un tema que no llega a nombrarte nunca.
 */
export type TopicContrast =
  | { kind: "none" }
  | { kind: "all_zero" }
  | { kind: "tie"; pct: number }
  | { kind: "spread"; best: { category: string; pct: number }; worst: { category: string; pct: number } };

export function describeTopicContrast(topics: ReadonlyArray<{ category: string; visibilidad: number }>): TopicContrast {
  if (topics.length < 2) return { kind: "none" };
  const ranked = [...topics].sort((a, b) => b.visibilidad - a.visibilidad);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (best.visibilidad === worst.visibilidad) {
    return best.visibilidad === 0 ? { kind: "all_zero" } : { kind: "tie", pct: best.visibilidad };
  }
  return {
    kind: "spread",
    best: { category: best.category, pct: best.visibilidad },
    worst: { category: worst.category, pct: worst.visibilidad }
  };
}
