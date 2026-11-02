import type { AgenticCheckResult } from "@/lib/agentic-audit/api-contract";
import { scoreIfChecksPass } from "@/lib/agentic-audit/score";
import { firstSteps } from "@/lib/agentic-audit/console-model";
import { AUDIT_BLOCKS, buildAuditBlock, type AuditBlockKey } from "@/lib/web-audit/audit-blocks";
import { buildTechnicalIssuesReport, pageCheckStates, type IssueCheckKey, type IssueSeverity } from "@/lib/web-audit/issues";
import { ISSUE_CHECK_META, issueScopeLabel } from "@/lib/web-audit/issue-labels";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import { engineReadStates } from "@/lib/web-audit/ai-bots";

/** Every measured engine can read the site (AI-BOTS-CONSOLE-1, log §426). Null when none was measured. */
function aiEnginesCanRead(bots: BotAccessReport): boolean | null {
  const measured = Object.values(engineReadStates(bots)).filter((v): v is boolean => v !== null);
  return measured.length ? measured.every(Boolean) : null;
}

/**
 * EXT-AUDITS-1 (log §406): the three audits of the selected domain, as the
 * extension shows them. Pure: the route reads the latest technical snapshot
 * and the latest agentic review, this module only picks fields.
 *
 * Every figure comes from its owner in the console, never recomputed:
 *  - GEO and SEO blocks: `buildAuditBlock` over `buildTechnicalIssuesReport`,
 *    the same pair «Tu web para la IA» and «Tu web para Google» use;
 *  - agentic: the review's own score, `firstSteps` and `scoreIfChecksPass`,
 *    the same as «Visibilidad en agentes».
 * Read-only: nothing here launches an audit or calls an LLM.
 */

export const EXT_AUDIT_ISSUES = 3;

export type ExtAuditIssue = {
  label: string;
  /** Where it fails («3 de 12 páginas») or, in the agentic block, the component. */
  scope: string;
  /** Block points (or Agentes points) gained by fixing it alone. Null when it carries none. */
  points: number | null;
  severity: IssueSeverity | "agentic";
};

export type ExtAuditBlock = {
  key: AuditBlockKey | "agent";
  score: number;
  /** The score if the listed issues were fixed. Null when nothing would move it. */
  projected: number | null;
  /**
   * The block's score if every scored issue were fixed, even when there are
   * more than the listed ones. For a header («25 → 100»), never for «si
   * arreglas estos tres». Null when nothing would move it.
   */
  projectedAll: number | null;
  issues: ExtAuditIssue[];
};

export type ExtPageAudit =
  | { state: "not_audited" }
  | {
      state: "audited";
      /** robots.txt as the server read it: every engine's search bots may enter. Null when unknown. */
      aiBotsAllowed: boolean | null;
      /** false when the page carries noindex. Null on snapshots that never measured it. */
      indexable: boolean | null;
      issues: Array<{ label: string; block: AuditBlockKey }>;
    };

export type ExtAudits = {
  /** When the technical audit was taken (ISO). Null without one. */
  auditedAt: string | null;
  blocks: ExtAuditBlock[];
  /** Only when the panel asked about a page of this domain. */
  page: ExtPageAudit | null;
};

export type ExtAuditsInput = {
  snapshot: { pages: PageAuditEntry[]; bots: BotAccessReport; createdAt: string } | null;
  /** The latest agentic review, already gated by plan (null when the console would not show it). */
  agentic: AgenticCheckResult | null;
  /** An URL of this project's domain, or null. */
  ownUrl: string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function technicalBlock(key: AuditBlockKey, pages: PageAuditEntry[], bots: BotAccessReport): ExtAuditBlock | null {
  const view = buildAuditBlock(key, pages, buildTechnicalIssuesReport(pages, bots), bots);
  if (view.score === null) return null;
  const top = view.issues.slice(0, EXT_AUDIT_ISSUES);
  // «Si arreglas estos tres» only when they are all the block's scored
  // issues: block points are not additive, so a partial sum would be invented.
  const covered = view.scoredIssueCount > 0 && view.scoredIssueCount <= EXT_AUDIT_ISSUES;
  return {
    key,
    score: view.score,
    projected: covered && view.projectedScore !== null && view.projectedScore > view.score ? view.projectedScore : null,
    projectedAll: view.projectedScore !== null && view.projectedScore > view.score ? view.projectedScore : null,
    issues: top.map((i) => ({
      label: ISSUE_CHECK_META[i.issue.check].label,
      scope: issueScopeLabel(i.issue),
      points: i.blockPoints,
      severity: i.issue.severity
    }))
  };
}

function agenticBlock(result: AgenticCheckResult): ExtAuditBlock | null {
  if (result.score === null) return null;
  const score = result.score;
  const steps = firstSteps(result, EXT_AUDIT_ISSUES);
  const projected = steps.length ? scoreIfChecksPass(result, new Set(steps.map((s) => s.checkId))) : null;
  const all = firstSteps(result, Number.MAX_SAFE_INTEGER);
  const projectedAll = all.length ? scoreIfChecksPass(result, new Set(all.map((s) => s.checkId))) : null;
  return {
    key: "agent",
    score,
    projected: projected !== null && projected > score ? projected : null,
    projectedAll: projectedAll !== null && projectedAll > score ? projectedAll : null,
    issues: steps.map((s) => {
      const alone = scoreIfChecksPass(result, new Set([s.checkId]));
      return {
        label: s.title,
        scope: result.components.find((c) => c.id === s.component)?.name ?? "",
        points: alone !== null && alone > score ? round1(alone - score) : null,
        severity: "agentic" as const
      };
    })
  };
}

function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a), y = new URL(b);
    const path = (u: URL) => u.pathname.replace(/\/+$/, "") || "/";
    return x.hostname.replace(/^www\./, "") === y.hostname.replace(/^www\./, "") && path(x) === path(y);
  } catch {
    return false;
  }
}

function pageAudit(url: string, pages: PageAuditEntry[], bots: BotAccessReport): ExtPageAudit {
  const entry = pages.find((p) => p.status === "analyzed" && p.check && samePage(p.url, url));
  if (!entry?.check) return { state: "not_audited" };
  const blockOf = (check: IssueCheckKey): AuditBlockKey | null =>
    AUDIT_BLOCKS.geo.checks.includes(check) ? "geo" : AUDIT_BLOCKS.seo.checks.includes(check) ? "seo" : null;
  const issues = pageCheckStates(entry.check)
    .filter((s) => s.fails)
    .flatMap((s) => {
      const block = blockOf(s.check);
      return block ? [{ label: ISSUE_CHECK_META[s.check].label, block }] : [];
    });
  return {
    state: "audited",
    aiBotsAllowed: aiEnginesCanRead(bots),
    indexable: entry.check.indexability ? !entry.check.indexability.noindex : null,
    issues
  };
}

export function buildExtAudits({ snapshot, agentic, ownUrl }: ExtAuditsInput): ExtAudits {
  const blocks: ExtAuditBlock[] = [];
  if (snapshot) {
    for (const key of ["geo", "seo"] as const) {
      const b = technicalBlock(key, snapshot.pages, snapshot.bots);
      if (b) blocks.push(b);
    }
  }
  if (agentic) {
    const b = agenticBlock(agentic);
    if (b) blocks.push(b);
  }
  return {
    auditedAt: snapshot?.createdAt ?? null,
    blocks,
    page: ownUrl && snapshot ? pageAudit(ownUrl, snapshot.pages, snapshot.bots) : null
  };
}
