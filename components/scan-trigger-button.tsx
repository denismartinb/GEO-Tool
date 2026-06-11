"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function ScanTriggerButton({
  projectId,
  disabled,
  label
}: {
  projectId: string;
  disabled?: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    setPending(true);
    setError(false);

    try {
      const response = await fetch(`/api/projects/${projectId}/scan`, { method: "POST" });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <Button type="button" onClick={handleClick} disabled={disabled || pending}>
        {pending ? <span className="btn-spinner" /> : <Icon name="play" size={14} />}
        {pending ? "Escaneando…" : label}
      </Button>
      {error && (
        <p className="field-err" style={{ marginTop: 0 }}>
          No se pudo lanzar el escaneo. Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}
