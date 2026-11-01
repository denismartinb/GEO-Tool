import type { ExtProjectPayload } from "@/lib/ext/project-data";
import type { ExtPrompt } from "@/lib/ext/prompts";
import type { ExtGscQuery } from "@/lib/ext/search-console";
import { formatShare } from "@/lib/report/report-model";
import type { PageReview } from "@/lib/page-review/review";
import { measureHook } from "./acquisition";
import { signupUrl, type McpProfile } from "./links";

/**
 * MCP-SERVER-1 (log §418): how each MCP tool answers in the chat. Pure: it
 * only words figures the shared loader already computed (the same payload
 * the Chrome extension paints), never recomputes one.
 *
 * Rules every text keeps (`.claude/rules/mcp.md`):
 *  - engines by name only (ChatGPT, Gemini, Claude, Perplexity);
 *  - no price, no «Pasar a Pro», no checkout link: ChatGPT's directory
 *    forbids selling inside an app. Plans and prices live only in
 *    `que_es_genscore`, and only in the Claude profile (`acquisition.ts`);
 *  - what was not measured is said so, never a zero;
 *  - every answer ends with the console screen that shows the same thing.
 */

export type ToolText = { text: string; structured?: Record<string, unknown> };

export type ConsoleLinks = { base: string; projectId: string };

const screen = (l: ConsoleLinks, path = "") => `${l.base}/dashboard/projects/${l.projectId}${path}`;

/** The new-domain wizard, prefilled when the domain is known (`?dominio=`, read by `app/dashboard/projects/new`). */
export const addDomainUrl = (base: string, domain?: string | null) =>
  `${base}/dashboard/projects/new${domain ? `?dominio=${encodeURIComponent(domain)}` : ""}`;

/** Competidores with the add sheet open and filled (`?nuevo=&nombre=`, EXT-AUDITS-1, log §406). Nothing is saved until «Añadir». */
export const addCompetitorUrl = (l: ConsoleLinks, domain: string, name?: string | null) =>
  `${screen(l, "/competitors")}?nuevo=${encodeURIComponent(domain)}${name ? `&nombre=${encodeURIComponent(name)}` : ""}`;

/** The direct Google permission, same as the console's invitation (GSC-CONNECT-CTA-1, log §313). */
const gscConnectUrl = (l: ConsoleLinks) => `${l.base}/api/search-console/connect?projectId=${encodeURIComponent(l.projectId)}`;
const n1 = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const n0 = (x: number) => Math.round(x).toLocaleString("es-ES");
const pct = (x: number | null) => (x == null ? null : `${x > 0 ? "+" : ""}${Math.round(x)}%`);

/** Strip the panel's HTML (only `<code class="p">` and entities) to chat Markdown. */
export function htmlToText(s: string | undefined | null): string {
  return String(s ?? "")
    .replace(/<code[^>]*>(.*?)<\/code>/g, "`$1`")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

export function formatPlanNotice(): ToolText {
  return {
    text:
      "Tu prueba de Pro ha terminado y la cuenta está en solo lectura, así que GenScore no comparte sus datos desde el chat. " +
      "Puedes ver qué incluye cada plan en https://www.genscore.es/precios.",
    structured: { state: "plan_required" }
  };
}

export function formatNotFound(domain: string, base: string): ToolText {
  return {
    text:
      `${domain} no es uno de los dominios de tu cuenta de GenScore (usa listar_dominios para ver cuáles tienes). ` +
      `Para empezar a medirlo, añádelo aquí, ya viene relleno: ${addDomainUrl(base, domain)}`,
    structured: { state: "not_found", domain, addDomainUrl: addDomainUrl(base, domain) }
  };
}

export function formatDomains(input: {
  base: string;
  email: string | null;
  planName: string;
  trialEndsAt: string | null;
  domainCap: number;
  domains: Array<{ domain: string; brand: string; projectId: string }>;
}): ToolText {
  const lines = [
    `Cuenta de GenScore${input.email ? ` de ${input.email}` : ""}, plan ${input.planName}${input.trialEndsAt ? ` (prueba hasta el ${input.trialEndsAt.slice(0, 10)})` : ""}.`,
    ""
  ];
  if (!input.domains.length) lines.push(`Todavía no hay ningún dominio. Añade el primero aquí: ${addDomainUrl(input.base)}`);
  else {
    for (const d of input.domains) lines.push(`- ${d.domain} (${d.brand}): ${input.base}/dashboard/projects/${d.projectId}`);
    if (input.domains.length < input.domainCap) lines.push("", `Para añadir otro dominio: ${addDomainUrl(input.base)}`);
    else lines.push("", "La cuenta ya tiene todos los dominios que incluye su plan.");
  }
  return {
    text: lines.join("\n"),
    structured: {
      email: input.email,
      planName: input.planName,
      trialEndsAt: input.trialEndsAt,
      domains: input.domains.map((d) => ({ domain: d.domain, brand: d.brand, url: `${input.base}/dashboard/projects/${d.projectId}` })),
      ...(input.domains.length < input.domainCap ? { addDomainUrl: addDomainUrl(input.base) } : {})
    }
  };
}

function noScan(domain: string, l: ConsoleLinks): ToolText {
  return {
    text: `${domain} todavía no tiene un escaneo completado, así que no hay cifras que enseñar. Lo verás aquí en cuanto termine: ${screen(l)}`,
    structured: { state: "no_scan", url: screen(l) }
  };
}

export function formatDomainSummary(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  if (p.geoScore == null && !p.engines.length) return noScan(p.domain, l);
  const lines = [`**${p.domain}** (${p.brand})${p.scanDate ? ` · último escaneo del ${p.scanDate.slice(0, 10)}` : ""}`, ""];
  if (p.geoScore != null) lines.push(`Puntuación GEO: ${p.geoScore}/100`);
  if (p.lede) lines.push(p.lede);
  if (p.engines.length) {
    lines.push("", "Cuántas respuestas te nombran, por motor:");
    for (const e of p.engines) lines.push(`- ${e.label}: ${formatShare(e.mentionShare)}`);
  }
  if (p.rivals.length) {
    lines.push("", "Marcas más nombradas en tus preguntas principales de búsqueda:");
    for (const r of p.rivals) lines.push(`- ${r.name}${r.isBrand ? " (tú)" : ""}: ${formatShare(r.share)}`);
  }
  if (p.seoScore != null) lines.push("", `Salud técnica de tu web: ${p.seoScore}/100`);
  if (p.agentic?.kind === "card") lines.push(`Comercio agéntico: ${p.agentic.score}/100. ${p.agentic.headline}`);
  lines.push("", `Ver en GenScore: ${screen(l)}`);
  return {
    text: lines.join("\n"),
    structured: {
      domain: p.domain,
      brand: p.brand,
      scanDate: p.scanDate,
      geoScore: p.geoScore,
      engines: p.engines,
      rivals: p.rivals,
      seoScore: p.seoScore,
      agentic: p.agentic,
      url: screen(l)
    }
  };
}

export function formatCompetitors(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  if (!p.rivals.length) return noScan(p.domain, l);
  const lines = [`Marcas que más nombra la IA en las preguntas principales de búsqueda de ${p.domain}:`, ""];
  p.rivals.forEach((r, i) => lines.push(`${i + 1}. ${r.name}${r.isBrand ? " (tú)" : ""}: aparece en el ${formatShare(r.share)} de las respuestas${r.domain && !r.isBrand ? ` · ${r.domain}` : ""}`));
  lines.push(
    "",
    `Ranking completo y evolución: ${screen(l, "/competitors")}`,
    "Para seguir a otra marca, pídeme que revise su web y te doy el enlace para añadirla, o hazlo en esa misma pantalla."
  );
  return { text: lines.join("\n"), structured: { domain: p.domain, rivals: p.rivals, url: screen(l, "/competitors") } };
}

const MAX_PLAN_QUESTIONS = 6;

export function formatRecommendations(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  if (!p.plan.length) {
    return {
      text: `${p.domain} no tiene acciones pendientes en su plan ahora mismo. El plan se recalcula con cada escaneo: ${screen(l, "/recommendations")}`,
      structured: { domain: p.domain, plan: [], url: screen(l, "/recommendations") }
    };
  }
  const lines = [`Lo primero que haría en ${p.domain}, en este orden:`, ""];
  p.plan.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}**${r.engines.length ? ` (${r.engines.join(", ")})` : ""}`);
    if (r.firstStep) lines.push(`   Primer paso: ${r.firstStep}`);
    // The first step often points at «las preguntas de la lista»: the console shows them on the card.
    const qs = r.questions ?? [];
    if (qs.length) {
      lines.push(`   Preguntas:`);
      for (const q of qs.slice(0, MAX_PLAN_QUESTIONS)) lines.push(`   - «${q}»`);
      if (qs.length > MAX_PLAN_QUESTIONS) lines.push(`   - y otras en la consola`);
    }
  });
  lines.push("", `El plan completo, con cómo hacerlo y «Marcar como hecho»: ${screen(l, "/recommendations")}`);
  return { text: lines.join("\n"), structured: { domain: p.domain, plan: p.plan, url: screen(l, "/recommendations") } };
}

export function formatAudits(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  const a = p.audits;
  const NAME: Record<string, string> = { geo: "Tu web para la IA", seo: "Tu web para Google", agent: "Comercio agéntico" };
  const lines = [`Auditorías de ${p.domain}${a.auditedAt ? ` (técnica del ${a.auditedAt.slice(0, 10)})` : ""}:`];
  if (!a.blocks.length) lines.push("", "Todavía no hay ninguna auditoría hecha. Se hace sola tras el primer escaneo.");
  for (const b of a.blocks) {
    lines.push("", `**${NAME[b.key] ?? b.key}: ${b.score}/100**${b.projected != null ? ` (llegaría a ${b.projected} arreglando lo de abajo)` : ""}`);
    if (!b.issues.length) lines.push("- Nada que arreglar.");
    for (const i of b.issues) lines.push(`- ${i.label} · ${i.scope}${i.points ? ` · +${i.points} pt` : ""}`);
  }
  if (p.agentic?.kind === "upsell") lines.push("", "La auditoría agéntica no está incluida en tu plan.");
  lines.push("", `Detalle por página: ${screen(l, "/web-audit")}`);
  return { text: lines.join("\n"), structured: { domain: p.domain, audits: a, url: screen(l, "/web-audit") } };
}

/** More than this and the chat gets a list nobody reads; the rest are one link away. */
export const MAX_PROMPTS = 60;

const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : xs[0] ?? "");

/** One prompt in words: who names the brand, who names only others, who names nobody. */
function promptLine(x: ExtPrompt): string {
  if (!x.engines) return `- «${x.text}»: pendiente del próximo escaneo.`;
  const you = x.engines.filter((e) => e.cell.kind === "you").map((e) => (e.cell.kind === "you" && e.cell.position ? `${e.label} (puesto ${e.cell.position})` : e.label));
  const others = x.engines.filter((e) => e.cell.kind === "others").map((e) => e.label);
  const none = x.engines.filter((e) => e.cell.kind === "none").map((e) => e.label);
  const parts = [
    you.length ? `te nombra ${join(you)}` : null,
    others.length ? `${join(others)} solo nombra${others.length > 1 ? "n" : ""} a otras marcas` : null,
    none.length ? `${join(none)} no nombra${none.length > 1 ? "n" : ""} ninguna marca` : null
  ].filter(Boolean);
  return `- «${x.text}»: ${parts.join("; ")}.`;
}

export function formatPrompts(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  const link = screen(l, "/prompts");
  if (!p.prompts.length) {
    return {
      text: `${p.domain} no tiene prompts activos. Se añaden en GenScore, con propuestas a partir de tu web: ${link}`,
      structured: { domain: p.domain, prompts: [], url: link }
    };
  }
  const shown = p.prompts.slice(0, MAX_PROMPTS);
  const lines = [`Prompts que GenScore pregunta por ${p.domain}${p.scanDate ? ` (resultado del escaneo del ${p.scanDate.slice(0, 10)})` : ""}:`];
  let topic: string | null | undefined;
  for (const x of [...shown].sort((a, b) => (a.topic ?? "").localeCompare(b.topic ?? "", "es"))) {
    if (x.topic !== topic) {
      topic = x.topic;
      lines.push("", `**${topic ?? "Sin tema"}**`);
    }
    lines.push(promptLine(x));
  }
  if (p.prompts.length > shown.length) lines.push("", "Hay más prompts; la lista completa está en la consola.");
  lines.push("", `Ver, añadir o quitar prompts y leer cada respuesta: ${link}`);
  return {
    text: lines.join("\n"),
    structured: {
      domain: p.domain,
      scanDate: p.scanDate,
      prompts: shown.map((x) => ({
        text: x.text,
        topic: x.topic,
        status: x.engines ? "scanned" : "pending",
        engines: x.engines?.map((e) => ({ engine: e.label, ...e.cell })) ?? []
      })),
      url: link
    }
  };
}

const q = (x: ExtGscQuery) => `«${x.query}» · puesto ${n1(x.position)} · ${n0(x.clicks)} clics · ${n0(x.impressions)} impresiones`;

export function formatSearchConsole(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  const g = p.searchConsole;
  const link = screen(l, "/search-console");
  if (g.state === "disconnected" || g.state === "reconnect") {
    return {
      text: `${p.domain} no tiene Search Console conectado${g.state === "reconnect" ? " (el permiso de Google ha caducado)" : ""}. Se conecta en un clic, con permiso de solo lectura: ${gscConnectUrl(l)}`,
      structured: { state: g.state, connectUrl: gscConnectUrl(l) }
    };
  }
  if (g.state === "pick_property") return { text: `Falta elegir la propiedad de Search Console de ${p.domain} en ${link}.`, structured: { state: g.state } };
  if (g.state === "off") return { text: `Los datos de Search Console no están disponibles ahora mismo en GenScore.`, structured: { state: g.state } };
  if (g.state !== "connected") return { text: `Ahora no se pueden leer los datos de Google de ${p.domain}. Prueba en unos minutos o mira ${link}.`, structured: { state: g.state } };
  if (g.empty) return { text: `Google todavía no tiene datos de ${p.domain} en los últimos 28 días. Suele tardar unos días tras dar de alta la web en Search Console: ${link}`, structured: { state: "empty" } };
  const t = g.trend;
  const lines = [`Google, últimos 28 días, ${p.domain}:`, ""];
  lines.push(`- Clics: ${n0(g.clicks)}${pct(t.clicksDeltaPct) ? ` (${pct(t.clicksDeltaPct)} frente a los 28 anteriores)` : ""}`);
  lines.push(`- Impresiones: ${n0(t.impressions)}${pct(t.impressionsDeltaPct) ? ` (${pct(t.impressionsDeltaPct)})` : ""}`);
  if (g.position != null) {
    const mv = t.positionDelta == null || Math.abs(t.positionDelta) < 0.05 ? "" : t.positionDelta > 0 ? ` (sube ${n1(t.positionDelta)})` : ` (baja ${n1(-t.positionDelta)})`;
    lines.push(`- Puesto medio: ${n1(g.position)}${mv}`);
  }
  if (t.queries.length) {
    lines.push("", "Búsquedas que más clics traen:");
    for (const x of t.queries) lines.push(`- ${q(x)}`);
  }
  if (t.near.length) {
    lines.push("", "Casi en la página 1 (puestos 11 a 20):");
    for (const x of t.near) lines.push(`- ${q(x)}`);
  }
  lines.push("", `Todo el detalle: ${link}`);
  return {
    text: lines.join("\n"),
    structured: { state: "connected", clicks: g.clicks, position: g.position, impressions: t.impressions, queries: t.queries, near: t.near, url: link }
  };
}

const LANE: Record<string, string> = { ia: "IA", google: "Google", agent: "Agentes" };

/** The extension's «Nota SEO + IA» for one page, plus «Esta página» when it is one of the account's domains. */
export type PageReviewNext = {
  base: string;
  /** Which connector asked (MCP-ACQUISITION-1, log §425): decides the hook's wording and its UTM. Claude when unset. */
  profile?: McpProfile;
  /** null without an account. */
  account: { projects: Array<{ domain: string; projectId: string }>; canAddDomain: boolean } | null;
};

export function formatPageReview(
  r: PageReview,
  own: { payload: ExtProjectPayload; links: ConsoleLinks } | null,
  next: PageReviewNext | null = null
): ToolText {
  const s = r.score;
  const lines = [`**Nota SEO + IA de ${r.url}: ${s.nota}/100**`, s.say];
  if (s.alert) lines.push(`Aviso: ${s.alert.t} ${s.alert.s}`);
  lines.push(
    "",
    `IA ${s.lanes.ia ?? "sin medir"} · Google ${s.lanes.google ?? "sin medir"}${s.lanes.agent != null ? ` · Agentes ${s.lanes.agent} (fuera de la nota)` : ""}`
  );
  if (s.shop?.state === "found") lines.push(`Agentes se mide en la página que vende: ${s.shop.url}`);
  for (const lane of ["ia", "google", "agent"] as const) {
    const cs = s.criteria.filter((c) => c.lane === lane);
    if (!cs.length || (lane === "agent" && s.lanes.agent == null)) continue;
    lines.push("", `${LANE[lane]}:`);
    for (const c of cs) lines.push(`- ${c.label}: ${c.value}`);
  }
  if (s.fixes.length) {
    lines.push("", "Haz esto, de más a menos impacto:");
    s.fixes.slice(0, 6).forEach((f, i) => {
      lines.push(`${i + 1}. ${htmlToText(f.t)}${f.pts ? ` (+${f.pts} ${f.unit === "pt" ? "pt" : "en Agentes"})` : ""}${f.where ? ` · en ${f.where}` : ""}`);
      if (f.why) lines.push(`   ${htmlToText(f.why)}`);
      if (f.how) lines.push(`   ${htmlToText(f.how)}`);
      if (f.snippet) lines.push("   ```", ...f.snippet.split("\n").map((x) => `   ${x}`), "   ```");
    });
  }
  lines.push("", "Se ha leído el HTML que entrega el servidor, como lo leen la mayoría de bots de IA. La extensión de Chrome de GenScore revisa la página ya cargada en tu navegador.");

  const structured: Record<string, unknown> = { url: r.url, nota: s.nota, lanes: s.lanes, criteria: s.criteria, fixes: s.fixes.map((f) => ({ ...f, t: htmlToText(f.t), why: htmlToText(f.why) })) };
  if (own) {
    const { payload: p, links } = own;
    lines.push("", `**Esta página en tu dominio ${p.domain}:**`);
    if (p.citingPrompts?.length) {
      lines.push("Preguntas cuya respuesta la cita:");
      for (const c of p.citingPrompts.slice(0, 8)) lines.push(`- «${c.text}» (${c.engines.join(", ")})${c.mentioned ? " · te nombra" : ""}`);
    } else lines.push("Ninguna respuesta del último escaneo cita esta página.");
    const pa = p.audits.page;
    if (pa?.state === "audited" && pa.issues.length) lines.push(`La auditoría técnica le encuentra: ${pa.issues.map((i) => i.label).join("; ")}.`);
    else if (pa?.state === "not_audited") lines.push("La auditoría técnica todavía no ha revisado esta página.");
    const g = p.searchConsole;
    if (g.state === "connected" && g.page) {
      lines.push(`Google, 28 días: ${n0(g.page.clicks)} clics, ${n0(g.page.impressions)} impresiones, puesto medio ${n1(g.page.position)}.`);
      for (const x of g.page.queries) lines.push(`- ${q(x)}`);
    }
    lines.push(`Tu dominio en GenScore: ${screen(links)}`);
    structured.ownDomain = { url: screen(links), domain: p.domain, citingPrompts: p.citingPrompts, page: p.audits.page, searchConsole: g.state === "connected" ? g.page : null };
  } else if (next) {
    // EXT-AUDITS-1 (log §406) in the chat: a web that is not one of yours can become a domain or a competitor.
    const host = r.host.replace(/^www\./, "");
    if (!next.account) {
      // MCP-ACQUISITION-1 (log §425): the page is one thing, the brand in the answers is what GenScore measures.
      const profile = next.profile ?? "claude";
      lines.push(
        "",
        measureHook(next.base, profile, "revisar_pagina", host),
        "Con tu cuenta de GenScore conectada, en una página de tus dominios también te digo qué preguntas la citan y sus datos de Google."
      );
      structured.next = [{ kind: "signup", url: signupUrl(next.base, profile, "revisar_pagina", host) }];
    } else {
      lines.push("", `**¿Qué hacer con ${host}?**`);
      const links: Array<{ kind: string; url: string }> = [];
      if (next.account.canAddDomain) {
        const url = addDomainUrl(next.base, host);
        lines.push(`- Medirla como dominio tuyo: ${url}`);
        links.push({ kind: "add_domain", url });
      }
      for (const pr of next.account.projects.slice(0, 3)) {
        const url = addCompetitorUrl({ base: next.base, projectId: pr.projectId }, host);
        lines.push(`- Seguirla como competidor de ${pr.domain}: ${url}`);
        links.push({ kind: "add_competitor", url });
      }
      if (!links.length) lines.push("- La cuenta ya tiene todos los dominios de su plan; puedes seguirla como competidor desde la consola.");
      structured.next = links;
    }
  }
  return { text: lines.join("\n"), structured };
}

export const PAGE_REVIEW_FAILURE: Record<"invalid_url" | "unreachable" | "blocked" | "not_html" | "limit", string> = {
  invalid_url: "Esa dirección no es una web pública que se pueda revisar. Prueba con la URL completa, por ejemplo https://www.tuweb.es/pagina.",
  unreachable: "No se ha podido leer esa página desde GenScore (no responde, tarda demasiado o devuelve un error).",
  blocked: "La web ha respondido con un control anti-bots, así que no se ha podido medir. La extensión de Chrome de GenScore sí la revisa desde tu navegador.",
  not_html: "Esa dirección no devuelve una página web (HTML), así que no hay nada que revisar.",
  limit: "Se ha alcanzado el máximo de revisiones de hoy para esta web o desde este cliente. Vuelve a intentarlo mañana."
};
