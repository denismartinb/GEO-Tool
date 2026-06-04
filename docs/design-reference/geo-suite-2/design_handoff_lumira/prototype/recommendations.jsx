/* recommendations.jsx — Recommendations Center (prioritized action backlog) */
const { useState: useStateR } = React;

function RecGenerate({ rec }) {
  const [state, setState] = useStateR("idle"); // idle | loading | done
  if (!rec.genKind) {
    return (
      <div className="gen-out" style={{ borderStyle: "solid", borderColor: "var(--line)" }}>
        <div className="gen-head" style={{ color: "var(--ink-3)" }}><Icon name="globe" size={14} />Acción fuera de la plataforma</div>
        <div className="gen-body">Esta recomendación se ejecuta fuera de tu sitio, así que no hay nada que generar aquí. Monitorízala como una campaña y vuelve a escanear cuando las colocaciones estén activas.</div>
      </div>
    );
  }
  const OUT = {
    1: <><b style={{ color: "var(--ink)" }}>Bloque de FAQ sugerido</b> para <code>/product/analytics</code><div style={{ marginTop: 8 }}><b>P: ¿Es Vela una buena herramienta de analítica de producto para SaaS B2B?</b><br/>R: Sí. Vela está pensada para equipos SaaS B2B, con onboarding self-serve, precios transparentes por asiento, análisis de cohortes y cumplimiento SOC 2 Tipo II — las capacidades que más comparan los compradores al elegir plataforma de analítica.</div><div style={{ marginTop: 8 }}><b>P: ¿Cómo se compara Vela con Orbit y Quanta?</b><br/>R: Vela iguala a Orbit y Quanta en analítica esencial y ofrece una configuración más rápida y precios más claros…</div></>,
    2: <><b style={{ color: "var(--ink)" }}>Reglas de robots.txt sugeridas</b><div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 12, background: "var(--surface-sunk)", padding: 12, borderRadius: 8, lineHeight: 1.7 }}>User-agent: GPTBot<br/>Allow: /product<br/>Allow: /pricing<br/>Allow: /compare<br/><br/>User-agent: PerplexityBot<br/>Allow: /<br/><br/>User-agent: Google-Extended<br/>Allow: /</div></>,
    3: <><b style={{ color: "var(--ink)" }}>Sección de capacidades sugerida</b><div style={{ marginTop: 8 }}>Vela admite <code>análisis de cohortes</code>, <code>session replay</code> y <code>detección de anomalías</code> de serie. Los planes enterprise añaden opciones de <code>residencia de datos</code>, cumplimiento <code>SOC 2</code> y <code>HIPAA</code>, y <code>reverse ETL</code> para sincronizar insights de vuelta a tu warehouse…</div></>,
    4: <><b style={{ color: "var(--ink)" }}>JSON-LD sugerido (FAQPage)</b><div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 11.5, background: "var(--surface-sunk)", padding: 12, borderRadius: 8, lineHeight: 1.6 }}>{`{ "@context":"https://schema.org",`}<br/>{`  "@type":"FAQPage",`}<br/>{`  "mainEntity":[{ "@type":"Question",`}<br/>{`    "name":"¿Es Vela buena para SaaS B2B?" …`}</div></>,
    6: <><b style={{ color: "var(--ink)" }}>Esquema de informe sugerido — edición 2026</b><div style={{ marginTop: 8 }}>1. El estado de la analítica de producto en 2026<br/>2. Dataset de benchmarks y metodología (n=1.200)<br/>3. Medianas de activación y retención por segmento<br/>4. Qué ha cambiado desde 2024…</div></>,
  };
  return (
    <div>
      <button className="btn btn-primary btn-sm" disabled={state === "loading"}
        onClick={() => { setState("loading"); setTimeout(() => setState("done"), 1700); }}>
        <Icon name="sparkles" size={14} />
        {state === "idle" && "Generar " + rec.genKind.toLowerCase()}
        {state === "loading" && "Generando…"}
        {state === "done" && "Regenerar"}
      </button>
      {state === "loading" && (
        <div className="gen-out">
          <div className="gen-head"><div className="spinner" />Redactando {rec.genKind.toLowerCase()} a partir del contenido de tu página…</div>
          <div className="skel-line" style={{ width: "92%" }} />
          <div className="skel-line" style={{ width: "100%" }} />
          <div className="skel-line" style={{ width: "78%" }} />
          <div className="skel-line" style={{ width: "88%", marginBottom: 0 }} />
        </div>
      )}
      {state === "done" && (
        <div className="gen-out fade-in">
          <div className="gen-head"><Icon name="sparkles" size={14} />Generado por Lumira · revísalo antes de publicar</div>
          <div className="gen-body">{OUT[rec.id]}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn btn-soft btn-sm"><Icon name="download" size={13} />Copiar</button>
            <button className="btn btn-ghost btn-sm"><Icon name="check" size={13} />Marcar como implementado</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RecCard({ rec, open, onToggle, cardStyle }) {
  const D = window.GEO_DATA;
  const pr = rec.priority;
  const ev = rec.evidence;
  const priorityBadge = <Badge tone={pr === "high" ? "neg" : pr === "med" ? "warn" : "neutral"}>{pr === "high" ? "Alta" : pr === "med" ? "Media" : "Baja"}</Badge>;
  const statusBadge = rec.status === "in-progress"
    ? <Badge tone="info" icon="clock">En curso</Badge>
    : <Badge tone="outline">Abierta</Badge>;
  const quickWin = rec.impact >= 4 && rec.effort <= 2;

  return (
    <div className={"rec-card" + (open ? " open" : "")}>
      <div className="rec-main" onClick={onToggle}>
        <div className={"rec-rank " + pr}>{rec.rank}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            {priorityBadge}
            <Badge tone="outline">{rec.category}</Badge>
            {quickWin && <Badge tone="pos" icon="bolt">Victoria rápida</Badge>}
            {statusBadge}
          </div>
          <div className="rec-title">{rec.title}</div>
          <div className="rec-problem">{rec.problem}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
          <div className="rec-metrics">
            <div className="rmetric"><div className="l">Impacto</div><div className="v"><DotMeter n={rec.impact} tone="h" /></div></div>
            <div className="rmetric"><div className="l">Esfuerzo</div><div className="v"><DotMeter n={rec.effort} tone="m" /></div></div>
            <div className="rmetric"><div className="l">Confianza</div><div className="v tnum">{rec.confidence}%</div></div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {open ? "Ocultar" : "Ver"} recomendación <Icon name={open ? "chevDown" : "chevRight"} size={14} />
          </button>
        </div>
      </div>

      <div className="rec-detail">
        <div className="rec-detail-inner">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
            <div className="detail-block">
              <div className="db-label">Por qué importa</div>
              <p>{rec.why}</p>
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <span className="badge badge-neutral"><Icon name="prompts" size={12} />{rec.metrics.affectedPrompts} prompts afectados</span>
                <span className="badge badge-accent"><Icon name="trendUp" size={12} />Est. {rec.metrics.est}</span>
                <span className="badge badge-outline">Riesgo SEO: {rec.seoRisk}</span>
              </div>
            </div>
            <div className="detail-block">
              <div className="db-label">Evidencia</div>
              <div className="evidence">
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
                  <Badge tone="neutral" icon="quote">{ev.engine}</Badge>
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)", fontStyle: "italic", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{ev.prompt}”</span>
                </div>
                <div className="ev-quote">
                  {ev.mentions.length
                    ? ev.quote.split(new RegExp(`(${ev.mentions.join("|")})`, "g")).map((part, i) =>
                        ev.mentions.includes(part) ? <span key={i} className="mk">{part}</span> : part)
                    : ev.quote}
                </div>
                <div className="ev-src"><Icon name="link" size={13} />{ev.cited}</div>
              </div>
            </div>
          </div>

          <div className="detail-block">
            <div className="db-label">Acción sugerida</div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "14px 16px" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", flex: "0 0 auto" }}><Icon name="target" size={16} /></div>
              <p style={{ flex: 1 }}>{rec.action}</p>
            </div>
          </div>

          <div className="detail-block">
            <div className="db-label">Generar solución</div>
            <RecGenerate rec={rec} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Recommendations({ density }) {
  const D = window.GEO_DATA;
  const { RECS, REC_SUMMARY } = D;
  const [openId, setOpenId] = useStateR(1);
  const [statusF, setStatusF] = useStateR("all");
  const [catF, setCatF] = useStateR("Todas");
  const [sort, setSort] = useStateR("priority");

  const cats = ["Todas", "Contenido", "Técnico", "Autoridad"];
  let list = RECS.filter(r => {
    if (statusF === "quick" && !(r.impact >= 4 && r.effort <= 2)) return false;
    if (statusF === "open" && r.status !== "open") return false;
    if (catF !== "Todas" && r.category !== catF) return false;
    return true;
  });
  if (sort === "impact") list = [...list].sort((a, b) => b.impact - a.impact || a.effort - b.effort);
  else list = [...list].sort((a, b) => a.rank - b.rank);

  const Stat = ({ v, l, tone }) => (
    <div style={{ flex: 1, padding: "2px 0" }}>
      <div className="tnum" style={{ fontSize: 24, fontWeight: 800, color: tone || "var(--ink)" }}>{v}</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, marginTop: 2 }}>{l}</div>
    </div>
  );

  return (
    <div className="page fade-in">
      {/* Header summary */}
      <div className="summary mt8" style={{ alignItems: "center" }}>
        <div className="summary-ico"><Icon name="recs" size={20} /></div>
        <div className="summary-txt" style={{ flex: 1 }}>
          Lumira analizó <b>vela.io</b> en más de 25 factores de ranking y tus 64 prompts monitorizados.
          Este es tu plan de trabajo priorizado — <b>{REC_SUMMARY.total} acciones</b> ordenadas por impacto en la visibilidad en IA.
        </div>
        <div style={{ display: "flex", gap: 26, paddingLeft: 22, borderLeft: "1px solid var(--line)" }}>
          <Stat v={REC_SUMMARY.high} l="Prioridad alta" tone="var(--neg)" />
          <Stat v={REC_SUMMARY.quickWins} l="Victorias rápidas" tone="var(--pos)" />
          <Stat v={REC_SUMMARY.total} l="Acciones totales" />
        </div>
      </div>

      <div className="section-head">
        <div className="section-title">Backlog de acciones</div>
        <div className="section-desc">Pulsa cualquier acción para ver la evidencia y generar una solución</div>
        <div className="right"><button className="btn btn-ghost btn-sm"><Icon name="download" size={14} />Exportar plan</button></div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="seg">
          {[["all", "Todas"], ["open", "Abiertas"], ["quick", "Victorias rápidas"]].map(([k, l]) =>
            <button key={k} className={statusF === k ? "on" : ""} onClick={() => setStatusF(k)}>{l}</button>)}
        </div>
        <div style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />
        {cats.map(c =>
          <button key={c} className={"chip" + (catF === c ? " on" : "")} onClick={() => setCatF(c)}>{c}</button>)}
        <div style={{ marginLeft: "auto" }} />
        <button className="chip" onClick={() => setSort(s => s === "priority" ? "impact" : "priority")}>
          <Icon name="sort" size={14} />Orden: {sort === "priority" ? "Prioridad" : "Impacto"}
        </button>
      </div>

      {list.map(r => (
        <RecCard key={r.id} rec={r} open={openId === r.id} onToggle={() => setOpenId(o => o === r.id ? null : r.id)} />
      ))}

      {list.length === 0 && (
        <div className="card card-pad" style={{ textAlign: "center", padding: 40, color: "var(--ink-3)" }}>
          No hay recomendaciones que coincidan con estos filtros.
        </div>
      )}
    </div>
  );
}

window.Recommendations = Recommendations;
