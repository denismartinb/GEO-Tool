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
 * Shared brand system (v3, BRAND-5c) for every transactional email. All
 * styling is inline and table-based so it survives Gmail/Outlook/Apple Mail.
 * No custom web font: email clients don't load one reliably, so the body
 * text uses a system stack — the brand's typographic identity in email is
 * carried by the header image, not the running text (docs/brand/
 * brand-guidelines.md §3).
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
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Real brand mark v3 (BRAND-5a/5c, docs/brand/brand-guidelines.md): the
// lockup (mark + wordmark + tagline) plus the ghost-G motif, rasterized at
// public/brand/genscore-email-header.png. Inline SVG doesn't render at all
// in Outlook desktop, so every email uses a PNG hosted at a stable
// production URL instead.
//
// The PNG is generated at exactly 1200x240 (2x of the 600x120 display size)
// by rendering the source SVGs on a canvas sized to match their own
// bounding box, then screenshotting that exact canvas — no ad-hoc crop
// window. The previous v2 asset (958x164px, ratio 5.84) didn't match the
// lockup's own aspect ratio (1111:254, ratio 4.41): it had already been
// captured pre-cropped, which is what showed up in inboxes as a clipped
// logo. The `width`/`height` attributes below are exact halves of the PNG's
// real pixel size (Outlook desktop's Word engine only reads the HTML
// attributes, not CSS, so they must stay accurate); the inline style uses
// `width:100%;max-width:600px;height:auto` instead of a fixed 600x120 so
// the image can shrink with `.em-card` on narrow screens — a fixed pixel
// width here would force the card to a 600px minimum and silently defeat
// the whole mobile media query below (the old 140x24 logo was small enough
// to never hit this; a full-width banner does).
const HEADER_ROW = `
  <tr><td style="background:#FFFFFF;font-size:0;line-height:0;">
    <img src="https://www.genscore.es/brand/genscore-email-header.png" width="600" height="120" alt="Genscore — Generative Engine Optimization" style="display:block;border:0;outline:none;width:100%;max-width:600px;height:auto;color:#0B1426;font-family:${FONT_STACK};font-size:14px;font-weight:700;">
  </td></tr>
  <tr><td style="background:#2563EB;height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>`;

const SUPPORT_FOOTER = `¿Dudas? Escríbenos a <a href="mailto:soporte@genscore.es" style="color:#2563EB;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.<br>GenScore · Visibilidad de marca en respuestas de IA · genscore.es`;

const notificationsFooter = (what: string) =>
  `Puedes desactivar ${what} en <a href="https://www.genscore.es/dashboard/settings/notifications" style="color:#2563EB;text-decoration:none;font-weight:600;">Ajustes → Notificaciones</a>.<br>GenScore · genscore.es`;

function wrap(bodyHtml: string, opts: { footerHtml?: string; preheader?: string } = {}): string {
  const { footerHtml = SUPPORT_FOOTER, preheader } = opts;

  // Hidden preview text shown next to the subject in the inbox list — mso-hide
  // keeps Outlook from rendering it, the near-zero box keeps every other
  // client from showing it as visible body text.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#F7F8FB;">${preheader}</div>`
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
  body{margin:0;padding:0;width:100% !important;background:#F7F8FB;}
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
<body style="margin:0;padding:0;background:#F7F8FB;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FB;">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="em-card" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E7EAF0;font-family:${FONT_STACK};">
      ${HEADER_ROW}
      <tr><td class="em-px" style="padding:36px 34px 6px;">
        ${bodyHtml}
      </td></tr>
      <tr><td class="em-px" style="padding:24px 34px 30px;">
        <div style="border-top:1px solid #EEF1F6;padding-top:18px;font-size:12.5px;line-height:1.6;color:#5B6B82;">
          ${footerHtml}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const eyebrow = (text: string, color: string = "#2563EB") =>
  `<div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${color};">${text}</div>`;

const heading = (text: string) =>
  `<h1 style="margin:12px 0 0;font-size:24px;line-height:1.18;letter-spacing:-.02em;color:#0B1426;font-weight:800;">${text}</h1>`;

const paragraph = (html: string) =>
  `<p style="margin:16px 0 0;font-size:15px;line-height:1.62;color:#3B4759;">${html}</p>`;

const button = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 6px;"><tr>
    <td align="center" bgcolor="#2563EB" style="border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-weight:700;font-size:15px;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
    </td>
  </tr></table>`;

const subtext = (html: string) =>
  `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#5B6B82;">${html}</p>`;

const featureRow = (html: string) => `
  <tr><td style="padding:9px 0;vertical-align:top;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:22px;vertical-align:top;"><div style="width:20px;height:20px;border-radius:6px;background:#E9EFFD;color:#2563EB;font-size:13px;font-weight:800;text-align:center;line-height:20px;">✓</div></td>
      <td style="padding-left:12px;font-size:14.5px;line-height:1.5;color:#3B4759;">${html}</td>
    </tr></table>
  </td></tr>`;

export async function sendWelcomeEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Bienvenido a GenScore — tu prueba de Pro ya está activa",
    wrap(
      `
      ${eyebrow("Tu prueba Pro · 7 días")}
      ${heading("Ya puedes ver cómo te menciona la IA")}
      ${paragraph(
        "Tu cuenta está lista, con acceso completo a <b style=\"color:#0B1426;\">Pro</b> durante 7 días, sin tarjeta. Descubre cómo apareces en las respuestas de ChatGPT, Gemini y Claude, compárate con tu competencia y recibe recomendaciones para ganar visibilidad."
      )}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">
        ${featureRow("Monitoriza tus <b style=\"color:#0B1426;\">prompts</b> en los tres motores de IA")}
        ${featureRow("Compárate con tus <b style=\"color:#0B1426;\">competidores</b> reales")}
        ${featureRow("Recibe <b style=\"color:#0B1426;\">recomendaciones</b> accionables cada escaneo")}
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
    `Tu plan ${planName} ya está activo`,
    wrap(
      `
      ${eyebrow("Plan activo", "#15915A")}
      ${heading(`Bienvenido a ${planName}`)}
      ${paragraph(
        `Hemos confirmado tu pago — tu cuenta ya tiene acceso completo al plan <b style="color:#0B1426;">${planName}</b>. Aprovecha todos los motores de IA, aumenta la cadencia de escaneos y desbloquea el histórico completo de tu visibilidad.`
      )}
      ${button("https://www.genscore.es/dashboard", "Ir a mi panel")}
      ${subtext(
        'Puedes ver tus facturas y gestionar tu plan cuando quieras en <a href="https://www.genscore.es/dashboard/settings/billing" style="color:#2563EB;text-decoration:none;font-weight:600;">Facturación</a>.'
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
      ${eyebrow("Acción necesaria", "#D23B48")}
      ${heading("No hemos podido renovar tu suscripción")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;background:#FDECEE;border:1px solid #F6D2D6;border-radius:14px;">
        <tr><td style="padding:16px 18px;font-size:14px;line-height:1.55;color:#3B4759;">
          El último cobro de tu suscripción no se ha podido completar. Revisa tu método de pago para que tu plan <b style="color:#0B1426;">no se interrumpa</b>.
        </td></tr>
      </table>
      ${button("https://www.genscore.es/dashboard/settings/billing", "Actualizar método de pago")}
      ${subtext(
        "Reintentaremos el cobro automáticamente en los próximos días. No hace falta que hagas nada más si ya lo has corregido."
      )}
    `,
      {
        footerHtml: `¿Dudas con tu facturación? Escríbenos a <a href="mailto:soporte@genscore.es" style="color:#2563EB;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.<br>GenScore · genscore.es`,
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
      ${eyebrow("Tu prueba ha terminado", "#5B6B82")}
      ${heading("Se acabaron tus 7 días de Pro")}
      ${paragraph(
        "Tus 7 días de prueba de <b style=\"color:#0B1426;\">Pro</b> han terminado y tu cuenta ha pasado a <b style=\"color:#0B1426;\">Free</b>. Tus dominios y escaneos siguen intactos — no hemos borrado nada."
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
      ${eyebrow("Cancelación registrada", "#5B6B82")}
      ${heading("Tu suscripción se cancelará al final del periodo")}
      ${paragraph(
        `Hemos registrado tu cancelación. Tu plan sigue activo, con todas sus funciones, hasta el <b style="color:#0B1426;">${dateFormatter.format(
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
      ${eyebrow("Aviso de visibilidad", "#D23B48")}
      ${heading(`Tu GEO Score de ${projectDomain} ha bajado`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#F7F8FB;border:1px solid #E7EAF0;border-radius:14px;">
        <tr><td style="padding:20px 24px;text-align:center;">
          <span class="em-score-num" style="font-size:34px;font-weight:800;color:#5B6B82;letter-spacing:-.03em;font-variant-numeric:tabular-nums;">${Math.round(
            previousScore
          )}</span>
          <span style="font-size:19px;color:#5B6B82;padding:0 12px;font-weight:700;">&rarr;</span>
          <span class="em-score-num" style="font-size:34px;font-weight:800;color:#D23B48;letter-spacing:-.03em;font-variant-numeric:tabular-nums;">${Math.round(
            currentScore
          )}</span>
          <div style="margin-top:12px;">
            <span style="display:inline-block;background:#FDECEE;color:#D23B48;font-weight:700;font-size:13px;padding:5px 12px;border-radius:999px;">&#9660; ${Math.round(
              currentScore
            ) - Math.round(previousScore)} pts</span>
          </div>
          <div style="font-size:12.5px;color:#5B6B82;margin-top:10px;">caída sostenida en los dos últimos escaneos</div>
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
  `<div style="margin:30px 0 12px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#5B6B82;">${text}</div>`;

const statCell = (value: string, label: string, stackClass: string) => `
  <td width="33%" class="${stackClass}" style="padding:14px 6px;text-align:center;">
    <div style="font-size:21px;font-weight:800;color:#0B1426;line-height:1;font-variant-numeric:tabular-nums;">${value}</div>
    <div style="font-size:11px;color:#5B6B82;margin-top:5px;">${label}</div>
  </td>`;

const statRow = (cells: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FB;border:1px solid #E7EAF0;border-radius:14px;"><tr>${cells}</tr></table>`;

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
      ? { bg: "#E7F6EE", ink: "#15915A", label: `▲ +${delta} pts` }
      : delta < 0
        ? { bg: "#FDECEE", ink: "#D23B48", label: `▼ ${delta} pts` }
        : { bg: "#EEF1F6", ink: "#5B6B82", label: "Sin cambios" };

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
        `<b style="color:#0B1426;">${digest.topMover.name}</b> ${
          digest.topMover.mentionDelta > 0 ? "ha ganado" : "ha perdido"
        } ${Math.abs(digest.topMover.mentionDelta)} mención${
          Math.abs(digest.topMover.mentionDelta) === 1 ? "" : "es"
        } esta semana — vale la pena vigilarlo.`
      )}`
    : "";

  const moreRecommendationsHtml =
    digest.activeRecommendationsCount > 1
      ? subtext(
          `Tienes <b style="color:#0B1426;">${digest.activeRecommendationsCount - 1}</b> recomendación${
            digest.activeRecommendationsCount - 1 === 1 ? "" : "es"
          } más esperando en tu panel.`
        )
      : "";

  const recommendationHtml = digest.recommendation
    ? `
      ${sectionLabel("Recomendaciones")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9EFFD;border-radius:12px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#2563EB;">Destacada</div>
          <div style="margin-top:6px;font-size:14.5px;line-height:1.5;color:#0B1426;font-weight:700;">${digest.recommendation.title}</div>
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
      ${heading(`Cómo ha ido ${projectDomain} esta semana`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#F7F8FB;border:1px solid #E7EAF0;border-radius:14px;">
        <tr>
          <td class="em-stack-td" style="padding:22px 24px;vertical-align:middle;">
            <div style="font-size:12.5px;color:#5B6B82;font-weight:600;">Tu GEO Score</div>
            <div class="em-score-num" style="font-size:46px;font-weight:800;color:#0B1426;line-height:1;letter-spacing:-.03em;margin-top:6px;font-variant-numeric:tabular-nums;">${Math.round(
              digest.currentScore
            )}</div>
          </td>
          <td class="em-stack-td em-stack-second em-align-left-mobile" style="padding:22px 24px;vertical-align:middle;text-align:right;">
            <span style="display:inline-block;background:${pill.bg};color:${pill.ink};font-weight:700;font-size:14px;padding:7px 13px;border-radius:999px;">${pill.label}</span>
            <div style="font-size:12.5px;color:#5B6B82;margin-top:8px;">vs. la semana pasada</div>
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
      ${eyebrow("Cuenta eliminada", "#0B1426")}
      ${heading("Tu cuenta se ha eliminado correctamente")}
      ${paragraph(
        "Confirmamos que tu cuenta y todos tus datos —dominios, escaneos, prompts, competidores y recomendaciones— se han eliminado de forma permanente."
      )}
      ${paragraph(
        'Si no has sido tú, escríbenos de inmediato a <a href="mailto:soporte@genscore.es" style="color:#2563EB;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.'
      )}
    `,
      { preheader: "Confirmamos que tu cuenta y tus datos se han eliminado de forma permanente." }
    )
  );
}

/**
 * Operator alert address for backend failures nobody else can act on
 * (AUDIT-AFTER-SCAN-1). Inert when unset, same as RESEND_API_KEY: an
 * unconfigured alert channel must never turn into a crash on a code path
 * whose whole job is handling a failure gracefully.
 */
/**
 * True only when an operator alert can ACTUALLY be delivered — which needs
 * both a destination (`OPS_ALERT_EMAIL`) and a transport (`RESEND_API_KEY`).
 *
 * Checking only the address was not enough, and the gap cost a failed
 * verification of the very phase that introduced it (2026-08-05): the
 * address was configured, this returned true, and `sendEmail` then no-opped
 * on `if (!resend) return` without a word. Two silent gates in series is
 * exactly the shape of failure ADR 0029 exists to remove, so the probe has
 * to cover the whole path it claims to have checked.
 */
export function isOpsAlertConfigured(): boolean {
  return getOpsAlertAddress() !== null && getResendClient() !== null;
}

function getOpsAlertAddress(): string | null {
  const raw = process.env.OPS_ALERT_EMAIL?.trim();
  return raw ? raw : null;
}

/**
 * The raw provider error is interpolated into HTML below. It originates
 * upstream (Gemini, Supabase, fetch) and is not ours, so it is escaped — an
 * alert about a failure must not become an injection vector into the
 * operator's own inbox.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * AUDIT-AFTER-SCAN-1: the post-scan web audit exhausted its retry budget.
 *
 * Goes to the OPERATOR, never to the customer. The customer never asked for
 * this audit (it is automatic), and the failure is backend trouble they
 * cannot act on — mailing them would be noise about someone else's problem.
 *
 * Deliberately plain and dense rather than brand-wrapped: the reader is
 * debugging, and wants the project, the run, the attempt count and the real
 * error above the fold.
 */
export async function sendWebAuditFailedAlertEmail(input: {
  domain: string;
  projectId: string;
  runId: string;
  attempts: number;
  windowMinutes: number;
  lastError: string;
  failedAt: Date;
}): Promise<void> {
  const to = getOpsAlertAddress();
  if (!to) return;

  const hours = (input.windowMinutes / 60).toFixed(1);
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5B6B82;font-size:13px;white-space:nowrap;">${label}</td>` +
    `<td style="padding:4px 0;color:#0B1426;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(value)}</td></tr>`;

  await sendEmail(
    to,
    `[GenScore] Auditoría web automática fallida — ${input.domain}`,
    `<!doctype html><html><head><meta charset="utf-8"></head>
     <body style="margin:0;padding:24px;background:#FFFFFF;font-family:${FONT_STACK};color:#0B1426;">
       <h1 style="margin:0 0 6px;font-size:17px;">Auditoría web automática fallida</h1>
       <p style="margin:0 0 18px;font-size:13.5px;color:#5B6B82;">
         Se agotaron los ${input.attempts} intentos a lo largo de ~${hours} h. El escaneo sí se completó;
         lo que no se ha actualizado es la auditoría web de este proyecto.
       </p>
       <table role="presentation" cellpadding="0" cellspacing="0">
         ${row("Dominio", input.domain)}
         ${row("Proyecto", input.projectId)}
         ${row("Escaneo", input.runId)}
         ${row("Fallo definitivo", input.failedAt.toISOString())}
       </table>
       <p style="margin:18px 0 6px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#5B6B82;">Último error</p>
       <pre style="margin:0;padding:12px;background:#F7F8FB;border:1px solid #E7EAF0;border-radius:10px;font-size:12.5px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(
         input.lastError
       )}</pre>
     </body></html>`
  );
}

/**
 * Alerts the operator that a scan could not produce complete data
 * (EXTRACTION-RELIABILITY-1 Fase B, docs/adr/0029).
 *
 * Goes to the OPERATOR, never to the customer — same reasoning as
 * `sendWebAuditFailedAlertEmail` above. An exhausted API account or a dead
 * engine is backend trouble the customer cannot act on, and telling them
 * their data is incomplete without being able to fix it is noise about
 * someone else's problem.
 *
 * This exists because the failure it reports was invisible for four days:
 * OpenAI extraction returned HTTP 429 on every call from 2026-08-01 while
 * the product kept marking every scan "Completado", and Claude had failed
 * the same way in June without anyone noticing either. The subject line
 * leads with the engine and the reason precisely so the inbox itself
 * answers "what do I have to go fix".
 *
 * Brand-wrapped (BRAND-5c system) since 2026-08-07: the reader is still
 * debugging, so every field from the plain version stays, but the same
 * `wrap()`/`eyebrow()`/`heading()` shell as the other transactional emails
 * replaces the ad-hoc bare-bones HTML — this one landed in the founder's own
 * inbox looking unbranded next to the other eight.
 */
export async function sendScanHealthAlertEmail(input: {
  engine: string;
  reason: string;
  headline: string;
  detail: string;
  domain: string;
  projectId: string;
  runId: string;
  affectedRows: number;
  totalRows: number;
  detectedAt: Date;
}): Promise<void> {
  const to = getOpsAlertAddress();
  if (!to) return;

  const dataRow = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #EEF1F6;font-size:12.5px;color:#5B6B82;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:9px 0 9px 14px;border-top:1px solid #EEF1F6;font-size:13px;color:#0B1426;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;">${escapeHtml(value)}</td>
    </tr>`;

  const rowsHtml = [
    dataRow("Motor", input.engine),
    dataRow("Causa", input.reason),
    input.totalRows > 0
      ? dataRow("Filas afectadas", `${input.affectedRows} de ${input.totalRows}`)
      : dataRow("Filas", "ninguna: el motor no llegó a responder"),
    dataRow("Dominio", input.domain),
    dataRow("Proyecto", input.projectId),
    dataRow("Escaneo", input.runId),
    dataRow("Detectado", input.detectedAt.toISOString())
  ].join("");

  await sendEmail(
    to,
    `[GenScore] Escaneo incompleto — ${input.engine}: ${input.reason}`,
    wrap(
      `
      ${eyebrow("Alerta operativa · sólo equipo GenScore", "#D23B48")}
      ${heading(input.headline)}
      ${paragraph(input.detail)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
        ${rowsHtml}
      </table>
      ${subtext(
        "Sólo se envía un aviso por motor y causa cada 24 h, aunque el problema afecte a varios proyectos. El resto queda registrado en <code>scan_prompt_results.extraction_error</code>."
      )}
    `,
      {
        footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es",
        preheader: input.headline
      }
    )
  );
}

/**
 * LLM-RESILIENCE-1: an actionable LLM failure that happened OUTSIDE a scan run
 * — the onboarding wizard, the web audit's content call, a recommendation
 * rewrite. `sendScanHealthAlertEmail` cannot cover these: it reports on a
 * finished run's rows, and these paths produce none.
 *
 * Operator address, never the customer's, same rule as every other alert here:
 * the customer cannot top up our Gemini account.
 *
 * The dedupe note in the footer says "por instancia" on purpose rather than
 * borrowing the scan alert's flat "sólo se envía un aviso cada 24h" — the
 * store behind it is per-process (see `lib/llm/llm-incident.ts`), so promising
 * global deduplication in the email itself would be a claim the code does not
 * keep.
 */
export async function sendLlmIncidentAlertEmail(input: {
  surfaceLabel: string;
  provider: string;
  category: string;
  headline: string;
  detail: string;
  domain: string;
  projectId: string;
  dedupeMinutes: number;
  detectedAt: Date;
}): Promise<void> {
  const to = getOpsAlertAddress();
  if (!to) return;

  const dataRow = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #EEF1F6;font-size:12.5px;color:#5B6B82;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:9px 0 9px 14px;border-top:1px solid #EEF1F6;font-size:13px;color:#0B1426;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;">${escapeHtml(value)}</td>
    </tr>`;

  const rowsHtml = [
    dataRow("Proceso", input.surfaceLabel),
    dataRow("Motor", input.provider),
    dataRow("Causa", input.category),
    dataRow("Dominio", input.domain),
    dataRow("Proyecto", input.projectId),
    dataRow("Detectado", input.detectedAt.toISOString())
  ].join("");

  await sendEmail(
    to,
    `[GenScore] Fallo de ${input.provider} fuera del escaneo — ${input.category}`,
    wrap(
      `
      ${eyebrow("Alerta operativa · sólo equipo GenScore", "#D23B48")}
      ${heading(input.headline)}
      ${paragraph(input.detail)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
        ${rowsHtml}
      </table>
      ${subtext(
        `Se envía como máximo un aviso por proceso, motor y causa cada ${input.dedupeMinutes} min y por instancia de servidor, así que un apagón amplio puede repetirlo. A diferencia del aviso de escaneo, este fallo no deja fila en la base de datos: el email es el único registro.`
      )}
    `,
      {
        footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es",
        preheader: input.headline
      }
    )
  );
}

/**
 * ADMIN-CONSOLE-1: informational alert to the operator every time a new
 * account becomes usable — a password signup with an immediate session
 * (`app/signup/actions.ts`), a password signup confirmed via the email link,
 * or a Google OAuth signup (both land in `app/auth/callback/route.ts`,
 * which is also `sendWelcomeEmail`'s second call site — same "new account,
 * real session" definition, no separate detection logic to keep in sync).
 *
 * Goes to the OPERATOR (`OPS_ALERT_EMAIL`), never re-uses a customer-facing
 * template: this is about the account, not for the account.
 *
 * Known gap, stated rather than hidden: a signup that requires email
 * confirmation and never confirms never reaches either call site, so it
 * never generates this alert either — seeing those would need a Supabase
 * database webhook on `auth.users`, which is infrastructure outside this
 * repo and its own Task Intake.
 */
export async function sendNewSignupOpsAlertEmail(input: {
  email: string;
  userId: string;
  method: "password" | "google";
  planId: string;
  trialEndsAt: string | null;
  createdAt: Date;
}): Promise<void> {
  const to = getOpsAlertAddress();
  if (!to) return;

  const dataRow = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #EEF1F6;font-size:12.5px;color:#5B6B82;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:9px 0 9px 14px;border-top:1px solid #EEF1F6;font-size:13px;color:#0B1426;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;">${escapeHtml(value)}</td>
    </tr>`;

  const methodLabel = input.method === "google" ? "Google OAuth" : "Email y contraseña";
  const planLabel = input.trialEndsAt
    ? `${input.planId} · prueba hasta ${new Date(input.trialEndsAt).toISOString().slice(0, 10)}`
    : input.planId;

  const rowsHtml = [
    dataRow("Email", input.email),
    dataRow("user_id", input.userId),
    dataRow("Método", methodLabel),
    dataRow("Plan", planLabel),
    dataRow("Alta", input.createdAt.toISOString())
  ].join("");

  await sendEmail(
    to,
    `[GenScore] Alta nueva — ${input.email}`,
    wrap(
      `
      ${eyebrow("Alta nueva · sólo equipo GenScore")}
      ${heading("Nueva cuenta activa")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
        ${rowsHtml}
      </table>
      ${subtext("Aviso automático por cada cuenta que llega a tener una sesión real — no cubre altas que nunca confirman el email.")}
    `,
      {
        footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es",
        preheader: `Nueva cuenta: ${input.email}`
      }
    )
  );
}

/**
 * ADMIN-CONSOLE-2b: aviso al operador en cada escritura que hace `/admin`
 * sobre el proyecto de un cliente (interruptor de escaneo recurrente o de
 * auditoría automática). Es el registro completo — no hay tabla nueva para
 * esto, así que este email ES la auditoría de la acción, no un aviso
 * adicional a ella (docs/design-reference/admin-console-1/README.md).
 * Registra quién, qué cuenta, qué proyecto y qué cambió — desde
 * ADMIN-CONSOLE-UX-1 ya no lleva motivo (decisión explícita del fundador,
 * `docs/brand/design-decisions-log.md` §92): el registro deja de explicar
 * el porqué, pero sigue siendo el único rastro del quién/qué/cuándo.
 *
 * Va a `OPS_ALERT_EMAIL`, nunca al cliente: es una escritura que hace GenScore
 * sobre su cuenta.
 */
export async function sendAdminAutomationChangeAlertEmail(input: {
  operatorEmail: string;
  targetUserEmail: string;
  targetUserId: string;
  domain: string;
  projectId: string;
  change: string;
  changedAt: Date;
}): Promise<void> {
  const to = getOpsAlertAddress();
  if (!to) return;

  const dataRow = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #EEF1F6;font-size:12.5px;color:#5B6B82;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:9px 0 9px 14px;border-top:1px solid #EEF1F6;font-size:13px;color:#0B1426;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;">${escapeHtml(value)}</td>
    </tr>`;

  const rowsHtml = [
    dataRow("Operador", input.operatorEmail),
    dataRow("Cuenta afectada", `${input.targetUserEmail} (${input.targetUserId})`),
    dataRow("Dominio", input.domain),
    dataRow("Proyecto", input.projectId),
    dataRow("Cambio", input.change),
    dataRow("Fecha", input.changedAt.toISOString())
  ].join("");

  await sendEmail(
    to,
    `[GenScore] /admin cambió un automatismo — ${input.domain}`,
    wrap(
      `
      ${eyebrow("Acción de operador · sólo equipo GenScore")}
      ${heading("Un automatismo cambió desde /admin")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
        ${rowsHtml}
      </table>
    `,
      {
        footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es",
        preheader: `${input.operatorEmail} cambió ${input.change} en ${input.domain}`
      }
    )
  );
}
