/* landing.jsx — Homepage indexable (propuesta de valor) */
const { useState: useStateL } = React;

function Landing({ onLogin, onSignup }) {
  const [domain, setDomain] = useStateL("");
  const go = () => onSignup(domain);

  const features = [
    { icon: "search", t: "¿Apareces en la IA?", d: "Mide en qué porcentaje de respuestas de IA te mencionan y te citan como fuente, prompt a prompt." },
    { icon: "competitors", t: "Frente a quién pierdes", d: "Detecta competidores directos y descubre dónde ganan visibilidad que tú no tienes." },
    { icon: "cite", t: "Qué URLs se citan", d: "Conoce las páginas que los motores de IA usan como fuente para responder en tu mercado." },
    { icon: "layers", t: "Multi-motor", d: "ChatGPT, Google AI Overviews, Perplexity y Claude — una visión unificada de tu visibilidad." },
    { icon: "recs", t: "Acciones, no solo datos", d: "Cada insight se convierte en una acción priorizada por impacto, esfuerzo y confianza." },
    { icon: "sparkles", t: "Soluciones generadas", d: "Genera el FAQ, el schema o el contenido que falta con un clic, listo para publicar." },
  ];

  const EngineNote = () => (
    <div className="lp-hero-note">
      <span><Icon name="check" size={14} sw={2.4} style={{ color: "var(--pos)" }} />Sin tarjeta</span>
      <span><Icon name="check" size={14} sw={2.4} style={{ color: "var(--pos)" }} />Primer escaneo en minutos</span>
      <span><Icon name="check" size={14} sw={2.4} style={{ color: "var(--pos)" }} />4 motores de IA</span>
    </div>
  );

  return (
    <div className="lp">
      {/* NAV */}
      <div className="lp-nav-wrap">
        <nav className="lp-nav">
          <div className="lp-logo">
            <div className="brand-mark"><Icon name="resonance" size={17} sw={2} /></div>
            <div className="brand-name">Lumira</div>
          </div>
          <div className="lp-nav-links">
            <a href="#producto">Producto</a>
            <a href="#como">Cómo funciona</a>
            <a href="#recomendaciones">Recomendaciones</a>
          </div>
          <div className="lp-nav-right">
            <button className="btn btn-ghost btn-sm" onClick={onLogin}>Iniciar sesión</button>
            <button className="btn btn-primary btn-sm" onClick={() => onSignup("")}>Prueba gratis</button>
          </div>
        </nav>
      </div>

      {/* HERO */}
      <header className="lp-hero" id="producto">
        <div className="onb-aurora">
          <div className="ring" /><div className="ring r2" />
          <div className="blob blob-1" /><div className="blob blob-2" />
          <div className="blob blob-3" /><div className="blob blob-4" />
        </div>
        <div className="lp-hero-content">
          <span className="lp-eyebrow"><Icon name="sparkles" size={14} />Generative Engine Optimization</span>
          <h1 className="lp-h1">De la visibilidad en IA<br /><span className="grad">a la implementación</span></h1>
          <p className="lp-lead">
            Descubre si los motores de IA mencionan tu marca, frente a quién pierdes y exactamente
            qué cambiar primero. Análisis claro, acciones que puedes ejecutar.
          </p>
          <div className="lp-hero-form">
            <div className="domain-bar">
              <Icon name="globe" size={18} className="domain-globe" />
              <input className="domain-input" value={domain} onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && go()} placeholder="introduce tu dominio" spellCheck={false} />
              <button className="btn btn-primary onb-cta" onClick={go}>Analiza gratis <Icon name="arrRight" size={16} /></button>
            </div>
            <EngineNote />
          </div>
        </div>

        {/* product shot */}
        <div className="lp-shot">
          <div className="browserframe">
            <div className="bf-bar">
              <span className="bf-dot" style={{ background: "#f06360" }} />
              <span className="bf-dot" style={{ background: "#f6be4f" }} />
              <span className="bf-dot" style={{ background: "#5ac15a" }} />
              <span className="bf-url"><Icon name="lock" size={11} style={{ marginRight: 6 }} />app.lumira.ai/overview</span>
            </div>
            <img src={(window.__resources && window.__resources.heroDash) || "assets/hero-dashboard.png?v=4"} alt="Panel de Lumira"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'grid'; }} />
            <div className="lp-shot-ph" style={{ display: "none" }}>[ vista del panel ]</div>
          </div>
        </div>
      </header>

      {/* TRUST */}
      <div className="lp-trust">
        <div className="lp-inner">
          <div className="cap">Equipos de marketing y agencias que confían en Lumira</div>
          <div className="lp-logos">
            <span className="lg">Northwind</span><span className="lg">Quantix</span><span className="lg">Beltway</span>
            <span className="lg">Nuve</span><span className="lg">Aurora&nbsp;Labs</span>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section className="lp-section alt" id="como">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-kicker">Cómo funciona</div>
            <h2 className="lp-h2">De cero a un plan de acción en tres pasos</h2>
            <p className="lp-sec-sub">Sin configuración compleja. Introduce tu dominio y deja que Lumira haga el análisis.</p>
          </div>
          <div className="lp-steps">
            {[
              { n: "1", icon: "search", t: "Analiza", d: "Leemos el contenido real de tu dominio y lanzamos tus prompts clave en los principales motores de IA." },
              { n: "2", icon: "competitors", t: "Compara", d: "Medimos tu mención, cita y cuota de voz frente a tus competidores directos, prompt a prompt." },
              { n: "3", icon: "recs", t: "Implementa", d: "Recibes un plan priorizado y generas las soluciones de contenido y técnicas con un clic." },
            ].map(s => (
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
            {features.map(f => (
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
                {[
                  { t: "Priorizado por impacto", d: "Ordenamos las acciones por su efecto real en tu visibilidad en IA." },
                  { t: "Basado en evidencia", d: "Cada recomendación incluye la respuesta de IA y la fuente que la respalda." },
                  { t: "Genera la solución", d: "FAQ, schema, contenido o reglas técnicas listas para publicar." },
                ].map(x => (
                  <div className="lp-spot-item" key={x.t}>
                    <span className="chk"><Icon name="check" size={13} sw={2.6} /></span>
                    <div><div className="t">{x.t}</div><div className="d">{x.d}</div></div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary mt24" onClick={() => onSignup("")}>Empieza gratis <Icon name="arrRight" size={15} /></button>
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
              <div className="evidence" style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <Badge tone="neutral" icon="quote">ChatGPT</Badge>
                </div>
                <div className="ev-quote">…las opciones más recomendadas son <span className="mk">Orbit</span> y <span className="mk">Quanta</span>, con onboarding sólido…</div>
              </div>
              <button className="btn btn-soft btn-sm mt12" style={{ width: "100%" }}><Icon name="sparkles" size={13} />Generar solución</button>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTE */}
      <section className="lp-section">
        <div className="lp-inner">
          <div className="lp-quote">
            <Icon name="quote" size={30} style={{ color: "var(--accent)" }} />
            <blockquote>“Pasamos de no saber si la IA nos nombraba a tener un plan claro de qué cambiar primero. En dos meses subimos del 9% al 21% de citas.”</blockquote>
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
            <div className="onb-aurora" style={{ opacity: .25 }}><div className="blob blob-2" /><div className="blob blob-3" /></div>
            <div style={{ position: "relative", zIndex: 2 }}>
              <h2>Descubre tu visibilidad en IA hoy</h2>
              <p>Introduce tu dominio y obtén tu primer informe en minutos. Gratis.</p>
              <div className="row">
                <button className="btn btn-white btn-lg" onClick={() => onSignup("")}>Prueba gratis <Icon name="arrRight" size={16} /></button>
                <button className="btn btn-onaccent btn-lg" onClick={onLogin}>Iniciar sesión</button>
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
              <div className="brand-mark"><Icon name="resonance" size={16} sw={2} /></div>
              <div className="brand-name">Lumira</div>
            </div>
            <div className="links">
              <a>Producto</a><a>Cómo funciona</a><a>Recomendaciones</a><a>Privacidad</a><a>Términos</a>
            </div>
          </div>
          <div className="copy">© 2026 Lumira · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}

window.Landing = Landing;
