import { readAgenticAudits } from "@/lib/agentic-audit/console-audit";
import { overviewAgenticCard } from "@/lib/agentic-audit/visibility-model";
import { resolveSystemPlanId } from "@/lib/billing";
import { isSameOrSubdomain } from "@/lib/domains/brand-domain";
import { extJson, listExtProjects, readExtAccount } from "@/lib/ext/account";
import { buildExtProjectSummary } from "@/lib/ext/summary";
import { loadReportInput } from "@/lib/report/report-data";
import { buildReportModel } from "@/lib/report/report-model";
import { getEngineMeta } from "@/lib/scan/engine-meta";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * CHROME-EXT-1 paso 02 (log §361): one of the account's projects, as the
 * panel shows it. `domain` picks the project that covers it (the open page's
 * host, or a domain from the selector); `url`, when it belongs to that
 * project, adds the prompts of the latest scan that cited it.
 *
 * Read-only, no LLM, no service role. Every figure comes from the same owner
 * as the console (see `lib/ext/summary.ts`). A domain that is not one of the
 * account's projects is a 404, never another account's data.
 */
export async function GET(request: Request) {
  const account = await readExtAccount();
  if (!account) return extJson({ error: "unauthenticated" }, 401);

  const params = new URL(request.url).searchParams;
  const domain = normalizeHost(params.get("domain"));
  if (!domain) return extJson({ error: "missing_domain" }, 400);
  const url = params.get("url");

  const projects = await listExtProjects(account);
  // The most specific project wins (blog.marca.es over marca.es).
  const project = projects
    .filter((p) => isSameOrSubdomain(domain, p.domain))
    .sort((a, b) => b.domain.length - a.domain.length)[0];
  if (!project) return extJson({ error: "not_found" }, 404);

  const [input, audits] = await Promise.all([
    loadReportInput({ supabase: account.supabase, project }),
    readAgenticAudits(account.supabase, project.id, account.user.id)
  ]);
  const model = input ? buildReportModel(input) : null;
  const planId = account.profile ? resolveSystemPlanId(account.profile) : null;
  const agentic = overviewAgenticCard(planId, audits.available ? (audits.latest?.result ?? null) : null);

  return extJson(
    buildExtProjectSummary({
      project: { domain: project.domain, brand: project.brand?.trim() || project.name },
      model,
      answers: input?.answers ?? [],
      agentic,
      url: url && url.length <= 2048 ? url : null,
      engineLabel: (provider) => getEngineMeta(provider).label
    })
  );
}

function normalizeHost(raw: string | null): string | null {
  const host = (raw ?? "").trim().toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9.-]{1,253}$/.test(host) && host.includes(".") ? host : null;
}
