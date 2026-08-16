import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { getUsageSummary } from "@/lib/billing";
import { consoleMetadata } from "@/lib/seo/console-metadata";
import { createProject, generateMorePrompts, suggestProjectSetup } from "../actions";

// COMPETITOR-GROUNDING-1: suggestProjectSetup/createProject now fetch the
// domain's homepage and run a grounded (google_search) Gemini call before
// suggesting competitors — slower than the previous domain-only guess and
// past the Vercel Hobby plan's 10s default (docs/environment-contract.md),
// same reasoning as the scan route's maxDuration (ADR 0003).
export const maxDuration = 60;

// ROOT-METADATA-1: pestaña propia. Ver `lib/seo/console-metadata.ts`.
export const metadata: Metadata = consoleMetadata("Nuevo dominio");

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    invalid_project_data: "Revisa los datos del dominio e inténtalo de nuevo.",
    project_creation_failed: "No se pudo crear el dominio. Inténtalo de nuevo.",
    project_restore_failed: "No se pudo reactivar este dominio. Vuelve a intentarlo.",
    project_already_active: "Ya tienes este dominio activo para ese país e idioma.",
    project_limit_reached: "Has alcanzado el límite de dominios de tu plan actual. Sube de plan para añadir más."
  };

  // Checked up front (not just on final submit) so a user already at their
  // plan's project cap never triggers the Gemini competitor/prompt
  // suggestion calls (lib/llm/gemini.ts) for a domain that createProject
  // would reject anyway.
  const usage = await getUsageSummary();
  const atProjectLimit = usage.projectCount >= usage.projectCap;

  const errorMessage = params.error ? errorMessages[params.error] : atProjectLimit ? errorMessages.project_limit_reached : null;

  return (
    <OnboardingWizard
      errorMessage={errorMessage}
      atLimit={atProjectLimit}
      promptCap={usage.promptCap}
      suggestAction={suggestProjectSetup}
      generateMorePromptsAction={generateMorePrompts}
      createAction={createProject}
    />
  );
}
