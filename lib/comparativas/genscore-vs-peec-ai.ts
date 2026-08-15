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
 * app/pricing/plans-data.ts, la misma fuente que usa /pricing.
 */
export const PEEC_RESEARCH_DATE = "3 de agosto de 2026";

export const COMPARISON_ROWS: {
  label: string;
  genscore: string;
  peec: string;
  peecWins?: boolean;
  genscoreWins?: boolean;
}[] = [
  {
    label: "Precio de entrada",
    genscore: "Gratis (escaneo permanente, sin tarjeta)",
    peec: "Desde ~95 $/mes — sin plan gratuito (cifra pública, confírmala en peec.ai antes de decidir)",
    genscoreWins: true
  },
  {
    label: "Coste de añadir motores de IA",
    genscore: "3 motores incluidos sin coste extra desde el plan Starter (Gemini, Claude, ChatGPT)",
    peec: "Añadir motores más allá de los incluidos en el plan tiene coste de add-on aparte — la cifra exacta varía según la fuente consultada",
    genscoreWins: true
  },
  {
    label: "Cobertura multi-país / multi-idioma",
    genscore: "No — el GEO Score es por dominio, sin desglose por país o idioma",
    peec: "Sí — mismo precio para lanzar prompts en cualquier idioma o desde cualquier país, sin coste adicional",
    peecWins: true
  },
  {
    label: "Usuarios de equipo en el plan de entrada de pago",
    genscore: "1 (ilimitados desde Starter)",
    peec: "Ilimitados ya en su plan de entrada",
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
    peec: "Documentación e interfaz observadas en inglés — sin versión en castellano confirmada",
    genscoreWins: true
  }
];
