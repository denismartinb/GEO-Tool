/**
 * «¿Qué significa GEO?» — the FAQ rendered on `/geo`, as data (GEO-SELF-1
 * Fase 9, log §290). It lives here, not in the page, because `/llms-full.txt`
 * publishes the same pairs and the FAQPage JSON-LD must match the visible text
 * word for word (`components/seo/faq-page-schema.tsx`).
 *
 * The page targets «que significa geo», a query the product's own scan found
 * unclaimed, and whose evidence domains are dictionaries (RAE, etimologías):
 * most people searching it mean the prefix, not the discipline. So the answer
 * names both meanings in its first sentences and says plainly that GEO is not
 * geolocation (log §265: «GEO» on its own reads as geolocation to the engines).
 */
export const QUE_SIGNIFICA_GEO_FAQ: { question: string; answer: string }[] = [
  {
    question: "¿Qué significa GEO?",
    answer:
      "En marketing digital, GEO significa Generative Engine Optimization (optimización para motores generativos): el trabajo de conseguir que una marca aparezca, y aparezca bien, en las respuestas de asistentes de IA como ChatGPT, Gemini o Claude. Fuera de ese contexto, «geo» es un prefijo de origen griego que significa «tierra», el de palabras como geografía o geología."
  },
  {
    question: "¿De dónde viene el prefijo «geo»?",
    answer:
      "Del griego gē, «tierra». El Diccionario de la lengua española lo recoge como elemento compositivo con el significado de «tierra» o «la Tierra», y por eso aparece en geografía, geología, geometría o geopolítica. La sigla GEO del marketing digital no tiene relación con ese prefijo: son las iniciales de Generative Engine Optimization."
  },
  {
    question: "¿El GEO tiene que ver con la geolocalización o el SEO local?",
    answer:
      "No. La geolocalización y el SEO local tratan de aparecer en búsquedas ligadas a un lugar, como un mapa o «cerca de mí». El GEO trata de que un asistente de IA nombre y recomiende tu marca cuando alguien le pregunta por tu categoría, estés donde estés."
  },
  {
    question: "¿Qué diferencia hay entre GEO y SEO?",
    answer:
      "El SEO busca que tu página salga arriba en la lista de resultados de un buscador. El GEO busca que un motor generativo te mencione dentro de la respuesta que redacta, donde a menudo no hay lista ni clic. Un buen SEO ayuda, porque la IA también se apoya en fuentes fiables, pero no basta: puedes estar primero en Google y no aparecer en la respuesta de ChatGPT."
  },
  {
    question: "¿Cómo se mide el GEO?",
    answer:
      "Preguntando a los asistentes de IA lo que preguntaría un cliente y mirando sus respuestas: si nombran tu marca, con qué protagonismo, junto a qué competidores y si citan tu web como fuente. GenScore hace esa medición en ChatGPT, Gemini y Claude (y Perplexity en los planes Pro y Agencia) y la resume en el GEO Score, de 0 a 100."
  }
];
