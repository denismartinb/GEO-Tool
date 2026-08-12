/**
 * SEO-POS-1 Fase C, S3 — datos de /comparativas/alternativas-a-otterly.
 *
 * Formato listicle, distinto de la comparativa 1:1 que ya existe
 * (`genscore-vs-otterly.ts`) y del pilar de categoría
 * (`mejores-herramientas-geo.ts`). La diferencia no es cosmética: quien busca
 * "alternativas a Otterly" ya conoce Otterly y ha chocado con un límite
 * concreto. La pieza se organiza por **el límite**, no por un ranking de
 * herramientas — un ranking obliga a declarar un ganador global que no existe.
 *
 * **Fuente de los precios de Otterly: terceros, no fuente primaria.**
 * `otterly.ai/pricing` está bloqueado desde nuestro entorno (egress), la misma
 * limitación que ya tuvo Peec AI. Las cifras las corroboran dos agregadores de
 * reseñas independientes entre sí, y coinciden además con lo que ya se publicó
 * el 2026-08-02 en `genscore-vs-otterly.ts`. Aun así se tratan como
 * orientativas y la página lo dice: son escalones de precio, no un contrato.
 *
 * Los datos de Genscore vienen de `app/pricing/plans-data.ts`, la misma fuente
 * que usa /pricing — no se reescriben a mano.
 */
export const RESEARCH_DATE = "12 de agosto de 2026";

/**
 * La escalera de precios de Otterly, que es el dato central de la pieza: el
 * salto no es de precio a secas, es de tope de prompts. Publicarlo como tabla
 * y no como prosa es deliberado — es lo que alguien necesita mirar dos veces.
 */
export const OTTERLY_PLANS: { plan: string; price: string; prompts: string }[] = [
  { plan: "Lite", price: "29 $/mes", prompts: "15 prompts" },
  { plan: "Standard", price: "189 $/mes", prompts: "100 prompts" },
  { plan: "Premium", price: "489 $/mes", prompts: "400 prompts" }
];

/**
 * Lo que Otterly hace bien, y a quién le sirve de verdad.
 *
 * La ventaja se declara sin recortarla —eso no se toca, es la línea de
 * PRICING-TRUTH-1— pero **no se deja suelta**: cada una va con el contexto que
 * determina si le aplica al lector. La primera versión de esta página listaba
 * las cuatro a pelo, y el efecto era el contrario del buscado: una lista de
 * cuatro victorias del competidor arriba del todo se lee como "Otterly gana",
 * aunque tres de las cuatro le sean irrelevantes a quien está leyendo
 * (fundador, 2026-08-12; log §65).
 *
 * Regla para añadir aquí: `claim` es el hecho, verificable y sin adornar;
 * `context` es a quién le sirve, y tiene que ser igual de cierto. Un `context`
 * que desmienta el `claim` en vez de situarlo es hacer trampas y se nota.
 */
export const OTTERLY_STRENGTHS: { claim: string; context: string }[] = [
  {
    claim: "Usuarios ilimitados ya en el plan de 29 $/mes.",
    context:
      "Con quince prompts incluidos. Es decir: todo el equipo puede entrar a mirar la misma muestra de quince consultas. En Genscore los usuarios ilimitados llegan desde Starter, pero el plan gratuito ya escanea de verdad y sin caducidad."
  },
  {
    claim: "Seguimiento en más de 50 mercados.",
    context:
      "Ventaja real si vendes en varios países a la vez. Si operas en España, o en España y un par de mercados LATAM con la misma web, es cobertura que pagas y no usas: el GEO Score de Genscore es por dominio, que es exactamente la unidad que necesitas cuando el dominio es uno."
  },
  {
    claim: "Cobertura nominal de hasta 6 motores, incluidos Perplexity y Microsoft Copilot.",
    context:
      "Genscore ejecuta ChatGPT, Gemini y Claude —los tres donde tus clientes preguntan hoy— y los tres en todos los planes de pago, sin add-ons. En Otterly, Gemini y Google AI Mode se cobran aparte en todos los niveles, así que la cobertura amplia se paga dos veces: en el plan y en el complemento."
  },
  {
    claim: "El precio de entrada de pago más bajo de la categoría.",
    context:
      "De pago. Genscore empieza en cero, sin tarjeta y sin fecha de caducidad, así que la comparación de entrada no es 29 $ contra 45 €: es 29 $ contra poder medir antes de decidir si pagas."
  }
];

export type LeaveReason = {
  id: string;
  /** El límite, en las palabras en que lo diría quien lo vive. */
  title: string;
  /**
   * Etiqueta corta para la insignia de la tabla. Existe porque truncar el
   * `title` a las tres primeras palabras producía "Te has quedado…", que no
   * dice nada: una insignia ilegible es peor que ninguna columna.
   */
  shortLabel: string;
  /** Qué pasa exactamente, con el dato que lo respalda. */
  detail: string;
};

export const LEAVE_REASONS: LeaveReason[] = [
  {
    id: "prompts",
    title: "Te has quedado sin prompts y el siguiente escalón cuesta 6,5 veces más",
    shortLabel: "Tope de prompts",
    detail:
      "El plan de 29 $ incluye 15 prompts. Quince consultas es una muestra pequeña para una marca con varias líneas de producto, y el salto siguiente no es proporcional: Standard cuesta 189 $/mes. Ampliar prompts sueltos sobre un plan tampoco es barato (unos 99 $/mes por cada 100 según fuentes de terceros). Es el motivo más citado en las reseñas públicas, y el más fácil de comprobar antes de contratar: cuenta tus prompts primero."
  },
  {
    id: "addons",
    title: "Los motores que te importan no venían en el precio",
    shortLabel: "Motores de pago aparte",
    detail:
      "Google AI Mode y Gemini son add-ons con coste extra en todos los niveles, no parte del plan base. El precio que comparaste no es el que vas a pagar si necesitas esos dos, y eso convierte cualquier comparación de precio de entrada entre herramientas en una comparación entre cosas distintas. Antes de decidir, sube los add-ons al precio base y vuelve a comparar."
  },
  {
    id: "action",
    title: "Tienes el diagnóstico y sigues sin saber qué escribir",
    shortLabel: "Ejecutar, no solo medir",
    detail:
      "Otterly monitoriza, audita y reporta. Eso está bien hecho, pero termina donde empieza el trabajo: alguien tiene que decidir qué contenido publicar o reescribir, y redactarlo. Si tu cuello de botella no es medir sino ejecutar, cambiar a otra herramienta de medición no resuelve nada — lo que buscas es una que entre en la fase de solución."
  },
  {
    id: "espanol",
    title: "Tu equipo no trabaja en inglés",
    shortLabel: "Producto en castellano",
    detail:
      "La interfaz de Otterly está en inglés. Para un equipo que ya vive en inglés esto no es un problema en absoluto; para uno que no, es fricción diaria sobre la persona que menos debería tenerla — normalmente quien redacta el contenido, no quien lee el panel."
  }
];

export type Alternative = {
  slug: string;
  name: string;
  url: string;
  /** Ids de LEAVE_REASONS que esta herramienta resuelve de verdad. */
  solves: string[];
  oneLiner: string;
  pricingNote: string;
  spanishSupport: string;
  /** Lo que esta alternativa NO resuelve. Obligatorio: ver el test. */
  tradeoff: string;
  /** Enlace a la comparativa 1:1 dedicada, si existe. */
  comparisonHref?: string;
};

export const ALTERNATIVES: Alternative[] = [
  {
    slug: "genscore",
    name: "Genscore",
    url: "https://www.genscore.es",
    solves: ["prompts", "action", "espanol"],
    oneLiner:
      "Mide cómo apareces en ChatGPT, Gemini y Claude, y genera el borrador de la solución (FAQ, datos estructurados, briefs) desde el plan Pro.",
    pricingNote:
      "Gratis permanente sin tarjeta; Pro 179 €/mes con ~100 prompts — el escalón comparable al Standard de 189 $ de Otterly, sin add-ons por motor.",
    spanishSupport: "Sí, nativo — interfaz y soporte en castellano.",
    tradeoff:
      "No ejecuta Perplexity ni Copilot —sí ChatGPT, Gemini y Claude, los tres incluidos en todos los planes de pago, sin add-ons— y no desglosa la puntuación por país. Si tu negocio se juega en comparar mercados uno a uno, esa pieza concreta la cubre mejor Otterly.",
    comparisonHref: "/comparativas/genscore-vs-otterly"
  },
  {
    slug: "peec-ai",
    name: "Peec AI",
    url: "https://peec.ai",
    solves: ["addons"],
    oneLiner:
      "Monitorización GEO con cobertura multi-idioma y multi-país incluida en el precio, sin coste adicional por región.",
    pricingNote: "Desde ~95 $/mes — cifra pública, confírmala en peec.ai.",
    spanishSupport: "No confirmado — documentación e interfaz observadas en inglés.",
    tradeoff:
      "Su función \"Actions\" prioriza y sugiere, pero no redacta: el problema de ejecución sigue intacto. Y su entrada cuesta más del triple que la de Otterly.",
    comparisonHref: "/comparativas/genscore-vs-peec-ai"
  },
  {
    slug: "profound",
    name: "Profound",
    url: "https://tryprofound.com",
    solves: ["prompts", "addons"],
    oneLiner:
      "Analítica de visibilidad en IA orientada a mid-market y enterprise, con cobertura nominal amplia de motores y un panel dedicado de fuentes de citación.",
    pricingNote:
      "Sin precio público — su web pide una demo. Fuentes de terceros citan cifras muy distintas según su fecha. Confírmalo en tryprofound.com.",
    spanishSupport: "No encontrado con confianza — no verificado en fuente primaria.",
    tradeoff:
      "Es un salto de categoría, no un cambio lateral: reseñas independientes señalan curva de aprendizaje pronunciada y que el coste por cliente rara vez sale a cuenta para pymes o agencias pequeñas. Si vienes del plan de 29 $, no es tu siguiente paso.",
    comparisonHref: "/comparativas/genscore-vs-profound"
  },
  {
    slug: "suites-seo",
    name: "Semrush AI Toolkit / Ahrefs Brand Radar",
    url: "https://www.semrush.com",
    solves: ["addons"],
    oneLiner:
      "El módulo de visibilidad en IA de la suite de SEO que tu equipo quizá ya abre todos los días.",
    pricingNote:
      "Ambos son complementos sobre una suscripción base, no productos sueltos: las cifras que publican los agregadores varían bastante entre sí, así que lo único seguro es que el coste real es el del módulo más el de la suite. Confírmalo en semrush.com y ahrefs.com.",
    spanishSupport: "Semrush tiene interfaz en español; el módulo de IA no se ha verificado en fuente primaria.",
    tradeoff:
      "Solo tiene sentido si ya pagas la suite. Si no la pagas, el coste combinado convierte lo que parecía la opción cómoda en la más cara de esta lista."
  },
  {
    slug: "scrunch-ai",
    name: "Scrunch AI",
    url: "https://scrunch.com",
    solves: ["action"],
    oneLiner:
      "\"Agent Experience Platform\": además de medir, sirve una versión reducida de tu web a los rastreadores de IA y muestra en tiempo real qué agentes te visitan.",
    pricingNote:
      "Cifras de agregadores de terceros, orientativamente desde unos 250-300 $/mes. Confírmalo en scrunch.com.",
    spanishSupport: "No encontrado.",
    tradeoff:
      "Actúa sobre la capa técnica, no sobre el contenido: si lo que te falta es qué escribir, esto no lo resuelve. Y requiere alguien capaz de leer esa señal técnica y hacer algo con ella."
  }
];
