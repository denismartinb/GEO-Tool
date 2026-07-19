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
 */
const FONT_STACK =
  "'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const HEADER_ROW = `
  <tr><td style="background:#1e1b4e;padding:22px 34px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:30px;vertical-align:middle;">
        <div style="width:30px;height:30px;border-radius:8px;background:#4f46e5;color:#ffffff;font-weight:800;font-size:15px;text-align:center;line-height:30px;">G</div>
      </td>
      <td style="padding-left:11px;vertical-align:middle;color:#ffffff;font-weight:800;font-size:16px;letter-spacing:-.01em;">GenScore</td>
    </tr></table>
  </td></tr>`;

const SUPPORT_FOOTER = `¿Dudas? Escríbenos a <a href="mailto:soporte@genscore.es" style="color:#4f46e5;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.<br>GenScore · Visibilidad de marca en respuestas de IA · genscore.es`;

const notificationsFooter = (what: string) =>
  `Puedes desactivar ${what} en <a href="https://www.genscore.es/dashboard/settings/notifications" style="color:#4f46e5;text-decoration:none;font-weight:600;">Ajustes → Notificaciones</a>.<br>GenScore · genscore.es`;

const wrap = (bodyHtml: string, footerHtml: string = SUPPORT_FOOTER) => `
<style>@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700;800&display=swap');</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8eaef;font-family:${FONT_STACK};">
      ${HEADER_ROW}
      <tr><td style="padding:36px 34px 6px;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:24px 34px 30px;">
        <div style="border-top:1px solid #eef0f4;padding-top:18px;font-size:12.5px;line-height:1.6;color:#6b7385;">
          ${footerHtml}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`;

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
    "Bienvenido a GenScore — tu prueba de Pro ya está activa",
    wrap(`
      ${eyebrow("Tu prueba Pro · 7 días")}
      ${heading("Ya puedes ver cómo te menciona la IA")}
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
    `)
  );
}

export async function sendPlanConfirmedEmail(to: string, planName: string): Promise<void> {
  await sendEmail(
    to,
    `Tu plan ${planName} ya está activo`,
    wrap(`
      ${eyebrow("Plan activo")}
      ${heading(`¡Bienvenido a ${planName}!`)}
      ${paragraph(
        `Hemos confirmado tu pago — tu cuenta ya tiene acceso completo al plan <b style="color:#0f1729;">${planName}</b>. Aprovecha todos los motores de IA, aumenta la cadencia de escaneos y desbloquea el histórico completo de tu visibilidad.`
      )}
      ${button("https://www.genscore.es/dashboard", "Ir a mi panel")}
      ${subtext(
        'Puedes ver tus facturas y gestionar tu plan cuando quieras en <a href="https://www.genscore.es/dashboard/settings/billing" style="color:#4f46e5;text-decoration:none;font-weight:600;">Facturación</a>.'
      )}
    `)
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
      `¿Dudas con tu facturación? Escríbenos a <a href="mailto:soporte@genscore.es" style="color:#4f46e5;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.<br>GenScore · genscore.es`
    )
  );
}

export async function sendTrialEndedEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Tu prueba de Pro ha terminado",
    wrap(`
      ${eyebrow("Tu prueba ha terminado")}
      ${heading("Se acabaron tus 7 días de Pro")}
      ${paragraph(
        "Tus 7 días de prueba de <b style=\"color:#0f1729;\">Pro</b> han terminado y tu cuenta ha pasado a <b style=\"color:#0f1729;\">Free</b>. Tus dominios y escaneos siguen intactos — no hemos borrado nada."
      )}
      ${paragraph("¿Te ha resultado útil ver cómo te menciona la IA? Recupera el acceso completo cuando quieras.")}
      ${button("https://www.genscore.es/dashboard/settings/billing", "Ver planes")}
    `)
  );
}

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

export async function sendCancellationScheduledEmail(to: string, activeUntil: Date): Promise<void> {
  await sendEmail(
    to,
    "Tu suscripción de GenScore se cancelará al final de tu periodo",
    wrap(`
      ${eyebrow("Cancelación registrada")}
      ${heading("Tu suscripción se cancelará al final del periodo")}
      ${paragraph(
        `Hemos registrado tu cancelación. Tu plan sigue activo, con todas sus funciones, hasta el <b style="color:#0f1729;">${dateFormatter.format(
          activeUntil
        )}</b> — no se te volverá a cobrar después de esa fecha.`
      )}
      ${paragraph("¿Cambiaste de idea? Puedes reactivarlo en cualquier momento antes de esa fecha.")}
      ${button("https://www.genscore.es/dashboard/settings/billing", "Ver mi facturación")}
    `)
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
          <span style="font-size:34px;font-weight:800;color:#6b7385;letter-spacing:-.03em;font-variant-numeric:tabular-nums;">${Math.round(
            previousScore
          )}</span>
          <span style="font-size:20px;color:#b45309;padding:0 12px;font-weight:700;">&rarr;</span>
          <span style="font-size:34px;font-weight:800;color:#b45309;letter-spacing:-.03em;font-variant-numeric:tabular-nums;">${Math.round(
            currentScore
          )}</span>
          <div style="font-size:12.5px;color:#92600f;margin-top:8px;">caída sostenida en los dos últimos escaneos</div>
        </td></tr>
      </table>
      ${paragraph(
        "Puede deberse a un cambio real de visibilidad en las respuestas de IA, o a variación normal entre escaneos. Revisa el detalle y las recomendaciones para entender qué ha cambiado."
      )}
      ${button("https://www.genscore.es/dashboard", "Revisar qué ha cambiado")}
    `,
      notificationsFooter("este aviso")
    )
  );
}

export async function sendWeeklyDigestEmail(
  to: string,
  projectDomain: string,
  digest: {
    currentScore: number;
    previousScore: number;
    topMover: { name: string; mentionDelta: number } | null;
    recommendation: { title: string; description: string } | null;
  }
): Promise<void> {
  const delta = Math.round(digest.currentScore) - Math.round(digest.previousScore);
  const pill =
    delta > 0
      ? { bg: "#e6f6ee", ink: "#15915a", label: `▲ +${delta} pts` }
      : delta < 0
        ? { bg: "#fef0e7", ink: "#b45309", label: `▼ ${delta} pts` }
        : { bg: "#eef0f4", ink: "#6b7385", label: "Sin cambios" };

  const moverHtml = digest.topMover
    ? paragraph(
        `El movimiento más notable: <b style="color:#0f1729;">${digest.topMover.name}</b> ${
          digest.topMover.mentionDelta > 0 ? "ha ganado" : "ha perdido"
        } ${Math.abs(digest.topMover.mentionDelta)} mención${
          Math.abs(digest.topMover.mentionDelta) === 1 ? "" : "es"
        } esta semana.`
      )
    : "";

  const recommendationHtml = digest.recommendation
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;background:#eef2ff;border-radius:12px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#4f46e5;">Recomendación destacada</div>
          <div style="margin-top:6px;font-size:14.5px;line-height:1.5;color:#0f1729;font-weight:700;">${digest.recommendation.title}</div>
        </td></tr>
      </table>`
    : "";

  await sendEmail(
    to,
    `Tu resumen semanal de ${projectDomain}`,
    wrap(
      `
      ${eyebrow("Resumen semanal")}
      ${heading(`Cómo ha ido ${projectDomain} esta semana`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#f7f8fb;border:1px solid #eef0f4;border-radius:14px;">
        <tr>
          <td style="padding:22px 24px;vertical-align:middle;">
            <div style="font-size:12.5px;color:#6b7385;font-weight:600;">Tu GEO Score</div>
            <div style="font-size:46px;font-weight:800;color:#0f1729;line-height:1;letter-spacing:-.03em;margin-top:6px;font-variant-numeric:tabular-nums;">${Math.round(
              digest.currentScore
            )}</div>
          </td>
          <td style="padding:22px 24px;vertical-align:middle;text-align:right;">
            <span style="display:inline-block;background:${pill.bg};color:${pill.ink};font-weight:700;font-size:14px;padding:7px 13px;border-radius:999px;">${pill.label}</span>
            <div style="font-size:12.5px;color:#6b7385;margin-top:8px;">vs. la semana pasada</div>
          </td>
        </tr>
      </table>
      ${moverHtml}
      ${recommendationHtml}
      ${button("https://www.genscore.es/dashboard", "Ver el detalle completo")}
    `,
      notificationsFooter("este resumen")
    )
  );
}

export async function sendAccountDeletedEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Tu cuenta de GenScore se ha eliminado correctamente",
    wrap(`
      ${eyebrow("Cuenta eliminada")}
      ${heading("Tu cuenta se ha eliminado correctamente")}
      ${paragraph(
        "Confirmamos que tu cuenta y todos tus datos —dominios, escaneos, prompts, competidores y recomendaciones— se han eliminado de forma permanente."
      )}
      ${paragraph(
        'Si no has sido tú, escríbenos de inmediato a <a href="mailto:soporte@genscore.es" style="color:#4f46e5;text-decoration:none;font-weight:600;">soporte@genscore.es</a>.'
      )}
    `)
  );
}
