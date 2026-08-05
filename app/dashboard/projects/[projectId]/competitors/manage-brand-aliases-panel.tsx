"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { addBrandAliasAction, removeBrandAliasAction } from "../actions";

function AddAliasForm({
  projectId,
  brand,
  onAdded
}: {
  projectId: string;
  brand: string;
  onAdded: () => void;
}) {
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!alias.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addBrandAliasAction({ projectId, alias });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setAlias("");
      onAdded();
    });
  }

  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <label className="field-label" htmlFor="mgba-alias">
        Añadir alias
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          id="mgba-alias"
          type="text"
          className="add-prompts-text-input"
          placeholder={`p. ej. el nombre de un producto de ${brand || "tu marca"}`}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          disabled={isPending}
          style={{ flex: "1 1 220px" }}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={isPending || !alias.trim()}>
          {isPending ? "Añadiendo…" : "Añadir"}
        </button>
      </div>
      {error ? (
        <p className="feedback error" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AliasRow({ projectId, alias, onRemoved }: { projectId: string; alias: string; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeBrandAliasAction({ projectId, alias });
      if (!result.success) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      onRemoved();
    });
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{alias}</div>
        {confirming ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>¿Seguro?</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={confirmRemove} disabled={isPending}>
              {isPending ? "…" : "Sí, quitar"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={isPending}>
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="cm2-btn-mini"
            style={{ background: "var(--neg-soft)", borderColor: "transparent", color: "var(--brand-neg)" }}
            onClick={() => setConfirming(true)}
            aria-label={`Quitar alias ${alias}`}
          >
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>
      {error ? (
        <p className="feedback error" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ManageBrandAliasesPanel({
  projectId,
  brand,
  aliases
}: {
  projectId: string;
  brand: string;
  aliases: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function refresh() {
    router.refresh();
  }

  function closeModal(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setOpen(false);
  }

  const modal = open ? (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="manage-brand-aliases-title" onClick={closeModal}>
      <div
        className="modal-card"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="add-prompts-modal-header">
          <div className="add-prompts-modal-headtext">
            <h2 id="manage-brand-aliases-title" className="modal-title">
              Gestionar alias de marca
            </h2>
            <p className="add-prompts-modal-subtitle">
              Un alias es otro nombre que cuenta como mención de <b>{brand}</b>, además de &ldquo;{brand}&rdquo; en
              sí.
            </p>
          </div>
          <button type="button" className="add-prompts-modal-close" onClick={closeModal} aria-label="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="add-prompts-modal-body">
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6, margin: "0 0 4px" }}>
            La IA no siempre nombra a la empresa: a menudo recomienda directamente su producto. Por ejemplo, cuando
            una IA recomienda &ldquo;Firefox&rdquo; sin decir &ldquo;Mozilla&rdquo;, esa respuesta solo cuenta como
            mención de la marca <b>Mozilla</b> si &ldquo;Firefox&rdquo; está en su lista de alias — si no lo está, la
            puntuación GEO trata esa respuesta como si tu marca no hubiera aparecido. Añade solo nombres que la gente
            realmente usa para referirse a {brand || "tu marca"} o a sus productos: un alias demasiado genérico
            contaría menciones que no son tuyas.
          </p>

          <AddAliasForm projectId={projectId} brand={brand} onAdded={refresh} />

          <div style={{ marginTop: 6 }}>
            <p className="field-label">Alias actuales ({aliases.length})</p>
            {aliases.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "10px 0" }}>
                Todavía no hay ningún alias. Mientras tanto, solo cuenta como mención una respuesta que nombre
                literalmente &ldquo;{brand}&rdquo;.
              </p>
            ) : (
              aliases.map((alias) => <AliasRow key={alias} projectId={projectId} alias={alias} onRemoved={refresh} />)
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className="cm2-manage-btn" onClick={() => setOpen(true)}>
        <Icon name="settings" size={12} />
        Gestionar alias
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
