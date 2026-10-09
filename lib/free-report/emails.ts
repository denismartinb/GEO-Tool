import "server-only";

import {
  escapeHtml,
  eyebrow,
  FOOTER_LINK_STYLE,
  heading,
  paragraph,
  sendEmail,
  subtext,
  wrap
} from "@/lib/email/transactional";
import type { FreeReportRequest } from "@/lib/free-report/request";

/**
 * FREE-REPORT-1 Fase 1 — the two emails a report request sends.
 *
 * Both return whether Resend accepted them, because the action's success
 * screen depends on the operator email: a request the operator never sees is
 * a request nobody will answer, and telling the visitor «recibido» then would
 * be a fake success (`.claude/rules/server-actions.md`).
 */

const SUPPORT_ADDRESS = "soporte@genscore.es";

export function getOpsAddress(): string | null {
  const raw = process.env.OPS_ALERT_EMAIL?.trim();
  return raw ? raw : null;
}

/** Adds `hours` counting only Monday–Friday (UTC days): 48 = two working days. Close enough for a deadline line. */
export function addWorkingHours(from: Date, hours: number): Date {
  const result = new Date(from);
  let remaining = hours;
  while (remaining > 0) {
    result.setUTCHours(result.getUTCHours() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

function formatMadrid(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function buildOpsEmail(request: FreeReportRequest, input: { requestedAt: Date; source: string | null }) {
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #EEF1F6;font-size:12.5px;color:#5B6B82;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:9px 0 9px 14px;border-top:1px solid #EEF1F6;font-size:13.5px;color:#0B1426;${strong ? "font-weight:700;" : ""}word-break:break-word;">${value}</td>
    </tr>`;

  const deadline = addWorkingHours(input.requestedAt, 48);
  const studyUrl = `https://www.genscore.es/admin/estudio`;

  const rows = [
    row("Dominio", escapeHtml(request.domain)),
    row("Email", escapeHtml(request.email)),
    row("Qué vende", escapeHtml(request.business)),
    row(
      "Comunicaciones",
      request.marketingConsent
        ? "Sí, marcó la casilla de consejos y novedades"
        : "No — sólo el informe y lo necesario para atenderle"
    ),
    row("Pedido", `${escapeHtml(formatMadrid(input.requestedAt))} · ${input.requestedAt.toISOString()}`),
    row("Origen", input.source ? escapeHtml(input.source) : "Directo o sin UTM"),
    row("Entregar antes de", escapeHtml(formatMadrid(deadline)), true)
  ].join("");

  return {
    subject: `[Informe gratis] ${request.domain} · ${request.business.slice(0, 80)}`,
    html: wrap(
      `
      ${eyebrow("Informe gratis · sólo equipo GenScore")}
      ${heading("Nueva petición de informe")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
        ${rows}
      </table>
      ${paragraph(`<strong>Siguiente paso:</strong> lanza el estudio en modo «Una marca» con este dominio y esta descripción en <a href="${studyUrl}" style="${FOOTER_LINK_STYLE}">/admin/estudio</a>, y pasa el JSON al hilo de outreach para curarlo.`)}
      ${subtext("Al solicitante ya le ha llegado la confirmación con el plazo de 48 h laborables. Este correo es también el registro de su consentimiento: no se guarda en ningún otro sitio en esta fase.")}
    `,
      {
        footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es",
        preheader: `${request.domain} pide su informe`
      }
    )
  };
}

export function buildConfirmationEmail(request: FreeReportRequest) {
  const domain = escapeHtml(request.domain);
  return {
    subject: `Tu informe GEO de ${request.domain} está en marcha`,
    html: wrap(
      `
      ${eyebrow("Informe GEO gratuito")}
      ${heading("Hemos recibido tu petición")}
      ${paragraph(`Ya estamos preparando el informe de <strong style="color:#0B1426;">${domain}</strong>. Vamos a hacer a ChatGPT, Gemini y Claude las preguntas principales de búsqueda de tu sector («${escapeHtml(request.business)}») y a ver a quién recomiendan, qué fuentes citan y si tu web está preparada para ellos.`)}
      ${paragraph("Repetimos las búsquedas en distintos momentos y una persona revisa cada informe antes de enviarlo. Lo tendrás en este correo en 48 h laborables.")}
      <div style="margin:22px 0 0;border:1px solid #E1E6EF;border-radius:10px;padding:16px 18px;font-size:14.5px;line-height:1.55;color:#3B4759;">
        <strong style="color:#0B1426;">¿Algo que debamos saber?</strong><br>
        Si hay un competidor que te preocupa o una pregunta que te interesa especialmente, responde a este correo y la tendremos en cuenta.
      </div>
      ${paragraph("Un saludo,<br>El equipo de GenScore")}
    `,
      {
        footerHtml: `Recibes este correo porque se pidió un informe de ${domain} en genscore.es. Si no fuiste tú, ignóralo. <a href="https://www.genscore.es/privacidad" style="${FOOTER_LINK_STYLE}">Política de privacidad</a><br>GenScore · genscore.es`,
        preheader: `Lo recibirás en 48 h laborables`
      }
    )
  };
}

export async function sendFreeReportOpsEmail(
  request: FreeReportRequest,
  input: { requestedAt: Date; source: string | null }
): Promise<boolean> {
  const to = getOpsAddress();
  if (!to) return false;
  const { subject, html } = buildOpsEmail(request, input);
  // Reply-To the requester: answering this email writes to them directly.
  return sendEmail(to, subject, html, { "Reply-To": request.email });
}

export async function sendFreeReportConfirmationEmail(request: FreeReportRequest): Promise<boolean> {
  const { subject, html } = buildConfirmationEmail(request);
  return sendEmail(request.email, subject, html, { "Reply-To": SUPPORT_ADDRESS });
}
