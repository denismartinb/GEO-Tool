import "server-only";
import { readAgenticAudits } from "@/lib/agentic-audit/console-audit";
import { overviewAgenticCard } from "@/lib/agentic-audit/visibility-model";
import { resolveSystemPlanId } from "@/lib/billing";
import { isSameOrSubdomain } from "@/lib/domains/brand-domain";
import { listExtProjects, type ExtAccount, type ExtProjectRow } from "@/lib/ext/account";
import { buildExtAudits, type ExtAudits } from "@/lib/ext/audits";
import { buildExtPrompts, type ActivePrompt, type ExtPrompt } from "@/lib/ext/prompts";
import { buildExtProjectSummary, isOwnUrl, type ExtProjectSummary } from "@/lib/ext/summary";
import { toExtSearchConsole, type ExtSearchConsole } from "@/lib/ext/search-console";
import { loadSearchConsoleScreen, type SearchConsoleScreen } from "@/lib/search-console/load";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import { loadReportInput } from "@/lib/report/report-data";
import { buildReportModel } from "@/lib/report/report-model";
import { getEngineMeta } from "@/lib/scan/engine-meta";

/**
 * CHROME-EXT-1 paso 02 (log §361) and MCP-SERVER-1 (log §418): one of the
 * account's projects, as the extension panel shows it. The panel route and
 * the MCP tools both read it from here, so the chat and the panel can never
 * show different figures for the same domain.
 *
 * Read-only, no LLM, no service role: `account.supabase` is the user's own
 * RLS-scoped client (cookie for the panel, OAuth bearer for MCP). A domain
 * that is not one of the account's projects is `not_found`, never another
 * account's data.
 */

export type ExtProjectPayload = ExtProjectSummary & {
  searchConsole: ExtSearchConsole;
  audits: ExtAudits;
  /** MCP-PROMPTS-1 (log §428): the active prompts and what each engine did with them in the latest scan. */
  prompts: ExtPrompt[];
};

export type ExtProjectData =
  | { kind: "not_found" }
  | { kind: "ok"; project: ExtProjectRow; payload: ExtProjectPayload };

/** The most specific project of the account that covers `domain` (blog.marca.es over marca.es). */
export function pickProject(projects: readonly ExtProjectRow[], domain: string): ExtProjectRow | null {
  return (
    projects
      .filter((p) => isSameOrSubdomain(domain, p.domain))
      .sort((a, b) => b.domain.length - a.domain.length)[0] ?? null
  );
}

export function normalizeHost(raw: string | null | undefined): string | null {
  let host = (raw ?? "").trim().toLowerCase();
  // A full URL is accepted too: the chat often pastes one.
  if (/^https?:\/\//.test(host)) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]{1,253}$/.test(host) && host.includes(".") ? host : null;
}

export async function loadExtProjectData(
  account: ExtAccount,
  { domain, url }: { domain: string; url: string | null }
): Promise<ExtProjectData> {
  const project = pickProject(await listExtProjects(account), domain);
  if (!project) return { kind: "not_found" };

  const [input, audits, { data: snapshotRow }, gsc, { data: promptRows, error: promptsError }] = await Promise.all([
    loadReportInput({ supabase: account.supabase, project }),
    readAgenticAudits(account.supabase, project.id, account.user.id),
    // The same latest technical snapshot «Tu web para la IA» and «Tu web para Google» read.
    account.supabase
      .from("web_audit_snapshots")
      .select("pages, bots, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // EXT-GSC-1/2 (log §409, §411): the same Search Console rows as «Posición en Google».
    // The project came from the account's own list, so its ids are verified.
    readSearchConsole(project.id, account.user.id, project.domain),
    // The same active list «Prompts» reads.
    account.supabase
      .from("project_prompts")
      .select("id, prompt_text, category, created_at")
      .eq("project_id", project.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
  ]);
  const model = input ? buildReportModel(input) : null;
  const planId = account.profile ? resolveSystemPlanId(account.profile) : null;
  const agentic = overviewAgenticCard(planId, audits.available ? (audits.latest?.result ?? null) : null);

  const askedUrl = url && url.length <= 2048 ? url : null;
  const ownUrl = askedUrl && isOwnUrl(askedUrl, project.domain) ? askedUrl : null;
  const snap = snapshotRow as { pages: PageAuditEntry[] | null; bots: BotAccessReport | null; created_at: string } | null;
  // EXT-AUDITS-1 (log §406): what the console already audited, read-only.
  const extAudits = buildExtAudits({
    snapshot: snap?.pages && snap.bots ? { pages: snap.pages, bots: snap.bots, createdAt: snap.created_at } : null,
    // Same gate as the agentic card: hidden for a plan or a review the console would not show.
    agentic: agentic.kind === "card" && audits.available ? (audits.latest?.result ?? null) : null,
    ownUrl
  });
  return {
    kind: "ok",
    project,
    payload: {
      ...buildExtProjectSummary({
        project: { domain: project.domain, brand: project.brand?.trim() || project.name },
        model,
        answers: input?.answers ?? [],
        agentic,
        url: askedUrl,
        engineLabel: (provider) => getEngineMeta(provider).label,
        competitors: input?.competitors ?? [],
        // «Salud SEO» is the audit's SEO block, the figure the console shows under that name.
        seoScore: extAudits.blocks.find((b) => b.key === "seo")?.score ?? null
      }),
      searchConsole: toExtSearchConsole(gsc, ownUrl),
      audits: extAudits,
      prompts: buildExtPrompts({
        active: promptsError
          ? null
          : ((promptRows ?? []) as Array<{ id: string; prompt_text: string; category: string | null }>).map(
              (r): ActivePrompt => ({ id: r.id, text: r.prompt_text, topic: r.category })
            ),
        matrix: model?.matrix ?? null,
        engineLabel: (provider) => getEngineMeta(provider).label
      })
    }
  };
}

/** Google may be slow; the panel never waits for it past a few seconds. */
const GSC_WAIT_MS = 6000;

async function readSearchConsole(projectId: string, ownerUserId: string, domain: string): Promise<SearchConsoleScreen | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      // No audited pages, no prompts and no indexing inspections: the panel
      // only reads the search analytics, which share the screen's cache entry.
      loadSearchConsoleScreen(projectId, ownerUserId, domain, [], [], false),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), GSC_WAIT_MS);
      })
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
