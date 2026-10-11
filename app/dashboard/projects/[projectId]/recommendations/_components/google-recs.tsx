import { Suspense, cache } from "react";
import type { AuthenticatedContext } from "@/lib/auth";
import { Icon } from "@/components/ui/icon";
import { loadSearchConsoleScreen } from "@/lib/search-console/load";
import { buildGoogleRecommendations, type GoogleRecommendation } from "@/lib/search-console/recommendations";
import { readRecStates } from "@/lib/search-console/rec-states";
import { readSearchConsoleInputs } from "@/lib/search-console/screen-inputs";
import { GoogleRecFrame, GoogleRecMark } from "./google-rec-frame";
import { GoogleWatchActions } from "./google-watch";
import { GooglePlanCard } from "./google-plan-card";
import { GooglePlanMarker } from "./google-plan-state";
import { laterCopy, pickPlanRec } from "./google-rec-copy";

/**
 * Recomendaciones con tus datos de Google (SEARCH-SEO-1 Fase 3d, log §293).
 * Only with Search Console connected; recomputed on every load from the same
 * cached Google rows as «Posición en Google», so a card leaves by itself when
 * its number improves. Only what the customer did with a card is stored
 * («Marcar como hecho» / «Ahora no», log §294, migration 0042), and a handled
 * card gives way to the next case of its kind.
 *
 * RECS-ONE-QUEUE-1 (log §307, design in docs/design-reference/recs-one-queue-1/):
 * one queue instead of two pills. The strongest Google card that asks for a
 * change on the site takes the plan's second slot (`GooglePlanSlot`); the rest
 * open «Más adelante» as a one-row carousel (`GoogleLaterSlot`). Both stream in
 * behind their own Suspense: a slow Google never holds back the AI cards.
 */

type SlotProps = {
  projectId: string;
  ownerUserId: string;
  domain: string;
  supabase: AuthenticatedContext["supabase"];
};

/**
 * One Google read per request, shared by the plan slot and the carousel
 * (React `cache`, keyed on the same arguments both slots receive).
 */
const loadGoogleRecs = cache(
  async (
    projectId: string,
    ownerUserId: string,
    domain: string,
    supabase: AuthenticatedContext["supabase"]
  ): Promise<{ recs: GoogleRecommendation[]; canPersist: boolean } | null> => {
    const [{ auditedPages, trackedPrompts }, recStates] = await Promise.all([
      readSearchConsoleInputs(supabase, projectId),
      readRecStates(supabase, projectId, ownerUserId)
    ]);
    const state = await loadSearchConsoleScreen(projectId, ownerUserId, domain, auditedPages, trackedPrompts, false);
    if (state.kind !== "ready") return null;
    const recs = buildGoogleRecommendations({
      report: state.report,
      pageByQuery: state.insights.pageByQuery,
      pages: state.insights.pages,
      ctr: state.insights.ctr,
      questions: state.insights.questions,
      hidden: recStates.available ? recStates.hidden : undefined
    });
    return { recs, canPersist: recStates.available };
  }
);

function load({ projectId, ownerUserId, domain, supabase }: SlotProps) {
  return loadGoogleRecs(projectId, ownerUserId, domain, supabase);
}

/** The short card of the «Con tus datos de Google» row. */
export function GoogleLaterCard({
  rec,
  projectId,
  canPersist = false
}: {
  rec: GoogleRecommendation;
  projectId: string;
  canPersist?: boolean;
}) {
  const copy = laterCopy(rec);
  return (
    <GoogleRecFrame
      projectId={projectId}
      canPersist={canPersist}
      kind={rec.kind}
      query={rec.query}
      position={rec.position}
      impressions={rec.impressions}
      ctr={rec.kind === "improve_snippet" ? rec.ctr : null}
    >
      <div className="grec-kind">{copy.kind}</div>
      <h4 title={rec.query}>{copy.title}</h4>
      <p className="grec-ev">{copy.text}</p>
      {rec.kind === "watch_in_ai" ? (
        <GoogleWatchActions projectId={projectId} query={rec.query} />
      ) : (
        <div className="grec-acts">
          <GoogleRecMark status="done" label="Marcar como hecho" />
          <GoogleRecMark status="dismissed" label="Ahora no" quiet />
        </div>
      )}
    </GoogleRecFrame>
  );
}

function GoogleRowHead() {
  return (
    <div className="grec-head" id="grec-title">
      <span className="rec2-src rec2-src-g"><Icon name="search" size={11} />Google</span>
      Con tus datos de Google
      <span className="grec-head-sub">Search Console · últimos 28 días</span>
    </div>
  );
}

async function GoogleLaterResolved({ includePlan, ...props }: SlotProps & { includePlan: boolean }) {
  const data = await load(props);
  if (!data) return null;
  const planRec = includePlan ? null : pickPlanRec(data.recs);
  const later = data.recs.filter((r) => r !== planRec);
  if (later.length === 0) return null;
  return (
    <section className="grec" aria-labelledby="grec-title">
      <GoogleRowHead />
      <div className="grec-list">
        {later.map((rec) => (
          <GoogleLaterCard
            key={`${rec.kind}:${rec.query}`}
            rec={rec}
            projectId={props.projectId}
            canPersist={data.canPersist}
          />
        ))}
      </div>
    </section>
  );
}

/** Same row and card size as the real block, so nothing moves when it lands. */
function GoogleLaterSkeleton() {
  return (
    <section className="grec" aria-labelledby="grec-title" aria-busy="true">
      <GoogleRowHead />
      <div className="grec-list">
        {[0, 1].map((i) => (
          <div key={i} className="grec-card grec-skel" aria-hidden="true">
            <span className="grec-skel-line grec-skel-tag" />
            <span className="grec-skel-line grec-skel-title" />
            <span className="grec-skel-line" />
            <span className="grec-skel-line grec-skel-short" />
            <span className="grec-skel-line grec-skel-btn" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The carousel at the top of «Más adelante». Mounted only with Search Console
 * connected (the page reads that from our database, no Google call, log §298).
 * `includePlan` puts every Google card here, for a screen with no AI plan.
 */
export function GoogleLaterSlot({ includePlan = false, ...props }: SlotProps & { includePlan?: boolean }) {
  return (
    <Suspense fallback={<GoogleLaterSkeleton />}>
      <GoogleLaterResolved {...props} includePlan={includePlan} />
    </Suspense>
  );
}

async function GooglePlanResolved({ rank, ...props }: SlotProps & { rank: number }) {
  const data = await load(props);
  const planRec = data ? pickPlanRec(data.recs) : null;
  return (
    <>
      <GooglePlanMarker kind={planRec?.kind ?? null} />
      {planRec && data && (
        <GooglePlanCard rec={planRec} projectId={props.projectId} rank={rank} canPersist={data.canPersist} />
      )}
    </>
  );
}

/** A collapsed plan card's height, so the third AI card doesn't jump. */
function GooglePlanSkeleton() {
  return (
    <div className="rec-card rec2-priority rec2-gcard-skel" aria-hidden="true">
      <span className="grec-skel-line grec-skel-tag" />
      <span className="grec-skel-line grec-skel-title" />
      <span className="grec-skel-line" />
      <span className="grec-skel-line grec-skel-short" />
    </div>
  );
}

/** Slot 2 of «Tu plan de esta semana», when Search Console is connected. */
export function GooglePlanSlot({ rank, ...props }: SlotProps & { rank: number }) {
  return (
    <Suspense fallback={<GooglePlanSkeleton />}>
      <GooglePlanResolved {...props} rank={rank} />
    </Suspense>
  );
}
