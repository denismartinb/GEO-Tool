import "server-only";

import {
  button,
  checklist,
  escapeHtml,
  eyebrow,
  FOOTER_LINK_STYLE,
  heading,
  optionalEmailEnvelope,
  paragraph,
  PREFERENCES_URL,
  scoreBar,
  sectionLabel,
  sendEmail,
  statCell,
  statRow,
  subtext,
  wrap
} from "@/lib/email/transactional";
import { buildUnsubscribeLinks } from "@/lib/email/unsubscribe";
import { SITE_URL } from "@/lib/seo/metadata";

/**
 * LIFECYCLE-TRIAL-1 (log §233). The trial sequence, built with the same
 * blocks as every other GenScore email and laid out as the founder approved
 * it (`docs/design-reference/lifecycle-emails-1/`).
 *
 * Two rules every template here keeps:
 * - Every figure comes from the caller, read from the account's real data at
 *   send time. There is no default number anywhere in this file; when a
 *   figure is missing, the template takes its variant without it.
 * - Everything that came from outside this codebase — a domain, a
 *   competitor's name, a recommendation's text — goes through `escapeHtml`.
 *
 * Each sender returns whether Resend accepted the email, so the runner can
 * record the send only when it happened.
 */

const H = (value: string): string => escapeHtml(value);

export type RunSnapshot = {
  projectId: string;
  domain: string;
  geoScore: number;
  runDate: Date;
  brandMentions: number;
  answers: number;
  topCompetitor: { name: string; mentions: number } | null;
  activeRecommendations: number;
};

export type TopRecommendation = { title: string; description: string; engines: string[] };

/** A price to quote, resolved by the caller from `PLANS` and the live promo. */
export type PlanOffer = {
  planName: string;
  price: number;
  /** Present only while the launch promo can really be redeemed at checkout. */
  promo: { price: number; months: number; endsLabel: string } | null;
};

const dateLong = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "Europe/Madrid" });
const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });

export function formatDateLong(date: Date): string {
  return dateLong.format(date);
}

export function formatWeekday(date: Date): string {
  return weekday.format(date);
}

function url(path: string, campaign: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${SITE_URL}${path}${separator}utm_source=email&utm_medium=lifecycle&utm_campaign=${campaign}`;
}

/**
 * The footer and headers of a commercial (`lifecycle`) email. `null` when no
 * signed unsubscribe link can be built — and then the email is not sent at
 * all: never a commercial email without a working way out (log §232).
 */
function lifecycleEnvelope(userId: string): { footerHtml: string; headers: Record<string, string> } | null {
  const links = buildUnsubscribeLinks(userId, "lifecycle");
  if (!links) return null;
  return {
    footerHtml: `Recibes este email porque creaste una cuenta en GenScore. <a href="${links.pageUrl}" style="${FOOTER_LINK_STYLE}">Darme de baja de consejos y ofertas</a> · <a href="${PREFERENCES_URL}" style="${FOOTER_LINK_STYLE}">Preferencias de email</a><br>GenScore · Visibilidad de marca en respuestas de IA · genscore.es`,
    headers: {
      "List-Unsubscribe": `<${links.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  };
}

/* ------------------------------------------------------------------ blocks */

export function versusBars(rows: Array<{ label: string; count: number; total: number; isBrand: boolean }>, caption: string): string {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const body = rows
    .map((row) => {
      const pct = Math.max(2, Math.round((row.count / max) * 100));
      const color = row.isBrand ? "#2563EB" : "#94A1B5";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>
        <td style="font-size:13.5px;color:${row.isBrand ? "#0B1426" : "#3B4759"};font-weight:${row.isBrand ? 800 : 600};">${row.label}</td>
        <td align="right" style="font-size:13.5px;font-weight:800;color:#0B1426;font-variant-numeric:tabular-nums;">${row.count} <span style="font-weight:500;color:#5B6B82;">de ${row.total}</span></td></tr>
        <tr><td colspan="2" style="padding-top:6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="background:${color};width:${pct}%;height:8px;font-size:0;border-radius:4px 0 0 4px;">&nbsp;</td>
        <td style="background:#E7EAF0;width:${100 - pct}%;height:8px;font-size:0;border-radius:0 4px 4px 0;">&nbsp;</td></tr></table></td></tr></table>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#F7F8FB;border:1px solid #E7EAF0;border-radius:14px;"><tr><td style="padding:18px 20px 16px;"><div style="font-size:12.5px;color:#5B6B82;font-weight:600;margin-bottom:6px;">${caption}</div>${body}</td></tr></table>`;
}

export function priceBox(offer: PlanOffer): string {
  if (!offer.promo) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border:1px solid #E7EAF0;border-radius:16px;"><tr><td style="padding:20px 22px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2563EB;">Plan ${H(offer.planName)}</div>
      <div style="margin-top:10px;"><span class="em-score-num" style="font-size:42px;font-weight:800;color:#0B1426;letter-spacing:-.03em;">${offer.price} €</span><span style="font-size:15px;color:#5B6B82;font-weight:600;">/mes</span></div>
      <div style="font-size:13px;color:#3B4759;margin-top:4px;">Sin permanencia: cancelas cuando quieras desde Facturación.</div>
    </td></tr></table>`;
  }
  const off = Math.round(((offer.price - offer.promo.price) / offer.price) * 100);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border:2px solid #2563EB;border-radius:16px;"><tr><td style="padding:20px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2563EB;">Precio de lanzamiento · ${H(offer.planName)}</td>
      <td align="right"><span style="display:inline-block;background:#E7F6EE;color:#15915A;font-weight:800;font-size:12.5px;padding:4px 10px;border-radius:999px;">−${off}%</span></td>
    </tr></table>
    <div style="margin-top:10px;"><span style="font-size:18px;color:#94A1B5;text-decoration:line-through;font-weight:700;">${offer.price} €</span><span class="em-score-num" style="font-size:42px;font-weight:800;color:#0B1426;letter-spacing:-.03em;padding-left:10px;">${offer.promo.price} €</span><span style="font-size:15px;color:#5B6B82;font-weight:600;">/mes</span></div>
    <div style="font-size:13px;color:#3B4759;margin-top:4px;">Durante ${offer.promo.months} meses. Después, ${offer.price} €/mes. Sin permanencia: cancelas cuando quieras desde Facturación.</div>
    <div style="margin-top:12px;font-size:13px;font-weight:700;color:#A8660B;">Disponible hasta el ${offer.promo.endsLabel}</div>
  </td></tr></table>`;
}

function offerPriceLabel(offer: PlanOffer): string {
  return `${offer.promo ? offer.promo.price : offer.price} €/mes`;
}

/**
 * What changes when the trial ends, from `PLANS` via the caller: the rows
 * are the real Pro vs Free caps, never a marketing list typed here.
 */
export function lossTable(rows: Array<{ label: string; pro: string; free: string }>, freeFromLabel: string): string {
  const head = (text: string, color: string) =>
    `<td style="padding:10px 14px;background:#F7F8FB;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${color};">${text}</td>`;
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:10px 14px;border-top:1px solid #EEF1F6;font-size:13.5px;color:#3B4759;">${r.label}</td><td style="padding:10px 14px;border-top:1px solid #EEF1F6;font-size:13.5px;color:#0B1426;font-weight:700;">${r.pro}</td><td style="padding:10px 14px;border-top:1px solid #EEF1F6;font-size:13.5px;color:#5B6B82;">${r.free}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;border:1px solid #E7EAF0;border-radius:14px;overflow:hidden;"><tr>${head("", "#5B6B82")}${head("Pro, hoy", "#2563EB")}${head(`Free, desde el ${freeFromLabel}`, "#D23B48")}</tr>${body}</table>`;
}

/*
 * No testimonial in any email. The quote that used to live here (a named person, a company and a
 * growth figure, commented as "confirmed as real") was INVENTED — confirmed by the founder on 2026-10-08. It is NOT
 * replaced with another customer, anonymised or kept as a figure: an email may carry a testimonial again only when
 * the original evidence and the customer's consent are on record.
 */

function recommendationCard(rec: TopRecommendation): string {
  const engines = rec.engines.length
    ? ` <span style="display:inline-block;background:#fff;color:#3B4759;font-weight:600;font-size:11.5px;padding:3px 9px;border-radius:999px;">Respaldada por ${H(rec.engines.join(" y "))}</span>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#E9EFFD;border-radius:14px;"><tr><td style="padding:18px 20px;">
    <span style="display:inline-block;background:#fff;color:#2563EB;font-weight:700;font-size:11.5px;padding:3px 9px;border-radius:999px;">Prioridad alta</span>${engines}
    <div style="margin-top:12px;font-size:16px;line-height:1.4;color:#0B1426;font-weight:800;">${H(rec.title)}</div>
    <div style="margin-top:6px;font-size:14px;line-height:1.55;color:#3B4759;">${H(rec.description)}</div>
  </td></tr></table>`;
}

/* ---------------------------------------------------------------- emails */

/**
 * Primer escaneo listo — product alert (`first_scan`), not commercial: the
 * customer launched that scan and is waiting for it. Once per account.
 */
export async function sendFirstScanReadyEmail(to: string, userId: string, snap: RunSnapshot): Promise<boolean> {
  const domain = H(snap.domain);
  const noMentions = snap.brandMentions === 0;
  const subject = noMentions
    ? `${snap.domain}: la IA todavía no te nombra`
    : `${snap.domain}: la IA te menciona en ${snap.brandMentions} de ${snap.answers} respuestas`;

  const rows = [
    ...(snap.topCompetitor
      ? [{ label: H(snap.topCompetitor.name), count: snap.topCompetitor.mentions, total: snap.answers, isBrand: false }]
      : []),
    { label: `${domain} (tú)`, count: snap.brandMentions, total: snap.answers, isBrand: true }
  ];

  const comparison =
    snap.topCompetitor && snap.topCompetitor.mentions > snap.brandMentions
      ? paragraph(
          `${H(snap.topCompetitor.name)} aparece en más respuestas que tú. ${
            snap.activeRecommendations > 0
              ? `Ya tienes <b style="color:#0B1426;">${snap.activeRecommendations} ${snap.activeRecommendations === 1 ? "recomendación" : "recomendaciones"}</b> para cerrar esa distancia, ordenadas por impacto.`
              : "En tu panel verás en qué preguntas te adelanta."
          }`
        )
      : snap.activeRecommendations > 0
        ? paragraph(
            `Ya tienes <b style="color:#0B1426;">${snap.activeRecommendations} ${snap.activeRecommendations === 1 ? "recomendación" : "recomendaciones"}</b> para ganar visibilidad, ordenadas por impacto.`
          )
        : "";

  const envelope = optionalEmailEnvelope(userId, "first_scan");
  const html = wrap(
    `
    ${eyebrow("Primer escaneo listo", "#15915A")}
    ${heading(noMentions ? "Todavía no apareces. Es el mejor momento para empezar" : "Ya sabemos cómo te ve la IA")}
    ${paragraph(`Hemos preguntado a los motores de IA lo que preguntan tus clientes. Esto es lo que respondieron sobre <b style="color:#0B1426;">${domain}</b>.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#F7F8FB;border:1px solid #E7EAF0;border-radius:14px;">
      <tr><td style="padding:22px 24px;">
        <div style="font-size:12.5px;color:#5B6B82;font-weight:600;">Puntuación GEO</div>
        <div class="em-score-num" style="font-size:46px;font-weight:800;color:#0B1426;line-height:1;letter-spacing:-.03em;margin-top:6px;">${Math.round(snap.geoScore)}<span style="font-size:18px;color:#94A1B5;font-weight:700;"> / 100</span></div>
        ${scoreBar(Math.round(snap.geoScore), "#2563EB")}
      </td></tr>
    </table>
    ${versusBars(rows, "Respuestas en las que aparece cada marca")}
    ${comparison}
    ${button(url(`/dashboard/projects/${snap.projectId}`, "first_scan"), "Ver mi informe completo")}
    `,
    {
      footerHtml: envelope.footerHtml,
      preheader: noMentions
        ? "Tu primer escaneo ha terminado. Aún no apareces: esto es lo que puedes hacer."
        : `Tu primer escaneo ha terminado. Te mencionan en ${snap.brandMentions} de ${snap.answers} respuestas.`
    }
  );
  return sendEmail(to, subject, html, envelope.headers);
}

/** D1 · activación. Only reaches someone with no completed scan (schedule.ts). */
export async function sendTrialD1Email(
  to: string,
  userId: string,
  input: { variant: "no_domain" | "no_scan"; daysLeft: number; projectId: string | null; domain: string | null }
): Promise<boolean> {
  const envelope = lifecycleEnvelope(userId);
  if (!envelope) return false;

  const noDomain = input.variant === "no_domain" || !input.projectId;
  const subject = noDomain
    ? "Te falta un paso para ver cómo te menciona la IA"
    : `Tu primer escaneo de ${input.domain ?? "tu dominio"} está a un clic`;
  const html = wrap(
    `
    ${eyebrow(`Te quedan ${input.daysLeft} días de Pro`, "#A8660B")}
    ${heading(noDomain ? "Te falta un paso para ver cómo te menciona la IA" : "Tu primer escaneo está a un clic")}
    ${paragraph(
      noDomain
        ? "Ayer creaste tu cuenta, pero todavía no sabemos qué dominio analizar. Añádelo y en unos minutos verás si ChatGPT, Gemini y Claude te recomiendan, y a quién recomiendan en tu lugar."
        : `Ya tienes <b style="color:#0B1426;">${H(input.domain ?? "")}</b> configurado. Solo falta lanzar el escaneo: en unos minutos verás qué responde la IA sobre ti.`
    )}
    ${checklist(
      noDomain
        ? [
            { state: "done", text: "Crear tu cuenta" },
            { state: "now", text: "Añadir tu dominio", hint: "2 minutos. Competidores y preguntas se sugieren solos." },
            { state: "next", text: "Ver tu primer informe" }
          ]
        : [
            { state: "done", text: "Crear tu cuenta" },
            { state: "done", text: "Añadir tu dominio" },
            { state: "now", text: "Lanzar tu primer escaneo", hint: "Tarda unos minutos. Te avisamos por email al terminar." }
          ]
    )}
    ${button(
      noDomain ? url("/dashboard/projects/new", "trial_d1") : url(`/dashboard/projects/${input.projectId}`, "trial_d1"),
      noDomain ? "Añadir mi dominio" : "Lanzar mi primer escaneo"
    )}
    ${subtext('Si algo no te encaja, responde a este email y te ayudamos.')}
    `,
    {
      footerHtml: envelope.footerHtml,
      preheader: `Te quedan ${input.daysLeft} días de Pro. En unos minutos sabrás si la IA te recomienda.`
    }
  );
  return sendEmail(to, subject, html, envelope.headers);
}

/** D3 · primera acción, with the real top recommendation, or the no-scan variant. */
export async function sendTrialD3Email(
  to: string,
  userId: string,
  input: {
    daysLeft: number;
    projectId: string | null;
    domain: string | null;
    recommendation: TopRecommendation | null;
    otherRecommendations: number;
  }
): Promise<boolean> {
  const envelope = lifecycleEnvelope(userId);
  if (!envelope) return false;

  if (input.recommendation && input.projectId && input.domain) {
    const html = wrap(
      `
      ${eyebrow("Tu primera acción")}
      ${heading(`Lo primero que cambiaríamos en ${H(input.domain)}`)}
      ${paragraph("De todo lo que encontró tu escaneo, esta es la acción con más impacto:")}
      ${recommendationCard(input.recommendation)}
      ${paragraph('Con Pro, GenScore te <b style="color:#0B1426;">genera el contenido listo para publicar</b>: la FAQ, el marcado schema o el brief para tu equipo. No tienes que empezar de cero.')}
      ${button(url(`/dashboard/projects/${input.projectId}/recommendations`, "trial_d3"), "Ver la recomendación y generarla")}
      ${subtext(
        `${input.otherRecommendations > 0 ? `Tienes ${input.otherRecommendations} ${input.otherRecommendations === 1 ? "recomendación más" : "recomendaciones más"} en tu panel. ` : ""}Te quedan ${input.daysLeft} días de Pro.`
      )}
      `,
      { footerHtml: envelope.footerHtml, preheader: `Una acción concreta para ${input.domain}. Te quedan ${input.daysLeft} días de Pro.` }
    );
    return sendEmail(to, `Lo primero que cambiaríamos en ${input.domain}`, html, envelope.headers);
  }

  const html = wrap(
    `
    ${eyebrow(`Te quedan ${input.daysLeft} días de Pro`, "#A8660B")}
    ${heading("Tus clientes ya le preguntan a la IA por tu sector")}
    ${paragraph("Cada vez más gente pregunta a ChatGPT, Gemini o Claude antes de elegir proveedor. Sin tu primer escaneo no podemos decirte si apareces en esas respuestas ni a quién recomiendan en tu lugar.")}
    ${button(
      input.projectId ? url(`/dashboard/projects/${input.projectId}`, "trial_d3") : url("/dashboard/projects/new", "trial_d3"),
      input.projectId ? "Lanzar mi primer escaneo" : "Añadir mi dominio"
    )}
    ${subtext(`Si quieres entender antes cómo funciona, <a href="${url("/blog", "trial_d3")}" style="${FOOTER_LINK_STYLE}">lee nuestras guías</a>.`)}
    `,
    { footerHtml: envelope.footerHtml, preheader: `Te quedan ${input.daysLeft} días de Pro para saber si la IA te recomienda.` }
  );
  return sendEmail(to, "Tus clientes ya le preguntan a la IA por tu sector", html, envelope.headers);
}

/**
 * D5 · quedan 2 días. Fulfils the welcome email's promise of a warning before
 * the trial ends. The table and the prices come from the caller (`PLANS`,
 * live promo) — the loss is what really happens on the end date.
 */
export async function sendTrialD5Email(
  to: string,
  userId: string,
  input: {
    trialEndsAt: Date;
    domain: string | null;
    pro: PlanOffer;
    starter: PlanOffer;
    lossRows: Array<{ label: string; pro: string; free: string }>;
  }
): Promise<boolean> {
  const envelope = lifecycleEnvelope(userId);
  if (!envelope) return false;

  const endDay = formatWeekday(input.trialEndsAt);
  const endDate = formatDateLong(input.trialEndsAt);
  const who = input.domain ? `<b style="color:#0B1426;">${H(input.domain)}</b>` : "tu dominio";
  const starterPrice = input.starter.promo
    ? `${input.starter.promo.price} €/mes (antes ${input.starter.price} €) durante ${input.starter.promo.months} meses`
    : `${input.starter.price} €/mes`;

  const html = wrap(
    `
    ${eyebrow("Quedan 2 días", "#D23B48")}
    ${heading(`Tu prueba de Pro termina el ${endDay} ${endDate}`)}
    ${paragraph(`Desde ese día, ${who} dejará de escanearse a diario. Si un competidor te adelanta en las respuestas de la IA, no lo verás.`)}
    ${lossTable(input.lossRows, endDate)}
    ${priceBox(input.pro)}
    ${button(url("/dashboard/settings?openPlan=pro", "trial_d5"), `Mantener Pro por ${offerPriceLabel(input.pro)}`)}
    ${subtext(`¿Te basta con un escaneo semanal? <a href="${url("/dashboard/settings?openPlan=starter", "trial_d5")}" style="${FOOTER_LINK_STYLE}">Starter por ${starterPrice}</a>.`)}
    `,
    {
      footerHtml: envelope.footerHtml,
      preheader: input.pro.promo
        ? `Mantén Pro por ${input.pro.promo.price} €/mes (antes ${input.pro.price} €). Precio de lanzamiento hasta el ${input.pro.promo.endsLabel}.`
        : `Tu prueba termina el ${endDate}. Elige tu plan para seguir midiendo a diario.`
    }
  );
  return sendEmail(to, `Tu prueba de Pro termina el ${endDay}`, html, envelope.headers);
}

/* ------------------------------------------- fin de prueba y recuperación */

const dateWithMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "Europe/Madrid" });

function starterLine(starter: PlanOffer, campaign: string, lead: string): string {
  const price = starter.promo ? `${starter.promo.price} €/mes` : `${starter.price} €/mes`;
  const months = starter.promo ? ` durante ${starter.promo.months} meses` : "";
  return subtext(
    `${lead} <a href="${url("/dashboard/settings?openPlan=starter", campaign)}" style="${FOOTER_LINK_STYLE}">Starter por ${price}</a>${months}.`
  );
}

/** The last real scan, as three figures — or nothing when there is no scan to quote. */
function lastScanBlock(snap: RunSnapshot | null): string {
  if (!snap) return "";
  const recs = snap.activeRecommendations;
  return `${sectionLabel(`Tu último escaneo · ${dateWithMonth.format(snap.runDate)}`)}${statRow(
    statCell(String(Math.round(snap.geoScore)), "Puntuación GEO", "em-stack-td") +
      statCell(`${snap.brandMentions} de ${snap.answers}`, "respuestas te mencionan", "em-stack-td em-stack-second") +
      statCell(String(recs), recs === 1 ? "recomendación abierta" : "recomendaciones abiertas", "em-stack-td em-stack-second")
  )}`;
}

/**
 * D7 · fin de prueba, and its «tardía» version (LIFECYCLE-WINBACK-1, log
 * §236). Account news plus an offer, so it carries the lifecycle unsubscribe
 * (log §232); whoever opted out gets the plain `sendTrialEndedEmail`
 * instead — the runner decides, not this template.
 */
export async function sendTrialEndedOfferEmail(
  to: string,
  userId: string,
  input: { late: boolean; trialEndsAt: Date; snapshot: RunSnapshot | null; pro: PlanOffer; starter: PlanOffer }
): Promise<boolean> {
  const envelope = lifecycleEnvelope(userId);
  if (!envelope) return false;

  const campaign = input.late ? "trial_ended_late" : "trial_ended";
  const endDate = formatDateLong(input.trialEndsAt);
  const domain = input.snapshot ? H(input.snapshot.domain) : null;
  const intact = "tus dominios, escaneos y recomendaciones siguen intactos";

  const subject = input.late
    ? `Tu prueba de Pro terminó el ${endDate} (y no te avisamos)`
    : input.snapshot
      ? `Tu prueba ha terminado. Tus datos de ${input.snapshot.domain} siguen aquí`
      : "Tu prueba ha terminado. Tus datos siguen aquí";

  const opening = input.late
    ? `${eyebrow("Un aviso que llega tarde", "#5B6B82")}
    ${heading(`Tu prueba de Pro terminó el ${endDate}`)}
    ${paragraph(`Tendríamos que haberte escrito ese día y no lo hicimos. Perdona. Tu cuenta es ahora <b style="color:#0B1426;">Free</b> y ${intact}.`)}`
    : `${eyebrow("Tu prueba ha terminado", "#5B6B82")}
    ${heading("Tu cuenta ha pasado a Free")}
    ${paragraph(`Tus 7 días de <b style="color:#0B1426;">Pro</b> han terminado. Tus dominios, escaneos y recomendaciones siguen intactos: no hemos borrado nada.`)}`;

  const bridge = input.late
    ? input.pro.promo
      ? "Si quieres retomarlo donde lo dejaste, el precio de lanzamiento sigue disponible unas semanas más:"
      : "Si quieres retomarlo donde lo dejaste, puedes volver a Pro cuando quieras:"
    : `A partir de hoy ${domain ? `<b style="color:#0B1426;">${domain}</b>` : "tu dominio"} ya no se escanea a diario. Si quieres seguir viendo cómo cambian las respuestas de la IA, vuelve cuando quieras:`;

  const html = wrap(
    `
    ${opening}
    ${lastScanBlock(input.snapshot)}
    ${paragraph(bridge)}
    ${priceBox(input.pro)}
    ${button(url("/dashboard/settings?openPlan=pro", campaign), `Volver a Pro por ${offerPriceLabel(input.pro)}`)}
    ${input.late ? "" : starterLine(input.starter, campaign, "¿Te basta con un escaneo semanal?")}
    `,
    {
      footerHtml: envelope.footerHtml,
      preheader: input.pro.promo
        ? `Tu cuenta ha pasado a Free. Vuelve a Pro por ${input.pro.promo.price} €/mes hasta el ${input.pro.promo.endsLabel}.`
        : "Tu cuenta ha pasado a Free. Tus datos siguen intactos."
    }
  );
  return sendEmail(to, subject, html, envelope.headers);
}

/**
 * D+3 · tus datos siguen aquí. The real gap with the most-mentioned rival of
 * the last scan; when the customer leads, the «vas por delante» variant.
 * Needs a scan with a ranking: without one the runner does not call it.
 */
export async function sendWinbackD3Email(
  to: string,
  userId: string,
  input: { snapshot: RunSnapshot; pro: PlanOffer; starter: PlanOffer }
): Promise<boolean> {
  const envelope = lifecycleEnvelope(userId);
  if (!envelope) return false;

  const snap = input.snapshot;
  const domain = H(snap.domain);
  const rival = snap.topCompetitor;
  const behind = rival !== null && rival.mentions > snap.brandMentions;
  const ratio = behind && snap.brandMentions > 0 ? Math.floor(rival.mentions / snap.brandMentions) : 0;

  const headline = !behind
    ? "Vas por delante en la IA. ¿Sigues por delante?"
    : ratio >= 2
      ? `${rival.name} aparece ${ratio} veces más que tú`
      : `${rival.name} aparece en más respuestas que tú`;
  const subject = behind ? `${headline} en la IA` : headline;

  const rows = [
    ...(rival ? [{ label: H(rival.name), count: rival.mentions, total: snap.answers, isBrand: false }] : []),
    { label: `${domain} (tú)`, count: snap.brandMentions, total: snap.answers, isBrand: true }
  ];

  const html = wrap(
    `
    ${eyebrow("Tus datos siguen aquí")}
    ${heading(H(headline))}
    ${versusBars(rows, `Respuestas en las que aparece · escaneo del ${dateWithMonth.format(snap.runDate)}`)}
    ${paragraph(
      behind
        ? `Es el último dato que tienes. Desde que terminó tu prueba, ${domain} no se escanea a diario, así que no sabes si esa distancia ha crecido o si has empezado a cerrarla.`
        : `Es el último dato que tienes. Desde que terminó tu prueba, ${domain} no se escanea a diario, así que no sabes si alguien te ha adelantado desde entonces.`
    )}
    ${priceBox(input.pro)}
    ${button(url("/dashboard/settings?openPlan=pro", "winback_d3"), "Volver a medir a diario")}
    ${starterLine(input.starter, "winback_d3", "O")}
    `,
    {
      footerHtml: envelope.footerHtml,
      preheader: `Es tu último escaneo de ${snap.domain}. Desde entonces no lo estás midiendo.`
    }
  );
  return sendEmail(to, subject, html, envelope.headers);
}

/**
 * D+10 · últimos días del precio. Only with a live promo — its whole content
 * is the deadline; without one this returns `false` and nothing is sent.
 * "Últimos días" is only said when the promo really ends within 14 days.
 */
export const WINBACK_D10_LAST_DAYS = 14;

export async function sendWinbackD10Email(
  to: string,
  userId: string,
  input: { domain: string | null; pro: PlanOffer; promoEndsAt: Date; now: Date }
): Promise<boolean> {
  const promo = input.pro.promo;
  if (!promo) return false;
  const envelope = lifecycleEnvelope(userId);
  if (!envelope) return false;

  const daysToEnd = (input.promoEndsAt.getTime() - input.now.getTime()) / (24 * 60 * 60 * 1000);
  const lastDays = daysToEnd <= WINBACK_D10_LAST_DAYS;
  const subject = lastDays
    ? `Últimos días: ${input.pro.planName} a ${promo.price} €/mes hasta el ${promo.endsLabel}`
    : `${input.pro.planName} a ${promo.price} €/mes hasta el ${promo.endsLabel}`;
  const follow = input.domain ? `seguir <b style="color:#0B1426;">${H(input.domain)}</b> a diario` : "seguir tu dominio a diario";

  const html = wrap(
    `
    ${eyebrow(lastDays ? "Precio de lanzamiento · últimos días" : "Precio de lanzamiento", "#A8660B")}
    ${heading(`El ${promo.endsLabel} ${H(input.pro.planName)} vuelve a ${input.pro.price} €/mes`)}
    ${paragraph(`Hasta entonces puedes contratarlo a <b style="color:#0B1426;">${promo.price} €/mes durante ${promo.months} meses</b> y ${follow} en las respuestas de la IA. Es el último email que te enviamos sobre esto.`)}
    ${priceBox(input.pro)}
    ${button(url("/dashboard/settings?openPlan=pro", "winback_d10"), `Contratar ${H(input.pro.planName)} por ${promo.price} €/mes`)}
    `,
    {
      footerHtml: envelope.footerHtml,
      preheader: `Después vuelve a ${input.pro.price} €/mes. Es el último email que te enviamos sobre esto.`
    }
  );
  return sendEmail(to, subject, html, envelope.headers);
}
