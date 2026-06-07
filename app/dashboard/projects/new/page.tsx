import { OnboardingWizard } from "@/components/onboarding-wizard";
import { createProject, suggestProjectSetup } from "../actions";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    invalid_project_data: "Revisa los datos del proyecto e inténtalo de nuevo.",
    project_creation_failed: "No se pudo crear el proyecto. Inténtalo de nuevo.",
    project_already_archived: "Ya existe un proyecto archivado para ese dominio, país e idioma. Restáuralo para continuar.",
    project_already_active: "Ya existe un proyecto activo para ese dominio, país e idioma."
  };
  const errorMessage = params.error ? errorMessages[params.error] : null;

  return <OnboardingWizard errorMessage={errorMessage} suggestAction={suggestProjectSetup} createAction={createProject} />;
}
