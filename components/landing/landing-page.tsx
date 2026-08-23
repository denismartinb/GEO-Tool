import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { DotMeter } from "@/components/ui/dot-meter";
import { PublicHeader } from "@/components/marketing/public-header";
import { RevealOnScroll } from "@/components/landing/reveal-on-scroll";
import { HeroDemo } from "@/components/landing/hero-demo";
import { HeroDemoScenes } from "@/components/landing/hero-demo-scenes";
import { RulesCarousel } from "@/components/landing/rules-carousel";
import { RulesModal } from "@/components/landing/rules-modal";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { ProductTabs } from "@/components/landing/product-tabs";
import { SolutionDemo } from "@/components/landing/solution-demo";
import { HOME_FAQ, homeFaqJsonLd } from "@/lib/landing/home-faq";
import { homeBlogStrip } from "@/lib/landing/home-blog";
import { FaviconImg } from "@/components/ui/favicon-img";
import { HeroDomainField } from "@/components/landing/hero-domain-field";
import { PromoStrip, RecommendationsCta, HomeCtaBand } from "@/components/landing/session-ctas";
import { MARKETING_CONTENT_LINKS, MARKETING_ENTITY_LINKS } from "@/components/marketing-content-links";

const FEATURES: Array<{ icon: string; t: string; d: string }> = [
  { icon: "search", t: "¿Apareces en la IA?", d: "Mide en qué porcentaje de respuestas de IA te mencionan y te citan como fuente, prompt a prompt." },
  { icon: "competitors", t: "Frente a quién pierdes", d: "Detecta competidores directos y descubre dónde ganan visibilidad que tú no tienes." },
  { icon: "cite", t: "Qué URLs se citan", d: "Conoce las páginas que los motores de IA usan como fuente para responder en tu mercado." },
  { icon: "layers", t: "Multi-motor", d: "Gemini, Claude y ChatGPT hoy, con más motores de IA sumándose sin coste extra — una visión unificada de tu visibilidad." },
  { icon: "recs", t: "Acciones, no solo datos", d: "Cada insight se convierte en una acción priorizada por impacto, esfuerzo y confianza." },
  { icon: "sparkles", t: "Soluciones generadas", d: "Genera el FAQ, el schema o el contenido que falta con un clic, listo para publicar." }
];


/**
 * HOME-2026-08 Fase B1 — los cuatro pasos de «Mides, entiendes, arreglas y
 * mejoras». Las tarjetas son maquetas del producto, no datos de nadie.
 *
 * **Los puntos del paso 03 son los REALES, no los del artboard.** La maqueta
 * ponía «+12» a los datos estructurados, «+8» a la intro y «+6» a `llms.txt`.
 * En el producto el peso de los datos estructurados es 15 y el de la intro
 * respuesta-primero es 5 (`WEIGHT`, `lib/web-audit/issues.ts`), y `llms.txt`
 * es un aviso con `pointDelta: null` — el producto se niega a atribuirle
 * puntos a propósito. Publicar «+6 pts» ahí habría sido inventar una métrica
 * que la pantalla real nunca enseña (CLAUDE.md, "no fake metrics"). Los
 * rótulos también son los del producto («Datos estructurados», «Intro
 * respuesta-primero», «llms.txt»), copiados de `issue-rows.tsx`, para que
 * quien llegue a la auditoría reconozca lo que vio en la portada.
 */
/* Los tres motores que el escaneo consulta de verdad (`lib/llm/`), no una
   selección de marcas. El artboard pone esta fila bajo el texto del paso 1 con
   un solo logo y dos huecos que su editor rellenaba; aquí se sirven los tres
   que el producto ejecuta, que es lo que la frase del paso afirma. */
const HOW_ENGINES = [
  { name: "ChatGPT", src: "/brand/engines/chatgpt.svg" },
  { name: "Gemini", src: "/brand/engines/gemini.svg" },
  { name: "Claude", src: "/brand/engines/claude.svg" }
];

/* Las cinco pantallas, en el orden del artboard. Los rótulos son los del
   producto (la barra lateral de la consola), no una versión comercial. */
/* La cápsula de motor de la pantalla de Prompts: el mismo logo con tres
   estados —te cita, te menciona, no apareces—, que es la distinción que el
   producto hace de verdad y la que la sección oscura ya explicaba. */
function PromptEngine({ src, tono }: { src: "chatgpt" | "gemini" | "claude"; tono: "cite" | "ment" | "off" }) {
  return (
    <span className={`lp-prod-chip-eng ${tono}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/engines/${src}.svg`} alt="" width={15} height={15} />
    </span>
  );
}

/**
 * Las categorías de «Huecos de prompt» de la pantalla real de Competidores
 * (`app/dashboard/projects/[projectId]/competitors/prompt-gap-section.tsx`).
 * Se omite la quinta, «Sin nadie» —los prompts donde el motor no nombra a
 * ningún competidor—, porque no es un hueco: no hay nada que recuperar ahí y
 * en una tira de cuatro elementos ocupaba sitio sin decir nada. Los cuatro que
 * quedan suman los 14 prompts que declara la pantalla de Prompts.
 */
const BLOG_STRIP = homeBlogStrip();

const HUECOS = [
  { t: "Ausente", n: 4, tono: "mal" },
  { t: "Por detrás", n: 3, tono: "regular" },
  { t: "Por delante", n: 5, tono: "bien" },
  { t: "En exclusiva", n: 2, tono: "top" }
] as const;

const PRODUCT_TABS = [
  { id: "pg-overview", label: "Visión general" },
  { id: "pg-prompts", label: "Prompts" },
  { id: "pg-comp", label: "Competidores" },
  { id: "pg-audit", label: "Auditoría web" },
  { id: "pg-recs", label: "Recomendaciones" }
] as const;

const HOW_STEPS: Array<{ n: string; t: string; d: string; extra?: ReactNode; sheet: ReactNode }> = [
  {
    n: "01",
    t: "Mides tu visibilidad",
    d: "Tus prompts se lanzan en los motores de IA. Cuántas veces te nombran y cuántas te citan como fuente: son dos problemas distintos con soluciones distintas.",
    extra: (
      <div className="lp-how-engines">
        {HOW_ENGINES.map((e) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img key={e.name} src={e.src} alt={e.name} width={20} height={20} />
        ))}
      </div>
    ),
    sheet: (
      // RECS-DARK-01-B (2026-08-23): la tarjeta enseñaba sólo "te nombran",
      // cuando la copia de al lado dice explícitamente que nombrar y citar
      // «son dos problemas distintos con soluciones distintas». Cada marca
      // pasa a tener sus DOS barras, una por métrica, con su propia etiqueta
      // ("Nombran"/"Citan") — así la fila explica su propio dato y no hace
      // falta una leyenda aparte arriba (fundador, 2026-08-23: "la B pero sin
      // leyenda"). El dato de "citan" de IKEA es el mismo 4% de la escena 1
      // de la demo del hero: es la misma marca ficticia en la misma portada,
      // y no puede decir dos cosas distintas de sí misma.
      <div className="lp-sheet lp-sheet--rows">
        {[
          { m: "IKEA", d: "ikea.es", ini: "IK", men: 24, cit: 4, own: true },
          { m: "Leroy Merlin", d: "leroymerlin.es", ini: "LM", men: 21, cit: 16, own: false },
          { m: "Maisons du Monde", d: "maisonsdumonde.com", ini: "MM", men: 18, cit: 21, own: false }
        ].map((r) => (
          <div className="lp-sheet-row lp-sheet-row--dual" key={r.m}>
            <span className="lp-sheet-fav">
              <FaviconImg domain={r.d} cssSize={28} fallback={<span>{r.ini}</span>} />
            </span>
            <span className="lp-sheet-dualbody">
              <span className="lp-sheet-nm">
                {r.m}
                {r.own ? <span className="lp-sheet-tag">Tu marca</span> : null}
              </span>
              <span className="lp-sheet-mini">
                <span className="k">Nombran</span>
                <span className="lp-sheet-bar">
                  <span className={`fill ${r.own ? "own" : ""}`} style={{ width: `${(r.men / 24) * 100}%` }} />
                </span>
                <span className="v">{r.men}%</span>
              </span>
              <span className="lp-sheet-mini">
                <span className="k">Citan</span>
                <span className="lp-sheet-bar">
                  <span className="fill cit" style={{ width: `${(r.cit / 24) * 100}%` }} />
                </span>
                <span className="v">{r.cit}%</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    )
  },
  {
    n: "02",
    t: "Entiendes por qué",
    d: "Un modelo construye su respuesta a partir de páginas concretas. Te enseñamos cuáles son y quién sale citado en ellas.",
    sheet: (
      <div className="lp-sheet lp-sheet--card">
        {/* RECS-DARK-02-B (2026-08-23): la barra iba sin etiquetas —"enseña la
            forma del dato, no lo afirma"— pero el fundador la vio sin decir a
            quién pertenece cada tramo y pidió una leyenda. Los nombres son
            los mismos competidores ya establecidos en esta portada —Kave
            Home y Maisons du Monde son justo los que cita la frase de abajo,
            Leroy Merlin ya aparece en la tarjeta 01— y no marcas nuevas. El
            segundo tramo deja de ser `--brand-neg` (#d23b48): ese rojo está
            reservado en todo el sitio para "negativo/tuyo" —cuotas que
            bajan, `x` de la auditoría—, y aquí no marcaba nada tuyo, era sólo
            decorativo. Kave Home pasa a un azul más claro de la misma
            familia, y el rojo se reserva para la fila de IKEA que SÍ es
            negativa: 0%, no aparece citada. */}
        <div className="lp-sheet-split" aria-hidden="true">
          <span style={{ width: "43%", background: "var(--brand-blue)" }} />
          <span style={{ width: "20%", background: "#7da2f5" }} />
          <span style={{ width: "19%", background: "var(--brand-cyan)" }} />
          <span style={{ width: "18%", background: "#c3cbd8" }} />
        </div>
        <div className="lp-sheet-leg">
          {[
            { n: "Maisons du Monde", p: 43, c: "var(--brand-blue)" },
            { n: "Kave Home", p: 20, c: "#7da2f5" },
            { n: "Leroy Merlin", p: 19, c: "var(--brand-cyan)" },
            { n: "Otras marcas", p: 18, c: "#c3cbd8" }
          ].map((s) => (
            <Fragment key={s.n}>
              <span className="lp-sheet-legn">
                <span className="i" style={{ background: s.c }} />
                {s.n}
              </span>
              <span className="lp-sheet-legp">{s.p}%</span>
            </Fragment>
          ))}
          <span className="lp-sheet-legn lp-sheet-legn--tu">
            <span className="i" />
            IKEA
          </span>
          <span className="lp-sheet-legp lp-sheet-legn--tu">0%</span>
        </div>
        <div className="lp-sheet-src">
          <span className="lp-sheet-fav">
            <FaviconImg domain="elmueble.com" cssSize={26} fallback={<span>EM</span>} />
          </span>
          <span className="lp-sheet-srcname">
            <span className="lp-sheet-name">elmueble.com</span>
            <span className="lp-sheet-meta">10 citas · cita a 3 rivales</span>
          </span>
          <span className="lp-sheet-flag">No te cita</span>
        </div>
        <blockquote className="lp-sheet-quote">
          «…según elmueble.com, las mejores opciones son Maisons du Monde y Kave Home…»
        </blockquote>
      </div>
    )
  },
  {
    n: "03",
    t: "Arreglas tu web",
    d: "Antes de pelear por que te recomienden, hay que poder leerte. Para cada fallo estimamos los puntos que ganarías al corregirlo.",
    sheet: (
      <div className="lp-sheet lp-sheet--fix">
        {[
          { t: "Sin datos estructurados", p: "+15 pts" },
          { t: "La intro no responde primero", p: "+5 pts" },
          { t: "Falta llms.txt", p: "aviso" }
        ].map((f) => (
          <div className="lp-sheet-fix" key={f.t}>
            <span className="lp-sheet-badge lp-sheet-badge--bad">
              <Icon name="x" size={14} />
            </span>
            <span className="lp-sheet-name">{f.t}</span>
            <span className={`lp-sheet-pts ${f.p === "aviso" ? "warn" : ""}`}>{f.p}</span>
          </div>
        ))}
        <div className="lp-sheet-fix lp-sheet-fix--ok">
          <span className="lp-sheet-badge lp-sheet-badge--ok">
            <Icon name="check" size={14} />
          </span>
          <span className="lp-sheet-name">GPTBot con acceso permitido</span>
        </div>
      </div>
    )
  },
  {
    n: "04",
    t: "Mejoras tu presencia",
    d: "Cada acción trae su solución generada: las FAQ, el schema, la página que falta. El siguiente escaneo mide si funcionó.",
    sheet: (
      <div className="lp-sheet lp-sheet--split">
        <div className="lp-sheet-gen">
          <Icon name="sparkles" size={16} />
          <span className="lp-sheet-name">Solución generada</span>
          <span className="lp-sheet-ready">Lista para publicar</span>
        </div>
        <div className="lp-sheet-result">
          <div className="lp-sheet-dial">
            <svg viewBox="0 0 112 112" aria-hidden="true">
              <circle cx="56" cy="56" r="48" fill="none" stroke="#eef1f6" strokeWidth="12" />
              <circle
                className="lp-sheet-dial-arc"
                cx="56"
                cy="56"
                r="48"
                fill="none"
                stroke="var(--brand-blue)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="301.6"
                strokeDashoffset="87.5"
                transform="rotate(-90 56 56)"
              />
            </svg>
            <span className="lp-sheet-dial-num">71</span>
          </div>
          {/* El botón es un DIBUJO dentro de una maqueta, no un control: va como
              `span` y `aria-hidden`, igual que los de la demo del hero. Un
              `<button>` aquí sería un control muerto, y el barrido del piloto
              lo pulsaría esperando que hiciera algo. Cierra la historia de la
              tarjeta: la recomendación no te dice qué hacer, se aplica
              (fundador, 2026-08-23). */}
          <div className="lp-sheet-delta">
            <span className="lp-sheet-before">antes 48</span>
            <span className="lp-sheet-gain">+23 pts</span>
            <span className="lp-sheet-apply" aria-hidden="true">
              <Icon name="check" size={13} />
              Aplicar solución
            </span>
          </div>
          <pre className="lp-sheet-code">
            <span className="tag">&lt;script type=&quot;application/ld+json&quot;&gt;</span>
            {'\n{ "@type": "FAQPage", … }\n'}
            <span className="tag">&lt;/script&gt;</span>
          </pre>
        </div>
      </div>
    )
  }
];

const SPOTLIGHT_ITEMS: Array<{ t: string; d: string }> = [
  { t: "Priorizado por impacto", d: "Ordenamos las acciones por su efecto real en tu visibilidad en IA." },
  { t: "Basado en evidencia", d: "Cada recomendación incluye la respuesta de IA y la fuente que la respalda." },
  { t: "Genera la solución", d: "FAQ, schema, contenido o reglas técnicas listas para publicar." }
];

function Badge({ tone, icon, children }: { tone: "pos" | "neg" | "neutral"; icon?: string; children: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

/**
 * La landing es un **componente de servidor** (PRELAUNCH-HARDENING-1 Fase V,
 * V4). Lo era todo de cliente por un solo campo con estado, y con ello se
 * llevaba al navegador seis secciones de markup que no cambian nunca.
 *
 * Lo que queda de cliente, y por qué:
 * - `HeroDomainField` — el campo del hero: estado y marcador tecleado.
 * - `MarketingMobileNav` — el cajón de navegación en móvil: abre y cierra.
 * - `HeroDemo` — los mandos de la demo del hero. Sus cinco escenas son
 *   marcado del servidor; la isla sólo mueve una clase, pinta el raíl y coloca
 *   el cursor.
 * - `RulesCarousel`, `ProductTabs`, `SolutionDemo`, `FaqAccordion`,
 *   `RulesModal` — mandos de sus secciones, con el mismo trato: el contenido
 *   lo sirve el servidor y la isla sólo lo conduce.
 *
 * Todo lo demás navega con `<Link>` en vez de con `router.push`, que es lo que
 * obligaba a que la página entera fuera de cliente. El aspecto no cambia: las
 * clases (`.lp-cta`, `.lp-nav-btn`, `.btn`) son todas de clase y declaran su
 * propio `display: inline-flex`, y `a { text-decoration: none }` es global —
 * de hecho `.lp-cta-soft` ya se usaba sobre un `<a>` en este mismo hero.
 * Se gana además lo que un botón no daba: abrir en pestaña nueva y ver el
 * destino al pasar por encima.
 */
export function LandingPage() {
  return (
    <div className="lp">
      {/* El `FAQPage` sale de `HOME_FAQ`, la misma constante que pinta la
          sección de abajo. Un schema que afirma preguntas que la página no
          enseña es exactamente el fallo que este producto audita en las webs
          de sus clientes; construirlo de otra fuente lo permitiría. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: homeFaqJsonLd() }}
      />
      {/* HERO — nav + promo strip integrated into the same gradient ground
          (v3 rebrand, founder-approved design session: "estilo Semrush"). */}
      <header className="lp-hero lp-hero--home" id="producto">
        {/* GENSCORE-HEADER-3 (fundador, 2026-08-12): "la franja de 7 días
            tiene que salir a usuarios no logados o plan free". Es una oferta
            de alta, así que a quien ya paga le sobra — pero a un logado en
            Free le sigue sirviendo, y por eso no basta con "ocultar si hay
            sesión". `showsPromoStrip` es la misma pregunta que la insignia de
            plan, invertida, y vive junto a ella. */}
        <PromoStrip />
        <PublicHeader hero />

        <div className="lp-hero-content">
          {/* HOME-2026-08 Fase A: titular y bajada del diseño aprobado
              (`docs/design-reference/home-2026-08/`). El titular es una
              pregunta a propósito: es la que se hace quien llega, y es la que
              el comprobador gratuito responde en veinte segundos. */}
          <h1 className="lp-h1">
            {/* El salto es del diseño, no del ancho: la maqueta lleva un `<br>`
                ahí para que «la inteligencia artificial» caiga entera en la
                segunda línea, en azul. Dejarlo fluir parte la frase por donde
                toque el ancho y en 1280 px se lleva «la» a la primera. */}
            ¿Te recomienda<br />
            <span className="lp-h1-accent">la inteligencia artificial</span>?
          </h1>
          <p className="lp-lead">
            Comprobamos si ChatGPT, Gemini y Claude nombran tu marca al responder a tus clientes
            y qué marcas salen en tu lugar.
          </p>
          {/* Las llamadas a la acción viven DENTRO de `HeroDomainField`, no
              aquí: «Analiza gratis» tiene que guardar el dominio escrito antes
              de navegar, y eso sólo puede hacerlo la isla de cliente. Tenerlas
              también aquí las pintaba dos veces (hallazgo del fundador sobre el
              preview de #379, 2026-08-11). */}
          <div className="lp-hero-form">
            <HeroDomainField />
          </div>
        </div>

        {/* LA DEMO DEL HERO — HOME-2026-08 Fase A2.

            **Aquí estaba `ProductTour variant="hero"`, y se va.** El artboard
            aprobado pone en este hueco una demo de cinco escenas, no el tour;
            el tour en el hero fue una decisión nuestra de mientras tanto (log
            §1), no del diseño. **El tour NO se pierde**: sigue montado en la
            consola desde `tour-provider.tsx` como popup de bienvenida, que es
            donde tiene sentido — se lo enseña a quien acaba de entrar, no a
            quien todavía no sabe qué es esto.

            Lo que gana el hueco: en vez de un recorrido por la interfaz, una
            historia de cinco escenas que empieza por el golpe —ChatGPT
            recomendando a tus rivales sin nombrarte— y termina con la misma
            pregunta contigo dentro. La interfaz se enseña después, en «Cinco
            pantallas».

            El marcado de las escenas es del SERVIDOR y la 0 se sirve puesta:
            lo primero que ve alguien que llega no puede depender de hidratar.
            La isla sólo mueve la clase, pinta el raíl y coloca el cursor. */}
        <div className="lp-shot lp-hx" id="lp-hx">
          <div className="lp-hx-halo" aria-hidden="true" />
          <div className="lp-hx-dev">
            <div className="lp-hx-bar">
              <span className="lp-prod-dot" style={{ background: "#ff5f57" }} />
              <span className="lp-prod-dot" style={{ background: "#febc2e" }} />
              <span className="lp-prod-dot" style={{ background: "#28c840" }} />
              <span className="lp-hx-urlbar">chatgpt.com</span>
            </div>
            <div className="lp-hx-body">
              <HeroDemoScenes />
            </div>
          </div>
          <HeroDemo target="#lp-hx" />
        </div>
      </header>

      <main>
      {/* La franja «Motores de IA que analizamos por ti» se retira aquí:
          HOME-2026-08 sube los tres motores al hero, con sus logos, justo bajo
          el campo de dominio. Mantener las dos dejaba los mismos tres nombres
          repetidos a cien píxeles de distancia. */}

      {/* EL CAMBIO DE REGLAS — HOME-2026-08 Fase B1. Sección nueva: es la que
          explica por qué el producto existe antes de contar qué hace. */}
      <section className="lp-section lp-rules">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">El cambio de reglas</div>
            <h2 className="lp-h2">
              En Google competías por un clic.<br />
              En la IA compites por ser la respuesta.
            </h2>
            <p className="lp-sec-sub">
              Quien pregunta a un modelo{" "}
              {/* En el marcado del servidor esto es un enlace normal a `/geo`. La
                  isla lo intercepta y abre la tabla en su lugar; sin JS, o en
                  pestaña nueva, se llega a la página que lo explica con más sitio.
                  Un modal que no se abre no deja nada detrás; un enlace sí. */}
              <Link className="lp-sec-lnk" id="lp-abrir-tabla" href="/geo">
                <strong>no recibe diez enlaces para elegir: recibe una recomendación</strong>
              </Link>{" "}
              con dos o tres marcas. <strong>O estás en esa frase, o no existes.</strong>
            </p>
          </div>

          {/* Reserva el alto de los mandos del carrusel para que la isla no
              mueva la página al hidratar. Sólo mide algo bajo 560px. */}
          <div className="lp-rules-navslot">
            <RulesCarousel track=".lp-rules-pair" slide=".lp-rules-card" />
          </div>

          {/* FUERA del hueco de los mandos, que es `display: none` por encima de
              560px. Un `<dialog>` cuyo ancestro no se pinta no entra en la capa
              superior: `showModal()` decía `open=true` y el diálogo medía 0×0.
              Va suelto en la sección, que es donde un modal no depende de nadie. */}
          <RulesModal triggerId="lp-abrir-tabla" />

          <div className="lp-rules-pair">
            <article className="lp-rules-card">
              <div className="lp-rules-tag">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/engines/google.svg" alt="" width={16} height={16} aria-hidden="true" />
                Búsqueda tradicional · SEO
              </div>
              <div className="lp-rules-query">
                <Icon name="search" size={15} />
                mejores tiendas de muebles calidad precio
              </div>
              <ol className="lp-serp">
                <li><span className="t">Las 12 mejores tiendas de muebles en 2026</span><span className="u">elmueble.com</span></li>
                <li><span className="t">Muebles de salón | Maisons du Monde</span><span className="u">maisonsdumonde.com</span></li>
                <li><span className="t">IKEA — Muebles y decoración para tu hogar</span><span className="u">ikea.es</span></li>
              </ol>
              <div className="lp-rules-grow" aria-hidden="true" />
              <p className="lp-rules-foot">Compites por la <strong>posición</strong>.<span>El usuario elige un enlace.</span></p>
            </article>

            <div className="lp-rules-arrow" aria-hidden="true">
              <Icon name="arrRight" size={17} />
            </div>

            <article className="lp-rules-card lp-rules-card--geo">
              <div className="lp-rules-tag lp-rules-tag--geo">
                <Icon name="sparkles" size={15} />
                Respuesta generativa · GEO
              </div>
              <div className="lp-rules-ask">¿Qué tienda de muebles tiene mejor relación calidad-precio?</div>
              <div className="lp-rules-answer">
                Para calidad-precio, las opciones más recomendadas son <mark>Maisons du Monde</mark>, por
                diseño, y <mark>Kave Home</mark>, por materiales y acabados. Si buscas soluciones a medida,{" "}
                <mark>Leroy Merlin</mark> es la alternativa habitual…
              </div>
              <div className="lp-rules-src">
                <Icon name="link" size={13} />
                Fuentes: elmueble.com, micasarevista.com
              </div>
              <div className="lp-rules-grow" aria-hidden="true" />
              <p className="lp-rules-foot lp-rules-foot--geo">Compites por la <strong>mención</strong>.<span>La IA ya ha respondido por ti.</span></p>
            </article>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA — la única superficie oscura de la zona pública.
          Conserva `id="como"` porque el enlace del nav apunta ahí y el nav es
          fuente única de las ~57 páginas públicas: cambiarlo aquí las rompe
          todas.

          CON REVELACIÓN POR SCROLL desde el 2026-08-22. Se descartó primero
          para no añadir una isla de cliente a una página que
          PRELAUNCH-HARDENING-1 Fase V dejó server-rendered a propósito, y el
          fundador la echó en falta al mirar el preview: la revelación no es un
          adorno del artboard, es lo que hace que las barras se lean como una
          medición que ocurre. `RevealOnScroll` es una isla de ~1KB que sólo
          observa y añade una clase; el markup de la sección sigue siendo del
          servidor y sin JS se ve entero y quieto. */}
      <section className="lp-section lp-how" id="como">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker lp-kicker--dark">Cómo funciona</div>
            <h2 className="lp-h2 lp-h2--dark">
              Mides, entiendes,<br />arreglas y mejoras
            </h2>
            <p className="lp-sec-sub lp-sec-sub--dark">
              La mayoría de herramientas te dicen si te mencionan. GenScore te da el trabajo hecho.
            </p>
          </div>

          <ol className="lp-how-rail">
            {HOW_STEPS.map((step) => (
              <li className="lp-how-step" key={step.n}>
                <div className="lp-how-text">
                  <div className="lp-how-num">{step.n}</div>
                  <h3 className="lp-how-h3">{step.t}</h3>
                  <p>{step.d}</p>
                  {step.extra}
                </div>
                <div className="lp-how-dot" aria-hidden="true" />
                <div className="lp-how-sheet">{step.sheet}</div>
              </li>
            ))}
          </ol>
        </div>
        <RevealOnScroll selector=".lp-how-step" />
      </section>

      {/* FEATURES */}
      <section className="lp-section">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">La plataforma</div>
            <h2 className="lp-h2">Todo lo que necesitas para ganar en la búsqueda de IA</h2>
          </div>
          <div className="lp-features">
            {FEATURES.map((f) => (
              <div className="lp-feat" key={f.t}>
                <div className="fic"><Icon name={f.icon} size={20} /></div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SPOTLIGHT — recommendations */}
      <section className="lp-section alt" id="recomendaciones">
        <div className="lp-inner">
          <div className="lp-spot">
            <div>
              <div className="lp-kicker">El corazón del producto</div>
              <h2 className="lp-h2" style={{ marginTop: 12 }}>Recomendaciones que se convierten en trabajo hecho</h2>
              <p className="lp-sec-sub" style={{ margin: "14px 0 0", maxWidth: "none" }}>
                No es otro dashboard pasivo. Cada acción explica el problema, por qué importa y la evidencia — y genera la solución por ti.
              </p>
              <div className="lp-spot-list">
                {SPOTLIGHT_ITEMS.map((x) => (
                  <div className="lp-spot-item" key={x.t}>
                    <span className="chk"><Icon name="check" size={13} /></span>
                    <div><div className="t">{x.t}</div><div className="d">{x.d}</div></div>
                  </div>
                ))}
              </div>
              <RecommendationsCta />
            </div>

            {/* mock rec card */}
            <div className="lp-spot-visual">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span className="rec-rank high" style={{ width: 30, height: 30, fontSize: 13 }}>1</span>
                <Badge tone="neg">Alta</Badge>
                <Badge tone="pos" icon="bolt">Victoria rápida</Badge>
              </div>
              <div style={{ fontSize: 15, fontWeight: 750, lineHeight: 1.3 }}>Añade FAQ listo para citar en prompts de comparación</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
                Tus competidores aparecen en 7 prompts de comparación donde tu marca no figura.
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
                <div className="rmetric"><div className="l">Impacto</div><div className="v"><DotMeter n={5} tone="h" /></div></div>
                <div className="rmetric"><div className="l">Esfuerzo</div><div className="v"><DotMeter n={2} tone="m" /></div></div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div className="l" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>Confianza</div>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 750, marginTop: 4 }}>88%</div>
                </div>
              </div>
              <div className="evidence mt12">
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <Badge tone="neutral" icon="quote">Gemini</Badge>
                </div>
                <div className="ev-quote">…las opciones más recomendadas son <span className="mk">Orbit</span> y <span className="mk">Quanta</span>, con onboarding sólido…</div>
              </div>
              {/* Es el dibujo de un botón dentro de una tarjeta de ejemplo, no
                  un control: la recomendación que ilustra es inventada, así que
                  no hay nada que generar. Se pinta como `<span>` para que un
                  lector de pantalla no lo anuncie como pulsable y el teclado no
                  se pare en él. El aspecto no cambia: `.btn` declara su propio
                  `display: inline-flex`. */}
              <span className="btn btn-soft btn-sm mt12" style={{ width: "100%" }} aria-hidden="true">
                <Icon name="sparkles" size={13} />Generar solución
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* EL PRODUCTO — HOME-2026-08 Fase B2. Cinco pantallas del producto en un
          marco de navegador, con pestañas. Va en CLARO (`prod--light` del
          artboard) y no en oscuro: el artboard móvil la tiene sobre `--canvas`
          y «Cómo funciona», justo encima, es la única superficie oscura de la
          zona pública (`docs/design-reference/home-2026-08/README.md`). Dos
          oscuras seguidas no.

          LAS CIFRAS SON ILUSTRATIVAS, y es una decisión del fundador
          (2026-08-22: «lo hacemos tal cual la maqueta, es ilustrativo»). El
          vocabulario sí es del producto — «Franja competitivo» con 71 es
          exactamente lo que asigna `app/dashboard/projects/[projectId]`
          a partir de 70. */}
      <section className="lp-section lp-prod" id="pantallas">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">El producto</div>
            <h2 className="lp-h2">Cinco pantallas. Todo tu posicionamiento.</h2>
            <p className="lp-sec-sub">
              Esto es exactamente lo que tienes el primer día.<br />
              Sin demos preparadas y sin pedir una llamada.
            </p>
          </div>

          {/* Reserva el alto de la tira de pestañas para que la isla no mueva
              la página al hidratar. */}
          <div className="lp-prod-shell">
            <ProductTabs tabs={PRODUCT_TABS}>
            <div className="lp-prod-frame">
              <div className="lp-prod-bar">
                <span className="lp-prod-dot" style={{ background: "#ff5f57" }} />
                <span className="lp-prod-dot" style={{ background: "#febc2e" }} />
                <span className="lp-prod-dot" style={{ background: "#28c840" }} />
                <span className="lp-prod-url">app.genscore.es/ikea.es</span>
              </div>
              <div className="lp-prod-body">
                {/* Visión general */}
                <div className="lp-prod-pg on" id="pg-overview" role="tabpanel">
                  {/* Móvil: el artboard simplifica esta pantalla a marcador,
                      dos indicadores y una línea de evolución. */}
                  <div className="lp-prod-mob">
                    <div className="lp-prod-card lp-prod-mscore">
                      <div className="lp-prod-dial">
                        <svg viewBox="0 0 88 88" aria-hidden="true">
                          <circle cx="44" cy="44" r="37" fill="none" stroke="#eef1f6" strokeWidth="10" />
                          <circle cx="44" cy="44" r="37" fill="none" stroke="var(--brand-blue)" strokeWidth="10" strokeLinecap="round" strokeDasharray="232.5" strokeDashoffset="67.4" transform="rotate(-90 44 44)" />
                        </svg>
                        <span className="lp-prod-num">71</span>
                      </div>
                      <div>
                        <div className="lp-prod-cap">GEO Score</div>
                        <div className="lp-prod-pill pos">+23 pts</div>
                        <div className="lp-prod-franja">Franja <b>competitivo</b></div>
                      </div>
                    </div>
                    <div className="lp-prod-mkpis">
                      <div className="lp-prod-card lp-prod-mkpi">
                        <div className="lp-prod-lbl">Tasa de mención</div>
                        <div className="lp-prod-val">68%</div>
                        <div className="lp-prod-delta pos">▲ 9 pts</div>
                      </div>
                      <div className="lp-prod-card lp-prod-mkpi">
                        <div className="lp-prod-lbl">Tasa de cita</div>
                        <div className="lp-prod-val">12%</div>
                        <div className="lp-prod-delta neg">▼ 2 pts</div>
                      </div>
                    </div>
                    <div className="lp-prod-card lp-prod-mspark">
                      <div className="lp-prod-lbl">Evolución</div>
                      <svg viewBox="0 0 300 76" preserveAspectRatio="none" aria-hidden="true">
                        <path d="M0,62 L50,58 L100,52 L150,50 L200,34 L250,24 L300,12" fill="none" stroke="var(--brand-blue)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        <circle cx="296" cy="12" r="4" fill="var(--brand-blue)" />
                      </svg>
                    </div>
                  </div>

                  <div className="lp-prod-head">
                    <span className="lp-sheet-fav">
                      <FaviconImg domain="ikea.es" cssSize={30} fallback={<span>IK</span>} />
                    </span>
                    <span className="lp-prod-who">
                      <span className="lp-prod-dom">ikea.es</span>
                      <span className="lp-prod-sub">Escaneo posterior a las acciones aplicadas</span>
                    </span>
                    <span className="lp-prod-chip">Últimos 7 días</span>
                  </div>

                  <div className="lp-prod-row2">
                    <div className="lp-prod-card lp-prod-score">
                      <div className="lp-prod-dial">
                        <svg viewBox="0 0 112 112" aria-hidden="true">
                          <circle cx="56" cy="56" r="48" fill="none" stroke="#eef1f6" strokeWidth="12" />
                          <circle cx="56" cy="56" r="48" fill="none" stroke="var(--brand-blue)" strokeWidth="12" strokeLinecap="round" strokeDasharray="301.6" strokeDashoffset="87.5" transform="rotate(-90 56 56)" />
                        </svg>
                        <span className="lp-prod-num">71</span>
                      </div>
                      <div>
                        <div className="lp-prod-cap">GEO Score</div>
                        <div className="lp-prod-pill pos">+23 pts</div>
                        <div className="lp-prod-franja">Franja<br /><b>competitivo</b></div>
                      </div>
                    </div>

                    <div className="lp-prod-card">
                      <div className="lp-prod-lbl">Evolución</div>
                      <svg className="lp-prod-spark" viewBox="0 0 520 130" preserveAspectRatio="none" aria-hidden="true">
                        <defs>
                          <linearGradient id="lp-prod-gsg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity=".22" />
                            <stop offset="100%" stopColor="var(--brand-blue)" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M0,104 L86,98 L172,88 L258,86 L344,58 L430,40 L520,20 L520,130 L0,130 Z" fill="url(#lp-prod-gsg)" />
                        <path d="M0,104 L86,98 L172,88 L258,86 L344,58 L430,40 L520,20" fill="none" stroke="var(--brand-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        <circle cx="516" cy="20" r="4.5" fill="var(--brand-blue)" />
                      </svg>
                      <div className="lp-prod-sparkfoot"><span>48</span><span>71</span></div>
                    </div>
                  </div>

                  <div className="lp-prod-row3">
                    {[
                      { t: "Tasa de mención", v: "68%", d: "▲ 9 pts", tono: "pos" },
                      { t: "Tasa de cita", v: "12%", d: "▼ 2 pts", tono: "neg" },
                      { t: "Cuota de voz", v: "24%", d: "▲ 3 pts", tono: "pos" }
                    ].map((k) => (
                      <div className="lp-prod-card lp-prod-kpi" key={k.t}>
                        <div className="lp-prod-lbl">{k.t}</div>
                        <div className="lp-prod-val">{k.v}</div>
                        <div className={`lp-prod-delta ${k.tono}`}>{k.d}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Prompts */}
                <div className="lp-prod-pg" id="pg-prompts" role="tabpanel">
                  <div className="lp-prod-mob">
                    <div className="lp-prod-card lp-prod-list">
                      {/* LA PRIMERA VA ABIERTA, y eso NO sale del artboard móvil, que
                          deja las tres preguntas con sus pastillas y nada más. El
                          fundador lo pidió el 2026-08-23: sin una respuesta a la vista
                          la pantalla enseña que medimos, no QUÉ leemos, que es lo único
                          que distingue esto de una lista de palabras clave. La respuesta
                          es la misma que ya está en el artboard de escritorio. */}
                      <div className="lp-prod-mq">
                        <div className="q">«¿Dónde compro muebles baratos y bonitos?»</div>
                        <div className="lp-prod-tags">
                          <span className="lp-prod-pill ment">Mención</span>
                          <span className="lp-prod-pill cita">Cita</span>
                        </div>
                        <div className="lp-prod-manswer">
                          <div className="lp-prod-mansrow">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/brand/engines/chatgpt.svg" alt="" width={14} height={14} />
                            <span className="lp-prod-ansc">Respuesta de ChatGPT</span>
                          </div>
                          <p>
                            Para calidad-precio la referencia sigue siendo <mark>IKEA</mark>, sobre
                            todo en salón y almacenaje…
                          </p>
                          <div className="lp-prod-src">
                            <Icon name="link" size={13} />
                            <span>ikea.es/es/es/rooms/living-room</span>
                          </div>
                        </div>
                      </div>
                      {[
                        { q: "«¿Qué tienda de muebles tiene mejor calidad?»", e: [["Sin mención", "alto"]] },
                        { q: "«Mejores tiendas para amueblar un piso pequeño»", e: [["Mención", "ment"], ["Sin cita", "gris"]] }
                      ].map((r) => (
                        <div className="lp-prod-mq" key={r.q}>
                          <div className="q">{r.q}</div>
                          <div className="lp-prod-tags">
                            {r.e.map(([t, tono]) => (
                              <span className={`lp-prod-pill ${tono}`} key={t}>{t}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="lp-prod-mpie">14 preguntas, lanzadas en los tres motores.</p>
                  </div>

                  <div className="lp-prod-pghead">
                    <span className="t">Prompts</span>
                    <span className="m">14 preguntas · 3 motores · 42 respuestas</span>
                  </div>

                  <div className="lp-prod-card lp-prod-list">
                    <div className="lp-prod-q lp-prod-q--open">
                      <div className="lp-prod-qrow">
                        <span className="q">«¿Dónde compro muebles baratos y bonitos?»</span>
                        <span className="lp-prod-chips">
                          <PromptEngine src="chatgpt" tono="cite" />
                          <PromptEngine src="gemini" tono="ment" />
                          <PromptEngine src="claude" tono="off" />
                        </span>
                      </div>
                      <div className="lp-prod-answer">
                        <div className="lp-prod-qrow">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/brand/engines/chatgpt.svg" alt="" width={16} height={16} />
                          <span className="lp-prod-ansc">Respuesta de ChatGPT</span>
                          <span className="lp-prod-pill cita">Te cita</span>
                        </div>
                        <p>
                          Para calidad-precio la referencia sigue siendo <mark>IKEA</mark>, sobre todo
                          en salón y almacenaje…
                        </p>
                        <div className="lp-prod-src">
                          <Icon name="link" size={14} />
                          <span>ikea.es/es/es/rooms/living-room</span>
                        </div>
                      </div>
                    </div>

                    {[
                      { q: "«¿Qué tienda de muebles tiene mejor calidad?»", e: ["off", "off", "ment"] },
                      { q: "«Mejores tiendas para amueblar un piso pequeño»", e: ["ment", "ment", "off"] },
                      { q: "«Tiendas de decoración nórdica en España»", e: ["cite", "cite", "ment"] }
                    ].map((r) => (
                      <div className="lp-prod-q" key={r.q}>
                        <div className="lp-prod-qrow">
                          <span className="q">{r.q}</span>
                          <span className="lp-prod-chips">
                            {(["chatgpt", "gemini", "claude"] as const).map((m, n) => (
                              <PromptEngine key={m} src={m} tono={r.e[n] as "cite" | "ment" | "off"} />
                            ))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="lp-prod-legend">
                    <span><i className="lp-prod-chip-eng cite" /> Te cita como fuente</span>
                    <span><i className="lp-prod-chip-eng ment" /> Te menciona</span>
                    <span><i className="lp-prod-chip-eng off" /> No apareces</span>
                  </div>
                </div>

                {/* Competidores */}
                <div className="lp-prod-pg" id="pg-comp" role="tabpanel">
                  <div className="lp-prod-mob">
                    <div className="lp-prod-card lp-prod-mlist">
                      {[
                        { n: 1, m: "IKEA", d: "ikea.es", ini: "IK", w: 100, v: "24%", propia: true },
                        { n: 2, m: "Leroy Merlin", d: "leroymerlin.es", ini: "LM", w: 87, v: "21%", propia: false },
                        { n: 3, m: "Maisons du Monde", d: "maisonsdumonde.com", ini: "MM", w: 75, v: "18%", propia: false }
                      ].map((r) => (
                        <div className="lp-prod-mrank" key={r.m}>
                          <span className="pos">{r.n}</span>
                          <span className="lp-sheet-fav">
                            <FaviconImg domain={r.d} cssSize={26} fallback={<span>{r.ini}</span>} />
                          </span>
                          <span className="who">
                            <span className="nm">{r.m}</span>
                            <span className="bar"><span className={`fill ${r.propia ? "own" : ""}`} style={{ width: `${r.w}%` }} /></span>
                          </span>
                          <span className={`val ${r.propia ? "own" : ""}`}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                    {/* La misma tira de huecos que en escritorio: el marco de
                        Competidores es el más corto de los cinco y aquí el hueco bajo
                        el ranking se ve igual. */}
                    <div className="lp-prod-huecos">
                      <div className="lp-prod-huecohead">
                        <span className="lp-prod-lbl">Huecos de prompt</span>
                        <span className="m">14 preguntas del último escaneo</span>
                      </div>
                      <div className="lp-prod-huecobar" aria-hidden="true">
                        {HUECOS.map((h) => (
                          <span key={h.t} className={`seg ${h.tono}`} style={{ width: `${(h.n / 14) * 100}%` }} />
                        ))}
                      </div>
                      <div className="lp-prod-huecolist">
                        {HUECOS.map((h) => (
                          <span className="lp-prod-hueco" key={h.t}>
                            <i className={`pt ${h.tono}`} />
                            <b>{h.n}</b> {h.t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="lp-prod-mpie">Cuota de voz en IA · últimos 7 días.</p>
                  </div>

                  <div className="lp-prod-pghead">
                    <span className="t">Competidores</span>
                    <span className="m">Cuota de voz en IA · últimos 7 días</span>
                  </div>

                  <div className="lp-prod-card lp-prod-list">
                    {[
                      { n: 1, m: "IKEA", d: "ikea.es", ini: "IK", w: 100, v: "24%", delta: "▲2", tono: "pos", propia: true },
                      { n: 2, m: "Leroy Merlin", d: "leroymerlin.es", ini: "LM", w: 87, v: "21%", delta: "▲3", tono: "pos", propia: false },
                      { n: 3, m: "Maisons du Monde", d: "maisonsdumonde.com", ini: "MM", w: 75, v: "18%", delta: "▼1", tono: "neg", propia: false },
                      { n: 4, m: "Kave Home", d: "kavehome.com", ini: "KH", w: 50, v: "12%", delta: "▲4", tono: "pos", propia: false }
                    ].map((r) => (
                      <div className="lp-prod-rank" key={r.m}>
                        <span className="pos">{r.n}</span>
                        <span className="lp-sheet-fav">
                          <FaviconImg domain={r.d} cssSize={28} fallback={<span>{r.ini}</span>} />
                        </span>
                        <span className="who">
                          <span className="nm">{r.m}</span>
                          <span className="dm">{r.d}</span>
                        </span>
                        <span className="bar">
                          <span className={`fill ${r.propia ? "own" : r.w <= 50 ? "flojo" : ""}`} style={{ width: `${r.w}%` }} />
                        </span>
                        <span className={`val ${r.propia ? "own" : ""}`}>{r.v}</span>
                        <span className={`delta ${r.tono}`}>{r.delta}</span>
                      </div>
                    ))}
                  </div>

                  <div className="lp-prod-row3 lp-prod-temas">
                    {[
                      { t: "Precio y ofertas", v: "+28", tono: "pos" },
                      { t: "Calidad y materiales", v: "−48", tono: "neg" },
                      { t: "Diseño y estilo", v: "−5", tono: "neutro" }
                    ].map((t) => (
                      <div className="lp-prod-card lp-prod-tema" key={t.t}>
                        <div className="lp-prod-lbl">{t.t}</div>
                        <div className={`v ${t.tono}`}>{t.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* HUECOS DE PROMPT. Ni el artboard de escritorio ni el móvil lo
                      traen: la pantalla terminaba en las tres tarjetas de tema y el
                      marco quedaba con ~100px en blanco debajo, porque su alto lo
                      manda la pantalla más larga. El fundador pidió el 2026-08-23
                      llenarlo con algo.

                      No es relleno inventado: es la sección «Huecos de prompt» que
                      la pantalla real de Competidores ya tiene
                      (`competitors/prompt-gap-section.tsx`), con SUS cinco categorías
                      y sus nombres —«Ausente», «Por detrás», «Por delante», «En
                      exclusiva»—, y es lo que de verdad separa a este producto de una
                      herramienta que sólo mide cuota de voz: no dice cuánto apareces,
                      dice EN QUÉ PREGUNTAS te ganan. Los números son ilustrativos como
                      el resto de la maqueta, y suman los 14 prompts que declara la
                      pantalla de Prompts — un total que no cuadrara sería un descuido
                      visible al cambiar de pestaña. */}
                  <div className="lp-prod-huecos">
                    <div className="lp-prod-huecohead">
                      <span className="lp-prod-lbl">Huecos de prompt</span>
                      <span className="m">14 preguntas del último escaneo</span>
                    </div>
                    <div className="lp-prod-huecobar" aria-hidden="true">
                      {HUECOS.map((h) => (
                        <span key={h.t} className={`seg ${h.tono}`} style={{ width: `${(h.n / 14) * 100}%` }} />
                      ))}
                    </div>
                    <div className="lp-prod-huecolist">
                      {HUECOS.map((h) => (
                        <span className="lp-prod-hueco" key={h.t}>
                          <i className={`pt ${h.tono}`} />
                          <b>{h.n}</b> {h.t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Auditoría web.
                    LOS PESOS SON LOS DEL PRODUCTO, no los del artboard, y aquí
                    no es sólo cuestión de honestidad: la sección oscura de esta
                    MISMA PÁGINA ya publica +15 y +5 (log §143), así que dejar
                    los +12 y +8 del artboard haría que la portada se
                    contradijera a sí misma sobre el mismo fallo. `llms.txt` no
                    lleva puntos —`pointDelta: null`— y por eso el artboard le
                    pone «Generar», que es lo que sí ofrece. El total del
                    encabezado es la suma real: 15 + 5 + 8. */}
                <div className="lp-prod-pg" id="pg-audit" role="tabpanel">
                  <div className="lp-prod-mob">
                    <div className="lp-prod-card lp-prod-mlist">
                      {[
                        { t: "Sin datos estructurados", p: "+15 pts", tono: "pos" },
                        { t: "Falta", mono: "llms.txt", p: "Generar", tono: "cita" },
                        { t: "La intro no responde primero", p: "+5 pts", tono: "pos" },
                        { t: "GPTBot con acceso permitido", ok: true }
                      ].map((f) => (
                        <div className="lp-prod-mfix" key={f.t + (f.mono ?? "")}>
                          {/* El artboard móvil sólo pone el ✓ de la fila correcta y deja
                              las que fallan sin marca, así que se leían como una lista
                              de cosas sin más. El fundador lo pidió el 2026-08-23: las
                              dos marcas, como en escritorio. Es además lo único que
                              distingue «lo que está mal» de «lo que está bien» cuando la
                              cápsula de puntos se lee de reojo. */}
                          <span className={`lp-sheet-badge ${f.ok ? "lp-sheet-badge--ok" : "lp-sheet-badge--bad"}`}>
                            <Icon name={f.ok ? "check" : "x"} size={12} />
                          </span>
                          <span className={`t ${f.ok ? "ok" : ""}`}>
                            {f.t}
                            {f.mono ? <> <code>{f.mono}</code></> : null}
                          </span>
                          {f.p ? <span className={`lp-prod-pill ${f.tono}`}>{f.p}</span> : null}
                        </div>
                      ))}
                    </div>
                    <p className="lp-prod-mpie">34 páginas revisadas · 28 puntos recuperables.</p>
                  </div>

                  <div className="lp-prod-pghead">
                    <span className="t">Auditoría web</span>
                    <span className="m">34 páginas revisadas · 28 puntos recuperables</span>
                  </div>

                  <div className="lp-prod-card lp-prod-list">
                    {[
                      { t: "Sin datos estructurados", mono: "Product", p: "+15 pts", tipo: "pts" },
                      { t: "Falta", mono: "llms.txt", p: "Generar", tipo: "accion" },
                      { t: "La intro no responde primero · 9 páginas", p: "+5 pts", tipo: "pts" },
                      { t: "Contenido sin fecha de actualización", p: "+8 pts", tipo: "pts" },
                      { t: "GPTBot con acceso permitido", tipo: "ok" },
                      { t: "Sitemap y canonical correctos", tipo: "ok" }
                    ].map((f) => (
                      <div className="lp-prod-fix" key={f.t + (f.mono ?? "")}>
                        <span className={`lp-sheet-badge ${f.tipo === "ok" ? "lp-sheet-badge--ok" : "lp-sheet-badge--bad"}`}>
                          <Icon name={f.tipo === "ok" ? "check" : "x"} size={14} />
                        </span>
                        <span className={`t ${f.tipo === "ok" ? "ok" : ""}`}>
                          {f.t}
                          {f.mono ? <> <code>{f.mono}</code></> : null}
                        </span>
                        {f.p ? (
                          <span className={`lp-prod-pill ${f.tipo === "accion" ? "cita" : "pos"}`}>{f.p}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recomendaciones */}
                <div className="lp-prod-pg" id="pg-recs" role="tabpanel">
                  <div className="lp-prod-mob">
                    <div className="lp-prod-card lp-prod-maccion">
                      <div className="lp-prod-tags">
                        <span className="lp-prod-pill alto">Impacto alto</span>
                        <span className="lp-prod-pill cita">Victoria rápida</span>
                      </div>
                      <h3>Te mencionan pero no citan tu dominio en «mejores tiendas de muebles»</h3>
                      {/* LA EVIDENCIA, en lugar del resumen en prosa del artboard móvil
                          («La IA te nombra en 6 respuestas y cita a elmueble.com»).
                          Dice lo mismo, pero enseñándolo: la cita literal del motor y la
                          fuente con su favicon. Es lo que sostiene la promesa de la
                          sección —«no es otro dashboard pasivo»— y lo que el artboard de
                          escritorio ya trae (fundador, 2026-08-23; log §147). */}
                      <div className="lp-prod-evid lp-prod-mevid">
                        <div className="lp-prod-cap">La evidencia</div>
                        <p>
                          «…las opciones más recomendadas son <b>IKEA</b> y Maisons du Monde,
                          según <b>elmueble.com</b>…»
                        </p>
                        <div className="lp-prod-evidsrc">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/brand/engines/chatgpt.svg" alt="" width={14} height={14} />
                          <span className="m">ChatGPT · 6 respuestas</span>
                          {/* El favicon y su dominio van en un solo envoltorio: la fila
                              envuelve a 375px y sueltos acababan en líneas distintas,
                              con el icono huérfano al final de la primera. */}
                          <span className="lp-prod-fuente">
                            <span className="lp-sheet-fav lp-prod-favmini">
                              <FaviconImg domain="elmueble.com" cssSize={18} fallback={<span>EM</span>} />
                            </span>
                            <span className="dm">elmueble.com</span>
                          </span>
                        </div>
                      </div>
                      {/* Éste SÍ lleva acción, al revés que los demás botones de la
                          maqueta: gira un segundo y revela la solución (fundador,
                          2026-08-23). La isla lo pinta; sin JS no hay botón y la
                          solución de abajo se sirve ya visible. */}
                      <div className="lp-prod-mbtnfila">
                        <SolutionDemo target="#pg-recs" />
                      </div>
                    </div>

                    <div className="lp-prod-card lp-prod-msol">
                      <div className="lp-sheet-gen">
                        <Icon name="sparkles" size={15} />
                        <span className="lp-sheet-name">Solución generada</span>
                        <span className="lp-sheet-ready">Lista para publicar</span>
                      </div>
                      <div className="lp-prod-msolbody">
                        <div className="lp-prod-cap">Página citable · FAQ</div>
                        <h4>Guía de compra: qué tienda de muebles tiene mejor relación calidad-precio</h4>
                        {/* La orden de trabajo, no el índice de preguntas: el artefacto
                            generado son TRES piezas —el texto, el schema y dónde
                            publicarlo— y verlas desglosadas es lo que distingue «un
                            consejo» de «un encargo ya resuelto» (fundador, 2026-08-23:
                            «dame alternativas para poner una solución más potente»).
                            Los tres pasos son ilustrativos, como el resto de la
                            maqueta —igual que los «+15 pts» de Auditoría web arriba—,
                            no datos de un escaneo real. */}
                        <div className="lp-prod-pasos">
                          {[
                            { t: "El texto de la página", s: "2 preguntas · 340 palabras" },
                            { t: "El schema FAQPage", s: "JSON-LD para el <head>" },
                            { t: "Dónde publicarlo", s: "ikea.es/guia-de-compra" }
                          ].map((p, i) => (
                            <div className="lp-prod-paso" key={p.t}>
                              <span className="n">{i + 1}</span>
                              <span className="tt">
                                {p.t}
                                <span className="ss">{p.s}</span>
                              </span>
                              <span className="ok">Listo</span>
                            </div>
                          ))}
                        </div>
                        <div className="lp-prod-pasocierre">
                          <Icon name="check" size={13} />
                          <span>
                            <b>+12 pt potenciales.</b> El próximo escaneo mide si funcionó.
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="lp-prod-mpie">9 acciones priorizadas por impacto.</p>
                  </div>

                  <div className="lp-prod-pghead">
                    <span className="t">Recomendaciones</span>
                    <span className="m">9 acciones priorizadas por impacto</span>
                  </div>

                  <div className="lp-prod-recs">
                    <div className="lp-prod-card lp-prod-accion">
                      <div className="lp-prod-tags">
                        <span className="lp-prod-pill alto">Impacto alto</span>
                        <span className="lp-prod-pill cita">Victoria rápida</span>
                      </div>
                      <h3>Te mencionan pero no citan tu dominio en «mejores tiendas de muebles»</h3>

                      <div className="lp-prod-evid">
                        <div className="lp-prod-cap">La evidencia</div>
                        <p>
                          «…las opciones más recomendadas son <b>IKEA</b> y Maisons du Monde, según{" "}
                          <b>elmueble.com</b>…»
                        </p>
                        <div className="lp-prod-evidsrc">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/brand/engines/chatgpt.svg" alt="" width={14} height={14} />
                          <span className="m">ChatGPT · 6 respuestas · cita a</span>
                          <span className="lp-sheet-fav lp-prod-favmini">
                            <FaviconImg domain="elmueble.com" cssSize={18} fallback={<span>EM</span>} />
                          </span>
                          <span className="dm">elmueble.com</span>
                        </div>
                      </div>

                      <div className="lp-prod-medidas">
                        {[
                          { t: "Impacto", w: 86, tono: "azul", v: null },
                          { t: "Esfuerzo", w: 22, tono: "verde", v: null },
                          { t: "Confianza", w: 88, tono: "azul", v: "88%" }
                        ].map((m) => (
                          <div className="lp-prod-medida" key={m.t}>
                            <span className="t">{m.t}</span>
                            <span className="bar"><span className={`fill ${m.tono}`} style={{ width: `${m.w}%` }} /></span>
                            {m.v ? <span className="v">{m.v}</span> : null}
                          </div>
                        ))}
                      </div>

                      {/* El mismo botón que el móvil, contra el mismo estado. Aquí la
                          tarjeta de acción y la de solución van lado a lado, así que
                          antes del clic la columna derecha está vacía y el marco se ve
                          a medias: es lo que hace que la aparición signifique algo. */}
                      <div className="lp-prod-accionpie">
                        <SolutionDemo target="#pg-recs" />
                      </div>
                    </div>

                    <div className="lp-prod-card lp-prod-sol">
                      <div className="lp-sheet-gen">
                        <Icon name="sparkles" size={16} />
                        <span className="lp-sheet-name">Solución generada</span>
                        <span className="lp-sheet-ready">Lista para publicar</span>
                      </div>

                      <div className="lp-prod-solbody">
                        <div className="lp-prod-cap">Página citable · FAQ</div>
                        <h4>Guía de compra: qué tienda de muebles tiene mejor relación calidad-precio</h4>
                        <div className="lp-prod-preguntas">
                          {[
                            "¿Qué tienda tiene mejor calidad-precio?",
                            "¿Cuánto cuesta amueblar un salón?",
                            "¿Qué garantía tienen los muebles?"
                          ].map((q) => (
                            <div className="lp-prod-pregunta" key={q}>
                              <Icon name="check" size={14} />
                              <span>{q}</span>
                            </div>
                          ))}
                        </div>

                        <pre className="lp-sheet-code lp-prod-code">
                          <span className="tag">&lt;script type=&quot;application/ld+json&quot;&gt;</span>
                          {'\n{ "@type": "FAQPage",\n  "mainEntity": [{ "@type": "Question",\n    "name": "¿Qué tienda tiene mejor calidad-precio?" }]\n'}
                          <span className="tag">&lt;/script&gt;</span>
                        </pre>

                        {/* Son el dibujo de dos botones dentro de una maqueta, no
                            los botones del producto: no llevan `onClick` ni
                            enlace, y por eso van como `span` y no como `button`.
                            Un `<button>` sin acción es un control muerto, que es
                            justo lo que el piloto marca como fallo. */}
                        <div className="lp-prod-botones" aria-hidden="true">
                          <span className="lp-prod-btn primario">Copiar el schema</span>
                          <span className="lp-prod-btn">Descargar la página</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </ProductTabs>
          </div>
        </div>
      </section>

      {/* TESTIMONIO — HOME-2026-08 Fase C.
          Sustituye a un testimonio INVENTADO que llevaba meses en producción:
          «Aisha Robinson, Growth Lead, Beltway», con la cifra «del 9% al 21%
          de citas». Ni la persona ni el dato existían, y CLAUDE.md prohíbe las
          métricas falsas. Éste es real: el fundador confirmó el 2026-08-22 que
          el +128% es una medición de esa cuenta. Si algún día deja de poder
          sostenerse, la sección se retira entera; no se sustituye por otro
          nombre inventado. */}
      <section className="lp-section lp-testi">
        <div className="lp-inner">
          <div className="lp-kicker">Nuestros clientes</div>
          <h2 className="lp-h2">Cómo se gana una recomendación</h2>

          <div className="lp-testi-pair">
            <figure className="lp-testi-quote">
              <div className="lp-testi-brand">
                <span className="mark">n</span>
                <span className="name">nordika<span>&nbsp;Home</span></span>
              </div>
              <blockquote>
                <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
                  <path d="M0 18V9.5C0 4.3 3.2.8 8 0l1 2.6C6 3.6 4.4 5.4 4.3 7.9H8V18H0zm12 0V9.5C12 4.3 15.2.8 20 0l1 2.6c-3 1-4.6 2.8-4.7 5.3H20V18h-8z" fill="#7DA2F5" />
                </svg>
                <p>
                  No sabíamos si ChatGPT nos nombraba, y mucho menos por qué. En tres meses hemos
                  subido un <strong>128% nuestra cuota de voz en IA</strong>: lo que más ha cambiado no
                  es el dato, es que sabemos qué estrategia de contenidos adoptar.
                </p>
              </blockquote>
              <figcaption className="lp-testi-who">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/home/nerea.webp" alt="" width={52} height={52} />
                <span>
                  <span className="n">Nerea Solís</span>
                  <span className="r">Marketing digital en Nordika Home</span>
                </span>
              </figcaption>
            </figure>

            <div className="lp-testi-metric">
              <svg className="lp-testi-rayas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <pattern id="lp-testi-rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#93b0f2" strokeWidth="2.4" />
                  </pattern>
                </defs>
                <path d="M100 0 L100 100 L0 0 Z" fill="url(#lp-testi-rayas)" />
              </svg>
              <div className="lp-testi-num">+128%</div>
              <p className="lp-testi-cap">Aumento de cuota<br />de voz en IA</p>
              <div className="lp-testi-shot">
                <div className="dom">nordikahome.es</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/home/nordika-home.webp" alt="Portada de nordikahome.es" width={720} height={540} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — HOME-2026-08 Fase C. Abierta en escritorio, acordeón en móvil,
          como los dos artboards. El `FAQPage` sale de la MISMA constante que
          pinta la pantalla, así que no pueden divergir. */}
      <section className="lp-section lp-faq-sec" id="faq">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">Preguntas frecuentes</div>
            <h2 className="lp-h2">Lo que nos preguntan antes de empezar</h2>
          </div>
          <div className="lp-faq">
            {HOME_FAQ.map((f) => (
              <details className="lp-faq-item" key={f.q} open>
                <summary>
                  <span>{f.q}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <FaqAccordion selector=".lp-faq-item" />
        </div>
      </section>

      {/* CIERRE — HOME-2026-08 Fase C. El degradado sube hasta #EFF4FF y muere
          contra el pie: es el eco del hero, que baja del tinte al blanco.
          Conserva la rama de sesión iniciada de `HomeCtaBand`
          (GENSCORE-HEADER-3): a quien ya está dentro no se le ofrece el
          comprobador anónimo ni darse de alta, se le manda a su panel. */}
      <section className="lp-close">
        <div className="lp-inner">
          <HomeCtaBand />
        </div>
      </section>
      {/* TIRA DEL BLOG — HOME-2026-08, la sección que faltaba del artboard.

          **Los tres artículos NO están escritos a mano.** Salen de
          `BLOG_POSTS` por su cluster, el más reciente de cada uno, así que la
          tira envejece con el blog en vez de apuntar a lo que se decidió un
          martes. Es la misma regla que la FAQ y el `FAQPage`: una sola fuente,
          o divergen.

          **Y no llevan «7 min de lectura».** El artboard lo pone en las tres
          tarjetas, pero el producto no calcula tiempo de lectura en ninguna
          parte —no existe el campo, y el índice del blog enseña la fecha—, así
          que publicarlo sería inventarse una cifra en la página que más se
          lee. Va la fecha, que es la que el blog ya enseña. */}
      {BLOG_STRIP.length > 0 ? (
        <section className="lp-section lp-blog">
          <div className="lp-inner">
            <div className="lp-blog-head">
              <div>
                <div className="lp-kicker">Aprender</div>
                <h2 className="lp-blog-h2">Cómo se trabaja el posicionamiento GEO</h2>
              </div>
              <Link className="lp-blog-todo" href="/blog">
                Ver el blog
                <Icon name="arrRight" size={15} />
              </Link>
            </div>
            <div className="lp-blog-grid">
              {BLOG_STRIP.map((a) => (
                <Link className="lp-blog-card" key={a.slug} href={`/blog/${a.slug}`}>
                  <span className="lp-blog-cluster">{a.cluster}</span>
                  <span className="lp-blog-t">{a.title}</span>
                  <span className="lp-blog-fecha">{a.fecha}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      </main>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <div className="lp-logo">
              <BrandLogo size={19} />
            </div>
            <nav className="links" aria-label="Pie de página">
              <a href="#producto">Producto</a>
              <a href="#como">Cómo funciona</a>
              <a href="#recomendaciones">Recomendaciones</a>
              <Link href="/geo">Qué es GEO</Link>
              {MARKETING_CONTENT_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              {MARKETING_ENTITY_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/cookies">Cookies</Link>
              <Link href="/terminos">Términos</Link>
            </nav>
          </div>
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
