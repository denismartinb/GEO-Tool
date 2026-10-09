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
export const FOUNDER_SLOTS = 38;

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
    // TRIAL-ONLY-1: no se vende (ver `SELLABLE_PLANS`). Es el estado de una
    // cuenta cuya prueba de Pro terminó sin contratar, o cuya suscripción se
    // canceló: entra y ve sus datos, pero no escanea.
    id: "free",
    name: "Sin plan",
    price: 0,
    priceLabel: "Solo lectura",
    period: "mes",
    tagline: "Ves tus datos, sin escaneos nuevos",
    who: "Cuenta sin plan activo",
    cta: "Elegir plan",
    ctaStyle: "ghost",
    highlights: [
      "Tus dominios, escaneos y recomendaciones siguen aquí",
      "Sin escaneos nuevos ni seguimiento automático",
      "Elige un plan para volver a escanear"
    ],
    meter: { projects: "1", prompts: 10, engines: 1, refresh: "Sin escaneos" },
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

/**
 * TRIAL-ONLY-1: los planes que se venden. `free` sigue en `PLANS` porque es
 * el estado interno de una cuenta cuya prueba de Pro terminó sin contratar
 * (modo solo lectura: ve sus datos, no escanea) y el que escribe el webhook
 * al cancelar — pero ya no es una oferta, así que no aparece en /precios ni
 * en el modal de cambio de plan.
 */
export const SELLABLE_PLANS: Plan[] = PLANS.filter((p) => p.id !== "free");

// Matriz de comparación, agrupada por bloque de valor.
// Celdas: true = incluido · false = no · string = detalle/límite.
// Orden de columnas: el de `SELLABLE_PLANS` — starter, pro, agency.
export const PLAN_MATRIX: Array<{ group: string; rows: Array<{ label: string; vals: PlanCell[] }> }> = [
  {
    group: "Medición",
    rows: [
      { label: "Dominios", vals: ["1", "5", "A medida"] },
      { label: "Prompts monitorizados", vals: ["~25", "~100", "~300"] },
      { label: "Motores de IA", vals: ["3", "3", "3"] },
      { label: "Frecuencia de escaneo", vals: ["Semanal", "Diario", "Diario"] },
      { label: "Tendencia temporal", vals: [true, true, true] }
    ]
  },
  {
    group: "Análisis",
    rows: [
      { label: "Panorámica competitiva y cuota de voz", vals: [true, true, true] },
      { label: "Distribución por motor de IA", vals: [true, true, true] },
      { label: "Sentimiento y análisis de temas", vals: [false, true, true] },
      { label: "Citas y fuentes profundas", vals: ["Básico", true, true] },
      { label: "Detección de oportunidades de prompt", vals: [true, true, true] }
    ]
  },
  {
    group: "Acción",
    rows: [
      { label: "Bucle de acción priorizado", vals: [true, true, true] },
      { label: "Recomendaciones basadas en evidencia", vals: [true, true, true] },
      { label: "Generador de soluciones", vals: [false, true, true] },
      { label: "Credibilidad de medición visible", vals: [true, true, true] }
    ]
  }
];

export const PLAN_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "¿Hay un plan gratuito?",
    a: "No hay plan gratis para siempre: al registrarte tienes 7 días de Pro completo, sin tarjeta, que es la mejor forma de ver GenScore con tus propios datos. Si sólo quieres saber si ChatGPT menciona tu marca, el comprobador gratuito lo responde al momento y sin registro."
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
    a: "Al registrarte tienes 7 días de Pro completo, sin tarjeta: el bucle de acción completo, el generador de soluciones y los motores de IA disponibles hoy. Si al terminar no contratas, no se te cobra nada: tu cuenta pasa a solo lectura, sigues viendo tus datos y vuelves a escanear en cuanto elijas un plan."
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
