import "server-only";
import { z } from "zod";
import { listExtProjects, type ExtAccount } from "@/lib/ext/account";
import { loadExtProjectData, normalizeHost, pickProject, type ExtProjectPayload } from "@/lib/ext/project-data";
import {
  MCP_PAGE_CHECK_ENGINE,
  MCP_PAGE_CHECK_LIMITS,
  checkPublicCheckLimits,
  hashIp
} from "@/lib/free-checker/rate-limit";
import { normalizeTarget } from "@/lib/agentic-audit/run-audit";
import { reviewPage } from "@/lib/page-review/review";
import { getFounderOffer } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { formatAboutGenScore, formatGuides, type FounderOfferView } from "./acquisition";
import { guideIndex } from "./guides/corpus";
import { searchGuides } from "./guides/search";
import type { McpProfile } from "./links";
import {
  PAGE_REVIEW_FAILURE,
  formatAudits,
  formatCompetitors,
  formatDomainSummary,
  formatDomains,
  formatNotFound,
  formatPageReview,
  formatPlanNotice,
  formatPrompts,
  formatRecommendations,
  formatSearchConsole,
  type ConsoleLinks,
  type PageReviewNext,
  type ToolText
} from "./format";
import type { ToolAnswer, ToolDef } from "./protocol";

/**
 * MCP-SERVER-1 (log §418): the GenScore MCP tools. All read-only, none calls
 * an LLM. The account tools read the same payload as the Chrome extension's
 * panel (`loadExtProjectData`), so the chat, the panel and the console show
 * the same figures. `revisar_pagina` is the extension's page review on the
 * server, open without an account and rate limited like the free checkers.
 */

export type McpContext = {
  account: ExtAccount | null;
  /** Origin of this deployment, for console links (production or a preview). */
  origin: string;
  /** The caller's address as Vercel saw it: usually Claude's or ChatGPT's servers. */
  ip: string | null;
  /** Which endpoint was called (MCP-ACQUISITION-1, log §425): `/api/mcp` or `/api/mcp/chatgpt`. */
  profile: McpProfile;
};

const DOMAIN_ARG = {
  type: "object",
  properties: {
    dominio: { type: "string", description: "Uno de los dominios de la cuenta, por ejemplo marca.es. Usa listar_dominios si no lo sabes." }
  },
  required: ["dominio"],
  additionalProperties: false
} as const;
const domainArgs = z.object({ dominio: z.string().min(3).max(300) });

const answer = (t: ToolText): ToolAnswer => ({ text: t.text, structured: t.structured });

/** An account tool on one domain: plan gate, ownership, then the shared payload. */
function domainTool(
  name: string,
  title: string,
  description: string,
  format: (p: ExtProjectPayload, l: ConsoleLinks) => ToolText
): ToolDef<McpContext> {
  return {
    name,
    title,
    description,
    inputSchema: DOMAIN_ARG,
    args: domainArgs,
    access: "account",
    openWorld: false,
    async run(args, ctx) {
      const account = ctx.account;
      if (!account) throw new Error("unreachable: access=account");
      if (account.planId === "free") return answer(formatPlanNotice(ctx.profile));
      const domain = normalizeHost(String(args.dominio));
      if (!domain) return { ...answer(formatNotFound(String(args.dominio).slice(0, 100), ctx.origin)), isError: true };
      const data = await loadExtProjectData(account, { domain, url: null });
      if (data.kind === "not_found") {
        // MCP-FIX-1 (log §465, H5): same capacity rule as listar_dominios.
        const projects = await listExtProjects(account);
        return answer(formatNotFound(domain, ctx.origin, projects.length < account.domainCap));
      }
      return answer(format(data.payload, { base: ctx.origin, projectId: data.project.id, profile: ctx.profile }));
    }
  };
}

/** `que_es_genscore` says plans and prices only to Claude; ChatGPT's description promises neither. */
const ABOUT_DESCRIPTION: Record<McpProfile, string> = {
  claude:
    "Qué es GenScore, qué mide, sus planes y precios y cómo probarlo. Úsala sólo cuando la persona pregunte por GenScore, por sus planes o precios o por cómo empezar.",
  chatgpt: "Qué es GenScore, qué mide y cómo empezar. Úsala sólo cuando la persona pregunte por GenScore o por cómo empezar."
};

export const MCP_TOOLS: ReadonlyArray<ToolDef<McpContext>> = [
  {
    name: "listar_dominios",
    title: "Listar dominios",
    description:
      "Lista los dominios que la persona sigue en GenScore y su plan. Úsala primero para saber qué dominio consultar; si la persona pregunta por un dominio concreto, pásalo en dominio y la respuesta dice si está en la cuenta. Si no está, GenScore no tiene datos suyos: díselo, da el enlace para añadirlo y ofrece revisar su página con revisar_pagina, sin revisarla hasta que la persona lo pida.",
    inputSchema: {
      type: "object",
      properties: {
        dominio: { type: "string", description: "Opcional: el dominio por el que pregunta la persona, por ejemplo marca.es." }
      },
      additionalProperties: false
    },
    args: z.object({ dominio: z.string().max(300).nullish() }).passthrough(),
    access: "account",
    openWorld: false,
    async run(args, ctx) {
      const account = ctx.account;
      if (!account) throw new Error("unreachable: access=account");
      const projects = await listExtProjects(account);
      const askedDomain = typeof args.dominio === "string" ? normalizeHost(args.dominio) : null;
      return answer(
        formatDomains({
          base: ctx.origin,
          email: account.user.email,
          planName: account.planName,
          trialEndsAt: account.trialEndsAt,
          domainCap: account.domainCap,
          domains: projects.map((p) => ({ domain: p.domain, brand: p.brand?.trim() || p.name, projectId: p.id })),
          asked: askedDomain ? { domain: askedDomain, found: !!pickProject(projects, askedDomain) } : null,
          profile: ctx.profile
        })
      );
    }
  },
  domainTool(
    "ver_dominio",
    "Ver resumen del dominio",
    "Resumen del último escaneo de un dominio que la persona ya sigue en su cuenta de GenScore: Puntuación GEO, en qué parte de las respuestas lo nombran ChatGPT, Gemini, Claude y Perplexity, las marcas más nombradas, la salud técnica y el comercio agéntico. Es la herramienta para «¿cómo está mi dominio en la IA?». Si el dominio no está en la cuenta, lo dice y da el enlace para añadirlo.",
    formatDomainSummary
  ),
  domainTool(
    "ver_recomendaciones",
    "Ver recomendaciones GEO de un dominio",
    "Para «dame las recomendaciones de <dominio>», lo mencione o no a GenScore: las recomendaciones GEO de un dominio de la cuenta, las acciones que GenScore recomienda hacer primero para que aparezca más en las respuestas de la IA y en Google, en orden, con su primer paso. Es lo que significa «recomendaciones» aquí, con o sin dominio explícito; nunca recomendaciones de productos ni de compra. Si el dominio no está en la cuenta, lo dice, da el enlace para añadirlo y ofrece una revisión de su página que sólo se hace si la persona la pide.",
    formatRecommendations
  ),
  domainTool(
    "ver_competidores",
    "Ver competidores",
    "Qué marcas nombra más la IA en las preguntas principales de búsqueda de un dominio, con su cuota de respuestas, incluida la propia marca.",
    formatCompetitors
  ),
  domainTool(
    "ver_prompts",
    "Ver prompts",
    "Los prompts (preguntas) que GenScore hace a la IA sobre un dominio, por tema, y qué hizo cada motor con cada uno en el último escaneo: si nombra la marca y en qué puesto, si solo nombra a otras o si no nombra a nadie.",
    formatPrompts
  ),
  domainTool(
    "ver_auditorias",
    "Ver auditorías",
    "Las auditorías del dominio: su web para la IA, su web para Google y su comercio agéntico, con la nota de cada bloque y los problemas que más puntos suman.",
    formatAudits
  ),
  domainTool(
    "ver_posicion_google",
    "Ver posición en Google",
    "Datos de Google Search Console del dominio en los últimos 28 días: clics, impresiones, puesto medio, búsquedas que más traen y las que están casi en la página 1. Solo si la persona lo ha conectado en GenScore.",
    formatSearchConsole
  ),
  {
    name: "revisar_pagina",
    title: "Revisar una página",
    description:
      "Úsala sólo cuando la persona pida revisar o auditar una página o una URL. Revisa una URL pública concreta, como la extensión de Chrome de GenScore: si los motores de IA pueden leerla, cómo está para Google y, si vende algo, si un agente de compra la entiende. Da la nota SEO + IA y qué arreglar, con el código para pegar. No necesita cuenta; con la cuenta conectada y una página de un dominio propio, añade qué preguntas la citan y sus datos de Google. No sustituye al último escaneo de un dominio de la cuenta (para eso, ver_dominio), y no la uses por tu cuenta cuando otra herramienta diga que un dominio no está en la cuenta: ofrécela y espera a que la persona la pida. Un «vale» o «sí» tras una oferta con varias opciones no es esa petición: pregunta primero cuál quiere. Si la persona dice que no la quiere («no la audites»), no la ejecutes.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "La dirección de la página, por ejemplo https://www.tuweb.es/precios" } },
      required: ["url"],
      additionalProperties: false
    },
    args: z.object({ url: z.string().min(3).max(2048) }),
    access: "public",
    openWorld: true,
    async run(args, ctx) {
      const target = normalizeTarget(String(args.url));
      if (!target) return { text: PAGE_REVIEW_FAILURE.invalid_url, isError: true };

      // Same table and fail-closed rules as the free checkers; the row is
      // written before any request leaves, so a review that dies still counts.
      const key = ctx.account ? `user:${ctx.account.user.id}` : `ip:${ctx.ip ?? "unknown"}`;
      let service: ReturnType<typeof createServiceClient>;
      let ipHash: string;
      try {
        service = createServiceClient();
        ipHash = hashIp(key, process.env.PUBLIC_CHECK_IP_SALT);
      } catch {
        return { text: PAGE_REVIEW_FAILURE.limit, isError: true };
      }
      const limits = await checkPublicCheckLimits(
        service,
        { ipHash, domain: target.baseDomain },
        { limits: MCP_PAGE_CHECK_LIMITS, engine: MCP_PAGE_CHECK_ENGINE }
      );
      if (!limits.allowed) return { text: PAGE_REVIEW_FAILURE.limit, isError: true };
      const { data: row, error } = await service
        .from("public_checks")
        .insert({ domain: target.baseDomain, ip_hash: ipHash, status: "pending", engine: MCP_PAGE_CHECK_ENGINE })
        .select("id")
        .single();
      if (error || !row) return { text: PAGE_REVIEW_FAILURE.limit, isError: true };

      const outcome = await reviewPage(target.url);
      await service
        .from("public_checks")
        .update(outcome.kind === "ok" ? { status: "completed" } : { status: "failed", error_category: outcome.reason })
        .eq("id", row.id)
        .then(undefined, () => undefined);
      if (outcome.kind === "failed") return { text: PAGE_REVIEW_FAILURE[outcome.reason], isError: true };

      // «Esta página»: only on one of the account's own domains, and never for a read-only account.
      let own: Parameters<typeof formatPageReview>[1] = null;
      let next: PageReviewNext | null = ctx.account ? null : { base: ctx.origin, profile: ctx.profile, account: null };
      if (ctx.account && ctx.account.planId !== "free") {
        const host = normalizeHost(outcome.review.url);
        const projects = await listExtProjects(ctx.account);
        const project = host ? pickProject(projects, host) : null;
        if (project && host) {
          const data = await loadExtProjectData(ctx.account, { domain: host, url: outcome.review.url });
          if (data.kind === "ok") own = { payload: data.payload, links: { base: ctx.origin, projectId: data.project.id } };
        } else {
          next = {
            base: ctx.origin,
            profile: ctx.profile,
            account: {
              projects: projects.map((p) => ({ domain: p.domain, projectId: p.id })),
              canAddDomain: projects.length < ctx.account.domainCap
            }
          };
        }
      }
      return answer(formatPageReview(outcome.review, own, next));
    }
  },
  {
    name: "buscar_guias",
    title: "Buscar en las guías de GenScore",
    description:
      "Busca en las guías, estudios y glosario de GenScore (en español) qué funciona para aparecer en las respuestas de ChatGPT, Gemini, Claude y Perplexity y en Google: GEO, fuentes que cita la IA, llms.txt, bots de IA, comercio agéntico, medición. Devuelve fragmentos con su enlace; cita la guía al usarlos. No necesita cuenta.",
    inputSchema: {
      type: "object",
      properties: { consulta: { type: "string", description: "Lo que quiere saber la persona, en pocas palabras, por ejemplo «qué fuentes cita la IA»." } },
      required: ["consulta"],
      additionalProperties: false
    },
    args: z.object({ consulta: z.string().min(2).max(200) }),
    access: "public",
    openWorld: false,
    async run(args, ctx) {
      const query = String(args.consulta).trim().slice(0, 200);
      const hits = searchGuides(guideIndex(), query);
      return answer(formatGuides({ query, hits, base: ctx.origin, profile: ctx.profile, signedIn: !!ctx.account }));
    }
  },
  {
    name: "que_es_genscore",
    title: "Qué es GenScore",
    description: ABOUT_DESCRIPTION.claude,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    args: z.object({}).passthrough(),
    access: "public",
    openWorld: false,
    async run(_args, ctx) {
      // Founder price only when Stripe confirms it, same owner as /precios. ChatGPT never shows prices.
      let offer: FounderOfferView = null;
      if (ctx.profile === "claude") {
        try {
          offer = await getFounderOffer();
        } catch {
          offer = null;
        }
      }
      return answer(formatAboutGenScore({ base: ctx.origin, profile: ctx.profile, offer, signedIn: !!ctx.account }));
    }
  }
];

/** The tool list each endpoint publishes: the same tools, worded for its client. */
export function mcpToolsFor(profile: McpProfile): ReadonlyArray<ToolDef<McpContext>> {
  return MCP_TOOLS.map((t) => (t.name === "que_es_genscore" ? { ...t, description: ABOUT_DESCRIPTION[profile] } : t));
}
