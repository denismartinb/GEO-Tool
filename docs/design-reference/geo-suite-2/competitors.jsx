/* competitors.jsx — pantalla Competidores: GEO competitivo */
const { useState: useStateC } = React;

function pulls(brands, plat) {
  // devuelve lista ordenada por visibilidad de la plataforma seleccionada, con sov recalculado
  const total = brands.reduce((a, b) => a + b.plat[plat].m, 0) || 1;
  return brands.map(b => ({
    ...b, vis: b.plat[plat].vis, mentions: b.plat[plat].m,
    sov: Math.round(b.plat[plat].m / total * 100),
  })).sort((a, b) => b.vis - a.vis);
}

function SentBadge({ v }) {
  if (v == null) return <span style={{ color: "var(--ink-4)" }}>—</span>;
  const tone = v >= 15 ? "pos" : v <= -15 ? "neg" : "neutral";
  return <Badge tone={tone}>{v > 0 ? "+" : ""}{v}</Badge>;
}

const GAP_META = {
  shared:  { tone: "pos", label: "Compartido", icon: "check" },
  missing: { tone: "neg", label: "Perdido", icon: "x" },
  weak:    { tone: "warn", label: "Débil", icon: "trendDown" },
};

function Competitors() {
  const D = window.COMP_DATA;
  const [plat, setPlat] = useStateC("all");
  const [showMore, setShowMore] = useStateC(false);
  const [gapF, setGapF] = useStateC("all");

  const allBrands = showMore ? [...D.CB, ...D.CB_MORE] : D.CB;
  const ranked = pulls(allBrands, plat);
  const you = ranked.find(b => b.you);
  const youRank = ranked.findIndex(b => b.you) + 1;
  const leader = ranked[0];
  const maxVis = ranked[0].vis;
  const totalMentions = ranked.reduce((a, b) => a + b.mentions, 0);

  const gapList = D.GAP.filter(g => gapF === "all" ? true : g.gap === gapF);
  const gapCounts = { missing: D.GAP.filter(g => g.gap === "missing").length, weak: D.GAP.filter(g => g.gap === "weak").length, shared: D.GAP.filter(g => g.gap === "shared").length };

  const compEnt = (name) => {
    const b = [...D.CB, ...D.CB_MORE].find(x => x.name === name);
    return b || { name, color: "#94a3b8", initial: name[0] };
  };

  return (
    <div className="page fade-in">
      {/* resumen */}
      <div className="summary mt8" style={{ alignItems: "center" }}>
        <div className="summary-ico"><Icon name="competitors" size={20} /></div>
        <div className="summary-txt" style={{ flex: 1 }}>
          <b>Vela</b> es la <b>#{youRank}</b> de {ranked.length} marcas por visibilidad en IA.
          <b> {leader.name}</b> lidera con <span className="hl-neg">{leader.vis}%</span> — te mencionan
          <b> {(leader.vis / you.vis).toFixed(1)}× menos</b>.
        </div>
        <button className="btn btn-ghost btn-sm"><Icon name="download" size={14} />Exportar</button>
      </div>

      {/* selector de plataforma */}
      <div className="comp-platbar">
        <span className="comp-platlbl">Motor de IA</span>
        <div className="seg">
          {D.PLATFORMS.map(p => (
            <button key={p.id} className={plat === p.id ? "on" : ""} onClick={() => setPlat(p.id)}>
              {p.color && <span className="eng-dot" style={{ background: p.color, width: 7, height: 7, display: "inline-block", borderRadius: 999, marginRight: 6 }} />}
              {p.short}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs de tu marca */}
      <div className="comp-kpis">
        {[
          { l: "AI Visibility Score", v: you.vis, u: "%", tip: "Tu visibilidad ponderada en el set de prompts analizados para el motor seleccionado.", rank: `#${youRank} de ${ranked.length}`, trend: you.trend },
          { l: "Share of Voice", v: you.sov, u: "%", tip: "Tu cuota de menciones frente al total del grupo de competidores.", sub: `Líder ${leader.name}: ${leader.sov}%` },
          { l: "Menciones totales", v: you.mentions, u: "", tip: "Número de respuestas de IA donde se cita tu marca directamente.", sub: `de ${totalMentions} del grupo` },
          { l: "Sentimiento medio", v: (you.sentiment > 0 ? "+" : "") + you.sentiment, u: "", tip: "Tono medio de las menciones de tu marca (de -100 a +100).", sub: "Neutral a positivo" },
        ].map((k, i) => (
          <div className="stat" key={i} style={{ minHeight: 0 }}>
            <div className="stat-label">{k.l}<Tip>{k.tip}</Tip></div>
            <div className="stat-value tnum" style={{ fontSize: 30, marginTop: 9 }}>{k.v}{k.u && <span className="unit">{k.u}</span>}</div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
              {k.rank ? <Badge tone="accent">{k.rank}</Badge> : <span className="stat-hint">{k.sub}</span>}
              {k.trend && <div style={{ marginLeft: "auto" }}><Sparkline data={k.trend} w={64} h={24} /></div>}
            </div>
          </div>
        ))}
      </div>

      {/* Brand ranking */}
      <div className="section-head">
        <div className="section-title">Ranking de marcas</div>
        <div className="section-desc">Cuota de voz en IA · {D.PLATFORMS.find(p => p.id === plat).name}</div>
        <div className="right">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowMore(s => !s)}>
            {showMore ? "Ver menos" : "Más marcas detectadas"} <Icon name={showMore ? "chevLeft" : "chevRight"} size={14} />
          </button>
        </div>
      </div>
      <div className="card">
        <div style={{ padding: "6px 6px 4px" }}>
          <table className="tbl comp-rank-tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th><th>Marca</th>
                <th className="num">Visibilidad</th><th className="num">Sentim.</th>
                <th className="num">Menciones</th><th className="num">Cobertura</th><th>Cuota de voz</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((b, i) => (
                <tr key={b.name} className={b.you ? "you" : "hoverable"}>
                  <td className="tnum" style={{ color: "var(--ink-3)", fontWeight: 700 }}>{i + 1}</td>
                  <td>
                    <div className="ent">
                      <Fav ent={b} />
                      <div>
                        <div className="nm">{b.name}{b.you && <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginLeft: 6 }}>Tú</span>}</div>
                        <div className="dm">{b.domain}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num"><b className="tnum">{b.vis}%</b></td>
                  <td className="num"><SentBadge v={b.sentiment} /></td>
                  <td className="num tnum" style={{ color: "var(--ink-2)" }}>{b.mentions}</td>
                  <td className="num tnum" style={{ color: "var(--ink-2)" }}>{b.coverage}%</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <SovBar value={b.vis} color={b.color} track={maxVis} />
                      <span className="tnum" style={{ fontSize: 12, fontWeight: 700, width: 30 }}>{b.sov}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matriz de gap de prompts */}
      <div className="section-head">
        <div className="section-title">Matriz de oportunidades por prompt</div>
        <div className="section-desc">Dónde aparecen tus competidores y tú no — tu hoja de ruta de contenido</div>
      </div>
      <div className="filters" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={gapF === "all" ? "on" : ""} onClick={() => setGapF("all")}>Todos</button>
          <button className={gapF === "missing" ? "on" : ""} onClick={() => setGapF("missing")}>Perdidos <span style={{ opacity: .6 }}>{gapCounts.missing}</span></button>
          <button className={gapF === "weak" ? "on" : ""} onClick={() => setGapF("weak")}>Débiles <span style={{ opacity: .6 }}>{gapCounts.weak}</span></button>
          <button className={gapF === "shared" ? "on" : ""} onClick={() => setGapF("shared")}>Compartidos <span style={{ opacity: .6 }}>{gapCounts.shared}</span></button>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", fontSize: 11.5, color: "var(--ink-4)", fontWeight: 600 }}>
          <span><i style={{ width: 8, height: 8, borderRadius: 2, background: "var(--neg)", display: "inline-block", marginRight: 5 }} />Perdido = no apareces</span>
          <span><i style={{ width: 8, height: 8, borderRadius: 2, background: "var(--warn)", display: "inline-block", marginRight: 5 }} />Débil = peor posición</span>
        </div>
      </div>
      <div className="card">
        <div style={{ padding: "4px 0" }}>
          <div className="gap-head">
            <span>Prompt</span><span>Intención</span><span className="num">Vol. IA</span><span>Competidores citados</span><span className="c">Tu posición</span><span className="c">Estado</span>
          </div>
          {gapList.map((g, i) => {
            const m = GAP_META[g.gap];
            return (
              <div className="gap-row" key={i}>
                <div className="gap-q">{g.q}</div>
                <div><Badge tone="outline">{g.intent}</Badge></div>
                <div className="num"><span className="tnum" style={{ fontWeight: 700, fontSize: 13 }}>{g.volume}</span><span style={{ fontSize: 10.5, color: "var(--ink-4)", display: "block" }}>/mes</span></div>
                <div className="av-stack">
                  {g.competitors.map(c => <AvMini key={c} ent={compEnt(c)} />)}
                </div>
                <div className="c">
                  {g.youPos == null
                    ? <Badge tone="neg">Ausente</Badge>
                    : <span className="tnum" style={{ fontWeight: 750 }}>#{g.youPos}{g.youSent != null && <span style={{ marginLeft: 6 }}><SentBadge v={g.youSent} /></span>}</span>}
                </div>
                <div className="c"><Badge tone={m.tone} icon={m.icon}>{m.label}</Badge></div>
              </div>
            );
          })}
          {gapList.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>Sin prompts en este filtro.</div>}
        </div>
      </div>

      {/* Fuentes de citación */}
      <div className="section-head">
        <div className="section-title">Fuentes que alimentan a la IA</div>
        <div className="section-desc">De dónde extrae la IA la información para recomendar marcas — tu mapa de link building</div>
      </div>
      <div className="src-grid">
        {D.SOURCES.map((s, i) => (
          <div className={"src-card" + (s.youCited ? " you" : "")} key={i}>
            <div className="src-top">
              <Icon name={s.youCited ? "link" : "globe"} size={16} style={{ color: s.youCited ? "var(--accent)" : "var(--ink-4)" }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="src-dom">{s.domain}</div>
                <div className="src-type">{s.type}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="tnum" style={{ fontSize: 17, fontWeight: 800 }}>{s.citations}</div>
                <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 600 }}>citas</div>
              </div>
            </div>
            <div className="src-url"><Icon name="link" size={12} />{s.url}</div>
            <div className="src-foot">
              <span style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 600 }}>Cita a</span>
              <div className="av-stack">{s.cites.map(c => <AvMini key={c} ent={compEnt(c)} />)}</div>
              {!s.youCited && <button className="btn btn-soft btn-sm" style={{ marginLeft: "auto" }}><Icon name="target" size={13} />Conseguir mención</button>}
              {s.youCited && <span className="badge badge-pos" style={{ marginLeft: "auto" }}><Icon name="check" size={12} />Ya te cita</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.Competitors = Competitors;
