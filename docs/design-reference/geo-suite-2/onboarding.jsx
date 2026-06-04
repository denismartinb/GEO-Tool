/* onboarding.jsx — pantalla de inicio sin proyecto */
const { useState: useStateO, useEffect: useEffectO, useRef: useRefO } = React;

const TYPE_SAMPLES = ["tudominio.com", "miempresa.io", "tienda.es", "startup.ai", "agencia.com"];
const COUNTRIES = [
  { code: "us", name: "Estados Unidos" },
  { code: "es", name: "España" },
  { code: "mx", name: "México" },
  { code: "uk", name: "Reino Unido" },
  { code: "de", name: "Alemania" },
  { code: "fr", name: "Francia" },
];
const ENGINES = [
  { name: "ChatGPT", color: "#10a37f" },
  { name: "Google AI Overviews", color: "#4285f4" },
  { name: "Perplexity", color: "#20b8cd" },
  { name: "Claude", color: "#d97757" },
];

// pequeño typewriter para el placeholder
function useTypewriter(words, active) {
  const [txt, setTxt] = useStateO("");
  const st = useRefO({ w: 0, c: 0, del: false });
  useEffectO(() => {
    if (!active) return;
    let timer;
    const tick = () => {
      const s = st.current;
      const word = words[s.w % words.length];
      if (!s.del) {
        s.c++;
        setTxt(word.slice(0, s.c));
        if (s.c >= word.length) { s.del = true; timer = setTimeout(tick, 1400); return; }
        timer = setTimeout(tick, 95);
      } else {
        s.c--;
        setTxt(word.slice(0, s.c));
        if (s.c <= 0) { s.del = false; s.w++; timer = setTimeout(tick, 280); return; }
        timer = setTimeout(tick, 45);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [active]);
  return txt;
}

function Onboarding({ onStart, initialDomain = "" }) {
  const [domain, setDomain] = useStateO(initialDomain);
  const [country, setCountry] = useStateO(COUNTRIES[0]);
  const [err, setErr] = useStateO(false);
  const focused = useRefO(false);
  const [isFocused, setIsFocused] = useStateO(false);
  const typed = useTypewriter(TYPE_SAMPLES, !isFocused && domain === "");

  const clean = (d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const valid = (d) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(clean(d));

  const submit = () => {
    const d = clean(domain);
    if (!valid(d)) { setErr(true); return; }
    onStart(d, country);
  };

  return (
    <div className="onb">
      <div className="onb-aurora">
        <div className="ring" /><div className="ring r2" />
        <div className="blob blob-1" /><div className="blob blob-2" />
        <div className="blob blob-3" /><div className="blob blob-4" />
      </div>

      <div className="onb-top">
        <div className="row gap8">
          <div className="brand-mark"><Icon name="resonance" size={17} sw={2} /></div>
          <div className="brand-name">Lumira</div>
        </div>
        <div className="onb-top-right">
          <button className="btn btn-ghost btn-sm" style={{ background: "rgba(255,255,255,.6)" }}><Icon name="help" size={14} />¿Qué es el GEO?</button>
          <div className="avatar">DM</div>
        </div>
      </div>

      <div className="onb-body">
        <div className="onb-center">
          <span className="onb-eyebrow"><Icon name="sparkles" size={14} />Visibilidad en motores de IA</span>

          <h1 className="onb-h1">
            De la visibilidad en IA<br />
            <span className="grad">a la implementación</span>
          </h1>

          <p className="onb-sub">
            Descubre si los motores de IA mencionan tu marca, frente a quién pierdes
            y exactamente qué cambiar primero — todo en un solo lugar.
          </p>

          <div className="onb-form">
            <div className="domain-bar">
              <Icon name="globe" size={18} className="domain-globe" />
              <input
                className="domain-input"
                value={domain}
                onChange={(e) => { setDomain(e.target.value); setErr(false); }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={isFocused || domain ? "Introduce tu dominio" : ""}
                aria-label="Dominio"
                spellCheck={false}
              />
              {!isFocused && domain === "" && (
                <span style={{ position: "absolute", left: 44, color: "var(--ink-4)", fontSize: 15.5, fontWeight: 450, pointerEvents: "none" }}>
                  {typed}<span className="type-caret" />
                </span>
              )}
              <div className="country-sel" title="País de análisis">
                <Flag code={country.code} />
                <span style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{country.name}</span>
                <Icon name="chevDown" size={14} style={{ color: "var(--ink-4)" }} />
                <select value={country.code} onChange={(e) => setCountry(COUNTRIES.find(c => c.code === e.target.value))}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary onb-cta" onClick={submit}>
                Comenzar <Icon name="arrRight" size={16} />
              </button>
            </div>
            {err && <div className="field-err"><Icon name="alertCircle" size={14} />Introduce un dominio válido, p. ej. miempresa.com</div>}
          </div>

          <div className="onb-example">
            <span className="lbl">¿Sin dominio a mano?</span>
            <span className="dm">vela.io</span>
            <a onClick={() => onStart("vela.io", { code: "us", name: "Estados Unidos" })}>
              Ver ejemplo <Icon name="arrRight" size={13} />
            </a>
          </div>

          <div className="onb-engines">
            <span className="cap">Analizamos</span>
            {ENGINES.map(e => (
              <span className="eng-chip" key={e.name}>
                <span className="eng-dot" style={{ background: e.color }} />{e.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// banderitas mini (simples rectángulos representativos)
function Flag({ code }) {
  const F = {
    us: <svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#fff"/>{[0,2,4,6,8,10,12].map(y=><rect key={y} y={y} width="19" height="1" fill="#b22234"/>)}<rect width="9" height="7" fill="#3c3b6e"/></svg>,
    es: <svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#c60b1e"/><rect y="3.25" width="19" height="6.5" fill="#ffc400"/></svg>,
    mx: <svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#fff"/><rect width="6.33" height="13" fill="#006847"/><rect x="12.67" width="6.33" height="13" fill="#ce1126"/></svg>,
    uk: <svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#012169"/><path d="M0 0l19 13M19 0L0 13" stroke="#fff" strokeWidth="2"/><path d="M9.5 0v13M0 6.5h19" stroke="#fff" strokeWidth="3"/><path d="M9.5 0v13M0 6.5h19" stroke="#c8102e" strokeWidth="1.6"/></svg>,
    de: <svg viewBox="0 0 19 13"><rect width="19" height="4.33" fill="#000"/><rect y="4.33" width="19" height="4.33" fill="#dd0000"/><rect y="8.66" width="19" height="4.34" fill="#ffce00"/></svg>,
    fr: <svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#fff"/><rect width="6.33" height="13" fill="#0055a4"/><rect x="12.67" width="6.33" height="13" fill="#ef4135"/></svg>,
  };
  return <span className="meta-flag" style={{ width: 18, height: 12 }}>{F[code] || F.us}</span>;
}

Object.assign(window, { Onboarding });

/* ---------- Añadir dominio (dentro del shell, con sidebar) ---------- */
function AddDomain({ onSubmit, onCancel }) {
  const [domain, setDomain] = useStateO("");
  const [country, setCountry] = useStateO(COUNTRIES[0]);
  const [err, setErr] = useStateO(false);
  const [isFocused, setIsFocused] = useStateO(false);
  const typed = useTypewriter(TYPE_SAMPLES, !isFocused && domain === "");

  const clean = (d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const valid = (d) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(clean(d));
  const submit = () => {
    const d = clean(domain);
    if (!valid(d)) { setErr(true); return; }
    onSubmit(d, country);
  };

  const STEPS = [
    { icon: "search", t: "Analizamos", d: "Leemos tu dominio y lanzamos tus prompts en 4 motores de IA." },
    { icon: "competitors", t: "Comparamos", d: "Medimos tu visibilidad frente a tus competidores." },
    { icon: "recs", t: "Recomendamos", d: "Recibes un plan de acciones priorizadas por impacto." },
  ];

  return (
    <div className="page add-domain fade-in">
      <a className="add-back" onClick={onCancel}><Icon name="chevLeft" size={15} />Volver a Escaneos</a>

      <div className="add-wrap">
        <div className="add-hero">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <div className="wiz-steps">
              <div className="wiz-step on"><span className="ws-dot">1</span><span className="ws-l">Dominio</span></div>
              <span className="wiz-sep" />
              <div className="wiz-step"><span className="ws-dot">2</span><span className="ws-l">Competidores</span></div>
              <span className="wiz-sep" />
              <div className="wiz-step"><span className="ws-dot">3</span><span className="ws-l">Prompts</span></div>
            </div>
          </div>
          <span className="onb-eyebrow"><Icon name="plus" size={14} />Nuevo dominio</span>
          <h1 className="add-h1">Añade un dominio para <span className="grad">monitorizar</span></h1>
          <p className="add-sub">Introduce el dominio y el país de análisis. Lanzaremos un primer escaneo de visibilidad en los principales motores de IA.</p>
        </div>

        <div className="add-card">
          <div className="add-aurora"><div className="blob blob-1" /><div className="blob blob-3" /></div>
          <div className="add-card-inner">
            <label className="field-label">Dominio del proyecto</label>
            <div className="domain-bar">
              <Icon name="globe" size={18} className="domain-globe" />
              <input
                className="domain-input"
                value={domain}
                onChange={(e) => { setDomain(e.target.value); setErr(false); }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={isFocused || domain ? "introduce tu dominio" : ""}
                aria-label="Dominio"
                spellCheck={false}
              />
              {!isFocused && domain === "" && (
                <span className="db-ghost">{typed}<span className="type-caret" /></span>
              )}
              <div className="country-sel" title="País de análisis">
                <Flag code={country.code} />
                <span style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{country.name}</span>
                <Icon name="chevDown" size={14} style={{ color: "var(--ink-4)" }} />
                <select value={country.code} onChange={(e) => setCountry(COUNTRIES.find(c => c.code === e.target.value))}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary onb-cta" onClick={submit}>
                Continuar <Icon name="arrRight" size={16} />
              </button>
            </div>
            {err
              ? <div className="field-err" style={{ justifyContent: "flex-start" }}><Icon name="alertCircle" size={14} />Introduce un dominio válido, p. ej. miempresa.com</div>
              : <div className="add-hint"><Icon name="info" size={13} />El idioma se detecta automáticamente del dominio. Podrás añadir competidores y prompts después.</div>}

            <div className="add-engines">
              <span className="cap">Motores incluidos</span>
              {ENGINES.map(e => (
                <span className="eng-chip" key={e.name}><span className="eng-dot" style={{ background: e.color }} />{e.name}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="add-steps">
          {STEPS.map((s, i) => (
            <div className="add-step" key={s.t}>
              <div className="as-ico"><Icon name={s.icon} size={17} /></div>
              <div>
                <div className="as-t">{i + 1}. {s.t}</div>
                <div className="as-d">{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AddDomain });
