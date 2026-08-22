import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { DotMeter } from "@/components/ui/dot-meter";
import { PublicHeader } from "@/components/marketing/public-header";
import { ProductTour } from "@/components/product-tour";
import { RevealOnScroll } from "@/components/landing/reveal-on-scroll";
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
const HOW_STEPS: Array<{ n: string; t: string; d: string; sheet: ReactNode }> = [
  {
    n: "01",
    t: "Mides tu visibilidad",
    d: "Tus prompts se lanzan en los motores de IA. Cuántas veces te nombran y cuántas te citan como fuente: son dos problemas distintos con soluciones distintas.",
    sheet: (
      <div className="lp-sheet">
        {[
          { m: "IKEA", v: 24, tone: "own" },
          { m: "Leroy Merlin", v: 21, tone: "" },
          { m: "Maisons du Monde", v: 18, tone: "" }
        ].map((r) => (
          <div className="lp-sheet-row" key={r.m}>
            <span className="lp-sheet-name">{r.m}</span>
            <span className="lp-sheet-bar">
              <span className={`fill ${r.tone}`} style={{ width: `${(r.v / 24) * 100}%` }} />
            </span>
            <span className="lp-sheet-num">{r.v}%</span>
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
      <div className="lp-sheet">
        <div className="lp-sheet-src">
          <span className="lp-sheet-fav">EM</span>
          <span className="lp-sheet-name">elmueble.com</span>
          <span className="lp-sheet-meta">10 citas · cita a 3 rivales</span>
        </div>
        <div className="lp-sheet-flag">No te cita</div>
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
      <div className="lp-sheet">
        {[
          { t: "Datos estructurados", p: "+15 pts" },
          { t: "Intro respuesta-primero", p: "+5 pts" },
          { t: "llms.txt", p: "aviso" }
        ].map((f) => (
          <div className="lp-sheet-fix" key={f.t}>
            <span className="lp-sheet-name">{f.t}</span>
            <span className={`lp-sheet-pts ${f.p === "aviso" ? "warn" : ""}`}>{f.p}</span>
          </div>
        ))}
        <div className="lp-sheet-fix lp-sheet-fix--ok">
          <span className="lp-sheet-name">GPTBot con acceso permitido</span>
          <Icon name="shield" size={15} />
        </div>
      </div>
    )
  },
  {
    n: "04",
    t: "Mejoras tu presencia",
    d: "Cada acción trae su solución generada: las FAQ, el schema, la página que falta. El siguiente escaneo mide si funcionó.",
    sheet: (
      <div className="lp-sheet">
        <div className="lp-sheet-gen">
          <span className="lp-sheet-name">Solución generada</span>
          <span className="lp-sheet-ready">Lista para publicar</span>
        </div>
        <pre className="lp-sheet-code">{'<script type="application/ld+json">\n{ "@type": "FAQPage", … }\n</script>'}</pre>
        <div className="lp-sheet-delta">
          <span className="lp-sheet-before">antes 48</span>
          <span className="lp-sheet-after">71</span>
          <span className="lp-sheet-gain">+23 pts</span>
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
 * - `ProductTour` — el tour del hero, que es una animación.
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

        {/* ONBOARDING-TOUR-1: donde antes había una captura estática ahora va
            el tour, dentro del mismo `.browserframe` ya aprobado (log §1). El
            marco no cambia; lo que cambia es que el producto se mueve.
            Con `prefers-reduced-motion` el tour se queda quieto en su último
            fotograma —la Visión general con su gauge y su curva—, así que el
            hero estático que había antes ya no hace falta: esa captura la da
            el propio tour. */}
        <div className="lp-shot">
          <ProductTour variant="hero" ctaHref="/signup" />
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
              Quien pregunta a un modelo <strong>no recibe diez enlaces para elegir: recibe una
              recomendación</strong> con dos o tres marcas. <strong>O estás en esa frase, o no existes.</strong>
            </p>
          </div>

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
              <p className="lp-rules-foot">Compites por la <strong>posición</strong>. El usuario elige un enlace.</p>
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
              <p className="lp-rules-foot">Compites por la <strong>mención</strong>. La IA ya ha respondido por ti.</p>
            </article>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA — la única superficie oscura de la zona pública.
          Conserva `id="como"` porque el enlace del nav apunta ahí y el nav es
          fuente única de las ~57 páginas públicas: cambiarlo aquí las rompe
          todas.

          SIN REVELACIÓN POR SCROLL, y es una decisión. El artboard entra las
          cuatro tarjetas con `IntersectionObserver`. Montarlo pediría una isla
          de cliente en una página que PRELAUNCH-HARDENING-1 Fase V dejó
          server-rendered a propósito —el campo del hero es la única isla— y el
          precio sería hidratar seis secciones de markup que no cambian nunca,
          a cambio de un fundido. El contenido se pinta y se lee igual. */}
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

      {/* QUOTE */}
      <section className="lp-section">
        <div className="lp-inner">
          <div className="lp-quote">
            <Icon name="quote" size={30} className="text-[var(--accent)]" />
            <blockquote>
              &ldquo;Pasamos de no saber si la IA nos nombraba a tener un plan claro de qué cambiar primero.
              En dos meses subimos del 9% al 21% de citas.&rdquo;
            </blockquote>
            <div className="who">
              <div className="av">AR</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 750 }}>Aisha Robinson</div>
                <div style={{ fontSize: 13.5, color: "var(--ink-3)" }}>Growth Lead, Beltway</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA BAND */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-inner">
          <div className="lp-ctaband">
            <div className="onb-aurora" style={{ opacity: 0.25 }}><div className="blob blob-2" /><div className="blob blob-3" /></div>
            {/* GENSCORE-HEADER-3: a quien ya entró no se le ofrece darse de
                alta. Aquí el corte NO es el de la franja (de pago / no de
                pago): "Iniciar sesión" no le sirve a ningún logado, y
                "Prueba gratis" a un logado en Free tampoco —ya la tiene—, así
                que el corte es logado / anónimo. El titular y el subtítulo
                cambian con los botones: "obtén tu primer informe" le habla a
                quien no tiene ninguno. */}
            <HomeCtaBand />
          </div>
        </div>
      </section>
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
