import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ResultRow } from "@/app/dashboard/projects/[projectId]/prompts/page";
import { PromptDrawer } from "./prompt-drawer";

/**
 * PROMPT-DRAWER-TRUTH-1 (log §147) — tests de render del cajón, escritos por
 * un motivo concreto: **el piloto agéntico no puede llegar a este estado.**
 *
 * La cuenta del piloto es de plan Free, y el tope de plan (`caps.engines`) la
 * deja en UN motor, así que su cajón siempre enseña una fila y un 0%. La
 * pasada del PR #466 lo confirmó: la captura existe, se abre, se ve entera en
 * las tres anchuras… y no ejercita nada de lo que este PR arregla, porque el
 * fallo —una mención de tres respuestas pintada como «100%»— necesita varias
 * respuestas para existir. Un verde ahí no era una verificación, y decir lo
 * contrario es exactamente lo que CLAUDE.md prohíbe («never report a pass for
 * something the pilot did not see»).
 *
 * Se renderiza de verdad con `react-dom/server`, como los componentes de
 * Auditoría web (log §87). Esto asegura CONTENIDO —qué cifra se publica y qué
 * texto la acompaña—, nunca aspecto: que la fila quepa a 375 px con la
 * fracción puesta sigue siendo trabajo del piloto el día que la cuenta tenga
 * más de un motor.
 */

function fila(overrides: Partial<ResultRow> & { id: string }): ResultRow {
  return {
    prompt_id: null,
    prompt_text_snapshot: "¿Cuál es la mejor herramienta para monitorizar mi marca en ChatGPT?",
    brand_mentioned: false,
    citation_found: false,
    mentioned_competitors_count: 0,
    citations_count: 0,
    sentiment: null,
    raw_response_text: null,
    extracted_json: null,
    extraction_error: null,
    category: "Comparación",
    provider: "gemini",
    sample_index: 0,
    brand_snapshot: "GenScore",
    brand_aliases_snapshot: [],
    ...overrides
  };
}

/** `extracted_json` de una respuesta que evaluó a `competidores`. */
function extraccion(input: {
  marcaMencionada: boolean;
  evidenciaMarca?: string[];
  competidores?: Array<{ name: string; mentioned: boolean }>;
}) {
  return {
    brand: {
      mentioned: input.marcaMencionada,
      display_name_found: input.marcaMencionada ? "GenScore" : null,
      evidence: input.evidenciaMarca ?? []
    },
    competitors: (input.competidores ?? []).map((c) => ({
      name: c.name,
      mentioned: c.mentioned,
      display_name_found: c.mentioned ? c.name : null,
      evidence: []
    })),
    citations: [],
    sentiment: "neutral"
  };
}

const props = {
  projectId: "p1",
  projectDomain: "genscore.es",
  projectBrand: "GenScore",
  onClose: () => {}
};

describe("PromptDrawer — la cobertura del ranking", () => {
  /**
   * El fallo original, tal y como el fundador lo fotografió: un motor de tres
   * dice «Mencionada», los otros dos «Ausente», y el ranking publicaba «100%».
   */
  it("un motor de tres no se publica como 100%", () => {
    const results: ResultRow[] = [
      fila({ id: "1", provider: "gemini", brand_mentioned: true, extracted_json: extraccion({ marcaMencionada: true, evidenciaMarca: ["GenScore mide tu visibilidad"] }) }),
      fila({ id: "2", provider: "openai", extracted_json: extraccion({ marcaMencionada: false }) }),
      fila({ id: "3", provider: "claude", extracted_json: extraccion({ marcaMencionada: false }) })
    ];

    const html = renderToStaticMarkup(<PromptDrawer {...props} results={results} competitors={[]} />);

    // Se busca el contenido de la celda, no la subcadena suelta: los SVG de
    // los iconos de motor llevan `width="100%"` y darían un falso negativo.
    expect(html).toContain(">33%<");
    expect(html).not.toContain(">100%<");
    // La fracción va visible al lado del porcentaje, no sólo en el `title`.
    expect(html).toContain(">1/3<");
    expect(html).toContain("Nombrada en 1 de 3 respuestas.");
  });

  it("con una sola respuesta no estorba con una fracción de uno", () => {
    const results: ResultRow[] = [
      fila({ id: "1", brand_mentioned: true, extracted_json: extraccion({ marcaMencionada: true }) })
    ];

    const html = renderToStaticMarkup(<PromptDrawer {...props} results={results} competitors={[]} />);

    expect(html).toContain(">100%<");
    expect(html).toContain("Nombrada en 1 de 1 respuesta.");
    expect(html).not.toContain(">1/1<");
  });

  /**
   * La distinción 0% (se evaluó y no salió) vs «—» (nadie la evaluó) sigue
   * viva en `mention-coverage.test.ts`, que ejercita `buildRanking` sin pasar
   * por el plegado del cajón. Aquí, en cambio, ninguna de las dos se ve
   * mencionada — así que el plegado de ceros (más abajo en este fichero) las
   * esconde a las dos por igual detrás del mismo botón, que es el
   * comportamiento correcto: el fundador pidió justo eso el 2026-08-23.
   */
  it("un competidor sin mención no aparece suelto — el plegado de ceros lo cubre", () => {
    const results: ResultRow[] = [
      fila({ id: "1", brand_mentioned: true, extracted_json: extraccion({ marcaMencionada: true, competidores: [{ name: "Otterly", mentioned: false }] }) })
    ];

    const html = renderToStaticMarkup(
      <PromptDrawer {...props} results={results} competitors={[
        { id: "c1", name: "Otterly", domain: "otterly.ai" },
        { id: "c2", name: "Semrush", domain: "semrush.com" }
      ]} />
    );

    expect(html).not.toContain(">Otterly<");
    expect(html).not.toContain(">Semrush<");
    expect(html).toContain("Ver 2 marcas más sin mención");
  });
});

describe("PromptDrawer — el ranking, columna y muro de ceros", () => {
  /**
   * Feedback en vivo sobre el preview de este mismo PR, 2026-08-23: la fila
   * propia decía «Tu marca» y el panel de evidencias, tres centímetros más
   * abajo, decía «Evidencias de mención de GenScore» — dos nombres para lo
   * mismo en la misma pantalla.
   */
  it("la fila propia lleva el nombre real de la marca, no el literal «Tu marca»", () => {
    const results: ResultRow[] = [
      fila({ id: "1", brand_mentioned: true, extracted_json: extraccion({ marcaMencionada: true }) })
    ];

    const html = renderToStaticMarkup(<PromptDrawer {...props} results={results} competitors={[]} />);

    expect(html).toContain(">GenScore<");
    expect(html).not.toContain(">Tu marca<");
  });

  it("la columna numérica lleva su rótulo encima", () => {
    const results: ResultRow[] = [
      fila({ id: "1", brand_mentioned: true, extracted_json: extraccion({ marcaMencionada: true }) })
    ];

    const html = renderToStaticMarkup(<PromptDrawer {...props} results={results} competitors={[]} />);

    expect(html).toContain("Aparición en motores");
  });

  /**
   * El caso que motivó esto: nueve marcas, ocho a 0%. El resumen dice cuántas
   * SÍ salieron y las no mencionadas se pliegan detrás de un botón — la marca
   * propia nunca, esté o no mencionada, porque es la razón de abrir el cajón.
   */
  it("las no mencionadas se pliegan; el resumen y el botón cuentan bien", () => {
    const results: ResultRow[] = [
      fila({
        id: "1",
        brand_mentioned: true,
        extracted_json: extraccion({
          marcaMencionada: true,
          competidores: [
            { name: "Otterly", mentioned: true },
            { name: "Semrush", mentioned: false },
            { name: "Pavesen", mentioned: false }
          ]
        })
      })
    ];

    const html = renderToStaticMarkup(
      <PromptDrawer {...props} results={results} competitors={[
        { id: "c1", name: "Otterly", domain: "otterly.ai" },
        { id: "c2", name: "Semrush", domain: "semrush.com" },
        { id: "c3", name: "Pavesen", domain: "pavesen.com" }
      ]} />
    );

    // Dos mencionadas (marca + Otterly) de cuatro filas totales.
    expect(html).toContain("2 de 4 marcas mencionadas en este prompt.");
    expect(html).toContain(">Otterly<");
    expect(html).not.toContain(">Semrush<");
    expect(html).not.toContain(">Pavesen<");
    expect(html).toContain("Ver 2 marcas más sin mención");
  });

  it("sin nada que ocultar, no aparece el botón", () => {
    const results: ResultRow[] = [
      fila({
        id: "1",
        brand_mentioned: true,
        extracted_json: extraccion({ marcaMencionada: true, competidores: [{ name: "Otterly", mentioned: true }] })
      })
    ];

    const html = renderToStaticMarkup(
      <PromptDrawer {...props} results={results} competitors={[{ id: "c1", name: "Otterly", domain: "otterly.ai" }]} />
    );

    expect(html).not.toContain("sin mención");
  });
});

describe("PromptDrawer — la evidencia que no se puede recuperar", () => {
  /**
   * El 10% de las menciones verificadas no deja una cita utilizable. Antes la
   * sección entera desaparecía, dejando «La IA menciona tu marca» en verde sin
   * nada debajo — que es lo que hace pensar al usuario que la cifra es
   * inventada.
   */
  it("una mención verificada sin cita lo dice, en vez de esconder la sección", () => {
    const results: ResultRow[] = [
      fila({ id: "1", brand_mentioned: true, extracted_json: extraccion({ marcaMencionada: true, evidenciaMarca: [] }) })
    ];

    const html = renderToStaticMarkup(<PromptDrawer {...props} results={results} competitors={[]} />);

    expect(html).toContain("Evidencias de mención de GenScore");
    expect(html).toContain("no dejó una cita textual recuperable");
  });

  it("cuando hay cita, se publica la cita y no el aviso", () => {
    const results: ResultRow[] = [
      fila({ id: "1", brand_mentioned: true, extracted_json: extraccion({ marcaMencionada: true, evidenciaMarca: ["GenScore mide tu visibilidad en IA"] }) })
    ];

    const html = renderToStaticMarkup(<PromptDrawer {...props} results={results} competitors={[]} />);

    expect(html).toContain("GenScore mide tu visibilidad en IA");
    expect(html).not.toContain("no dejó una cita textual recuperable");
  });

  /**
   * Una fila cuya extracción falló conserva el valor ingenuo de
   * `prompt-job.ts` en `brand_mentioned` (una subcadena, sin verificar). Decir
   * «mención verificada» de eso sería afirmar algo que nadie comprobó
   * (MENTION-VERIFY-1, docs/adr/0021).
   */
  it("una extracción fallida no se presenta como mención verificada", () => {
    const results: ResultRow[] = [
      fila({ id: "1", brand_mentioned: true, extracted_json: null, extraction_error: "timeout: …" })
    ];

    const html = renderToStaticMarkup(<PromptDrawer {...props} results={results} competitors={[]} />);

    expect(html).not.toContain("no dejó una cita textual recuperable");
    expect(html).not.toContain("Evidencias de mención de GenScore");
  });
});
