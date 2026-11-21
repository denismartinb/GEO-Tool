import type {
  AgentAccess,
  AgenticCheck,
  AgenticCheckResult,
  AgenticComponentId,
  AgenticComponentResult,
  AgenticFix,
  AgenticOfferKind,
  AssistantName,
  CheckState
} from "@/lib/agentic-audit/api-contract";
import { ASSISTANT_ROBOTS_TOKENS } from "@/lib/agentic-audit/agents";
import { classifyOffer, type OfferReading, type PageSignals } from "@/lib/agentic-audit/html-signals";

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
 * The total exists only for a page that sells something we could read:
 * Comprensión and Compra are about what is sold, and a page that sells
 * nothing is not failing them.
 *
 * Log §325: what is sold decides which checks apply. Stock, identifiers and
 * shipping are for physical products (stock also for tickets); software,
 * services and subscriptions get «cancelación o reembolso» instead of
 * returns, and a buy, hire or book button named for what is sold. A
 * check that does not apply is left out, like `unknown`: it never subtracts.
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
  /** What the page sells; `null` when it sells nothing we can see. Left out, it is read from `signals` and `url`. */
  offer?: OfferReading | null;
};

/** Short Spanish names of what is sold, for check labels. */
const KIND_NOUN: Record<AgenticOfferKind, string> = {
  physical: "el producto",
  software: "el software",
  service: "el servicio",
  course: "el curso",
  booking: "la reserva",
  event: "el evento",
  subscription: "la suscripción",
  offer: "lo que vendes"
};

/** The action of the buy button, by what is sold. */
const KIND_ACTION: Record<AgenticOfferKind, string> = {
  physical: "comprar",
  software: "comprar o contratar",
  service: "contratar o pedir presupuesto",
  course: "inscribirse o comprar",
  booking: "reservar",
  event: "comprar entradas",
  subscription: "suscribirse",
  offer: "comprar o contratar"
};

const WITH_REFUND_POLICY = new Set<AgenticOfferKind>(["software", "service", "course", "booking", "subscription", "offer"]);
const WITH_QUICK_PAY = new Set<AgenticOfferKind>(["physical", "software", "course", "event", "subscription", "offer"]);

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

/**
 * The robots.txt fix names what to open, from what is blocked (log §427):
 * «Deja que Muse te encuentre» is only said when Meta is the one blocked.
 */
export function robotsFix(blocked: AssistantName[]): string {
  if (blocked.length === 1 && blocked[0] === "Meta") {
    return "Deja que Muse te encuentre: abre meta-webindexer en tu robots.txt.";
  }
  const tokens = blocked.flatMap((a) => ASSISTANT_ROBOTS_TOKENS[a]);
  if (tokens.length === 0) {
    return "Deja pasar en robots.txt a los rastreadores de búsqueda y de usuario de cada asistente (OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot, meta-webindexer…), si quieres que puedan recomendarte y comprar.";
  }
  return `Deja pasar en robots.txt a ${joinTokens(tokens)}, si quieres que ${blocked.length === 1 ? "ese asistente pueda" : "esos asistentes puedan"} recomendarte y comprar.`;
}

function joinTokens(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
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
      robotsFix(blockedNames)
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

function understandingChecks(s: PageSignals, kind: AgenticOfferKind): AgenticCheck[] {
  const physical = kind === "physical";
  const noun = KIND_NOUN[kind];
  const declared = physical ? s.hasProductData : kind === "offer" ? s.anyOffer : s.offerTypes.length > 0 || s.hasProductData;
  const withOffer = physical ? s.hasOffer : s.anyOffer;
  const checks: AgenticCheck[] = [
    check(
      "product_data",
      30,
      declared && withOffer ? "pass" : declared ? "avg" : "fail",
      physical
        ? declared && withOffer
          ? "La ficha declara el producto y su oferta en datos estructurados"
          : declared
            ? "La ficha declara el producto pero no su oferta"
            : "La ficha no declara el producto en datos estructurados"
        : declared && withOffer
          ? `La página declara ${noun} y su oferta en datos estructurados`
          : declared
            ? `La página declara ${noun} pero no su oferta`
            : `La página no declara ${noun} en datos estructurados`,
      physical
        ? "Añade a la ficha datos estructurados Product con su Offer (schema.org), en el HTML que sirve el servidor."
        : "Declara lo que vendes con datos estructurados (Product, SoftwareApplication, Service, Course o Event) con su Offer, en el HTML que sirve el servidor."
    ),
    check(
      "price",
      20,
      s.structuredPrice && s.priceConflict ? "avg" : s.structuredPrice ? "pass" : s.textPrice ? "avg" : "fail",
      s.structuredPrice && s.priceConflict
        ? "El precio de los datos no es el que enseña la página"
        : s.structuredPrice
          ? "El precio y la moneda se leen como datos"
          : s.textPrice
            ? "El precio sólo aparece como texto"
            : "No se ve el precio sin ejecutar JavaScript",
      s.structuredPrice && s.priceConflict
        ? "Pon en la Offer el mismo precio que ve el cliente: un agente repetirá el de los datos."
        : kind === "subscription" || s.recurringPrice
          ? "Declara price y priceCurrency en la Offer, con el periodo (al mes o al año, o por kWh) en su priceSpecification."
          : "Declara price y priceCurrency en la Offer, con el precio final que paga el cliente."
    )
  ];
  if (physical || kind === "event") {
    checks.push(
      check(
        "availability",
        15,
        s.availability && s.stockConflict ? "avg" : s.availability ? "pass" : "fail",
        physical
          ? s.availability && s.stockConflict
            ? "Los datos dicen «en stock» y la página dice que no está disponible"
            : s.availability
              ? "La ficha declara el stock"
              : "La ficha no declara si hay stock"
          : s.availability
            ? "La página declara si quedan entradas"
            : "La página no declara si quedan entradas",
        physical
          ? s.stockConflict
            ? "Haz que availability diga lo mismo que la página: un agente repetirá «en stock»."
            : "Declara availability (InStock, OutOfStock…) en la Offer, por variante si las tienes."
          : "Declara availability (InStock, SoldOut…) en la Offer de las entradas."
      )
    );
  }
  if (physical) {
    checks.push(
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
      )
    );
  }
  const where = physical ? "la ficha" : "la página";
  const Where = physical ? "La ficha" : "La página";
  checks.push(
    check(
      "readable_text",
      20,
      s.visibleTextChars >= 600 ? "pass" : s.visibleTextChars >= 200 ? "avg" : "fail",
      s.visibleTextChars >= 600
        ? `${Where} se lee sin ejecutar JavaScript`
        : s.visibleTextChars >= 200
          ? `Sin JavaScript, ${where} tiene muy poco texto`
          : `Sin JavaScript, ${where} está casi vacía`,
      "Sirve la descripción y los datos clave en el HTML inicial (renderizado en servidor), no sólo tras ejecutar JavaScript."
    )
  );
  return checks;
}

function trustChecks(s: PageSignals, kind: AgenticOfferKind | null): AgenticCheck[] {
  const identityBoth = s.links.legal && s.links.contact;
  const identityOne = s.links.legal || s.links.contact;
  // Without a selling page, trust is still read on the page we have, with the store wording as before.
  const physical = kind === null || kind === "physical";
  const refund = kind !== null && WITH_REFUND_POLICY.has(kind);
  const who = physical ? "la tienda" : "la web";
  const checks: AgenticCheck[] = [];
  if (refund) {
    // AGENTS-TRUTH-1 (log §465): a tariff or policy is left with permanence and withdrawal, not returns.
    const terms = s.tariff ? "permanencia y desistimiento" : "cancelación o reembolso";
    checks.push(
      check(
        "cancellation",
        30,
        s.returnPolicyData ? "pass" : s.links.cancellation || s.links.returns || s.cancelAnytimeText ? "avg" : "fail",
        s.returnPolicyData
          ? `Tus condiciones de ${terms} se leen como datos`
          : s.links.cancellation || s.links.returns
            ? `Enlazas tus condiciones de ${terms}, pero sin datos estructurados`
            : s.cancelAnytimeText
              ? s.tariff
                ? "Dices que no hay permanencia, pero no enlazas tus condiciones"
                : "Dices que se puede cancelar, pero no enlazas tus condiciones"
              : `No vemos tus condiciones de ${terms}`,
        s.tariff
          ? "Enlaza desde la página la permanencia y el derecho de desistimiento (14 días), con lo que cuesta darse de baja."
          : "Enlaza tus condiciones de cancelación y reembolso desde la página, y decláralas con hasMerchantReturnPolicy si aplican."
      )
    );
  } else {
    checks.push(
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
      )
    );
  }
  if (physical) {
    checks.push(
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
      )
    );
  }
  checks.push(
    check(
      "reviews",
      20,
      s.reviewData ? "pass" : "fail",
      s.reviewData ? "Las reseñas se leen como datos" : "No vemos reseñas marcadas",
      physical
        ? "Marca la valoración media con aggregateRating si tienes reseñas reales del producto."
        : "Marca la valoración media con aggregateRating si tienes reseñas reales de lo que vendes."
    ),
    check(
      "identity",
      25,
      s.organizationData || identityBoth ? "pass" : identityOne ? "avg" : "fail",
      s.organizationData || identityBoth
        ? `Se sabe quién está detrás de ${who}`
        : identityOne
          ? `Faltan datos de quién está detrás de ${who}`
          : `No vemos quién está detrás de ${who}`,
      "Enlaza aviso legal y contacto en todas las páginas, y declara tu empresa con datos estructurados Organization."
    )
  );
  return checks;
}

function purchaseChecks(s: PageSignals, kind: AgenticOfferKind): AgenticCheck[] {
  const physical = kind === "physical";
  const action = KIND_ACTION[kind];
  const checks: AgenticCheck[] = [];
  if (physical) {
    checks.push(
      check(
        "add_to_cart",
        40,
        // An out-of-stock product shows «Avísame», not a cart: nothing to measure (log §407).
        s.addToCart ? "pass" : s.soldOut ? "unknown" : "fail",
        s.addToCart
          ? "El botón de compra está en el HTML"
          : s.soldOut
            ? "Agotado: la ficha no puede tener botón de compra ahora"
            : "No vemos el botón de compra sin JavaScript",
        "Sirve en el HTML de la ficha el botón de compra («Comprar» o «Añadir al carrito»), con texto claro."
      )
    );
  } else {
    const ok = s.buyCta || s.addToCart || (kind === "booking" && s.bookingWidget !== null);
    // AGENTS-TRUTH-1 (log §465): a quote or «te llamamos» is the normal way to hire a service,
    // but not to buy a tariff, a plan or software, where it leaves the agent half way.
    const leadIsTheWay = kind === "service" && !s.tariff;
    const lead = !ok && s.leadCta === true;
    checks.push(
      check(
        "buy_button",
        40,
        ok || (lead && leadIsTheWay) ? "pass" : lead ? "avg" : "fail",
        ok
          ? `El botón para ${action} está en el HTML`
          : lead && leadIsTheWay
            ? "El botón para pedir presupuesto está en el HTML"
            : lead
              ? "Sólo vemos un botón para pedir que te llamen o un presupuesto"
              : `No vemos un botón para ${action} sin JavaScript`,
        lead
          ? `Añade un botón para ${action} directamente, además del de pedir información.`
          : `Sirve en el HTML de la página un botón o enlace con texto claro para ${action}.`
      )
    );
  }
  const where = physical ? "la ficha" : "la página";
  checks.push(
    check(
      "no_captcha",
      30,
      s.captcha ? "fail" : "pass",
      s.captcha ? `Hay un captcha en ${where} (${s.captcha})` : physical ? "La ficha no pone captchas" : "La página no pone captchas",
      physical
        ? "Quita el captcha de la ficha y del carrito o cámbialo por una verificación que deje pasar a los agentes verificados."
        : "Quita el captcha de la página y del formulario o cámbialo por una verificación que deje pasar a los agentes verificados."
    )
  );
  if (WITH_QUICK_PAY.has(kind)) {
    checks.push(
      check(
        "quick_pay",
        15,
        s.quickPay.length > 0 ? "pass" : "fail",
        s.quickPay.length > 0 ? `Ofreces pagos rápidos (${s.quickPay.join(", ")})` : "No vemos pagos rápidos",
        "Ofrece un pago rápido (Apple Pay, Google Pay, Shop Pay, PayPal) que un agente sepa completar."
      )
    );
  }
  if (physical) {
    checks.push(
      check(
        "platform",
        15,
        s.platform ? "pass" : "avg",
        s.platform ? `Tu tienda funciona con ${s.platform}` : "No reconocemos tu plataforma de tienda",
        "Las plataformas grandes (Shopify, WooCommerce…) incorporan antes los canales para agentes. Con una tienda a medida, revisa tú cada paso."
      )
    );
  } else {
    const platform = s.platform ?? s.paymentPlatform ?? s.bookingWidget;
    const verb = s.platform ? "Vendes con" : s.paymentPlatform ? "Cobras con" : "Reservas con";
    checks.push(
      check(
        "platform",
        15,
        platform ? "pass" : "avg",
        platform ? `${verb} ${platform}` : kind === "booking" ? "No reconocemos tu sistema de reservas" : "No reconocemos tu sistema de cobro",
        kind === "booking"
          ? "Los sistemas de reservas conocidos (Calendly, Doctoralia, TheFork…) incorporan antes los canales para agentes. Con uno a medida, revisa tú cada paso."
          : "Las plataformas de cobro conocidas (Stripe, Paddle…) incorporan antes los canales para agentes. Con un sistema a medida, revisa tú cada paso."
      )
    );
  }
  return checks;
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
  const offer = s === null ? null : input.offer === undefined ? classifyOffer(s, input.url) : input.offer;
  const kind = offer?.kind ?? null;
  const product = kind !== null;

  const components: AgenticComponentResult[] = [
    component("discovery", discoveryChecks(input)),
    component("understanding", s && kind ? understandingChecks(s, kind) : []),
    component("trust", s ? trustChecks(s, kind) : []),
    component("purchase", s && kind ? purchaseChecks(s, kind) : [])
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
    facts: s ? (input.facts ?? null) : null,
    ...(offer ? { offerKind: offer.kind, pricingPage: offer.pricingPage } : {})
  };
}

/**
 * AGENTIC-COMMERCE-1 Fase 2a (log §322): the total this page would have if the
 * given checks passed, recomputed with the same arithmetic as the score — not
 * the sum of the fixes' rounded gains. `null` when the page has no total
 * (not a product page, or not read), so the console never promises a figure
 * the engine does not compute.
 */
export function scoreIfChecksPass(result: AgenticCheckResult, checkIds: ReadonlySet<string>): number | null {
  if (result.score === null) return null;
  const components = result.components.map((c) => ({
    ...c,
    score: componentScore(c.checks.map((k) => (checkIds.has(k.id) && k.state !== "unknown" ? { ...k, state: "pass" as const } : k)))
  }));
  const scored = components.filter((c) => c.score !== null);
  const weight = scored.reduce((sum, c) => sum + c.weight, 0);
  return weight > 0 ? Math.round(scored.reduce((sum, c) => sum + c.weight * (c.score ?? 0), 0) / weight) : null;
}
