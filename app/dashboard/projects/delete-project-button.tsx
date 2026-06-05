"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { deleteProject } from "./actions";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  function handleClick() {
    if (
      confirm(
        "¿Eliminar este proyecto? Esta acción es irreversible y borrará todos los escaneos, prompts, competidores y datos asociados.",
      )
    ) {
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={deleteProject}>
      <input type="hidden" name="projectId" value={projectId} />
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        className="text-[var(--neg)] hover:border-[var(--neg)] hover:text-[var(--neg-ink)]"
      >
        Eliminar
      </Button>
    </form>
  );
}
