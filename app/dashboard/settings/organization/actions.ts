"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";

const nameSchema = z.string().trim().min(1).max(80);
const optionalFieldSchema = z.string().trim().max(160);

export type UpdateOrganizationResult = { success: true } | { success: false; error: string };

export async function updateOrganization(
  name: string,
  website: string,
  sector: string,
  taxInfo: string
): Promise<UpdateOrganizationResult> {
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) {
    return { success: false, error: "Introduce un nombre de organización válido." };
  }

  const parsedWebsite = optionalFieldSchema.safeParse(website);
  if (!parsedWebsite.success) {
    return { success: false, error: "El sitio web es demasiado largo." };
  }

  const parsedSector = optionalFieldSchema.safeParse(sector);
  if (!parsedSector.success) {
    return { success: false, error: "El sector es demasiado largo." };
  }

  const parsedTaxInfo = optionalFieldSchema.safeParse(taxInfo);
  if (!parsedTaxInfo.success) {
    return { success: false, error: "Los datos fiscales son demasiado largos." };
  }

  const { supabase } = await requireUser();

  const { error } = await supabase.auth.updateUser({
    data: {
      org_name: parsedName.data,
      org_website: parsedWebsite.data,
      org_sector: parsedSector.data,
      org_tax_info: parsedTaxInfo.data
    }
  });

  if (error) {
    return { success: false, error: "No se pudo guardar la organización. Inténtalo de nuevo." };
  }

  return { success: true };
}
