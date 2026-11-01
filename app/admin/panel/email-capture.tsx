import { CATEGORY_COPY } from "@/lib/email/categories";
import type { EmailSection } from "@/lib/admin/kpi/email";
import { formatRate, UNSUB_CATEGORIES, UNSUB_SOURCES, type ContactDay } from "@/lib/admin/kpi/email-model";
import { describeDelta, formatInt, formatShare } from "@/lib/admin/kpi/model";
import { CardHead, DeltaLine, Kpi, Source, Unavailable } from "./pieces";

const dayFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * ADMIN-EMAIL-1 — «Captación de email» in /admin/panel: contacts, unsubscribes
 * and emails sent. Design approved by Denis on 2026-11-01
 * (`docs/design-reference/admin-email-1/`). Every unreadable source says so;
 * none becomes a zero (`.claude/rules/admin.md`).
 */
const UNSUB_SOURCE_LABEL: Record<string, string> = {
  email_link: "enlace del correo",
  one_click: "un clic en el gestor de correo",
  settings: "Ajustes"
};

function sendingUnavailable(kind: "not_configured" | "restricted" | "error"): string {
  if (kind === "not_configured") return "Resend no está configurado en este entorno.";
  if (kind === "restricted")
    return "La clave de Resend de Vercel solo puede enviar. Para leer los envíos hace falta una clave con acceso completo (RESEND_API_KEY).";
  return "No se pudo leer Resend esta vez. Pulsa Actualizar en un momento.";
}

export function EmailCapture({ email, periodLabel }: { email: EmailSection; periodLabel: string }) {
  if (email.kind !== "ready") {
    return (
      <section className="adm-pn-card">
        <CardHead title={`Captación de email · ${periodLabel.toLowerCase()}`} source="Supabase · Resend" />
        <Unavailable>No se pudieron leer las cuentas esta vez.</Unavailable>
      </section>
    );
  }
  const { contacts, unsubscribes, sending, lifecycleSubscribed } = email;
  const sendingReady = sending.kind === "ready" ? sending : null;
  const trackingOn = sendingReady?.tracking === "on";
  const delivered = sendingReady?.totals.delivered ?? 0;

  return (
    <section className="adm-pn-email" aria-labelledby="adm-pn-email-h">
      <div className="adm-pn-ch adm-pn-email-head">
        <div>
          <h2 id="adm-pn-email-h">Captación de email · {periodLabel.toLowerCase()}</h2>
          <p className="adm-pn-mut">Contactos, bajas y correos enviados, sin cuentas propias ni de prueba</p>
        </div>
        <Source>Supabase · Resend</Source>
      </div>

      <div className="adm-pn-kpis adm-pn-kpis-5">
        <Kpi
          label="Contactos"
          source="Supabase"
          value={formatInt(contacts.total)}
          delta={
            <span className="adm-pn-kpi-lines">
              <span className={contacts.addedInWindow > 0 ? "adm-pn-up" : "adm-pn-mut"}>+{formatInt(contacts.addedInWindow)} en el periodo</span>
              <DeltaLine delta={describeDelta(contacts.addedInWindow, contacts.addedPrevious)} />
            </span>
          }
          spark={contacts.daily.slice(-14).map((d) => d.total)}
        />
        <Kpi
          label="Reciben consejos y ofertas"
          source="Supabase"
          value={lifecycleSubscribed === null || contacts.total === 0 ? "—" : formatShare(lifecycleSubscribed / contacts.total, 0)}
          delta={
            <span className="adm-pn-mut">
              {lifecycleSubscribed === null
                ? "no se pudo leer"
                : `${formatInt(lifecycleSubscribed)} de ${formatInt(contacts.total)} siguen suscritos`}
            </span>
          }
        />
        <Kpi
          label="Bajas"
          source="Supabase"
          value={unsubscribes ? formatInt(unsubscribes.inWindow) : "—"}
          delta={
            unsubscribes ? (
              <span className="adm-pn-kpi-lines">
                <UnsubDelta current={unsubscribes.inWindow} previous={unsubscribes.previous} />
                {sendingReady && sendingReady.windowCovered && delivered > 0 ? (
                  <span className="adm-pn-mut">{formatShare(unsubscribes.inWindow / delivered)} de los entregados</span>
                ) : null}
              </span>
            ) : (
              <span className="adm-pn-mut">no se pudo leer</span>
            )
          }
        />
        <Kpi
          label="Emails por contacto y semana"
          source="Resend"
          value={sendingReady && sendingReady.perContactWeek !== null ? formatRate(sendingReady.perContactWeek) : "—"}
          delta={
            sendingReady ? (
              <span className="adm-pn-kpi-lines">
                {sendingReady.perContactWeekPrevious !== null && sendingReady.perContactWeek !== null ? (
                  <RateDelta current={sendingReady.perContactWeek} previous={sendingReady.perContactWeekPrevious} />
                ) : (
                  <span className="adm-pn-mut">Resend guarda 30 días: sin periodo anterior</span>
                )}
                <span className="adm-pn-mut">{formatInt(sendingReady.totals.sent)} enviados en el periodo</span>
              </span>
            ) : (
              <span className="adm-pn-mut">{sending.kind === "not_configured" ? "Resend no configurado" : "sin datos de Resend"}</span>
            )
          }
        />
        <Kpi
          label="Apertura · clics"
          source="Resend"
          value={
            sendingReady && trackingOn && delivered > 0
              ? `${formatShare(sendingReady.totals.opened / delivered, 0)} · ${formatShare(sendingReady.totals.clicked / delivered, 0)}`
              : "—"
          }
          delta={
            sendingReady ? (
              <span className="adm-pn-mut">
                {sendingReady.tracking === "off"
                  ? "Seguimiento apagado en Resend"
                  : sendingReady.tracking === "unknown"
                    ? "Sin aperturas registradas: el seguimiento puede estar apagado en Resend"
                    : `de los entregados · ${formatInt(sendingReady.totals.bounced)} rebotes`}
              </span>
            ) : null
          }
        />
      </div>

      <div className="adm-pn-row">
        <ContactsChart days={contacts.daily} unsubscribesKnown={unsubscribes !== null} />
        <UnsubscribesCard unsubscribes={unsubscribes} />
      </div>

      <section className="adm-pn-card">
        <CardHead title="Correos enviados por tipo" source="Resend" />
        {!sendingReady ? (
          <Unavailable>{sendingUnavailable(sending.kind as "not_configured" | "restricted" | "error")}</Unavailable>
        ) : (
          <>
            <div className="adm-table-wrap">
              <table className="adm-table adm-pn-table adm-pn-email-table">
                <thead>
                  <tr>
                    <th>Correo</th>
                    <th className="adm-num">Enviados</th>
                    <th className="adm-num">Entregados</th>
                    <th className="adm-num">Abiertos</th>
                    <th className="adm-num">Clics</th>
                    <th className="adm-num">Rebotes</th>
                  </tr>
                </thead>
                <tbody>
                  {sendingReady.groups.map((g) => (
                    <tr key={g.id}>
                      <td className="adm-pn-cell-main">
                        <strong>{g.label}</strong>
                        {g.detail ? <small>{g.detail}</small> : null}
                      </td>
                      <td className="adm-num">{formatInt(g.sent)}</td>
                      <td className="adm-num">{formatInt(g.delivered)}</td>
                      <td className="adm-num">{trackingOn ? formatInt(g.opened) : "—"}</td>
                      <td className="adm-num">{trackingOn ? formatInt(g.clicked) : "—"}</td>
                      <td className="adm-num">{formatInt(g.bounced)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="adm-pn-foot">
              Solo correos a contactos: los avisos al operador y las respuestas a formularios no cuentan. Resend da el último estado de cada
              correo, así que un correo con clic cuenta también como abierto.
              {sendingReady.windowCovered ? "" : " Resend solo guarda 30 días: el periodo empieza antes y las cifras se quedan cortas."}
            </p>
            {sendingReady.truncated ? (
              <p className="adm-note">Hay más correos de los que se leen de una vez: las cifras de envíos pueden quedarse cortas.</p>
            ) : null}
          </>
        )}
      </section>
      {email.authUsersTruncated ? (
        <p className="adm-note">Hay más cuentas de las que se leen de una vez: los contactos pueden quedarse cortos.</p>
      ) : null}
    </section>
  );
}

/** More unsubscribes is bad news, so the tone runs the other way from `describeDelta`. */
function UnsubDelta({ current, previous }: { current: number; previous: number }) {
  if (current === previous) return <span className="adm-pn-flat">igual que el periodo anterior</span>;
  const diff = current - previous;
  return (
    <span className={diff > 0 ? "adm-pn-down" : "adm-pn-up"}>
      {diff > 0 ? "+" : "−"}
      {formatInt(Math.abs(diff))} vs periodo anterior
    </span>
  );
}

function RateDelta({ current, previous }: { current: number; previous: number }) {
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return <span className="adm-pn-flat">igual que el periodo anterior</span>;
  return (
    <span className="adm-pn-flat">
      {diff > 0 ? "+" : "−"}
      {formatRate(Math.abs(diff))} vs periodo anterior
    </span>
  );
}

function ContactsChart({ days, unsubscribesKnown }: { days: ContactDay[]; unsubscribesKnown: boolean }) {
  const totals = days.map((d) => d.total);
  const lo = Math.max(0, Math.min(...totals) - 1);
  const hi = Math.max(...totals, lo + 1);
  const topEvents = Math.max(1, ...days.map((d) => Math.max(d.added, unsubscribesKnown ? d.unsubscribed : 0)));
  const w = 1000;
  const h = 200;
  const step = days.length > 1 ? w / (days.length - 1) : 0;
  const yTotal = (v: number) => 16 + (1 - (v - lo) / (hi - lo)) * 120;
  const points = totals.map((v, i) => `${Math.round(i * step)},${Math.round(yTotal(v))}`).join(" ");
  const barH = (v: number) => (v / topEvents) * 50;
  const ticks = [0, 7, 14, 21, days.length - 1].filter((i) => days[i]);
  return (
    <section className="adm-pn-card adm-pn-wide">
      <div className="adm-pn-ch">
        <h2>Evolución de contactos · últimos 28 días</h2>
        <div className="adm-pn-legend">
          <span>
            <i className="adm-pn-key-visits" />
            Total ({formatInt(lo)}–{formatInt(hi)})
          </span>
          <span>
            <i className="adm-pn-key-added" />
            Altas del día
          </span>
          {unsubscribesKnown ? (
            <span>
              <i className="adm-pn-key-unsub" />
              Bajas del día
            </span>
          ) : null}
          <Source>Supabase</Source>
        </div>
      </div>
      <svg
        className="adm-pn-chart"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Contactos de ${formatInt(totals[0] ?? 0)} a ${formatInt(totals[totals.length - 1] ?? 0)} en 28 días, con altas y bajas por día`}
      >
        <line x1="0" y1="196" x2={w} y2="196" className="adm-pn-axis" />
        {days.map((d, i) => (
          <g key={d.date}>
            {d.added > 0 ? <rect x={i * step - 7} y={196 - barH(d.added)} width="6" height={barH(d.added)} className="adm-pn-bar-added" /> : null}
            {unsubscribesKnown && d.unsubscribed > 0 ? (
              <rect x={i * step + 1} y={196 - barH(d.unsubscribed)} width="6" height={barH(d.unsubscribed)} className="adm-pn-bar-unsub" />
            ) : null}
          </g>
        ))}
        <polyline points={points} className="adm-pn-line-visits" />
      </svg>
      <div className="adm-pn-ticks">
        {ticks.map((i) => (
          <span key={i}>{dayFormat.format(new Date(`${days[i].date}T12:00:00Z`))}</span>
        ))}
      </div>
      <p className="adm-pn-foot">
        La línea cuenta las cuentas que siguen vivas hoy; una cuenta borrada desaparece de toda la línea. Altas y bajas van en escala propia.
      </p>
    </section>
  );
}

function UnsubscribesCard({ unsubscribes }: { unsubscribes: EmailSectionReady["unsubscribes"] }) {
  return (
    <section className="adm-pn-card adm-pn-side">
      <CardHead title="Bajas por tipo de correo" source="Supabase" />
      {!unsubscribes ? (
        <Unavailable>No se pudo leer el registro de bajas esta vez.</Unavailable>
      ) : (
        <>
          <div className="adm-pn-vitals">
            {UNSUB_CATEGORIES.map((category) => {
              const count = unsubscribes.byCategory[category] ?? 0;
              const share = unsubscribes.inWindow > 0 ? (count / unsubscribes.inWindow) * 100 : 0;
              return (
                <div key={category}>
                  <div className="adm-pn-vital-head">
                    <span>{CATEGORY_COPY[category].title}</span>
                    <span className="adm-pn-num">{formatInt(count)}</span>
                  </div>
                  <div className="adm-pn-unsub-bar">
                    <span style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="adm-pn-foot">
            {UNSUB_SOURCES.map((s) => `${UNSUB_SOURCE_LABEL[s]} ${formatInt(unsubscribes.bySource[s] ?? 0)}`).join(" · ")}. Vuelven a
            suscribirse: {formatInt(unsubscribes.resubscribed)}.
          </p>
        </>
      )}
    </section>
  );
}

type EmailSectionReady = Extract<EmailSection, { kind: "ready" }>;
