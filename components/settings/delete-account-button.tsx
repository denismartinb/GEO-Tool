"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { deleteAccount } from "@/app/dashboard/settings/profile/actions";

export function DeleteAccountButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canConfirm = confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() && !isPending;

  function openModal() {
    setError(null);
    setConfirmEmail("");
    setOpen(true);
  }

  function closeModal() {
    if (isPending) return;
    setOpen(false);
    setError(null);
    setConfirmEmail("");
  }

  function handleConfirm() {
    if (!canConfirm) return;
    startTransition(async () => {
      const result = await deleteAccount(confirmEmail);
      // A successful deletion redirects server-side and never resolves here
      // with a value — only a failure returns.
      if (result && !result.success) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {/* CONSOLE-REDESIGN-1: an outline button, not a filled red one. This
          block is the quiet foot of the page now, not a "Zona de peligro"
          card — the confirmation modal is where the weight belongs. */}
      <Button type="button" variant="outline" className="set-end-btn" onClick={openModal}>
        <Icon name="trash" size={14} />
        Eliminar cuenta
      </Button>

      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onClick={closeModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-account-title" className="modal-title">
              Eliminar cuenta
            </h2>
            <p className="modal-body">
              Esta acción es irreversible. Se eliminarán tu cuenta, todos tus proyectos, escaneos,
              prompts, competidores y recomendaciones.
            </p>

            <div style={{ marginTop: 4 }}>
              <label className="field-label" htmlFor="delete-account-confirm-email">
                Escribe tu email (<b>{email}</b>) para confirmar
              </label>
              <input
                id="delete-account-confirm-email"
                className="set-field"
                type="email"
                autoComplete="off"
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
                disabled={isPending}
              />
            </div>

            {error ? (
              <p className="feedback error" style={{ marginTop: 12, marginBottom: 0 }}>
                {error}
              </p>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeModal} disabled={isPending}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleConfirm}
                disabled={!canConfirm}
              >
                {isPending ? "Eliminando…" : "Eliminar cuenta definitivamente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
