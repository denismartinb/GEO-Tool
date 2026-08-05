"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { deleteProject } from "../../actions";

type DeleteDomainButtonProps = {
  projectId: string;
  domainName: string;
  /** When true, deleting this project should redirect away from its own pages. */
  isCurrentProject: boolean;
};

export function DeleteDomainButton({ projectId, domainName, isCurrentProject }: DeleteDomainButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setOpen(true);
  }

  function closeModal(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (isPending) return;
    setOpen(false);
    setError(null);
  }

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await deleteProject(projectId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (isCurrentProject) {
        router.push("/dashboard");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="dom-delete-btn"
        aria-label={`Eliminar dominio ${domainName}`}
        onClick={openModal}
      >
        <Icon name="trash" size={14} />
      </button>

      {open ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-domain-title-${projectId}`}
          onClick={closeModal}
        >
          <div className="modal-card" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <h2 id={`delete-domain-title-${projectId}`} className="modal-title">
              Eliminar dominio
            </h2>
            <p className="modal-body">
              Vas a eliminar <b>{domainName}</b> de forma <b>permanente e irreversible</b>.
              Se borrarán también todos sus datos asociados: escaneos, prompts, competidores,
              recomendaciones y soluciones generadas. Esta acción no se puede deshacer.
            </p>

            {error ? (
              <p className="feedback error" style={{ marginTop: 0 }}>
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
                disabled={isPending}
              >
                {isPending ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
