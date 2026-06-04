/* citations.jsx — Páginas citadas: URLs que la IA cita al responder los prompts */
const { useState: useStateCi } = React;

function EngBadges({ engines }) {
  const M = window.PROMPT_DATA.ENGINE_META;
  return (
    <div className="cit-engs">
      {engines.map(e => (
        <span key={e} className="cit-eng" style={{ background: M[e].color }} title={M[e].name}>{M[e].short}</span>
      ))}
    </div>
  );
}

function BrandMentioned({ v }) {
  if (v === "yes") return <Badge tone="pos" icon="check">Sí</Badge>;
  if (v === "no") return <Badge tone="neg" icon="x">No</Badge>;
  return <span style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600 }}>N/A</span>;
}

function compEntC(name) {
  const D = window.GEO_DATA;
  if (name === "Vela") return D.BRAND;
  return D.COMPETITORS.find(c => c.name === name) || { name, color: "#94a3b8", initial: name[0] };
}

function CitationRow({ c, open, onToggle }) {
  const { CIT_CATS } = window.CIT_DATA;
  const cat = CIT_CATS[c.cat];
  return (
    <div className={"cit-card" + (open ? " open" : "")}>
      <div className="cit-row" onClick={onToggle}>
        <div className="cit-urlcell">
          <button className="cit-exp"><Icon name={open ? "chevDown" : "chevRight"} size={15} /></button>
          <div style={{ minWidth: 0 }}>
            <div className="cit-title">{c.title}</div>
            <div className="cit-url"><Icon name="link" size={11} />{c.url}</div>
          </div>
        </div>
        <div className="c"><BrandMentioned v={c.brandMentioned} /></div>
        <div className="cit-comps">
          {c.competitors.length
            ? <div className="av-stack">{c.competitors.map(x => <AvMini key={x} ent={compEntC(x)} />)}</div>
            : <span style={{ fontSize: 12, color: "var(--ink-4)" }}>—</span>}
        </div>
        <div className="cit-dom"><span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{c.domain}</span></div>
        <div><Badge tone={cat.tone}>{cat.label}</Badge></div>
        <div className="num"><span className="tnum" style={{ fontWeight: 800, fontSize: 15 }}>{c.cited}</span></div>
      </div>
      {open && (
        <div className="cit-detail">
          <div className="cit-detail-head">
            <span>Prompt</span><span className="c">Tu marca en la respuesta</span><span className="r">Motores de IA</span>
          </div>
          {c.prompts.map((p, i) => (
            <div className="cit-prow" key={i}>
              <div className="cit-pq"><Icon name="search" size={13} style={{ color: "var(--ink-4)" }} />{p.q}</div>
              <div className="c">
                <span className="cit-mention"><Fav ent={window.GEO_DATA.BRAND} size={18} /><b className="tnum">{p.mentions}</b></span>
              </div>
              <div className="r"><EngBadges engines={p.engines} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Citations() {
  const { CITATIONS, CIT_CATS } = window.CIT_DATA;
  const [open, setOpen] = useStateCi("u1");
  const [guide, setGuide] = useStateCi(true);
  const [q, setQ] = useStateCi("");
  const [catF, setCatF] = useStateCi("all");
  const [engF, setEngF] = useStateCi("all");
  const [sort, setSort] = useStateCi("cited");

  let list = CITATIONS.filter(c => {
    if (catF !== "all" && c.cat !== catF) return false;
    if (engF !== "all" && !c.prompts.some(p => p.engines.includes(engF))) return false;
    if (q && !(c.title.toLowerCase().includes(q.toLowerCase()) || c.url.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });
  if (sort === "cited") list = [...list].sort((a, b) => b.cited - a.cited);

  const totalCited = CITATIONS.reduce((a, c) => a + c.cited, 0);
  const yours = CITATIONS.filter(c => c.cat === "brand").length;
  const oppor = CITATIONS.filter(c => c.cat !== "brand" && c.brandMentioned !== "yes").length;
  const M = window.PROMPT_DATA.ENGINE_META;

  const TACTICS = [
    { ico: "target", t: "Consigue menciones donde ya citan a tus rivales",
      d: "Las fuentes de tipo Reseñas, Comunidad o Medio que citan a competidores y no a ti son tu lista de outreach: contacta para aparecer en su artículo." },
    { ico: "file", t: "Crea contenido para los prompts que no cubres",
      d: "Si una URL de competidor responde a un prompt donde no apareces, crea una página equivalente — mejor estructurada y citable — para esa intención." },
    { ico: "link", t: "Refuerza tus propias páginas citadas",
      d: "Las URLs de «Tu marca» ya funcionan: amplíalas con FAQ y datos claros para que la IA las cite en más prompts y motores." },
  ];

  return (
    <div className="page fade-in">
      <div className="summary mt8" style={{ alignItems: "center" }}>
        <div className="summary-ico"><Icon name="cite" size={20} /></div>
        <div className="summary-txt" style={{ flex: 1 }}>
          La IA cita <b>{CITATIONS.length} URLs</b> al responder tus prompts, con <b>{totalCited} citas</b> en total.
          Solo <span className="hl-neg">{yours} son tuyas</span> — el resto alimentan a competidores y agregadores.
        </div>
        <button className="btn btn-soft btn-sm" onClick={() => setGuide(g => !g)}><Icon name="help" size={14} />{guide ? "Ocultar guía" : "Cómo usar esto"}</button>
        <button className="btn btn-ghost btn-sm"><Icon name="download" size={14} />Exportar CSV</button>
      </div>

      {guide && (
        <div className="cit-guide fade-in">
          <div className="cit-guide-head">
            <div className="cit-guide-ico"><Icon name="sparkles" size={17} /></div>
            <div style={{ flex: 1 }}>
              <div className="cit-guide-t">De páginas citadas a más visibilidad en IA</div>
              <div className="cit-guide-d">Las fuentes que cita la IA son tu hoja de ruta de link building y contenido. Tienes <b>{oppor} oportunidades</b> donde la IA cita una fuente y tu marca no aparece.</div>
            </div>
            <button className="cit-guide-x" onClick={() => setGuide(false)} title="Ocultar"><Icon name="x" size={15} /></button>
          </div>
          <div className="cit-tactics">
            {TACTICS.map((x, i) => (
              <div className="cit-tactic" key={i}>
                <div className="ct-num"><Icon name={x.ico} size={15} /></div>
                <div>
                  <div className="ct-t">{x.t}</div>
                  <div className="ct-d">{x.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* filtros */}
      <div className="pr-toolbar" style={{ marginTop: 16 }}>
        <div className="pr-search">
          <Icon name="search" size={15} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por dominio o URL…" />
        </div>
        <select className="cit-select" value={catF} onChange={e => setCatF(e.target.value)}>
          <option value="all">Todas las categorías</option>
          {Object.entries(CIT_CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="cit-select" value={engF} onChange={e => setEngF(e.target.value)}>
          <option value="all">Todos los motores</option>
          {Object.entries(M).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
        <div style={{ marginLeft: "auto" }} />
        <span style={{ fontSize: 12.5, color: "var(--ink-4)", fontWeight: 600 }}>{list.length} URLs</span>
      </div>

      <div className="card">
        <div className="cit-head">
          <span>URL</span><span className="c">Marca mencionada <Tip w={230}>Si la IA nombra tu marca en la respuesta que usa esta fuente. <b>No</b> = la fuente impulsa a otros, no a ti.</Tip></span><span>Competidores</span><span>Dominio</span><span>Categoría <Tip w={230}>Tipo de fuente: <b>Tu marca</b>, <b>Competidor</b>, <b>Reseñas</b> (G2/Capterra), <b>Comunidad</b> (Reddit) o <b>Medio</b>. Prioriza reseñas y medios para outreach.</Tip></span><span className="num">Citas</span>
        </div>
        {list.map(c => (
          <CitationRow key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(o => o === c.id ? null : c.id)} />
        ))}
        {list.length === 0 && <div style={{ padding: 36, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>No hay URLs con estos filtros.</div>}
      </div>
    </div>
  );
}

window.Citations = Citations;
