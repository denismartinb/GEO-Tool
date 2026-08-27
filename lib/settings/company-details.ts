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
 * - `org_name` / `org_website` / `org_sector` described the company. Nothing
 *   in the product ever read them, so the fold that edited them was hidden
 *   (founder, 2026-08-25, log §165) rather than left as a promise the product
 *   did not keep. The keys and this reader stay — the values already saved by
 *   some accounts are not deleted, only the editable UI is gone.
 * - `org_legal_name` / `org_tax_id` exist for the invoice, and since
 *   BILLING-INVOICE-FIELDS-1 (log §166) they really do reach one: saving this
 *   form also pushes them to the account's Stripe customer as
 *   `invoice_settings.custom_fields` (`lib/stripe.ts`,
 *   `syncBillingDetailsToStripeCustomer`).
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
