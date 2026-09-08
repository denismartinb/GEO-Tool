import { PLANS } from "@/app/pricing/plans-data";

/**
 * GROWTH-2 Fase 2.4 — datos de la comparativa GenScore vs Otterly.
 *
 * Fuente de los datos de Otterly: información pública de terceros (reseñas
 * y páginas de precios independientes) consultada el 2 de agosto de 2026 —
 * ver la nota de fecha en la propia página. Los precios y límites de
 * GenScore vienen de app/pricing/plans-data.ts, la misma fuente que usa
 * /pricing — no se reescriben a mano.
 *
 * TRUST-PROMISES-1 (docs/external-audit-2026-08.md, Fase 2): ese último
 * párrafo era una promesa que el fichero no cumplía todavía — la fila de
 * precio de abajo era el literal "179 €/mes", no una lectura de `PLANS`.
 * Ahora sí lo es.
 */
const PRO_PRICE = PLANS.find((p) => p.id === "pro")!.price;

export const OTTERLY_RESEARCH_DATE = "2 de agosto de 2026";

export const COMPARISON_ROWS: {
  label: string;
  genscore: string;
  otterly: string;
  otterlyWins?: boolean;
  genscoreWins?: boolean;
}[] = [
  {
    label: "Precio de entrada",
    genscore: "Gratis (escaneo permanente, sin tarjeta)",
    otterly: "Desde 29 $/mes — sin plan gratuito",
    genscoreWins: true
  },
  {
    label: "Precio equivalente a ~100 prompts",
    genscore: `${PRO_PRICE} €/mes (plan Pro)`,
    otterly: "189 $/mes (plan Standard)"
  },
  {
    label: "Motores de IA cubiertos",
    genscore: "3 en planes de pago (Gemini, Claude, ChatGPT), 1 en Free",
    otterly: "Hasta 6 motores nominalmente — pero Gemini y Google AI Mode son add-ons con coste extra, no incluidos en el precio base",
    otterlyWins: true
  },
  {
    label: "Cobertura geográfica multi-país",
    genscore: "No — GEO Score por dominio, sin desglose por país",
    otterly: "Sí, seguimiento en más de 50 mercados",
    otterlyWins: true
  },
  {
    label: "Idioma de la interfaz y del producto",
    genscore: "Castellano nativo",
    otterly: "Inglés",
    genscoreWins: true
  },
  {
    label: "Bucle de acción",
    genscore: "Recomendaciones basadas en evidencia + generador de soluciones (FAQ, schema, briefs) incluido desde Pro",
    otterly: "Centrado en monitorización, auditoría GEO y reporting — sin generador de acciones/soluciones documentado públicamente",
    genscoreWins: true
  },
  {
    label: "Usuarios de equipo en el plan de entrada",
    genscore: "1 (ilimitados desde Starter)",
    otterly: "Ilimitados ya en el plan Lite de 29 $",
    otterlyWins: true
  }
];
