/**
 * The durable identity of a domain for "first scan of a domain is exempt from the monthly
 * manual review" (CONTRACT-99, owner decision relayed 2026-10-08: the first scan of each NEW
 * domain does not consume the review, ONCE per domain; archiving and re-adding does not renew
 * it).
 *
 * Pure and dependency-free, and deliberately NOT a ninth copy of `normalizeDomain`: this
 * repo already has eight ad-hoc ones and they disagree about ports, trailing dots and
 * punycode. This one answers a single question — "is this the same domain the account
 * already used?" — and is stricter than `cleanDomain` (project-form.ts, which only strips
 * scheme, `www.` and the path) because every difference it ignores would otherwise be a way
 * to mint a fresh exemption from a URL variant: `example.com:443`, `example.com.`,
 * `EXAMPLE.com/precios?x=1`, `https://user@example.com`, `bücher.de` vs `xn--bcher-kva.de`.
 *
 * What it does NOT collapse, on purpose and as an OPEN PROPOSAL for the owner:
 *  - subdomains (`blog.example.com` and `example.com` are different keys). Merging them needs a
 *    public-suffix list to know where the registrable domain starts; without it, `co.uk`-style
 *    suffixes would merge unrelated customers. The cost: one account could claim up to three
 *    active domains' exemptions through subdomains of one site; the cap of 3 active domains and
 *    the rule that archiving does not renew bound it.
 *  - country and language: they are properties of a PROJECT, not of the domain, so they are not
 *    part of the key at all — the same domain in another country is the same key, and creates
 *    no new exemption.
 *
 * Storage (not implemented here, schema is a separate approval): a row per (owner, key) that is
 * NOT deleted with the project, claimed with an atomic insert-if-absent so two simultaneous
 * first scans cannot both be exempt.
 */
export function firstScanDomainKey(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;

  let hostname: string;
  try {
    // The WHATWG parser drops userinfo, port, path, query and fragment, lowercases, and
    // converts IDN labels to punycode — the same host the browser would connect to.
    hostname = new URL(withScheme).hostname;
  } catch {
    return null;
  }

  const host = hostname.replace(/\.+$/, "").replace(/^www\./, "");

  // Same shape `isWellFormedDomain` demands of a project domain (ASCII labels after punycode).
  // The WHATWG parser also turns "1.2" into the IPv4 address 1.0.0.2 and accepts IPv6 literals;
  // an address is not a domain, so a numeric last label (every real TLD has a letter) is refused.
  const lastLabel = host.slice(host.lastIndexOf(".") + 1);
  if (/^[0-9]+$/.test(lastLabel)) return null;

  const wellFormed = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host);
  return wellFormed && host.length <= 255 ? host : null;
}
