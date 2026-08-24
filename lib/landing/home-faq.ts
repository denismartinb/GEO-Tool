/**
 * Las seis preguntas de la portada (HOME-2026-08 Fase C).
 *
 * **Viven aquí y no en el componente porque las consumen dos cosas**: la
 * sección que se lee y el `FAQPage` de datos estructurados que Google y los
 * motores generativos leen. Escritas dos veces divergirían, y el schema
 * afirmaría cosas que la página no dice — que es exactamente el fallo que el
 * producto audita en las webs de sus clientes.
 *
 * **Cada respuesta se verificó contra el código antes de publicarla**
 * (2026-08-22). Tres se apartan del artboard porque el artboard afirmaba de
 * más:
 *
 * 1. «una llamada real por prompt y por motor» → **al menos una**. Con
 *    muestreo (`lib/scan/sampling.ts`, ADR 0030) un plan de pago repite el
 *    conjunto de prompts hasta 5 veces para llegar al suelo de 50 respuestas.
 *    La cifra del artboard no era falsa, se quedaba corta.
 * 2. «y de forma continua» → **continuo en los planes de pago**. Un proyecto
 *    Free tiene UN escaneo y sólo uno: `runRecurringScanSweep` descarta los
 *    proyectos Free (`lib/scan/cron.ts`) y `createPendingScanRunCore` rechaza
 *    un segundo run. Decirle «de forma continua» a quien se acaba de registrar
 *    en Free sería prometerle algo que el backend no hace.
 * 3. «Cada fallo indica cuántos puntos recuperas» → **los que puntúan**.
 *    `llms_txt_missing` se emite siempre con `pointDelta: null`
 *    (`lib/web-audit/issues.ts`): el producto se niega a puntuarlo, y la
 *    sección oscura de esta misma página ya lo pinta como aviso (log §143).
 */

export type HomeFaqEntry = { q: string; a: string };

export const HOME_FAQ: readonly HomeFaqEntry[] = [
  {
    q: "¿Qué es el posicionamiento GEO?",
    a: "Es el trabajo de conseguir que los motores de IA nombren y citen tu marca cuando alguien les pregunta por tu categoría. El equivalente al SEO para un mundo en el que la respuesta ya no es una lista de enlaces, sino una recomendación. También se le llama AEO o «SEO para IA»."
  },
  {
    q: "¿Cómo sé si mi marca aparece en ChatGPT?",
    a: "Escribe tu dominio arriba y lo comprobamos gratis, sin registro: preguntamos a ChatGPT por tu categoría y te decimos si te nombra y qué marcas nombra en tu lugar. Es una foto de un motor; el escaneo completo repite la comprobación en Gemini y Claude, con tus prompts, y la repite de forma continua en los planes de pago."
  },
  {
    q: "¿Qué motores analiza GenScore?",
    a: "Hoy, ChatGPT, Gemini y Claude. Se ejecutan de verdad, con al menos una llamada real por prompt y por motor — no son estimaciones ni datos de terceros. Iremos sumando motores según cambie el mercado, y sin coste extra en tu plan."
  },
  {
    q: "¿En qué se diferencia de una herramienta de SEO?",
    a: "Una herramienta de SEO mide posiciones en Google. GenScore mide algo que Search Console no ve: si un modelo te menciona al responder. Y hay una diferencia más importante con las herramientas de monitorización de IA — ellas te dicen que no apareces; GenScore genera el FAQ, el schema o el contenido que falta para que empieces a aparecer."
  },
  {
    q: "¿Qué revisa la auditoría técnica?",
    a: "Recorre tu web página a página y comprueba lo que determina si un motor puede leerte y citarte: datos estructurados, llms.txt, sitemap, canonical, H1 único, si la introducción responde en las primeras líneas, la frescura del contenido y si los rastreadores de IA tienen acceso. Los fallos que puntúan te dicen cuántos puntos recuperas al corregirlos."
  },
  {
    q: "¿Cuánto tarda en notarse una mejora?",
    a: "Depende de qué cambies. Los arreglos técnicos se reflejan en el siguiente escaneo, porque dependen de tu web. Los cambios de contenido y de fuentes tardan más: los modelos incorporan páginas nuevas en cuestión de semanas, y reentrenan cada varios meses. Por eso GenScore escanea de forma continua — para que veas el movimiento en lugar de suponerlo."
  }
];

/** El `FAQPage` que acompaña a la sección, construido de la misma fuente. */
export function homeFaqJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a }
    }))
  });
}
