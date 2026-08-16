import "server-only";

import { suggestCompetitors, suggestPrompts } from "@/lib/llm/gemini";
import type { BusinessProfile } from "@/lib/llm/contracts";
import { deriveBrandAliases, resolveBusinessContext } from "@/lib/projects/business-profile";
import { MAX_INITIAL_COMPETITORS, MAX_INITIAL_PROMPTS, type NormalizedProjectInput } from "@/lib/projects/project-form";
import { createPendingScanRun, getActionErrorCode } from "@/lib/scan/scan-runner";
import type { AuthenticatedContext } from "@/lib/auth";
import type { Plan } from "@/app/pricing/plans-data";

/**
 * PRELAUNCH-HARDENING-1 Fase Q1 — el alta de un dominio, extraída de su
 * server action y por fin testeable.
 *
 * Eran ~210 líneas dentro de `createProject` **sin un solo test** (deuda
 * anotada en ADR 0022 y riesgo #8 del plan), y no es cualquier función: es el
 * Core Target Flow de `CLAUDE.md`, lo que hace un cliente nuevo en su primer
 * minuto. Que no tuviera cobertura no era por descuido sino por construcción —
 * todo su control de flujo eran `redirect()`, que en Next **lanza**, así que
 * no había forma de observar un resultado sin un navegador.
 *
 * Por eso lo que cambia aquí no es la lógica sino **cómo se comunica el
 * desenlace**: este núcleo DEVUELVE un resultado discriminado y la action lo
 * traduce a `revalidatePath` + `redirect`. Es el mismo patrón `*Core` que ya
 * usan competidores, alias de marca, prompts y creación de escaneos.
 *
 * **La traducción es una tabla, no una interpretación**: cada variante de
 * `CreateProjectResult` corresponde exactamente a un `redirect` de los que
 * había antes, en el mismo orden de comprobación. Esa correspondencia es lo
 * que hace verificable que la extracción no cambió comportamiento, porque aquí
 * no hay tests previos que lo demuestren — se escriben con ella.
 */

/** Qué pasó DESPUÉS de que el proyecto ya exista en la base de datos. */
export type CreatedProjectOutcome =
  /**
   * Sin ningún prompt activo no hay nada que escanear. Se dice honestamente en
   * vez de fingir que arrancó un escaneo (`CLAUDE.md`, "no fake scans").
   */
  | { kind: "no_prompts" }
  /** El proyecto está bien; lo que falló fue crear el run pendiente. */
  | { kind: "scan_failed"; errorCode: string }
  /** Proyecto y escaneo bien, pero algún insert de prompts/competidores falló. */
  | { kind: "setup_partial" }
  | { kind: "ready" };

export type CreateProjectResult =
  | { status: "project_limit_reached" }
  /** La consulta de duplicados falló. Se trata como fallo de creación, no como "no hay duplicado". */
  | { status: "lookup_failed" }
  /**
   * El dominio existía archivado y se ha reactivado en vez de crearse de nuevo
   * — DOMAINS-ARCHIVE-RETIRE-1 (log §104). No es un error: es la única salida
   * que le queda al cliente desde que se retiró la pantalla de archivados.
   */
  | { status: "restored"; projectId: string }
  /** La reactivación falló; el proyecto sigue archivado y sin forma de volver. */
  | { status: "restore_failed" }
  | { status: "already_active" }
  | { status: "insert_failed" }
  | { status: "created"; projectId: string; outcome: CreatedProjectOutcome };

/**
 * Sugerencias del sistema para lo que el usuario no rellenó.
 *
 * Nunca inventa: si Gemini no devuelve nada, no se persiste nada
 * (`CLAUDE.md`, "no fake suggestions"). Las dos mitades se piden por separado
 * y cada una se traga su propio fallo, porque una puede funcionar mientras la
 * otra choca con un 429 — que es exactamente lo que pasó el 2026-08-09.
 */
async function fillMissingSetup(
  input: NormalizedProjectInput
): Promise<{
  initialCompetitors: NormalizedProjectInput["initialCompetitors"];
  initialPrompts: NormalizedProjectInput["initialPrompts"];
  businessProfile: BusinessProfile | null;
}> {
  let initialCompetitors = input.initialCompetitors;
  let initialPrompts = input.initialPrompts;
  // COMPETITOR-GROUNDING-2 (docs/adr/0022): se persiste junto a la fila del
  // proyecto sólo cuando esta rama lo calculó. El camino normal —asistente
  // relleno— no pasa por aquí, así que la mayoría de proyectos nuevos siguen
  // obteniendo su perfil de forma perezosa en el primer "Añadir prompts".
  let businessProfile: BusinessProfile | null = null;

  if (initialCompetitors.length && initialPrompts.length) {
    return { initialCompetitors, initialPrompts, businessProfile };
  }

  const context = await resolveBusinessContext({
    domain: input.domain,
    country: input.country,
    language: input.language,
    userDescription: input.businessDescription
  }).catch(() => ({ status: "unidentified" }) as const);

  if (context.status !== "identified") {
    return { initialCompetitors, initialPrompts, businessProfile };
  }

  businessProfile = context.profile;

  if (!initialCompetitors.length) {
    try {
      const suggested = await suggestCompetitors({
        brand: input.brand,
        domain: input.domain,
        country: input.country,
        language: input.language,
        profile: context.profile,
        limit: MAX_INITIAL_COMPETITORS
      });
      initialCompetitors = suggested.slice(0, MAX_INITIAL_COMPETITORS);
    } catch {
      initialCompetitors = [];
    }
  }

  if (!initialPrompts.length) {
    try {
      const suggested = await suggestPrompts({
        brand: input.brand,
        domain: input.domain,
        country: input.country,
        language: input.language,
        profile: context.profile,
        limit: MAX_INITIAL_PROMPTS
      });
      initialPrompts = suggested.slice(0, MAX_INITIAL_PROMPTS).map((prompt, index) => ({
        prompt_text: prompt.text,
        category: prompt.category,
        sort_order: index
      }));
    } catch {
      initialPrompts = [];
    }
  }

  return { initialCompetitors, initialPrompts, businessProfile };
}

export async function createProjectCore(input: {
  input: NormalizedProjectInput;
  plan: Plan;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
  /**
   * Columnas extra para la fila del proyecto. Existe para los defaults baratos
   * de preview (`previewTestingDefaults`), que dependen de `VERCEL_ENV` y por
   * tanto son decisión de la capa de la action, no de este núcleo.
   */
  extraProjectColumns?: Record<string, boolean>;
}): Promise<CreateProjectResult> {
  const { input: values, plan, supabase, user, extraProjectColumns = {} } = input;
  const { domain, country, brand, name, language } = values;

  const { count: activeProjectCount, error: activeProjectsError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .eq("is_archived", false);

  if (!activeProjectsError && (activeProjectCount ?? 0) >= plan.caps.projects) {
    return { status: "project_limit_reached" };
  }

  const { data: existingProject, error: existingProjectError } = await supabase
    .from("projects")
    .select("id, is_archived")
    .eq("owner_user_id", user.id)
    .eq("domain", domain)
    .eq("country", country)
    .eq("language", language)
    .maybeSingle();

  if (existingProjectError) {
    return { status: "lookup_failed" };
  }

  /**
   * DOMAINS-ARCHIVE-RETIRE-1 (log §104): un dominio archivado se **reactiva**
   * al volver a añadirlo, en vez de rechazar el alta.
   *
   * Antes esto devolvía `already_archived` y la pantalla decía «Restáuralo
   * para continuar», lo cual funcionaba porque existía una pantalla de
   * archivados. Al retirarla, esa rama se convertía en un callejón sin salida
   * perfecto: bajar de plan archiva dominios, no había dónde restaurarlos, y
   * volver a crearlos chocaba con la fila archivada. El cliente quedaba
   * encerrado con un mensaje que le pedía usar algo que ya no existe.
   *
   * Reactivar en vez de rechazar es lo que hace que «vuelve a añadirlo» —lo
   * que ahora promete el modal de bajada de plan— sea verdad. Y respeta el
   * tope del plan: la comprobación de `project_limit_reached` de arriba ya ha
   * corrido, así que sólo se reactiva si hay hueco.
   */
  if (existingProject?.is_archived) {
    const { error: restoreError } = await supabase
      .from("projects")
      .update({ is_archived: false })
      .eq("id", existingProject.id)
      .eq("owner_user_id", user.id);

    if (restoreError) return { status: "restore_failed" };
    return { status: "restored", projectId: existingProject.id };
  }

  if (existingProject) {
    return { status: "already_active" };
  }

  const { initialCompetitors, initialPrompts, businessProfile } = await fillMissingSetup(values);

  // GEO-SCORE-BRAND-IDENTITY-1: se deriva al crear para que el PRIMER escaneo
  // ya mida bien la marca. Una marca cuyo producto lleva el nombre reconocible
  // (Mozilla/Firefox) se puntúa si no como ausente de respuestas que lo
  // recomiendan. Nunca bloquea el alta: `deriveBrandAliases` se traga sus
  // propios fallos y devuelve [], que además es el valor correcto para la
  // mayoría de marcas.
  const brandAliases = await deriveBrandAliases({ brand, domain }).catch(() => [] as string[]);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_user_id: user.id,
      name,
      domain,
      brand,
      country,
      language,
      business_profile: businessProfile,
      brand_aliases: brandAliases,
      ...extraProjectColumns
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "insert_failed" };
  }

  const projectId = (data as { id: string }).id;
  let setupError = false;

  if (initialPrompts.length) {
    const { error: promptInsertError } = await supabase.from("project_prompts").insert(
      initialPrompts.map((prompt) => ({
        project_id: projectId,
        prompt_text: prompt.prompt_text,
        category: prompt.category,
        sort_order: prompt.sort_order
      }))
    );
    if (promptInsertError) setupError = true;
  }

  if (initialCompetitors.length) {
    const { error: competitorInsertError } = await supabase.from("project_competitors").insert(
      initialCompetitors.map((competitor) => ({
        project_id: projectId,
        name: competitor.name,
        domain: competitor.domain
      }))
    );
    if (competitorInsertError) setupError = true;
  }

  // Se comprueba ANTES de crear el run, y ese orden importa: sin prompts no
  // hay escaneo posible, así que pedirlo sería crear una fila condenada.
  if (!initialPrompts.length) {
    return { status: "created", projectId, outcome: { kind: "no_prompts" } };
  }

  // Se crea el run pendiente (rápido, sin llamadas a Gemini) y el usuario
  // aterriza en Visión general; la ejecución la conduce el `AutoExecuteScan` de
  // esa página. DOMAINS-REDESIGN-1 movió ese destino desde Escaneos: el driver
  // está montado en exactamente una página, así que si el destino y el driver
  // dejan de coincidir, el primer escaneo de cada cliente nuevo se queda en
  // `pending` hasta que lo rescate el cron diario — en silencio, porque nada
  // de esto falla.
  try {
    await createPendingScanRun({ projectId, supabase, user });
  } catch (scanError) {
    return {
      status: "created",
      projectId,
      outcome: { kind: "scan_failed", errorCode: getActionErrorCode(scanError) }
    };
  }

  return {
    status: "created",
    projectId,
    outcome: setupError ? { kind: "setup_partial" } : { kind: "ready" }
  };
}
