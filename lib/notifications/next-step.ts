/**
 * NOTIF-LANES-1 (log §297): the «Tu siguiente paso» lane of the bell is the
 * first action of the Recomendaciones plan, never a stored row. It used to be
 * the newest `gap_pending` notification, which the scan picks by impact alone,
 * so it could point to a gap that the screen does not rank among its
 * prioritized actions (founder, 2026-10-11: «si es algo importante debería
 * estar en las recomendaciones prioritarias»). Now both read `selectPlan` over
 * the same inputs, so the bell and the screen name the same action.
 *
 * Pure: the caller passes the plan's first action already chosen.
 */
import { formatPoints, MIN_VISIBLE_POINTS } from "@/lib/recommendations/plan";
import type { RenderedNotification } from "@/lib/notifications/render";

export type NextStepNotice = {
  projectId: string;
  domain: string;
  recommendationId: string;
  title: string;
  potentialPoints: number | null;
  /**
   * GEO-ALERTS-1 (log §440): an AI engine that cannot enter the site (by
   * robots.txt or by the server) is the next step before any content action,
   * because nothing else can be cited by it until it is fixed. Same blocker
   * and title as Recomendaciones (`findCitationBlockers`, `blockerTitle`).
   */
  blocker?: { body: string };
};

export function renderNextStep(notice: NextStepNotice): RenderedNotification {
  if (notice.blocker) {
    return {
      title: notice.title,
      body: notice.blocker.body,
      targetLabel: notice.domain,
      href: `/dashboard/projects/${notice.projectId}/web-audit?bloque=geo`,
      icon: "robot",
      tone: "blue"
    };
  }
  const points =
    typeof notice.potentialPoints === "number" && notice.potentialPoints >= MIN_VISIBLE_POINTS
      ? ` Puede sumar +${formatPoints(notice.potentialPoints)} pt a tu Puntuación GEO.`
      : "";
  return {
    title: notice.title,
    body: `La primera de tus acciones prioritarias en Recomendaciones.${points}`,
    targetLabel: notice.domain,
    href: `/dashboard/projects/${notice.projectId}/recommendations`,
    icon: "target",
    tone: "blue"
  };
}
