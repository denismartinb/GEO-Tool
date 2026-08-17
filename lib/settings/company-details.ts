/**
 * CONSOLE-REDESIGN-1. Pure readers for the company/billing fields kept in
 * `user_metadata`.
 *
 * They live here rather than next to their server actions because a
 * `"use server"` module may only export async functions — Next refuses to
 * build otherwise. Keeping them pure is what makes the org_tax_info split
 * testable at all.
 *
 * The block used to be one screen ("Organización") with four fields; it is now
 * split across two sections of the single settings page, because the two
 * halves answer different questions:
 *
 * - `org_name` / `org_website` / `org_sector` describe the company and live in
 *   a collapsed fold inside Cuenta. Nothing in the product reads them yet.
 * - `org_legal_name` / `org_tax_id` exist for the invoice, so they live in the
 *   Plan section, next to the thing they are for.
 */

export type CompanyDetails = {
  name: string;
  website: string;
  sector: string;
};

export type BillingDetails = {
  legalName: string;
  taxId: string;
};

type Metadata = Record<string, unknown>;

function readString(metadata: Metadata, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

export function readCompanyDetails(metadata: Metadata): CompanyDetails {
  return {
    name: readString(metadata, "org_name"),
    website: readString(metadata, "org_website"),
    sector: readString(metadata, "org_sector")
  };
}

/**
 * Founder-approved migration path for the old `org_tax_info` (2026-08-06): the
 * previous free-text value is shown as Razón social and the NIF starts empty,
 * because nothing can tell which half of "B-84920011, Xataka Media S.L." is
 * which without guessing at someone's fiscal data.
 *
 * Seeding happens on READ, not by rewriting the row, so there is no migration
 * and nothing changes until the owner saves. `org_tax_info` is deliberately
 * never deleted — it stays as the fallback source for anyone who never opens
 * this screen again.
 */
export function readBillingDetails(metadata: Metadata): BillingDetails {
  const legalName = readString(metadata, "org_legal_name").trim();
  const legacy = readString(metadata, "org_tax_info").trim();

  return {
    legalName: legalName || legacy,
    taxId: readString(metadata, "org_tax_id")
  };
}
