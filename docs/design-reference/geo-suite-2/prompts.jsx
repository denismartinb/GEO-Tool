/* prompts.jsx — Prompts (Topics/Prompts) + drawer de detalle estilo Otterly */
const { useState: useStateP } = React;

function EngineMark({ id, size = 22 }) {
  const e = window.PROMPT_DATA.ENGINE_META[id];
  return <span className="engine-mark" style={{ width: size, height: size, background: e.color, fontSize: size <= 22 ? 10 : 12 }}>{e.short}</span>;
}

// color de marca/competidor
function brandEnt(name) {
  const D = window.GEO_DATA;
  if (name === "Vela") return D.BRAND;
  return D.COMPETITORS.find(c => c.name === name) || { name, color: "#94a3b8", initial: name[0] };
}

function StatusBadges({ list }) {
  if (!list || !list.length) return <span style={{ fontSize: 12, color: "var(--ink-4)" }}>—</span>;
  return <>{list.map(s => <Badge key={s} tone={s === "Citada" ? "accent" : "neutral"}>{s}</Badge>)}</>;
}

function Senti({ v }) {
  const col = v > 15 ? "var(--pos)" : v < -15 ? "var(--neg)" : "var(--ink-4)";
  const w = Math.min(50, Math.abs(v) / 2 + 8);
  return (
    <span className="senti">
      <span className="senti-track"><span className="senti-fill" style={{ background: col, width: w + "%", left: v >= 0 ? "50%" : "auto", right: v < 0 ? "50%" : "auto" }} /></span>
      <span className="senti-num" style={{ color: col }}>{v > 0 ? "+" : ""}{v}</span>
    </span>
  );
}

/* ---------- Drawer ---------- */
function PromptDrawer({ promptId, onClose }) {
  const { PROMPT_ROWS, ENGINE_META } = window.PROMPT_DATA;
  const p = PROMPT_ROWS[promptId];
  const [tab, setTab] = useStateP("resumen");
  const [eng, setEng] = useStateP(null); // null = lista; id = detalle motor

  const cited = p.engines.filter(e => e.status.includes("Citada")).length;
  const mentioned = p.engines.filter(e => e.status.includes("Mencionada")).length;

  // ranking de marcas que más aparecen en este prompt
  const ranking = (() => {
    const map = {};
    const n = p.engines.length;
    p.engines.forEach(e => {
      if (e.status && e.status.length) {
        map["Vela"] = map["Vela"] || { name: "Vela", you: true, count: 0, sent: [] };
        map["Vela"].count++; map["Vela"].sent.push(e.sentiment);
      }
      (e.competitors || []).forEach(c => {
        map[c] = map[c] || { name: c, count: 0, sent: [] };
        map[c].count++; map[c].sent.push(Math.round(e.sentiment * 0.6) + 12);
      });
    });
    return Object.values(map).map(b => ({
      ...b,
      coverage: Math.round(b.count / n * 100),
      sentiment: Math.round(b.sent.reduce((a, x) => a + x, 0) / b.sent.length),
    })).sort((a, b) => b.coverage - a.coverage || b.count - a.count);
  })();

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <Icon name="prompts" size={17} style={{ color: "var(--ink-3)" }} />
          <div className="t">Detalle del prompt</div>
          <button className="icon-btn" style={{ marginLeft: "auto", width: 30, height: 30 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div className="drawer-body">
          <div className="prompt-box">
            <div className="qico"><Icon name="search" size={15} /></div>
            <div>
              <div className="q">{p.text}</div>
              <div className="meta">
                <span>Intención: {p.intent}</span><span>Volumen IA: {p.volume}/mes</span><span>{p.engines.length} motores</span>
              </div>
            </div>
          </div>

          <div className="drawer-tabs">
            <button className={tab === "resumen" ? "on" : ""} onClick={() => { setTab("resumen"); setEng(null); }}>Resumen</button>
            <button className={tab === "respuestas" ? "on" : ""} onClick={() => setTab("respuestas")}>Respuestas</button>
          </div>

          {tab === "resumen" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="aside-card" style={{ gridColumn: "span 2" }}>
                <div className="ac-title">Ranking de marcas en este prompt</div>
                <table className="tbl pr-rank">
                  <thead><tr><th style={{ width: 28 }}>#</th><th>Marca</th><th className="num">Sentimiento</th><th>Cobertura</th></tr></thead>
                  <tbody>
                    {ranking.map((b, i) => (
                      <tr key={b.name} className={b.you ? "you" : ""}>
                        <td className="tnum" style={{ color: "var(--ink-3)", fontWeight: 700 }}>{i + 1}</td>
                        <td>
                          <div className="ent">
                            <Fav ent={brandEnt(b.name)} size={22} />
                            <span className="nm">{b.name}{b.you && <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 11, marginLeft: 6 }}>Tú</span>}</span>
                          </div>
                        </td>
                        <td className="num"><Senti v={b.sentiment} /></td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div className="sov-bar" style={{ flex: 1, minWidth: 50 }}><div className="sov-fill" style={{ width: b.coverage + "%", background: brandEnt(b.name).color }} /></div>
                            <span className="tnum" style={{ fontWeight: 700, width: 34, fontSize: 12.5 }}>{b.coverage}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="aside-card">
                <div className="ac-title">Presencia de tu marca</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div><div style={{ fontSize: 24, fontWeight: 800 }} className="tnum">{mentioned}/{p.engines.length}</div><div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>te mencionan</div></div>
                  <div><div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)" }} className="tnum">{cited}/{p.engines.length}</div><div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>te citan</div></div>
                </div>
              </div>
              <div className="aside-card">
                <div className="ac-title">Cobertura</div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  <b>{p.brands}</b> marcas y <b>{p.sources}</b> fuentes citadas en las respuestas de IA para este prompt.
                </div>
              </div>
              <div className="aside-card" style={{ gridColumn: "span 2" }}>
                <div className="ac-title">Por motor</div>
                {p.engines.map(e => (
                  <div key={e.engine} className="brand-presence">
                    <EngineMark id={e.engine} size={20} />
                    <span className="nm">{ENGINE_META[e.engine].name}</span>
                    <StatusBadges list={e.status} />
                    <Senti v={e.sentiment} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "respuestas" && eng === null && (
            <div>
              <div className="pl-head" style={{ display: "grid", gridTemplateColumns: "1fr 78px 120px 90px", padding: "0 14px 8px", border: "none" }}>
                <span>Motor de IA</span><span style={{ textAlign: "center" }}>Marca</span><span>Sentimiento</span><span style={{ textAlign: "right" }}>Fecha</span>
              </div>
              {p.engines.map(e => (
                <div key={e.engine} className="resp-row" onClick={() => setEng(e.engine)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="resp-eng"><EngineMark id={e.engine} />{ENGINE_META[e.engine].name}</div>
                    <div className="resp-snip" style={{ marginTop: 4 }}>{e.snippet}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>{e.status.length ? <Badge tone="pos">Sí</Badge> : <Badge tone="neutral">No</Badge>}</div>
                  <Senti v={e.sentiment} />
                  <div style={{ textAlign: "right", fontSize: 12, color: "var(--ink-4)", fontWeight: 600 }}>Hoy</div>
                </div>
              ))}
            </div>
          )}

          {tab === "respuestas" && eng !== null && (() => {
            const e = p.engines.find(x => x.engine === eng);
            const brandsAll = [{ name: "Vela", sentiment: e.sentiment, you: true }, ...e.competitors.map(c => ({ name: c, sentiment: Math.round(e.sentiment * 0.6) }))];
            const hasBrand = e.status.length > 0;
            return (
              <div>
                <button className="back-chip" onClick={() => setEng(null)}><Icon name="chevLeft" size={14} />Todas las respuestas</button>
                <div className="resp-detail">
                  <div className="resp-full">
                    <div className="eng-head"><EngineMark id={e.engine} /><b style={{ fontSize: 13.5 }}>{ENGINE_META[e.engine].name}</b><span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-4)" }}>Hoy</span></div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600, marginBottom: 12 }}>{p.text}</div>
                    <div className="body">{e.full}</div>
                  </div>
                  <div className="resp-aside">
                    <div className="aside-card">
                      <div className="ac-title">Presencia de marca y sentimiento</div>
                      {hasBrand ? brandsAll.map(b => {
                        const ent = brandEnt(b.name);
                        return (
                          <div key={b.name} className="brand-presence">
                            <Fav ent={{ ...ent, initial: ent.initial }} size={22} />
                            <span className="nm">{b.name}{b.you && <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 11, marginLeft: 5 }}>Tú</span>}</span>
                            <Senti v={b.sentiment} />
                          </div>
                        );
                      }) : <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>Tu marca no aparece en esta respuesta.</div>}
                    </div>
                    <div className="aside-card">
                      <div className="ac-title">Fuentes ({e.sources.length})</div>
                      {e.sources.map((s, i) => (
                        <div key={i} className={"src-item" + (s.you ? " you" : "")}>
                          <Icon name={s.you ? "link" : "globe"} size={13} className="si-ico" />
                          <div>
                            <div className="si-url">{s.url}</div>
                            {s.brand && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>{s.brand}{s.you ? " · tu dominio" : ""}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}

/* ---------- Fila de prompt (dentro de topic o plana) ---------- */
function PromptListRow({ p, onOpen, showTopic }) {
  const { ENGINE_META } = window.PROMPT_DATA;
  const first = p.engines[0];
  return (
    <div className="pl-row" onClick={() => onOpen(p.id)}>
      <div className="pl-q">{p.text}</div>
      <div className="pl-resp">
        <EngineMark id={first.engine} />
        <div style={{ minWidth: 0 }}>
          <div className="txt" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{first.snippet}</div>
          <span className="vfull">Ver respuesta completa →</span>
        </div>
      </div>
      <div className="pl-brand"><StatusBadges list={p.your} /></div>
      <div className={"pl-count" + (p.brands ? "" : " muted")}>{p.brands}</div>
      <div className={"pl-count" + (p.sources ? "" : " muted")}>{p.sources}</div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><Icon name="arrRight" size={15} style={{ color: "var(--ink-4)" }} /></div>
    </div>
  );
}

const INTENT_COLORS = { Comercial: "#7c3aed", Informacional: "var(--accent)", Transaccional: "#0d9488" };

function TopicRow({ topic, open, onToggle, onOpenPrompt }) {
  const { PROMPT_ROWS } = window.PROMPT_DATA;
  const prompts = topic.prompts.map(id => ({ id, ...PROMPT_ROWS[id] }));
  const visCol = topic.visibility >= 60 ? "var(--pos)" : topic.visibility >= 30 ? "var(--accent)" : "var(--warn)";
  return (
    <div className={"topic-card" + (open ? " open" : "")}>
      <div className="topic-row" onClick={onToggle}>
        <div className="topic-name">
          <Icon name="chevRight" size={15} className="chev" />
          <span className="nm">{topic.name}</span>
          <Icon name="layers" size={14} className="tico" />
        </div>
        <div className="vis-cell">
          <span className="vis-num">{topic.visibility}</span>
          <span className="vis-track"><span className="vis-fill" style={{ width: topic.visibility + "%", background: visCol }} /></span>
        </div>
        <div style={{ textAlign: "right", fontWeight: 700, fontSize: 13.5 }} className="tnum">{topic.mentions}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <Sparkline data={topic.trend} w={56} h={26} fill={false} />
          <span className="tnum" style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink-2)", width: 38, textAlign: "right" }}>{topic.volume}</span>
        </div>
        <div>
          <div className="intent-bar">
            {Object.entries(topic.intent).map(([k, v]) => <span key={k} style={{ width: v + "%", background: INTENT_COLORS[k] }} />)}
          </div>
          <div className="intent-legend">
            {Object.entries(topic.intent).map(([k, v]) => <span key={k}><i style={{ background: INTENT_COLORS[k] }} />{k.slice(0, 4)} {v}%</span>)}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={(ev) => { ev.stopPropagation(); onToggle(); }}><Icon name="eye" size={14} />Monitorizar</button>
        </div>
      </div>
      {open && (
        <div className="topic-prompts">
          <div className="pl-head">
            <span>Prompt</span><span>Respuesta de IA</span><span>Tu marca</span><span className="c">Marcas</span><span className="c">Fuentes</span><span></span>
          </div>
          {prompts.map(p => <PromptListRow key={p.id} p={p} onOpen={onOpenPrompt} />)}
        </div>
      )}
    </div>
  );
}

function Prompts() {
  const { PROMPT_TOPICS, PROMPT_ROWS } = window.PROMPT_DATA;
  const [mode, setMode] = useStateP("topics"); // topics | prompts
  const [openTopic, setOpenTopic] = useStateP("t1");
  const [drawer, setDrawer] = useStateP(null);
  const [q, setQ] = useStateP("");

  const allPrompts = Object.entries(PROMPT_ROWS).map(([id, v]) => ({ id, ...v }));
  const filteredPrompts = allPrompts.filter(p => p.text.toLowerCase().includes(q.toLowerCase()));
  const filteredTopics = PROMPT_TOPICS.filter(t => t.name.toLowerCase().includes(q.toLowerCase()) ||
    t.prompts.some(id => PROMPT_ROWS[id].text.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="page fade-in">
      <div className="summary mt8" style={{ alignItems: "center" }}>
        <div className="summary-ico"><Icon name="prompts" size={20} /></div>
        <div className="summary-txt" style={{ flex: 1 }}>
          Monitorizas <b>64 prompts</b> agrupados en <b>{PROMPT_TOPICS.length} topics</b>. Pincha un prompt para ver
          la respuesta de cada motor de IA y las fuentes que cita.
        </div>
      </div>

      <div className="section-head">
        <div className="section-title">Prompts y topics</div>
        <div className="section-desc">Agrupados por tema · ordenados por visibilidad</div>
        <div className="right"><button className="btn btn-ghost btn-sm"><Icon name="download" size={14} />Exportar</button></div>
      </div>

      <div className="pr-toolbar">
        <div className="seg">
          <button className={mode === "topics" ? "on" : ""} onClick={() => setMode("topics")}>Topics <span style={{ opacity: .6 }}>{PROMPT_TOPICS.length}</span></button>
          <button className={mode === "prompts" ? "on" : ""} onClick={() => setMode("prompts")}>Prompts <span style={{ opacity: .6 }}>{allPrompts.length}</span></button>
        </div>
        <div className="pr-search">
          <Icon name="search" size={15} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={mode === "topics" ? "Filtrar por topic…" : "Filtrar por prompt…"} />
        </div>
        <button className="chip"><Icon name="filter" size={14} />Intención</button>
        <button className="chip"><Icon name="layers" size={14} />Motor</button>
        <div style={{ marginLeft: "auto" }} />
        <span style={{ fontSize: 12.5, color: "var(--ink-4)", fontWeight: 600 }}>{mode === "topics" ? filteredTopics.length + " topics" : filteredPrompts.length + " prompts"}</span>
      </div>

      {mode === "topics" ? (
        <>
          <div className="topic-tbl-head">
            <span>Topic</span><span className="r">Visibilidad</span><span className="r">Menciones</span><span className="r">Volumen IA</span><span>Intención</span><span></span>
          </div>
          {filteredTopics.map(t => (
            <TopicRow key={t.id} topic={t} open={openTopic === t.id}
              onToggle={() => setOpenTopic(o => o === t.id ? null : t.id)}
              onOpenPrompt={setDrawer} />
          ))}
        </>
      ) : (
        <div className="topic-card open">
          <div className="topic-prompts" style={{ borderTop: "none" }}>
            <div className="pl-head">
              <span>Prompt</span><span>Respuesta de IA</span><span>Tu marca</span><span className="c">Marcas</span><span className="c">Fuentes</span><span></span>
            </div>
            {filteredPrompts.map(p => <PromptListRow key={p.id} p={p} onOpen={setDrawer} />)}
          </div>
        </div>
      )}

      {drawer && <PromptDrawer promptId={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

window.Prompts = Prompts;
