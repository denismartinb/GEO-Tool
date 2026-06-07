import Link from "next/link";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { Icon } from "@/components/ui/icon";
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

  return (
    <div className="page mx-auto max-w-4xl space-y-4">
      <p className="kicker">Dominios</p>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="title-lg">Nuevo dominio</h1>
          <p className="sub mt-1">Configura un dominio, sus competidores y los primeros prompts en un flujo guiado.</p>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-2)]">
          <Icon name="chevronLeft" size={14} />
          Volver
        </Link>
      </div>

      <OnboardingWizard errorMessage={errorMessage} suggestAction={suggestProjectSetup} createAction={createProject} />
    </div>
  );
}
