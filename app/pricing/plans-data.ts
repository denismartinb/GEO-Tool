// Packaging de GenScore: 4 tramos, precio único en euros, facturación mensual.
// Ejes de valor: bucle de acción + credibilidad — no el volumen de datos.

export type PlanCell = boolean | string;

export type PlanMeter = {
  projects: string;
  prompts: number;
  engines: number | string;
  refresh: string;
};

// Exact numeric caps enforced by lib/billing.ts usage bars — distinct from
// `meter`, which holds display strings/ranges ("3–5", "∞") for marketing copy.
export type PlanCaps = {
  projects: number;
  prompts: number;
  engines: number;
};

export type Plan = {
  id: "free" | "starter" | "pro" | "agency";
  name: string;
  price: number;
  /**
   * When set, every price surface shows this label instead of `price`
   * (founder decision 2026-07-18: Agencia must not advertise a concrete
   * price — it's negotiated per deal). `price` stays as the internal
   * reference figure only.
   */
  priceLabel?: string;
  period: string;
  tagline: string;
  who: string;
  cta: string;
  ctaStyle: "primary" | "ghost";
  recommended?: boolean;
  highlights: string[];
  meter: PlanMeter;
  caps: PlanCaps;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free / Scan",
    price: 0,
    period: "siempre",
    tagline: "Tu primer escaneo, gratis",
    who: "Pruébalo sin tarjeta",
    cta: "Escanear gratis",
    ctaStyle: "ghost",
    highlights: [
      "1 escaneo instantáneo, 1 dominio",
      "~10 prompts · 1 motor de IA",
      "GEO Score creíble + 3 acciones",
      "Sin tendencia ni monitorización"
    ],
    meter: { projects: "1", prompts: 10, engines: 1, refresh: "Puntual" },
    caps: { projects: 1, prompts: 10, engines: 1 }
  },
  {
    id: "starter",
    name: "Starter",
    price: 45,
    period: "mes",
    tagline: "Empieza a monitorizar",
    who: "Consultor o marca pequeña",
    cta: "Empezar con Starter",
    ctaStyle: "ghost",
    highlights: [
      "1 dominio · ~25 prompts",
      "3 motores de IA (Gemini, Claude y ChatGPT)",
      "Refresco semanal + tendencia",
      "Bucle de acción básico",
      "Credibilidad de medición visible"
    ],
    meter: { projects: "1", prompts: 25, engines: 3, refresh: "Semanal" },
    caps: { projects: 1, prompts: 25, engines: 3 }
  },
  {
    id: "pro",
    name: "Pro",
    price: 179,
    period: "mes",
    tagline: "El bucle de acción completo",
    who: "Equipo in-house o consultor avanzado",
    recommended: true,
    cta: "Probar Pro gratis",
    ctaStyle: "primary",
    highlights: [
      "5 dominios · ~100 prompts",
      "3 motores de IA (Gemini, Claude y ChatGPT) · refresco diario",
      "Nuevos motores incluidos sin coste extra cuando se publiquen",
      "Bucle de acción completo",
      "Generador de soluciones (FAQ, schema, briefs)"
    ],
    meter: { projects: "5", prompts: 100, engines: 3, refresh: "Diario" },
    caps: { projects: 5, prompts: 100, engines: 3 }
  },
  {
    id: "agency",
    name: "Agencia",
    price: 449,
    priceLabel: "Plan a medida",
    period: "mes",
    tagline: "Escala multi-cliente",
    who: "Agencias que reportan a sus clientes",
    cta: "Hablar con ventas",
    ctaStyle: "ghost",
    highlights: [
      "Dominios y prompts a medida (~300 de referencia)",
      "3 motores de IA (Gemini, Claude y ChatGPT) · refresco diario",
      "Volumen y condiciones adaptadas a tu agencia",
      "Onboarding acompañado antes de contratar"
    ],
    meter: { projects: "A medida", prompts: 300, engines: 3, refresh: "Diario" },
    caps: { projects: 999, prompts: 300, engines: 3 }
  }
];

// Matriz de comparación, agrupada por bloque de valor.
// Celdas: true = incluido · false = no · string = detalle/límite.
// Orden de columnas: free, starter, pro, agency.
export const PLAN_MATRIX: Array<{ group: string; rows: Array<{ label: string; vals: PlanCell[] }> }> = [
  {
    group: "Medición",
    rows: [
      { label: "Dominios", vals: ["1", "1", "5", "A medida"] },
      { label: "Prompts monitorizados", vals: ["~10", "~25", "~100", "~300"] },
      { label: "Motores de IA", vals: ["1", "3", "3", "3"] },
      { label: "Frecuencia de refresco", vals: ["Puntual", "Semanal", "Diario", "Diario"] },
      { label: "Tendencia temporal", vals: [false, true, true, true] },
      { label: "Usuarios del equipo", vals: ["1", "Ilimitados", "Ilimitados", "Ilimitados"] }
    ]
  },
  {
    group: "Análisis",
    rows: [
      { label: "Panorámica competitiva y cuota de voz", vals: [true, true, true, true] },
      { label: "Distribución por motor de IA", vals: ["1 motor", true, true, true] },
      { label: "Sentimiento y análisis de temas", vals: [false, false, true, true] },
      { label: "Citas y fuentes profundas", vals: [false, "Básico", true, true] },
      { label: "Detección de oportunidades de prompt", vals: [false, true, true, true] }
    ]
  },
  {
    group: "Acción",
    rows: [
      { label: "Bucle de acción priorizado", vals: ["3 acciones", true, true, true] },
      { label: "Recomendaciones basadas en evidencia", vals: [false, true, true, true] },
      { label: "Generador de soluciones", vals: [false, false, true, true] },
      { label: "Credibilidad de medición visible", vals: [true, true, true, true] }
    ]
  }
];

export const PLAN_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "¿Qué es el escaneo gratuito?",
    a: "Un análisis instantáneo de tu dominio: tu GEO Score, tu brecha frente a competidores y 3 acciones específicas. No pedimos tarjeta. Es la mejor forma de ver el diferenciador de GenScore antes de pagar nada."
  },
  {
    q: "¿Por qué cobráis por prompts y motores, y no por usuarios?",
    a: "Porque el valor está en cuánto monitorizas, no en cuánta gente lo mira. Los usuarios son ilimitados desde Starter. Pagas por prompts × motores × frecuencia de refresco — la unidad real de coste y de valor."
  },
  {
    q: "¿Puedo cambiar de plan en cualquier momento?",
    a: "Sí, desde \"Plan y facturación\" en tu cuenta, sin esperar a nadie. Mientras no activemos la facturación real, cambiar de plan no tiene coste ni compromiso de permanencia."
  },
  {
    q: "¿Qué incluye la prueba de Pro?",
    a: "Actualmente puedes activar Pro completo eligiendo ese plan al registrarte, sin tarjeta: el bucle de acción completo, el generador de soluciones y los motores de IA disponibles hoy. Mientras no lancemos la facturación no hay límite de tiempo automático — te avisaremos con antelación razonable antes de introducir el cobro."
  },
  {
    q: "¿Cómo se mide la fiabilidad de los datos?",
    a: "Cada métrica muestra su tamaño de muestra y metodología. No inflamos puntuaciones ni mostramos progreso falso: si la confianza de un dato es baja, lo verás. Es nuestro principio de credibilidad de medición."
  },
  {
    q: "¿Qué incluye el plan Agencia?",
    a: "Volumen de dominios y prompts a medida de tu cartera de clientes, con los mismos motores y frecuencia que Pro. Al ser un plan a medida, hablamos contigo antes de contratar para ajustar las condiciones a tu caso."
  }
];
