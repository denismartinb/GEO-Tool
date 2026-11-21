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

export type ConsoleLinks = {
  base: string;
  projectId: string;
  /** Which connector asked (MCP-FIX-1, log §465): ChatGPT's answers never name plans or trials (`.claude/rules/mcp.md`). Claude when unset. */
  profile?: McpProfile;
  /** Clock for the age of a scan; tests pass a fixed one. */
  now?: Date;
};

/**
 * MCP-FIX-1 (log §465, H7): how old the scan an answer comes from is, in
 * words. Fact only, no business threshold: the date is always shown, and an
 * answer older than today says it is not a measurement of today.
 */
export function scanAge(scanDate: string | null | undefined, now: Date = new Date()): { days: number; label: string } | null {
  if (!scanDate) return null;
  const t = Date.parse(scanDate);
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
  const day = scanDate.slice(0, 10);
  if (days === 0) return { days, label: `escaneo del ${day} (de hoy)` };
  return { days, label: `escaneo del ${day} (hace ${days} ${days === 1 ? "día" : "días"}; no es una medición de hoy)` };
}

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

export function formatPlanNotice(profile: McpProfile = "claude"): ToolText {
  // MCP-FIX-1 (log §465): ChatGPT's contract names no plan or trial (`.claude/rules/mcp.md` §425).
  // The state stays distinct from «no data»: access is blocked, the data may exist.
  if (profile === "chatgpt") {
    return {
      text:
        "Esta cuenta de GenScore está en solo lectura, así que GenScore no comparte sus datos desde el chat. " +
        "Esto no significa que no existan datos: el acceso está limitado. Más información en https://www.genscore.es/precios.",
      structured: { state: "plan_required" }
    };
  }
  return {
    text:
      "Tu prueba de Pro ha terminado y la cuenta está en solo lectura, así que GenScore no comparte sus datos desde el chat. " +
      "Esto no significa que no existan datos: el acceso está limitado. " +
      "Puedes ver qué incluye cada plan en https://www.genscore.es/precios.",
    structured: { state: "plan_required" }
  };
}

/**
 * MCP-CONNECTOR-TUNING-2 (log §463): what a domain outside the account gets,
 * in the tool answer itself. ChatGPT ignored the same rule in the server
 * instructions and ran `revisar_pagina` unasked, so the offer travels in the
 * result the model reads right before it decides what to do next.
 */
export const PUBLIC_REVIEW_OFFER = (domain: string) =>
  `GenScore no tiene datos guardados de ${domain}, así que no hay recomendaciones suyas. ` +
  `Revisar su página pública con revisar_pagina es una acción distinta de añadirlo a la cuenta: todavía no se ha revisado y solo se hace si lo pides con claridad. ` +
  `Si la persona responde con algo ambiguo («vale», «sí», «ok»), pregúntale cuál de las acciones quiere antes de ejecutar nada; si dice que no quiere una revisión («no la audites»), no la hagas.`;
const publicReviewOffer = (domain: string) => ({ tool: "revisar_pagina", url: `https://${domain}`, run: "only_if_asked", ifAmbiguous: "ask_which_action" });

export function formatNotFound(domain: string, base: string, canAdd = true): ToolText {
  // MCP-FIX-1 (log §465, H5): same capacity rule as listar_dominios — a full account gets no add link.
  const add = canAdd
    ? `Opción A, medirlo de forma continua: añádelo aquí, ya viene relleno: ${addDomainUrl(base, domain)}`
    : "La cuenta ya tiene todos los dominios que caben, así que ahora no se puede añadir otro sin liberar uno.";
  return {
    text:
      `${domain} no es uno de los dominios de tu cuenta de GenScore (usa listar_dominios para ver cuáles tienes). ` +
      `No hay cifras ni recomendaciones suyas.\n\n${add}\n\n` +
      PUBLIC_REVIEW_OFFER(domain),
    structured: {
      state: "not_found",
      domain,
      ...(canAdd ? { addDomainUrl: addDomainUrl(base, domain) } : { accountFull: true }),
      publicReview: publicReviewOffer(domain)
    }
  };
}

export function formatDomains(input: {
  base: string;
  email: string | null;
  planName: string;
  trialEndsAt: string | null;
  domainCap: number;
  domains: Array<{ domain: string; brand: string; projectId: string }>;
  /** The domain the person asked about, when the model passed it (log §463). */
  asked?: { domain: string; found: boolean } | null;
  /** MCP-FIX-1 (log §465): ChatGPT's answer names neither plan nor trial. */
  profile?: McpProfile;
}): ToolText {
  const chatgpt = input.profile === "chatgpt";
  const canAdd = input.domains.length < input.domainCap;
  const lines: string[] = [
    chatgpt
      ? `Cuenta de GenScore${input.email ? ` de ${input.email}` : ""}.`
      : `Cuenta de GenScore${input.email ? ` de ${input.email}` : ""}, plan ${input.planName}${input.trialEndsAt ? ` (prueba hasta el ${input.trialEndsAt.slice(0, 10)})` : ""}.`,
    ""
  ];
  if (!input.domains.length) lines.push(`Todavía no hay ningún dominio. Añade el primero aquí: ${addDomainUrl(input.base)}`);
  else {
    for (const d of input.domains) lines.push(`- ${d.domain} (${d.brand}): ${input.base}/dashboard/projects/${d.projectId}`);
    if (input.domains.length < input.domainCap) lines.push("", `Para añadir otro dominio: ${addDomainUrl(input.base)}`);
    else lines.push("", chatgpt ? "La cuenta ya tiene todos los dominios que caben." : "La cuenta ya tiene todos los dominios que incluye su plan.");
  }
  const asked = input.asked ?? null;
  if (asked && asked.found) lines.push("", `${asked.domain} está en la cuenta: sus datos salen con ver_dominio, ver_recomendaciones y el resto de herramientas del dominio.`);
  else if (asked) {
    lines.push("", `${asked.domain} no está en la cuenta.`);
    if (canAdd) lines.push(`Para empezar a medirlo, añádelo aquí, ya viene relleno: ${addDomainUrl(input.base, asked.domain)}`);
    lines.push(PUBLIC_REVIEW_OFFER(asked.domain));
  } else {
    // Without the asked domain, the same rule in general terms: the model
    // reads this list and then decides (ChatGPT went from here straight to
    // revisar_pagina on «Dame las recomendaciones de amazon.es», log §463).
    lines.push(
      "",
      "Si la persona pregunta por un dominio que no está en esta lista, GenScore no tiene datos suyos: díselo, da el enlace para añadirlo y ofrécele revisar su página con revisar_pagina, sin revisarla hasta que lo pida."
    );
  }
  return {
    text: lines.join("\n"),
    structured: {
      email: input.email,
      ...(chatgpt ? {} : { planName: input.planName, trialEndsAt: input.trialEndsAt }),
      domains: input.domains.map((d) => ({ domain: d.domain, brand: d.brand, url: `${input.base}/dashboard/projects/${d.projectId}` })),
      ...(canAdd ? { addDomainUrl: addDomainUrl(input.base) } : {}),
      ...(asked
        ? {
            asked: asked.found
              ? { domain: asked.domain, state: "in_account" }
              : {
                  domain: asked.domain,
                  state: "not_found",
                  ...(canAdd ? { addDomainUrl: addDomainUrl(input.base, asked.domain) } : {}),
                  publicReview: publicReviewOffer(asked.domain)
                }
          }
        : {})
    }
  };
}

function noScan(domain: string, l: ConsoleLinks): ToolText {
  return {
    text: `${domain} todavía no tiene un escaneo completado, así que no hay cifras que enseñar. Lo verás aquí en cuanto termine: ${screen(l)}`,
    structured: { state: "no_scan", url: screen(l) }
  };
}

/** No finished scan behind the payload: nothing to measure yet. One predicate for every tool (MCP-FIX-1, log §465, H4). */
const hasNoScan = (p: ExtProjectPayload) => p.geoScore == null && !p.engines.length && !p.scanDate;

export function formatDomainSummary(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  if (p.geoScore == null && !p.engines.length) return noScan(p.domain, l);
  const age = scanAge(p.scanDate, l.now);
  const lines = [`**${p.domain}** (${p.brand})${age ? ` · último ${age.label}` : p.scanDate ? ` · último escaneo del ${p.scanDate.slice(0, 10)}` : ""}`, ""];
  // MCP-FIX-1 (log §465, H6): a missing figure is not a zero. Say what could not be read.
  const incomplete: string[] = [];
  if (p.geoScore == null) incomplete.push("la Puntuación GEO");
  if (incomplete.length) {
    lines.push(`Datos incompletos: no se ha podido obtener ${incomplete.join(" ni ")} de este escaneo. Lo que falta no es un cero ni un resultado negativo; se muestra solo lo disponible.`, "");
  }
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
  if (p.seoScore != null) lines.push("", `Salud SEO de tu web: ${p.seoScore}/100`);
  if (p.agentic?.kind === "card") lines.push(`Comercio agéntico: ${p.agentic.score}/100. ${p.agentic.headline}`);
  lines.push("", `Ver en GenScore: ${screen(l)}`);
  return {
    text: lines.join("\n"),
    structured: {
      domain: p.domain,
      brand: p.brand,
      scanDate: p.scanDate,
      scanAgeDays: age?.days ?? null,
      ...(incomplete.length ? { incomplete: true, missing: incomplete } : {}),
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
  const age = scanAge(p.scanDate, l.now);
  const lines = [`Marcas que más nombra la IA en las preguntas principales de búsqueda de ${p.domain}${age ? ` (${age.label})` : ""}:`, ""];
  p.rivals.forEach((r, i) => lines.push(`${i + 1}. ${r.name}${r.isBrand ? " (tú)" : ""}: aparece en el ${formatShare(r.share)} de las respuestas${r.domain && !r.isBrand ? ` · ${r.domain}` : ""}`));
  lines.push(
    "",
    `Ranking completo y evolución: ${screen(l, "/competitors")}`,
    "Para seguir a otra marca, pídeme que revise su web y te doy el enlace para añadirla, o hazlo en esa misma pantalla."
  );
  return { text: lines.join("\n"), structured: { domain: p.domain, scanDate: p.scanDate, scanAgeDays: age?.days ?? null, rivals: p.rivals, url: screen(l, "/competitors") } };
}

const MAX_PLAN_QUESTIONS = 6;

export function formatRecommendations(p: ExtProjectPayload, l: ConsoleLinks): ToolText {
  // MCP-FIX-1 (log §465, H4): no scan is not «no pending actions». The plan comes from the same run as `scanDate`.
  if (hasNoScan(p)) {
    return {
      text: `${p.domain} todavía no tiene un escaneo completado, así que no hay un escaneo del que sacar recomendaciones. Aparecerán aquí en cuanto termine: ${screen(l, "/recommendations")}`,
      structured: { state: "no_scan", domain: p.domain, plan: [], url: screen(l, "/recommendations") }
    };
  }
  const age = scanAge(p.scanDate, l.now);
  const from = age ? ` (acciones calculadas con el ${age.label})` : "";
  if (!p.plan.length) {
    return {
      text: `${p.domain} no tiene acciones pendientes en su plan de acciones según su último escaneo${age ? `, el ${age.label}` : ""}. Eso solo dice que el escaneo no encontró nada que hacer; el plan se recalcula con cada escaneo: ${screen(l, "/recommendations")}`,
      structured: { domain: p.domain, scanDate: p.scanDate, scanAgeDays: age?.days ?? null, plan: [], url: screen(l, "/recommendations") }
    };
  }
  const lines = [`Lo primero que haría en ${p.domain}, en este orden${from}:`, ""];
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
  return { text: lines.join("\n"), structured: { domain: p.domain, scanDate: p.scanDate, scanAgeDays: age?.days ?? null, plan: p.plan, url: screen(l, "/recommendations") } };
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
  if (p.agentic?.kind === "upsell") lines.push("", l.profile === "chatgpt" ? "La auditoría agéntica no está disponible para esta cuenta." : "La auditoría agéntica no está incluida en tu plan.");
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
  const lines = [`Prompts que GenScore pregunta por ${p.domain}${p.scanDate ? ` (resultado del ${scanAge(p.scanDate, l.now)?.label ?? `escaneo del ${p.scanDate.slice(0, 10)}`})` : ""}:`];
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

/** The extension's «Optimización técnica» for one page (log §432, adenda 1.2.0), plus «Esta página» when it is one of the account's domains. */
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
  const state = s.nota >= 75 ? "Optimizada" : s.nota >= 50 ? "Mejorable" : "Se frena";
  const lines = [
    `**Optimización técnica de ${r.url} para la IA y Google: ${s.nota}% (${state})**`,
    s.say,
    "No es la Puntuación GEO: una web técnicamente optimizada no basta para que la IA te recomiende. Eso depende también de lo que dicen de ti otras webs y de si respondes a las preguntas de los usuarios."
  ];
  if (s.alert) lines.push(`Aviso: ${s.alert.t} ${s.alert.s}`);
  lines.push(
    "",
    `IA ${s.lanes.ia ?? "sin medir"} · Google ${s.lanes.google ?? "sin medir"}${s.lanes.agent != null ? ` · Agentes ${s.lanes.agent} (fuera de la nota)` : ""}`
  );
  if (r.redirectedFrom) lines.push(`Te llevó a otra página: pediste ${r.redirectedFrom} y la web respondió con ${r.url}.`);
  // AGENTS-READ-FIX-1 (log §465): a borrowed agents score names its page and shows its checks; no score says why.
  if (s.shop?.state === "found") lines.push(`Agentes se mide en la página que vende: ${s.shop.url}`);
  else if (s.lanes.agent == null && s.agentWhy) lines.push(`Agentes: ${s.agentWhy}`);
  for (const lane of ["ia", "google", "agent"] as const) {
    const cs = lane === "agent" && s.shop?.state === "found" ? s.shop.criteria : s.criteria.filter((c) => c.lane === lane);
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

  const structured: Record<string, unknown> = {
    url: r.url,
    ...(r.redirectedFrom ? { redirectedFrom: r.redirectedFrom } : {}),
    ...(s.shop?.state === "found" ? { agentPage: s.shop.url, agentCriteria: s.shop.criteria } : s.agentWhy ? { agentWhy: s.agentWhy } : {}),
    nota: s.nota, lanes: s.lanes, criteria: s.criteria, fixes: s.fixes.map((f) => ({ ...f, t: htmlToText(f.t), why: htmlToText(f.why) })) };
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

export const PAGE_REVIEW_FAILURE: Record<"invalid_url" | "unreachable" | "blocked" | "timeout" | "not_found" | "not_html" | "limit", string> = {
  invalid_url: "Esa dirección no es una web pública que se pueda revisar. Prueba con la URL completa, por ejemplo https://www.tuweb.es/pagina.",
  unreachable: "No se ha podido leer esa página desde GenScore: devuelve un error.",
  // AGENTS-READ-FIX-1 (log §465): the bot wall is the finding, not an error.
  blocked:
    "Los agentes que leen no pueden entrar: la web pone un control anti-bots a las visitas automáticas, y un asistente que lee la página tampoco pasaría. Los agentes que navegan con un navegador sí pueden llegar; la extensión de Chrome de GenScore la revisa desde tu navegador, como ellos.",
  timeout: "Esa página tarda demasiado en responder y no se ha podido leer. Un agente que lee también se cansaría de esperar: vuelve a intentarlo en un rato.",
  not_found: "Esa página no existe: la web responde que no la encuentra (error 404). Revisa la dirección.",
  not_html: "Esa dirección no devuelve una página web (HTML), así que no hay nada que revisar.",
  limit: "Se ha alcanzado el máximo de revisiones de hoy para esta web o desde este cliente. Vuelve a intentarlo mañana."
};
