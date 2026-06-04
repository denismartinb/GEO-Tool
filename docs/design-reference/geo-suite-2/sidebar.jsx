/* sidebar.jsx — app navigation */
function Sidebar({ route, setRoute, collapsed, setCollapsed, project, density, navCounts = true }) {
  const D = window.GEO_DATA;
  const primary = [
    { id: "overview", label: "Visión general", icon: "overview" },
    { id: "prompts", label: "Prompts", icon: "prompts", count: project.promptCount },
    { id: "competitors", label: "Competidores", icon: "competitors", count: project.competitorCount },
    { id: "citations", label: "Páginas citadas", icon: "cite" },
    { id: "runs", label: "Escaneos", icon: "runs", count: project.runCount },
  ];
  const action = [
    { id: "recs", label: "Recomendaciones", icon: "recs", count: D.REC_SUMMARY.total, badge: true },
    { id: "solutions", label: "Soluciones generadas", icon: "solutions", locked: true },
  ];

  const Item = (it) => (
    <div key={it.id}
      className={"nav-item" + (route === it.id ? " active" : "") + (it.locked ? " locked" : "")}
      onClick={() => !it.locked && setRoute(it.id)}
      title={collapsed ? it.label : undefined}>
      <Icon name={it.icon} size={17} />
      <span className="hide-collapsed">{it.label}</span>
      {!collapsed && navCounts && it.count != null && <span className="nav-count">{it.count}</span>}
      {!collapsed && it.locked && <Icon name="lock" size={13} className="nav-lock" />}
    </div>
  );

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="brand-mark"><Icon name="resonance" size={17} sw={2} /></div>
        <div className="hide-collapsed">
          <div className="brand-name">Lumira</div>
          <div className="brand-sub">Espacio de visibilidad en IA</div>
        </div>
      </div>

      <div className="proj-switch" title="Cambiar de proyecto">
        <div className="proj-favicon">{project.name[0]}</div>
        <div className="proj-meta hide-collapsed">
          <div className="proj-name">{project.name}</div>
          <div className="proj-dom">{project.domain}</div>
        </div>
        <Icon name="chevDown" size={15} className="hide-collapsed" style={{ color: "var(--ink-4)" }} />
      </div>

      <div className="sb-scroll">
        <div className="nav-group-label hide-collapsed">Analizar</div>
        {primary.map(Item)}
        <div className="nav-group-label hide-collapsed">Actuar</div>
        {action.map(Item)}
      </div>

      <div className="sb-foot">
        <div className="nav-item" style={{ marginBottom: 2 }} title="Help & GEO guide">
          <Icon name="help" size={17} />
          <span className="hide-collapsed">¿Qué es el GEO?</span>
        </div>
        <div className="user-chip">
          <div className="avatar">DM</div>
          <div className="hide-collapsed" style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.2 }}>Denis Martín</div>
            <div style={{ fontSize: 11, color: "var(--ink-4)" }}>Agencia Acme</div>
          </div>
          <Icon name="settings" size={16} className="hide-collapsed" style={{ color: "var(--ink-4)" }} />
        </div>
      </div>

      <button className="sb-collapse" onClick={() => setCollapsed(c => !c)} title="Contraer menú">
        <Icon name={collapsed ? "chevRight" : "chevLeft"} size={13} sw={2.2} />
      </button>
    </aside>
  );
}
window.Sidebar = Sidebar;
