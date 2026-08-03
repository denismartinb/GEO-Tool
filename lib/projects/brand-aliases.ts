/**
 * Brand identity: the set of names that count as a mention of this brand
 * (GEO-SCORE-BRAND-IDENTITY-1, docs/geo-score-variability-2026-08.md).
 *
 * Why this exists: `verifyMention` (lib/scan/extraction.ts, ADR 0021) only
 * accepts a mention when the extractor's `display_name_found` plausibly names
 * the tracked brand string. Measured on the founder's real 2026-08-02 scan of
 * "Mozilla": all three engines recommended **Firefox**, and the brand only
 * counted because each answer happened to also write the parent company's
 * name in passing. Strip that incidental attribution and all three become
 * non-mentions — a 74 that should be a 0, decided by a wording accident.
 *
 * The danger of the fix is the mirror image of the bug it fixes. ADR 0021
 * exists because mentions were being *fabricated*; aliases deliberately
 * loosen that check, so a careless alias re-opens exactly that hole — a
 * generic alias like "Focus" would match half the internet. Two rules keep
 * this honest, and both live in this module rather than in the prompt:
 *
 *  1. **Every alias must be verifiable in the brand's own homepage
 *     evidence.** An alias the model produced from memory, that does not
 *     appear anywhere on the brand's own site, is dropped. Same philosophy as
 *     `verifyMention` itself: the model's claim is a hypothesis, the text is
 *     the evidence.
 *  2. **No alias may be a generic word or shorter than the bar below.**
 *     Length and specificity are what stop an alias from matching unrelated
 *     text once `namesPlausiblyMatch` starts accepting substrings in both
 *     directions.
 *
 * Everything here is pure so both rules are testable without a live LLM.
 */

/**
 * Shortest acceptable alias. `namesPlausiblyMatch` accepts a substring match
 * in EITHER direction, so a 2-3 character alias ("HP", "3M") would match
 * inside a large fraction of unrelated words and silently inflate the mention
 * rate for that project — the exact failure ADR 0021 was written to kill.
 * Short real brand names are better served by the tracked brand string
 * itself, which is exact and user-controlled.
 */
export const MIN_ALIAS_LENGTH = 4;

/** Mirrors the `projects_brand_aliases_bounded` check in migration 0023. */
export const MAX_ALIASES = 25;

/**
 * Per-alias length cap. Unlike MAX_ALIASES this is enforced HERE ONLY —
 * Postgres rejects a subquery in a CHECK constraint, and there is no
 * subquery-free immutable way to bound the longest element of a text[] (see
 * migration 0023's header). A direct SQL write could therefore store a longer
 * alias than this; every application write path goes through
 * selectVerifiableAliases and cannot.
 */
export const MAX_ALIAS_LENGTH = 120;

/**
 * Words that must never become an alias on their own: they describe a
 * category rather than naming this brand, so accepting one would make every
 * answer about the category count as a mention. This is the "tu marca"
 * failure of ADR 0021 arriving through a different door.
 *
 * **This list is a heuristic and is knowingly incomplete.** It cannot be
 * otherwise — "generic" is contextual (a browser company must not alias
 * "browser"; a company literally named Browser Inc. might). It is a cheap
 * first filter, not the safety property. The safety properties are rule 1
 * (must appear in the brand's own evidence) and MIN_ALIAS_LENGTH; this list
 * only catches the common category nouns those two would let through. The
 * residual risk is a category word specific to a vertical we have not
 * enumerated, which is why the derived list is persisted as ordinary
 * user-editable project data and shown back to the user rather than applied
 * invisibly.
 */
const GENERIC_ALIAS_TERMS = new Set([
  "app",
  "web",
  "site",
  "sitio",
  "tienda",
  "shop",
  "store",
  "online",
  "empresa",
  "company",
  "grupo",
  "group",
  "brand",
  "marca",
  "producto",
  "product",
  "servicio",
  "service",
  "plataforma",
  "platform",
  "software",
  "solucion",
  "solution",
  "cliente",
  "customer",
  "premium",
  "pro",
  "plus",
  "free",
  "gratis",
  "focus",
  "home",
  "inicio",
  "browser",
  "navegador",
  "email",
  "correo",
  "cuenta",
  "account",
  "portal",
  "blog",
  "noticias",
  "news"
]);

/** Same normalization `namesPlausiblyMatch` uses, so decisions here match decisions there. */
function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Case/diacritic-insensitive haystack match, mirroring normalizeForSubstringMatch in lib/scan/extraction.ts. */
function normalizeHaystack(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type AliasRejection = {
  alias: string;
  reason:
    | "too_short"
    | "too_long"
    | "generic"
    | "not_in_evidence"
    | "same_as_brand"
    | "redundant_with_alias"
    | "duplicate"
    | "over_limit";
};

export type AliasSelection = {
  /** Aliases that passed every rule, in the order the model proposed them. */
  accepted: string[];
  /** Everything rejected, with why — surfaced to the user, never silently dropped. */
  rejected: AliasRejection[];
};

/**
 * Filters a model's proposed aliases down to the ones that are safe to score
 * with. Never throws; an empty `accepted` is a valid, honest outcome meaning
 * "this brand is only ever called by its own name", which is the correct
 * answer for most brands.
 *
 * `evidenceText` is the brand's own homepage evidence (title, description,
 * headings, excerpt — the same block `inferBusinessProfile` reasons over).
 * Rule 1 above is enforced against it: an alias absent from the brand's own
 * site is a guess, and guesses do not get to move the score.
 */
export function selectVerifiableAliases(
  proposed: readonly string[],
  brand: string,
  evidenceText: string
): AliasSelection {
  const haystack = normalizeHaystack(evidenceText);
  const brandKey = normalizeName(brand);
  const accepted: string[] = [];
  const rejected: AliasRejection[] = [];
  const seen = new Set<string>();

  for (const raw of proposed) {
    // `proposed` comes from parsed LLM output; a non-string here means the
    // model returned something the schema let through. Skip, never throw —
    // one malformed entry must not cost the project every other alias.
    const alias = typeof raw === "string" ? raw.trim() : "";
    if (!alias) continue;

    const key = normalizeName(alias);
    const reject = (reason: AliasRejection["reason"]) => rejected.push({ alias, reason });

    if (!key || key.length < MIN_ALIAS_LENGTH) {
      reject("too_short");
      continue;
    }
    if (alias.length > MAX_ALIAS_LENGTH) {
      reject("too_long");
      continue;
    }
    // Already covered by the tracked brand string alone. `namesPlausiblyMatch`
    // (lib/scan/extraction.ts) accepts a substring match in EITHER direction,
    // so both of these are redundant and neither can ever change a verdict:
    //   - an alias the brand contains  ("Mozilla" for brand "Mozilla Corp")
    //   - an alias that contains the brand ("Mozilla VPN" for brand "Mozilla")
    // The second was missed in the first version, and real derived output shows
    // why it matters: mozilla.org produced "Mozilla VPN", "Mozilla Monitor",
    // "Mozilla.ai", "Mozilla Ventures", "Mozilla Advertising", "Mozilla
    // Builders" and "Mozilla New Products" — seven of fourteen entries that
    // already matched via "Mozilla" itself, crowding out the ones that carry
    // real information (Firefox, Thunderbird, MDN Plus) and spending a
    // comparison each, per entity, per prompt.
    if (key === brandKey || brandKey.includes(key) || key.includes(brandKey)) {
      reject("same_as_brand");
      continue;
    }
    if (key.split(" ").every((token) => GENERIC_ALIAS_TERMS.has(token))) {
      reject("generic");
      continue;
    }
    if (seen.has(key)) {
      reject("duplicate");
      continue;
    }
    if (!haystack.includes(normalizeHaystack(alias))) {
      reject("not_in_evidence");
      continue;
    }
    // The same redundancy as `same_as_brand`, one level deeper: an alias
    // already covered by one accepted earlier. verifyMention tests the claimed
    // name against EVERY name in the set, so once "Firefox" is in, "Firefox
    // Relay" and "Firefox Focus" can never change a verdict either — they
    // match through "Firefox".
    //
    // Checked last, after evidence and duplicates, so a hallucinated or
    // repeated alias is still reported as such rather than being masked by
    // this rule.
    //
    // Order-dependent by construction, and honestly so: candidates keep the
    // model's own ordering, which puts the flagship product first (the real
    // mozilla.org derivation returned "Firefox" at position 1, "Firefox
    // Relay" at 4). If a narrower name arrived first it would win and the
    // broader one would be dropped — a worse outcome, not a wrong one, since
    // the broader name matches more real answers. Sorting by generality would
    // remove that risk at the cost of no longer reflecting what the model
    // considered most important; not worth it until a real case shows the
    // ordering failing.
    if (
      accepted.some((existing) => {
        const existingKey = normalizeName(existing);
        return existingKey.includes(key) || key.includes(existingKey);
      })
    ) {
      reject("redundant_with_alias");
      continue;
    }
    if (accepted.length >= MAX_ALIASES) {
      reject("over_limit");
      continue;
    }

    seen.add(key);
    accepted.push(alias);
  }

  return { accepted, rejected };
}
