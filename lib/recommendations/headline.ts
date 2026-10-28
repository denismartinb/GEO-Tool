/**
 * RECS-HEADLINES-1 — the action headline of every recommendation card.
 *
 * A card is a task in the week's plan, so its headline names the deliverable
 * and where it goes («Sube esta FAQ a tu web», «Añade un dato con fecha y
 * fuente a /tarifas»), never an outcome the customer cannot control («sal
 * antes que X», «llega a la página 1»). Long material (the question, the
 * search, the counts) goes in `context`, a grey line under the headline that
 * may be cut without cutting the task. Founder, 2026-10-28.
 *
 * Computed when the card is drawn, from what the row already stores, so rows
 * written before this phase read the same as new ones. The engine writes the
 * same headline into `title` for every consumer that still reads it raw.
 *
 * Pure and client-safe.
 */

import { displayPath } from "@/lib/search-console/insights";

/** Headlines are at most this long, so they fit in two lines on a phone. */
export const HEADLINE_MAX = 48;

/**
 * Types that no longer produce a card: neither has a deliverable the customer
 * can make (founder, 2026-10-28). Rows already stored are hidden on read.
 */
export const RETIRED_RECOMMENDATION_TYPES = ["increase_brand_prominence", "amplify_positive_pattern"] as const;

/** PostgREST list for `.not("recommendation_type", "in", …)`. */
export const RETIRED_TYPES_FILTER = `(${RETIRED_RECOMMENDATION_TYPES.join(",")})`;

export function isRetiredRecommendationType(type: string): boolean {
  return (RETIRED_RECOMMENDATION_TYPES as readonly string[]).includes(type);
}

export type Headline = { title: string; context: string | null };

/** Only the states that certify an own page we can name. */
export type HeadlineCoverage = { state: string; pageUrl: string | null } | null | undefined;

/** A coverage overlay entry (server or client shape) as the headline reads it. */
export function overlayForHeadline(
  overlay: { state: string; verifiedPage: { url: string } | null } | null | undefined
): HeadlineCoverage {
  return overlay ? { state: overlay.state, pageUrl: overlay.verifiedPage?.url ?? null } : null;
}

type HeadlineInput = {
  recommendation_type: string;
  title: string;
  evidence_json?: unknown;
};

type Evidence = {
  affected_prompts?: unknown;
  query_shape?: unknown;
  dominant_competitor?: unknown;
  emerging_competitor?: unknown;
  source_domains?: unknown;
  citation_domains?: unknown;
  citation_pages?: unknown;
  sentiment_drivers?: unknown;
  stale_signals?: unknown;
};

function asEvidence(value: unknown): Evidence {
  return value && typeof value === "object" ? (value as Evidence) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function questions(n: number): string {
  return n === 1 ? "1 pregunta" : `${n} preguntas`;
}

function distinctCount(list: string[]): number {
  return new Set(list.map((s) => s.trim().toLowerCase())).size;
}

/**
 * The page as the headline names it: its path when short enough to keep the
 * headline in two lines, «tu portada» for the root, otherwise null (the
 * caller then says «tu página» or «tu web»).
 */
export function headlinePath(url: string | null | undefined, room = 24): string | null {
  if (!url) return null;
  const path = displayPath(url);
  if (path === "/" || path === "") return "tu portada";
  if (!path.startsWith("/")) return null;
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.length <= room ? trimmed : null;
}

/** A name that fits inside a headline; longer ones fall back to a generic form. */
function fits(name: string | null, room: number): string | null {
  return name && name.length <= room ? name : null;
}

/** Older rows carry the competitor only in the title. */
function competitorFrom(ev: Evidence, title: string, pattern: RegExp): string | null {
  return str(ev.dominant_competitor) ?? str(title.match(pattern)?.[1]);
}

function others(list: string[]): string | null {
  const rest = list.slice(1);
  if (rest.length === 0) return null;
  if (rest.length <= 2) return `También: ${rest.join(", ")}`;
  return `También: ${rest.slice(0, 2).join(", ")} y ${rest.length - 2} más`;
}

function sourceDomains(ev: Evidence): string[] {
  const own = strings(ev.source_domains);
  return own.length > 0 ? own : strings(ev.citation_domains);
}

function isVideo(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return ["youtube.com", "youtu.be", "vimeo.com", "tiktok.com"].some((root) => d === root || d.endsWith(`.${root}`));
}

/** The own page coverage confirmed, as the headline can name it. */
function confirmedPage(coverage: HeadlineCoverage): string | null {
  if (!coverage || coverage.state !== "confirmed_surfacing_gap") return null;
  return headlinePath(coverage.pageUrl, HEADLINE_MAX);
}

/** `prefix + page` when it fits, the generic form otherwise. */
function onPage(prefix: string, page: string | null, generic: string): string {
  const candidate = page ? `${prefix}${page}` : null;
  return candidate && candidate.length <= HEADLINE_MAX ? candidate : generic;
}

function coverageSaysCreate(coverage: HeadlineCoverage): boolean {
  return Boolean(coverage && coverage.state !== "confirmed_surfacing_gap");
}

export function recommendationHeadline(rec: HeadlineInput, coverage?: HeadlineCoverage): Headline {
  const ev = asEvidence(rec.evidence_json);
  const prompts = strings(ev.affected_prompts);
  const firstPrompt = prompts[0] ?? null;
  const n = distinctCount(prompts);

  switch (rec.recommendation_type) {
    case "increase_brand_visibility": {
      const page = confirmedPage(coverage);
      if (ev.query_shape === "definition") {
        return {
          title: onPage("Añade la definición al inicio de ", page, "Añade la definición al inicio de tu página"),
          context: firstPrompt
        };
      }
      return {
        title: page
          ? onPage("Responde esta pregunta en ", page, "Responde esta pregunta en tu página")
          : "Publica una página que responda esta pregunta",
        context: firstPrompt
      };
    }

    case "add_citation_block": {
      const page = confirmedPage(coverage);
      return {
        title: page
          ? onPage("Añade un dato con fuente a ", page, "Añade un dato con fecha y fuente a tu página")
          : coverageSaysCreate(coverage)
            ? "Publica una página con un dato que citar"
            : "Añade un dato con fecha y fuente a tu página",
        context: firstPrompt
      };
    }

    case "improve_citation_readiness":
      return { title: "Añade un dato con fecha y fuente a tu página", context: firstPrompt };

    case "close_competitor_gap": {
      const competitor = competitorFrom(ev, rec.title, /^Disputa a (.+?) \d+ consulta/);
      const covered = coverage?.state === "confirmed_surfacing_gap";
      if (!competitor) {
        return {
          title: "Publica una página para tu pregunta más comercial",
          context: n > 0 ? `Tus rivales salen en ${questions(n)} y tú no` : null
        };
      }
      const name = fits(competitor, 22);
      return {
        title: name
          ? `${covered ? "Mejora" : "Publica"} tu comparativa con ${name}`
          : `${covered ? "Mejora" : "Publica"} tu comparativa con ese rival`,
        context: `${competitor} sale en ${questions(Math.max(n, 1))} y tú no`
      };
    }

    case "add_comparison_content":
      return {
        title:
          coverage?.state === "confirmed_surfacing_gap"
            ? "Añade una tabla a tu comparativa"
            : "Publica una comparativa con tabla y tus rivales",
        context: n > 0 ? `${questions(n)} de comparación` : null
      };

    case "create_faq_section":
      return { title: "Sube esta FAQ a tu web", context: n > 0 ? `Responde ${questions(n)} informativas` : null };

    case "strengthen_brand_entity_clarity":
      return { title: "Reescribe la primera frase de tu portada", context: "Qué haces, para quién y dónde" };

    case "update_stale_content":
      return {
        title: "Actualiza el dato viejo y pon fecha en la página",
        context: n > 0 ? `La IA da datos desactualizados en ${n === 1 ? "1 respuesta" : `${n} respuestas`}` : null
      };

    case "address_negative_narrative": {
      const drivers = strings(ev.sentiment_drivers);
      return {
        title: "Publica una página que responda a las críticas",
        context: drivers.length > 0 ? `La IA repite: ${drivers.slice(0, 3).join(", ")}` : null
      };
    }

    case "track_emerging_competitor": {
      const name = str(ev.emerging_competitor) ?? str(rec.title.match(/^Añade (.+) a tus competidores$/)?.[1]);
      const short = fits(name, 22);
      return {
        title: short ? `Añade ${short} a tus competidores` : "Añade esta marca a tus competidores",
        context: name && !short ? name : n > 0 ? `La IA la nombra en ${n === 1 ? "1 respuesta" : `${n} respuestas`}` : null
      };
    }

    case "pursue_comparator_sources": {
      const domains = sourceDomains(ev);
      const top = fits(domains[0] ?? null, 22);
      return {
        title: top ? `Escribe a ${top} para que te incluya` : "Escribe al comparador que cita la IA",
        context: top ? others(domains) : (domains.slice(0, 3).join(", ") || null)
      };
    }

    case "pursue_community_sources": {
      const domains = sourceDomains(ev);
      const domain = domains[0] ?? null;
      const top = fits(domain, 22);
      const video = domain ? isVideo(domain) : false;
      return {
        title: top
          ? video
            ? `Comenta en el vídeo de ${top}`
            : `Responde en el hilo de ${top}`
          : "Responde en el foro que cita la IA",
        context: top ? others(domains) : (domains.slice(0, 3).join(", ") || null)
      };
    }

    case "pursue_media_sources": {
      const domains = sourceDomains(ev);
      const top = fits(domains[0] ?? null, 22);
      return {
        title: top ? `Ofrece un dato propio a ${top}` : "Ofrece un dato propio al medio que cita la IA",
        context: top ? others(domains) : (domains.slice(0, 3).join(", ") || null)
      };
    }

    case "pursue_citation_sources": {
      const domains = sourceDomains(ev);
      const top = fits(domains[0] ?? null, 20);
      return {
        title: top ? `Escribe a ${top} para que te mencione` : "Escribe a la web que cita la IA",
        context: top ? others(domains) : (domains.slice(0, 3).join(", ") || null)
      };
    }

    default:
      return { title: rec.title, context: null };
  }
}
