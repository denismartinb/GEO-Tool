import type { NotificationPayloadByType, NotificationSeverity, NotificationType } from "@/lib/notifications/types";

/**
 * Translates a raw `{type, payload_json}` notification row into copy ready to
 * render, per docs/specs/notifications/notifications-v1.md section 5.2. Pure
 * and defensive on purpose: `payload_json` is `jsonb` and, in principle,
 * could be malformed (a manual DB edit, a future emitter bug) — every reader
 * here degrades to a safe fallback instead of throwing, so a single bad row
 * never breaks the whole notification list.
 *
 * `domainByProjectId` is passed in rather than looked up here so this stays
 * pure/testable — callers already have the project list loaded
 * (getWorkspaceCounters), resolving the domain in memory costs nothing extra.
 */

export type NotificationIconTone = "pos" | "neg" | "blue" | "warm" | "cyan";

export type RenderedNotification = {
  title: string;
  body: string;
  /** Project domain shown as a sub-line under the title, or null (e.g. trial_ending has no project). */
  targetLabel: string | null;
  href: string | null;
  icon: string;
  tone: NotificationIconTone;
};

export type NotificationRow = {
  type: string;
  severity: NotificationSeverity;
  payload_json: unknown;
  project_id: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function hrefForProject(projectId: string | null, suffix = ""): string | null {
  return projectId ? `/dashboard/projects/${projectId}${suffix}` : null;
}

export function renderNotification(
  row: NotificationRow,
  domainByProjectId: Record<string, string>
): RenderedNotification {
  const payload = asRecord(row.payload_json);
  const domain = row.project_id ? (domainByProjectId[row.project_id] ?? null) : null;

  switch (row.type as NotificationType) {
    case "scan_completed": {
      const score = num(payload.visibilityScore);
      const delta = num(payload.visibilityDelta);
      const newRecs = num(payload.newRecommendations) ?? 0;
      const resolvedGaps = num(payload.resolvedGaps) ?? 0;
      const promptsProcessed = num(payload.promptsProcessed);

      const scoreText =
        score !== null
          ? `Visibilidad ${Math.round(score)}${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}.`
          : "El escaneo ha finalizado con éxito.";
      const clauses: string[] = [];
      if (newRecs > 0) clauses.push(`${newRecs} ${plural(newRecs, "acción nueva", "acciones nuevas")}`);
      if (resolvedGaps > 0) clauses.push(`${resolvedGaps} ${plural(resolvedGaps, "brecha cerrada", "brechas cerradas")}`);
      const tail = clauses.length ? ` ${clauses.join(" y ")}.` : "";

      return {
        title: "Escaneo completado",
        body: `${scoreText}${tail}`,
        targetLabel: domain && promptsProcessed ? `${domain} · ${promptsProcessed} prompts` : domain,
        href: hrefForProject(row.project_id),
        icon: delta !== null && delta < 0 ? "trendDown" : "trendUp",
        tone: delta !== null && delta < 0 ? "neg" : "pos"
      };
    }

    case "scan_failed": {
      return {
        title: "Escaneo fallido",
        body: str(payload.errorSummary, "El escaneo no pudo completarse."),
        targetLabel: domain,
        href: hrefForProject(row.project_id),
        icon: "alertCircle",
        tone: "neg"
      };
    }

    case "gap_resolved": {
      const count = num(payload.count) ?? 0;
      const titles = strArray(payload.sampleTitles);
      const title = count === 1 ? "Brecha cerrada" : `${count} brechas cerradas`;
      const body = titles[0]
        ? count > 1
          ? `${titles[0]} y ${count - 1} más.`
          : `${titles[0]}.`
        : "Una brecha que tenías abierta se ha cerrado.";
      return {
        title,
        body,
        targetLabel: domain,
        href: hrefForProject(row.project_id, "/recommendations"),
        icon: "flag",
        tone: "pos"
      };
    }

    case "gap_pending": {
      const consecutiveRuns = num(payload.consecutiveRuns) ?? 0;
      const recTitle = str(payload.recommendationTitle, "Una recomendación");
      return {
        title: "Brecha pendiente de resolver",
        body: `«${recTitle}» sigue abierta ${consecutiveRuns} ${plural(consecutiveRuns, "escaneo", "escaneos")} después.`,
        targetLabel: domain,
        href: hrefForProject(row.project_id, "/recommendations"),
        icon: "hourglass",
        tone: "warm"
      };
    }

    case "emerging_competitor": {
      const competitor = str(payload.competitor, "Una marca");
      const promptCount = num(payload.promptCount) ?? 0;
      return {
        title: "Marca emergente en tus respuestas",
        body: `La IA menciona a ${competitor} en ${promptCount} ${plural(promptCount, "consulta", "consultas")} y no la monitorizas.`,
        targetLabel: domain,
        href: hrefForProject(row.project_id, "/competitors"),
        icon: "resonance",
        tone: "cyan"
      };
    }

    case "ai_bot_blocked": {
      const agent = str(payload.agent, "Un bot de IA");
      return {
        title: `${agent} no puede acceder a tu web`,
        body: "Tu robots.txt lo bloquea. Mientras siga así no puedes aparecer en sus respuestas.",
        targetLabel: domain,
        href: hrefForProject(row.project_id, "/web-audit"),
        icon: "robot",
        tone: "neg"
      };
    }

    case "audit_completed": {
      const score = num(payload.readinessScore);
      return {
        title: "Auditoría web completada",
        body: `Preparación técnica ${score !== null ? Math.round(score) : "—"}/100.`,
        targetLabel: domain,
        href: hrefForProject(row.project_id, "/web-audit"),
        icon: "shield",
        tone: "blue"
      };
    }

    case "trial_ending": {
      const daysLeft = num(payload.daysLeft) ?? 0;
      return {
        title: "Tu prueba termina pronto",
        body: `Quedan ${daysLeft} ${plural(daysLeft, "día", "días")}. Después pasarás al plan Free.`,
        targetLabel: null,
        href: "/dashboard/settings/billing",
        icon: "card",
        tone: "warm"
      };
    }

    default:
      // Unknown/future type: degrade to a generic, harmless render rather
      // than throwing — a single bad or ahead-of-its-time row must never
      // break the rest of the list.
      return {
        title: "Notificación",
        body: "",
        targetLabel: domain,
        href: hrefForProject(row.project_id),
        icon: "bell",
        tone: "blue"
      };
  }
}

/** CSS class suffix for the icon badge's tone — see .notif-icon-{tone} in app/globals.css. */
export function toneClassName(tone: NotificationIconTone): string {
  return `notif-icon-${tone}`;
}

/** Shared by the bell panel and the full notifications page — kept here so both stay in sync. */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD} d`;
}

/** "Hoy" / "Ayer" / "12 de julio" — the day-group label used by both surfaces. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

/** Groups already-sorted (created_at desc) items into consecutive day buckets. */
export function groupByDay<T extends { createdAt: string }>(items: T[]): Array<{ label: string; items: T[] }> {
  const groups: Array<{ label: string; items: T[] }> = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}
