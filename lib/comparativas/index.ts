/**
 * Índice de páginas de `/comparativas` (GROWTH-2 Fase 2.8). Antes vivía sólo
 * como un array local en `app/comparativas/page.tsx`; ahora lo comparte
 * también el carril de Comparativas de `/blog`, así que un slug o título que
 * cambie no puede quedar desincronizado entre las dos superficies.
 *
 * `blurb` es un recorte literal de la `description` real de cada página
 * (`contentMetadata` en cada `app/comparativas/<slug>/page.tsx`), no texto
 * nuevo — mismo principio que el resto del contenido: no se redacta una
 * segunda descripción que pueda divergir de la aprobada.
 */
export type ComparativaLink = {
  href: string;
  title: string;
  blurb: string;
};

export const COMPARATIVAS_INDEX: ComparativaLink[] = [
  {
    href: "/comparativas/mejores-herramientas-geo-en-espanol",
    title: "Las mejores herramientas GEO en 2026",
    blurb: "GenScore, Otterly, Profound, Peec AI y el resto, comparadas para elegir según tus motores, presupuesto e idioma."
  },
  {
    href: "/comparativas/genscore-vs-otterly",
    title: "GenScore vs Otterly",
    blurb: "Precio de entrada, motores de IA cubiertos, cobertura multi-país e idioma, comparados fila a fila."
  },
  {
    href: "/comparativas/genscore-vs-peec-ai",
    title: "GenScore vs Peec AI",
    blurb: "Precio de entrada, coste de motores adicionales y usuarios de equipo, comparados fila a fila."
  },
  {
    href: "/comparativas/genscore-vs-profound",
    title: "GenScore vs Profound",
    blurb: "Precio de entrada, motores cubiertos y a quién se dirige cada una, comparados fila a fila."
  },
  {
    href: "/comparativas/alternativas-a-otterly",
    title: "Alternativas a Otterly en 2026",
    blurb: "Cinco alternativas comparadas por el motivo que te hace buscarlas: prompts, motores que se cobran aparte, o producto solo en inglés."
  }
];
