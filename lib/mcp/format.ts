import type { ExtProjectPayload } from "@/lib/ext/project-data";
import type { ExtGscQuery } from "@/lib/ext/search-console";
import { formatShare } from "@/lib/report/report-model";
import type { PageReview } from "@/lib/page-review/review";

/**
 * MCP-SERVER-1 (log §418): how each MCP tool answers in the chat. Pure: it
 * only words figures the shared loader already computed (the same payload
 * the Chrome extension paints), never recomputes one.
 *
 * Rules every text keeps (`.claude/rules/mcp.md`):
 *  - engines by name only (ChatGPT, Gemini, Claude, Perplexity);
 *  - no price, no «Pasar a Pro», no checkout link: ChatGPT's directory
 *    forbids selling inside an app, and one text serves every client;
 *  - what was not measured is said so, never a zero;
 *  - every answer ends with the console screen that shows the same thing.
 */

export type ToolText = { text: string; structured?: Record<string, unknown> };

export type ConsoleLinks = { base: string; projectId: string };

const screen = (l: ConsoleLinks, path = "") => `${l.base}/dashboard/projects/${l.projectId}${path}`;
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

export function formatNotFound(domain: string): ToolText {
  return {
    text: `${domain} no es uno de los dominios de tu cuenta de GenScore. Usa listar_dominios para ver cuáles tienes.`,
    structured: { state: "not_found", domain }
  };
}

export function formatDomains(input: {
  email: string | null;
  planName: string;
  trialEndsAt: string | null;
  domains: Array<{ domain: string; brand: string }>;
}): ToolText {
  const lines = [
    `Cuenta de GenScore${input.email ? ` de ${input.email}` : ""}, plan ${input.planName}${input.trialEndsAt ? ` (prueba hasta el ${input.trialEndsAt.slice(0, 10)})` : ""}.`,
    ""
  ];
  if (!input.domains.length) lines.push("Todavía no hay ningún dominio. Se añade desde la consola: https://www.genscore.es/dashboard.");
  else for (const d of input.domains) lines.push(`- ${d.domain} (${d.brand})`);
  return { text: lines.join("\n"), structured: input };
}

function noScan(domain: string, l: ConsoleLinks): ToolText {
  return {
    text: `${domain} todavía no tiene un escaneo completado, así que no hay cifras que enseñar. Lo verás aquí en cuanto termine: ${screen(l)}`,
    structured: { state: "no_scan" }
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
      agentic: p.agentic
    }
  };
}

export function formatCompetitors(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  if (!p.rivals.length) return noScan(p.domain, l);
  const lines = [`Marcas que más nombra la IA en las preguntas principales de búsqueda de ${p.domain}:`, ""];
  p.rivals.forEach((r, i) => lines.push(`${i + 1}. ${r.name}${r.isBrand ? " (tú)" : ""}: aparece en el ${formatShare(r.share)} de las respuestas${r.domain && !r.isBrand ? ` · ${r.domain}` : ""}`));
  lines.push("", `Ranking completo y evolución: ${screen(l, "/competitors")}`);
  return { text: lines.join("\n"), structured: { domain: p.domain, rivals: p.rivals } };
}

export function formatRecommendations(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  if (!p.plan.length) {
    return {
      text: `${p.domain} no tiene acciones pendientes en su plan ahora mismo. El plan se recalcula con cada escaneo: ${screen(l, "/recommendations")}`,
      structured: { domain: p.domain, plan: [] }
    };
  }
  const lines = [`Lo primero que haría en ${p.domain}, en este orden:`, ""];
  p.plan.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}**${r.engines.length ? ` (${r.engines.join(", ")})` : ""}`);
    if (r.firstStep) lines.push(`   Primer paso: ${r.firstStep}`);
  });
  lines.push("", `El plan completo, con cómo hacerlo y «Marcar como hecho»: ${screen(l, "/recommendations")}`);
  return { text: lines.join("\n"), structured: { domain: p.domain, plan: p.plan } };
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
  return { text: lines.join("\n"), structured: { domain: p.domain, audits: a } };
}

const q = (x: ExtGscQuery) => `«${x.query}» · puesto ${n1(x.position)} · ${n0(x.clicks)} clics · ${n0(x.impressions)} impresiones`;

export function formatSearchConsole(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  const g = p.searchConsole;
  const link = screen(l, "/search-console");
  if (g.state === "disconnected" || g.state === "reconnect") {
    return {
      text: `${p.domain} no tiene Search Console conectado${g.state === "reconnect" ? " (el permiso de Google ha caducado)" : ""}. Se conecta en un clic desde ${link}.`,
      structured: { state: g.state }
    };
  }
  if (g.state === "pick_property") return { text: `Falta elegir la propiedad de Search Console de ${p.domain} en ${link}.`, structured: { state: g.state } };
  if (g.state !== "connected") return { text: `Ahora no se pueden leer los datos de Google de ${p.domain}. Prueba en unos minutos o mira ${link}.`, structured: { state: g.state } };
  if (g.empty) return { text: `Google todavía no tiene datos de ${p.domain} en los últimos 28 días.`, structured: { state: "empty" } };
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
    structured: { state: "connected", clicks: g.clicks, position: g.position, impressions: t.impressions, queries: t.queries, near: t.near }
  };
}

const LANE: Record<string, string> = { ia: "IA", google: "Google", agent: "Agentes" };

/** The extension's «Nota SEO + IA» for one page, plus «Esta página» when it is one of the account's domains. */
export function formatPageReview(r: PageReview, own: { payload: ExtProjectPayload; links: ConsoleLinks } | null): ToolText {
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
    structured.ownDomain = { domain: p.domain, citingPrompts: p.citingPrompts, page: p.audits.page, searchConsole: g.state === "connected" ? g.page : null };
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
