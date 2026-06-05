"use client";

import { Button } from "@/components/ui/button";
import { deleteProject } from "./actions";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (
      !confirm(
        "¿Eliminar este proyecto? Esta acción es irreversible y borrará todos los escaneos, prompts, competidores y datos asociados.",
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <form action={deleteProject} onSubmit={handleSubmit}>
      <input type="hidden" name="projectId" value={projectId} />
      <Button
        type="submit"
        variant="outline"
        className="text-[var(--neg)] hover:border-[var(--neg)] hover:text-[var(--neg-ink)]"
      >
        Eliminar
      </Button>
    </form>
  );
}
