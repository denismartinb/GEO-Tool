/* states.jsx — empty / loading / error states + placeholder routes */
const { useState: useStateS, useEffect: useEffectS } = React;

function EmptyState({ onRun, onGoScans }) {
  if (onGoScans) {
    return (
      <div className="state-wrap fade-in">
        <div className="state-card">
          <div className="state-ico"><Icon name="runs" size={28} /></div>
          <div className="state-title">Aún no hay datos de este dominio</div>
          <div className="state-body">
            Este dominio todavía no tiene ningún escaneo completado. Lanza tu primer escaneo desde
            la pantalla de Escaneos para empezar a ver tu visibilidad en los motores de IA.
          </div>
          <div className="state-actions">
            <button className="btn btn-primary btn-lg" onClick={onGoScans}><Icon name="runs" size={16} />Ir a Escaneos</button>
          </div>
          <div className="why" style={{ marginTop: 28, textAlign: "left" }}>
            <Icon name="help" size={16} />
            <div>
              <div className="why-t">¿Qué es un escaneo?</div>
              <div className="why-b">Un escaneo plantea a cada motor de IA tus prompts monitorizados y registra si tu marca — y tus competidores — aparecen en las respuestas, y qué URLs se citan.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="state-wrap fade-in">
      <div className="state-card">
        <div className="state-ico"><Icon name="play" size={28} /></div>
        <div className="state-title">Lanza tu primer escaneo de visibilidad en IA</div>
        <div className="state-body">
          Lumira analizará tus 64 prompts monitorizados en ChatGPT, Google AI Overviews,
          Perplexity y Claude — detectando menciones de marca, citas y brechas competitivas.
        </div>
        <div className="state-actions">
          <button className="btn btn-primary btn-lg" onClick={onRun}><Icon name="play" size={16} />Lanzar escaneo</button>
          <button className="btn btn-ghost btn-lg"><Icon name="prompts" size={16} />Revisar prompts</button>
        </div>
        <div className="why" style={{ marginTop: 28, textAlign: "left" }}>
          <Icon name="help" size={16} />
          <div>
            <div className="why-t">¿Qué es un escaneo?</div>
            <div className="why-b">Un escaneo plantea a cada motor de IA tus prompts monitorizados y registra si tu marca — y tus competidores — aparecen en las respuestas, y qué URLs se citan.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Overview cuando hay un escaneo en curso y aún no hay datos */
function OverviewScanning({ domain, onSeeProgress }) {
  const Sk = ({ w, h, r = 8, style }) => <div className="skel-block" style={{ width: w, height: h, borderRadius: r, ...style }} />;
  return (
    <div className="page fade-in scan-illu">
      <div className="scan-illu-overlay">
        <div className="scan-illu-card">
          <div className="scan-radar"><span></span><span></span><span></span><Icon name="resonance" size={22} /></div>
          <div className="state-title" style={{ fontSize: 19 }}>Tu primer escaneo está en curso</div>
          <div className="state-body" style={{ maxWidth: 400 }}>
            Estamos analizando <b style={{ color: "var(--ink-2)", fontFamily: "var(--mono)", fontWeight: 600 }}>{domain}</b> en
            ChatGPT, Google AI Overviews, Perplexity y Claude. Cuando termine, aquí verás tu puntuación
            GEO, tus competidores y tus oportunidades.
          </div>
          <div className="scan-illu-bar"><span></span></div>
          <div className="state-actions">
            <button className="btn btn-primary btn-lg" onClick={onSeeProgress}><Icon name="runs" size={16} />Ver progreso del escaneo</button>
          </div>
          <div className="scan-illu-hint"><Icon name="clock" size={13} />Suele tardar unos minutos · te avisaremos al terminar</div>
        </div>
      </div>

      {/* esqueleto ilustrativo del panel */}
      <div className="scan-skel" aria-hidden="true">
        <div className="summary" style={{ alignItems: "center" }}>
          <Sk w={38} h={38} r={10} /><div style={{ flex: 1 }}><Sk w="80%" h={13} /><div style={{ height: 8 }}></div><Sk w="55%" h={13} /></div>
        </div>
        <div style={{ height: 26 }}></div>
        <div className="card" style={{ display: "flex", gap: 22, padding: 24, alignItems: "center" }}>
          <Sk w={128} h={128} r={999} />
          <div style={{ flex: 1 }}><Sk w="40%" h={12} /><div style={{ height: 12 }}></div><Sk w="70%" h={10} /><div style={{ height: 8 }}></div><Sk w="60%" h={10} /></div>
          <div style={{ flex: 1.1 }}><Sk w="50%" h={12} /><div style={{ height: 14 }}></div><Sk w="90%" h={46} r={10} /></div>
        </div>
        <div style={{ height: 14 }}></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[0,1,2,3].map(i => (
            <div className="card" key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "17px 20px" }}>
              <div><Sk w={90} h={11} /><div style={{ height: 12 }}></div><Sk w={64} h={26} /></div>
              <Sk w={150} h={48} r={8} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.OverviewScanning = OverviewScanning;

const LOAD_STEPS = [
  "Leyendo el contenido de vela.io",
  "Ejecutando 64 prompts en 4 motores",
  "Extrayendo menciones y citas",
  "Comparando con 5 competidores",
  "Calculando la puntuación de visibilidad GEO",
  "Generando recomendaciones",
];

function LoadingState({ onDone, domain = "vela.io", title, body, steps: customSteps, interval = 1100 }) {
  const steps = customSteps || [
    "Leyendo el contenido de " + domain,
    "Ejecutando 64 prompts en 4 motores",
    "Extrayendo menciones y citas",
    "Comparando con 5 competidores",
    "Calculando la puntuación de visibilidad GEO",
    "Generando recomendaciones",
  ];
  const [step, setStep] = useStateS(0);
  useEffectS(() => {
    if (step >= steps.length) { const t = setTimeout(onDone, 600); return () => clearTimeout(t); }
    const t = setTimeout(() => setStep(s => s + 1), interval);
    return () => clearTimeout(t);
  }, [step]);
  const pct = Math.min(100, Math.round((step / steps.length) * 100));
  return (
    <div className="state-wrap fade-in">
      <div className="state-card">
        <div className="state-ico"><div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} /></div>
        <div className="state-title">{title || "Escaneo de visibilidad en curso"}</div>
        <div className="state-body">{body || "Esto suele tardar un par de minutos. Puedes salir de esta página — seguiremos trabajando."}</div>
        <div className="load-steps">
          {steps.map((s, i) => (
            <div key={i} className={"load-step " + (i < step ? "done" : i === step ? "active" : "")}>
              <span className="ls-ico">
                {i < step ? <Icon name="check" size={13} sw={2.4} /> : i === step ? <div className="spinner" /> : <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)" }}>{i + 1}</span>}
              </span>
              {s}{i === step && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--accent-ink)", fontWeight: 600 }}>trabajando…</span>}
            </div>
          ))}
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: pct + "%" }} /></div>
        <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 10, fontFamily: "var(--mono)" }}>{pct}% · {Math.min(step + 1, steps.length)} de {steps.length} pasos</div>
      </div>
    </div>
  );
}

function ErrorState({ onRetry, onView }) {
  return (
    <div className="state-wrap fade-in">
      <div className="state-card">
        <div className="state-ico err"><Icon name="alert" size={28} /></div>
        <div className="state-title">No se pudo completar el escaneo</div>
        <div className="state-body">
          <b style={{ color: "var(--ink-2)" }}>58 de 64 prompts</b> se ejecutaron correctamente. 6 prompts fallaron durante la ejecución —
          se conservaron las respuestas en bruto y los registros donde fue posible. Los resultados parciales siguen siendo útiles.
        </div>
        <div className="state-actions">
          <button className="btn btn-primary btn-lg" onClick={onRetry}><Icon name="refresh" size={16} />Reintentar prompts fallidos</button>
          <button className="btn btn-ghost btn-lg" onClick={onView}><Icon name="runs" size={16} />Ver detalles del escaneo</button>
        </div>
        <div className="card" style={{ marginTop: 26, textAlign: "left", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 650, color: "var(--ink-2)" }}>
            <Icon name="alertCircle" size={15} style={{ color: "var(--neg)" }} />Fallaron: límite de tasa de Perplexity (5) · Timeout (1)
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 6, lineHeight: 1.5, fontFamily: "var(--mono)" }}>
            escaneo n.º7 · 2026-05-28 14:22 UTC · reintento disponible
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderRoute({ route }) {
  const map = {
    prompts: { icon: "prompts", title: "Explorador de prompts", body: "Explora cada prompt monitorizado — ve quién se menciona, quién se cita, el sentimiento y la oportunidad. Se diseñará en una iteración posterior." },
    competitors: { icon: "competitors", title: "Competidores", body: "Gestiona los competidores monitorizados y compara mención, cita y cuota de voz frente a tu marca. Se diseñará en una iteración posterior." },
    runs: { icon: "runs", title: "Escaneos", body: "Historial completo de escaneos con estado, número de prompts y puntuaciones por escaneo. Se diseñará en una iteración posterior." },
    solutions: { icon: "solutions", title: "Soluciones generadas", body: "Una biblioteca de soluciones generadas con IA que has creado a partir de recomendaciones. Se desbloquea tras tu primera generación." },
  };
  const m = map[route] || map.prompts;
  return (
    <div className="ph-route fade-in">
      <div className="ph-inner">
        <div className="ph-ico"><Icon name={m.icon} size={26} /></div>
        <div style={{ fontSize: 18, fontWeight: 750 }}>{m.title}</div>
        <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.6 }}>{m.body}</div>
        <div style={{ margintop: 16, marginTop: 18 }}><Badge tone="accent">En esta iteración: Visión general + Recomendaciones</Badge></div>
      </div>
    </div>
  );
}

Object.assign(window, { EmptyState, LoadingState, ErrorState, PlaceholderRoute });
