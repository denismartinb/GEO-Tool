/* auth.jsx — Login (card centrada) + Signup (split con testimonios) */
const { useState: useStateAu, useEffect: useEffectAu } = React;

function GoogleG() {
  return (
    <svg className="g-icon" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

function Legal() {
  return (
    <div className="auth-legal">
      Al continuar, aceptas nuestros <a>Términos</a> y la <a>Política de privacidad</a>.
    </div>
  );
}

function Login({ onLogin, onGoSignup, onHome }) {
  const [email, setEmail] = useStateAu("");
  return (
    <div className="auth-bg">
      <a className="auth-back" onClick={onHome}><Icon name="chevLeft" size={14} />Inicio</a>
      <div className="auth-card fade-in">
        <div className="auth-logo">
          <div className="brand-mark"><Icon name="resonance" size={17} sw={2} /></div>
          <div className="brand-name">Lumira</div>
        </div>
        <div className="auth-h1">Bienvenido de nuevo</div>
        <div className="auth-sub">Accede a tu panel y sigue mejorando tu visibilidad en IA.</div>

        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); onLogin(); }}>
          <div>
            <label className="field-label">Email de trabajo</label>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@empresa.com" />
          </div>
          <button type="submit" className="btn btn-primary auth-btn">Iniciar sesión</button>
        </form>

        <div className="auth-or" style={{ marginTop: 18 }}>o continúa con</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="auth-social" onClick={onLogin}><GoogleG />Continuar con Google</button>
          <button className="auth-social" onClick={onLogin}><Icon name="lock" size={16} style={{ color: "var(--ink-3)" }} />Continuar con SSO</button>
        </div>

        <div className="auth-alt">¿No tienes cuenta? <a onClick={onGoSignup}>Regístrate</a></div>
        <Legal />
      </div>
    </div>
  );
}

const TESTIMONIALS = [
  { q: "Dejamos de adivinar. Vemos exactamente en qué prompts ganan los competidores y qué páginas tocar primero.", n: "Laura Méndez", r: "Head of SEO, Nuve" },
  { q: "La visibilidad en buscadores de IA es la prioridad de nuestros clientes. Lumira convierte el análisis en un plan que podemos ejecutar.", n: "Carlos Ferrán", r: "Fundador, Norte Agency" },
  { q: "Pasamos de un 9% a un 21% de citas en dos meses siguiendo las recomendaciones priorizadas.", n: "Aisha Robinson", r: "Growth Lead, Beltway" },
];

function Signup({ onComplete, onGoLogin, onHome }) {
  const [i, setI] = useStateAu(0);
  const [form, setForm] = useStateAu({ first: "", last: "", email: "" });
  useEffectAu(() => {
    const t = setInterval(() => setI(x => (x + 1) % TESTIMONIALS.length), 4200);
    return () => clearInterval(t);
  }, []);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const t = TESTIMONIALS[i];

  return (
    <div className="signup">
      <div className="signup-left">
        <div className="signup-form-wrap fade-in">
          <a className="auth-back" style={{ position: "static", display: "inline-flex", marginBottom: 20, background: "var(--surface-2)" }} onClick={onHome}><Icon name="chevLeft" size={14} />Volver al inicio</a>
          <div className="auth-logo">
            <div className="brand-mark"><Icon name="resonance" size={17} sw={2} /></div>
            <div className="brand-name">Lumira</div>
          </div>
          <div className="auth-h1">Crea tu cuenta</div>
          <div className="auth-sub">Empieza tu prueba gratuita. Sin tarjeta de crédito.</div>

          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); onComplete(); }}>
            <div className="signup-names">
              <div>
                <label className="field-label">Nombre</label>
                <input className="field" value={form.first} onChange={set("first")} placeholder="Nombre" />
              </div>
              <div>
                <label className="field-label">Apellidos</label>
                <input className="field" value={form.last} onChange={set("last")} placeholder="Apellidos" />
              </div>
            </div>
            <div>
              <label className="field-label">Email de trabajo</label>
              <input className="field" type="email" value={form.email} onChange={set("email")} placeholder="nombre@empresa.com" />
            </div>
            <button type="submit" className="btn btn-primary auth-btn">Crear cuenta gratis</button>
          </form>

          <div className="auth-or" style={{ marginTop: 18 }}>o continúa con</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="auth-social" onClick={onComplete}><GoogleG />Registrarse con Google</button>
            <button className="auth-social" onClick={onComplete}><Icon name="lock" size={16} style={{ color: "var(--ink-3)" }} />Registrarse con SSO</button>
          </div>

          <div className="auth-alt">¿Ya tienes cuenta? <a onClick={onGoLogin}>Inicia sesión</a></div>
          <Legal />
        </div>
      </div>

      <div className="signup-aside">
        <div className="glow g1" /><div className="glow g2" />
        <div className="tcard" key={i}>
          <div className="mark">“</div>
          <p>{t.q}</p>
          <div className="who">
            <div className="av">{t.n.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>
            <div>
              <div className="nm">{t.n}</div>
              <div className="rl">{t.r}</div>
            </div>
          </div>
        </div>
        <div className="tdots">
          {TESTIMONIALS.map((_, k) => <span key={k} className={k === i ? "on" : ""} onClick={() => setI(k)} />)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Login, Signup });
