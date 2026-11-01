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
import { createServiceClient } from "@/lib/supabase/service";
import {
  PAGE_REVIEW_FAILURE,
  formatAudits,
  formatCompetitors,
  formatDomainSummary,
  formatDomains,
  formatNotFound,
  formatPageReview,
  formatPlanNotice,
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
      if (account.planId === "free") return answer(formatPlanNotice());
      const domain = normalizeHost(String(args.dominio));
      if (!domain) return { ...answer(formatNotFound(String(args.dominio).slice(0, 100), ctx.origin)), isError: true };
      const data = await loadExtProjectData(account, { domain, url: null });
      if (data.kind === "not_found") return answer(formatNotFound(domain, ctx.origin));
      return answer(format(data.payload, { base: ctx.origin, projectId: data.project.id }));
    }
  };
}

export const MCP_TOOLS: ReadonlyArray<ToolDef<McpContext>> = [
  {
    name: "listar_dominios",
    title: "Listar dominios",
    description: "Lista los dominios que la persona sigue en GenScore y su plan. Úsala primero para saber qué dominio consultar.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    args: z.object({}).passthrough(),
    access: "account",
    openWorld: false,
    async run(_args, ctx) {
      const account = ctx.account;
      if (!account) throw new Error("unreachable: access=account");
      const projects = await listExtProjects(account);
      return answer(
        formatDomains({
          base: ctx.origin,
          email: account.user.email,
          planName: account.planName,
          trialEndsAt: account.trialEndsAt,
          domainCap: account.domainCap,
          domains: projects.map((p) => ({ domain: p.domain, brand: p.brand?.trim() || p.name, projectId: p.id }))
        })
      );
    }
  },
  domainTool(
    "ver_dominio",
    "Ver resumen del dominio",
    "Resumen del último escaneo de un dominio: Puntuación GEO, en qué parte de las respuestas lo nombran ChatGPT, Gemini, Claude y Perplexity, las marcas más nombradas, la salud técnica y el comercio agéntico.",
    formatDomainSummary
  ),
  domainTool(
    "ver_recomendaciones",
    "Ver recomendaciones",
    "Las acciones que GenScore recomienda hacer primero en un dominio para aparecer más en las respuestas de la IA y en Google, en orden, con su primer paso.",
    formatRecommendations
  ),
  domainTool(
    "ver_competidores",
    "Ver competidores",
    "Qué marcas nombra más la IA en las preguntas principales de búsqueda de un dominio, con su cuota de respuestas, incluida la propia marca.",
    formatCompetitors
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
      "Revisa cualquier página web pública como la extensión de Chrome de GenScore: si los motores de IA pueden leerla, cómo está para Google y, si vende algo, si un agente de compra la entiende. Da la nota SEO + IA y qué arreglar, con el código para pegar. No necesita cuenta; con la cuenta conectada y una página de un dominio propio, añade qué preguntas la citan y sus datos de Google.",
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
      let next: PageReviewNext | null = ctx.account ? null : { base: ctx.origin, account: null };
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
            account: {
              projects: projects.map((p) => ({ domain: p.domain, projectId: p.id })),
              canAddDomain: projects.length < ctx.account.domainCap
            }
          };
        }
      }
      return answer(formatPageReview(outcome.review, own, next));
    }
  }
];
