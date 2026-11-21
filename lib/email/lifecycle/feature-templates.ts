import "server-only";

import {
  button,
  escapeHtml,
  eyebrow,
  FOOTER_LINK_STYLE,
  heading,
  paragraph,
  scoreBar,
  sendEmailWithOutcome,
  type SendOutcome,
  subtext,
  wrap
} from "@/lib/email/transactional";
import { lifecycleEnvelope } from "@/lib/email/lifecycle/templates";
import { CHROME_WEB_STORE_URL } from "@/lib/blog/chrome-extension";
import { SITE_URL } from "@/lib/seo/metadata";

/**
 * FEATURE-EMAILS-1 (log §417). One email per feature a customer is not using
 * yet: Search Console, the Chrome extension and the agentic audit. Same
 * header, footer and blocks as every other GenScore email (`wrap`), texts
 * approved by the founder on 2026-11-01. Commercial: they need the signed
 * unsubscribe link or they are not sent.
 */

const H = (value: string): string => escapeHtml(value);

function url(path: string, campaign: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${SITE_URL}${path}${separator}utm_source=email&utm_medium=lifecycle&utm_campaign=${campaign}`;
}

function storeUrl(): string {
  return `${CHROME_WEB_STORE_URL}?utm_source=email&utm_medium=lifecycle&utm_campaign=feature_extension`;
}

const bullets = (items: string[]): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0;">${items
    .map(
      (item) =>
        `<tr><td valign="top" style="padding:5px 10px 5px 0;"><div style="width:7px;height:7px;border-radius:50%;background:#2563EB;margin-top:7px;"></div></td><td style="padding:3px 0;font-size:15px;line-height:1.55;color:#3B4759;">${item}</td></tr>`
    )
    .join("")}</table>`;

export type EmailParts = {
  /** MAIL-METRICS-1 (log §419): the Resend tag, same name as `email_sends.kind`. */
  kind: "feature_gsc" | "feature_extension" | "feature_agentic" | "extension_launch";
  subject: string;
  preheader: string;
  body: string;
};

export function gscEmailParts(input: { projectId: string; domain: string }): EmailParts {
  const domain = H(input.domain);
  return {
    kind: "feature_gsc",
    subject: "Ya sabes cómo te ve la IA. Falta ver cómo te ve Google",
    preheader: `Conecta Search Console y verás también tu posición en Google para ${domain}.`,
    body: `
      ${eyebrow("Nuevo en tu consola")}
      ${heading("Ya sabes cómo te ve la IA. Falta ver cómo te ve Google")}
      ${paragraph(`GenScore ya te dice qué responden los asistentes de IA cuando alguien pregunta por <b style="color:#0B1426;">${domain}</b>. Te falta la otra mitad: cómo te encuentra la gente en Google.`)}
      ${paragraph("Si conectas Search Console (es gratis y solo lectura), verás en la misma consola:")}
      ${bullets([
        "Tu puesto medio en Google y cómo evoluciona.",
        "Las búsquedas que ya te traen visitas, y las que están casi en la página 1.",
        "Recomendaciones con tus datos de Google, junto a las de la IA."
      ])}
      ${paragraph("Tarda un minuto: entras con tu cuenta de Google y eliges la web.")}
      ${button(url(`/api/search-console/connect?projectId=${encodeURIComponent(input.projectId)}`, "feature_gsc"), "Conectar con Google")}
      ${subtext("Solo pedimos permiso de lectura. Puedes desconectarlo cuando quieras desde la consola.")}
    `
  };
}

export function extensionEmailParts(input: { domain: string }): EmailParts {
  const domain = H(input.domain);
  return {
    kind: "feature_extension",
    subject: "Tu GenScore, en cualquier web que abras",
    preheader: "La extensión de GenScore para Chrome: la IA, Google y los agentes, en la página que tienes abierta.",
    body: `
      ${eyebrow("Extensión de Chrome")}
      ${heading("Tu GenScore, en cualquier web que abras")}
      ${paragraph("Hemos sacado la extensión de GenScore para Chrome. Con ella, mientras navegas, ves al momento:")}
      ${bullets([
        "Cómo está la página que tienes abierta para la IA, para Google y para los agentes que compran.",
        `Con tu cuenta, la visión general de <b style="color:#0B1426;">${domain}</b>: puntuación, motores y rivales, sin abrir la consola.`,
        "En la web de otra marca, un botón para añadirla como competidor."
      ])}
      ${paragraph("Es gratis y se instala en un clic.")}
      ${button(storeUrl(), "Añadir a Chrome")}
      ${subtext(`¿Quieres verla antes? <a href="${url("/blog/extension-de-chrome-de-genscore", "feature_extension")}" style="${FOOTER_LINK_STYLE}">Te la enseñamos aquí</a>.`)}
    `
  };
}

/**
 * EXT-REACH-1 (log §436): the one-off announcement of the Chrome extension to
 * every account that ever signed up, sent by the operator from /admin/crm.
 * Same category and footer as the feature emails («consejos, novedades y
 * ofertas»), so it needs the signed unsubscribe link or it is not sent. It
 * claims `feature_extension` in `email_sends`: whoever gets this one never
 * gets the automatic extension email, and the other way round. No figures:
 * nothing here depends on the account's data.
 */
export const EXTENSION_LAUNCH_IMAGE = `${SITE_URL}/email/extension-chrome.jpg`;

export function extensionLaunchEmailParts(): EmailParts {
  const campaign = "extension_launch";
  const store = `${CHROME_WEB_STORE_URL}?utm_source=email&utm_medium=anuncio&utm_campaign=${campaign}`;
  const article = url("/blog/extension-de-chrome-de-genscore", campaign);
  const feature = (title: string, text: string) =>
    `<tr><td valign="top" style="padding:10px 12px 10px 0;width:30px;"><div style="width:26px;height:26px;border-radius:8px;background:#EEF3FF;text-align:center;line-height:26px;font-size:14px;color:#2563EB;font-weight:700;">&#10003;</div></td><td style="padding:8px 0;"><div style="font-size:15px;font-weight:700;color:#0B1426;">${title}</div><div style="font-size:14.5px;line-height:1.55;color:#3B4759;margin-top:2px;">${text}</div></td></tr>`;
  return {
    kind: "extension_launch",
    subject: "Nuevo: GenScore en Chrome, gratis",
    preheader: "Abre cualquier web y mira al momento si la IA y Google pueden leerla.",
    body: `
      ${eyebrow("Nuevo · Extensión de Chrome")}
      ${heading("Mira cualquier web como la ve la IA, sin salir de Chrome")}
      ${paragraph("Hemos publicado la extensión de GenScore para Chrome. Abres una página, pulsas el icono y en unos segundos sabes si ChatGPT, Gemini, Claude y Perplexity pueden leerla, cómo la ve Google y qué cambiar primero.")}
      <a href="${store}" style="display:block;margin:22px 0 6px;text-decoration:none;"><img src="${EXTENSION_LAUNCH_IMAGE}" width="560" alt="Chrome con una página abierta y, al lado, el panel de GenScore con la revisión de esa página." style="display:block;width:100%;max-width:560px;height:auto;border:1px solid #E7EAF0;border-radius:14px;"></a>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0;">
        ${feature("Gratis y sin cuenta", "La revisión se hace en tu navegador, en cualquier web: la tuya, la de un cliente o la de un competidor.")}
        ${feature("Lo que frena a la IA y a Google", "Bots bloqueados, llms.txt, datos estructurados, títulos e indexación, con el arreglo listo para copiar.")}
        ${feature("Con tu cuenta, tu dominio a mano", "Tu Puntuación GEO, tus competidores y tus recomendaciones sin abrir la consola.")}
      </table>
      ${button(store, "Añadir a Chrome")}
      ${subtext(`¿Quieres verla antes? <a href="${article}" style="${FOOTER_LINK_STYLE}">Te la enseñamos en el blog</a>. Funciona en Chrome de ordenador.`)}
    `
  };
}

export type AgenticEmailInput =
  | { variant: "result"; projectId: string; domain: string; score: number; firstFix: string | null }
  | { variant: "upgrade"; domain: string };

export function agenticEmailParts(input: AgenticEmailInput): EmailParts {
  const domain = H(input.domain);
  const intro = paragraph("Los asistentes de IA ya no solo recomiendan: empiezan a comparar y comprar por la gente.");
  if (input.variant === "upgrade") {
    return {
      kind: "feature_agentic",
      subject: `Los agentes de IA ya compran. ¿Pueden comprar en ${input.domain}?`,
      preheader: "La auditoría agéntica revisa tu web como lo haría uno de esos agentes.",
      body: `
        ${eyebrow("Comercio agéntico")}
        ${heading(`Los agentes de IA ya compran. ¿Pueden comprar en ${domain}?`)}
        ${intro}
        ${paragraph("La auditoría agéntica revisa tu web como lo haría uno de esos agentes y te dice qué arreglar. Está incluida en Pro.")}
        ${button(url("/dashboard/settings#plan", "feature_agentic"), "Ver qué incluye Pro")}
      `
    };
  }
  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  const color = score >= 70 ? "#15915A" : score >= 40 ? "#A8660B" : "#C2410C";
  return {
    kind: "feature_agentic",
    subject: `¿Un agente de IA podría comprar en ${input.domain}?`,
    preheader: `Hemos revisado ${input.domain} como lo haría un agente de compra.`,
    body: `
      ${eyebrow("Tu auditoría agéntica")}
      ${heading(`¿Un agente de IA podría comprar en ${domain}?`)}
      ${intro}
      ${paragraph(`Hemos revisado <b style="color:#0B1426;">${domain}</b> como lo haría uno de esos agentes.`)}
      <div style="margin:20px 0 0;padding:18px 20px;border:1px solid #E7EAF0;border-radius:12px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5B6B82;">Tu nota</div>
        <div style="margin-top:4px;font-size:34px;font-weight:800;color:#0B1426;line-height:1;">${score}<span style="font-size:15px;font-weight:600;color:#5B6B82;"> / 100</span></div>
        ${scoreBar(score, color)}
      </div>
      ${input.firstFix ? paragraph(`Lo primero que arreglaríamos: <b style="color:#0B1426;">${H(input.firstFix)}</b>.`) : ""}
      ${paragraph("En la auditoría tienes el detalle por partes (descubrimiento, comprensión, confianza y compra) y qué hacer en cada una.")}
      ${button(url(`/dashboard/projects/${encodeURIComponent(input.projectId)}/agentic-audit`, "feature_agentic"), "Ver mi auditoría agéntica")}
    `
  };
}

export function renderFeatureEmail(parts: EmailParts, footerHtml: string): string {
  return wrap(parts.body, { footerHtml, preheader: parts.preheader });
}

export async function sendFeatureEmail(
  to: string,
  userId: string,
  parts: EmailParts,
  options: { idempotencyKey?: string } = {}
): Promise<SendOutcome> {
  const envelope = lifecycleEnvelope(userId);
  if (!envelope) return "not_sent";
  const html = renderFeatureEmail(parts, envelope.footerHtml);
  return sendEmailWithOutcome({ kind: parts.kind, to, subject: parts.subject, html, headers: envelope.headers }, options);
}
