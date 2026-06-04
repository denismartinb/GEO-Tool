/* runs.jsx — Escaneos: gestión de dominios + historial de escaneos */
const { useState: useStateRn, useEffect: useEffectRn, useRef: useRefRn } = React;

function EngMark({ id, size = 20 }) {
  const e = window.PROMPT_DATA.ENGINE_META[id];
  return <span className="engine-mark" style={{ width: size, height: size, background: e.color, fontSize: 10 }}>{e.short}</span>;
}

function Flag2({ cc }) {
  const F = {
    us: <svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#fff"/>{[0,2,4,6,8,10,12].map(y=><rect key={y} y={y} width="19" height="1" fill="#b22234"/>)}<rect width="9" height="7" fill="#3c3b6e"/></svg>,
    es: <svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#c60b1e"/><rect y="3.25" width="19" height="6.5" fill="#ffc400"/></svg>,
    uk: <svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#012169"/><path d="M0 0l19 13M19 0L0 13" stroke="#fff" strokeWidth="2"/><path d="M9.5 0v13M0 6.5h19" stroke="#fff" strokeWidth="3"/><path d="M9.5 0v13M0 6.5h19" stroke="#c8102e" strokeWidth="1.6"/></svg>,
    de: <svg viewBox="0 0 19 13"><rect width="19" height="4.33" fill="#000"/><rect y="4.33" width="19" height="4.33" fill="#dd0000"/><rect y="8.66" width="19" height="4.34" fill="#ffce00"/></svg>,
  };
  return <span className="meta-flag" style={{ width: 17, height: 12 }}>{F[cc] || F.us}</span>;
}

const STATUS_META = {
  active:   { cls: "st-active", label: "Activo" },
  error:    { cls: "st-error", label: "Con errores" },
  scanning: { cls: "st-scanning", label: "Escaneando" },
  paused:   { cls: "st-paused", label: "Pausado" },
};
function DomStatus({ status }) {
  const m = STATUS_META[status] || STATUS_META.active;
  return <span className={"st-chip " + m.cls}><span className="d" />{m.label}</span>;
}

const RUN_STATUS = {
  done:    { tone: "pos", label: "Completado" },
  errors:  { tone: "warn", label: "Con errores" },
  failed:  { tone: "neg", label: "Fallido" },
  running: { tone: "accent", label: "En curso" },
};

/* ---------- Domain card ---------- */
function DomainCard({ d, selected, onSelect, onView, onScan, onTogglePause, onDelete }) {
  const [menu, setMenu] = useStateRn(false);
  const ref = useRefRn(null);
  useEffectRn(() => {
    if (!menu) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);

  return (
    <div className={"dom-card" + (selected ? " sel" : "")} onClick={() => onSelect(d.id)} ref={ref}>
      <div className="dom-top">
        <span className="dom-fav" style={{ background: d.color }}>{d.name[0]}</span>
        <div className="dom-id">
          <div className="dom-name">{d.name}{d.you && <span style={{ fontSize: 10.5, color: "var(--accent)", fontWeight: 700 }}>Principal</span>}</div>
          <div className="dom-domain">{d.domain}</div>
        </div>
        <DomStatus status={d.status} />
        <button className="kebab" onClick={(e) => { e.stopPropagation(); setMenu(m => !m); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
        </button>
        {menu && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setMenu(false); onView(d); }}><Icon name="overview" size={15} />Ver panel</button>
            <button onClick={() => { setMenu(false); onScan(d); }}><Icon name="play" size={15} />Repetir escaneo</button>
            <button onClick={() => { setMenu(false); onTogglePause(d); }}>
              <Icon name={d.status === "paused" ? "play" : "clock"} size={15} />{d.status === "paused" ? "Reanudar monitorización" : "Pausar monitorización"}
            </button>
            <div className="sep" />
            <button className="danger" onClick={() => { setMenu(false); onDelete(d); }}><Icon name="x" size={15} />Eliminar dominio</button>
          </div>
        )}
      </div>
      <div className="dom-meta">
        <div className="dom-stat">
          {d.score == null
            ? <div className="v" style={{ color: "var(--ink-4)", fontSize: 14 }}>—</div>
            : <div className="v">{d.score}<Delta value={d.scoreDelta} /></div>}
          <div className="l">Puntuación GEO</div>
        </div>
        <div className="dom-stat">
          <div className="v">{d.prompts}</div>
          <div className="l">Prompts</div>
        </div>
        <div className="dom-stat">
          <div className="v">{d.runs}</div>
          <div className="l">Escaneos</div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: "right" }}>
          <div className="dom-scan" style={{ justifyContent: "flex-end" }}><Flag2 cc={d.cc} />{d.country}</div>
          <div className="dom-scan" style={{ justifyContent: "flex-end", marginTop: 5 }}>
            {d.status === "scanning" ? <span className="spinner" /> : <Icon name="clock" size={12} />}{d.lastScan}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Run row ---------- */
function RunRow({ run, expanded, onToggle }) {
  const s = RUN_STATUS[run.status];
  const okPct = run.prompts ? (run.ok / run.prompts) * 100 : 0;
  const hasFails = run.fails && run.fails.length;
  return (
    <>
      <div className="run-row" onClick={() => hasFails && onToggle()} style={{ cursor: hasFails ? "pointer" : "default" }}>
        <div className="run-id">#{run.id}</div>
        <div className="run-when"><div className="d1">{run.date}</div><div className="d2">{run.time !== "—" ? run.time : "—"} · {run.duration}</div></div>
        <div><Badge tone="outline" icon={run.trigger === "Manual" ? "play" : "clock"}>{run.trigger}</Badge></div>
        <div className="run-prompts">
          <span className="run-bar"><i style={{ width: okPct + "%", background: run.failed ? "var(--warn)" : "var(--pos)" }} /></span>
          <span className="tnum" style={{ fontSize: 12.5, fontWeight: 650 }}>{run.ok}/{run.prompts}</span>
        </div>
        <div className="c">{run.failed > 0 ? <span className="tnum" style={{ color: "var(--neg-ink)", fontWeight: 750 }}>{run.failed}</span> : <span style={{ color: "var(--ink-4)" }}>—</span>}</div>
        <div className="c">{run.scoreDelta != null ? <Delta value={run.scoreDelta} /> : <span style={{ color: "var(--ink-4)" }}>—</span>}</div>
        <div className="r"><Badge tone={s.tone} icon={run.status === "done" ? "check" : run.status === "running" ? null : "alertCircle"}>{run.status === "running" ? <><span className="spinner" style={{ marginRight: 2 }} />{s.label}</> : s.label}</Badge></div>
        <div className="r">{hasFails ? <Icon name="chevDown" size={15} style={{ color: "var(--ink-4)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> : <Icon name="chevRight" size={15} style={{ color: "var(--line-strong)" }} />}</div>
      </div>
      {hasFails && expanded && (
        <div className="run-detail">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 10 }}>Prompts fallidos · {run.failed}</div>
          {run.fails.map((f, i) => (
            <div className="fail-row" key={i}>
              <EngMark id={f.engine} size={20} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>{window.PROMPT_DATA.ENGINE_META[f.engine].name}</span>
              <span className="fr-reason" style={{ color: "var(--neg-ink)" }}>· {f.reason}</span>
              <span className="fr-count">{f.count} prompt{f.count > 1 ? "s" : ""}</span>
            </div>
          ))}
          <button className="btn btn-soft btn-sm" style={{ marginTop: 6 }}><Icon name="refresh" size={13} />Reintentar prompts fallidos</button>
        </div>
      )}
    </>
  );
}

/* ---------- Delete modal (type-to-confirm) ---------- */
function DeleteModal({ domain, onCancel, onConfirm }) {
  const [txt, setTxt] = useStateRn("");
  const ok = txt.trim().toLowerCase() === domain.domain.toLowerCase();
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <div className="modal-ico"><Icon name="alert" size={22} /></div>
          <h3>¿Eliminar dominio?</h3>
          <p>
            Vas a eliminar <b>{domain.name}</b> ({domain.domain}) y todo su historial:
            <b> {domain.runs} escaneos</b>, {domain.prompts} prompts monitorizados y sus recomendaciones.
            Esta acción no se puede deshacer.
          </p>
          <div className="modal-confirm">
            <label className="field-label">Escribe <b style={{ fontFamily: "var(--mono)", color: "var(--neg-ink)" }}>{domain.domain}</b> para confirmar</label>
            <input className="field" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={domain.domain} autoFocus spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter" && ok) onConfirm(domain); }} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-danger" disabled={!ok} onClick={() => onConfirm(domain)}><Icon name="x" size={15} />Eliminar dominio</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main ---------- */
function brandName(domain) {
  const base = (domain || "tu-marca").replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function Runs({ onAddDomain, onViewDomain, onScanDomain, scanningDomain, mode = "full" }) {
  const { DOMAINS, RUNS } = window.RUNS_DATA;

  // dominio sintético en curso (primer escaneo)
  const firstScanDomain = scanningDomain ? {
    id: "new", name: brandName(scanningDomain), domain: scanningDomain, country: "Estados Unidos", cc: "us", lang: "Inglés",
    score: null, scoreDelta: null, lastScan: "Escaneando…", status: "scanning", prompts: 16, competitors: 5, runs: 1, you: true, color: "#6366f1",
  } : null;
  const firstScanRuns = { new: [
    { id: 1, date: "Hoy", time: "—", trigger: "Manual", prompts: 16, ok: 6, failed: 0, duration: "en curso", scoreDelta: null, status: "running" },
  ] };

  const initialDomains = mode === "empty" ? []
    : mode === "firstscan" ? (firstScanDomain ? [firstScanDomain] : [])
    : DOMAINS;
  const runsMap = mode === "firstscan" ? firstScanRuns : RUNS;

  const [domains, setDomains] = useStateRn(initialDomains);
  const [sel, setSel] = useStateRn(initialDomains[0] ? initialDomains[0].id : null);
  const [delTarget, setDelTarget] = useStateRn(null);
  const [expRun, setExpRun] = useStateRn(null);
  const [toast, setToast] = useStateRn(null);

  const selDomain = domains.find(d => d.id === sel) || domains[0];
  const runs = (selDomain && runsMap[selDomain.id]) || [];
  const anyScanning = domains.some(d => d.status === "scanning");

  const doDelete = (d) => {
    const next = domains.filter(x => x.id !== d.id);
    setDomains(next);
    if (sel === d.id && next.length) setSel(next[0].id);
    setDelTarget(null);
    setToast(`Dominio ${d.domain} eliminado`);
    setTimeout(() => setToast(null), 2600);
  };
  const togglePause = (d) => {
    setDomains(ds => ds.map(x => x.id === d.id ? { ...x, status: x.status === "paused" ? "active" : "paused" } : x));
  };

  const totals = {
    domains: domains.length,
    runs: domains.reduce((a, d) => a + d.runs, 0),
    scanning: domains.filter(d => d.status === "scanning").length,
    errors: domains.filter(d => d.status === "error").length,
  };

  const scanningNames = domains.filter(d => d.status === "scanning").map(d => d.name);

  // 1) vacío — solo la barra con Añadir dominio
  if (mode === "empty") {
    return (
      <div className="page fade-in">
        <div className="summary mt8" style={{ alignItems: "center" }}>
          <div className="summary-ico"><Icon name="globe" size={20} /></div>
          <div className="summary-txt" style={{ flex: 1 }}>
            Aún no tienes dominios monitorizados. Añade tu primer dominio para empezar a medir tu visibilidad en los motores de IA.
          </div>
          <button className="btn btn-primary" onClick={onAddDomain}><Icon name="plus" size={15} />Añadir dominio</button>
        </div>
        <div className="card card-pad" style={{ textAlign: "center", padding: "56px 40px", marginTop: 14 }}>
          <div className="state-ico" style={{ margin: "0 auto 16px" }}><Icon name="runs" size={26} /></div>
          <div style={{ fontSize: 16, fontWeight: 750 }}>Sin dominios todavía</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 8, maxWidth: 400, marginInline: "auto", lineHeight: 1.5 }}>
            Al añadir un dominio te guiaremos por dominio, competidores y prompts antes de lanzar el primer escaneo.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      {(scanningDomain || anyScanning) && (
        <div className="firstscan-banner">
          <div className="fb-ico"><Icon name="resonance" size={18} /><span className="fb-spin"></span></div>
          <div style={{ flex: 1 }}>
            <div className="fb-t">{mode === "firstscan" ? "Tu primer escaneo está en curso" : "Escaneo en curso"}</div>
            <div className="fb-d">
              {mode === "firstscan"
                ? <>Estamos analizando <b>{scanningDomain}</b> en 4 motores de IA. Te avisaremos cuando termine — puedes seguir el progreso aquí.</>
                : <>{scanningNames.length} {scanningNames.length === 1 ? "dominio se está escaneando" : "dominios se están escaneando"} ahora mismo: <b>{scanningNames.join(", ")}</b>.</>}
            </div>
          </div>
          <span className="st-chip st-scanning"><span className="d" />Escaneando</span>
        </div>
      )}
      <div className="summary mt8" style={{ alignItems: "center" }}>
        <div className="summary-ico"><Icon name="runs" size={20} /></div>
        <div className="summary-txt" style={{ flex: 1 }}>
          {mode === "firstscan"
            ? <>Tu primer dominio se está escaneando. Puedes añadir más dominios mientras tanto.</>
            : <>Gestionas <b>{totals.domains} dominios</b> y <b>{totals.runs} escaneos</b> en tu espacio de trabajo.{totals.errors > 0 && <> <span className="hl-neg">{totals.errors} con errores</span> requieren atención.</>}</>}
        </div>
        <button className="btn btn-primary" onClick={onAddDomain}><Icon name="plus" size={15} />Añadir dominio</button>
      </div>

      <div className="section-head">
        <div className="section-title">Dominios monitorizados</div>
        <div className="section-desc">{mode === "firstscan" ? "Tu primer dominio, escaneándose ahora" : "Selecciona un dominio para ver su historial · usa ⋮ para gestionarlo"}</div>
      </div>

      {domains.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
          <div className="state-ico" style={{ margin: "0 auto 16px" }}><Icon name="globe" size={26} /></div>
          <div style={{ fontSize: 16, fontWeight: 750 }}>No hay dominios</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 8 }}>Añade un dominio para empezar a monitorizar su visibilidad en IA.</div>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onAddDomain}><Icon name="plus" size={15} />Añadir dominio</button>
        </div>
      ) : (
        <div className="dom-grid" style={mode === "firstscan" ? { gridTemplateColumns: "1fr" } : null}>
          {domains.map(d => (
            <DomainCard key={d.id} d={d} selected={sel === d.id} onSelect={setSel}
              onView={onViewDomain} onScan={onScanDomain} onTogglePause={togglePause} onDelete={setDelTarget} />
          ))}
        </div>
      )}

      {selDomain && (
        <>
          <div className="section-head">
            <div className="section-title">Historial de escaneos</div>
            <div className="section-desc"><b style={{ color: "var(--ink-2)" }}>{selDomain.name}</b> · {runs.length} escaneos</div>
            <div className="right"><button className="btn btn-ghost btn-sm" onClick={() => onScanDomain(selDomain)}><Icon name="play" size={14} />Nuevo escaneo</button></div>
          </div>
          <div className="card">
            <div style={{ padding: "14px 0 2px" }}>
              <div className="runs-head">
                <span>Escaneo</span><span>Fecha</span><span>Origen</span><span>Prompts OK</span><span className="c">Fallos</span><span className="c">Δ Punt.</span><span className="r">Estado</span><span></span>
              </div>
              {runs.map(r => (
                <RunRow key={r.id} run={r} expanded={expRun === r.id} onToggle={() => setExpRun(x => x === r.id ? null : r.id)} />
              ))}
            </div>
          </div>
        </>
      )}

      {delTarget && <DeleteModal domain={delTarget} onCancel={() => setDelTarget(null)} onConfirm={doDelete} />}
      {toast && (
        <div style={{ position: "fixed", bottom: 76, left: "50%", transform: "translateX(-50%)", zIndex: 410,
          background: "#0f1729", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600,
          boxShadow: "var(--sh-pop)", display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="check" size={15} sw={2.4} style={{ color: "#5fd39a" }} />{toast}
        </div>
      )}
    </div>
  );
}

window.Runs = Runs;
