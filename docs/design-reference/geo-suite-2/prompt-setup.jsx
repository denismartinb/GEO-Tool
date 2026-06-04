/* prompt-setup.jsx — Paso 3 del alta: propuesta automática del primer set de prompts */
const { useState: useStatePs } = React;

const PROPOSED_PROMPTS = [
  { t: "¿Cuál es la mejor herramienta de analítica de producto para SaaS B2B?", intent: "Comercial" },
  { t: "Mejores alternativas a las plataformas de analítica enterprise", intent: "Comercial" },
  { t: "Comparativa de plataformas de analítica de producto con IA", intent: "Comercial" },
  { t: "¿Qué herramienta de analítica es mejor para startups en fase temprana?", intent: "Comercial" },
  { t: "Analítica de producto con cumplimiento SOC 2 y HIPAA", intent: "Comercial" },
  { t: "¿Cuánto cuesta una plataforma de analítica de producto?", intent: "Transaccional" },
  { t: "Herramientas de analítica con integración nativa con el data warehouse", intent: "Comercial" },
  { t: "¿Cómo medir las métricas de crecimiento product-led?", intent: "Informacional" },
  { t: "Qué es el North Star Metric y cómo elegirlo", intent: "Informacional" },
  { t: "Mejores herramientas para analizar la retención por cohortes", intent: "Comercial" },
  { t: "¿Qué plataforma de analítica tiene mejor onboarding self-serve?", intent: "Comercial" },
  { t: "Cómo instrumentar eventos de producto correctamente", intent: "Informacional" },
  { t: "Alternativas asequibles a las suites de analítica caras", intent: "Comercial" },
  { t: "¿Qué herramienta de analítica usan las mejores empresas SaaS?", intent: "Comercial" },
  { t: "Plataformas de analítica con detección de anomalías por IA", intent: "Comercial" },
  { t: "Cómo elegir una herramienta de analítica de producto", intent: "Informacional" },
];

const INTENT_TONE = { Comercial: "accent", Informacional: "neutral", Transaccional: "warn" };

function PromptSetup({ domain, onBack, onFinish }) {
  const [prompts, setPrompts] = useStatePs(() => PROPOSED_PROMPTS.map((p, i) => ({ ...p, id: "p" + i, on: true })));
  const [nextId, setNextId] = useStatePs(PROPOSED_PROMPTS.length);
  const [draft, setDraft] = useStatePs("");

  const selected = prompts.filter(p => p.on).length;
  const REC = 15;

  const toggle = (id) => setPrompts(ps => ps.map(p => p.id === id ? { ...p, on: !p.on } : p));
  const remove = (id) => setPrompts(ps => ps.filter(p => p.id !== id));
  const allOn = prompts.length > 0 && prompts.every(p => p.on);
  const toggleAll = () => setPrompts(ps => ps.map(p => ({ ...p, on: !allOn })));
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    setPrompts(ps => [{ id: "p" + nextId, t: v, intent: "Personalizado", on: true }, ...ps]);
    setNextId(n => n + 1);
    setDraft("");
  };

  const pct = Math.min(100, Math.round((selected / REC) * 100));

  return (
    <div className="page add-domain cs-page fade-in">
      <a className="add-back" onClick={onBack}><Icon name="chevLeft" size={15} />Volver a competidores</a>

      <div className="cs-headwrap" style={{ textAlign: "center", margin: "0 auto 22px" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><Stepper step={3} /></div>
        <h1 className="add-h1" style={{ marginTop: 18, fontSize: 30 }}>Revisa y selecciona tus prompts</h1>
        <p className="add-sub" style={{ margin: "10px auto 0" }}>
          Estos son los prompts que hemos generado para <b style={{ color: "var(--ink-2)", fontFamily: "var(--mono)", fontWeight: 600 }}>{domain}</b>.
          Selecciona los que quieras monitorizar — recomendamos al menos <b style={{ color: "var(--ink-2)" }}>15</b> para obtener mejores datos.
        </p>
      </div>

      <div className="cs-layout">
        {/* lista */}
        <div>
          {/* añadir */}
          <div className="ps-add">
            <Icon name="plus" size={16} style={{ color: "var(--ink-4)" }} />
            <input className="ps-add-input" value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === "Enter" && add()} placeholder="Añade tu propio prompt…" spellCheck={false} />
            <button className="btn btn-soft btn-sm" onClick={add} disabled={!draft.trim()}>Añadir</button>
          </div>

          <div className="ps-listhead">
            <button className="ps-selall" onClick={toggleAll}>
              <span className={"ps-check" + (allOn ? " on" : "")}>{allOn && <Icon name="check" size={12} sw={3} />}</span>
              Seleccionar todo
            </button>
            <span className="ps-count"><b>{selected}</b>/{prompts.length} seleccionados</span>
          </div>

          <div className="ps-list">
            {prompts.map(p => (
              <div className={"ps-row" + (p.on ? " on" : "")} key={p.id} onClick={() => toggle(p.id)}>
                <span className={"ps-check" + (p.on ? " on" : "")}>{p.on && <Icon name="check" size={12} sw={3} />}</span>
                <span className="ps-text">{p.t}</span>
                <Badge tone={INTENT_TONE[p.intent] || "neutral"}>{p.intent}</Badge>
                <button className="ps-del" title="Eliminar prompt" onClick={(e) => { e.stopPropagation(); remove(p.id); }}><Icon name="x" size={14} /></button>
              </div>
            ))}
            {prompts.length === 0 && <div className="cs-empty">No hay prompts. Añade al menos uno para empezar.</div>}
          </div>
        </div>

        {/* resumen */}
        <div className="cs-rank card" style={{ position: "sticky", top: 8 }}>
          <div className="card-head"><div className="card-title">Resumen del set</div></div>
          <div className="card-pad">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="tnum" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.02em", color: "var(--accent)" }}>{selected}</span>
              <span style={{ fontSize: 14, color: "var(--ink-3)", fontWeight: 600 }}>prompts seleccionados</span>
            </div>
            <div className="ps-prog">
              <div className="ps-prog-track"><div className="ps-prog-fill" style={{ width: pct + "%", background: selected >= REC ? "var(--pos)" : "var(--accent)" }} /></div>
              <div className="ps-prog-l">
                {selected >= REC
                  ? <span style={{ color: "var(--pos-ink)", fontWeight: 650 }}><Icon name="check" size={12} sw={2.6} /> Listo — buen volumen para datos fiables</span>
                  : <span>Añade {REC - selected} más para alcanzar el mínimo recomendado ({REC})</span>}
              </div>
            </div>

            <div className="ps-sum-row"><Icon name="layers" size={15} /><span>Se consultarán en <b>4 motores</b> de IA</span></div>
            <div className="ps-sum-row"><Icon name="competitors" size={15} /><span>Comparados con tus <b>competidores</b></span></div>
            <div className="ps-sum-row"><Icon name="clock" size={15} /><span>Re-escaneo <b>semanal</b> automático</span></div>

            <div className="why" style={{ marginTop: 16 }}>
              <Icon name="help" size={16} />
              <div>
                <div className="why-t">¿Qué es un prompt?</div>
                <div className="why-b">Es una pregunta que tus clientes podrían hacer a una IA. Monitorizamos si tu marca aparece en la respuesta.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="cs-foot">
        <button className="btn btn-ghost btn-lg" onClick={onBack}><Icon name="chevLeft" size={16} />Atrás</button>
        <button className="btn btn-primary btn-lg" onClick={() => onFinish(prompts.filter(p => p.on))} disabled={selected === 0}>
          Empezar a monitorizar <Icon name="arrRight" size={16} />
        </button>
      </div>
    </div>
  );
}

window.PromptSetup = PromptSetup;
