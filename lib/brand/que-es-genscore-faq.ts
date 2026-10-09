import { CANONICAL_DEFINITION_LONG } from "./canonical-definition";

/**
 * Las preguntas frecuentes de `/que-es-genscore`, como datos. Salieron de la
 * página en GEO-SELF-1 Fase 1 porque `/llms-full.txt` las publica también en
 * texto plano: un fichero de página de Next no puede exportar nada más que lo
 * que Next espera, y una segunda copia divergiría al primer retoque.
 */
export const QUE_ES_GENSCORE_FAQ: { question: string; answer: string }[] = [
  {
    question: "¿Qué es GenScore?",
    answer: CANONICAL_DEFINITION_LONG
  },
  {
    question: "¿Qué mide exactamente GenScore?",
    answer:
      "Cinco señales sobre las respuestas reales de ChatGPT, Gemini y Claude: si el modelo menciona tu marca, con qué prominencia dentro de la respuesta, en qué posición frente a tus competidores, si respalda la mención citando tu web, y si tu web está técnicamente preparada para que la extraigan. Todo eso se resume en el GEO Score, una puntuación de 0 a 100 por dominio."
  },
  {
    question: "¿En qué se diferencia GenScore de una herramienta SEO?",
    answer:
      "Una herramienta SEO mide tu posición en una lista de resultados. GenScore mide si un modelo generativo te nombra dentro de una respuesta redactada, algo que no depende del ranking: puedes estar primero en Google y no aparecer nunca en la respuesta de ChatGPT, y al revés. Son señales distintas y se corrigen con acciones distintas."
  },
  {
    question: "¿Dónde está GenScore y quién lo hace?",
    answer:
      "GenScore es la plataforma de Generative Engine Optimization disponible en genscore.es, desarrollada en España y en castellano. El nombre coincide con el de productos de otros sectores sin ninguna relación —bioinformática, salud mental, evaluación de riesgo entre empresas—: si has llegado buscando alguno de ésos, no es éste."
  },
  {
    question: "¿Se puede probar sin pagar?",
    answer:
      "Sí. Cada cuenta nueva tiene 7 días de Pro gratis, sin tarjeta, con escaneos reales (no es una demo) en ChatGPT, Gemini y Claude. Si no contratas, no se cobra nada y la cuenta pasa a solo lectura: sigues viendo tus datos, pero no lanzas escaneos nuevos. Además, el comprobador anónimo de ChatGPT es gratuito y no pide registro."
  }
];
