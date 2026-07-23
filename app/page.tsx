"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { DotMeter } from "@/components/ui/dot-meter";
import { Gauge } from "@/components/ui/gauge";
import { Sparkline } from "@/components/ui/sparkline";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { useTypewriter } from "@/components/ui/use-typewriter";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";

/**
 * Illustrative sample data for the hero product shot below — mirrors the
 * real Overview screen's hero-v2 card and metrics-2col row 1:1 (same
 * components, same CSS classes: app/dashboard/projects/[projectId]/page.tsx)
 * so the marketing "screenshot" is the actual product UI, not a mockup.
 */
const SHOT_SCORE = 78;
const SHOT_SCORE_TREND = [52, 58, 61, 67, 71, 78];
const SHOT_COMPONENTS: Array<{ l: string; v: number; color: string; info?: string }> = [
  {
    l: "Presencia (mención)",
    v: 92,
    color: "var(--accent)",
    info: "Cuántas respuestas de la IA nombran tu marca. Puede venir de lo que el modelo ya sabe de ti por su entrenamiento — no implica que tenga tu web como fuente."
  },
  { l: "Prominencia (posición)", v: 68, color: "#7c3aed" },
  {
    l: "Cuota de voz",
    v: 54,
    color: "#0d9488",
    info: "Qué parte de las menciones en las respuestas de IA son tuyas, frente a los competidores que monitorizas."
  },
  {
    l: "Autoridad (citas)",
    v: 41,
    color: "#e54563",
    info: "Cuántas respuestas incluyen una cita verificada (grounding) a tu propio dominio."
  }
];
const SHOT_METRICS: Array<{
  key: string;
  label: string;
  value: string;
  unit: string;
  trend: number[];
  delta: number;
  invert?: boolean;
  color: string;
  hint: string;
  badge?: { label: string; tone: string };
  hideDelta?: boolean;
}> = [
  {
    key: "mention",
    label: "Tasa de mención",
    value: "92",
    unit: "%",
    trend: [78, 82, 85, 88, 90, 92],
    delta: 4,
    color: "var(--accent)",
    hint: "Prompts donde aparece tu marca."
  },
  {
    key: "citation-share",
    label: "Cuota de Citas",
    value: "34",
    unit: "%",
    trend: [],
    delta: 0,
    hideDelta: true,
    color: "#7c3aed",
    hint: "38 de 112 citas grounding resueltas apuntan a tu dominio.",
    badge: { label: "Alto", tone: "accent" }
  },
  {
    key: "gap",
    label: "Presión competitiva",
    value: "18",
    unit: "%",
    trend: [31, 27, 24, 22, 20, 18],
    delta: -4,
    invert: true,
    color: "#e54563",
    hint: "Prompts donde aparece un competidor pero tu marca no.",
    badge: { label: "Baja", tone: "pos" }
  },
  {
    key: "sentiment",
    label: "Sentimiento de marca",
    value: "Positivo",
    unit: "",
    trend: [],
    delta: 0,
    hideDelta: true,
    color: "#0d9488",
    hint: "82% positivo · sobre 46 respuestas con tu marca."
  }
];

const FEATURES: Array<{ icon: string; t: string; d: string }> = [
  { icon: "search", t: "¿Apareces en la IA?", d: "Mide en qué porcentaje de respuestas de IA te mencionan y te citan como fuente, prompt a prompt." },
  { icon: "competitors", t: "Frente a quién pierdes", d: "Detecta competidores directos y descubre dónde ganan visibilidad que tú no tienes." },
  { icon: "cite", t: "Qué URLs se citan", d: "Conoce las páginas que los motores de IA usan como fuente para responder en tu mercado." },
  { icon: "layers", t: "Multi-motor", d: "Gemini, Claude y ChatGPT hoy, con más motores de IA sumándose sin coste extra — una visión unificada de tu visibilidad." },
  { icon: "recs", t: "Acciones, no solo datos", d: "Cada insight se convierte en una acción priorizada por impacto, esfuerzo y confianza." },
  { icon: "sparkles", t: "Soluciones generadas", d: "Genera el FAQ, el schema o el contenido que falta con un clic, listo para publicar." }
];

const STEPS: Array<{ n: string; icon: string; t: string; d: string }> = [
  { n: "1", icon: "search", t: "Analiza", d: "Leemos el contenido real de tu dominio y lanzamos tus prompts clave en los principales motores de IA." },
  { n: "2", icon: "competitors", t: "Compara", d: "Medimos tu mención, cita y cuota de voz frente a tus competidores directos, prompt a prompt." },
  { n: "3", icon: "recs", t: "Implementa", d: "Recibes un plan priorizado y generas las soluciones de contenido y técnicas con un clic." }
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
 * Hero product shot — a real Visión general screen, not an illustration:
 * same components (Gauge, Sparkline, Delta, InfoTip) and same CSS classes
 * as app/dashboard/projects/[projectId]/page.tsx, populated with clearly
 * illustrative sample data.
 */
function ProductShot() {
  return (
    <div className="lp-shot-body">
      <div className="section-head" style={{ margin: "0 0 14px" }}>
        <div className="section-title">Visibilidad de un vistazo</div>
        <div className="section-desc">Señales reales · último escaneo 14 jul</div>
        <div className="right"><Badge tone="pos">Franja «competitivo»</Badge></div>
      </div>

      <div className="hero-v2">
        <div className="hv-gauge">
          <Gauge value={SHOT_SCORE} size={116} stroke={12} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-4)", marginBottom: 6 }}>
              Puntuación GEO
            </div>
            <Badge tone="pos">Franja «competitivo»</Badge>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <Sparkline data={SHOT_SCORE_TREND} w={100} h={26} color="var(--accent)" />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Delta value={7} suffix=" pt" />
                <span className="stat-hint">vs. escaneo anterior</span>
              </div>
            </div>
          </div>
        </div>

        <div className="hv-divider" />

        <div className="hv-compose">
          <div className="hv-block-label">Cómo se compone tu puntuación</div>
          {SHOT_COMPONENTS.map((row) => (
            <div className="compose-row" key={row.l}>
              <div className="compose-top">
                <span className="compose-l">
                  {row.l}
                  {row.info && <InfoTip text={row.info} />}
                </span>
                <span className="compose-v tnum">{row.v}%</span>
              </div>
              <div className="sov-bar" style={{ height: 7 }}>
                <div className="sov-fill" style={{ width: `${row.v}%`, background: row.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="metrics-2col" style={{ marginTop: 12 }}>
        {SHOT_METRICS.map((m) => (
          <div key={m.key} className="wide-stat">
            <div className="ws-left">
              <div className="stat-label">{m.label}</div>
              <div className="stat-value tnum">
                {m.value}<span className="unit">{m.unit}</span>
              </div>
              {m.badge && (
                <div style={{ marginTop: 4 }}>
                  <span className={`badge badge-${m.badge.tone}`} style={{ fontSize: 11 }}>{m.badge.label}</span>
                </div>
              )}
              {!m.hideDelta && (
                <div className="ws-delta">
                  <Delta value={m.delta} suffix=" pt" invert={m.invert} />
                  <span className="stat-hint">vs. escaneo anterior</span>
                </div>
              )}
              <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: m.badge || !m.hideDelta ? 6 : 2 }}>{m.hint}</p>
            </div>
            <div className="ws-spark">
              {m.trend.length >= 2 ? (
                <Sparkline data={m.trend} w={110} h={44} color={m.color} />
              ) : (
                <div style={{ width: 110, height: 44 }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const HERO_DOMAIN_SAMPLES = ["tudominio.com", "miempresa.io", "tienda.es", "startup.ai", "agencia.com"];

export default function HomePage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [isDomainFocused, setIsDomainFocused] = useState(false);
  const typedPlaceholder = useTypewriter(HERO_DOMAIN_SAMPLES, !isDomainFocused && domain === "");

  const goToSignup = () => router.push("/signup");
  const goToLogin = () => router.push("/login");

  const NAV_LINKS = [
    { href: "#producto", label: "Producto" },
    { href: "#como", label: "Cómo funciona" },
    { href: "#recomendaciones", label: "Recomendaciones" },
    { href: "/geo", label: "Qué es GEO" },
    { href: "/pricing", label: "Precios" },
    { href: "/blog", label: "Blog" }
  ];

  return (
    <div className="lp">
      {/* HERO — nav + promo strip integrated into the same gradient ground
          (v3 rebrand, founder-approved design session: "estilo Semrush"). */}
      <header className="lp-hero lp-hero--home" id="producto">
        <div className="lp-promo">7 días de Pro · Sin tarjeta</div>
        <nav className="lp-nav lp-nav--hero">
          <div className="lp-logo">
            <BrandLogo size={22} />
          </div>
          <div className="lp-nav-links">
            <a href="#producto">Producto</a>
            <a href="#como">Cómo funciona</a>
            <a href="#recomendaciones">Recomendaciones</a>
            <Link href="/geo">Qué es GEO</Link>
            <Link href="/pricing">Precios</Link>
            <Link href="/blog">Blog</Link>
          </div>
          <div className="lp-nav-right">
            <button className="lp-nav-btn" onClick={goToLogin}>Iniciar sesión</button>
            <button className="lp-nav-btn lp-nav-btn--primary" onClick={goToSignup}>Prueba gratis</button>
          </div>
          <MarketingMobileNav
            links={NAV_LINKS}
            twoLine
            fromRight
            ctas={
              <>
                <button type="button" className="lp-cta-soft" onClick={goToLogin}>Iniciar sesión</button>
                <button type="button" className="lp-cta" onClick={goToSignup}>Prueba gratis</button>
              </>
            }
          />
        </nav>

        <div className="lp-hero-content">
          <h1 className="lp-h1">
            Que la IA <span className="lp-h1-accent">hable de tu marca</span>
          </h1>
          <p className="lp-lead">
            Descubre si los motores de IA mencionan tu marca, frente a quién pierdes y exactamente
            qué cambiar primero. Análisis claro, acciones que puedes ejecutar.
          </p>
          <div className="lp-hero-form">
            <div className="lp-field">
              <Icon name="globe" size={18} className="lp-field-ico" />
              <input
                className="lp-field-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goToSignup()}
                onFocus={() => setIsDomainFocused(true)}
                onBlur={() => setIsDomainFocused(false)}
                placeholder={isDomainFocused || domain ? "Escribe tu sitio web" : ""}
                spellCheck={false}
              />
              {!isDomainFocused && !domain && (
                <span className="lp-field-ghost" aria-hidden="true">
                  {typedPlaceholder}
                  <span className="type-caret" />
                </span>
              )}
            </div>
            <div className="lp-hero-actions">
              <button className="lp-cta" onClick={goToSignup}>
                Analiza gratis <Icon name="arrRight" size={16} />
              </button>
              <a className="lp-cta-soft" href="#como">Ver cómo funciona</a>
            </div>
          </div>
        </div>

        {/* product shot */}
        <div className="lp-shot">
          <div className="browserframe">
            <div className="bf-bar">
              <span className="bf-dot" style={{ background: "#f06360" }} />
              <span className="bf-dot" style={{ background: "#f6be4f" }} />
              <span className="bf-dot" style={{ background: "#5ac15a" }} />
              <span className="bf-url"><Icon name="lock" size={11} className="mr-1.5" />genscore.es/dashboard</span>
            </div>
            <ProductShot />
          </div>
        </div>
      </header>

      {/* TRUST */}
      <div className="lp-trust">
        <div className="lp-inner">
          <div className="cap">Motores de IA que analizamos por ti</div>
          <div className="lp-logos">
            <span className="lg">Gemini</span><span className="lg">ChatGPT</span><span className="lg">Claude</span>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section className="lp-section alt" id="como">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">Cómo funciona</div>
            <h2 className="lp-h2">De cero a un plan de acción en tres pasos</h2>
            <p className="lp-sec-sub">Sin configuración compleja. Introduce tu dominio y deja que GenScore haga el análisis.</p>
          </div>
          <div className="lp-steps">
            {STEPS.map((s) => (
              <div className="lp-step" key={s.n}>
                <div className="num">{s.n}</div>
                <Icon name={s.icon} size={20} className="ico-tag" />
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
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
              <button className="btn btn-primary mt24" onClick={goToSignup}>
                Empieza gratis <Icon name="arrRight" size={15} />
              </button>
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
              <button className="btn btn-soft btn-sm mt12" style={{ width: "100%" }}>
                <Icon name="sparkles" size={13} />Generar solución
              </button>
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
            <div style={{ position: "relative", zIndex: 2 }}>
              <h2>Descubre tu visibilidad en IA hoy</h2>
              <p>Introduce tu dominio y obtén tu primer informe en minutos. Gratis.</p>
              <div className="row">
                <button className="btn btn-white btn-lg" onClick={goToSignup}>
                  Prueba gratis <Icon name="arrRight" size={16} />
                </button>
                <button className="btn btn-onaccent btn-lg" onClick={goToLogin}>Iniciar sesión</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <div className="lp-logo">
              <BrandLogo size={19} />
            </div>
            <div className="links">
              <a href="#producto">Producto</a>
              <a href="#como">Cómo funciona</a>
              <a href="#recomendaciones">Recomendaciones</a>
              <Link href="/geo">Qué es GEO</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/cookies">Cookies</Link>
              <Link href="/terminos">Términos</Link>
            </div>
          </div>
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
