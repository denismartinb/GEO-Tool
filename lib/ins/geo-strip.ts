/**
 * GEO-ALERTS-1 (log §440): the one strip Visión general shows about the site,
 * by the order the founder approved: server block, robots.txt block, noindex
 * or nosnippet, content only visible with JavaScript, resolved. At most one.
 *
 * Pure: the page passes the latest audit snapshot (and the previous one, for
 * «resolved»); this decides what to say. The blockers come from
 * `findCitationBlockers`, the same source Recomendaciones reads, so the two
 * screens never disagree.
 */
import {
  blockerStrip,
  blockerUrls,
  engineAccessChanges,
  findCitationBlockers,
  joinNames,
  type BlockerEvidence
} from "@/lib/recommendations/citation-blockers";
import { headlinePath } from "@/lib/recommendations/headline";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";

export type GeoStrip = {
  tone: "warm" | "info" | "pos";
  title: string;
  evidence: BlockerEvidence | null;
  detail: string;
  /** Extra blockers behind the first one, said in one line. */
  more: string | null;
  urls: string[];
  cta: { label: string; href: string } | null;
  /** Only the good news can be closed; the key changes with every audit. */
  dismissKey: string | null;
};

export type GeoStripSnapshot = {
  bots: BotAccessReport | null;
  pages: PageAuditEntry[] | null;
  created_at: string | null;
};

/** «Resolved» is news for a week after the audit that saw it. */
export const RESOLVED_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function jsShellPages(pages: PageAuditEntry[] | null): string[] {
  return (pages ?? []).filter((p) => p.status === "analyzed" && p.check?.citability?.jsShell === true).map((p) => p.url);
}

export function selectGeoStrip(input: {
  projectId: string;
  latest: GeoStripSnapshot | null;
  previous: GeoStripSnapshot | null;
  now: number;
}): GeoStrip | null {
  const latest = input.latest;
  if (!latest) return null;
  const auditHref = `/dashboard/projects/${input.projectId}/web-audit?bloque=geo`;

  const blockers = findCitationBlockers({ bots: latest.bots, pages: latest.pages });
  if (blockers.length > 0) {
    const first = blockerStrip(blockers[0]);
    const rest = blockers.length - 1;
    return {
      tone: "warm",
      title: first.title,
      evidence: first.evidence,
      detail: first.detail,
      more: rest > 0 ? `Y hay ${rest} ${rest === 1 ? "freno más" : "frenos más"}.` : null,
      urls: blockerUrls(blockers[0]),
      cta: { label: "Arreglarlo", href: auditHref },
      dismissKey: null
    };
  }

  const shells = jsShellPages(latest.pages);
  if (shells.length > 0) {
    const one = shells.length === 1 ? headlinePath(shells[0], 28) : null;
    return {
      tone: "info",
      title: one
        ? `La IA ve vacía tu página ${one}`
        : shells.length === 1
          ? "La IA ve vacía una de tus páginas"
          : `La IA ve vacías ${shells.length} de tus páginas`,
      evidence: "Comprobado",
      detail: "Su contenido sólo aparece con JavaScript, y los bots de IA no lo ejecutan.",
      more: null,
      urls: one ? [] : shells,
      cta: { label: "Ver lo que lee la IA", href: auditHref },
      dismissKey: null
    };
  }

  const created = latest.created_at ? Date.parse(latest.created_at) : NaN;
  if (input.previous && Number.isFinite(created) && input.now - created <= RESOLVED_FRESH_MS) {
    const { resolved } = engineAccessChanges(input.previous.bots, latest.bots);
    if (resolved.length > 0) {
      const many = resolved.length > 1;
      return {
        tone: "pos",
        title: `${joinNames(resolved)} ya ${many ? "pueden" : "puede"} leer tu web`,
        evidence: null,
        detail: "Lo comprobamos en la última auditoría. Lo verás en tu Puntuación GEO tras el próximo escaneo.",
        more: null,
        urls: [],
        cta: null,
        dismissKey: `gs-geo-resolved:${input.projectId}:${latest.created_at}`
      };
    }
  }
  return null;
}

/**
 * GEO-ALERTS-1 (log §440): the «Tu web esta semana» block of the weekly
 * digest. Only when something was resolved since a week ago or a block is
 * still open; otherwise null and the block does not appear.
 */
export function buildSiteWeek(input: {
  projectId: string;
  latest: GeoStripSnapshot | null;
  weekAgo: GeoStripSnapshot | null;
}): { resolved: string | null; open: { title: string; detail: string } | null } | null {
  if (!input.latest) return null;
  const { resolved } = engineAccessChanges(input.weekAgo?.bots ?? null, input.latest.bots);
  const openStrip = selectGeoStrip({ projectId: input.projectId, latest: input.latest, previous: null, now: 0 });
  const open = openStrip && openStrip.tone !== "pos" ? { title: openStrip.title, detail: openStrip.detail } : null;
  const resolvedLine =
    resolved.length > 0 ? `${joinNames(resolved)} ya ${resolved.length > 1 ? "pueden" : "puede"} leer tu web.` : null;
  if (!resolvedLine && !open) return null;
  return { resolved: resolvedLine, open };
}
