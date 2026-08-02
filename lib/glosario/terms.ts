/**
 * Single source of truth for /glosario entries (GROWTH-2 Fase 2.4, capa D).
 * First slice: 15 terms. Sorted alphabetically on the page, not in this
 * array, so new entries can be appended at the end without reordering.
 */
export type GlossaryTerm = {
  slug: string;
  term: string;
  definition: string;
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: "geo",
    term: "GEO (Generative Engine Optimization)",
    definition:
      "Optimizar el contenido y la presencia de una marca para aparecer en las respuestas de motores generativos (ChatGPT, Gemini, Claude, AI Overviews), no solo en los resultados de búsqueda tradicionales. A diferencia del SEO, no se mide en clics ni posiciones en una lista — se mide en si el modelo te menciona, te cita, y con qué prominencia."
  },
  {
    slug: "aeo",
    term: "AEO (Answer Engine Optimization)",
    definition:
      "Término hermano de GEO, centrado en optimizar contenido para motores que devuelven una respuesta directa en vez de una lista de enlaces — fragmentos destacados, asistentes de voz, AI Overviews. En la práctica, GEO y AEO comparten casi todas las mismas prácticas."
  },
  {
    slug: "geo-score",
    term: "GEO Score",
    definition:
      "La métrica compuesta de Genscore (0-100) que resume cómo aparece una marca en respuestas de IA, combinando presencia, prominencia, cuota de voz y autoridad. Metodología completa en la documentación."
  },
  {
    slug: "cuota-de-voz-en-ia",
    term: "Cuota de voz en IA (Share of Voice)",
    definition:
      "De toda la atención que un motor generativo reparte entre las marcas que menciona para un prompt, qué porcentaje es tuyo frente a tus competidores. Si ni tu marca ni ningún competidor rastreado aparece mencionado, no hay voz que repartir — la cuota se descarta en vez de asumir un valor por defecto."
  },
  {
    slug: "llms-txt",
    term: "llms.txt",
    definition:
      "Fichero en la raíz de un dominio (`/llms.txt`) que resume el sitio en lenguaje natural pensado para que un modelo lo consuma con facilidad al hacer grounding — el equivalente a robots.txt, pero dirigido a agentes de IA en vez de a rastreadores de búsqueda."
  },
  {
    slug: "grounding",
    term: "Grounding",
    definition:
      "Cuando un motor generativo respalda su respuesta con una búsqueda o una fuente real en vez de responder solo de memoria de su entrenamiento. Una respuesta \"grounded\" suele venir acompañada de citas o enlaces verificables."
  },
  {
    slug: "ai-overviews",
    term: "AI Overviews",
    definition:
      "El resumen generado por IA que Google muestra encima de los resultados de búsqueda tradicionales para ciertas consultas, combinando información de varias fuentes en una sola respuesta."
  },
  {
    slug: "prompt-tracking",
    term: "Prompt tracking",
    definition:
      "Monitorizar de forma repetida (diaria, semanal) cómo responde un motor generativo a un conjunto fijo de preguntas reales de tu categoría, para ver si la presencia o la posición de una marca cambia con el tiempo — el equivalente en GEO al rank tracking de palabras clave en SEO."
  },
  {
    slug: "rag",
    term: "RAG (Retrieval-Augmented Generation)",
    definition:
      "Arquitectura en la que un modelo generativo recupera documentos externos (una búsqueda, una base de datos) antes de generar su respuesta, en vez de depender solo de lo aprendido durante el entrenamiento. Es el mecanismo técnico detrás del grounding."
  },
  {
    slug: "datos-estructurados",
    term: "Datos estructurados (Schema.org)",
    definition:
      "Marcado JSON-LD o microdata en una página que describe explícitamente su contenido (artículo, producto, pregunta frecuente, término de un glosario) para que buscadores y modelos lo interpreten sin ambigüedad, en vez de tener que inferirlo del texto visible."
  },
  {
    slug: "url-canonica",
    term: "URL canónica",
    definition:
      "La URL que un sitio declara como versión \"oficial\" de una página, mediante la etiqueta `<link rel=\"canonical\">`, para evitar que buscadores traten copias o variantes con parámetros como contenido duplicado."
  },
  {
    slug: "citacion-en-ia",
    term: "Citación (en respuestas de IA)",
    definition:
      "Cuando la respuesta de un motor generativo enlaza o menciona explícitamente una fuente como respaldo de lo que afirma. Que una marca aparezca mencionada no garantiza que también sea citada — son señales distintas."
  },
  {
    slug: "analisis-de-sentimiento",
    term: "Análisis de sentimiento",
    definition:
      "Clasificar si una mención de marca en una respuesta de IA es positiva, neutra o negativa, más allá de si aparece o no. Una marca puede tener alta presencia y sentimiento negativo a la vez — son ejes distintos."
  },
  {
    slug: "eeat",
    term: "E-E-A-T",
    definition:
      "Experience, Expertise, Authoritativeness, Trustworthiness — el marco de Google para evaluar la calidad y credibilidad de un contenido. GEO hereda buena parte de este criterio porque los motores generativos también tienden a priorizar fuentes con autoridad real y verificable."
  },
  {
    slug: "fragmento-destacado",
    term: "Fragmento destacado (Featured snippet)",
    definition:
      "El bloque de respuesta directa que Google extrae de una página y muestra encima de los resultados orgánicos para ciertas búsquedas, sin que el usuario tenga que hacer clic."
  }
];
