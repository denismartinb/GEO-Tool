/* app.jsx — GEO Studio shell, routing, demo states, tweaks */
const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": ["#6366f1", "#4f46e5", "#eef0fe", "#3730a3"],
  "density": "normal",
  "heroStyle": "medidor",
  "navCounts": true,
  "zebra": false
}/*EDITMODE-END*/;

const ACCENTS = {
  Indigo: ["#6366f1", "#4f46e5", "#eef0fe", "#3730a3"],
  Cian:   ["#0891b2", "#0e7490", "#e2f5fa", "#0c5b73"],
  Teal:   ["#0d9488", "#0f766e", "#e6f6f3", "#0b5d56"],
  Violeta:["#7c3aed", "#6d28d9", "#f1ebfe", "#5b21b6"],
};

function Header({ project, state, onRun, density }) {
  const D = window.GEO_DATA;
  const routeTitle = "Overview";
  let status;
  if (state === "loading") status = <span className="scan-status"><span className="dot run" />Escaneo en curso</span>;
  else if (state === "error") status = <span className="scan-status"><span className="dot err" />Último escaneo fallido</span>;
  else if (state === "empty") status = <span className="scan-status"><span className="dot" style={{ background: "var(--ink-4)" }} />Sin escaneos aún</span>;
  else status = <span className="scan-status"><span className="dot ok" />Escaneado {project.lastScan}</span>;

  return (
    <header className="hdr">
      <div className="hdr-titlewrap">
        <div className="hdr-crumb"><b>{project.name}</b></div>
        <div className="hdr-meta" style={{ marginTop: 2 }}>
          <span className="meta-pill"><Icon name="globe" size={13} /><span style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{project.domain}</span></span>
          <span className="meta-pill"><FlagUS /> {project.country}</span>
          <span className="meta-pill"><Icon name="lang" size={13} />{project.language}</span>
        </div>
      </div>
      <div className="hdr-spacer" />
      {status}
      <button className="icon-btn" title="Notifications"><Icon name="bell" size={16} /></button>
      {state === "populated"
        ? <button className="btn btn-ghost" onClick={onRun}><Icon name="refresh" size={15} />Repetir escaneo</button>
        : <button className="btn btn-primary" onClick={onRun}><Icon name="play" size={15} />Lanzar escaneo</button>}
    </header>
  );
}

function FlagUS() {
  return (
    <span className="meta-flag">
      <svg width="17" height="12" viewBox="0 0 19 13">
        <rect width="19" height="13" fill="#fff" />
        {[0,2,4,6,8,10,12].map(y => <rect key={y} y={y} width="19" height="1" fill="#b22234" />)}
        <rect width="9" height="7" fill="#3c3b6e" />
      </svg>
    </span>
  );
}

function DemoBar({ view, setView, state, setState, setRoute }) {
  const goState = (k) => { setView("app"); setState(k); setRoute("overview"); };
  const views = [["landing", "Landing"], ["login", "Login"], ["signup", "Registro"]];
  const states = [["onboarding", "Inicio"], ["populated", "Con datos"], ["empty", "Vacío"], ["loading", "Cargando"], ["error", "Error"]];
  const cur = view === "app" ? state : view;
  return (
    <div className="demo-bar">
      <span className="lbl">Pantalla</span>
      {views.map(([k, l]) =>
        <button key={k} className={cur === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}
      <span style={{ width: 1, height: 18, background: "#39405a", margin: "0 4px" }} />
      {states.map(([k, l]) =>
        <button key={k} className={view === "app" && state === k ? "on" : ""} onClick={() => goState(k)}>{l}</button>)}
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useStateA("landing"); // landing | login | signup | app
  const [route, setRoute] = useStateA("overview");
  const [collapsed, setCollapsed] = useStateA(false);
  const [state, setState] = useStateA("onboarding"); // onboarding | populated | empty | loading | error
  const [scanDomain, setScanDomain] = useStateA("vela.io");
  const [initialDomain, setInitialDomain] = useStateA("");

  // apply accent tweak
  useEffectA(() => {
    const a = t.accent || ACCENTS.Indigo;
    const r = document.documentElement.style;
    r.setProperty("--accent", a[0]);
    r.setProperty("--accent-700", a[1]);
    r.setProperty("--accent-soft", a[2]);
    r.setProperty("--accent-ink", a[3]);
    // derive soft-2 + ring
    r.setProperty("--accent-soft-2", a[2]);
    r.setProperty("--accent-ring", a[0] + "4d");
  }, [t.accent]);

  const density = t.density;

  const runScan = () => { setState("loading"); };
  const startProject = (domain, country) => {
    setScanDomain(domain);
    setState("loading");
    setRoute("overview");
  };

  const DemoTweaks = (
    <React.Fragment>
      <DemoBar view={view} setView={setView} state={state} setState={setState} setRoute={setRoute} />
      <TweaksPanel>
        <TweakSection label="Acento de marca" />
        <TweakColor label="Color de acento" value={t.accent} options={Object.values(ACCENTS)} onChange={(v) => setTweak("accent", v)} />
        <TweakSection label="Diseño" />
        <TweakRadio label="Densidad" value={t.density} options={["compacta", "normal"]} onChange={(v) => setTweak("density", v)} />
        <TweakRadio label="Puntuación destacada" value={t.heroStyle} options={["medidor", "número"]} onChange={(v) => setTweak("heroStyle", v)} />
        <TweakToggle label="Contadores en menú" value={t.navCounts} onChange={(v) => setTweak("navCounts", v)} />
        <TweakToggle label="Tablas con franjas" value={t.zebra} onChange={(v) => setTweak("zebra", v)} />
      </TweaksPanel>
    </React.Fragment>
  );

  // ---- Marketing / Auth views (sin app shell) ----
  if (view === "landing") {
    return (
      <React.Fragment>
        <Landing
          onLogin={() => setView("login")}
          onSignup={(d) => { setInitialDomain(d || ""); setView("signup"); }} />
        {DemoTweaks}
      </React.Fragment>
    );
  }
  if (view === "login") {
    return (
      <React.Fragment>
        <Login
          onLogin={() => { setView("app"); setState("populated"); setRoute("overview"); }}
          onGoSignup={() => setView("signup")}
          onHome={() => setView("landing")} />
        {DemoTweaks}
      </React.Fragment>
    );
  }
  if (view === "signup") {
    return (
      <React.Fragment>
        <Signup
          onComplete={() => { setView("app"); setState("onboarding"); }}
          onGoLogin={() => setView("login")}
          onHome={() => setView("landing")} />
        {DemoTweaks}
      </React.Fragment>
    );
  }

  // pantalla de inicio a pantalla completa (sin shell)
  if (state === "onboarding") {
    return (
      <React.Fragment>
        <Onboarding initialDomain={initialDomain} onStart={startProject} />
        {DemoTweaks}
      </React.Fragment>
    );
  }

  let body;
  if (route === "overview") {
    if (state === "empty") body = <EmptyState onRun={runScan} />;
    else if (state === "loading") body = <LoadingState onDone={() => setState("populated")} domain={scanDomain} />;
    else if (state === "error") body = <ErrorState onRetry={runScan} onView={() => setRoute("runs")} />;
    else body = <Overview onOpenRecs={() => setRoute("recs")} density={density} t={t} />;
  } else if (route === "recs") {
    if (state === "empty" || state === "loading") body = <EmptyRecs state={state} onRun={runScan} />;
    else body = <Recommendations density={density} />;
  } else if (route === "prompts") {
    if (state === "loading") body = <LoadingState onDone={() => setState("populated")} domain={scanDomain} />;
    else if (state === "empty") body = <EmptyState onRun={runScan} />;
    else body = <Prompts />;
  } else {
    body = <PlaceholderRoute route={route} />;
  }

  const pageTitle = route === "overview" ? "Visión general del proyecto" : route === "recs" ? "Centro de recomendaciones"
    : route === "prompts" ? "Prompts" : route === "competitors" ? "Competidores" : route === "runs" ? "Escaneos" : "Soluciones generadas";

  return (
    <div className={"app" + (collapsed ? " collapsed" : "") + (density === "compacta" ? " dense" : "") + (t.zebra ? " zebra" : "")}>
      <Sidebar route={route} setRoute={setRoute} collapsed={collapsed} setCollapsed={setCollapsed}
        project={window.GEO_DATA.PROJECT} density={density} navCounts={t.navCounts} />
      <div className="main">
        <header className="hdr">
          <div className="hdr-titlewrap">
            <div className="hdr-crumb"><b>{window.GEO_DATA.PROJECT.name}</b> · <span>{pageTitle}</span></div>
            <div className="hdr-meta" style={{ marginTop: 2 }}>
              <span className="meta-pill"><Icon name="globe" size={13} /><span style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{window.GEO_DATA.PROJECT.domain}</span></span>
              <span className="meta-pill"><FlagUS /> {window.GEO_DATA.PROJECT.country}</span>
              <span className="meta-pill"><Icon name="lang" size={13} />{window.GEO_DATA.PROJECT.language}</span>
            </div>
          </div>
          <div className="hdr-spacer" />
          {state === "loading" && <span className="scan-status"><span className="dot run" />Escaneo en curso</span>}
          {state === "error" && <span className="scan-status"><span className="dot err" />Último escaneo fallido</span>}
          {state === "empty" && <span className="scan-status"><span className="dot" style={{ background: "var(--ink-4)" }} />Sin escaneos aún</span>}
          {state === "populated" && <span className="scan-status"><span className="dot ok" />Escaneado {window.GEO_DATA.PROJECT.lastScan}</span>}
          <button className="icon-btn" title="Notificaciones"><Icon name="bell" size={16} /></button>
          {state === "populated"
            ? <button className="btn btn-ghost" onClick={runScan}><Icon name="refresh" size={15} />Repetir escaneo</button>
            : <button className="btn btn-primary" onClick={runScan}><Icon name="play" size={15} />Lanzar escaneo</button>}
        </header>
        <div className="content" key={route + state}>{body}</div>
      </div>

      {DemoTweaks}
    </div>
  );
}

function EmptyRecs({ state, onRun }) {
  if (state === "loading") return <LoadingState onDone={() => {}} />;
  return (
    <div className="state-wrap fade-in">
      <div className="state-card">
        <div className="state-ico"><Icon name="recs" size={28} /></div>
        <div className="state-title">Aún no hay recomendaciones</div>
        <div className="state-body">Las recomendaciones aparecerán cuando se haya analizado tu primer escaneo de visibilidad. La auditoría completa cubre más de 25 factores de ranking y puede tardar unos minutos.</div>
        <div className="state-actions"><button className="btn btn-primary btn-lg" onClick={onRun}><Icon name="play" size={16} />Lanzar escaneo</button></div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
