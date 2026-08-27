import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { RecCard, SolutionPanel, overlayCopyLocal, type Recommendation } from "./recommendations-client";
import { overlayCopy } from "@/lib/recommendations/coverage-overlay";

/**
 * Estas dos cosas el `ux-pilot` NO las puede ver, y por eso se prueban aquí.
 *
 * - La insignia de estado del artefacto sólo existe cuando hay una propuesta
 *   generada, y generar una es una **escritura**: el piloto permanente es de
 *   solo lectura por diseño (`.claude/rules` / `docs/agentic-user-pilot.md`),
 *   así que no puede llegar a ese estado en ninguna pasada, ni hoy ni nunca.
 * - El chip de control sólo se pinta en los tipos `third_party`/`in_app`, y el
 *   proyecto del piloto no tiene ninguna recomendación de esos tipos (pasada
 *   de PR #453: tres recomendaciones, las tres de la propia web).
 *
 * Es el mismo fallo que el incidente del 2026-08-02 (un rediseño entero
 * aprobado con capturas de un estado vacío): si nadie puede verlo, no está
 * verificado — así que se verifica por render, que sí es determinista.
 * Se asegura el CONTENIDO, no el aspecto; el aspecto sigue siendo del piloto.
 */

const baseRec = (over: Partial<Recommendation> = {}): Recommendation =>
  ({
    id: "r1",
    title: "Título",
    description: "Descripción",
    recommendation_type: "increase_brand_visibility",
    impact: "medium",
    effort: "medium",
    confidence: "medium",
    priority_rank: 1,
    evidence_json: {},
    solution: null,
    ...over
  }) as Recommendation;

describe("SolutionPanel — insignia de estado del artefacto", () => {
  it("dice «Listo para copiar» cuando no queda ningún hueco", () => {
    const html = renderToStaticMarkup(
      <SolutionPanel
        solution={{
          title: "Publica una FAQ",
          summary: "Resumen",
          steps: ["Un paso sin huecos."],
          examples: [{ label: "Párrafo", content: "Acme fabrica sofás con 5 años de garantía." }]
        }}
      />
    );
    expect(html).toContain("Listo para copiar");
    expect(html).not.toContain("por rellenar");
  });

  it("cuenta los huecos reales del artefacto y de los pasos", () => {
    const html = renderToStaticMarkup(
      <SolutionPanel
        solution={{
          title: "Publica una FAQ",
          summary: "Resumen",
          steps: ["Publica el precio [tu dato aquí]."],
          examples: [{ label: "Párrafo", content: "Garantía de [tu dato aquí]." }]
        }}
      />
    );
    expect(html).toContain("2 huecos por rellenar");
  });

  it("no confunde los corchetes de un JSON-LD con huecos", () => {
    const html = renderToStaticMarkup(
      <SolutionPanel
        solution={{
          title: "Schema",
          summary: "Resumen",
          steps: [],
          examples: [
            {
              label: "JSON-LD",
              content: '{ "@type": "FAQPage", "mainEntity": [{ "@type": "Question" }], "sameAs": ["https://a.es"] }'
            }
          ]
        }}
      />
    );
    expect(html).toContain("Listo para copiar");
  });
});

describe("RecCard — CTA y chip de control", () => {
  it("nombra el entregable en el botón, no la mecánica", () => {
    const html = renderToStaticMarkup(<RecCard projectId="p1" rec={baseRec({ recommendation_type: "create_faq_section" })} />);
    expect(html).toContain("Generar FAQ");
    expect(html).not.toContain("Generar propuesta con IA");
  });

  it("pinta el chip cuando el resultado depende de un tercero", () => {
    const html = renderToStaticMarkup(<RecCard projectId="p1" rec={baseRec({ recommendation_type: "pursue_media_sources" })} />);
    expect(html).toContain("Depende de terceros");
    expect(html).toContain("Generar pitch");
  });

  it("NO pinta chip en una acción de la propia web: la ausencia significa «es tuyo»", () => {
    const html = renderToStaticMarkup(<RecCard projectId="p1" rec={baseRec({ recommendation_type: "add_citation_block" })} />);
    expect(html).not.toContain("Depende de terceros");
    expect(html).not.toContain("Aquí en GenScore");
  });

  it("marca como interno lo que se resuelve dentro del producto", () => {
    const html = renderToStaticMarkup(<RecCard projectId="p1" rec={baseRec({ recommendation_type: "track_emerging_competitor" })} />);
    expect(html).toContain("Aquí en GenScore");
  });
});

/**
 * AUDIT-RECS-JOIN-1 Fase B. `overlayCopyLocal` (cliente) es una copia
 * verbatim de `overlayCopy` (lib/recommendations/coverage-overlay.ts,
 * server-only) — el mismo patrón que ya usaba `CoverageOverlay`/
 * `GeneratedSolution` en este fichero, por el mismo motivo: un componente
 * cliente no puede importar un módulo que arrastra `import "server-only"`.
 * Nada impide que las dos diverjan salvo este test — misma disciplina que el
 * guardián de paridad de tres vías de GROUNDED_PROVIDERS (log §130): una
 * duplicación sin test es la que se queda atrás en silencio.
 */
describe("overlayCopyLocal — en paridad con el servidor", () => {
  const TYPES = ["add_citation_block", "increase_brand_visibility", "algún_tipo_sin_clasificar"] as const;
  const STATES = ["confirmed_surfacing_gap", "possible_content_gap", "none"] as const;

  it("coincide literalmente con overlayCopy para cada combinación de tipo y estado", () => {
    for (const type of TYPES) {
      for (const state of STATES) {
        expect(overlayCopyLocal(type, state), `${type} / ${state}`).toEqual(overlayCopy(type, state));
      }
    }
  });
});

describe("RecCard — el overlay de cobertura dice lo correcto según el tipo", () => {
  const overlay = (state: "confirmed_surfacing_gap" | "possible_content_gap") => ({
    state,
    verifiedPage: state === "confirmed_surfacing_gap" ? { url: "https://acme.com/precios", title: "Precios" } : null,
    confidenceOverride: null
  });

  it("increase_brand_visibility, hallazgo confirmado: habla de no aparecer en la respuesta, NUNCA de citación", () => {
    // La regresión que este test existe para impedir: este tipo dispara
    // cuando la marca no se menciona en absoluto, así que "la IA no lo está
    // citando como fuente" (el texto de add_citation_block) sería falso aquí
    // — no hay mención que citar.
    const html = renderToStaticMarkup(
      <RecCard
        projectId="p1"
        rec={baseRec({ recommendation_type: "increase_brand_visibility", coverageOverlay: overlay("confirmed_surfacing_gap") })}
      />
    );
    expect(html).toContain("no está apareciendo en la respuesta de la IA");
    expect(html).not.toContain("no lo está citando como fuente");
    expect(html).toContain("https://acme.com/precios");
  });

  it("add_citation_block, hallazgo confirmado: conserva su texto original sobre citación", () => {
    const html = renderToStaticMarkup(
      <RecCard
        projectId="p1"
        rec={baseRec({ recommendation_type: "add_citation_block", coverageOverlay: overlay("confirmed_surfacing_gap") })}
      />
    );
    expect(html).toContain("no lo está citando como fuente");
  });

  it("increase_brand_visibility, sin cobertura propia: reusa el first_step real de la regla, no un texto inventado", () => {
    const html = renderToStaticMarkup(
      <RecCard
        projectId="p1"
        rec={baseRec({ recommendation_type: "increase_brand_visibility", coverageOverlay: overlay("possible_content_gap") })}
      />
    );
    expect(html).toContain("publica una página que responda esta pregunta en las dos primeras frases");
  });
});
