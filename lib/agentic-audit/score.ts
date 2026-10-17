import type {
  AgentAccess,
  AgenticCheck,
  AgenticCheckResult,
  AgenticComponentId,
  AgenticComponentResult,
  AgenticFix,
  CheckState
} from "@/lib/agentic-audit/api-contract";
import { isProductPage, type PageSignals } from "@/lib/agentic-audit/html-signals";

/**
 * AGENTIC-COMMERCE-1: the «Visibilidad agéntica» score. Pure.
 *
 * Weights approved by the founder with the design (2026-10-17,
 * `docs/adr/0043`): Descubrimiento 30, Comprensión 30, Confianza 20,
 * Compra 20. Inside each component the checks add up to 100 points.
 *
 * pass earns all of a check's points, avg half, fail none. `unknown` (we
 * could not measure it) leaves the check out of both sides, so a block on
 * our side never reads as a fault on theirs. A component with nothing
 * measurable has no score and leaves the total.
 *
 * The total exists only for a product page we could read: Comprensión and
 * Compra are about a product, and a home page without one is not failing
 * them.
 */

export const COMPONENT_WEIGHTS: Record<AgenticComponentId, number> = {
  discovery: 30,
  understanding: 30,
  trust: 20,
  purchase: 20
};

export const COMPONENT_NAMES: Record<AgenticComponentId, string> = {
  discovery: "Descubrimiento",
  understanding: "Comprensión",
  trust: "Confianza",
  purchase: "Compra"
};

const EARN: Record<CheckState, number> = { pass: 1, avg: 0.5, fail: 0, unknown: 0 };

export type ScoreInput = {
  domain: string;
  url: string;
  /** `null` when the page could not be read (blocked, challenged). */
  signals: PageSignals | null;
  agents: AgentAccess[];
  challenge: boolean | null;
  sitemap: "found" | "absent" | "unknown";
  interop: AgenticCheckResult["interop"];
  /** Literal values read from the page; `null` when it could not be read. */
  facts?: AgenticCheckResult["facts"];
};

function check(id: string, points: number, state: CheckState, label: string, fix: string): AgenticCheck {
  return state === "pass" ? { id, points, state, label } : { id, points, state, label, fix };
}

export function componentScore(checks: AgenticCheck[]): number | null {
  const measured = checks.filter((c) => c.state !== "unknown");
  const possible = measured.reduce((sum, c) => sum + c.points, 0);
  if (possible === 0) return null;
  const earned = measured.reduce((sum, c) => sum + c.points * EARN[c.state], 0);
  return Math.round((earned / possible) * 100);
}

function discoveryChecks(input: ScoreInput): AgenticCheck[] {
  const known = input.agents.filter((a) => a.allowed !== null);
  const allowed = known.filter((a) => a.allowed === true);
  const blockedNames = known.filter((a) => a.allowed === false).map((a) => a.assistant);
  const robotsState: CheckState =
    known.length === 0 ? "unknown" : allowed.length === known.length ? "pass" : allowed.length === 0 ? "fail" : "avg";

  return [
    check(
      "robots_agents",
      45,
      robotsState,
      robotsState === "pass"
        ? "Tu robots.txt deja pasar a los asistentes que compran"
        : robotsState === "unknown"
          ? "No pudimos leer tu robots.txt"
          : `Tu robots.txt bloquea a ${blockedNames.join(", ")}`,
      "Deja pasar en robots.txt a los rastreadores de búsqueda y de usuario de cada asistente (OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot…), si quieres que puedan recomendarte y comprar."
    ),
    check(
      "no_challenge",
      40,
      // A challenge to OUR identified bot says nothing about what a verified
      // agent or a browser agent gets, so it is not measured, never a fail (log §319).
      input.challenge === false ? "pass" : "unknown",
      input.challenge === null
        ? "No pudimos comprobar tu protección anti-bots"
        : input.challenge
          ? "Tu web pone un reto a las visitas automáticas"
          : "Tu web no pone retos a las visitas automáticas",
      "Revisa tu protección anti-bots (Cloudflare, Akamai, DataDome…) y deja pasar a los agentes verificados en vez de bloquear todo lo automático."
    ),
    check(
      "sitemap",
      15,
      input.sitemap === "found" ? "pass" : input.sitemap === "absent" ? "fail" : "unknown",
      input.sitemap === "found"
        ? "Publicas un sitemap"
        : input.sitemap === "absent"
          ? "No publicas sitemap.xml"
          : "No pudimos leer tu sitemap",
      "Publica /sitemap.xml con tus fichas de producto para que un agente encuentre tu catálogo."
    )
  ];
}

function understandingChecks(s: PageSignals): AgenticCheck[] {
  return [
    check(
      "product_data",
      30,
      s.hasProductData && s.hasOffer ? "pass" : s.hasProductData ? "avg" : "fail",
      s.hasProductData && s.hasOffer
        ? "La ficha declara el producto y su oferta en datos estructurados"
        : s.hasProductData
          ? "La ficha declara el producto pero no su oferta"
          : "La ficha no declara el producto en datos estructurados",
      "Añade a la ficha datos estructurados Product con su Offer (schema.org), en el HTML que sirve el servidor."
    ),
    check(
      "price",
      20,
      s.structuredPrice ? "pass" : s.textPrice ? "avg" : "fail",
      s.structuredPrice
        ? "El precio y la moneda se leen como datos"
        : s.textPrice
          ? "El precio sólo aparece como texto"
          : "No se ve el precio sin ejecutar JavaScript",
      "Declara price y priceCurrency en la Offer, con el precio final que paga el cliente."
    ),
    check(
      "availability",
      15,
      s.availability ? "pass" : "fail",
      s.availability ? "La ficha declara el stock" : "La ficha no declara si hay stock",
      "Declara availability (InStock, OutOfStock…) en la Offer, por variante si las tienes."
    ),
    check(
      "identifiers",
      15,
      s.gtin ? "pass" : s.skuOrMpn ? "avg" : "fail",
      s.gtin
        ? "El producto lleva su código GTIN"
        : s.skuOrMpn
          ? "El producto lleva referencia interna pero no GTIN"
          : "El producto no lleva identificadores",
      "Añade el GTIN (el código de barras EAN) al producto para que un agente lo compare entre tiendas."
    ),
    check(
      "readable_text",
      20,
      s.visibleTextChars >= 600 ? "pass" : s.visibleTextChars >= 200 ? "avg" : "fail",
      s.visibleTextChars >= 600
        ? "La ficha se lee sin ejecutar JavaScript"
        : s.visibleTextChars >= 200
          ? "Sin JavaScript, la ficha tiene muy poco texto"
          : "Sin JavaScript, la ficha está casi vacía",
      "Sirve la descripción y los datos clave en el HTML inicial (renderizado en servidor), no sólo tras ejecutar JavaScript."
    )
  ];
}

function trustChecks(s: PageSignals): AgenticCheck[] {
  const identityBoth = s.links.legal && s.links.contact;
  const identityOne = s.links.legal || s.links.contact;
  return [
    check(
      "returns",
      30,
      s.returnPolicyData ? "pass" : s.links.returns ? "avg" : "fail",
      s.returnPolicyData
        ? "La política de devoluciones se lee como datos"
        : s.links.returns
          ? "Enlazas tus devoluciones, pero sin datos estructurados"
          : "No vemos tu política de devoluciones",
      "Declara hasMerchantReturnPolicy (plazo, coste, método) en datos estructurados."
    ),
    check(
      "shipping",
      25,
      s.shippingData ? "pass" : s.links.shipping ? "avg" : "fail",
      s.shippingData
        ? "Los plazos y costes de envío se leen como datos"
        : s.links.shipping
          ? "Enlazas tus envíos, pero sin datos estructurados"
          : "No vemos tus condiciones de envío",
      "Declara shippingDetails (coste y plazo de entrega) en la Offer."
    ),
    check(
      "reviews",
      20,
      s.reviewData ? "pass" : "fail",
      s.reviewData ? "Las reseñas se leen como datos" : "No vemos reseñas marcadas",
      "Marca la valoración media con aggregateRating si tienes reseñas reales del producto."
    ),
    check(
      "identity",
      25,
      s.organizationData || identityBoth ? "pass" : identityOne ? "avg" : "fail",
      s.organizationData || identityBoth
        ? "Se sabe quién está detrás de la tienda"
        : identityOne
          ? "Faltan datos de quién está detrás de la tienda"
          : "No vemos quién está detrás de la tienda",
      "Enlaza aviso legal y contacto en todas las páginas, y declara tu empresa con datos estructurados Organization."
    )
  ];
}

function purchaseChecks(s: PageSignals): AgenticCheck[] {
  return [
    check(
      "add_to_cart",
      40,
      s.addToCart ? "pass" : "fail",
      s.addToCart ? "El botón de añadir al carrito está en el HTML" : "No vemos el botón de añadir al carrito sin JavaScript",
      "Sirve el formulario de añadir al carrito en el HTML de la ficha, con un botón con texto claro."
    ),
    check(
      "no_captcha",
      30,
      s.captcha ? "fail" : "pass",
      s.captcha ? `Hay un captcha en la ficha (${s.captcha})` : "La ficha no pone captchas",
      "Quita el captcha de la ficha y del carrito o cámbialo por una verificación que deje pasar a los agentes verificados."
    ),
    check(
      "quick_pay",
      15,
      s.quickPay.length > 0 ? "pass" : "fail",
      s.quickPay.length > 0 ? `Ofreces pagos rápidos (${s.quickPay.join(", ")})` : "No vemos pagos rápidos",
      "Ofrece un pago rápido (Apple Pay, Google Pay, Shop Pay, PayPal) que un agente sepa completar."
    ),
    check(
      "platform",
      15,
      s.platform ? "pass" : "avg",
      s.platform ? `Tu tienda funciona con ${s.platform}` : "No reconocemos tu plataforma de tienda",
      "Las plataformas grandes (Shopify, WooCommerce…) incorporan antes los canales para agentes. Con una tienda a medida, revisa tú cada paso."
    )
  ];
}

/** What the total would gain if one check passed, with the same arithmetic as the score. */
function fixGains(components: AgenticComponentResult[]): AgenticFix[] {
  const scored = components.filter((c) => c.score !== null);
  const totalWeight = scored.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return [];
  const fixes: AgenticFix[] = [];
  for (const component of scored) {
    const measured = component.checks.filter((c) => c.state !== "unknown");
    const possible = measured.reduce((sum, c) => sum + c.points, 0);
    for (const c of measured) {
      if (c.state === "pass") continue;
      const gain = (component.weight / totalWeight) * ((c.points * (1 - EARN[c.state])) / possible) * 100;
      fixes.push({ component: component.id, checkId: c.id, label: c.fix ?? c.label, gain: Math.max(1, Math.round(gain)) });
    }
  }
  return fixes.sort((a, b) => b.gain - a.gain);
}

function component(id: AgenticComponentId, checks: AgenticCheck[]): AgenticComponentResult {
  return { id, name: COMPONENT_NAMES[id], weight: COMPONENT_WEIGHTS[id], score: componentScore(checks), checks };
}

export function scoreAgenticAudit(input: ScoreInput): AgenticCheckResult {
  const s = input.signals;
  const pageRead = s !== null;
  const product = s !== null && isProductPage(s);

  const components: AgenticComponentResult[] = [
    component("discovery", discoveryChecks(input)),
    component("understanding", product && s ? understandingChecks(s) : []),
    component("trust", s ? trustChecks(s) : []),
    component("purchase", product && s ? purchaseChecks(s) : [])
  ];

  let score: number | null = null;
  if (product) {
    const scored = components.filter((c) => c.score !== null);
    const weight = scored.reduce((sum, c) => sum + c.weight, 0);
    score = weight > 0 ? Math.round(scored.reduce((sum, c) => sum + c.weight * (c.score ?? 0), 0) / weight) : null;
  }

  return {
    domain: input.domain,
    url: input.url,
    pageKind: product ? "product" : "other",
    pageRead,
    score,
    components,
    interop: input.interop,
    agents: input.agents,
    challenge: input.challenge,
    fixes: fixGains(components),
    platform: s?.platform ?? null,
    facts: s ? (input.facts ?? null) : null
  };
}
