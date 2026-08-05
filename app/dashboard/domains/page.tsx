import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { Gauge } from "@/components/ui/gauge";
import { faviconUrl } from "@/lib/domains/favicon";
import { getWorkspaceCounters } from "@/lib/project-workspace";
import { computeAccountScanState } from "@/lib/domains/account-scan-state";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { requireUser } from "@/lib/auth";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";

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
 */

const RAIL_TO_GRID_THRESHOLD = 4;

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
  const url = faviconUrl(domain);
  const style = { width: size, height: size, borderRadius: radius } as const;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- servicio externo de favicons, no un asset estático
      <img src={url} alt="" className="dm2-fav" style={style} width={size} height={size} loading="lazy" />
    );
  }

  return (
    <span
      className="dm2-fav dm2-fav-letter"
      style={{ ...style, background: fallbackColor(domain || name), fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function AddDomainCard() {
  return (
    <Link href="/dashboard/projects/new" className="dm2-add">
      <span className="dm2-add-pl">
        <Icon name="plus" size={16} />
      </span>
      <b>Añadir dominio</b>
      <span className="dm2-add-sub">Se escanea desde el primer día</span>
    </Link>
  );
}

export default async function DomainsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const feedback = await searchParams;
  const { supabase } = await requireUser();

  const {
    projects,
    promptCountByProject,
    completedRunCountByProject,
    latestScanStatusByProject,
    latestScanDateByProject,
    latestAuditDateByProject,
    auditingByProject,
    latestScoreByProject,
    scoreDeltaByProject,
    dataMaturityByProject
  } = await getWorkspaceCounters();

  const feedbackErrorMessage = feedback.error
    ? feedbackErrorMessages[feedback.error] ?? feedbackErrorMessages.unexpected_error
    : null;
  const feedbackSuccessMessage = feedback.success ? feedbackSuccessMessages[feedback.success] ?? null : null;

  // El dominio "activo" es el más reciente: `projects` viene ordenado por
  // created_at desc y esta pantalla no tiene un proyecto en la URL. Es el mismo
  // criterio de reserva que ya usa la barra lateral fuera de las rutas de
  // proyecto, así que las dos coinciden siempre.
  const [active, ...rest] = projects;

  if (!active) {
    return (
      <div className="page">
        <div className="ov-sticky-header">
          <div className="ov-sticky-left">
            <div>
              <p className="kicker" style={{ marginBottom: 2 }}>Espacio de trabajo</p>
              <span className="dm2-hdr-name">Dominios</span>
            </div>
          </div>
        </div>
        <div className="dm2-page">
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
  const activeDelta = scoreDeltaByProject[active.id] ?? null;
  const activeScanned = formatFreshness(latestScanDateByProject[active.id]);
  const activeAudited = formatFreshness(latestAuditDateByProject[active.id]);
  const activeMaturity = dataMaturityByProject[active.id];
  const activePromptCount = promptCountByProject[active.id] ?? 0;
  const activeRunCount = completedRunCountByProject[active.id] ?? 0;
  const activeAuditing = Boolean(auditingByProject[active.id]);

  const railIsGrid = rest.length >= RAIL_TO_GRID_THRESHOLD;

  return (
    <div className="page">
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Espacio de trabajo</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="dm2-hdr-name">Dominios</span>
              <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                {projects.length} {projects.length === 1 ? "activo" : "activos"}
              </span>
            </div>
          </div>
        </div>
        <div className="ov-sticky-right">
          {/* La línea informativa cede el sitio a la pastilla en móvil: a 375px
              las dos juntas se pisan, que es literalmente el fallo que Auditoría
              web sufrió y arregló con dos longitudes (log §17). */}
          <span className={`dm2-auto${accountState.kind === "idle" ? "" : " dm2-auto-yield"}`}>
            <span className="dm2-auto-full">Escaneo y auditoría automáticos, cada día</span>
            <span className="dm2-auto-compact">Automático cada día</span>
          </span>
          {accountState.kind !== "idle" ? (
            <span className="badge badge-accent" style={{ fontSize: 11 }} aria-live="polite">
              <span className="dot run" style={{ marginRight: 6 }} />
              {accountState.label}
            </span>
          ) : null}
        </div>
      </div>

      {feedbackErrorMessage && <p className="feedback error" style={{ marginBottom: 16 }}>{feedbackErrorMessage}</p>}
      {feedbackSuccessMessage && <p className="feedback success" style={{ marginBottom: 16 }}>{feedbackSuccessMessage}</p>}

      <div className="dm2-page">
        {/* ---- Portada del dominio activo ---- */}
        <Link href={`/dashboard/projects/${active.id}`} className="dm2-hero card">
          <div className="dm2-hero-top">
            <DomainFavicon name={active.name} domain={active.domain} size={60} radius={16} />
            <div className="dm2-id">
              <div className="dm2-name">{active.name}</div>
              <div className="dm2-dom">
                {active.domain} · {active.country} · {active.language}
              </div>
              <div className="dm2-fresh">
                {activeRun ? (
                  <span>Tu escaneo está en curso</span>
                ) : (
                  <>
                    {activeScanned ? (
                      <span>
                        Escaneado <b>{activeScanned.label}</b>
                      </span>
                    ) : (
                      <span>Sin escaneos todavía</span>
                    )}
                    {activeAudited ? (
                      <span>
                        Auditado <b>{activeAudited.label}</b>
                      </span>
                    ) : null}
                    {activeMaturity?.kind === "accumulating" ? (
                      <span>
                        {activeMaturity.completed} de {activeMaturity.target} escaneos
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="dm2-gauge">
            {activeScore === null ? (
              <>
                <div className="dm2-gauge-empty">—</div>
                <div className="dm2-gauge-lbl">Puntuación GEO</div>
              </>
            ) : (
              <>
                <Gauge value={activeScore} size={104} stroke={9} variant="semi" label="" />
                <div className="dm2-gauge-lbl">Puntuación GEO</div>
                {/* DELTA-GUARD-1: `scoreDeltaByProject` ya viene filtrado por
                    `resolveDelta`; null aquí significa "no afirmable", y una
                    comparación que no podemos afirmar no se pinta. */}
                {activeDelta !== null ? <Delta value={activeDelta} suffix=" pt" /> : null}
              </>
            )}
          </div>

          <div className="dm2-cta">
            <span className="btn btn-primary">Visión general</span>
            <span className="dm2-runs">
              {activeRunCount} {activeRunCount === 1 ? "escaneo" : "escaneos"} · {activePromptCount}{" "}
              {activePromptCount === 1 ? "prompt" : "prompts"}
            </span>
          </div>
        </Link>

        {/* ---- Los demás dominios ---- */}
        {rest.length > 0 ? (
          <>
            <div className="dm2-rail-lbl">Cambiar de dominio</div>
            {/* A partir de RAIL_TO_GRID_THRESHOLD el raíl deja de ser raíl: un
                scroll horizontal esconde lo que no cabe, y el dominio que no se
                ve deja de existir para quien tiene que elegirlo. */}
            <div className={railIsGrid ? "dm2-grid" : "dm2-rail"}>
              {rest.map((p) => {
                const score = latestScoreByProject[p.id] ?? null;
                const delta = scoreDeltaByProject[p.id] ?? null;
                const scanning = isActiveScanning(p.id);
                const auditing = Boolean(auditingByProject[p.id]);
                const scanned = formatFreshness(latestScanDateByProject[p.id]);

                return (
                  <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="dm2-card card">
                    <div className="dm2-card-top">
                      <DomainFavicon name={p.name} domain={p.domain} size={28} radius={8} />
                      <div style={{ minWidth: 0 }}>
                        <div className="dm2-card-name">{p.name}</div>
                        <div className="dm2-card-dom">{p.domain}</div>
                      </div>
                    </div>
                    <div className="dm2-card-foot">
                      <span className="dm2-card-score tnum">{score === null ? "—" : score}</span>
                      {/* Un delta de 0 se pintaba como un «0» pelado junto a la
                          puntuación y se leía como un segundo número (visto en
                          la captura del piloto: «43  0»). Cero no es una
                          noticia: no se pinta. */}
                      {delta !== null && delta !== 0 ? <Delta value={delta} /> : null}
                      {scanning ? (
                        <span className="badge badge-accent dm2-card-chip">
                          <span className="dot run" style={{ marginRight: 5 }} />
                          Escaneando…
                        </span>
                      ) : auditing ? (
                        <span className="badge badge-accent dm2-card-chip">
                          <span className="dot run" style={{ marginRight: 5 }} />
                          Auditando…
                        </span>
                      ) : scanned ? (
                        // El verde afirma "al día". En la captura del piloto un
                        // dominio escaneado el 25 de julio llevaba pastilla
                        // verde: el color decía que estaba fresco y la fecha
                        // decía que no. Verde sólo hoy/ayer; el resto, neutro.
                        <span className={`badge dm2-card-chip ${scanned.recent ? "badge-pos" : "badge-neutral"}`}>
                          {scanned.label}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
              {/* En rejilla, «Añadir dominio» es la última celda y no una banda
                  aparte: fuera de ella se convertía en un rectángulo punteado a
                  todo lo ancho bajo una última fila coja (visto en la captura de
                  escritorio del piloto). Dentro, cierra la serie y tapa el
                  hueco. En móvil la rejilla es de una columna, así que sigue
                  siendo la caja a ancho completo del final. */}
              {railIsGrid ? <AddDomainCard /> : null}
            </div>
          </>
        ) : null}

        {/* En raíl (1–3 dominios) va fuera: dentro quedaría fuera del viewport
            en móvil, que es justo donde más falta hace verla. */}
        {railIsGrid ? null : <AddDomainCard />}
      </div>
    </div>
  );
}
