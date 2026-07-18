"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type Feedback = "none" | "failed" | "active_run";

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
  const [feedback, setFeedback] = useState<Feedback>("none");

  async function handleClick() {
    setPending(true);
    setFeedback("none");

    try {
      const response = await fetch(`/api/projects/${projectId}/scan`, { method: "POST" });
      if (!response.ok) {
        const body: { error?: string } | null = await response.json().catch(() => null);
        if (body?.error === "active_run_exists") {
          // Not a failure: a scan is already running for this project.
          // Refresh so the in-progress banner (and the disabled state) show
          // the real situation instead of a misleading generic error.
          setFeedback("active_run");
          router.refresh();
          return;
        }
        setFeedback("failed");
        return;
      }
      router.refresh();
    } catch {
      setFeedback("failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <Button type="button" onClick={handleClick} disabled={disabled || pending}>
        {pending ? <span className="btn-spinner" /> : <Icon name="play" size={14} />}
        {pending ? "Lanzando…" : label}
      </Button>
      {feedback === "failed" && (
        <p className="field-err" style={{ marginTop: 0 }}>
          No se pudo lanzar el escaneo. Inténtalo de nuevo.
        </p>
      )}
      {feedback === "active_run" && (
        <p style={{ marginTop: 0, fontSize: "12.5px", fontWeight: 600, color: "var(--ink-4)" }}>
          Ya hay un escaneo en curso para este dominio.
        </p>
      )}
    </div>
  );
}
