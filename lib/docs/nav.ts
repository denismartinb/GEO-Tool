import { GEO_SCORE_DEFINITION } from "@/lib/brand/geo-score-definition";

/**
 * Single source of truth for the /docs sidebar and breadcrumb trail
 * (GROWTH-2 Fase 2.3) — mirrors the pattern already used by
 * lib/blog/posts.ts. Adding a doc page = one entry here + one new
 * app/docs/<path>/page.tsx.
 *
 * First slice only (2.3a): index + 4 pages. The rest of the product's
 * surface (prompts/competidores/citations/recomendaciones reports,
 * motores-y-cobertura, ciclo-de-escaneo) is tracked as pending in
 * docs/content-calendar.md and added in later, smaller PRs — not dumped
 * here all at once.
 */
export type DocPage = {
  slug: string;
  title: string;
  description: string;
};

export type DocSection = {
  title: string;
  pages: DocPage[];
};

export const DOCS_NAV: DocSection[] = [
  {
    title: "Empezar",
    pages: [
      {
        slug: "empezar/primer-escaneo",
        title: "Tu primer escaneo",
        description:
          "Qué pasa cuando registras un dominio en GenScore: de la creación del proyecto al primer GEO Score, paso a paso."
      }
    ]
  },
  {
    title: "Informes",
    pages: [
      {
        slug: "informes/overview",
        title: "Overview",
        description:
          "Qué muestra la pantalla de Visión general: GEO Score, indicadores clave, posicionamiento por motor de IA y oportunidades."
      }
    ]
  },
  {
    title: "Metodología",
    pages: [
      {
        slug: "metodologia/geo-score",
        title: "GEO Score",
        // SEO-POS-1 Fase E, E4: la descripción es la definición compartida.
        // La anterior estaba rancia en las dos mitades — hablaba de "los cuatro
        // componentes" (son cinco desde GEO-SCORE-V4, ADR 0033) y prometía "sus
        // pesos", que se retiraron de todas las superficies el 2026-08-13 (log
        // §75). Era además la meta description del documento que esta fase
        // declara canónico para el término.
        description: GEO_SCORE_DEFINITION
      }
    ]
  },
  {
    title: "Planes y límites",
    pages: [
      {
        slug: "planes-y-limites",
        title: "Planes y límites",
        description:
          "Dominios, prompts y motores de IA incluidos en cada plan de GenScore, y qué cambia al subir de plan."
      }
    ]
  }
];

export function getDocPage(slug: string): DocPage | undefined {
  for (const section of DOCS_NAV) {
    const page = section.pages.find((p) => p.slug === slug);
    if (page) return page;
  }
  return undefined;
}

export function getDocSectionFor(slug: string): DocSection | undefined {
  return DOCS_NAV.find((section) => section.pages.some((p) => p.slug === slug));
}
