// Packaging de GenScore: 4 tramos, precio único en euros, facturación mensual.
// Ejes de valor: bucle de acción + credibilidad — no el volumen de datos.

/**
 * PRICING-PROMO-1 (Task Intake aprobado 2026-08-24). El cupón de Stripe que
 * de verdad aplica el descuento (`STRIPE_COUPON_ID_STARTER_PROMO`/`_PRO_PROMO`,
 * ver `lib/stripe.ts`) lleva su propio `redeem_by` a esta misma fecha — es la
 * aplicación real. Esta constante es sólo lo que decide qué muestra la
 * pantalla, para que ambas cosas dejen de anunciar la promo el mismo instante
 * en vez de depender de que alguien recuerde apagar dos sitios.
 */
// PROMO-EXTEND-OCT-1 (fundador, 2026-09-28, log §231): hasta el final del
// 31 de octubre. +01:00 porque el 25 de octubre España ya ha vuelto a horario
// de invierno; 23:59:59 para que el día anunciado ("31 oct") sea válido entero.
export const PROMO_ENDS_AT = "2026-10-31T23:59:59+01:00";

/**
 * Duración real del descuento en los cupones de Stripe (`duration: repeating`,
 * `duration_in_months: 6`) — no es un adorno de copy, es lo que Stripe factura
 * de verdad cada mes hasta que se cumplen los 6, así que cualquier pantalla
 * que muestre el precio promo tiene que decir esto junto a él.
 */
export const PROMO_DURATION_MONTHS = 6;

/**
 * PROMO-CONSOLE-PARITY-1 (2026-08-27) — qué precio promocional enseña una
 * pantalla, en un solo sitio.
 *
 * Hay DOS promociones distintas y la consola sólo conocía una:
 *
 * - la **contratada**: un cupón vivo en una suscripción real de Stripe, con su
 *   fecha de fin leída de la propia suscripción (`getActiveSubscriptionPromo`,
 *   §152). Es lo que el cliente YA paga.
 * - la **ofrecida**: la campaña abierta, para quien todavía no tiene
 *   suscripción. Es lo que pagaría si contrata antes de `PROMO_ENDS_AT`.
 *
 * Quien está probando Pro gratis no tiene suscripción, así que no tenía la
 * primera — y la consola le cotizaba 179 €/mes mientras `/precios` y el modal
 * de cambio de plan, a dos clics, le decían 59 € (fundador, 2026-08-27).
 *
 * Devuelve el precio y CUÁL de las dos es, porque el copy no puede ser el
 * mismo: confundirlas le diría a alguien en prueba que ya está pagando 59 €.
 * `promoPlanIds` viene de `getActivePromoPlanIds()`, que exige fecha **y**
 * cupón configurado en Stripe — así ninguna pantalla anuncia un descuento que
 * el checkout no aplicaría.
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

export function isPromoActive(now: Date = new Date()): boolean {
  return now.getTime() < new Date(PROMO_ENDS_AT).getTime();
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
   * PRICING-PROMO-1: precio mientras `isPromoActive()` sea cierto y Stripe
   * tenga configurado el cupón correspondiente (`lib/stripe.ts`,
   * `getActivePromoPlanIds`) — nunca se muestra solo porque la fecha lo
   * permita, para que la pantalla no prometa un descuento que el checkout no
   * puede dar.
   */
  promoPrice?: number;
  period: string;
  tagline: string;
  who: string;
  cta: string;
  ctaStyle: "primary" | "ghost";
  recommended?: boolean;
  /**
   * CONTRACT-99 B1b: `false` = the plan still EXISTS (its technical id stays valid in
   * `profiles.current_plan`, the webhook and the cadence table) but it is no longer OFFERED: it
   * does not appear on /precios, in the docs table or in the hero. Omitted means offered.
   */
  listed?: boolean;
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
    listed: false,
    price: 45,
    promoPrice: 19,
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
    // CONTRACT-99 (log §237): el plan de pago ÚNICO. 99 €/mes con IVA incluido
    // para todos, sin cohorte legacy y sin precio de lanzamiento (`promoPrice`
    // fuera: sin él, `resolveShownPromoPrice` devuelve null y ninguna superficie
    // pinta precio tachado). El ID técnico `pro` se reutiliza SIN conservar las
    // cuotas anteriores (5 dominios · 100 prompts · diario).
    price: 99,
    period: "mes",
    tagline: "Monitoriza tu marca en las IA",
    who: "Marca o consultor que quiere seguir su presencia en las IA",
    recommended: true,
    cta: "Probar Pro gratis",
    ctaStyle: "primary",
    highlights: [
      "3 dominios · 75 prompts en total, repartidos como quieras",
      "3 motores de IA (Gemini, Claude y ChatGPT) · escaneo semanal",
      "Nuevos motores incluidos sin coste extra cuando se publiquen",
      "Bucle de acción completo",
      "Generador de soluciones (FAQ, schema, briefs)"
    ],
    meter: { projects: "3", prompts: 75, engines: 3, refresh: "Semanal" },
    caps: { projects: 3, prompts: 75, engines: 3 }
  },
  {
    id: "agency",
    name: "Agencia",
    listed: false,
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

/** The plans a visitor can actually choose today. Everything that LISTS plans reads this; everything that RESOLVES a plan id keeps reading `PLANS`. */
export const LISTED_PLANS: Plan[] = PLANS.filter((plan) => plan.listed !== false);

/**
 * What to OFFER an account that is on `currentPlanId`: the offered plans, plus the account's own
 * plan if it is no longer offered — so a Starter subscriber still sees what they are on, while no
 * one else is shown Starter as a choice. Kept in `PLANS` order.
 */
export function plansOfferedTo(currentPlanId: Plan["id"]): Plan[] {
  return PLANS.filter((plan) => plan.listed !== false || plan.id === currentPlanId);
}

/** Index of a plan in `PLANS`, i.e. its column in `PLAN_MATRIX`. */
export function matrixColumnOf(planId: Plan["id"]): number {
  return PLANS.findIndex((plan) => plan.id === planId);
}

// Matriz de comparación, agrupada por bloque de valor.
// Celdas: true = incluido · false = no · string = detalle/límite.
// Orden de columnas: free, starter, pro, agency.
export const PLAN_MATRIX: Array<{ group: string; rows: Array<{ label: string; vals: PlanCell[] }> }> = [
  {
    group: "Medición",
    rows: [
      { label: "Dominios", vals: ["1", "1", "3", "A medida"] },
      { label: "Prompts monitorizados", vals: ["~10", "~25", "75 en total", "~300"] },
      { label: "Motores de IA", vals: ["1", "3", "3", "3"] },
      { label: "Frecuencia de escaneo", vals: ["Puntual", "Semanal", "Semanal", "Diario"] },
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
    q: "¿Por qué hay un único plan de pago?",
    a: `Para que el precio sea el mismo para todos y no haya que comparar escalones: un solo plan, ${PLANS.find((plan) => plan.id === "pro")!.price} € al mes con IVA incluido, con los límites que ves en la comparativa.`
  },
  {
    q: "¿Puedo cambiar de plan en cualquier momento?",
    a: "Sí, desde \"Plan y facturación\" en tu cuenta, sin esperar a nadie. Mientras no activemos la facturación real, cambiar de plan no tiene coste ni compromiso de permanencia."
  },
  {
    q: "¿Qué incluye la prueba de Pro?",
    a: "Actualmente puedes activar Pro completo eligiendo ese plan al registrarte, sin tarjeta: el bucle de acción completo, el generador de soluciones y los motores de IA disponibles hoy. Mientras no lancemos la facturación no hay límite de tiempo automático — te avisaremos con antelación razonable antes de introducir el cobro."
  }
];
