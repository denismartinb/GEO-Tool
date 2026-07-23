import "server-only";

import { getResendClient, getEmailFromAddress } from "@/lib/email/resend";

/**
 * Every send* function here is fire-and-forget from the caller's point of
 * view: it never throws. A failed or unconfigured (no RESEND_API_KEY) send
 * is logged and swallowed — a broken email must never break signup,
 * checkout, or the trial-expiry downgrade it's attached to.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  try {
    const { error } = await resend.emails.send({ from: getEmailFromAddress(), to, subject, html });
    if (error) {
      console.error("[geo:email] Resend rejected the send", { to, subject, message: error.message });
    }
  } catch (sendError) {
    console.error("[geo:email] failed to send", {
      to,
      subject,
      message: sendError instanceof Error ? sendError.message : String(sendError)
    });
  }
}

/**
 * Shared brand system for every transactional email. All styling is inline
 * and table-based so it survives Gmail/Outlook/Apple Mail; the Hanken Grotesk
 * @import is a progressive enhancement for clients that support web fonts
 * (Apple Mail / iOS — a big share of our audience), with a system fallback
 * stack for the rest. No external images: the logo mark is a coloured cell.
 *
 * `wrap()` emits a full HTML document (not a fragment): Resend sends
 * whatever `html` we pass verbatim, and clients like Outlook.com/Gmail
 * webmail only apply <meta>/<style> declarations found in a real <head>.
 * The two meta tags pin every email to the light palette it's actually
 * designed for — without them, iOS Mail / Outlook.com dark mode "fixes"
 * auto-invert or reflow our colors, in unpredictable and often ugly ways.
 * The @media block handles the one place a fixed 600px layout doesn't
 * reflow safely on a narrow phone: the two-column score/pill row.
 */
const FONT_STACK =
  "'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Real brand mark (BRAND-1/BRAND-2, docs/brand/brand-guidelines.md), not the
// old placeholder square. The lockup's indigo gradient + amber score dot is
// an inline SVG in the app (components/ui/brand-logo.tsx), but inline SVG
// doesn't render at all in Outlook desktop — this is a rasterized PNG of the
// same asset (public/brand/genscore-logo-white.svg) hosted at a stable
// production URL instead, which every email client supports via <img>.
const HEADER_ROW = `
  <tr><td style="background:#1e1b4e;padding:22px 34px;">
    <img src="https://www.genscore.es/brand/genscore-logo-white-email.png" width="140" height="24" alt="GenScore" style="display:block;border:0;outline:none;height:24px;width:140px;">
  </td></tr>`;

const SUPPORT_FOOTER = `¿Dudas? Escríbenos a <a href="mailto:soporte@genscore.es" style="color:#4f46e5;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.<br>GenScore · Visibilidad de marca en respuestas de IA · genscore.es`;

const notificationsFooter = (what: string) =>
  `Puedes desactivar ${what} en <a href="https://www.genscore.es/dashboard/settings/notifications" style="color:#4f46e5;text-decoration:none;font-weight:600;">Ajustes → Notificaciones</a>.<br>GenScore · genscore.es`;

function wrap(bodyHtml: string, opts: { footerHtml?: string; preheader?: string } = {}): string {
  const { footerHtml = SUPPORT_FOOTER, preheader } = opts;

  // Hidden preview text shown next to the subject in the inbox list — mso-hide
  // keeps Outlook from rendering it, the near-zero box keeps every other
  // client from showing it as visible body text.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f6f7f9;">${preheader}</div>`
    : "";

  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;border:0;line-height:100%;outline:none;text-decoration:none;}
  body{margin:0;padding:0;width:100% !important;background:#f6f7f9;}
  @media only screen and (max-width:600px){
    .em-card{width:100% !important;border-radius:0 !important;}
    .em-px{padding-left:20px !important;padding-right:20px !important;}
    .em-stack-td{display:block !important;width:100% !important;}
    .em-stack-td.em-stack-second{padding-top:12px !important;}
    .em-align-left-mobile{text-align:left !important;}
    .em-score-num{font-size:36px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="em-card" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8eaef;font-family:${FONT_STACK};">
      ${HEADER_ROW}
      <tr><td class="em-px" style="padding:36px 34px 6px;">
        ${bodyHtml}
      </td></tr>
      <tr><td class="em-px" style="padding:24px 34px 30px;">
        <div style="border-top:1px solid #eef0f4;padding-top:18px;font-size:12.5px;line-height:1.6;color:#6b7385;">
          ${footerHtml}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const eyebrow = (text: string, color: string = "#4f46e5") =>
  `<div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${color};">${text}</div>`;

const heading = (text: string) =>
  `<h1 style="margin:12px 0 0;font-size:24px;line-height:1.18;letter-spacing:-.02em;color:#0f1729;font-weight:800;">${text}</h1>`;

const paragraph = (html: string) =>
  `<p style="margin:16px 0 0;font-size:15px;line-height:1.62;color:#475067;">${html}</p>`;

const button = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 6px;"><tr>
    <td align="center" bgcolor="#4f46e5" style="border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-weight:700;font-size:15px;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
    </td>
  </tr></table>`;

const subtext = (html: string) =>
  `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#6b7385;">${html}</p>`;

const featureRow = (html: string) => `
  <tr><td style="padding:9px 0;vertical-align:top;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:22px;vertical-align:top;"><div style="width:20px;height:20px;border-radius:6px;background:#eef2ff;color:#4f46e5;font-size:13px;font-weight:800;text-align:center;line-height:20px;">✓</div></td>
      <td style="padding-left:12px;font-size:14.5px;line-height:1.5;color:#475067;">${html}</td>
    </tr></table>
  </td></tr>`;

export async function sendWelcomeEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Bienvenido a GenScore — tu prueba de Pro ya está activa 🎉",
    wrap(
      `
      ${eyebrow("Tu prueba Pro · 7 días")}
      ${heading("Ya puedes ver cómo te menciona la IA 🎉")}
      ${paragraph(
        "Tu cuenta está lista, con acceso completo a <b style=\"color:#0f1729;\">Pro</b> durante 7 días, sin tarjeta. Descubre cómo apareces en las respuestas de ChatGPT, Gemini y Claude, compárate con tu competencia y recibe recomendaciones para ganar visibilidad."
      )}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">
        ${featureRow("Monitoriza tus <b style=\"color:#0f1729;\">prompts</b> en los tres motores de IA")}
        ${featureRow("Compárate con tus <b style=\"color:#0f1729;\">competidores</b> reales")}
        ${featureRow("Recibe <b style=\"color:#0f1729;\">recomendaciones</b> accionables cada escaneo")}
      </table>
      ${button("https://www.genscore.es/dashboard", "Crear mi primer análisis")}
      ${subtext("Tu prueba termina en 7 días. Te avisaremos antes; no se te cobra nada de forma automática.")}
    `,
      { preheader: "Tu prueba de Pro ya está activa — sin tarjeta, 7 días completos." }
    )
  );
}

export async function sendPlanConfirmedEmail(to: string, planName: string): Promise<void> {
  await sendEmail(
    to,
    `Tu plan ${planName} ya está activo 🎉`,
    wrap(
      `
      ${eyebrow("Plan activo")}
      ${heading(`¡Bienvenido a ${planName}! 🎉`)}
      ${paragraph(
        `Hemos confirmado tu pago — tu cuenta ya tiene acceso completo al plan <b style="color:#0f1729;">${planName}</b>. Aprovecha todos los motores de IA, aumenta la cadencia de escaneos y desbloquea el histórico completo de tu visibilidad.`
      )}
      ${button("https://www.genscore.es/dashboard", "Ir a mi panel")}
      ${subtext(
        'Puedes ver tus facturas y gestionar tu plan cuando quieras en <a href="https://www.genscore.es/dashboard/settings/billing" style="color:#4f46e5;text-decoration:none;font-weight:600;">Facturación</a>.'
      )}
    `,
      { preheader: `Tu pago se ha confirmado — ya tienes acceso completo a ${planName}.` }
    )
  );
}

export async function sendPaymentFailedEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "No hemos podido cobrar tu suscripción de GenScore",
    wrap(
      `
      ${eyebrow("Acción necesaria", "#b91c1c")}
      ${heading("No hemos podido renovar tu suscripción")}
      ${paragraph(
        "El último cobro de tu suscripción no se ha podido completar. Revisa tu método de pago para que tu plan <b style=\"color:#0f1729;\">no se interrumpa</b> y sigas con acceso completo."
      )}
      ${button("https://www.genscore.es/dashboard/settings/billing", "Actualizar método de pago")}
      ${subtext(
        "Reintentaremos el cobro automáticamente en los próximos días. No hace falta que hagas nada más si ya lo has corregido."
      )}
    `,
      {
        footerHtml: `¿Dudas con tu facturación? Escríbenos a <a href="mailto:soporte@genscore.es" style="color:#4f46e5;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.<br>GenScore · genscore.es`,
        preheader: "Revisa tu método de pago para que tu plan no se interrumpa."
      }
    )
  );
}

export async function sendTrialEndedEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Tu prueba de Pro ha terminado",
    wrap(
      `
      ${eyebrow("Tu prueba ha terminado")}
      ${heading("Se acabaron tus 7 días de Pro")}
      ${paragraph(
        "Tus 7 días de prueba de <b style=\"color:#0f1729;\">Pro</b> han terminado y tu cuenta ha pasado a <b style=\"color:#0f1729;\">Free</b>. Tus dominios y escaneos siguen intactos — no hemos borrado nada."
      )}
      ${paragraph("¿Te ha resultado útil ver cómo te menciona la IA? Recupera el acceso completo cuando quieras.")}
      ${button("https://www.genscore.es/dashboard/settings/billing", "Ver planes")}
    `,
      { preheader: "Tu cuenta ha pasado a Free — tus datos siguen intactos." }
    )
  );
}

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

export async function sendCancellationScheduledEmail(to: string, activeUntil: Date): Promise<void> {
  await sendEmail(
    to,
    "Tu suscripción de GenScore se cancelará al final de tu periodo",
    wrap(
      `
      ${eyebrow("Cancelación registrada")}
      ${heading("Tu suscripción se cancelará al final del periodo")}
      ${paragraph(
        `Hemos registrado tu cancelación. Tu plan sigue activo, con todas sus funciones, hasta el <b style="color:#0f1729;">${dateFormatter.format(
          activeUntil
        )}</b> — no se te volverá a cobrar después de esa fecha.`
      )}
      ${paragraph("¿Cambiaste de idea? Puedes reactivarlo en cualquier momento antes de esa fecha.")}
      ${button("https://www.genscore.es/dashboard/settings/billing", "Ver mi facturación")}
    `,
      { preheader: `Tu plan sigue activo hasta el ${dateFormatter.format(activeUntil)}.` }
    )
  );
}

export async function sendScoreDropAlertEmail(
  to: string,
  projectDomain: string,
  previousScore: number,
  currentScore: number
): Promise<void> {
  await sendEmail(
    to,
    `Tu GEO Score de ${projectDomain} ha bajado`,
    wrap(
      `
      ${eyebrow("Aviso de visibilidad", "#b45309")}
      ${heading(`Tu GEO Score de ${projectDomain} ha bajado`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#fef7ed;border:1px solid #fbe4c4;border-radius:14px;">
        <tr><td style="padding:20px 24px;text-align:center;">
          <span class="em-score-num" style="font-size:34px;font-weight:800;color:#6b7385;letter-spacing:-.03em;font-variant-numeric:tabular-nums;">${Math.round(
            previousScore
          )}</span>
          <span style="font-size:20px;color:#b45309;padding:0 12px;font-weight:700;">&rarr;</span>
          <span class="em-score-num" style="font-size:34px;font-weight:800;color:#b45309;letter-spacing:-.03em;font-variant-numeric:tabular-nums;">${Math.round(
            currentScore
          )}</span>
          <div style="font-size:12.5px;color:#92600f;margin-top:8px;">caída sostenida en los dos últimos escaneos</div>
        </td></tr>
      </table>
      ${paragraph(
        "Puede deberse a un cambio real de visibilidad en las respuestas de IA, o a variación del contenido de tus competidores. Revisa el detalle y las recomendaciones para entender qué ha cambiado."
      )}
      ${button("https://www.genscore.es/dashboard", "Revisar qué ha cambiado")}
    `,
      { footerHtml: notificationsFooter("este aviso"), preheader: `Tu GEO Score ha pasado de ${Math.round(previousScore)} a ${Math.round(currentScore)}.` }
    )
  );
}

const sectionLabel = (text: string) =>
  `<div style="margin:30px 0 12px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7385;">${text}</div>`;

const statCell = (value: string, label: string, stackClass: string) => `
  <td width="33%" class="${stackClass}" style="padding:14px 6px;text-align:center;">
    <div style="font-size:21px;font-weight:800;color:#0f1729;line-height:1;font-variant-numeric:tabular-nums;">${value}</div>
    <div style="font-size:11px;color:#6b7385;margin-top:5px;">${label}</div>
  </td>`;

const statRow = (cells: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fb;border:1px solid #eef0f4;border-radius:14px;"><tr>${cells}</tr></table>`;

export async function sendWeeklyDigestEmail(
  to: string,
  projectDomain: string,
  digest: {
    currentScore: number;
    previousScore: number;
    subScores: { visibility: number | null; citation: number | null; standing: number | null };
    topMover: { name: string; mentionDelta: number } | null;
    recommendation: { title: string; description: string } | null;
    activeRecommendationsCount: number;
    promptsCount: number;
    competitorsCount: number;
    scansThisWeek: number;
  }
): Promise<void> {
  const delta = Math.round(digest.currentScore) - Math.round(digest.previousScore);
  const pill =
    delta > 0
      ? { bg: "#e6f6ee", ink: "#15915a", label: `▲ +${delta} pts` }
      : delta < 0
        ? { bg: "#fef0e7", ink: "#b45309", label: `▼ ${delta} pts` }
        : { bg: "#eef0f4", ink: "#6b7385", label: "Sin cambios" };

  // Only components this run actually computed — an unavailable one (e.g. no
  // grounded provider rows for authority) is omitted, never shown as 0.
  const subScoreEntries = [
    digest.subScores.visibility !== null ? { label: "Presencia", value: `${Math.round(digest.subScores.visibility)}%` } : null,
    digest.subScores.standing !== null ? { label: "Cuota de voz", value: `${Math.round(digest.subScores.standing)}%` } : null,
    digest.subScores.citation !== null ? { label: "Autoridad", value: `${Math.round(digest.subScores.citation)}%` } : null
  ].filter((e): e is { label: string; value: string } => e !== null);

  const subScoreHtml = subScoreEntries.length
    ? `
      ${sectionLabel("Visión general")}
      ${statRow(
        subScoreEntries
          .map((e, i) => statCell(e.value, e.label, i === 0 ? "em-stack-td" : "em-stack-td em-stack-second"))
          .join("")
      )}`
    : "";

  const activityHtml = `
    ${sectionLabel("Actividad esta semana")}
    ${statRow(
      [
        statCell(String(digest.scansThisWeek), digest.scansThisWeek === 1 ? "escaneo" : "escaneos", "em-stack-td"),
        statCell(String(digest.promptsCount), digest.promptsCount === 1 ? "prompt monitorizado" : "prompts monitorizados", "em-stack-td em-stack-second"),
        statCell(String(digest.competitorsCount), digest.competitorsCount === 1 ? "competidor rastreado" : "competidores rastreados", "em-stack-td em-stack-second")
      ].join("")
    )}`;

  const moverHtml = digest.topMover
    ? `
      ${sectionLabel("Competidores")}
      ${paragraph(
        `<b style="color:#0f1729;">${digest.topMover.name}</b> ${
          digest.topMover.mentionDelta > 0 ? "ha ganado" : "ha perdido"
        } ${Math.abs(digest.topMover.mentionDelta)} mención${
          Math.abs(digest.topMover.mentionDelta) === 1 ? "" : "es"
        } esta semana — vale la pena vigilarlo.`
      )}`
    : "";

  const moreRecommendationsHtml =
    digest.activeRecommendationsCount > 1
      ? subtext(
          `Tienes <b style="color:#0f1729;">${digest.activeRecommendationsCount - 1}</b> recomendación${
            digest.activeRecommendationsCount - 1 === 1 ? "" : "es"
          } más esperando en tu panel.`
        )
      : "";

  const recommendationHtml = digest.recommendation
    ? `
      ${sectionLabel("Recomendaciones")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#4f46e5;">Destacada</div>
          <div style="margin-top:6px;font-size:14.5px;line-height:1.5;color:#0f1729;font-weight:700;">${digest.recommendation.title}</div>
        </td></tr>
      </table>
      ${moreRecommendationsHtml}`
    : "";

  await sendEmail(
    to,
    `Tu resumen semanal de ${projectDomain}`,
    wrap(
      `
      ${eyebrow("Resumen semanal")}
      ${heading(`Cómo ha ido ${projectDomain} esta semana 📊`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#f7f8fb;border:1px solid #eef0f4;border-radius:14px;">
        <tr>
          <td class="em-stack-td" style="padding:22px 24px;vertical-align:middle;">
            <div style="font-size:12.5px;color:#6b7385;font-weight:600;">Tu GEO Score</div>
            <div class="em-score-num" style="font-size:46px;font-weight:800;color:#0f1729;line-height:1;letter-spacing:-.03em;margin-top:6px;font-variant-numeric:tabular-nums;">${Math.round(
              digest.currentScore
            )}</div>
          </td>
          <td class="em-stack-td em-stack-second em-align-left-mobile" style="padding:22px 24px;vertical-align:middle;text-align:right;">
            <span style="display:inline-block;background:${pill.bg};color:${pill.ink};font-weight:700;font-size:14px;padding:7px 13px;border-radius:999px;">${pill.label}</span>
            <div style="font-size:12.5px;color:#6b7385;margin-top:8px;">vs. la semana pasada</div>
          </td>
        </tr>
      </table>
      ${subScoreHtml}
      ${activityHtml}
      ${moverHtml}
      ${recommendationHtml}
      ${button("https://www.genscore.es/dashboard", "Ver el detalle completo")}
    `,
      { footerHtml: notificationsFooter("este resumen"), preheader: `Tu GEO Score es ${Math.round(digest.currentScore)} — revisa qué ha cambiado esta semana.` }
    )
  );
}

export async function sendAccountDeletedEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Tu cuenta de GenScore se ha eliminado correctamente",
    wrap(
      `
      ${eyebrow("Cuenta eliminada")}
      ${heading("Tu cuenta se ha eliminado correctamente")}
      ${paragraph(
        "Confirmamos que tu cuenta y todos tus datos —dominios, escaneos, prompts, competidores y recomendaciones— se han eliminado de forma permanente."
      )}
      ${paragraph(
        'Si no has sido tú, escríbenos de inmediato a <a href="mailto:soporte@genscore.es" style="color:#4f46e5;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.'
      )}
    `,
      { preheader: "Confirmamos que tu cuenta y tus datos se han eliminado de forma permanente." }
    )
  );
}
