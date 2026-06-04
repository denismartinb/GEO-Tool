/* overview.jsx — Project Overview (executive screen) */
function Overview({ onOpenRecs, density, t = {} }) {
  const D = window.GEO_DATA;
  const { SCORES, LLMS, COMPETITORS, BRAND_ROW, OPPORTUNITIES, CITED_PAGES, RECS } = D;
  const rows = [BRAND_ROW, ...COMPETITORS].sort((a, b) => b.mention - a.mention);
  const maxMention = Math.max(...rows.map(r => r.mention));

  const WideStat = ({ s, sk }) => (
    <div className="stat wide-stat">
      <div className="ws-left">
        <div className="stat-label">{s.label}<Tip>{s.tip}</Tip></div>
        <div className="stat-value tnum">
          {s.value}{s.unit && <span className="unit">{s.unit}</span>}
        </div>
        <div className="ws-delta">
          <Delta value={s.delta} suffix={s.unit === "%" ? "pt" : (sk === "gap" ? "×" : "")} invert={s.invert} />
          <span className="stat-hint">vs. escaneo anterior</span>
        </div>
      </div>
      <div className="ws-spark">
        <Sparkline data={s.trend} w={232} h={64} color={s.invert ? "var(--pos)" : "var(--accent)"} />
      </div>
    </div>
  );

  return (
    <div className="page fade-in">
      {/* Executive summary */}
      <div className="summary mt8">
        <div className="summary-ico"><Icon name="sparkles" size={20} /></div>
        <div className="summary-txt">
          Vela aparece en <b>el 18% de tus 64 prompts de IA monitorizados</b>. Tu competidor más fuerte,
          <b> Orbit</b>, aparece en <span className="hl-neg">el 43%</span> — unas <b>2,4× más</b>.
          Lumira encontró <b>12 acciones</b> para mejorar tu preparación para ser citado;
          <span className="hl-pos"> 3 son victorias rápidas</span> que puedes implementar esta semana.
        </div>
      </div>

      {/* Score section */}
      <div className="section-head">
        <div className="section-title">Visibilidad de un vistazo</div>
        <div className="section-desc">Cómo muestran tu marca los motores de IA · último escaneo 28 may</div>
        <div className="right"><Badge tone="pos" icon="trendUp">Mejorando</Badge></div>
      </div>

      {/* Hero score — full width, filled */}
      <div className="card hero-v2">
        <div className="hv-gauge">
          {t.heroStyle === "número" ? (
            <div style={{ textAlign: "center" }}>
              <div className="tnum" style={{ fontSize: 68, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1, color: "var(--accent)" }}>{SCORES.geo.value}</div>
              <div className="gauge-cap" style={{ marginTop: 6 }}>/ 100</div>
            </div>
          ) : (
            <Gauge value={SCORES.geo.value} size={140} stroke={14} />
          )}
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <div className="stat-label" style={{ justifyContent: "center", marginBottom: 6 }}>
              Puntuación GEO <Tip>{SCORES.geo.tip}</Tip>
            </div>
            <Badge tone="accent">Franja «emergente»</Badge>
          </div>
        </div>

        <div className="hv-divider" />

        <div className="hv-compose">
          <div className="hv-block-label">Cómo se compone tu puntuación <Tip w={240}>La puntuación GEO combina con qué frecuencia te mencionan, cuántas veces te citan como fuente y la prominencia de tu marca en la respuesta.</Tip></div>
          {[
            { l: "Tasa de mención", v: 18, color: "var(--accent)" },
            { l: "Tasa de cita", v: 9, color: "#7c3aed" },
            { l: "Prominencia", v: 34, color: "#0d9488" },
          ].map(c => (
            <div className="compose-row" key={c.l}>
              <div className="compose-top">
                <span className="compose-l">{c.l}</span>
                <span className="compose-v tnum">{c.v}%</span>
              </div>
              <div className="sov-bar" style={{ height: 7 }}>
                <div className="sov-fill" style={{ width: c.v + "%", background: c.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="hv-divider" />

        <div className="hv-trend">
          <div className="hv-block-label">Tendencia · 7 escaneos</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
            <span className="tnum" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em" }}>{SCORES.geo.value}</span>
            <Delta value={SCORES.geo.delta} />
            <span className="stat-hint">este mes</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Sparkline data={SCORES.geo.trend} w={300} h={86} />
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
            Por encima de <b style={{ color: "var(--ink-2)" }}>70</b> es competitivo para tu categoría.
          </div>
        </div>
      </div>

      {/* 4 metrics — 2 columns, full width */}
      <div className="metrics-2col">
        <WideStat s={SCORES.mention} sk="mention" />
        <WideStat s={SCORES.citation} sk="citation" />
        <WideStat s={SCORES.gap} sk="gap" />
        <WideStat s={SCORES.confidence} sk="confidence" />
      </div>

      {/* Competitive snapshot + LLM distribution */}
      <div className="section-head">
        <div className="section-title">Dónde estás</div>
        <div className="section-desc">Cuota de voz en IA en tus prompts monitorizados</div>
      </div>

      <div className="grid-2-1">
        {/* Competitive table */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Panorámica competitiva</div>
            <Tip w={250}>La <b>cuota de voz en IA</b> es tu parte de todas las menciones de marca en los prompts monitorizados. Las tasas de mención y cita muestran con qué frecuencia cada marca es nombrada frente a enlazada como fuente.</Tip>
            <div className="right"><span className="badge badge-neutral">5 competidores</span></div>
          </div>
          <div style={{ padding: "6px 6px 4px" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Marca</th>
                  <th className="num">Mención</th>
                  <th className="num">Cita</th>
                  <th>Cuota de voz en IA</th>
                  <th className="num">Tend.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name} className={r.you ? "you" : "hoverable"}>
                    <td>
                      <div className="ent">
                        <Fav ent={r} />
                        <div>
                          <div className="nm">{r.name}{r.you && <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginLeft: 6 }}>Tú</span>}</div>
                          <div className="dm">{r.domain}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num"><b className="tnum">{r.mention}%</b></td>
                    <td className="num"><span className="tnum" style={{ color: "var(--ink-2)" }}>{r.citation}%</span></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <SovBar value={r.mention} color={r.color} track={maxMention} />
                        <span className="tnum" style={{ fontSize: 12, fontWeight: 700, width: 32 }}>{r.sov}%</span>
                      </div>
                    </td>
                    <td className="num"><Delta value={r.delta} suffix="pt" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* LLM distribution */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Distribución por motor de IA</div>
            <Tip>De dónde vienen tus menciones. Cada motor responde distinto — las brechas de cobertura en uno son una oportunidad.</Tip>
          </div>
          <div className="card-pad" style={{ paddingTop: 14 }}>
            {LLMS.map(l => (
              <div key={l.name} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: l.color }} />
                  <span style={{ fontSize: 13, fontWeight: 650 }}>{l.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }} className="tnum">
                    {l.mention}% mención
                  </span>
                </div>
                <div className="sov-bar" style={{ height: 9 }}>
                  <div className="sov-fill" style={{ width: l.share + "%", background: l.color }} />
                </div>
              </div>
            ))}
            <div className="why" style={{ marginTop: 18 }}>
              <Icon name="bolt" size={16} />
              <div>
                <div className="why-t">Mayor brecha: Google AI Overviews</div>
                <div className="why-b">Te mencionan solo en el 16% de las respuestas de AI Overview, pero genera el 27% del tráfico de IA en tu categoría.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt opportunities + cited pages */}
      <div className="section-head">
        <div className="section-title">Oportunidades</div>
        <div className="section-desc">Prompts donde ganan los competidores y tú estás ausente</div>
        <div className="right"><button className="btn btn-ghost btn-sm" onClick={onOpenRecs}>Ver todos los prompts <Icon name="arrRight" size={14} /></button></div>
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Oportunidades de prompts</div>
            <Tip>Prompts de alto valor donde uno o más competidores son mencionados o citados, pero tu marca no aparece. Son tus caminos más rápidos hacia nueva visibilidad.</Tip>
          </div>
          <div>
            {OPPORTUNITIES.map((o, i) => (
              <div className="opp-row" key={i}>
                <div style={{ minWidth: 0 }}>
                  <div className="opp-q">{o.q}</div>
                  <div className="opp-tags">
                    <Badge tone={o.value === "Alto" ? "warn" : "neutral"}>Valor {o.value.toLowerCase()}</Badge>
                    <Badge tone="outline">{o.intent}</Badge>
                    <span style={{ fontSize: 11.5, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="search" size={12} />{o.volume}/mes · {o.engines} motores
                    </span>
                  </div>
                </div>
                <div className="opp-right">
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontWeight: 600, marginBottom: 5, textAlign: "right" }}>Competidores citados</div>
                    <div className="av-stack">
                      {o.competitors.map(c => {
                        const ent = COMPETITORS.find(x => x.name === c);
                        return <AvMini key={c} ent={ent} />;
                      })}
                    </div>
                  </div>
                  <button className="icon-btn" title="Ver oportunidad"><Icon name="arrRight" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Páginas fuente más citadas</div>
            <Tip>Las URLs de las que más beben los motores de IA al responder tus prompts. Las páginas de competidores y agregadores revelan qué contenido se cita.</Tip>
          </div>
          <div style={{ padding: "4px 0" }}>
            {CITED_PAGES.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: i < CITED_PAGES.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                <Icon name={p.you ? "link" : "globe"} size={15} style={{ color: p.you ? "var(--accent)" : "var(--ink-4)", flex: "0 0 auto" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: p.you ? "var(--accent-ink)" : "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.url}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>citada en {p.prompts} prompts</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tnum" style={{ fontSize: 15, fontWeight: 750 }}>{p.cites}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 600 }}>citas</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top recommendations */}
      <div className="section-head">
        <div className="section-title">Qué hacer primero</div>
        <div className="section-desc">Acciones principales ordenadas por impacto en la visibilidad en IA</div>
        <div className="right"><button className="btn btn-primary btn-sm" onClick={onOpenRecs}>Abrir Centro de recomendaciones <Icon name="arrRight" size={14} /></button></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {RECS.slice(0, 3).map(r => (
          <div className="card card-pad" key={r.id} style={{ cursor: "pointer" }} onClick={onOpenRecs}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span className={"rec-rank " + r.priority} style={{ width: 26, height: 26, fontSize: 12 }}>{r.rank}</span>
              <Badge tone={r.priority === "high" ? "neg" : r.priority === "med" ? "warn" : "neutral"}>Prioridad {r.priority === "high" ? "alta" : r.priority === "med" ? "media" : "baja"}</Badge>
              <Badge tone="outline">{r.category}</Badge>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>{r.title}</div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 13, borderTop: "1px solid var(--line-soft)" }}>
              <div><div className="rmetric"><div className="l">Impacto</div><div className="v"><DotMeter n={r.impact} tone="h" /></div></div></div>
              <div><div className="rmetric"><div className="l">Esfuerzo</div><div className="v"><DotMeter n={r.effort} tone="m" /></div></div></div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}><div className="l" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>Confianza</div><div className="tnum" style={{ fontSize: 13, fontWeight: 750, marginTop: 4 }}>{r.confidence}%</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.Overview = Overview;
