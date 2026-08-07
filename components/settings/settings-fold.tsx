"use client";

import { useState, type ReactNode } from "react";

/**
 * CONSOLE-REDESIGN-1. The collapsed "optional block" used twice inside Cuenta:
 * «Datos de empresa» and «Datos de facturación».
 *
 * Shared rather than duplicated because the founder asked for the second one to
 * be "un acordeón similar a datos de empresa" (2026-08-06) — identical chrome is
 * the requirement, so two copies of the markup would be two things to drift.
 *
 * A real `aria-expanded` button rather than <details>/<summary> so the pilot's
 * interaction sweep can find and open it (same reason as the notifications
 * bell, log §28).
 */
export function SettingsFold({
  id,
  title,
  hint,
  children
}: {
  /** Used for the body's DOM id, so `aria-controls` points at something real. */
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = `${id}-body`;

  return (
    <div className="set-fold">
      <button
        type="button"
        className="set-fold-h"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`set-caret ${open ? "open" : ""}`} aria-hidden="true" />
        <span className="set-fold-t">{title}</span>
        {hint && <span className="set-fold-d">{hint}</span>}
      </button>

      {open && (
        <div className="set-fold-b" id={bodyId}>
          {children}
        </div>
      )}
    </div>
  );
}
