"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function ScanTriggerButton({ disabled, label }: { disabled?: boolean; label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? <span className="btn-spinner" /> : <Icon name="play" size={14} />}
      {pending ? "Escaneando…" : label}
    </Button>
  );
}
