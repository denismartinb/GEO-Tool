/**
 * Visión general copy (CONSOLE-INSTRUMENTO-1 F3, log §352). Pure: every
 * sentence is a template over figures the page already computed, and it
 * claims nothing the competitive claim (AUDIT-TRUTH-1, log §278) does not
 * allow.
 */
import type { CompetitiveClaim } from "@/lib/metrics/competitive-claim";

export type LeadTarget = "prompts" | "competitors" | "recommendations";
export type LeadPart = string | { text: string; to: LeadTarget };

/** «Buenos días.» until 13:00, «Buenas tardes.» until 21:00, «Buenas noches.» after. The caller passes Madrid's hour. */
export function greeting(hour: number, firstName?: string | null): string {
  const base = hour >= 6 && hour < 13 ? "Buenos días" : hour >= 13 && hour < 21 ? "Buenas tardes" : "Buenas noches";
  return firstName ? `${base}, ${firstName}.` : `${base}.`;
}

/** First given name from the account's own metadata (Google sign-in); null when the account has none. Never guessed from the email. */
export function firstNameFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  const raw = meta?.first_name ?? meta?.given_name ?? meta?.full_name ?? meta?.name;
  if (typeof raw !== "string") return null;
  const first = raw.trim().split(/\s+/)[0] ?? "";
  return first.length > 0 && first.length <= 30 ? first : null;
}

export function leadParts(input: {
  mentionRate: number;
  /** ± points, only when the sample is too small to hide it. */
  marginPoints: number | null;
  claim: CompetitiveClaim;
  planCount: number;
}): LeadPart[] {
  const { mentionRate, marginPoints, claim, planCount } = input;
  const parts: LeadPart[] = [];
  const margin = marginPoints !== null ? ` (±${Math.round(marginPoints)})` : "";
  if (mentionRate > 0) {
    parts.push("Apareces en el ", { text: `${mentionRate}%`, to: "prompts" }, ` de las respuestas${margin}.`);
  } else {
    parts.push("Todavía no apareces en las respuestas.");
  }

  switch (claim.kind) {
    case "behind":
      parts.push(" ", { text: claim.competitor, to: "competitors" }, ` te supera con un ${claim.competitorRate}%.`);
      break;
    case "no_citations":
      parts.push(" Ninguna de las fuentes que usa la IA es tuya todavía.");
      break;
    case "no_competitors":
      parts.push(" No sigues a ningún competidor, así que todavía no hay con quién compararte.");
      break;
    case "nobody_named":
      parts.push(" Tampoco nombra a tus competidores.");
      break;
    case "tied":
      parts.push(" Empatas en presencia con ", { text: claim.competitor, to: "competitors" }, ", tu competidor más visible.");
      break;
    case "ahead_small_sample":
      parts.push(" Vas por delante de tus competidores, pero con tan pocas respuestas todavía no es concluyente.");
      break;
    case "leader":
      parts.push(" Hoy tienes la mayor visibilidad frente a tus competidores.");
      break;
  }

  if (planCount > 0) {
    parts.push(" Tienes ", { text: `${planCount} ${planCount === 1 ? "acción" : "acciones"}`, to: "recommendations" }, " para esta semana.");
  }
  return parts;
}

/** The card's headline under the score. Never calls the brand a leader on a thin sample or without a rival. */
export function scoreHeadline(mentionRate: number, claim: CompetitiveClaim): string {
  if (mentionRate <= 0) return "La IA todavía no te nombra.";
  switch (claim.kind) {
    case "behind":
      return `La IA ya te nombra. Ahora falta que te elija antes que a ${claim.competitor}.`;
    case "tied":
      return `La IA ya te nombra. Estás empatado con ${claim.competitor}.`;
    case "leader":
      return "La IA ya te nombra más que a tus rivales.";
    case "ahead_small_sample":
      return "La IA ya te nombra. Hacen falta más respuestas para compararte.";
    case "no_competitors":
      return "La IA ya te nombra. Añade rivales para ver cómo te comparas.";
    case "no_citations":
      return "La IA ya te nombra. Ahora falta que cite tu web.";
    case "nobody_named":
      return "La IA ya te nombra.";
  }
}

export type BandKey = "initial" | "emerging" | "competitive";

export function bandOf(score: number): BandKey {
  return score >= 70 ? "competitive" : score >= 40 ? "emerging" : "initial";
}

export const BAND_LABEL: Record<BandKey, string> = {
  initial: "Inicial",
  emerging: "Emergente",
  competitive: "Competitivo"
};
