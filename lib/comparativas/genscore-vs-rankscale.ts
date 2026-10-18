import { PLANS } from "@/app/pricing/plans-data";
import type { Source } from "./sources";

/**
 * RECS-TEST-1 (log §324): comparativa GenScore vs RankScale, pedida por una
 * recomendación de la consola. Todos los datos de RankScale salen de su propia
 * web (rankscale.ai y rankscale.ai/pricing), consultada el 18 de octubre de
 * 2026; lo que esa web no dice se marca «no consta», nunca se supone. Los
 * precios y motores de GenScore salen de `plans-data.ts`.
 */
const STARTER_PRICE = PLANS.find((p) => p.id === "starter")!.price;
const PRO_PRICE = PLANS.find((p) => p.id === "pro")!.price;

export const RANKSCALE_RESEARCH_DATE = "18 de octubre de 2026";

export const SOURCES: Record<string, Source> = {
  home: {
    label: "RankScale, página principal (motores, regiones y funciones)",
    url: "https://rankscale.ai",
    consulted: "2026-10-18",
    primary: true
  },
  pricing: {
    label: "RankScale, página de precios (planes, créditos y prueba)",
    url: "https://rankscale.ai/pricing",
    consulted: "2026-10-18",
    primary: true
  }
};

export const COMPARISON_ROWS: {
  label: string;
  genscore: string;
  rankscale: string;
  rankscaleWins?: boolean;
  genscoreWins?: boolean;
}[] = [
  {
    label: "Precio de entrada",
    genscore: `Desde ${STARTER_PRICE} €/mes, con 7 días de Pro gratis y sin tarjeta para probar`,
    rankscale: "Desde 17 $/mes (plan Essentials, sólo con pago anual; sus límites no constan en la web)",
    rankscaleWins: true
  },
  {
    label: "Plan comparable de gama media",
    genscore: `${PRO_PRICE} €/mes (plan Pro)`,
    rankscale: "99 $/mes (plan Pro, con 10 paneles de marca y 50 auditorías de página)"
  },
  {
    label: "Motores de IA cubiertos",
    genscore: "4 en Pro y Agencia (ChatGPT, Gemini, Claude y Perplexity) y 3 en Starter",
    rankscale: "17 o más, entre ellos AI Overviews, AI Mode, Grok, Copilot, DeepSeek y Mistral",
    rankscaleWins: true
  },
  {
    label: "Regiones e idiomas",
    genscore: "Puntuación por dominio, sin desglose por país",
    rankscale: "Más de 240 regiones e idiomas",
    rankscaleWins: true
  },
  {
    label: "Idioma de la interfaz",
    genscore: "Castellano nativo",
    rankscale: "No consta una versión en castellano en su web",
    genscoreWins: true
  },
  {
    label: "Bucle de acción",
    genscore: "Recomendaciones basadas en evidencia y generador de soluciones (FAQ, schema, briefs) desde Pro",
    rankscale: "Recomendaciones (en beta) y auditorías de página; no consta un generador de soluciones",
    genscoreWins: true
  },
  {
    label: "Prueba gratuita",
    genscore: "7 días de Pro, sin tarjeta",
    rankscale: "7 días de Pro; no indica si pide tarjeta"
  }
];

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "¿Qué herramientas hay para saber si mi empresa aparece en ChatGPT y otros asistentes de IA?",
    answer:
      "Hay varias. RankScale cubre 17 o más motores y más de 240 regiones e idiomas, con un plan de entrada desde 17 $ al mes con pago anual. GenScore mide ChatGPT, Gemini y Claude (y Perplexity en Pro y Agencia), está en castellano y propone qué cambiar en tu web para que te nombren."
  },
  {
    question: "¿Qué herramienta de GEO conviene a una empresa en España?",
    answer:
      `Si necesitas muchos motores y mercados, RankScale ofrece más cobertura. Si trabajas sobre todo en castellano y quieres recomendaciones concretas, GenScore empieza en ${STARTER_PRICE} € al mes con 7 días de Pro gratis y sin tarjeta. Aquí GEO significa optimización para motores de IA.`
  },
  {
    question: "¿Cuánto cuesta RankScale frente a GenScore?",
    answer:
      `RankScale va de 17 $ al mes (Essentials, pago anual) a 99 $ en Pro, con planes superiores. GenScore va de ${STARTER_PRICE} € en Starter a ${PRO_PRICE} € en Pro. Los límites de cada plan no son equivalentes, así que compara también la tabla.`
  }
];
