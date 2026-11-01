import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";

/**
 * EXT-AUDITS-1 (log §406): `?nuevo=vodafone.es&nombre=Vodafone` on
 * Competidores, written by the Chrome extension's «Añadir como competidor».
 * It only fills the sheet's form: nothing is saved until the person presses
 * «Añadir», through the same `createCompetitorAction` as always.
 *
 * A value that is not a well-formed domain is ignored, never half-filled. The
 * name falls back to the domain's first label, the same thing a person would
 * type, and the action still applies its own checks (entity hygiene, caps).
 */
export const PREFILL_NAME_MAX = 60;

export function readCompetitorPrefill(params: Record<string, string | string[] | undefined>): { name: string; domain: string } | null {
  const raw = Array.isArray(params.nuevo) ? params.nuevo[0] : params.nuevo;
  if (!raw || raw.length > 253 || !isWellFormedDomain(raw)) return null;
  const domain = cleanDomain(raw).replace(/^www\./, "");
  const given = Array.isArray(params.nombre) ? params.nombre[0] : params.nombre;
  const name = (given ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, PREFILL_NAME_MAX);
  const label = domain.split(".")[0].replace(/-/g, " ");
  return { domain, name: name || label.charAt(0).toUpperCase() + label.slice(1) };
}
