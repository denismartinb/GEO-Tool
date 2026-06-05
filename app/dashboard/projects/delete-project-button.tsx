"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteProject } from "./actions";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        "¿Eliminar este proyecto? Esta acción es irreversible y borrará todos los escaneos, prompts, competidores y datos asociados.",
      )
    )
      return;
    const formData = new FormData();
    formData.append("projectId", projectId);
    startTransition(() => deleteProject(formData));
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={isPending}
      className="text-[var(--neg)] hover:border-[var(--neg)] hover:text-[var(--neg-ink)]"
    >
      {isPending ? "Eliminando…" : "Eliminar"}
    </Button>
  );
}
