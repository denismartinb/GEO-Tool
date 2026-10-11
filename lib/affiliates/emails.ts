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
import { suggestAffiliateCode, type AffiliateApplication } from "@/lib/affiliates/request";
import type { AffiliateReport, ExclusionReason, ReportPeriod } from "@/lib/affiliates/report";
import {
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_COOKIE_DAYS,
  AFFILIATE_PAYOUT_MIN_EUR,
  formatCommissionRate
} from "@/lib/affiliates/terms";

/**
 * AFFILIATES-1 — the two emails an application sends. Both return whether
 * Resend accepted them: the success screen depends on the operator email
 * (`.claude/rules/server-actions.md`, "No fake success states").
 */

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

export function buildAffiliateOpsEmail(
  application: AffiliateApplication,
  input: { requestedAt: Date; source: string | null }
) {
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #EEF1F6;font-size:12.5px;color:#5B6B82;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:9px 0 9px 14px;border-top:1px solid #EEF1F6;font-size:13.5px;color:#0B1426;${strong ? "font-weight:700;" : ""}word-break:break-word;">${value}</td>
    </tr>`;

  const code = suggestAffiliateCode(application);
  const rows = [
    row("Nombre", escapeHtml(application.name)),
    row("Email", escapeHtml(application.email)),
    row("Web, newsletter o perfil", escapeHtml(application.channel)),
    row("Recibida", `${escapeHtml(formatMadrid(input.requestedAt))} · ${input.requestedAt.toISOString()}`),
    row("Origen", input.source ? escapeHtml(input.source) : "Directo o sin UTM"),
    row("Código sugerido", escapeHtml(code), true)
  ].join("");

  return {
    subject: `[Afiliados] Solicitud de ${application.name.slice(0, 60)}`,
    html: wrap(
      `
      ${eyebrow("Afiliados · sólo equipo GenScore")}
      ${heading("Nueva solicitud de afiliado")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
        ${rows}
      </table>
      ${paragraph(`<strong>Si das el visto bueno:</strong> añade el código a <code>AFFILIATE_CODES</code> en Vercel (separado por comas) y mándale su enlace, por ejemplo <strong>https://www.genscore.es/?ref=${escapeHtml(code)}</strong>. Un código que no esté en esa variable se ignora: no guarda cookie ni llega a Stripe.`)}
      ${subtext("Responder a este correo le escribe directamente al solicitante. Este correo es el único registro de la solicitud.")}
    `,
      {
        footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es",
        preheader: `${escapeHtml(application.name)} quiere ser afiliado`
      }
    )
  };
}

export function buildAffiliateConfirmationEmail(application: AffiliateApplication) {
  const rate = formatCommissionRate();
  return {
    subject: "Hemos recibido tu solicitud de afiliado de GenScore",
    html: wrap(
      `
      ${eyebrow("Programa de afiliados")}
      ${heading(`Gracias, ${escapeHtml(application.name)}`)}
      ${paragraph(`Hemos recibido tu solicitud para recomendar GenScore desde <strong style="color:#0B1426;">${escapeHtml(application.channel)}</strong>. La revisamos y, si encaja, te escribimos a este correo con tu enlace propio.`)}
      <div style="margin:22px 0 0;border:1px solid #E1E6EF;border-radius:10px;padding:16px 18px;font-size:14.5px;line-height:1.55;color:#3B4759;">
        <strong style="color:#0B1426;">Las condiciones, en corto</strong><br>
        ${rate} de lo que paga cada cuenta Pro que traigas, sin IVA, durante ${AFFILIATE_COMMISSION_MONTHS} meses. Tu enlace vale ${AFFILIATE_COOKIE_DAYS} días. La prueba gratuita y los reembolsos no generan comisión. Pagamos por transferencia a partir de ${AFFILIATE_PAYOUT_MIN_EUR} € acumulados, con tu factura.
      </div>
      ${paragraph("Si tienes cualquier duda, responde a este correo.<br><br>Un saludo,<br>El equipo de GenScore")}
    `,
      {
        footerHtml: `Recibes este correo porque se envió una solicitud de afiliado con esta dirección en genscore.es. Si no fuiste tú, ignóralo. <a href="https://www.genscore.es/privacidad" style="${FOOTER_LINK_STYLE}">Política de privacidad</a><br>GenScore · genscore.es`,
        preheader: "La revisamos y te escribimos con tu enlace"
      }
    )
  };
}

export async function sendAffiliateOpsEmail(
  application: AffiliateApplication,
  input: { requestedAt: Date; source: string | null }
): Promise<boolean> {
  const to = getOpsAddress();
  if (!to) return false;
  const { subject, html } = buildAffiliateOpsEmail(application, input);
  // Reply-To the applicant: answering this email writes to them directly (log §272).
  return sendEmail(to, subject, html, undefined, application.email);
}

export async function sendAffiliateConfirmationEmail(application: AffiliateApplication): Promise<boolean> {
  const { subject, html } = buildAffiliateConfirmationEmail(application);
  // Replies go to support by default (`sendEmail`).
  return sendEmail(application.email, subject, html);
}

const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  not_pro: "no es del plan Pro",
  no_charge: "no cobró nada",
  outside_12_months: `pasados los ${AFFILIATE_COMMISSION_MONTHS} meses desde el primer pago`,
  first_payment_unknown: "no se encontró el primer pago de la suscripción",
  non_eur: "no está en euros"
};

export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * The monthly report to the operator. Sent even when nobody earned anything
 * («sin comisiones este mes»): an empty month and a cron that never ran must
 * not look the same in the inbox.
 */
export function buildAffiliateReportEmail(report: AffiliateReport) {
  const cell = (value: string, align: "left" | "right" = "left", strong = false) =>
    `<td style="padding:8px 6px;border-top:1px solid #EEF1F6;font-size:13px;color:#0B1426;text-align:${align};${strong ? "font-weight:700;" : ""}vertical-align:top;">${value}</td>`;
  const head = (value: string, align: "left" | "right" = "left") =>
    `<th style="padding:6px;font-size:11.5px;color:#5B6B82;text-align:${align};font-weight:600;">${value}</th>`;

  const period = escapeHtml(report.period.label);
  const floor = `${AFFILIATE_PAYOUT_MIN_EUR} €`;

  const summary =
    report.affiliates.length === 0
      ? paragraph(
          `<strong>Sin comisiones este mes.</strong> Ninguna factura de Pro pagada en ${period} lleva código de afiliado dentro de sus ${AFFILIATE_COMMISSION_MONTHS} meses.`
        )
      : `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-collapse:collapse;">
        <tr>${head("Código")}${head("Facturas", "right")}${head("Base sin IVA", "right")}${head(`Comisión ${formatCommissionRate()}`, "right")}${head("Acumulado")}</tr>
        ${report.affiliates
          .map(
            (a) =>
              `<tr>${cell(escapeHtml(a.code), "left", true)}${cell(String(a.lines.length), "right")}${cell(formatEurCents(a.baseCents), "right")}${cell(formatEurCents(a.commissionCents), "right", true)}${cell(
                a.reachesPayoutFloor
                  ? `Este mes ya llega a ${floor}: se puede pagar con su factura.`
                  : `Este mes no llega a ${floor}: súmalo a lo pendiente de meses anteriores.`
              )}</tr>`
          )
          .join("")}
      </table>
      ${paragraph(`<strong>Total del mes:</strong> ${formatEurCents(report.totalCommissionCents)}`)}`;

  const details = report.affiliates
    .map(
      (a) => `
      <p style="margin:18px 0 4px;font-size:13px;font-weight:700;color:#0B1426;">${escapeHtml(a.code)}</p>
      <ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.6;color:#3B4759;">
        ${a.lines
          .map(
            (l) =>
              `<li>${escapeHtml(l.invoiceNumber ?? l.invoiceId)} · ${new Date(l.paidAt * 1000).toISOString().slice(0, 10)} · base ${formatEurCents(l.baseCents)} → ${formatEurCents(l.commissionCents)}${l.refundedCents > 0 ? ` (reembolsado ${formatEurCents(l.refundedCents)})` : ""}</li>`
          )
          .join("")}
      </ul>`
    )
    .join("");

  const excluded =
    report.excluded.length === 0
      ? ""
      : `
      <p style="margin:22px 0 4px;font-size:13px;font-weight:700;color:#0B1426;">Facturas con código que no cuentan</p>
      <ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.6;color:#3B4759;">
        ${report.excluded.map((e) => `<li>${escapeHtml(e.code)} · ${escapeHtml(e.invoiceId)} · ${EXCLUSION_LABELS[e.reason]}</li>`).join("")}
      </ul>`;

  return {
    subject:
      report.affiliates.length === 0
        ? `[Afiliados] ${report.period.label}: sin comisiones este mes`
        : `[Afiliados] ${report.period.label}: ${formatEurCents(report.totalCommissionCents)} en comisiones`,
    html: wrap(
      `
      ${eyebrow("Afiliados · sólo equipo GenScore")}
      ${heading(`Comisiones de ${period}`)}
      ${summary}
      ${details}
      ${excluded}
      ${subtext(`Facturas de Pro pagadas en ${period} (hora de Madrid) cuya suscripción lleva código de afiliado, dentro de los ${AFFILIATE_COMMISSION_MONTHS} meses desde su primer pago. Base = lo cobrado menos el IVA, menos la parte reembolsada. Este informe no guarda histórico: lo pendiente de meses anteriores lo llevas tú. Un reembolso posterior a hoy no se descuenta aquí.`)}
    `,
      {
        footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es",
        preheader: `Informe de afiliados de ${report.period.label}`
      }
    )
  };
}

export type AffiliateReportFailure = { period: ReportPeriod; reason: "not_configured" | "source_failed" };

export function buildAffiliateReportFailureEmail(input: AffiliateReportFailure) {
  const why =
    input.reason === "not_configured"
      ? "Falta la conexión con Stripe (STRIPE_SECRET_KEY) o el precio de Pro (STRIPE_PRICE_ID_PRO)."
      : "Stripe no respondió bien al leer las facturas. Puedes relanzarlo llamando a /api/cron/affiliate-report con el CRON_SECRET.";
  return {
    subject: `[Afiliados] No se pudo generar el informe de ${input.period.label}`,
    html: wrap(
      `
      ${eyebrow("Afiliados · sólo equipo GenScore")}
      ${heading("El informe de afiliados no se ha generado")}
      ${paragraph(escapeHtml(why))}
    `,
      { footerHtml: "Aviso interno — sólo lo recibe el equipo operador de GenScore.<br>GenScore · genscore.es" }
    )
  };
}

export async function sendAffiliateReportEmail(report: AffiliateReport): Promise<boolean> {
  const to = getOpsAddress();
  if (!to) return false;
  const { subject, html } = buildAffiliateReportEmail(report);
  return sendEmail(to, subject, html);
}

export async function sendAffiliateReportFailureEmail(input: AffiliateReportFailure): Promise<boolean> {
  const to = getOpsAddress();
  if (!to) return false;
  const { subject, html } = buildAffiliateReportFailureEmail(input);
  return sendEmail(to, subject, html);
}
