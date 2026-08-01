import { isSameOrSubdomain, normalizeDomain } from "@/lib/domains/brand-domain";

/**
 * Best-effort classification of a third-party cited domain into the source
 * "families" AI citation research treats as distinct behavior (Semrush,
 * "What Are AI Citations & How Do I Get Them?", 30 jul 2025): community
 * hubs, encyclopedic references, and comparison/review aggregators read and
 * get cited very differently than a media outlet.
 *
 * Deliberately NOT an exhaustive or general-purpose classifier — no crawler,
 * no third-party categorization API, just a small curated list of domains we
 * can name with confidence. Everything else is "unknown" ("Sin clasificar"
 * in the UI) rather than guessed, per CLAUDE.md's ban on fake/invented
 * metrics. Extend the list as real scan data surfaces more recognizable
 * domains — do not try to make this exhaustive up front.
 */
export type SourceType = "community" | "encyclopedia" | "comparator" | "media" | "unknown";

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  community: "Comunidad",
  encyclopedia: "Enciclopedia",
  comparator: "Comparador",
  media: "Medio",
  unknown: "Sin clasificar"
};

const DOMAIN_TYPES: Record<string, SourceType> = {
  // Community hubs
  "reddit.com": "community",
  "quora.com": "community",
  "forocoches.com": "community",
  "meneame.net": "community",
  "stackoverflow.com": "community",
  "stackexchange.com": "community",

  // Encyclopedic references
  "wikipedia.org": "encyclopedia",

  // Comparators / review aggregators
  "trustpilot.com": "comparator",
  "g2.com": "comparator",
  "capterra.com": "comparator",
  "rastreator.com": "comparator",
  "kelisto.es": "comparator",
  "acierto.com": "comparator",
  "selectra.es": "comparator",
  "idealo.es": "comparator",
  "papernest.es": "comparator",
  "comparaiso.es": "comparator",

  // Media / news outlets (mostly Spanish-market tech/general press)
  "xataka.com": "media",
  "genbeta.com": "media",
  "xatakamovil.com": "media",
  "applesfera.com": "media",
  "adslzone.net": "media",
  "elpais.com": "media",
  "elmundo.es": "media",
  "abc.es": "media",
  "lavanguardia.com": "media",
  "expansion.com": "media",
  "20minutos.es": "media",
  "europapress.es": "media",
  "businessinsider.es": "media",
  "computerhoy.com": "media",
  "muycomputer.com": "media",
  "infobae.com": "media"
};

/** Classifies a domain (subdomains included, e.g. `es.wikipedia.org`). */
export function classifySourceType(domain: string): SourceType {
  const normalized = normalizeDomain(domain ?? "");
  if (!normalized) return "unknown";

  for (const [known, type] of Object.entries(DOMAIN_TYPES)) {
    if (isSameOrSubdomain(normalized, known)) return type;
  }
  return "unknown";
}
