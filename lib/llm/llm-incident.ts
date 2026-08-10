import "server-only";

import { isOpsAlertConfigured, sendLlmIncidentAlertEmail } from "@/lib/email/transactional";
import { categorizeExtractionError, type ExtractionErrorCategory } from "@/lib/llm/extraction-errors";
import { LLM_INCIDENT_DEDUPE_MINUTES } from "@/lib/scan/constants";

/**
 * LLM-RESILIENCE-1 (Task Intake approved 2026-08-09) — the operator alert for
 * LLM failures that happen OUTSIDE a scan run.
 *
 * `lib/scan/scan-health-alert.ts` already covers the scan: it reads a finished
 * run's rows and mails the operator about anything actionable. It cannot cover
 * anything else, because it is built on `scan_prompt_results` + `job_logs`, and
 * both are keyed to a job and a run. The onboarding wizard has neither. So the
 * failure the founder actually hit on 2026-08-09 — Gemini 429 on the
 * competitor suggestion — produced no row, no log line and no email, and the
 * only trace was ~70 unexplained errors in Google's own console against 20 in
 * ours.
 *
 * This module is the missing half: any LLM call site can report a categorized
 * failure and the operator hears about it.
 *
 * ## The dedupe store, and what it honestly is
 *
 * The scan-health alert dedupes through `job_logs`, which survives across
 * instances and deploys. That table is unavailable here: `job_logs.job_id` is
 * `not null` with a composite foreign key to `jobs (id, run_id, project_id)`
 * (`supabase/migrations/0001_v0_schema.sql`), so a path with no job row simply
 * cannot write to it. The alternatives were a new table (a schema migration —
 * a forbidden area without its own founder approval) or dedupe in memory.
 *
 * The founder chose in-memory (option (i), Task Intake 2026-08-09). Stated
 * plainly rather than glossed: this Map lives in one serverless instance, so a
 * wide outage can send one email per warm instance, and a cold start forgets
 * everything. That is tolerable *here* specifically because the surfaces this
 * covers are human-triggered — a person clicking "sugerir" bounds the volume
 * in a way a cron sweep would not. If this is ever wired to a scheduled path,
 * that reasoning expires and the dedupe needs a real store.
 */

/** Where the failing call came from. Shown to the operator, and half the dedupe key. */
export type LlmSurface =
  /** The onboarding wizard's competitor/prompt suggestions (`suggestProjectSetup`). */
  | "onboarding_suggestions"
  /** Generating extra prompts for an existing project. */
  | "prompt_generation"
  /** The web audit's grounded own-domain content call. */
  | "web_audit"
  /** The "mejorar redacción con IA" rewrite on a recommendation. */
  | "recommendations";

const SURFACE_LABEL: Record<LlmSurface, string> = {
  onboarding_suggestions: "Onboarding — sugerencias de competidores y prompts",
  prompt_generation: "Generación de prompts adicionales",
  web_audit: "Auditoría web — contenido propio",
  recommendations: "Recomendaciones — reescritura con IA"
};

const CATEGORY_COPY: Record<"quota" | "config", { headline: string; detail: string }> = {
  quota: {
    headline: "Un motor se ha quedado sin cuota fuera del escaneo",
    detail:
      "El proveedor devuelve 429 y los reintentos con backoff ya se han agotado. Esto NO ocurre dentro de un escaneo, así que no deja rastro en scan_prompt_results: sin este aviso, el usuario ve la pantalla vacía y en la base de datos no hay nada que mirar. Revisa el saldo o los límites de esa cuenta."
  },
  config: {
    headline: "Un motor está mal configurado fuera del escaneo",
    detail:
      "El proveedor rechaza la petición por clave o modelo inválidos. No se reintenta a propósito, porque reintentarlo daría el mismo resultado. Revisa las variables de entorno de ese motor."
  }
};

/**
 * Which categories are worth an email.
 *
 * Same threshold the scan-health alert settled on, and for the same reason:
 * `quota` and `config` never heal by themselves and only the operator can
 * clear them, while `empty`, `invalid_json`, `schema` and `timeout` are model
 * noise that the next attempt usually fixes. An alert that fires on noise is
 * an alert that gets filtered into a folder nobody opens.
 */
export function shouldAlertOnLlmIncident(category: ExtractionErrorCategory): category is "quota" | "config" {
  return category === "quota" || category === "config";
}

/**
 * Deliberately excludes the project and the domain. One exhausted API account
 * is ONE incident even when it breaks the wizard for five different domains in
 * a row, and keying on the project would mail the operator once per attempt.
 */
export function llmIncidentDedupeKey(input: { surface: LlmSurface; provider: string; category: string }): string {
  return `${input.surface}|${input.provider}|${input.category}`;
}

/** True when enough time has passed since the last alert for this key. `null` = never sent. */
export function isDedupeWindowOpen(lastSentAtMs: number | null, nowMs: number, windowMs: number): boolean {
  if (lastSentAtMs === null) return true;
  return nowMs - lastSentAtMs >= windowMs;
}

/** Module-level, per-instance. See the caveat in this file's header. */
const lastSentByKey = new Map<string, number>();

/** Test seam — the Map is module state and would otherwise leak between cases. */
export function __resetLlmIncidentDedupeForTests(): void {
  lastSentByKey.clear();
}

/**
 * Reports a failed LLM call to the operator, if it is worth reporting.
 *
 * Fail-soft by construction, same rule as `checkAndSendScanHealthAlert`: this
 * runs inside a `catch` whose whole job is degrading gracefully, so it must
 * never be the thing that turns a handled failure into a crash. Every path
 * here returns; nothing propagates.
 */
export async function reportLlmIncident(input: {
  surface: LlmSurface;
  /** "gemini" | "openai" | "claude" — free-form so a new provider needs no change here. */
  provider: string;
  /** The failure, as thrown. Categorized here; never interpolated raw into the email. */
  error: unknown;
  /** Optional context for the operator — a domain, a project id. Never secrets. */
  domain?: string;
  projectId?: string;
}): Promise<void> {
  try {
    const category = categorizeExtractionError(input.error);
    if (!shouldAlertOnLlmIncident(category)) return;

    const key = llmIncidentDedupeKey({ surface: input.surface, provider: input.provider, category });
    const now = Date.now();
    const windowMs = LLM_INCIDENT_DEDUPE_MINUTES * 60 * 1000;
    if (!isDedupeWindowOpen(lastSentByKey.get(key) ?? null, now, windowMs)) return;

    if (!isOpsAlertConfigured()) {
      // No `job_logs` breadcrumb is possible here — that is the whole reason
      // this module exists — so the runtime log is genuinely the last resort.
      console.error("[geo:llm:incident] actionable LLM failure but the alert channel is not deliverable (needs OPS_ALERT_EMAIL and RESEND_API_KEY)", {
        surface: input.surface,
        provider: input.provider,
        category
      });
      return;
    }

    const copy = CATEGORY_COPY[category];
    await sendLlmIncidentAlertEmail({
      surfaceLabel: SURFACE_LABEL[input.surface],
      provider: input.provider,
      category,
      headline: copy.headline,
      detail: copy.detail,
      domain: input.domain ?? "—",
      projectId: input.projectId ?? "—",
      dedupeMinutes: LLM_INCIDENT_DEDUPE_MINUTES,
      detectedAt: new Date(now)
    });

    // Recorded only AFTER a successful send, so a failed send does not silence
    // the next attempt — a duplicate email beats a swallowed incident.
    lastSentByKey.set(key, now);
  } catch (alertError) {
    console.error("[geo:llm:incident] incident report failed", {
      surface: input.surface,
      message: alertError instanceof Error ? alertError.message : String(alertError)
    });
  }
}
