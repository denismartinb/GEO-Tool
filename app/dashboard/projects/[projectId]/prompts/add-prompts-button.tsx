"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { addPrompts } from "../actions";

type Method = "auto" | "keywords" | "manual";
type Step = "select" | "detail";

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
    desc: "Escribe tus propios prompts; la IA les asigna categoría y los escanea."
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setStep("select");
    setMethod(null);
    setKeywordInput("");
    setKeywords([]);
    setManualDraft("");
    setManualPrompts([]);
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

  function handleSubmit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!method || !canSubmit) return;
    setError(null);

    startTransition(async () => {
      const response = await addPrompts({
        projectId,
        mode: method,
        keywords: method === "keywords" ? keywords : undefined,
        manualPrompts: method === "manual" ? manualPrompts : undefined
      });

      if (!response.success) {
        setError(response.error);
        return;
      }

      setOpen(false);
      reset();

      const params = new URLSearchParams();
      params.set("promptsAdded", String(response.addedCount));
      params.set("scanLaunched", response.scanLaunched ? "true" : "false");
      if (response.scanWarning) params.set("scanWarning", response.scanWarning);
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const canSubmit =
    method === "auto" ? true : method === "keywords" ? keywords.length > 0 : method === "manual" ? manualPrompts.length > 0 : false;

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
                    <span className="add-prompts-stat-pill">
                      <Icon name="bolt" size={13} /> 2 motores de IA
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
                    Escribe tus propios prompts. La IA les asignará categoría automáticamente antes de escanearlos.
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
