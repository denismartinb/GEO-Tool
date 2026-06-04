/* competitor-setup.jsx — Paso 2 del alta: propuesta automática de competidores */
const { useState: useStateCs } = React;

const PROPOSED = [
  { name: "Orbit",    domain: "orbit.com",    color: "#0e9488", initial: "O" },
  { name: "Quanta",   domain: "quanta.ai",    color: "#d9772b", initial: "Q" },
  { name: "Beacon",   domain: "beacon.co",    color: "#9333a8", initial: "B" },
  { name: "Lumio",    domain: "lumio.io",     color: "#3b6fd6", initial: "L" },
  { name: "Metricly", domain: "metricly.com", color: "#0891b2", initial: "M" },
];
const COMP_COLORS = ["#6366f1", "#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#0891b2", "#15915a", "#c026d3"];

function brandFromDomain(domain) {
  const base = (domain || "tu-marca").replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function Stepper({ step }) {
  const steps = [{ n: 1, l: "Dominio" }, { n: 2, l: "Competidores" }, { n: 3, l: "Prompts" }];
  return (
    <div className="wiz-steps">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className={"wiz-step" + (step === s.n ? " on" : step > s.n ? " done" : "")}>
            <span className="ws-dot">{step > s.n ? <Icon name="check" size={12} sw={2.6} /> : s.n}</span>
            <span className="ws-l">{s.l}</span>
          </div>
          {i < steps.length - 1 && <span className="wiz-sep" />}
        </React.Fragment>
      ))}
    </div>
  );
}
window.Stepper = Stepper;

function CompetitorSetup({ domain, onBack, onContinue }) {
  const brandName = brandFromDomain(domain);
  const [comps, setComps] = useStateCs(() => PROPOSED.map((c, i) => ({ ...c, id: "c" + i })));
  const [nextId, setNextId] = useStateCs(PROPOSED.length);

  const update = (id, field, value) => setComps(cs => cs.map(c => c.id === id
    ? { ...c, [field]: value, ...(field === "name" ? { initial: (value[0] || "?").toUpperCase() } : {}) }
    : c));
  const remove = (id) => setComps(cs => cs.filter(c => c.id !== id));
  const add = () => {
    setComps(cs => [...cs, { id: "c" + nextId, name: "", domain: "", color: COMP_COLORS[cs.length % COMP_COLORS.length], initial: "?" }]);
    setNextId(n => n + 1);
  };

  // ranking preview = tu marca + competidores con nombre
  const ranking = [{ name: brandName, domain, you: true, color: "#6366f1", initial: brandName[0] || "T" },
    ...comps.filter(c => c.name.trim())];

  return (
    <div className="page add-domain fade-in">
      <a className="add-back" onClick={onBack}><Icon name="chevLeft" size={15} />Volver al dominio</a>

      <div className="cs-headwrap">
        <Stepper step={2} />
        <h1 className="add-h1" style={{ marginTop: 18 }}>Tus competidores</h1>
        <p className="add-sub" style={{ margin: "10px 0 0" }}>
          Analizamos <b style={{ color: "var(--ink-2)", fontFamily: "var(--mono)", fontWeight: 600 }}>{domain}</b> e identificamos tus
          principales competidores para monitorizar cómo te comparas en las respuestas de IA. Si algo no encaja, edítalo o elimínalo.
        </p>
      </div>

      <div className="cs-layout">
        {/* editor */}
        <div>
          <div className="cs-list-head">
            <span></span>
            <span>Marca</span>
            <span>Dominio</span>
            <span></span>
          </div>
          <div className="cs-list">
            {comps.map(c => (
              <div className="cs-row" key={c.id}>
                <span className="cs-fav" style={{ background: c.name.trim() ? c.color : "var(--surface-sunk)", color: c.name.trim() ? "#fff" : "var(--ink-4)" }}>{c.initial}</span>
                <input className="cs-input" value={c.name} onChange={e => update(c.id, "name", e.target.value)} placeholder="Nombre de la marca" spellCheck={false} />
                <input className="cs-input mono" value={c.domain} onChange={e => update(c.id, "domain", e.target.value)} placeholder="dominio.com" spellCheck={false} />
                <button className="cs-del" title="Eliminar competidor" onClick={() => remove(c.id)}><Icon name="x" size={15} /></button>
              </div>
            ))}
            {comps.length === 0 && (
              <div className="cs-empty">No hay competidores. Añade al menos uno para comparar tu visibilidad.</div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={add}><Icon name="plus" size={14} />Añadir competidor</button>
          <div className="cs-tip"><Icon name="info" size={13} />Monitorizaremos cada competidor en los mismos prompts y motores que tu marca.</div>
        </div>

        {/* ranking preview */}
        <div className="cs-rank card">
          <div className="card-head">
            <div className="card-title">Ranking de marcas</div>
            <span className="badge badge-neutral">Vista previa</span>
          </div>
          <div className="rank-head">
            <span className="c">#</span><span>Marca</span>
            <span className="c">Sentim.</span><span className="c">Menciones</span><span className="c">Cobert.</span>
          </div>
          <div className="rank-body">
            {ranking.map((r, i) => (
              <div className={"rank-row" + (r.you ? " you" : "")} key={i}>
                <span className="c rk-n">{i + 1}</span>
                <span className="rk-ent">
                  <span className="cs-fav sm" style={{ background: r.color }}>{r.initial}</span>
                  <span className="rk-nm">{r.name}{r.you && <span className="rk-you">Tú</span>}</span>
                </span>
                <span className="c"><i className="rk-ph" /></span>
                <span className="c"><i className="rk-ph" /></span>
                <span className="c"><i className="rk-ph" /></span>
              </div>
            ))}
          </div>
          <div className="cs-rank-foot"><Icon name="clock" size={13} />Las métricas se calcularán tras el primer escaneo.</div>
        </div>
      </div>

      <div className="cs-foot">
        <button className="btn btn-ghost btn-lg" onClick={onBack}><Icon name="chevLeft" size={16} />Atrás</button>
        <button className="btn btn-primary btn-lg" onClick={() => onContinue(comps.filter(c => c.name.trim()))}>
          Crear y escanear <Icon name="arrRight" size={16} />
        </button>
      </div>
    </div>
  );
}

window.CompetitorSetup = CompetitorSetup;
