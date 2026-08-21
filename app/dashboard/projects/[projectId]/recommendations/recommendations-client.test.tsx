import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { RecCard, SolutionPanel, type Recommendation } from "./recommendations-client";

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
