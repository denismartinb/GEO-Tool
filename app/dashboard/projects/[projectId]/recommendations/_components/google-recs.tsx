import Link from "next/link";
import { Suspense } from "react";
import type { AuthenticatedContext } from "@/lib/auth";
import { TIERS, displayPath, tierOf } from "@/lib/search-console/insights";
import { isSearchConsoleActive, loadSearchConsoleScreen } from "@/lib/search-console/load";
import { buildGoogleRecommendations, type GoogleRecommendation } from "@/lib/search-console/recommendations";
import { readRecStates } from "@/lib/search-console/rec-states";
import { readSearchConsoleInputs } from "@/lib/search-console/screen-inputs";
import { fmtInt, fmtPct, fmtPosition } from "../../search-console/_components/format";
import { GoogleRecFrame, GoogleRecMark } from "./google-rec-frame";
import { GoogleWatchActions } from "./google-watch";
import { GoogleRecsPresent } from "./recs-view-tabs";

/**
 * Recomendaciones con tus datos de Google (SEARCH-SEO-1 Fase 3d, log §293,
 * design in docs/design-reference/search-seo-1/fase-3b/Recs.dc.html). Only
 * with Search Console connected; recomputed on every load from the same
 * cached Google rows as «Posición en Google», so a card leaves by itself when
 * its number improves. Only what the customer did with a card is stored
 * («Marcar como hecho» / «Ahora no», log §294, migration 0042), and a handled
 * card gives way to the next case of its kind. Rendered inside a Suspense
 * boundary: a slow Google never holds back the AI recommendations below.
 */

/** "/precios", or «tu Home» for the root: a bare "/" reads as a typo. */
function pageName(url: string): string {
  const path = displayPath(url);
  return path === "/" ? "tu Home" : path;
}

function joinPaths(urls: string[]): string {
  const paths = urls.map((u) => pageName(u));
  return paths.length <= 1 ? (paths[0] ?? "") : `${paths.slice(0, -1).join(", ")} y ${paths[paths.length - 1]}`;
}

function impressionsText(n: number): string {
  return `${fmtInt(n)} ${n === 1 ? "vez" : "veces"}`;
}

function frameProps(rec: GoogleRecommendation) {
  return {
    kind: rec.kind,
    query: rec.query,
    position: rec.position,
    impressions: rec.impressions,
    ctr: rec.kind === "improve_snippet" ? rec.ctr : null
  };
}

export function GoogleRecCard({
  rec,
  projectId,
  canPersist = false
}: {
  rec: GoogleRecommendation;
  projectId: string;
  canPersist?: boolean;
}) {
  const gscHref = `/dashboard/projects/${projectId}/search-console`;
  const frame = { projectId, canPersist, ...frameProps(rec) };

  if (rec.kind === "push_page_one") {
    const where = rec.page ? pageName(rec.page) : "la página que sale";
    return (
      <GoogleRecFrame {...frame}>
        <div className="grec-tags">
          <span className="grec-tag grec-g">Datos de Google</span>
          <span className="grec-tag">Subir a la página 1</span>
        </div>
        <h4>Sube «{rec.query}» a la primera página de Google</h4>
        <p className="grec-ev">
          Estás en el puesto {fmtPosition(rec.position)}
          {rec.page ? ` con ${pageName(rec.page)}` : ""} y la ven {impressionsText(rec.impressions)} en 28 días. Es tu
          búsqueda con más impresiones en la página 2.
        </p>
        <p className="grec-step">
          <b>Primer paso:</b> responde a «{rec.query}» en las primeras líneas de {where} y enlázala desde{" "}
          {rec.linkFrom.length > 0
            ? `${joinPaths(rec.linkFrom)}, que ya ${rec.linkFrom.length === 1 ? "está" : "están"} en la página 1.`
            : "tus páginas más visitadas."}
        </p>
        <div className="grec-acts">
          <Link className="btn btn-ghost btn-sm" href={gscHref}>
            Ver en Posición en Google
          </Link>
          <GoogleRecMark status="done" label="Marcar como hecho" />
        </div>
      </GoogleRecFrame>
    );
  }

  if (rec.kind === "improve_snippet") {
    const tier = TIERS.find((t) => t.key === tierOf(rec.position));
    const peers = tier ? `en los ${tier.range.toLowerCase()}` : "en ese tramo";
    return (
      <GoogleRecFrame {...frame}>
        <div className="grec-tags">
          <span className="grec-tag grec-g">Datos de Google</span>
          <span className="grec-tag">Título y descripción</span>
        </div>
        <h4>
          {rec.page
            ? `Mejora el título de ${pageName(rec.page)}: la ven ${impressionsText(rec.impressions)} y entra el ${fmtPct(rec.ctr)}`
            : `Mejora el título de la página que sale para «${rec.query}»`}
        </h4>
        <p className="grec-ev">
          Sales en el puesto {fmtPosition(rec.position)} para «{rec.query}». Tus otras búsquedas {peers} entran alrededor
          del {fmtPct(rec.benchmark)}.
        </p>
        <p className="grec-step">
          <b>Primer paso:</b> reescribe el título y la descripción de{" "}
          {rec.page ? pageName(rec.page) : "esa página"} para que digan qué ofreces y por qué entrar.
        </p>
        <div className="grec-acts">
          <Link className="btn btn-ghost btn-sm" href={gscHref}>
            Ver en Posición en Google
          </Link>
          <GoogleRecMark status="done" label="Marcar como hecho" />
        </div>
      </GoogleRecFrame>
    );
  }

  return (
    <GoogleRecFrame {...frame}>
      <div className="grec-tags">
        <span className="grec-tag grec-g">Datos de Google</span>
        <span className="grec-tag">Google + IA</span>
      </div>
      <h4 title={rec.query}>Vigila en la IA «{rec.query}»</h4>
      <p className="grec-ev">
        La gente ya te encuentra en Google con esa pregunta (puesto {fmtPosition(rec.position)}), pero todavía no sabes si
        los motores de IA te nombran cuando se la hacen.
      </p>
      <GoogleWatchActions projectId={projectId} query={rec.query} />
    </GoogleRecFrame>
  );
}

export async function GoogleRecs({
  projectId,
  ownerUserId,
  domain,
  supabase
}: {
  projectId: string;
  ownerUserId: string;
  domain: string;
  supabase: AuthenticatedContext["supabase"];
}) {
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
  if (recs.length === 0) return null;

  return (
    <section className="grec" aria-labelledby="grec-title">
      <GoogleRecsPresent />
      <GoogleRecsHead />
      <div className="grec-list">
        {recs.map((rec) => (
          <GoogleRecCard
            key={`${rec.kind}:${rec.query}`}
            rec={rec}
            projectId={projectId}
            canPersist={recStates.available}
          />
        ))}
      </div>
    </section>
  );
}

function GoogleRecsHead() {
  return (
    <div className="grec-head">
      <h3 id="grec-title">Con tus datos de Google</h3>
      <p>De tu Search Console, últimos 28 días. Se actualizan solas cuando cambian tus datos.</p>
    </div>
  );
}

/** Same row and card size as the real block, so nothing moves when it lands. */
function GoogleRecsSkeleton() {
  return (
    <section className="grec" aria-labelledby="grec-title" aria-busy="true">
      <GoogleRecsHead />
      <div className="grec-list">
        {[0, 1, 2].map((i) => (
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
 * The block's slot (log §298). Only with Search Console connected (a database
 * read, no Google call) does it reserve the space with a skeleton while the
 * Google rows stream in; otherwise nothing, so the page doesn't jump either
 * way.
 */
export async function GoogleRecsSlot(props: Parameters<typeof GoogleRecs>[0]) {
  if (!(await isSearchConsoleActive(props.projectId, props.ownerUserId))) return null;
  return (
    <Suspense fallback={<GoogleRecsSkeleton />}>
      <GoogleRecs {...props} />
    </Suspense>
  );
}
