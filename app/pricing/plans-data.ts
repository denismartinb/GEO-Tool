// Packaging de GenScore: 4 tramos, precio único en euros, facturación mensual.
// Ejes de valor: bucle de acción + credibilidad — no el volumen de datos.

/**
 * FOUNDER-PRICE-1 (fundador, 2026-10-09, log §237). Sustituye a la promo de
 * lanzamiento de PRICING-PROMO-1 (−58 %/−67 % durante 6 meses con fecha de
 * corte, prorrogada dos veces): un precio tachado del 67 % en una marca sin
 * clientes se leía como precio inflado, y una fecha que se mueve deja de
 * crear urgencia en cuanto alguien lo nota.
 *
 * Ahora: precio normal real (`price`) y un precio fundador (`promoPrice`)
 * PARA SIEMPRE para las primeras `FOUNDER_SLOTS` suscripciones. La escasez es
 * real y comprobable: la cuenta sale de `times_redeemed` de los cupones de
 * Stripe (`getFounderOffer`, `lib/stripe.ts`), y cuando se agotan la oferta
 * desaparece sola de todas las pantallas sin que nadie tenga que acordarse.
 */
export const FOUNDER_SLOTS = 50;

/**
 * PROMO-CONSOLE-PARITY-1 (2026-08-27) — qué precio promocional enseña una
 * pantalla, en un solo sitio.
 *
 * Hay DOS promociones distintas y la consola sólo conocía una:
 *
 * - la **contratada**: un cupón vivo en una suscripción real de Stripe, con su
 *   fecha de fin leída de la propia suscripción (`getActiveSubscriptionPromo`,
 *   §152). Es lo que el cliente YA paga.
 * - la **ofrecida**: el precio fundador, para quien todavía no tiene
 *   suscripción, mientras queden plazas.
 *
 * Quien está probando Pro gratis no tiene suscripción, así que no tenía la
 * primera — y la consola le cotizaba el precio normal mientras `/precios` y el
 * modal de cambio de plan, a dos clics, le decían el rebajado (fundador,
 * 2026-08-27).
 *
 * Devuelve el precio y CUÁL de las dos es, porque el copy no puede ser el
 * mismo: confundirlas le diría a alguien en prueba que ya está pagando el
 * precio fundador. `promoPlanIds` viene de `getActivePromoPlanIds()`, que
 * exige un cupón de Stripe con la forma exacta del precio mostrado y plazas
 * libres — así ninguna pantalla anuncia un descuento que el checkout no
 * aplicaría.
 */
export function resolveShownPromoPrice({
  plan,
  activePromoPrice,
  promoPlanIds
}: {
  plan: Pick<Plan, "id" | "promoPrice"> | null | undefined;
  /** De la suscripción real, vía `usage.subscriptionPromo`. */
  activePromoPrice?: number | null;
  promoPlanIds: readonly string[];
}): { price: number; kind: "contracted" | "offered" } | null {
  if (typeof activePromoPrice === "number") return { price: activePromoPrice, kind: "contracted" };
  if (!plan || plan.promoPrice === undefined) return null;
  if (!promoPlanIds.includes(plan.id)) return null;
  return { price: plan.promoPrice, kind: "offered" };
}

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
  /**
   * FOUNDER-PRICE-1: precio fundador, para siempre, mientras queden plazas y
   * Stripe tenga un cupón `forever` de exactamente `price − promoPrice`
   * (`lib/stripe.ts`, `getFounderOffer`) — nunca se muestra sin él, para que
   * la pantalla no prometa un descuento que el checkout no puede dar.
   */
  promoPrice?: number;
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
    price: 29,
    promoPrice: 20,
    period: "mes",
    tagline: "Empieza a monitorizar",
    who: "Consultor o marca pequeña",
    cta: "Empezar con Starter",
    ctaStyle: "ghost",
    highlights: [
      "1 dominio · ~25 prompts",
      "3 motores de IA (Gemini, Claude y ChatGPT)",
      "Escaneo semanal + evolución",
      "Bucle de acción básico",
      "Credibilidad de medición visible"
    ],
    meter: { projects: "1", prompts: 25, engines: 3, refresh: "Semanal" },
    caps: { projects: 1, prompts: 25, engines: 3 }
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    promoPrice: 69,
    period: "mes",
    tagline: "El bucle de acción completo",
    who: "Equipo in-house o consultor avanzado",
    recommended: true,
    cta: "Probar Pro gratis",
    ctaStyle: "primary",
    highlights: [
      "5 dominios · ~100 prompts",
      "3 motores de IA (Gemini, Claude y ChatGPT) · escaneo diario",
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
      "3 motores de IA (Gemini, Claude y ChatGPT) · escaneo diario",
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
      { label: "Frecuencia de escaneo", vals: ["Puntual", "Semanal", "Diario", "Diario"] },
      { label: "Tendencia temporal", vals: [false, true, true, true] }
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
    q: "¿Por qué cobráis por prompts y motores?",
    a: "Porque el valor está en cuánto monitorizas, no en un precio plano. Pagas por prompts × motores × frecuencia de escaneo — la unidad real de coste y de valor."
  },
  {
    q: "¿Puedo cambiar de plan en cualquier momento?",
    a: "Sí, desde \"Plan y facturación\" en tu cuenta, sin esperar a nadie. No hay permanencia: si cancelas, mantienes tu plan hasta el final del periodo ya pagado y no se te vuelve a cobrar."
  },
  {
    q: "¿Qué incluye la prueba de Pro?",
    a: "Al registrarte tienes 7 días de Pro completo, sin tarjeta: el bucle de acción completo, el generador de soluciones y los motores de IA disponibles hoy. Si al terminar no contratas, tu cuenta pasa sola al plan Free, sin ningún cobro."
  },
  {
    q: "¿Qué es el precio fundador?",
    a: `Las primeras ${FOUNDER_SLOTS} suscripciones pagan un precio rebajado para siempre, no durante unos meses: mientras mantengas tu suscripción, tu precio no sube. Cuando se ocupan las ${FOUNDER_SLOTS} plazas, la oferta desaparece y se aplica el precio normal.`
  },
  {
    q: "¿Qué incluye el plan Agencia?",
    a: "Volumen de dominios y prompts a medida de tu cartera de clientes, con los mismos motores y frecuencia que Pro. Al ser un plan a medida, hablamos contigo antes de contratar para ajustar las condiciones a tu caso."
  }
];
