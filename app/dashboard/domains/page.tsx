import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { Gauge } from "@/components/ui/gauge";
import { FaviconImg } from "@/components/ui/favicon-img";
import { getWorkspaceCounters } from "@/lib/project-workspace";
import { computeAccountScanState } from "@/lib/domains/account-scan-state";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { requireUser } from "@/lib/auth";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";
import { ACTIVE_PROJECT_COOKIE, resolveSelectedProject } from "@/lib/active-project-cookie";
import { consoleMetadata } from "@/lib/seo/console-metadata";
import { DeleteDomainButton } from "@/app/dashboard/projects/[projectId]/debug/delete-domain-button";

/**
 * DOMAINS-REDESIGN-1 — «Dominios».
 *
 * Sustituye a Escaneos como puerta de entrada de la consola, con UN solo
 * trabajo: elegir qué dominio se está viendo. Diseño aprobado por el fundador
 * el 2026-08-05 (opción B, «Escenario»); la referencia de implementación está
 * en `docs/design-reference/domains-redesign-1/pantalla-dominios.html` y su
 * README lista los invariantes que esta pantalla NO puede romper.
 *
 * Los dos que más fácil se rompen sin querer:
 *
 * 1. **Ningún control de escaneo o auditoría.** Que el producto escanee y
 *    audite cada día se cuenta con la línea de automatización y con la frescura
 *    («Escaneado hoy, 06:14»), nunca con un botón. Mismo criterio que
 *    AUDIT-NO-BUTTON-1: si corre solo, un control que lo pide sobra y además
 *    insinúa que sin pulsarlo no pasaría nada.
 * 2. **Sólo la puntuación GEO y su delta.** Ninguna segunda métrica. El día que
 *    esta pantalla y Visión general calculen lo mismo por caminos distintos, se
 *    contradicen — y la que miente es siempre la que nadie está mirando.
 *
 * Esta pantalla observa; no conduce. `AutoExecuteScan` vive en Visión general.
 *
 * **Excepción aprobada (DOMAINS-CLIENT-DELETE-1, 2026-08-09):** el borrado
 * duro del dominio SÍ tiene control aquí, sólo en la portada (el dominio
 * activo). §32 lo había retirado a `/debug` a propósito ("cero controles en
 * la pantalla de cliente") dejando escrito que se notaría si algún día
 * molestaba — el fundador pidió recuperarlo el 2026-08-09. Sigue sin ser un
 * control de escaneo/auditoría: los dos invariantes de arriba no cambian.
 */

/** Colores de la ficha de dominio cuando el favicon real no carga. Mismo criterio determinista que Páginas citadas. */
const FALLBACK_COLORS = ["#0B9BD8", "#E8404A", "#FF8A1E", "#3B4759", "#8B5CF6", "#0EA5A0"];

function fallbackColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/**
 * «hoy, 06:14» / «ayer, 22:03» / «29 jul, 06:10».
 *
 * Con hora, no sólo el día: la frescura es la única prueba en pantalla de que
 * la automatización existe, y «5 ago» no distingue un escaneo de esta mañana de
 * uno de hace catorce horas.
 */
type Freshness = { label: string; recent: boolean };

function formatFreshness(value: string | null | undefined): Freshness | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const opts = { timeZone: "Europe/Madrid" } as const;
  const time = date.toLocaleTimeString("es-ES", { ...opts, hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString("es-ES", opts);
  const today = new Date().toLocaleDateString("es-ES", opts);
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("es-ES", opts);

  if (day === today) return { label: `hoy, ${time}`, recent: true };
  if (day === yesterday) return { label: `ayer, ${time}`, recent: true };
  return { label: date.toLocaleDateString("es-ES", { ...opts, day: "numeric", month: "short" }), recent: false };
}

function DomainFavicon({
  name,
  domain,
  size,
  radius
}: {
  name: string;
  domain: string;
  size: number;
  radius: number;
}) {
  // El tamaño se pasa al helper: estas fichas se pintan a 38 y 56 px, que en
  // una pantalla Retina son 76 y 112 px reales — muy por encima del sz=64 fijo
  // que se pedía antes (FAVICON-QUALITY-1).
  const style = { width: size, height: size, borderRadius: radius } as const;

  return (
    <FaviconImg
      domain={domain}
      cssSize={size}
      className="dm2-fav"
      style={style}
      fallback={
        <span
          className="dm2-fav dm2-fav-letter"
          style={{ ...style, background: fallbackColor(domain || name), fontSize: Math.round(size * 0.42) }}
          aria-hidden="true"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      }
    />
  );
}

// ROOT-METADATA-1: pestaña propia. Ver `lib/seo/console-metadata.ts`.
export const metadata: Metadata = consoleMetadata("Dominios");

export default async function DomainsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string; active?: string }>;
}) {
  const feedback = await searchParams;
  const { supabase } = await requireUser();

  const {
    projects,
    latestScanStatusByProject,
    latestScanDateByProject,
    auditingByProject,
    latestScoreByProject,
    scoreDeltaByProject
  } = await getWorkspaceCounters();

  const feedbackErrorMessage = feedback.error
    ? feedbackErrorMessages[feedback.error] ?? feedbackErrorMessages.unexpected_error
    : null;
  const feedbackSuccessMessage = feedback.success ? feedbackSuccessMessages[feedback.success] ?? null : null;

  // El dominio de portada es el que marca `?active=<id>` (fundador,
  // 2026-08-05: "pinchar en un dominio de abajo debe seleccionarlo... y
  // retornar a la misma página con ese dominio en la card principal") — las
  // tarjetas de la rejilla ya no navegan al proyecto, enlazan aquí mismo con
  // ese parámetro. Sin él se cae al dominio que el cookie `geo_active_project`
  // recuerda (DOMAINS-ACTIVE-COOKIE-1, 2026-08-07): la misma señal que ya usa
  // `/debug` y que `middleware.ts` escribe en cada visita a
  // `/dashboard/projects/[projectId]/...`, así que entrar en un proyecto desde
  // aquí y volver — por la barra lateral, sin `?active=` — sigue mostrando ese
  // mismo dominio en vez de reiniciar a "el más reciente". Un id que no case
  // con ningún dominio de la cuenta (viejo, borrado, ajeno — `projects` ya
  // viene acotado por RLS) simplemente no aparece y cae al siguiente criterio;
  // sin selección ni cookie útiles, el último recurso sigue siendo el más
  // reciente.
  const cookieStore = await cookies();
  const rememberedProjectId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
  const active = resolveSelectedProject(projects, feedback.active ?? null, rememberedProjectId);
  const rest = active ? projects.filter((p) => p.id !== active.id) : [];

  if (!active) {
    return (
      <div className="page">
        <div className="dm2-page">
          <div className="dm2-head">
            <div>
              <p className="dm2-kicker">Espacio de trabajo</p>
              <div className="dm2-title-row">
                <h1 className="dm2-title">Dominios</h1>
              </div>
            </div>
          </div>
          <div className="card dm2-empty">
            <div className="dm2-empty-ico"><Icon name="globe" size={22} /></div>
            <div className="dm2-empty-t">Todavía no tienes ningún dominio</div>
            <div className="dm2-empty-d">
              Añade el primero y empezamos a medir cómo te nombran las IA. Se escanea desde el
              primer día, sin que tengas que lanzarlo tú.
            </div>
            <Link href="/dashboard/projects/new" className="btn btn-primary">
              <Icon name="plus" size={14} />
              Añadir dominio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Sólo el dominio de portada necesita los contadores de la etapa de análisis:
  // es el único que muestra progreso de dos etapas. El resto se conforma con
  // saber que hay algo vivo, que es lo que su chip dice.
  const isActiveScanning = (id: string) => {
    const status = latestScanStatusByProject[id];
    return status === "pending" || status === "running" || status === "retrying";
  };

  const { data: activeRunRow } = isActiveScanning(active.id)
    ? await supabase
        .from("scan_runs")
        .select("id, status, total_prompts, successful_prompts, failed_prompts, started_at")
        .eq("project_id", active.id)
        .in("status", ["pending", "running", "retrying"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const activeRun = activeRunRow ? await withAnalysisProgress(supabase, active.id, activeRunRow) : null;

  // Un run vivo basta para la cabecera; sus contadores sólo los necesita la
  // portada, así que los demás dominios entran con un marcador ligero.
  const accountState = computeAccountScanState(
    projects.map((p) => ({
      domain: p.domain,
      activeRun:
        p.id === active.id
          ? activeRun
          : isActiveScanning(p.id)
          ? { status: "running", total_prompts: 0, successful_prompts: 0, failed_prompts: 0, started_at: null }
          : null,
      auditing: Boolean(auditingByProject[p.id])
    }))
  );

  const activeScore = latestScoreByProject[active.id] ?? null;
  const activeScanned = formatFreshness(latestScanDateByProject[active.id]);
  const activeAuditing = Boolean(auditingByProject[active.id]);


  return (
    <div className="page">
      <div className="dm2-page">
        {/* ---- Cabecera ---- */}
        <div className="dm2-head">
          <div>
            <p className="dm2-kicker">Espacio de trabajo</p>
            <div className="dm2-title-row">
              <h1 className="dm2-title">Dominios</h1>
              <span className="dm2-count">
                {projects.length} {projects.length === 1 ? "activo" : "activos"}
              </span>
            </div>
          </div>
          {accountState.kind !== "idle" ? (
            <span className="dm2-state" aria-live="polite">
              <span className="dot" />
              {accountState.label}
            </span>
          ) : null}
        </div>

        {feedbackErrorMessage && <p className="feedback error" style={{ marginBottom: 16 }}>{feedbackErrorMessage}</p>}
        {feedbackSuccessMessage && (
          <p className="feedback success" style={{ marginBottom: 16 }}>{feedbackSuccessMessage}</p>
        )}

        {/* ---- Portada del dominio seleccionado ---- */}
        <Link href={`/dashboard/projects/${active.id}`} className="dm2-hero">
          {/* Único control de borrado de la pantalla (DOMAINS-CLIENT-DELETE-1):
              reutiliza el mismo componente y server action que `/debug`.
              `isCurrentProject={false}`: aquí no estamos dentro de la ruta del
              proyecto, así que tras borrar basta con refrescar esta misma
              página — `resolveSelectedProject` ya cae al siguiente dominio (o
              al estado vacío) cuando el id activo deja de existir. */}
          <DeleteDomainButton projectId={active.id} domainName={active.domain || active.name} isCurrentProject={false} />
          <div className="dm2-hero-top">
            {/* `key` por dominio, no por estética: sin él React reutiliza el
                mismo <img> al cambiar de dominio y sólo le cambia el src, así
                que el navegador sigue pintando el icono del dominio anterior
                hasta que descarga el nuevo — la portada de una farmacia con el
                logo de Mozilla. Enseñar un hueco un instante es peor de ver y
                mejor de fiar que enseñar la marca equivocada. */}
            <DomainFavicon key={active.domain} name={active.name} domain={active.domain} size={56} radius={16} />
            <div className="dm2-id">
              <div className="dm2-name">{active.name}</div>
              <div className="dm2-dom">
                {active.domain}
                <span className="sep">·</span>
                {active.country}
                <span className="sep">·</span>
                {active.language}
              </div>
              <div className="dm2-last">
                <Icon name="clock" size={14} />
                {activeRun ? (
                  <span>Escaneo en curso</span>
                ) : activeScanned ? (
                  <span>Último escaneo: {activeScanned.label}</span>
                ) : (
                  <span>Sin escaneos todavía</span>
                )}
              </div>
            </div>
            {/* «Seleccionado» se quitó (fundador, 2026-08-05: "quita el chip de
                seleccionado para que quede la tarjeta menos alta") — era
                redundante con el borde azul, que ya es la única tarjeta de la
                pantalla que lo lleva. Sin contenido que mostrar, el
                contenedor entero desaparece en vez de dejar un hueco vacío
                con su propio margen. */}
            {activeRun || activeAuditing ? (
              <div className="dm2-flags">
                {activeRun ? (
                  <span className="dm2-flag dm2-flag-run">
                    <span className="dot" />
                    En progreso
                  </span>
                ) : (
                  <span className="dm2-flag dm2-flag-run">
                    <span className="dot" />
                    Auditando
                  </span>
                )}
              </div>
            ) : null}
          </div>

          <div className="dm2-score">
            {activeScore === null ? (
              <div className="dm2-score-empty">—</div>
            ) : (
              // size sube de 124 a 140, stroke se queda en 12: agranda el
              // radio sin engordar el trazo, que es lo que separa el numeral
              // del arco (ver la nota en app/globals.css junto a
              // .dm2-hero .gauge-num).
              <Gauge value={activeScore} size={140} stroke={12} variant="semi" label="Puntuación GEO" />
            )}
            <p className="dm2-score-copy">
              {activeScore === null
                ? "Todavía no hay puntuación: en cuanto termine el primer escaneo, aquí verás cómo te nombran las IA."
                : "El análisis GEO evalúa tu dominio en visibilidad generativa y presencia de marca."}
            </p>
          </div>

          <span className="dm2-open">
            Ver visión general
            <Icon name="arrRight" size={18} />
          </span>
        </Link>

        {/* ---- Los demás dominios ---- */}
        <div className="dm2-grid">
          {rest.map((p) => {
            const score = latestScoreByProject[p.id] ?? null;
            const delta = scoreDeltaByProject[p.id] ?? null;
            const scanning = isActiveScanning(p.id);
            const auditing = Boolean(auditingByProject[p.id]);
            const scanned = formatFreshness(latestScanDateByProject[p.id]);

            return (
              // Selecciona, no navega: lleva de vuelta a esta misma pantalla
              // con `p` en la portada. "Ver visión general" en la portada
              // sigue siendo el único sitio que navega de verdad al proyecto.
              <Link key={p.id} href={`/dashboard/domains?active=${p.id}`} className="dm2-card">
                <div className="dm2-card-top">
                  <DomainFavicon name={p.name} domain={p.domain} size={38} radius={11} />
                  <div style={{ minWidth: 0 }}>
                    <div className="dm2-card-name">{p.name}</div>
                    <div className="dm2-card-dom">{p.domain}</div>
                  </div>
                </div>
                <div className="dm2-card-foot">
                  <span className="dm2-card-score tnum">{score === null ? "—" : score}</span>
                  {/* Un delta de 0 no es una noticia: se lee como un segundo
                      número pegado a la puntuación («43  0»). */}
                  {delta !== null && delta !== 0 ? <Delta value={delta} /> : null}
                  {scanning || auditing ? (
                    <span className="dm2-card-chip dm2-chip-run">
                      <span className="dot" />
                      {scanning ? "Escaneando" : "Auditando"}
                    </span>
                  ) : scanned ? (
                    // El verde afirma "al día": un dominio escaneado hace once
                    // días con pastilla verde decía lo contrario que su fecha.
                    <span className={`dm2-card-chip ${scanned.recent ? "dm2-chip-fresh" : "dm2-chip-stale"}`}>
                      {scanned.label}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}

          <Link href="/dashboard/projects/new" className="dm2-add">
            <span className="dm2-add-pl">
              <Icon name="plus" size={18} />
            </span>
            <span className="dm2-add-t">Añadir dominio</span>
            <span className="dm2-add-sub">Se escanea desde el primer día</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
