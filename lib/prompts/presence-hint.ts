/**
 * Texto secundario bajo «La IA menciona / no menciona tu marca» en el cajón de
 * un prompt.
 *
 * Era una frase fija —«La IA te nombra por lo que ya sabe de tu marca, no por
 * tu web»— que se pintaba también cuando el titular decía «La IA no menciona
 * tu marca», y se contradecía a sí misma (auditoría 2026-10-08, hallazgo 5).
 * Depende del estado, y sólo afirma lo que las dos señales que ya tiene el
 * cajón permiten afirmar.
 */
export function brandMentionHint(opts: { brandMentioned: boolean; hasOwnCitation: boolean }): string {
  if (!opts.brandMentioned) return "Ahora mismo la IA responde a esta consulta sin nombrar tu marca.";
  return opts.hasOwnCitation
    ? "La IA te nombra y entre sus fuentes hay una web tuya."
    : "La IA te nombra, pero sin apoyarse en una web tuya: ninguna de sus fuentes es tu dominio.";
}
