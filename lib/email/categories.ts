/**
 * EMAIL-UNSUB-1 (log §232). Every email the product sends to a customer
 * belongs to exactly one category, and the category — not each template —
 * decides whether the email can be unsubscribed from, which preference
 * column gates it, and what its footer and headers say.
 *
 * `service` covers what the account needs to work (sign-up, billing, plan
 * changes, deletion): no opt-out, by design. Everything else is optional and
 * maps to one owner-editable column on `profiles`.
 *
 * Pure module on purpose (no `server-only`): the settings screen reads the
 * same labels the unsubscribe page shows, so a rename happens in one place.
 */

export const OPTIONAL_EMAIL_CATEGORIES = ["score_drop", "weekly_digest", "first_scan", "lifecycle"] as const;

export type OptionalEmailCategory = (typeof OPTIONAL_EMAIL_CATEGORIES)[number];
export type EmailCategory = "service" | OptionalEmailCategory;

export type EmailPreferenceColumn =
  | "notify_score_drop_alert"
  | "notify_weekly_digest"
  | "notify_first_scan"
  | "notify_lifecycle";

export const PREFERENCE_COLUMN: Record<OptionalEmailCategory, EmailPreferenceColumn> = {
  score_drop: "notify_score_drop_alert",
  weekly_digest: "notify_weekly_digest",
  first_scan: "notify_first_scan",
  lifecycle: "notify_lifecycle"
};

/**
 * How each category is named to the customer: in Ajustes (`title`/`desc`),
 * on the unsubscribe page and in the email footer (`noun`, used as "dejar de
 * recibir {noun}").
 */
export const CATEGORY_COPY: Record<OptionalEmailCategory, { title: string; desc: string; noun: string }> = {
  score_drop: {
    title: "Caída de puntuación",
    desc: "Cuando tu puntuación baja 10 puntos o más en dos escaneos",
    noun: "avisos de caída de puntuación"
  },
  weekly_digest: {
    title: "Resumen semanal",
    desc: "Los lunes, la evolución de cada dominio",
    noun: "el resumen semanal"
  },
  first_scan: {
    title: "Primer escaneo listo",
    desc: "Una vez, cuando termina tu primer escaneo",
    noun: "el aviso de primer escaneo"
  },
  lifecycle: {
    title: "Consejos, novedades y ofertas",
    desc: "Cómo sacarle partido a GenScore y promociones",
    noun: "consejos, novedades y ofertas"
  }
};

export function isOptionalEmailCategory(value: unknown): value is OptionalEmailCategory {
  return typeof value === "string" && (OPTIONAL_EMAIL_CATEGORIES as readonly string[]).includes(value);
}
