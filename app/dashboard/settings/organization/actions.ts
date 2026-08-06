"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";

const optionalFieldSchema = z.string().trim().max(160);
const nameSchema = z.string().trim().min(1).max(80);

export type UpdateOrganizationResult = { success: true } | { success: false; error: string };

/**
 * CONSOLE-REDESIGN-1. The company block is now two forms in two sections — see
 * `lib/settings/company-details.ts`, which holds the pure readers and the
 * reasoning (a `"use server"` module may only export async functions, so they
 * cannot live here).
 */
export async function updateOrganization(
  name: string,
  website: string,
  sector: string
): Promise<UpdateOrganizationResult> {
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) {
    return { success: false, error: "Introduce un nombre de empresa válido." };
  }

  const parsedWebsite = optionalFieldSchema.safeParse(website);
  if (!parsedWebsite.success) {
    return { success: false, error: "El sitio web es demasiado largo." };
  }

  const parsedSector = optionalFieldSchema.safeParse(sector);
  if (!parsedSector.success) {
    return { success: false, error: "El sector es demasiado largo." };
  }

  const { supabase } = await requireUser();

  const { error } = await supabase.auth.updateUser({
    data: {
      org_name: parsedName.data,
      org_website: parsedWebsite.data,
      org_sector: parsedSector.data
    }
  });

  if (error) {
    return { success: false, error: "No se pudieron guardar los datos de empresa. Inténtalo de nuevo." };
  }

  return { success: true };
}

export async function updateBillingDetails(
  legalName: string,
  taxId: string
): Promise<UpdateOrganizationResult> {
  const parsedLegalName = optionalFieldSchema.safeParse(legalName);
  if (!parsedLegalName.success) {
    return { success: false, error: "La razón social es demasiado larga." };
  }

  const parsedTaxId = optionalFieldSchema.safeParse(taxId);
  if (!parsedTaxId.success) {
    return { success: false, error: "El NIF es demasiado largo." };
  }

  const { supabase } = await requireUser();

  // The legacy `org_tax_info` key is left untouched on purpose — see
  // readBillingDetails. Writing the two new keys is what makes it stop being
  // the source; deleting it would throw away the only copy for an account that
  // saves an empty form by accident.
  const { error } = await supabase.auth.updateUser({
    data: {
      org_legal_name: parsedLegalName.data,
      org_tax_id: parsedTaxId.data
    }
  });

  if (error) {
    return { success: false, error: "No se pudieron guardar los datos de facturación. Inténtalo de nuevo." };
  }

  return { success: true };
}
