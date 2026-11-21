"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeConnectedApp } from "@/app/dashboard/settings/apps/actions";

export function ConnectedAppRow({ clientId, name, grantedAt }: { clientId: string; name: string; grantedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  if (state === "done") return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", flexWrap: "wrap" }}>
      <div className="set-row-txt">
        <div className="set-end-t">{name}</div>
        <div className="set-end-d">
          {grantedAt ? `Conectada el ${grantedAt}` : "Conectada"}
          {state === "error" ? " · No se ha podido desconectar. Inténtalo de nuevo." : ""}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await revokeConnectedApp(clientId);
            setState(r.success ? "done" : "error");
          })
        }
      >
        {pending ? "Desconectando…" : "Desconectar"}
      </Button>
    </div>
  );
}
