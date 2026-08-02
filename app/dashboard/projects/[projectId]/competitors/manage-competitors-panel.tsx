"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { createCompetitorAction, deactivateCompetitorAction, updateCompetitorAction } from "../actions";

type CompetitorSummary = { id: string; name: string; domain: string };

function AddCompetitorForm({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCompetitorAction({ projectId, name, domain });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setName("");
      setDomain("");
      onAdded();
    });
  }

  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <label className="field-label" htmlFor="mgc-name">
        Añadir competidor
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <input
          id="mgc-name"
          type="text"
          className="add-prompts-text-input"
          placeholder="Nombre (p. ej. Leroy Merlin)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          style={{ flex: "1 1 160px" }}
        />
        <input
          type="text"
          className="add-prompts-text-input"
          placeholder="Dominio (p. ej. leroymerlin.es)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          disabled={isPending}
          style={{ flex: "1 1 160px" }}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={isPending || !name.trim() || !domain.trim()}>
          {isPending ? "Añadiendo…" : "Añadir"}
        </button>
      </div>
      {error ? <p className="feedback error" style={{ marginTop: 8 }}>{error}</p> : null}
    </div>
  );
}

function ActiveCompetitorRow({
  projectId,
  competitor,
  onChanged
}: {
  projectId: string;
  competitor: CompetitorSummary;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(competitor.name);
  const [domain, setDomain] = useState(competitor.domain);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveEdit() {
    setError(null);
    startTransition(async () => {
      const result = await updateCompetitorAction({ projectId, competitorId: competitor.id, name, domain });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function confirmDeactivate() {
    startTransition(async () => {
      await deactivateCompetitorAction({ projectId, competitorId: competitor.id });
      onChanged();
    });
  }

  if (editing) {
    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            className="add-prompts-text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            style={{ flex: "1 1 160px" }}
          />
          <input
            type="text"
            className="add-prompts-text-input"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={isPending}
            style={{ flex: "1 1 160px" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit} disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={isPending}>
            Cancelar
          </button>
        </div>
        {error ? <p className="feedback error" style={{ marginTop: 8 }}>{error}</p> : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{competitor.name}</div>
        <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--mono)" }}>{competitor.domain}</div>
      </div>
      {confirming ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>¿Seguro?</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={confirmDeactivate} disabled={isPending}>
            {isPending ? "…" : "Sí, dejar de seguir"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={isPending}>
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="cm2-btn-mini" onClick={() => setEditing(true)} aria-label={`Editar ${competitor.name}`}>
            <Icon name="edit" size={12} />
          </button>
          <button
            type="button"
            className="cm2-btn-mini"
            style={{ background: "var(--neg-soft)", borderColor: "transparent", color: "var(--brand-neg)" }}
            onClick={() => setConfirming(true)}
            aria-label={`Dejar de seguir a ${competitor.name}`}
          >
            <Icon name="trash" size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function InactiveCompetitorRow({ projectId, competitor, onChanged }: { projectId: string; competitor: CompetitorSummary; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reactivate() {
    setError(null);
    startTransition(async () => {
      const result = await createCompetitorAction({ projectId, name: competitor.name, domain: competitor.domain });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)" }}>{competitor.name}</div>
        <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--mono)" }}>{competitor.domain}</div>
        {error ? <p className="feedback error" style={{ marginTop: 4 }}>{error}</p> : null}
      </div>
      <button type="button" className="cm2-btn-mini" onClick={reactivate} disabled={isPending}>
        {isPending ? "…" : "Volver a seguir"}
      </button>
    </div>
  );
}

export function ManageCompetitorsPanel({
  projectId,
  activeCompetitors,
  inactiveCompetitors
}: {
  projectId: string;
  activeCompetitors: CompetitorSummary[];
  inactiveCompetitors: CompetitorSummary[];
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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="manage-competitors-title" onClick={closeModal}>
      <div
        className="modal-card modal-card-wide"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="add-prompts-modal-header">
          <div className="add-prompts-modal-headtext">
            <h2 id="manage-competitors-title" className="modal-title">
              Gestionar competidores
            </h2>
            <p className="add-prompts-modal-subtitle">Añade, edita o deja de seguir competidores.</p>
          </div>
          <button type="button" className="add-prompts-modal-close" onClick={closeModal} aria-label="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="add-prompts-modal-body">
          <AddCompetitorForm projectId={projectId} onAdded={refresh} />

          <div style={{ marginTop: 6 }}>
            <p className="field-label">Activos ({activeCompetitors.length})</p>
            {activeCompetitors.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "10px 0" }}>Ningún competidor activo todavía.</p>
            ) : (
              activeCompetitors.map((c) => <ActiveCompetitorRow key={c.id} projectId={projectId} competitor={c} onChanged={refresh} />)
            )}
          </div>

          {inactiveCompetitors.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <p className="field-label">Inactivos ({inactiveCompetitors.length})</p>
              {inactiveCompetitors.map((c) => (
                <InactiveCompetitorRow key={c.id} projectId={projectId} competitor={c} onChanged={refresh} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className="badge badge-neutral" style={{ cursor: "pointer", border: "none" }} onClick={() => setOpen(true)}>
        <Icon name="settings" size={11} />
        Gestionar
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
