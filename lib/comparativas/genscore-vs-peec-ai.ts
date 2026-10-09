/**
 * GROWTH-2 Fase 2.6c — datos de la comparativa GenScore vs Peec AI.
 *
 * Fuente de los datos de Peec AI: `seo-geo-research` (2026-08-03) — búsqueda
 * agregada de reseñas y páginas de precios independientes; peec.ai/pricing y
 * G2 devolvieron 403 al intentar leerlos directamente, así que ningún dato
 * viene de la fuente primaria de primera mano. Varias fuentes secundarias
 * discreparon en cifras exactas (qué motores incluye el plan base, coste
 * exacto de motores adicionales, duración del trial) — esas cifras NO se
 * publican como hechos, solo lo que dos o más fuentes independientes
 * corroboran. Los precios y límites de GenScore vienen de
 * app/pricing/plans-data.ts, la misma fuente que usa /precios.
 *
 * Refresco del 2026-10-09 (GEO-SELF-1 Fase 2, log §257): peec.ai/pricing ya
 * carga, aunque sigue sin mostrar importes. De ahí salen los modelos (3 a
 * elegir en los planes de autoservicio), los países e idiomas por plan y los
 * usuarios ilimitados; el importe de entrada es de PricingSaaS (último visto
 * el 14-09-2026, facturación anual) y se publica como orientativo. La fila de
 * "multi-país al mismo precio" no era cierta: Starter cubre 1 país y 1 idioma.
 */
import { PLANS } from "@/app/pricing/plans-data";

const STARTER_PRICE = PLANS.find((p) => p.id === "starter")!.price;

export const PEEC_RESEARCH_DATE = "9 de octubre de 2026";

export const COMPARISON_ROWS: {
  label: string;
  genscore: string;
  peec: string;
  peecWins?: boolean;
  genscoreWins?: boolean;
}[] = [
  {
    label: "Precio de entrada",
    genscore: `Desde ${STARTER_PRICE} €/mes, con 7 días de Pro gratis y sin tarjeta para probar`,
    peec:
      "Su web no publica importes. Orientativo, según PricingSaaS (último visto el 14-09-2026): desde unos 80 $/mes con facturación anual",
    genscoreWins: true
  },
  {
    label: "Coste de añadir motores de IA",
    genscore: "3 motores incluidos sin coste extra desde el plan Starter (Gemini, Claude, ChatGPT)",
    peec:
      "Starter, Pro y Advanced: 3 modelos a elegir entre ChatGPT, AI Mode, AI Overviews, Copilot, Gemini y Naver AI; más modelos como complemento de pago, y Claude sólo en Enterprise",
    genscoreWins: true
  },
  {
    label: "Cobertura multi-país / multi-idioma",
    genscore: "No — el GEO Score es por dominio, sin desglose por país o idioma",
    peec: "Sí, por plan: Starter 1 país y 1 idioma; Pro 3 países y 2 idiomas; Advanced 3 países y 3 idiomas",
    peecWins: true
  },
  {
    label: "Usuarios de equipo en el plan de entrada de pago",
    genscore: "1 (ilimitados desde Starter)",
    peec: "Ilimitados en todos sus planes de autoservicio",
    peecWins: true
  },
  {
    label: "Bucle de acción",
    genscore: "Recomendaciones basadas en evidencia + generador de soluciones (FAQ, schema, briefs) incluido desde Pro",
    peec: "Función \"Actions\": prioriza oportunidades y sugiere qué publicar u optimizar, pero no genera el contenido — la creación queda en tus manos",
    genscoreWins: true
  },
  {
    label: "Idioma de la interfaz y del producto",
    genscore: "Castellano nativo",
    peec: "No consta una versión en castellano — su web no menciona idiomas de interfaz y la que hemos visto está en inglés",
    genscoreWins: true
  }
];
