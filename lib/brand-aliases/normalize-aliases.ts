/**
 * Manual alias management (Fase −1c, docs/geo-score-variability-2026-08.md
 * §3, ADR 0025 "Correction (2026-08-03)"): pure input validation for the
 * add/remove UI, separate from `selectVerifiableAliases`
 * (lib/projects/brand-aliases.ts), which filters a MODEL's proposed aliases
 * against homepage evidence at derivation time.
 *
 * A manually-added alias has no homepage evidence to check against — the
 * owner is asserting directly "this is a real name for my brand", which is
 * exactly the mitigation ADR 0025 shipped without: a human who can see and
 * edit the list, rather than an unreviewed model guess. What still applies
 * here, because it is not about provenance but about matching cost, is the
 * MIN_ALIAS_LENGTH/MAX_ALIAS_LENGTH/MAX_ALIASES bounds — a 2-character alias
 * matches unrelated text just as broadly whether a model invented it or a
 * human typed it. Those constants are imported, not redefined, so the two
 * paths can never silently disagree about the bound that actually protects
 * the score.
 */

import { MAX_ALIAS_LENGTH, MAX_ALIASES, MIN_ALIAS_LENGTH } from "@/lib/projects/brand-aliases";

export { MAX_ALIAS_LENGTH, MAX_ALIASES, MIN_ALIAS_LENGTH };

/** Same normalization `namesPlausiblyMatch`/`selectVerifiableAliases` use, so a name that would already match through the brand or another alias is rejected here too — the entry would just be redundant, mirroring the "redundant_with_alias"/"same_as_brand" rejections at derivation time. */
function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Collapses internal whitespace and trims; does not lowercase — the alias is stored and displayed with the casing the owner typed. */
export function normalizeAliasInput(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export type AddAliasResult = { ok: true; alias: string } | { ok: false; error: string };

/**
 * Validates a single alias the owner is about to add, against the brand
 * string and the project's current alias list. Never mutates its inputs;
 * the caller (a server action) decides how to persist the result.
 */
export function validateNewAlias(input: {
  raw: string;
  brand: string;
  existingAliases: readonly string[];
}): AddAliasResult {
  const alias = normalizeAliasInput(input.raw);

  if (!alias) {
    return { ok: false, error: "Escribe un nombre antes de añadirlo." };
  }

  const key = normalizeKey(alias);

  if (!key || key.length < MIN_ALIAS_LENGTH) {
    return {
      ok: false,
      error: `El alias debe tener al menos ${MIN_ALIAS_LENGTH} caracteres — uno más corto contaría como mención en textos que no hablan de tu marca.`
    };
  }

  if (alias.length > MAX_ALIAS_LENGTH) {
    return { ok: false, error: `El alias no puede superar los ${MAX_ALIAS_LENGTH} caracteres.` };
  }

  const brandKey = normalizeKey(input.brand);
  if (key === brandKey || brandKey.includes(key) || key.includes(brandKey)) {
    return { ok: false, error: "Ya cuenta como mención a través del nombre de tu marca — no hace falta añadirlo." };
  }

  for (const existing of input.existingAliases) {
    const existingKey = normalizeKey(existing);
    if (key === existingKey) {
      return { ok: false, error: "Ese alias ya está en la lista." };
    }
    if (existingKey.includes(key) || key.includes(existingKey)) {
      return { ok: false, error: `Ya cuenta como mención a través de «${existing}» — no hace falta añadirlo.` };
    }
  }

  if (input.existingAliases.length >= MAX_ALIASES) {
    return { ok: false, error: `Has alcanzado el máximo de ${MAX_ALIASES} alias por proyecto.` };
  }

  return { ok: true, alias };
}

/**
 * Removes an alias by normalized-key match (case/diacritic/whitespace
 * insensitive), so a stray casing difference between what's rendered and
 * what's clicked can never leave the "removed" one behind.
 */
export function removeAliasFromList(existingAliases: readonly string[], alias: string): string[] {
  const key = normalizeKey(alias);
  return existingAliases.filter((a) => normalizeKey(a) !== key);
}
