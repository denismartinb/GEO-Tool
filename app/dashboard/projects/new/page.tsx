import { OnboardingWizard } from "@/components/onboarding-wizard";
import { getUsageSummary } from "@/lib/billing";
import { createProject, suggestProjectSetup } from "../actions";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    invalid_project_data: "Revisa los datos del dominio e inténtalo de nuevo.",
    project_creation_failed: "No se pudo crear el dominio. Inténtalo de nuevo.",
    project_already_archived: "Ya tienes este dominio archivado para ese país e idioma. Restáuralo para continuar.",
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
      suggestAction={suggestProjectSetup}
      createAction={createProject}
    />
  );
}
