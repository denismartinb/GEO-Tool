"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";

const nameSchema = z.string().trim().min(1).max(80);
const optionalNameSchema = z.string().trim().max(80);
const optionalFieldSchema = z.string().trim().max(160);

export type SaveAccountResult = { success: true } | { success: false; error: string };

export type AccountInput = {
  firstName: string;
  lastName: string;
  companyName: string;
  companyWebsite: string;
  companySector: string;
  legalName: string;
  taxId: string;
};

/**
 * CONSOLE-REDESIGN-1. ONE save for the whole account card.
 *
 * It replaces three separate actions — name, company, billing — each with its
 * own button. That arrangement was a defect this phase introduced: the folds
 * had their own «Guardar», so typing in «Datos de empresa» and pressing the
 * card's «Guardar» silently discarded the edit, and nothing said so (founder,
 * 2026-08-06). Before the redesign Organización was its own screen with a
 * single save, so there was no ambiguity to get wrong.
 *
 * Every field lives in `user_metadata`, so this is one `updateUser` call rather
 * than three round trips. The legacy `org_tax_info` key is deliberately never
 * written and never deleted — see lib/settings/company-details.ts.
 */
export async function saveAccount(input: AccountInput): Promise<SaveAccountResult> {
  const first = nameSchema.safeParse(input.firstName);
  if (!first.success) {
    return { success: false, error: "Introduce un nombre válido." };
  }

  const last = optionalNameSchema.safeParse(input.lastName);
  if (!last.success) {
    return { success: false, error: "Los apellidos son demasiado largos." };
  }

  const companyName = optionalFieldSchema.safeParse(input.companyName);
  if (!companyName.success) {
    return { success: false, error: "El nombre de empresa es demasiado largo." };
  }

  const companyWebsite = optionalFieldSchema.safeParse(input.companyWebsite);
  if (!companyWebsite.success) {
    return { success: false, error: "El sitio web es demasiado largo." };
  }

  const companySector = optionalFieldSchema.safeParse(input.companySector);
  if (!companySector.success) {
    return { success: false, error: "El sector es demasiado largo." };
  }

  const legalName = optionalFieldSchema.safeParse(input.legalName);
  if (!legalName.success) {
    return { success: false, error: "La razón social es demasiado larga." };
  }

  const taxId = optionalFieldSchema.safeParse(input.taxId);
  if (!taxId.success) {
    return { success: false, error: "El NIF es demasiado largo." };
  }

  const { supabase } = await requireUser();

  const { error } = await supabase.auth.updateUser({
    data: {
      first_name: first.data,
      last_name: last.data,
      org_name: companyName.data,
      org_website: companyWebsite.data,
      org_sector: companySector.data,
      org_legal_name: legalName.data,
      org_tax_id: taxId.data
    }
  });

  if (error) {
    return { success: false, error: "No se pudieron guardar los cambios. Inténtalo de nuevo." };
  }

  return { success: true };
}
