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

const wrap = (bodyHtml: string) => `
  <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;">
    <p style="font-weight: 700; font-size: 18px; margin-bottom: 24px;">GenScore</p>
    ${bodyHtml}
    <p style="margin-top: 32px; font-size: 13px; color: #6b7280;">
      ¿Dudas? Escríbenos a <a href="mailto:soporte@genscore.es">soporte@genscore.es</a>.
    </p>
  </div>
`;

export async function sendWelcomeEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Bienvenido a GenScore — tu prueba de Pro ya está activa",
    wrap(`
      <p>Tu cuenta ya está lista, con acceso completo a <b>Pro</b> durante 7 días — sin necesidad de tarjeta.</p>
      <p>En estos días puedes: monitorizar tus prompts en ChatGPT/Gemini/Claude, comparar con tu competencia, y
      generar recomendaciones accionables para mejorar tu visibilidad.</p>
      <p><a href="https://www.genscore.es/dashboard">Entra a tu cuenta</a></p>
    `)
  );
}

export async function sendPlanConfirmedEmail(to: string, planName: string): Promise<void> {
  await sendEmail(
    to,
    `Tu plan ${planName} ya está activo`,
    wrap(`
      <p>Hemos confirmado tu pago — tu cuenta ya tiene acceso completo al plan <b>${planName}</b>.</p>
      <p><a href="https://www.genscore.es/dashboard/settings/billing">Ver mi facturación</a></p>
    `)
  );
}

export async function sendPaymentFailedEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "No hemos podido cobrar tu suscripción de GenScore",
    wrap(`
      <p>El último cobro de tu suscripción no se ha podido completar. Revisa tu método de pago para que tu plan
      no se vea interrumpido.</p>
      <p><a href="https://www.genscore.es/dashboard/settings/billing">Actualizar método de pago</a></p>
    `)
  );
}

export async function sendTrialEndedEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Tu prueba de Pro ha terminado",
    wrap(`
      <p>Tus 7 días de prueba de <b>Pro</b> han terminado y tu cuenta ha pasado a <b>Free</b>. Tus dominios y
      escaneos siguen ahí — no hemos borrado nada.</p>
      <p><a href="https://www.genscore.es/dashboard/settings/billing">Ver planes</a></p>
    `)
  );
}

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

export async function sendCancellationScheduledEmail(to: string, activeUntil: Date): Promise<void> {
  await sendEmail(
    to,
    "Tu suscripción de GenScore se cancelará al final de tu periodo",
    wrap(`
      <p>Hemos registrado tu cancelación. Tu plan sigue activo, con todas sus funciones, hasta el
      <b>${dateFormatter.format(activeUntil)}</b> — no se te volverá a cobrar después de esa fecha.</p>
      <p>¿Cambiaste de idea? Puedes reactivarlo en cualquier momento antes de esa fecha.</p>
      <p><a href="https://www.genscore.es/dashboard/settings/billing">Ver mi facturación</a></p>
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
    wrap(`
      <p>Tu GEO Score de <b>${projectDomain}</b> ha pasado de <b>${Math.round(previousScore)}</b> a
      <b>${Math.round(currentScore)}</b> en el último escaneo.</p>
      <p>Puede deberse a un cambio real de visibilidad en las respuestas de IA, o a variación normal entre
      escaneos. Revisa el detalle y las recomendaciones para entender qué ha cambiado.</p>
      <p><a href="https://www.genscore.es/dashboard">Ver mi cuenta</a></p>
      <p style="font-size: 13px; color: #666;">Puedes desactivar este aviso en Ajustes → Notificaciones.</p>
    `)
  );
}

export async function sendAccountDeletedEmail(to: string): Promise<void> {
  await sendEmail(
    to,
    "Tu cuenta de GenScore se ha eliminado correctamente",
    wrap(`
      <p>Confirmamos que tu cuenta y todos tus datos —dominios, escaneos, prompts, competidores y
      recomendaciones— se han eliminado de forma permanente.</p>
      <p>Si no has sido tú, escríbenos de inmediato a <a href="mailto:soporte@genscore.es">soporte@genscore.es</a>.</p>
    `)
  );
}
