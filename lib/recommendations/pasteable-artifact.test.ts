import { describe, expect, it } from "vitest";
import {
  CODE_ARTIFACT_MAX,
  PROSE_ARTIFACT_MAX,
  checkPasteableArtifact,
  classifyArtifact,
  jsonPayloadOf,
  trimProseAtWordBoundary
} from "@/lib/recommendations/pasteable-artifact";

/**
 * El fixture no es inventado: es el artefacto que el producto ofreció con un
 * botón «Copiar» el 2026-08-20 para el propio proyecto `genscore.es`,
 * reproducido tal cual llegó — cortado dentro de la segunda respuesta, sin
 * cerrar el objeto ni el `</script>`. 1.182 caracteres contra un tope de 1.200
 * (log §126).
 */
const ARTEFACTO_DEL_INCIDENTE = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "¿Cómo optimizo la web para aparecer en ChatGPT y Gemini?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Para optimizar tu web y aparecer en ChatGPT y Gemini, enfócate en crear contenido claro, conciso y bien estructurado."
      }
    },
    {
      "@type": "Question",
      "name": "¿Cómo sé si mi web está optimizada para posicionar en la IA?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Puedes evaluar la optimización de tu web para IA revisando la claridad y la estructura de tu contenido. Verifica si tus páginas responden directamente a preguntas comunes, si utilizan un lenguaje sencillo y si están bien organizadas con HTML se`;

const FAQ_COMPLETA = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "¿Cada cuánto conviene auditar?",
      "acceptedAnswer": { "@type": "Answer", "text": "Una vez al mes basta para la mayoría de sitios." }
    }
  ]
}
</script>`;

describe("checkPasteableArtifact", () => {
  it("rechaza el artefacto real del incidente en vez de ofrecerlo para copiar", () => {
    const result = checkPasteableArtifact(ARTEFACTO_DEL_INCIDENTE);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("invalid_json");
  });

  it("acepta un FAQPage completo dentro de su etiqueta script", () => {
    const result = checkPasteableArtifact(FAQ_COMPLETA);

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.kind).toBe("json");
    expect(result.ok === true && result.content).toBe(FAQ_COMPLETA);
  });

  it("acepta JSON-LD suelto, sin envoltorio de script", () => {
    const result = checkPasteableArtifact('{"@context":"https://schema.org","@type":"Organization","name":"GenScore"}');

    expect(result.ok).toBe(true);
  });

  it("acepta JSON-LD dentro de una valla de markdown cerrada", () => {
    const result = checkPasteableArtifact('```json\n{"@context":"https://schema.org","@type":"Article"}\n```');

    expect(result.ok).toBe(true);
  });

  it("rechaza un objeto JSON que se queda sin cerrar", () => {
    const result = checkPasteableArtifact('{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [');

    expect(result.ok === false && result.reason).toBe("invalid_json");
  });

  it("rechaza un script de ld+json al que le falta el cierre", () => {
    const result = checkPasteableArtifact('<script type="application/ld+json">\n{"@type":"FAQPage"}');

    expect(result.ok === false && result.reason).toBe("invalid_json");
  });

  it("NUNCA trunca un artefacto de código: por encima del tope lo descarta entero", () => {
    const enorme = `{"@context":"https://schema.org","relleno":"${"x".repeat(CODE_ARTIFACT_MAX)}"}`;
    const result = checkPasteableArtifact(enorme);

    expect(result.ok === false && result.reason).toBe("too_long");
  });

  it("un FAQPage de dos preguntas en castellano cabe en el tope nuevo (no cabía en el viejo)", () => {
    const dosPreguntas = `<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [1, 2].map((n) => ({
      "@type": "Question",
      name: `¿Pregunta número ${n} sobre visibilidad de marca en respuestas de IA?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: "Una respuesta de las que este producto pide: directa, con un dato concreto y sin relleno, en torno a las cuatrocientas palabras contadas con holgura para que quepa el caso real.".repeat(
          2
        )
      }
    }))
  },
  null,
  2
)}
</script>`;

    expect(dosPreguntas.length).toBeGreaterThan(1_200);
    expect(checkPasteableArtifact(dosPreguntas).ok).toBe(true);
  });

  it("rechaza marcado que termina dentro de una etiqueta abierta", () => {
    const result = checkPasteableArtifact("<section>\n  <h2>Preguntas frecuentes</h2>\n  <div class=");

    expect(result.ok === false && result.reason).toBe("unterminated_markup");
  });

  it("acepta marcado bien terminado", () => {
    const result = checkPasteableArtifact("<h2>¿Qué es GEO?</h2>\n<p>Optimizar para respuestas generativas.</p>");

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.kind).toBe("markup");
  });

  it("rechaza un artefacto vacío", () => {
    expect(checkPasteableArtifact("   \n  ").ok).toBe(false);
  });
});

describe("prosa", () => {
  it("se recorta por límite de palabra, nunca por el medio de una", () => {
    const largo = "palabra ".repeat(400).trim();
    const result = checkPasteableArtifact(largo);

    expect(result.ok).toBe(true);
    const content = result.ok === true ? result.content : "";
    expect(content.length).toBeLessThanOrEqual(PROSE_ARTIFACT_MAX);
    expect(content.endsWith("palabra")).toBe(true);
  });

  it("la prosa que cabe no se toca", () => {
    const parrafo = "GenScore mide la visibilidad de una marca en ChatGPT, Gemini y Claude.";
    const result = checkPasteableArtifact(parrafo);

    expect(result.ok === true && result.content).toBe(parrafo);
  });

  it("trimProseAtWordBoundary no alarga nunca el texto", () => {
    expect(trimProseAtWordBoundary("corto", 100)).toBe("corto");
    expect(trimProseAtWordBoundary("unapalabramuylargasinespacios", 10)).toHaveLength(10);
  });
});

describe("classifyArtifact / jsonPayloadOf", () => {
  it("distingue las tres formas", () => {
    expect(classifyArtifact('{"a":1}')).toBe("json");
    expect(classifyArtifact(FAQ_COMPLETA)).toBe("json");
    expect(classifyArtifact("<p>hola</p>")).toBe("markup");
    expect(classifyArtifact("Un párrafo citable con un dato.")).toBe("prose");
  });

  it("un script de ld+json sin cierre pretende ser JSON, así que no se ignora", () => {
    expect(jsonPayloadOf('<script type="application/ld+json">{"a":1}')).toBe("");
    expect(classifyArtifact('<script type="application/ld+json">{"a":1}')).toBe("json");
  });

  it("una valla sin cerrar con JSON cortado se juzga como JSON, no se cuela como prosa", () => {
    const cortado = '```json\n{"a": 1';

    expect(classifyArtifact(cortado)).toBe("json");
    const result = checkPasteableArtifact(cortado);
    expect(result.ok === false && result.reason).toBe("invalid_json");
  });
});
