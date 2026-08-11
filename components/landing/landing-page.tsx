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
import { PublicHeader } from "@/components/marketing/public-header";
import { ProductTour } from "@/components/product-tour";
import { MARKETING_CONTENT_LINKS } from "@/components/marketing-content-links";

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

const HERO_DOMAIN_SAMPLES = ["tudominio.com", "miempresa.io", "tienda.es", "startup.ai", "agencia.com"];

export function LandingPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [isDomainFocused, setIsDomainFocused] = useState(false);
  const typedPlaceholder = useTypewriter(HERO_DOMAIN_SAMPLES, !isDomainFocused && domain === "");

  const goToSignup = () => router.push("/signup");
  const goToLogin = () => router.push("/login");

  return (
    <div className="lp">
      {/* HERO — nav + promo strip integrated into the same gradient ground
          (v3 rebrand, founder-approved design session: "estilo Semrush"). */}
      <header className="lp-hero lp-hero--home" id="producto">
        <div className="lp-promo">7 días de Pro · Sin tarjeta</div>
        <PublicHeader hero />

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
              {MARKETING_CONTENT_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
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
