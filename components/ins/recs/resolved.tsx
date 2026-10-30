"use client";

import { useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { useToast } from "@/components/ins/toasts";
import { useActionFeedback } from "@/components/ui/action-feedback";
import { restoreRecommendationAction } from "@/app/dashboard/projects/[projectId]/actions";
import {
  coveredPageLead,
  displayPageUrl,
  predictionVerdictLine,
  type ResolvedHistoryItem,
} from "@/app/dashboard/projects/[projectId]/recommendations/recommendations-client";
import { labelForType } from "@/lib/recommendations/recommendation-engine";
import { TitleWithPath } from "./card-parts";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
}

/**
 * One row of «Resueltas». «Deshacer» lives here, durable, only on a dismissed
 * row of the current run: restoring an older run's row would flip its status
 * and leave it invisible everywhere (ACTIONS-OBSERVABLE-1 slice 4a).
 */
export function ResolvedRow({
  item,
  projectId,
  latestCompletedRunId,
}: {
  item: ResolvedHistoryItem;
  projectId: string;
  latestCompletedRunId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const restore = useActionFeedback();
  const verdict = predictionVerdictLine(item);
  const canUndo =
    item.status === "dismissed" && item.run_id === latestCompletedRunId;
  const covered = item.status === "covered";
  const label = covered
    ? "Ya lo tienes"
    : item.status === "resolved"
      ? "Resuelta automáticamente"
      : "Marcada como hecha";

  return (
    <div className="hist">
      <Ic n="checkc" />
      <div className="b">
        <div className="rc-hb">
          <span
            className={`badge ${covered || item.status === "resolved" ? "b-pos" : "b-blue"}`}
          >
            {label}
          </span>
          <span className="badge b-line">
            {labelForType(item.recommendation_type)}
          </span>
        </div>
        <h4>
          {covered ? <s>{item.title}</s> : <TitleWithPath text={item.title} />}
        </h4>
        <p>
          {dateLabel(item.updated_at)}
          {covered &&
          item.coveredPageUrl &&
          /^https?:\/\//i.test(item.coveredPageUrl) ? (
            <>
              {" · "}
              {coveredPageLead(item.recommendation_type)}{" "}
              <a
                className="mono"
                href={item.coveredPageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {displayPageUrl(item.coveredPageUrl)}
              </a>
            </>
          ) : null}
        </p>
        {verdict ? <p>{verdict}</p> : null}
        {restore.state.status === "error" ? (
          <p className="rc-err" role="alert">
            {restore.state.message}
          </p>
        ) : null}
      </div>
      {canUndo ? (
        <button
          type="button"
          className="btn sm ghost"
          disabled={restore.isPending}
          onClick={() =>
            restore.run(
              () =>
                restoreRecommendationAction({
                  projectId,
                  recommendationId: item.id,
                }),
              {
                successMessage: "Restaurada.",
                onSuccess: () => {
                  toast(
                    "Restaurada.",
                    "Vuelve a estar entre tus pendientes.",
                    "undo",
                  );
                  router.refresh();
                },
              },
            )
          }
        >
          <Ic n="undo" sm />
          {restore.isPending ? "Deshaciendo…" : "Deshacer"}
        </button>
      ) : null}
    </div>
  );
}
