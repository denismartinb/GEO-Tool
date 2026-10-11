import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/admin/operator";
import { PANEL_PERIODS, panelWindow, parsePanelPeriod } from "@/lib/admin/kpi/period";
import { loadWebSection, type WebSection } from "@/lib/admin/kpi/posthog";
import { loadBusinessSections, type AccountsSection, type RevenueSection } from "@/lib/admin/kpi/business";
import { loadGoogleSection, type GoogleSection } from "@/lib/admin/kpi/google";
import {
  buildFunnel,
  describeDelta,
  formatEuros,
  formatInt,
  formatShare,
  linePoints,
  type DeltaView,
  type FunnelStepInput
} from "@/lib/admin/kpi/model";
import { refreshAdminPanel } from "./actions";

export const metadata: Metadata = { title: "Panel — Consola de operador" };

/** The sprint goal set by the founder: first paid subscription before this date (Madrid). */
const SPRINT_GOAL_DEADLINE = "2026-10-24T23:59:59+02:00";

const timeFormat = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const dayFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * ADMIN-PANEL-1 — business, marketing and web KPIs in one place. Read-only:
 * PostHog (visits, channels, pages, web vitals), Supabase (accounts and
 * trials), Stripe (checkouts and money) and Search Console (genscore.es).
 * Design approved 2026-10-11, `docs/design-reference/admin-panel-1/`.
 */
export default async function AdminPanelPage({ searchParams }: { searchParams: Promise<{ periodo?: string | string[] }> }) {
  const { service, user } = await requireOperator("/admin/panel");
  const period = parsePanelPeriod((await searchParams).periodo);
  const now = new Date();
  const window = panelWindow(period, now);

  const [web, business, google] = await Promise.all([
    loadWebSection(window, now),
    loadBusinessSections({ service, window, now }),
    loadGoogleSection(service, user.id)
  ]);
  const { accounts, revenue } = business;

  return (
    <main className="adm-main adm-pn">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Panel de negocio</h1>
          <p className="adm-sub">
            {web.kind === "ready" ? `Datos web hasta las ${timeFormat.format(new Date(web.asOf))} · ` : ""}
            PostHog, Stripe, Supabase y Search Console · sin cuentas propias ni de prueba
          </p>
        </div>
        <div className="adm-pn-controls">
          <nav className="adm-pn-seg" aria-label="Periodo">
            {PANEL_PERIODS.map((p) => (
              <Link
                key={p.id}
                href={`/admin/panel?periodo=${p.id}`}
                className={p.id === period ? "adm-pn-seg-on" : undefined}
                aria-current={p.id === period ? "page" : undefined}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <form action={refreshAdminPanel}>
            <input type="hidden" name="periodo" value={period} />
            <button type="submit" className="adm-pn-btn">
              Actualizar
            </button>
          </form>
        </div>
      </div>

      <SprintGoal now={now} revenue={revenue} accounts={accounts} />
      <KpiRow web={web} accounts={accounts} revenue={revenue} />

      <div className="adm-pn-row">
        <FunnelCard web={web} accounts={accounts} revenue={revenue} periodLabel={window.label} />
        <TrialsCard accounts={accounts} />
      </div>

      <DailyChart web={web} accounts={accounts} />

      <div className="adm-pn-row">
        <ChannelsCard web={web} />
        <EntryPagesCard web={web} />
      </div>

      <div className="adm-pn-grid3">
        <GoogleCard google={google} />
        <VitalsCard web={web} />
        <RevenueCard revenue={revenue} />
      </div>
    </main>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Source({ children }: { children: React.ReactNode }) {
  return <span className="adm-pn-src">{children}</span>;
}

function CardHead({ title, source }: { title: string; source: string }) {
  return (
    <div className="adm-pn-ch">
      <h2>{title}</h2>
      <Source>{source}</Source>
    </div>
  );
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return <p className="adm-pn-empty">{children}</p>;
}

function webUnavailable(web: WebSection): string {
  return web.kind === "not_configured"
    ? "PostHog no está conectado: faltan POSTHOG_PERSONAL_API_KEY y POSTHOG_PROJECT_ID en Vercel."
    : "No se pudo leer PostHog esta vez. Pulsa Actualizar en un momento.";
}

function revenueUnavailable(revenue: RevenueSection): string {
  return revenue.kind === "not_configured" ? "Stripe no está configurado en este entorno." : "No se pudo leer Stripe esta vez.";
}

function DeltaLine({ delta, fallback }: { delta: DeltaView | null; fallback?: string }) {
  if (!delta) return <span className="adm-pn-mut">{fallback ?? "sin periodo anterior con datos"}</span>;
  return <span className={`adm-pn-${delta.tone}`}>{delta.text}</span>;
}

function SprintGoal({ now, revenue, accounts }: { now: Date; revenue: RevenueSection; accounts: AccountsSection }) {
  const daysToGo = Math.max(0, Math.ceil((Date.parse(SPRINT_GOAL_DEADLINE) - now.getTime()) / 86_400_000));
  const paying = revenue.kind === "ready" ? revenue.activeSubscriptions : null;
  const progress = paying === null ? 0 : Math.min(100, paying * 100);
  return (
    <section className="adm-pn-goal" aria-label="Objetivo del sprint">
      <div className="adm-pn-goal-main">
        <div className="adm-pn-goal-kicker">Objetivo del sprint</div>
        <div className="adm-pn-goal-title">Primera suscripción de pago antes del 24 de octubre</div>
        <div className="adm-pn-goal-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(progress, 3)}%` }} />
        </div>
        <div className="adm-pn-goal-note">
          {paying === null ? "Stripe sin leer" : `${formatInt(paying)} de 1 suscripciones`}
          {revenue.kind === "ready" ? ` · ${formatInt(revenue.checkoutsStarted)} checkouts en el periodo` : ""}
          {accounts.kind === "ready" ? ` · ${formatInt(accounts.activeTrials)} pruebas Pro en curso` : ""}
        </div>
      </div>
      <div className="adm-pn-goal-stat">
        <span>Quedan</span>
        <strong>{daysToGo === 1 ? "1 día" : `${daysToGo} días`}</strong>
      </div>
      <div className="adm-pn-goal-stat">
        <span>MRR</span>
        <strong>{revenue.kind === "ready" ? formatEuros(revenue.mrrCents) : "—"}</strong>
      </div>
      <div className="adm-pn-goal-stat">
        <span>Plazas precio fundador</span>
        <strong>
          {revenue.kind === "ready" && revenue.founderRemaining > 0 ? (
            <>
              {formatInt(revenue.founderRemaining)} <small>de {formatInt(revenue.founderTotal)}</small>
            </>
          ) : revenue.kind === "ready" ? (
            "Cerrado"
          ) : (
            "—"
          )}
        </strong>
      </div>
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <svg className="adm-pn-spark" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={linePoints(values, 120, 36)} />
    </svg>
  );
}

function Kpi(props: { label: string; source: string; value: string; delta?: React.ReactNode; spark?: number[] }) {
  return (
    <div className="adm-pn-card adm-pn-kpi">
      <div className="adm-pn-kpi-top">
        <span className="adm-pn-lbl">{props.label}</span>
        <Source>{props.source}</Source>
      </div>
      <div className="adm-pn-big">{props.value}</div>
      <div className="adm-pn-kpi-foot">
        <span className="adm-pn-kpi-delta">{props.delta}</span>
        {props.spark ? <Sparkline values={props.spark} /> : null}
      </div>
    </div>
  );
}

function KpiRow({ web, accounts, revenue }: { web: WebSection; accounts: AccountsSection; revenue: RevenueSection }) {
  const visits = web.kind === "ready" ? web.totals.visits : null;
  const signups = accounts.kind === "ready" ? accounts.signups : null;
  const last14 = <T,>(list: T[]) => list.slice(-14);
  return (
    <div className="adm-pn-kpis">
      <Kpi
        label="Visitas"
        source="PostHog"
        value={visits === null ? "—" : formatInt(visits)}
        delta={web.kind === "ready" ? <DeltaLine delta={describeDelta(web.totals.visits, web.totals.previousVisits)} /> : <span className="adm-pn-mut">sin datos</span>}
        spark={web.kind === "ready" ? last14(web.daily).map((d) => d.visits) : undefined}
      />
      <Kpi
        label="Altas"
        source="Supabase"
        value={signups === null ? "—" : formatInt(signups)}
        delta={accounts.kind === "ready" ? <DeltaLine delta={describeDelta(accounts.signups, accounts.previousSignups)} /> : <span className="adm-pn-mut">sin datos</span>}
        spark={accounts.kind === "ready" ? last14(accounts.dailySignups).map((d) => d.signups) : undefined}
      />
      <Kpi
        label="Visita → alta"
        source="aprox."
        value={visits && signups !== null ? formatShare(signups / visits) : "—"}
        delta={<span className="adm-pn-mut">altas entre visitas del periodo</span>}
      />
      <Kpi
        label="Pruebas Pro activas"
        source="Supabase"
        value={accounts.kind === "ready" ? formatInt(accounts.activeTrials) : "—"}
        delta={
          accounts.kind === "ready" ? (
            <span className={accounts.trialsEndingIn7Days > 0 ? "adm-pn-down" : "adm-pn-mut"}>
              {formatInt(accounts.trialsEndingIn7Days)} acaban en 7 días
            </span>
          ) : null
        }
      />
      <Kpi
        label="Search Console"
        source="Supabase"
        value={accounts.kind === "ready" && accounts.searchConsole ? formatInt(accounts.searchConsole.connectedAccounts) : "—"}
        delta={
          accounts.kind === "ready" && accounts.searchConsole ? (
            <span className="adm-pn-mut">
              {formatInt(accounts.searchConsole.connectedInWindow)} en el periodo ·{" "}
              {accounts.searchConsole.totalAccounts > 0
                ? formatShare(accounts.searchConsole.connectedAccounts / accounts.searchConsole.totalAccounts)
                : "—"}{" "}
              de las cuentas
            </span>
          ) : accounts.kind === "ready" ? (
            <span className="adm-pn-mut">no se pudo leer</span>
          ) : null
        }
      />
      <Kpi
        label="Checkouts iniciados"
        source="Stripe"
        value={revenue.kind === "ready" ? formatInt(revenue.checkoutsStarted) : "—"}
        delta={revenue.kind === "ready" ? <span className="adm-pn-mut">{formatInt(revenue.checkoutsCompleted)} terminados</span> : null}
      />
      <Kpi
        label="Suscripciones de pago"
        source="Stripe"
        value={revenue.kind === "ready" ? formatInt(revenue.activeSubscriptions) : "—"}
        delta={revenue.kind === "ready" ? <span className="adm-pn-mut">MRR {formatEuros(revenue.mrrCents)}</span> : null}
      />
    </div>
  );
}

function FunnelCard(props: { web: WebSection; accounts: AccountsSection; revenue: RevenueSection; periodLabel: string }) {
  const { web, accounts, revenue } = props;
  const inputs: FunnelStepInput[] = [
    { label: "Visitas", value: web.kind === "ready" ? web.totals.visits : null, source: "PostHog" },
    { label: "Altas", value: accounts.kind === "ready" ? accounts.signups : null, source: "Supabase" },
    { label: "Primer escaneo", value: accounts.kind === "ready" ? accounts.firstScan : null, source: "Supabase" },
    { label: "Checkout iniciado", value: revenue.kind === "ready" ? revenue.checkoutsStarted : null, source: "Stripe" },
    { label: "Pago", value: revenue.kind === "ready" ? revenue.checkoutsCompleted : null, source: "Stripe" }
  ];
  const funnel = buildFunnel(inputs);
  const leak = funnel.biggestLeak === null ? null : funnel.steps[funnel.biggestLeak];
  const leakFrom = funnel.biggestLeak === null ? null : funnel.steps[funnel.biggestLeak - 1];
  return (
    <section className="adm-pn-card adm-pn-wide">
      <CardHead title={`Embudo · ${props.periodLabel.toLowerCase()}`} source="PostHog · Supabase · Stripe" />
      <div className="adm-pn-funnel">
        {funnel.steps.map((step, i) => (
          <div key={step.label} className="adm-pn-fstep">
            <div className="adm-pn-flabel">
              {step.label}
              <small>{step.source}</small>
            </div>
            <div className="adm-pn-fbar">
              <span
                className={i === funnel.biggestLeak ? "adm-pn-fbar-leak" : undefined}
                style={{ width: `${step.value ? Math.max(step.width, 1.5) : 0}%` }}
              />
            </div>
            <div className="adm-pn-fval">
              <strong>{step.value === null ? "—" : formatInt(step.value)}</strong>
              {step.stepRate !== null ? <span>{formatShare(step.stepRate)}</span> : null}
            </div>
          </div>
        ))}
      </div>
      {leak && leakFrom ? (
        <p className="adm-pn-callout">
          <strong>Mayor fuga</strong>
          <span>
            De «{leakFrom.label.toLowerCase()}» a «{leak.label.toLowerCase()}» pasa el {formatShare(leak.stepRate ?? 0)}.
          </span>
        </p>
      ) : null}
      <p className="adm-pn-foot">
        Las altas de un periodo son las cuentas creadas en él; «primer escaneo» cuenta las que ya tienen uno completado. Visitas y
        altas no comparten identificador (la analítica es sin cookies), así que la primera tasa es aproximada.
      </p>
    </section>
  );
}

function TrialsCard({ accounts }: { accounts: AccountsSection }) {
  return (
    <section className="adm-pn-card adm-pn-side">
      <CardHead title="Pruebas Pro en curso" source="Supabase · Stripe" />
      {accounts.kind !== "ready" ? (
        <Unavailable>No se pudieron leer las cuentas esta vez.</Unavailable>
      ) : accounts.trials.length === 0 ? (
        <Unavailable>No hay ninguna prueba Pro en curso.</Unavailable>
      ) : (
        <>
          <p className="adm-pn-mut adm-pn-intro">Ordenadas por los días que les quedan.</p>
          <div className="adm-table-wrap">
            <table className="adm-table adm-pn-table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="adm-num">Quedan</th>
                  <th>Señal</th>
                </tr>
              </thead>
              <tbody>
                {accounts.trials.slice(0, 8).map((t) => (
                  <tr key={t.id}>
                    <td className="adm-pn-cell-main">
                      <strong>{t.domain ?? "Sin dominio"}</strong>
                      <small>{t.email}</small>
                    </td>
                    <td className="adm-num">{t.daysLeft === 1 ? "1 día" : `${t.daysLeft} días`}</td>
                    <td>
                      <span className={`adm-pn-pill adm-pn-pill-${t.signal.tone}`}>{t.signal.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/admin/users?status=trial" className="adm-pn-link">
            {accounts.trials.length > 8 ? `Ver las ${accounts.trials.length} en Usuarios` : "Abrir en Usuarios"}
          </Link>
        </>
      )}
      {accounts.kind === "ready" && accounts.authUsersTruncated ? (
        <p className="adm-note">Hay más cuentas de las que se leen de una vez: las cifras de cuentas pueden quedarse cortas.</p>
      ) : null}
    </section>
  );
}

function DailyChart({ web, accounts }: { web: WebSection; accounts: AccountsSection }) {
  if (web.kind !== "ready") {
    return (
      <section className="adm-pn-card">
        <CardHead title="Visitas y altas por día · últimos 28 días" source="PostHog · Supabase" />
        <Unavailable>{webUnavailable(web)}</Unavailable>
      </section>
    );
  }
  const visits = web.daily.map((d) => d.visits);
  const signups = accounts.kind === "ready" ? accounts.dailySignups.map((d) => d.signups) : null;
  const peakIndex = visits.indexOf(Math.max(...visits));
  const peak = web.daily[peakIndex];
  const ticks = [0, 7, 14, 21, web.daily.length - 1].filter((i) => web.daily[i]);
  const visitsPoints = linePoints(visits, 1000, 200);
  return (
    <section className="adm-pn-card">
      <div className="adm-pn-ch">
        <h2>Visitas y altas por día · últimos 28 días</h2>
        <div className="adm-pn-legend">
          <span>
            <i className="adm-pn-key-visits" />
            Visitas
          </span>
          {signups ? (
            <span>
              <i className="adm-pn-key-signups" />
              Altas (escala propia)
            </span>
          ) : null}
          <Source>PostHog · Supabase</Source>
        </div>
      </div>
      <svg className="adm-pn-chart" viewBox="0 0 1000 200" preserveAspectRatio="none" role="img" aria-label="Visitas y altas diarias de los últimos 28 días">
        <line x1="0" y1="196" x2="1000" y2="196" className="adm-pn-axis" />
        <polygon points={`0,196 ${visitsPoints} 1000,196`} className="adm-pn-area" />
        <polyline points={visitsPoints} className="adm-pn-line-visits" />
        {signups ? <polyline points={linePoints(signups, 1000, 200)} className="adm-pn-line-signups" /> : null}
      </svg>
      <div className="adm-pn-ticks">
        {ticks.map((i) => (
          <span key={i}>{dayFormat.format(new Date(`${web.daily[i].date}T12:00:00Z`))}</span>
        ))}
      </div>
      {peak && peak.visits > 0 ? (
        <p className="adm-pn-foot">
          Día con más visitas: {dayFormat.format(new Date(`${peak.date}T12:00:00Z`))}, {formatInt(peak.visits)} visitas
          {signups ? ` y ${formatInt(signups[peakIndex] ?? 0)} altas` : ""}.
        </p>
      ) : null}
    </section>
  );
}

function ChannelsCard({ web }: { web: WebSection }) {
  return (
    <section className="adm-pn-card adm-pn-half">
      <CardHead title="Canales de adquisición" source="PostHog · utm_source y referente" />
      {web.kind !== "ready" ? (
        <Unavailable>{webUnavailable(web)}</Unavailable>
      ) : web.channels.length === 0 ? (
        <Unavailable>Ninguna visita en este periodo.</Unavailable>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table adm-pn-table">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Visitas</th>
                <th className="adm-num">Cuota</th>
              </tr>
            </thead>
            <tbody>
              {web.channels.map((c) => (
                <tr key={c.id}>
                  <td className="adm-pn-cell-main">
                    <strong>{c.label}</strong>
                  </td>
                  <td>
                    <div className="adm-pn-hbar">
                      <span style={{ width: `${Math.max(c.share * 100, 2)}%` }} />
                      <em>{formatInt(c.visits)}</em>
                    </div>
                  </td>
                  <td className="adm-num">{formatShare(c.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="adm-pn-foot">
        Las altas no guardan de qué canal vienen, así que aquí sólo hay visitas. «Asistentes de IA» agrupa chatgpt.com,
        perplexity.ai, gemini.google.com y claude.ai.
      </p>
    </section>
  );
}

function EntryPagesCard({ web }: { web: WebSection }) {
  return (
    <section className="adm-pn-card adm-pn-half">
      <CardHead title="Páginas de entrada" source="PostHog" />
      {web.kind !== "ready" ? (
        <Unavailable>{webUnavailable(web)}</Unavailable>
      ) : web.entryPages.length === 0 ? (
        <Unavailable>Ninguna visita en este periodo.</Unavailable>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table adm-pn-table">
            <thead>
              <tr>
                <th>Primera página de la visita</th>
                <th className="adm-num">Visitas</th>
              </tr>
            </thead>
            <tbody>
              {web.entryPages.map((p) => (
                <tr key={p.path}>
                  <td className="adm-pn-path">{p.path || "/"}</td>
                  <td className="adm-num">{formatInt(p.visits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {web.kind === "ready" ? (
        <p className="adm-pn-foot">
          {formatInt(web.totals.spainVisits)} de {formatInt(web.totals.visits)} visitas desde España.
        </p>
      ) : null}
    </section>
  );
}

function GoogleCard({ google }: { google: GoogleSection }) {
  let body: React.ReactNode;
  if (google.kind === "no_project") {
    body = <Unavailable>No hay un proyecto de genscore.es en tu cuenta con Search Console conectado.</Unavailable>;
  } else if (google.kind === "state") {
    const s = google.state;
    body = (
      <Unavailable>
        {s.kind === "disconnected"
          ? "Search Console no está conectado en tu proyecto de genscore.es."
          : s.kind === "reconnect"
            ? "Hay que volver a conectar Search Console en tu proyecto de genscore.es."
            : s.kind === "not_configured" || s.kind === "unavailable"
              ? "Search Console no está disponible en este entorno."
              : s.kind === "pick_property"
                ? "Elige la propiedad de Search Console en tu proyecto de genscore.es."
                : "No se pudo leer Google esta vez."}
      </Unavailable>
    );
  } else if (google.report.empty) {
    body = <Unavailable>Google no tiene impresiones de genscore.es en los últimos 28 días.</Unavailable>;
  } else {
    const r = google.report;
    body = (
      <>
        <div className="adm-pn-mini">
          <div>
            <span className="adm-pn-lbl">Clics</span>
            <strong>{formatInt(r.clicks.value)}</strong>
            <DeltaPct pct={r.clicks.deltaPct} />
          </div>
          <div>
            <span className="adm-pn-lbl">Puesto medio</span>
            <strong>{r.position.value === null ? "—" : r.position.value.toFixed(1).replace(".", ",")}</strong>
            {r.position.delta !== null && Math.abs(r.position.delta) >= 0.1 ? (
              <span className={r.position.delta > 0 ? "adm-pn-up" : "adm-pn-down"}>
                {r.position.delta > 0 ? "sube" : "baja"} {Math.abs(r.position.delta).toFixed(1).replace(".", ",")}
              </span>
            ) : (
              <span className="adm-pn-mut">estable</span>
            )}
          </div>
          <div>
            <span className="adm-pn-lbl">En la página 2</span>
            <strong>{formatInt(r.nearPage1.length)}</strong>
            <span className="adm-pn-mut">búsquedas</span>
          </div>
        </div>
        {r.nearPage1.length > 0 ? (
          <p className="adm-pn-foot">
            Más cerca de la página 1: {r.nearPage1.slice(0, 3).map((q) => `«${q.query}»`).join(", ")}
          </p>
        ) : null}
      </>
    );
  }
  return (
    <section className="adm-pn-card">
      <CardHead title="Google · genscore.es" source="Search Console · 28 días" />
      {body}
    </section>
  );
}

function DeltaPct({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="adm-pn-mut">sin comparación</span>;
  const rounded = Math.round(pct);
  if (rounded === 0) return <span className="adm-pn-mut">igual</span>;
  return <span className={rounded > 0 ? "adm-pn-up" : "adm-pn-down"}>{`${rounded > 0 ? "+" : "−"}${Math.abs(rounded)} %`}</span>;
}

function VitalsCard({ web }: { web: WebSection }) {
  return (
    <section className="adm-pn-card">
      <CardHead title="Experiencia web" source="PostHog · web vitals" />
      {web.kind !== "ready" ? (
        <Unavailable>{webUnavailable(web)}</Unavailable>
      ) : (
        <>
          {web.vitals.length === 0 ? (
            <Unavailable>Sin mediciones de velocidad en este periodo.</Unavailable>
          ) : (
            <div className="adm-pn-vitals">
              {web.vitals.map((v) => (
                <div key={v.key}>
                  <div className="adm-pn-vital-head">
                    <span>{v.label}</span>
                    <strong>{formatShare(v.good, 0)} buenas</strong>
                  </div>
                  <div className="adm-pn-vital-bar" aria-hidden="true">
                    <span className="adm-pn-v-good" style={{ width: `${v.good * 100}%` }} />
                    <span className="adm-pn-v-mid" style={{ width: `${v.mid * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="adm-pn-foot adm-pn-inline">
            <span>
              <strong>{web.totals.visits > 0 ? formatShare(web.totals.mobile / web.totals.visits, 0) : "—"}</strong> móvil
            </span>
            <span>
              <strong>{web.totals.visits > 0 ? formatShare(web.totals.desktop / web.totals.visits, 0) : "—"}</strong> escritorio
            </span>
            <span>
              <strong>{formatInt(web.totals.rageClicks)}</strong> clics de rabia
            </span>
          </p>
        </>
      )}
    </section>
  );
}

function RevenueCard({ revenue }: { revenue: RevenueSection }) {
  return (
    <section className="adm-pn-card">
      <CardHead title="Ingresos" source="Stripe" />
      {revenue.kind !== "ready" ? (
        <Unavailable>{revenueUnavailable(revenue)}</Unavailable>
      ) : (
        <>
          <div className="adm-pn-mini adm-pn-mini-2">
            <div>
              <span className="adm-pn-lbl">MRR</span>
              <strong>{formatEuros(revenue.mrrCents)}</strong>
            </div>
            <div>
              <span className="adm-pn-lbl">Suscripciones</span>
              <strong>{formatInt(revenue.activeSubscriptions)}</strong>
            </div>
            <div>
              <span className="adm-pn-lbl">Checkouts sin terminar</span>
              <strong>{formatInt(Math.max(0, revenue.checkoutsStarted - revenue.checkoutsCompleted))}</strong>
            </div>
            <div>
              <span className="adm-pn-lbl">Cobrado este mes</span>
              <strong>{formatEuros(revenue.collectedThisMonthCents)}</strong>
            </div>
          </div>
          <p className="adm-pn-foot">
            IVA incluido. El MRR suma la última factura de cada suscripción activa, llevada a un mes.
          </p>
          {revenue.truncated ? <p className="adm-note">Stripe devolvió más de 500 elementos en alguna lista: las cifras pueden quedarse cortas.</p> : null}
        </>
      )}
    </section>
  );
}
