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
import { getOpsAddress } from "@/lib/free-report/emails";
import type { DemoRequest } from "@/lib/demo/request";
import { formatDemoSlot } from "@/lib/demo/slots";

/**
 * DEMO-CALL-1 — the two emails a call request sends. Both return whether
 * Resend accepted them; the visitor's success screen depends on the first.
 */

export function buildDemoOpsEmail(request: DemoRequest, input: { requestedAt: Date; source: string | null }) {
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #EEF1F6;font-size:12.5px;color:#5B6B82;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:9px 0 9px 14px;border-top:1px solid #EEF1F6;font-size:13.5px;color:#0B1426;${strong ? "font-weight:700;" : ""}word-break:break-word;">${value}</td>
    </tr>`;
  const when = formatDemoSlot(request.slot);

  const rows = [
    row("Hueco pedido", `${escapeHtml(when)} (hora de Madrid, 20 min)`, true),
    row("Nombre", escapeHtml(request.name)),
    row("Email", escapeHtml(request.email)),
    row("Web", escapeHtml(request.domain)),
    row("Qué quiere ver", request.topic ? escapeHtml(request.topic) : "No lo ha dicho"),
    row("Origen", input.source ? escapeHtml(input.source) : "Directo o sin UTM"),
    row("Pedido", escapeHtml(input.requestedAt.toISOString()))
  ].join("");

  return {
    subject: `[Videollamada] ${request.domain} · ${when}`,
    html: wrap(
      `
      ${eyebrow("Videollamada · sólo equipo GenScore")}
      ${heading("Nueva solicitud de videollamada")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
        ${rows}
      </table>
      ${paragraph("<strong>Siguiente paso:</strong> crea el evento en Google Calendar con Meet e invita a este email. Si el hueco no te viene bien, responde a este correo (le llega a la persona) y propón otro.")}
      ${subtext("A la persona ya le ha llegado un correo diciendo que su solicitud está recibida y que la invitación se la enviamos nosotros. Hasta que la reciba, no está confirmada.")}
    `,
      {
        footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es",
        preheader: `${request.name} quiere una videollamada el ${when}`
      }
    )
  };
}

export function buildDemoConfirmationEmail(request: DemoRequest) {
  const when = escapeHtml(formatDemoSlot(request.slot));
  return {
    subject: `Tu videollamada con GenScore: ${formatDemoSlot(request.slot)}`,
    html: wrap(
      `
      ${eyebrow("Videollamada · 20 minutos")}
      ${heading("Hemos recibido tu solicitud")}
      ${paragraph(`Hola, ${escapeHtml(request.name)}. Has pedido una videollamada el <strong style="color:#0B1426;">${when}</strong> (hora de Madrid).`)}
      ${paragraph("Te enviaremos la invitación con el enlace de la videollamada a este correo. Si ese hueco ya no estuviera libre, te propondremos otro cercano.")}
      <div style="margin:22px 0 0;border:1px solid #E1E6EF;border-radius:10px;padding:16px 18px;font-size:14.5px;line-height:1.55;color:#3B4759;">
        <strong style="color:#0B1426;">Para aprovechar los 20 minutos</strong><br>
        Si hay un competidor que te preocupa o una pregunta que tus clientes hacen a la IA, responde a este correo y la traeremos preparada.
      </div>
      ${paragraph("Un saludo,<br>El equipo de GenScore")}
    `,
      {
        footerHtml: `Recibes este correo porque se pidió una videollamada en genscore.es con esta dirección. Si no fuiste tú, ignóralo. <a href="https://www.genscore.es/privacidad" style="${FOOTER_LINK_STYLE}">Política de privacidad</a><br>GenScore · genscore.es`,
        preheader: "Te enviaremos la invitación con el enlace"
      }
    )
  };
}

export async function sendDemoOpsEmail(request: DemoRequest, input: { requestedAt: Date; source: string | null }): Promise<boolean> {
  const to = getOpsAddress();
  if (!to) return false;
  const { subject, html } = buildDemoOpsEmail(request, input);
  // Reply-To the requester: answering this email writes to them directly.
  return sendEmail(to, subject, html, undefined, request.email);
}

export async function sendDemoConfirmationEmail(request: DemoRequest): Promise<boolean> {
  const { subject, html } = buildDemoConfirmationEmail(request);
  return sendEmail(request.email, subject, html);
}
