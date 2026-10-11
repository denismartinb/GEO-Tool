"use client";

import { useTransition } from "react";
import { disconnectSearchConsoleAction } from "../actions";

/** useTransition + a direct action call, the mobile-reliable pattern (server-actions rule). */
export function GscDisconnect({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="gsc-lnk"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("¿Desconectar Search Console de este dominio? Dejarás de ver tu posición en Google.")) return;
        startTransition(() => disconnectSearchConsoleAction(projectId));
      }}
    >
      {pending ? "Desconectando…" : "Desconectar"}
    </button>
  );
}
