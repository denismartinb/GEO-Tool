"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { Sheet, SheetHead } from "@/components/ins/kit/sheet";
import { addPrompts, addReviewedPrompts, generatePromptProposals } from "@/app/dashboard/projects/[projectId]/actions";

type Method = "auto" | "keywords" | "manual";
type Step = "method" | "detail" | "review";

// Mirrors MIN/MAX_PROMPT_LENGTH in lib/projects/add-prompts.ts, which re-checks
// them on save (PROMPTS-REVIEW-1, log §305).
const MIN_PROMPT_LENGTH = 10;
const MAX_PROMPT_LENGTH = 300;
// Mirrors MAX_REAL_SCAN_PROMPTS (lib/scan/constants.ts, server-only). The
// server action re-validates the real cap regardless of this UI limit.
const MAX_MANUAL_PROMPTS = 10;

type Proposal = { text: string; category: string; selected: boolean; editing: boolean; draft: string };

const METHODS: Array<{ id: Method; icon: string; title: string; desc: string }> = [
  { id: "auto", icon: "sparkles", title: "Generación automática", desc: "La IA genera 5 prompts nuevos relevantes para tu marca." },
  { id: "keywords", icon: "search", title: "Basado en keywords", desc: "Indica palabras clave y la IA genera 5 prompts a partir de ellas." },
  { id: "manual", icon: "prompts", title: "Manual", desc: "Escribe tus propios prompts; la IA les asigna tema y los escanea." },
];

const STEP_LABELS = ["Método", "Detalle", "Revisión"];

/**
 * «Añadir prompts» in the «Instrumento» system (CONSOLE-INSTRUMENTO-1 F5,
 * log §360): the same three methods and the same server actions as before, in
 * the shared side sheet. Nothing is saved before the review step, and the plan
 * cap bar counts only what the person has ticked.
 */
export function InsAddPrompts({
  projectId,
  used,
  limit,
  disabled,
  disabledReason,
  className = "btn ink",
}: {
  projectId: string;
  used: number;
  limit: number;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [manualDraft, setManualDraft] = useState("");
  const [manualPrompts, setManualPrompts] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [remainingSlots, setRemainingSlots] = useState(0);
  const [busy, setBusy] = useState<"generate" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep("method");
    setMethod(null);
    setKeywordInput("");
    setKeywords([]);
    setManualDraft("");
    setManualPrompts([]);
    setProposals([]);
    setRemainingSlots(0);
    setError(null);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  function finish(r: { addedCount: number; scanLaunched: boolean; scanWarning?: string }) {
    setOpen(false);
    reset();
    const params = new URLSearchParams();
    params.set("promptsAdded", String(r.addedCount));
    params.set("scanLaunched", r.scanLaunched ? "true" : "false");
    if (r.scanWarning) params.set("scanWarning", r.scanWarning);
    router.push(`${pathname}?${params.toString()}`);
  }

  function addKeyword() {
    const v = keywordInput.trim();
    if (v && !keywords.includes(v)) setKeywords((p) => [...p, v]);
    setKeywordInput("");
  }

  function addManual() {
    const v = manualDraft.trim();
    if (v && manualPrompts.length < MAX_MANUAL_PROMPTS) setManualPrompts((p) => [...p, v]);
    setManualDraft("");
  }

  function generate() {
    if (method !== "auto" && method !== "keywords") return;
    setError(null);
    setBusy("generate");
    startTransition(async () => {
      const r = await generatePromptProposals({
        projectId,
        mode: method,
        keywords: method === "keywords" ? keywords : undefined,
      });
      if (!r.success) {
        setError(r.error);
        return;
      }
      setRemainingSlots(r.remainingSlots);
      setProposals(
        r.proposals.map((p, i) => ({
          text: p.text,
          category: p.category,
          selected: i < r.remainingSlots,
          editing: false,
          draft: p.text,
        })),
      );
      setStep("review");
    });
  }

  function patch(i: number, change: Partial<Proposal>) {
    setProposals((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...change } : p)));
  }

  function saveEdit(i: number) {
    const target = proposals[i];
    if (!target) return;
    const text = target.draft.trim().replace(/\s+/g, " ");
    if (text.length < MIN_PROMPT_LENGTH || text.length > MAX_PROMPT_LENGTH) return;
    patch(i, { text, draft: text, editing: false });
  }

  const selected = proposals.filter((p) => p.selected).length;
  const anyEditing = proposals.some((p) => p.selected && p.editing);
  const atSlotLimit = selected >= remainingSlots;

  function submitReviewed() {
    const chosen = proposals.filter((p) => p.selected).map((p) => ({ text: p.text, category: p.category }));
    if (!chosen.length || anyEditing) return;
    setError(null);
    setBusy("add");
    startTransition(async () => {
      const r = await addReviewedPrompts({ projectId, prompts: chosen });
      if (!r.success) {
        setError(r.error);
        return;
      }
      finish(r);
    });
  }

  function submitManual() {
    if (!manualPrompts.length) return;
    setError(null);
    setBusy("add");
    startTransition(async () => {
      const r = await addPrompts({ projectId, mode: "manual", manualPrompts });
      if (!r.success) {
        setError(r.error);
        return;
      }
      finish(r);
    });
  }

  const canContinue = method === "auto" ? true : method === "keywords" ? keywords.length > 0 : manualPrompts.length > 0;
  const stepIndex = step === "method" ? 0 : step === "detail" ? 1 : 2;
  const adding = step === "review" ? selected : method === "manual" ? manualPrompts.length : 0;
  const free = Math.max(limit - used, 0);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Ic n="plus" sm /> Añadir prompts
      </button>

      {open ? (
        <Sheet label="Añadir prompts" onClose={close}>
          <SheetHead title="Añadir prompts" kicker={<span className="kicker">Nuevos prompts</span>} onClose={close} />
          <div className="psh-b">
            <div className="ap-steps" aria-label={`Paso ${stepIndex + 1} de 3`}>
              {STEP_LABELS.map((label, i) => (
                <span key={label} className={i < stepIndex ? "done" : i === stepIndex ? "cur" : ""}>
                  <i />
                  {label}
                </span>
              ))}
            </div>

            {step !== "method" ? (
              <button
                type="button"
                className="btn ghost sm ap-back"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  if (step === "review") {
                    setProposals([]);
                    setStep("detail");
                  } else setStep("method");
                }}
              >
                <Ic n="chevl" sm /> Atrás
              </button>
            ) : null}

            {step === "method" ? (
              <>
                <p className="ap-sub" style={{ marginTop: 14 }}>
                  Elige cómo quieres generar los nuevos prompts.
                </p>
                <div className="ap-ms">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="ap-m"
                      onClick={() => {
                        setMethod(m.id);
                        setStep("detail");
                        setError(null);
                      }}
                    >
                      <Ic n={m.icon} />
                      <span>
                        <b>{m.title}</b>
                        <span>{m.desc}</span>
                      </span>
                      <Ic n="chevr" sm />
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === "detail" && method === "auto" ? (
              <p className="ap-p">
                La IA genera 5 prompts nuevos relevantes para tu marca, sin repetir los que ya tienes activos. Los verás
                antes de guardarlos.
              </p>
            ) : null}

            {step === "detail" && method === "keywords" ? (
              <>
                <p className="ap-p">Indica palabras clave y la IA generará 5 prompts nuevos a partir de ellas.</p>
                <label className="ap-lbl" htmlFor="ap-kw">
                  Palabras clave
                </label>
                <div className="ap-in">
                  <input
                    id="ap-kw"
                    className="ap-input"
                    placeholder="p. ej. precios, alternativas, integración"
                    value={keywordInput}
                    disabled={pending}
                    data-autofocus
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                  />
                  <button type="button" className="btn line sm" disabled={pending || !keywordInput.trim()} onClick={addKeyword}>
                    Añadir
                  </button>
                </div>
                {keywords.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {keywords.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="chip on"
                        disabled={pending}
                        aria-label={`Quitar ${k}`}
                        onClick={() => setKeywords((p) => p.filter((x) => x !== k))}
                      >
                        {k} <Ic n="x" sm />
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {step === "detail" && method === "manual" ? (
              <>
                <p className="ap-p">Escribe tus propios prompts. La IA les asignará tema antes de escanearlos.</p>
                <label className="ap-lbl" htmlFor="ap-manual">
                  Nuevo prompt
                </label>
                <div className="ap-in">
                  <textarea
                    id="ap-manual"
                    className="ap-input"
                    rows={2}
                    placeholder="Escribe el prompt completo…"
                    value={manualDraft}
                    disabled={pending}
                    data-autofocus
                    onChange={(e) => setManualDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn line sm"
                    disabled={pending || !manualDraft.trim() || manualPrompts.length >= MAX_MANUAL_PROMPTS}
                    onClick={addManual}
                  >
                    Añadir
                  </button>
                </div>
                {manualPrompts.length > 0 ? (
                  <div className="ap-rev">
                    {manualPrompts.map((text, i) => (
                      <div key={i} className="ap-row on">
                        <span className="ap-t">{text}</span>
                        <button
                          type="button"
                          className="ap-cx"
                          aria-label="Quitar prompt"
                          disabled={pending}
                          onClick={() => setManualPrompts((p) => p.filter((_, idx) => idx !== i))}
                        >
                          <Ic n="x" sm />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {manualPrompts.length >= MAX_MANUAL_PROMPTS ? (
                  <p className="ap-sub" style={{ marginTop: 10 }}>
                    Máximo {MAX_MANUAL_PROMPTS} prompts por envío.
                  </p>
                ) : null}
              </>
            ) : null}

            {step === "review" ? (
              <>
                <p className="ap-p">Desmarca los que no quieras y edita el texto si hace falta.</p>
                {remainingSlots < proposals.length ? (
                  <p className="ap-top">
                    Tu plan admite {remainingSlots} prompt{remainingSlots === 1 ? "" : "s"} más. Elige cuáles añadir.
                  </p>
                ) : null}
                <div className="ap-rev">
                  {proposals.map((p, i) => {
                    const len = p.draft.trim().length;
                    const valid = len >= MIN_PROMPT_LENGTH && len <= MAX_PROMPT_LENGTH;
                    const blocked = !p.selected && atSlotLimit;
                    return (
                      <div key={i} className={`ap-row${p.selected ? " on" : ""}${p.editing ? " ed" : ""}`}>
                        {p.editing ? (
                          <>
                            <textarea
                              className="ap-input"
                              rows={2}
                              value={p.draft}
                              maxLength={MAX_PROMPT_LENGTH}
                              autoFocus
                              disabled={pending}
                              aria-label="Editar prompt"
                              onChange={(e) => patch(i, { draft: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit(i);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  patch(i, { draft: p.text, editing: false });
                                }
                              }}
                            />
                            <span style={{ display: "flex", gap: 6 }}>
                              <button type="button" className="btn ink sm" disabled={pending || !valid} onClick={() => saveEdit(i)}>
                                Guardar
                              </button>
                              <button type="button" className="btn ghost sm" disabled={pending} onClick={() => patch(i, { draft: p.text, editing: false })}>
                                Cancelar
                              </button>
                            </span>
                          </>
                        ) : (
                          <>
                            <label className="ap-ck">
                              <input
                                type="checkbox"
                                checked={p.selected}
                                disabled={pending || blocked}
                                title={blocked ? "Has llegado al tope de tu plan" : undefined}
                                aria-label={`Añadir «${p.text}»`}
                                onChange={() => patch(i, { selected: !p.selected })}
                              />
                              <span>
                                <Ic n="check" />
                              </span>
                            </label>
                            <span className="ap-t">
                              {p.text}
                              {p.category ? <small>Tema: {p.category}</small> : null}
                            </span>
                            <button type="button" className="btn ghost sm" disabled={pending} onClick={() => patch(i, { editing: true, draft: p.text })}>
                              Editar
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            {limit > 0 ? (
              <div className="ap-cap">
                <div className="l">
                  <span>Tu plan</span>
                  <span>
                    <b>{used + adding}</b> de {limit} prompts
                  </span>
                </div>
                <div className="ap-capb" aria-hidden="true">
                  <i style={{ width: `${Math.min((used / limit) * 100, 100)}%` }} />
                  <i className="a" style={{ width: `${Math.min((adding / limit) * 100, Math.max(100 - (used / limit) * 100, 0))}%` }} />
                </div>
                <div className="ap-capl">
                  <span>
                    <i /> En uso
                  </span>
                  <span>
                    <i className="a" /> Se añadirán
                  </span>
                  <span>{free} libres</span>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="alert" role="alert" style={{ marginTop: 14 }}>
                {error}
              </p>
            ) : null}
          </div>

          <div className="psh-f">
            <button type="button" className="btn ghost" disabled={pending} onClick={close}>
              Cancelar
            </button>
            {step === "detail" ? (
              <button
                type="button"
                className="btn ink"
                disabled={pending || !canContinue}
                onClick={method === "manual" ? submitManual : generate}
              >
                {pending
                  ? method === "manual"
                    ? "Añadiendo…"
                    : "Generando…"
                  : method === "manual"
                    ? `Añadir ${manualPrompts.length} prompt${manualPrompts.length === 1 ? "" : "s"}`
                    : "Generar prompts"}
              </button>
            ) : null}
            {step === "review" ? (
              <>
                <button type="button" className="btn line" disabled={pending} onClick={generate}>
                  {pending && busy === "generate" ? "Generando…" : "Volver a generar"}
                </button>
                <button
                  type="button"
                  className="btn ink"
                  disabled={pending || selected === 0 || anyEditing}
                  title={anyEditing ? "Guarda o cancela la edición antes de añadir" : undefined}
                  onClick={submitReviewed}
                >
                  {pending && busy === "add" ? "Añadiendo…" : `Añadir ${selected} prompt${selected === 1 ? "" : "s"}`}
                </button>
              </>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
