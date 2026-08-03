import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { ProcessFlow } from "@/components/blog/process-flow";

export const metadata: Metadata = {
  title: "¿Qué es el GEO? Guía visual de Generative Engine Optimization — GenScore",
  description:
    "Qué es el GEO (Generative Engine Optimization), en qué se diferencia del SEO y cómo se mide la visibilidad de tu marca en respuestas de IA: GEO Score, tasa de mención, cuota de citas y más, explicados con ejemplos de GenScore.",
  alternates: { canonical: "https://www.genscore.es/geo" }
};

const NAV_LINKS = [
  { href: "/geo", label: "Qué es GEO" },
  { href: "/pricing", label: "Precios" },
  { href: "/blog", label: "Blog" }
];

/**
 * Illustrative example values for the GEO Score panel mock. Weights are the
 * real ones (docs/adr/0008 + ADR 0015 — same as components/blog/
 * geo-score-breakdown.tsx and the Overview composition block); values are
 * sample data and the headline score below is their exact weighted sum, so
 * the mock teaches the real arithmetic instead of showing made-up numbers
 * that don't add up.
 */
const SCORE_COMPONENTS = [
  { label: "Presencia (mención)", weight: 40, value: 80, color: "var(--accent)", d: "¿La IA nombra tu marca?" },
  { label: "Prominencia (posición)", weight: 25, value: 64, color: "#7c3aed", d: "¿Apareces al principio o de pasada?" },
  { label: "Cuota de voz", weight: 20, value: 55, color: "#0d9488", d: "De todas las menciones, ¿cuántas son tuyas?" },
  { label: "Autoridad (citas)", weight: 15, value: 40, color: "#e54563", d: "¿La IA cita tu web como fuente?" }
];
const EXAMPLE_SCORE = Math.round(
  SCORE_COMPONENTS.reduce((sum, c) => sum + (c.value * c.weight) / 100, 0)
);

const METRIC_CARDS = [
  {
    icon: "search",
    label: "Tasa de mención",
    value: "62%",
    bar: 62,
    color: "var(--accent)",
    concept: "Presencia",
    d: "De cada 100 respuestas de IA a tus prompts, ¿en cuántas aparece tu marca? Es la señal más básica del GEO: existir en la conversación."
  },
  {
    icon: "cite",
    label: "Cuota de citas",
    value: "18%",
    bar: 18,
    color: "#7c3aed",
    concept: "Autoridad",
    d: "Qué parte de las URLs que la IA usa como fuente pertenecen a tu dominio. A diferencia de la mención, esta señal sí depende del contenido que publicas."
  },
  {
    icon: "competitors",
    label: "Presión competitiva",
    value: "34%",
    bar: 34,
    color: "#e54563",
    concept: "Competencia",
    d: "Porcentaje de prompts donde aparece un competidor y tu marca no. Es el hueco exacto que te están quitando en las respuestas."
  },
  {
    icon: "trendUp",
    label: "Posición media de marca",
    value: "2,4",
    bar: null,
    color: "#0d9488",
    concept: "Prominencia",
    d: "En qué orden te menciona la IA respecto a tus competidores. No es lo mismo ser la primera recomendación que una alternativa al final."
  }
];

const FEATURE_MAP = [
  {
    icon: "prompts",
    concept: "Las preguntas reales de tus clientes",
    feature: "Prompts",
    d: "El GEO no se mide con una búsqueda aislada: se mide con el conjunto de preguntas que tu cliente haría a la IA. GenScore te sugiere y monitoriza ese conjunto."
  },
  {
    icon: "competitors",
    concept: "Frente a quién te compara la IA",
    feature: "Competidores",
    d: "La IA no responde con tu marca en el vacío: recomienda alternativas. Defines contra quién medirte y GenScore calcula cada métrica frente a ellos."
  },
  {
    icon: "runs",
    concept: "Medición repetida, no una foto",
    feature: "Escaneos",
    d: "Las respuestas de la IA cambian. Cada escaneo lanza tus prompts en los motores de IA y guarda las respuestas reales como evidencia, para ver la evolución."
  },
  {
    icon: "cite",
    concept: "Las fuentes que usa la IA",
    feature: "Páginas citadas",
    d: "Cuando la IA responde con búsqueda real, cita URLs. GenScore te muestra qué páginas — tuyas y de terceros — están alimentando las respuestas de tu mercado."
  },
  {
    icon: "search",
    concept: "¿Tu web es citable?",
    feature: "Auditoría web",
    d: "Para que la IA te cite, tu contenido tiene que ser rastreable, claro y estructurado. La auditoría revisa tu web con criterios de citabilidad, no solo de SEO."
  },
  {
    icon: "recs",
    concept: "Del diagnóstico a la acción",
    feature: "Recomendaciones",
    d: "Medir no basta. Cada hallazgo se convierte en una acción priorizada por impacto, esfuerzo y confianza, con la evidencia que la respalda — y la solución generada."
  }
];

function GaugeMock({ score }: { score: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  return (
    <div className="gauge-wrap" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-sunk)" strokeWidth="11" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="gauge-center" style={{ paddingTop: 0 }}>
        <div>
          <div className="gauge-num">{score}</div>
          <div className="gauge-cap">GEO Score</div>
        </div>
      </div>
    </div>
  );
}

export default function GeoExplainerPage() {
  return (
    <div className="lp">
      {/* NAV */}
      <div className="lp-nav-wrap">
        <nav className="lp-nav">
          <MarketingMobileNav links={[{ href: "/", label: "Inicio" }, ...NAV_LINKS]} />
          <Link href="/" className="lp-logo">
            <BrandLogo size={22} />
          </Link>
          <div className="lp-nav-links">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={l.href === "/geo" ? "active" : ""}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="lp-nav-right">
            <Link href="/login" className="btn btn-ghost btn-sm">Iniciar sesión</Link>
            <Link href="/signup" className="btn btn-primary btn-sm">Prueba gratis</Link>
          </div>
        </nav>
      </div>

      {/* HERO */}
      <header className="lp-hero gx-hero">
        <div className="onb-aurora">
          <div className="ring" /><div className="ring r2" />
          <div className="blob blob-1" /><div className="blob blob-2" />
          <div className="blob blob-3" /><div className="blob blob-4" />
        </div>
        <div className="lp-hero-content">
          <span className="lp-eyebrow"><Icon name="sparkles" size={14} />Guía visual</span>
          <h1 className="lp-h1">¿Qué es el <span className="grad">GEO</span>?</h1>
          <p className="lp-lead">
            GEO significa <strong>Generative Engine Optimization</strong>: conseguir que tu marca
            aparezca — y aparezca bien — cuando alguien pregunta a ChatGPT, Gemini o Claude.
            Aquí lo explicamos en cinco minutos, con los mismos indicadores que verás en GenScore.
          </p>
          <div className="gx-hero-actions">
            <Link href="/signup" className="btn btn-primary">
              Mide tu visibilidad gratis <Icon name="arrRight" size={15} />
            </Link>
            <Link href="/blog" className="btn btn-ghost">Leer el blog</Link>
          </div>
        </div>
      </header>

      {/* 1 · THE SHIFT */}
      <section className="lp-section alt">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">El cambio</div>
            <h2 className="lp-h2">La búsqueda ya no termina en diez enlaces azules</h2>
            <p className="lp-sec-sub">
              Cada vez más clientes preguntan directamente a una IA. Y la IA no devuelve una lista
              de páginas: elabora una respuesta y recomienda marcas por su nombre.
            </p>
          </div>
          <div className="gx-compare">
            <div className="gx-panel">
              <div className="gx-panel-tag">
                <Icon name="search" size={13} />Búsqueda tradicional · SEO
              </div>
              <div className="gx-serp-bar">
                <Icon name="search" size={14} />mejor crm para pymes
              </div>
              {[
                { t: "Los 10 mejores CRM para pymes en 2026", u: "blog-comparativas.com" },
                { t: "CRM para pequeñas empresas | Competidor A", u: "competidor-a.com" },
                { t: "Tu marca — CRM sencillo para equipos", u: "tumarca.com" }
              ].map((r) => (
                <div className="gx-serp-result" key={r.u}>
                  <div className="t">{r.t}</div>
                  <div className="u">{r.u}</div>
                </div>
              ))}
              <div className="gx-panel-foot">Compites por la <strong>posición</strong>. El usuario elige un enlace.</div>
            </div>
            <div className="gx-panel gx-panel-ai">
              <div className="gx-panel-tag gx-tag-ai">
                <Icon name="sparkles" size={13} />Respuesta generativa · GEO
              </div>
              <div className="gx-answer-q">¿Cuál es el mejor CRM para una pyme?</div>
              <div className="ev-quote gx-answer-body">
                Para una pyme, las opciones más recomendadas son <span className="mk">Competidor A</span>,
                por su ecosistema, y <span className="mk">Tu marca</span>, destacada por su sencillez y
                onboarding rápido. Si buscas precio, <span className="mk">Competidor B</span> es una
                alternativa habitual…
              </div>
              <div className="gx-answer-src">
                <Icon name="cite" size={12} />Fuentes: tumarca.com, blog-comparativas.com
              </div>
              <div className="gx-panel-foot">Compites por la <strong>mención</strong>. La IA ya ha respondido por ti.</div>
            </div>
          </div>
          <p className="gx-note">Ejemplo ilustrativo con marcas ficticias.</p>
        </div>
      </section>

      {/* 2 · SEO VS GEO */}
      <section className="lp-section">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">SEO vs GEO</div>
            <h2 className="lp-h2">No es el nuevo SEO: es otra pregunta</h2>
            <p className="lp-sec-sub">
              El SEO responde a &ldquo;¿en qué posición aparezco en Google?&rdquo;. El GEO responde a
              &ldquo;¿qué dice la IA de mi marca cuando alguien busca una solución como la mía?&rdquo;.
            </p>
          </div>
          <div className="gx-vs">
            <div className="gx-vs-row gx-vs-head">
              <div />
              <div><Icon name="search" size={14} />SEO</div>
              <div><Icon name="sparkles" size={14} />GEO</div>
            </div>
            {[
              { dim: "Dónde ocurre", seo: "Páginas de resultados de buscadores", geo: "Respuestas de ChatGPT, Gemini y Claude" },
              { dim: "Qué optimizas", seo: "El ranking de tus URLs", geo: "Cómo la IA menciona, compara y cita tu marca" },
              { dim: "Cómo se mide", seo: "Posiciones y tráfico", geo: "Mención, prominencia, cuota de voz y citas" },
              { dim: "Qué es ganar", seo: "El clic hacia tu web", geo: "Ser la recomendación dentro de la respuesta" }
            ].map((r) => (
              <div className="gx-vs-row" key={r.dim}>
                <div className="gx-vs-dim">{r.dim}</div>
                <div>{r.seo}</div>
                <div className="gx-vs-geo">{r.geo}</div>
              </div>
            ))}
          </div>
          <p className="gx-note">
            Un buen SEO sigue ayudando: la IA necesita fuentes fiables. Pero ya no basta — puedes ser
            primero en Google y no existir en la respuesta de la IA.
          </p>
        </div>
      </section>

      {/* 3 · HOW IT'S MEASURED — GEO SCORE */}
      <section className="lp-section alt">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">Cómo se mide</div>
            <h2 className="lp-h2">Del concepto al indicador: el GEO Score</h2>
            <p className="lp-sec-sub">
              La visibilidad en IA no es un sí o un no. GenScore la resume en una puntuación de 0 a 100
              que combina cuatro señales, cada una con su peso.
            </p>
          </div>
          <div className="gx-score-panel">
            <div className="gx-score-gauge">
              <GaugeMock score={EXAMPLE_SCORE} />
              <div className="gx-score-caption">Así lo verás en tu <strong>Visión general</strong></div>
            </div>
            <div className="gx-score-compose">
              {SCORE_COMPONENTS.map((c) => (
                <div className="gx-compose-row" key={c.label}>
                  <div className="gx-compose-top">
                    <span className="gx-compose-l">{c.label}<em>{c.d}</em></span>
                    <span className="gx-compose-v tnum">{c.value}%<small>peso {c.weight}%</small></span>
                  </div>
                  <div className="gx-bar"><div className="gx-bar-fill" style={{ width: `${c.value}%`, background: c.color }} /></div>
                </div>
              ))}
            </div>
          </div>
          <p className="gx-note">
            Datos de ejemplo: {SCORE_COMPONENTS.map((c) => `${c.value}×${c.weight}%`).join(" + ")} = {EXAMPLE_SCORE} puntos.
          </p>

          <div className="gx-metric-grid">
            {METRIC_CARDS.map((m) => (
              <div className="gx-metric" key={m.label}>
                <div className="gx-metric-head">
                  <div className="fic" style={{ width: 34, height: 34 }}><Icon name={m.icon} size={16} /></div>
                  <span className="gx-metric-concept">{m.concept}</span>
                </div>
                <div className="gx-metric-label">{m.label}</div>
                <div className="gx-metric-num tnum" style={{ color: m.color }}>{m.value}</div>
                {m.bar !== null && (
                  <div className="gx-bar"><div className="gx-bar-fill" style={{ width: `${m.bar}%`, background: m.color }} /></div>
                )}
                <p className="gx-metric-d">{m.d}</p>
              </div>
            ))}
          </div>
          <p className="gx-note">Valores de ejemplo. Todos estos indicadores viven en la pestaña Visión general de tu panel.</p>
        </div>
      </section>

      {/* 4 · CONCEPTS → FEATURES */}
      <section className="lp-section">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">De la teoría a la práctica</div>
            <h2 className="lp-h2">Cada concepto del GEO, una pieza de GenScore</h2>
            <p className="lp-sec-sub">
              No hace falta ser experto en GEO para hacer GEO. La herramienta convierte la metodología
              en pasos concretos dentro de tu panel.
            </p>
          </div>
          <div className="lp-features">
            {FEATURE_MAP.map((f) => (
              <div className="lp-feat" key={f.feature}>
                <div className="fic"><Icon name={f.icon} size={20} /></div>
                <h3>{f.concept}</h3>
                <p>{f.d}</p>
                <div className="gx-map-tag"><Icon name="arrRight" size={12} />En GenScore: <strong>{f.feature}</strong></div>
              </div>
            ))}
          </div>

          <div className="gx-flow">
            <div className="gx-flow-label">El ciclo completo, de la medición a la mejora</div>
            <ProcessFlow
              steps={[
                { icon: "runs", label: "Escaneo en motores de IA" },
                { icon: "quote", label: "Evidencia real" },
                { icon: "recs", label: "Recomendación priorizada" },
                { icon: "sparkles", label: "Solución generada" },
                { icon: "trendUp", label: "GEO Score sube" }
              ]}
            />
          </div>
        </div>
      </section>

      {/* CTA BAND */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-inner">
          <div className="lp-ctaband">
            <div className="onb-aurora" style={{ opacity: 0.25 }}><div className="blob blob-2" /><div className="blob blob-3" /></div>
            <div style={{ position: "relative", zIndex: 2 }}>
              <h2>Descubre cómo te ve la IA</h2>
              <p>Introduce tu dominio y obtén tu GEO Score real en minutos. Gratis, sin tarjeta.</p>
              <div className="row">
                <Link href="/signup" className="btn btn-white btn-lg">
                  Analiza tu dominio <Icon name="arrRight" size={16} />
                </Link>
                <Link href="/blog/que-es-geo-generative-engine-optimization" className="btn btn-onaccent btn-lg">
                  Profundiza en el blog
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <BrandLogo size={19} />
            </Link>
            <div className="links">
              <Link href="/#producto">Producto</Link>
              <Link href="/geo">Qué es GEO</Link>
              <Link href="/pricing">Precios</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Términos</Link>
            </div>
          </div>
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
