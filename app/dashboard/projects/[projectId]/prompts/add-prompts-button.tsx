"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { addPrompts, addReviewedPrompts, generatePromptProposals } from "../actions";

type Method = "auto" | "keywords" | "manual";
type Step = "select" | "detail" | "review";

// PROMPTS-REVIEW-1: generated prompts are shown for review before anything is
// saved. Mirrors MIN/MAX_PROMPT_LENGTH in lib/projects/add-prompts.ts, which
// re-checks them on save.
const MIN_PROMPT_LENGTH = 10;
const MAX_PROMPT_LENGTH = 300;

type Proposal = { text: string; category: string; selected: boolean; editing: boolean; draft: string };

// Mirrors MAX_REAL_SCAN_PROMPTS (lib/scan/constants.ts) — that file is
// server-only and cannot be imported from this client component. The server
// action re-validates the real cap regardless of this UI-only limit.
const MAX_MANUAL_PROMPTS = 10;

const METHODS: Array<{ id: Method; icon: string; title: string; desc: string }> = [
  {
    id: "auto",
    icon: "sparkles",
    title: "Generación automática",
    desc: "La IA genera 5 prompts nuevos relevantes para tu marca."
  },
  {
    id: "keywords",
    icon: "search",
    title: "Basado en keywords",
    desc: "Indica palabras clave y la IA genera 5 prompts a partir de ellas."
  },
  {
    id: "manual",
    icon: "prompts",
    title: "Manual",
    desc: "Escribe tus propios prompts; la IA les asigna tema y los escanea."
  }
];

export function AddPromptsButton({
  projectId,
  disabled,
  disabledReason
}: {
  projectId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [method, setMethod] = useState<Method | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [manualDraft, setManualDraft] = useState("");
  const [manualPrompts, setManualPrompts] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [remainingSlots, setRemainingSlots] = useState(0);
  const [busy, setBusy] = useState<"generate" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setStep("select");
    setMethod(null);
    setKeywordInput("");
    setKeywords([]);
    setManualDraft("");
    setManualPrompts([]);
    setProposals([]);
    setRemainingSlots(0);
    setError(null);
  }

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    reset();
    setOpen(true);
  }

  function closeModal(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (isPending) return;
    setOpen(false);
    reset();
  }

  function selectMethod(id: Method) {
    setMethod(id);
    setStep("detail");
    setError(null);
  }

  function goToSelect(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (isPending) return;
    setStep("select");
    setError(null);
  }

  function addKeyword() {
    const trimmed = keywordInput.trim();
    if (!trimmed || keywords.includes(trimmed)) {
      setKeywordInput("");
      return;
    }
    setKeywords((prev) => [...prev, trimmed]);
    setKeywordInput("");
  }

  function removeKeyword(value: string) {
    setKeywords((prev) => prev.filter((k) => k !== value));
  }

  function addManualPrompt() {
    const trimmed = manualDraft.trim();
    if (!trimmed || manualPrompts.length >= MAX_MANUAL_PROMPTS) {
      setManualDraft("");
      return;
    }
    setManualPrompts((prev) => [...prev, trimmed]);
    setManualDraft("");
  }

  function removeManualPrompt(index: number) {
    setManualPrompts((prev) => prev.filter((_, i) => i !== index));
  }

  function finish(response: { addedCount: number; scanLaunched: boolean; scanWarning?: string }) {
    setOpen(false);
    reset();

    const params = new URLSearchParams();
    params.set("promptsAdded", String(response.addedCount));
    params.set("scanLaunched", response.scanLaunched ? "true" : "false");
    if (response.scanWarning) params.set("scanWarning", response.scanWarning);
    router.push(`${pathname}?${params.toString()}`);
  }

  function generate() {
    if (method !== "auto" && method !== "keywords") return;
    setError(null);
    setBusy("generate");
    startTransition(async () => {
      const response = await generatePromptProposals({
        projectId,
        mode: method,
        keywords: method === "keywords" ? keywords : undefined
      });
      if (!response.success) {
        setError(response.error);
        return;
      }
      setRemainingSlots(response.remainingSlots);
      setProposals(
        response.proposals.map((p, i) => ({
          text: p.text,
          category: p.category,
          selected: i < response.remainingSlots,
          editing: false,
          draft: p.text
        }))
      );
      setStep("review");
    });
  }

  function updateProposal(index: number, patch: Partial<Proposal>) {
    setProposals((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function toggleProposal(index: number) {
    const target = proposals[index];
    if (!target) return;
    if (!target.selected && selectedCount >= remainingSlots) return;
    updateProposal(index, { selected: !target.selected });
  }

  function saveEdit(index: number) {
    const target = proposals[index];
    if (!target) return;
    const text = target.draft.trim().replace(/\s+/g, " ");
    if (text.length < MIN_PROMPT_LENGTH || text.length > MAX_PROMPT_LENGTH) return;
    updateProposal(index, { text, draft: text, editing: false });
  }

  function submitReviewed(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const chosen = proposals.filter((p) => p.selected).map((p) => ({ text: p.text, category: p.category }));
    if (!chosen.length || anyEditing) return;
    setError(null);
    setBusy("add");
    startTransition(async () => {
      const response = await addReviewedPrompts({ projectId, prompts: chosen });
      if (!response.success) {
        setError(response.error);
        return;
      }
      finish(response);
    });
  }

  function backToDetail(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (isPending) return;
    setStep("detail");
    setProposals([]);
    setError(null);
  }

  function handleSubmit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!method || !canSubmit) return;
    if (method !== "manual") {
      generate();
      return;
    }
    setError(null);

    startTransition(async () => {
      const response = await addPrompts({
        projectId,
        mode: "manual",
        manualPrompts
      });

      if (!response.success) {
        setError(response.error);
        return;
      }

      finish(response);
    });
  }

  const canSubmit =
    method === "auto" ? true : method === "keywords" ? keywords.length > 0 : method === "manual" ? manualPrompts.length > 0 : false;

  const selectedCount = proposals.filter((p) => p.selected).length;
  const anyEditing = proposals.some((p) => p.selected && p.editing);
  const atSlotLimit = selectedCount >= remainingSlots;

  const activeMethod = METHODS.find((m) => m.id === method) ?? null;

  const ctaLabel =
    method === "manual"
      ? `+ Añadir ${manualPrompts.length} prompt${manualPrompts.length === 1 ? "" : "s"}`
      : "Generar prompts";

  const modal = open ? (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="add-prompts-title" onClick={closeModal}>
      <div
        className="modal-card modal-card-wide"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {step === "select" ? (
          <>
            <div className="add-prompts-modal-header">
              <div className="add-prompts-modal-headtext">
                <h2 id="add-prompts-title" className="modal-title">
                  Añadir prompts
                </h2>
                <p className="add-prompts-modal-subtitle">Elige cómo quieres generar los nuevos prompts.</p>
              </div>
              <button type="button" className="add-prompts-modal-close" onClick={closeModal} aria-label="Cerrar">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="add-prompts-modal-body">
              <div className="add-prompts-methods">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="add-prompts-method-card"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectMethod(m.id);
                    }}
                  >
                    <span className="add-prompts-method-head">
                      <span className="add-prompts-method-icon">
                        <Icon name={m.icon} size={15} />
                      </span>
                      <span className="add-prompts-method-title">{m.title}</span>
                      <Icon name="chevronLeft" size={14} className="add-prompts-method-chevron" />
                    </span>
                    <span className="add-prompts-method-desc">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : step === "review" ? (
          <>
            <div className="add-prompts-modal-header">
              <button type="button" className="add-prompts-modal-back" onClick={backToDetail} aria-label="Volver" disabled={isPending}>
                <Icon name="chevronLeft" size={18} />
              </button>
              <div className="add-prompts-modal-headtext">
                <h2 id="add-prompts-title" className="modal-title">
                  Revisa los prompts
                </h2>
                <p className="add-prompts-modal-subtitle">Desmarca los que no quieras y edita el texto si hace falta.</p>
              </div>
              <button type="button" className="add-prompts-modal-close" onClick={closeModal} aria-label="Cerrar" disabled={isPending}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="add-prompts-modal-body">
              {remainingSlots < proposals.length ? (
                <p className="add-prompts-review-note">
                  Tu plan admite {remainingSlots} prompt{remainingSlots === 1 ? "" : "s"} más. Elige cuáles añadir.
                </p>
              ) : null}
              <div className="add-prompts-review-meta">
                <span className="add-prompts-stat-pill">
                  {selectedCount} de {proposals.length} seleccionados
                </span>
                <button
                  type="button"
                  className="add-prompts-review-regen"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    generate();
                  }}
                  disabled={isPending}
                >
                  {isPending && busy === "generate" ? "Generando…" : "Volver a generar"}
                </button>
              </div>
              <ul className="add-prompts-manual-list add-prompts-review-list">
                {proposals.map((p, index) => {
                  const checkboxId = `add-prompts-review-${index}`;
                  const blocked = !p.selected && atSlotLimit;
                  const draftLength = p.draft.trim().length;
                  const draftValid = draftLength >= MIN_PROMPT_LENGTH && draftLength <= MAX_PROMPT_LENGTH;
                  return (
                    <li key={index} className={`add-prompts-manual-item${p.selected ? "" : " is-off"}`}>
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="add-prompts-review-check"
                        checked={p.selected}
                        onChange={() => toggleProposal(index)}
                        disabled={isPending || blocked}
                        aria-label={`Añadir «${p.text}»`}
                        title={blocked ? "Has llegado al tope de tu plan" : undefined}
                      />
                      <div className="add-prompts-review-main">
                        {p.editing ? (
                          <>
                            <textarea
                              className="add-prompts-text-input"
                              rows={2}
                              value={p.draft}
                              maxLength={MAX_PROMPT_LENGTH}
                              onChange={(e) => updateProposal(index, { draft: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit(index);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateProposal(index, { draft: p.text, editing: false });
                                }
                              }}
                              aria-label="Editar prompt"
                              autoFocus
                              disabled={isPending}
                            />
                            <div className="add-prompts-review-edit-actions">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  saveEdit(index);
                                }}
                                disabled={isPending || !draftValid}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  updateProposal(index, { draft: p.text, editing: false });
                                }}
                                disabled={isPending}
                              >
                                Cancelar
                              </button>
                              {!draftValid ? (
                                <span className="add-prompts-review-hint">
                                  Entre {MIN_PROMPT_LENGTH} y {MAX_PROMPT_LENGTH} caracteres.
                                </span>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <label htmlFor={checkboxId} className="add-prompts-manual-item-text">
                            {p.text}
                          </label>
                        )}
                        {p.category ? <span className="add-prompts-review-topic">Tema: {p.category}</span> : null}
                      </div>
                      {!p.editing ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm add-prompts-review-edit"
                          onClick={(e) => {
                            e.preventDefault();
                            updateProposal(index, { editing: true, draft: p.text });
                          }}
                          disabled={isPending}
                        >
                          Editar
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {error ? <p className="feedback error" style={{ marginTop: 14 }}>{error}</p> : null}
            </div>

            <div className="add-prompts-modal-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={backToDetail} disabled={isPending}>
                <Icon name="chevronLeft" size={14} />
                Atrás
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={submitReviewed}
                disabled={isPending || selectedCount === 0 || anyEditing}
                title={anyEditing ? "Guarda o cancela la edición antes de añadir" : undefined}
              >
                {isPending ? (
                  <>
                    <span className="btn-spinner" /> {busy === "generate" ? "Generando…" : "Añadiendo…"}
                  </>
                ) : (
                  `Añadir ${selectedCount} prompt${selectedCount === 1 ? "" : "s"}`
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="add-prompts-modal-header">
              <button type="button" className="add-prompts-modal-back" onClick={goToSelect} aria-label="Volver" disabled={isPending}>
                <Icon name="chevronLeft" size={18} />
              </button>
              <div className="add-prompts-modal-headtext">
                <h2 id="add-prompts-title" className="modal-title">
                  {activeMethod?.title}
                </h2>
                <p className="add-prompts-modal-subtitle">Configura y genera tus nuevos prompts</p>
              </div>
              <button type="button" className="add-prompts-modal-close" onClick={closeModal} aria-label="Cerrar" disabled={isPending}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="add-prompts-modal-body">
              {method === "auto" ? (
                <>
                  <p className="add-prompts-modal-desc">
                    La IA genera 5 prompts nuevos relevantes para tu marca, sin repetir los que ya tienes activos.
                  </p>
                  <div className="add-prompts-stats-row">
                    <span className="add-prompts-stat-pill">
                      <Icon name="sparkles" size={13} /> 5 prompts nuevos
                    </span>
                    {/* Engine count is plan-dependent (Free scans with 1,
                        paid plans with 3) — keep this pill count-free so it
                        stays true for every plan without loading usage here. */}
                    <span className="add-prompts-stat-pill">
                      <Icon name="bolt" size={13} /> Todos tus motores de IA
                    </span>
                  </div>
                </>
              ) : null}

              {method === "keywords" ? (
                <>
                  <p className="add-prompts-modal-desc">
                    Indica palabras clave y la IA generará 5 prompts nuevos a partir de ellas.
                  </p>
                  <label className="field-label" htmlFor="add-prompts-keyword-input">
                    Palabras clave
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="add-prompts-keyword-input"
                      type="text"
                      className="add-prompts-text-input"
                      placeholder="p. ej. precios, alternativas, integración"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      disabled={isPending}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        addKeyword();
                      }}
                      disabled={isPending}
                    >
                      Añadir
                    </button>
                  </div>
                  {keywords.length > 0 ? (
                    <div className="add-prompts-keyword-tags">
                      {keywords.map((k) => (
                        <span key={k} className="add-prompts-keyword-tag">
                          {k}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              removeKeyword(k);
                            }}
                            disabled={isPending}
                            aria-label={`Quitar ${k}`}
                          >
                            <Icon name="x" size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}

              {method === "manual" ? (
                <>
                  <p className="add-prompts-modal-desc">
                    Escribe tus propios prompts. La IA les asignará tema automáticamente antes de escanearlos.
                  </p>
                  <label className="field-label" htmlFor="add-prompts-manual-input">
                    Nuevo prompt
                  </label>
                  <div className="add-prompts-manual-row">
                    <textarea
                      id="add-prompts-manual-input"
                      className="add-prompts-text-input"
                      rows={2}
                      placeholder="Escribe el prompt completo…"
                      value={manualDraft}
                      onChange={(e) => setManualDraft(e.target.value)}
                      disabled={isPending}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        addManualPrompt();
                      }}
                      disabled={isPending || !manualDraft.trim() || manualPrompts.length >= MAX_MANUAL_PROMPTS}
                    >
                      <Icon name="plus" size={12} />
                      Añadir
                    </button>
                  </div>

                  {manualPrompts.length === 0 ? (
                    <div className="add-prompts-manual-empty">Aún no has añadido ningún prompt.</div>
                  ) : (
                    <ul className="add-prompts-manual-list">
                      {manualPrompts.map((text, index) => (
                        <li key={index} className="add-prompts-manual-item">
                          <span className="add-prompts-manual-item-text">{text}</span>
                          <button
                            type="button"
                            className="add-prompts-manual-remove"
                            onClick={(e) => {
                              e.preventDefault();
                              removeManualPrompt(index);
                            }}
                            disabled={isPending}
                            aria-label="Quitar prompt"
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {manualPrompts.length >= MAX_MANUAL_PROMPTS ? (
                    <p className="add-prompts-manual-limit">Máximo {MAX_MANUAL_PROMPTS} prompts por envío.</p>
                  ) : null}
                </>
              ) : null}

              {error ? <p className="feedback error" style={{ marginTop: 14 }}>{error}</p> : null}
            </div>

            <div className="add-prompts-modal-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={goToSelect} disabled={isPending}>
                <Icon name="chevronLeft" size={14} />
                Atrás
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={isPending || !canSubmit}>
                {isPending ? (
                  <>
                    <span className="btn-spinner" /> {method === "manual" ? "Añadiendo…" : "Generando…"}
                  </>
                ) : (
                  ctaLabel
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button type="button" onClick={openModal} disabled={disabled} title={disabled ? disabledReason : undefined}>
        <Icon name="plus" size={14} />
        Añadir prompts
      </Button>

      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
