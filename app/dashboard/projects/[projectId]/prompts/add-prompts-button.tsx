"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { addPrompts } from "../actions";
import type { AddPromptsResult } from "@/lib/projects/add-prompts";

type Method = "auto" | "keywords" | "manual";

// Mirrors MAX_REAL_SCAN_PROMPTS (lib/scan/constants.ts) — that file is
// server-only and cannot be imported from this client component. The server
// action re-validates the real cap regardless of this UI-only limit.
const MAX_MANUAL_PROMPTS = 6;

const METHODS: Array<{ id: Method; icon: string; title: string; desc: string }> = [
  {
    id: "auto",
    icon: "sparkles",
    title: "Generación automática",
    desc: "La IA inventa 5 prompts nuevos relevantes para tu marca."
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
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [manualPrompts, setManualPrompts] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddPromptsResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setMethod(null);
    setKeywordInput("");
    setKeywords([]);
    setManualPrompts([""]);
    setError(null);
    setResult(null);
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
    const wasSuccess = result?.success ?? false;
    setOpen(false);
    reset();
    if (wasSuccess) {
      router.refresh();
    }
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

  function updateManualPrompt(index: number, value: string) {
    setManualPrompts((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function addManualRow() {
    setManualPrompts((prev) => (prev.length >= MAX_MANUAL_PROMPTS ? prev : [...prev, ""]));
  }

  function removeManualRow(index: number) {
    setManualPrompts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function handleSubmit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!method) return;
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

      setResult(response);
    });
  }

  const canSubmit =
    method === "auto" ? true : method === "keywords" ? keywords.length > 0 : method === "manual" ? manualPrompts.some((p) => p.trim().length > 0) : false;

  return (
    <>
      <Button type="button" onClick={openModal} disabled={disabled} title={disabled ? disabledReason : undefined}>
        <Icon name="plus" size={14} />
        Añadir prompts
      </Button>

      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="add-prompts-title" onClick={closeModal}>
          <div
            className="modal-card modal-card-wide"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {result?.success ? (
              <>
                <h2 id="add-prompts-title" className="modal-title">
                  Prompts añadidos
                </h2>
                <p className="modal-body">
                  Se {result.addedCount === 1 ? "ha añadido 1 prompt nuevo" : `han añadido ${result.addedCount} prompts nuevos`}.{" "}
                  {result.scanLaunched ? "Se ha lanzado un escaneo restringido a estos prompts nuevos." : result.scanWarning}
                </p>
                <div className="modal-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={closeModal}>
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="add-prompts-title" className="modal-title">
                  Añadir prompts
                </h2>
                <p className="modal-body">Elige cómo quieres generar los nuevos prompts.</p>

                <div className="add-prompts-methods">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`add-prompts-method-card${method === m.id ? " active" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMethod(m.id);
                      }}
                      disabled={isPending}
                    >
                      <span className="add-prompts-method-icon">
                        <Icon name={m.icon} size={18} />
                      </span>
                      <span className="add-prompts-method-title">{m.title}</span>
                      <span className="add-prompts-method-desc">{m.desc}</span>
                    </button>
                  ))}
                </div>

                {method === "keywords" ? (
                  <div style={{ marginTop: 16 }}>
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
                  </div>
                ) : null}

                {method === "manual" ? (
                  <div style={{ marginTop: 16 }}>
                    <label className="field-label">Prompts</label>
                    {manualPrompts.map((value, index) => (
                      <div key={index} className="add-prompts-manual-row">
                        <textarea
                          className="add-prompts-text-input"
                          rows={2}
                          placeholder="Escribe el prompt completo…"
                          value={value}
                          onChange={(e) => updateManualPrompt(index, e.target.value)}
                          disabled={isPending}
                        />
                        <button
                          type="button"
                          className="add-prompts-manual-remove"
                          onClick={(e) => {
                            e.preventDefault();
                            removeManualRow(index);
                          }}
                          disabled={isPending || manualPrompts.length <= 1}
                          aria-label="Quitar prompt"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    ))}
                    {manualPrompts.length < MAX_MANUAL_PROMPTS ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 8 }}
                        onClick={(e) => {
                          e.preventDefault();
                          addManualRow();
                        }}
                        disabled={isPending}
                      >
                        <Icon name="plus" size={12} />
                        Añadir otro prompt
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {error ? (
                  <p className="feedback error" style={{ marginTop: 14 }}>
                    {error}
                  </p>
                ) : null}

                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={closeModal} disabled={isPending}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={isPending || !method || !canSubmit}>
                    {isPending ? (
                      <>
                        <span className="btn-spinner" /> Generando…
                      </>
                    ) : (
                      "Generar prompts"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
