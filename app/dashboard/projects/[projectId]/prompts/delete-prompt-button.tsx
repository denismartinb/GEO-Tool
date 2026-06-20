"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { deactivatePrompt } from "../actions";

type DeletePromptButtonProps = {
  projectId: string;
  promptId: string;
  onDeleted: () => void;
};

export function DeletePromptButton({ projectId, promptId, onDeleted }: DeletePromptButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  function closeModal(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (isPending) return;
    setOpen(false);
  }

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("promptId", promptId);
      await deactivatePrompt(formData);
      setOpen(false);
      onDeleted();
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="drawer-delete-btn" aria-label="Borrar prompt" onClick={openModal}>
        <Icon name="trash" size={14} />
      </button>

      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-prompt-title" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <h2 id="delete-prompt-title" className="modal-title">
              Borrar prompt
            </h2>
            <p className="modal-body">
              Vas a desactivar este prompt de forma <b>permanente</b>. Dejará de incluirse en los próximos
              escaneos. Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeModal} disabled={isPending}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={handleConfirm} disabled={isPending}>
                {isPending ? "Borrando…" : "Borrar prompt"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
