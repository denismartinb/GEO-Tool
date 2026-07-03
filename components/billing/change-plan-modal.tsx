"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PLANS, type Plan } from "@/app/pricing/plans-data";

const CYCLE_DAYS = 30;
const DAYS_LEFT = 5;
const CYCLE_END = "1 jul 2026";

const money = (n: number, dec = 2) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";

const METER_ROWS: Array<{ label: string; icon: string; get: (p: Plan) => string }> = [
  { label: "Dominios", icon: "globe", get: (p) => p.meter.projects },
  { label: "Prompts monitorizados", icon: "prompts", get: (p) => "~" + p.meter.prompts },
  { label: "Motores de IA", icon: "layers", get: (p) => String(p.meter.engines) },
  { label: "Frecuencia de refresco", icon: "refresh", get: (p) => p.meter.refresh }
];

function PlanMeterChips({ plan }: { plan: Plan }) {
  return (
    <div className="cp-plan-meter">
      {METER_ROWS.map((row) => (
        <span key={row.label} className="cp-chip">
          <Icon name={row.icon} size={11} />
          {row.get(plan)}
        </span>
      ))}
    </div>
  );
}

export function ChangePlanModal({
  currentId,
  initialTargetId,
  onClose,
  onApply
}: {
  currentId: Plan["id"];
  initialTargetId?: Plan["id"];
  onClose: () => void;
  onApply: (targetId: Plan["id"]) => Promise<{ success: boolean; error?: string }>;
}) {
  const current = PLANS.find((p) => p.id === currentId)!;
  const [sel, setSel] = useState<Plan["id"]>(initialTargetId ?? currentId);
  const [step, setStep] = useState<"select" | "confirm" | "done">("select");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const close = () => {
    if (isPending) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isPending]);

  const target = PLANS.find((p) => p.id === sel)!;
  const isSame = sel === currentId;
  const isUpgrade = target.price > current.price;

  const creditUnused = (current.price * DAYS_LEFT) / CYCLE_DAYS;
  const chargeNew = (target.price * DAYS_LEFT) / CYCLE_DAYS;
  const dueToday = Math.max(0, chargeNew - creditUnused);

  const diffs = METER_ROWS.filter((row) => row.get(current) !== row.get(target));

  const footNote = isSame ? (
    "Selecciona un plan distinto al actual."
  ) : (
    <>
      Se aplica <b>de inmediato</b> al confirmar.
    </>
  );

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await onApply(sel);
      if (result.success) {
        setStep("done");
      } else {
        setError(result.error ?? "No se pudo guardar el cambio de plan.");
      }
    });
  };

  return (
    <div className="cp-scrim" onClick={close}>
      <div
        className="cp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={step === "done" ? "Cambio confirmado" : "Cambiar de plan"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <div className="cp-head-ic">
            <Icon name="grid" size={20} />
          </div>
          <div>
            <h3>{step === "done" ? "Cambio confirmado" : "Cambiar de plan"}</h3>
            <p>
              {step === "select" && (
                <>
                  Estás en <b style={{ color: "var(--ink-2)" }}>{current.name}</b> · {money(current.price, 0)}/mes
                </>
              )}
              {step === "confirm" && (isUpgrade ? "Revisa el prorrateo antes de confirmar" : "Revisa qué cambia antes de confirmar")}
              {step === "done" && "Todo listo"}
            </p>
          </div>
          <button type="button" className="cp-close" onClick={close} aria-label="Cerrar" disabled={isPending}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {step === "select" && (
          <>
            <div className="cp-body">
              <div className="cp-plans" role="radiogroup" aria-label="Elegir plan">
                {PLANS.map((p) => {
                  const isCur = p.id === currentId;
                  const isSel = p.id === sel;
                  const flag = isCur ? "cur" : p.recommended ? "rec" : null;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      role="radio"
                      aria-checked={isSel}
                      className={"cp-plan" + (isSel ? " sel" : "") + (isCur ? " cur" : "") + (flag ? " has-flag" : "")}
                      onClick={() => setSel(p.id)}
                    >
                      {flag && (
                        <span className={"cp-flag " + flag}>
                          {isCur ? (
                            "Plan actual"
                          ) : (
                            <>
                              <Icon name="spark" size={10} />
                              Recomendado
                            </>
                          )}
                        </span>
                      )}
                      <span className="cp-radio" />
                      <div className="cp-plan-top">
                        <span className="cp-plan-name">{p.name}</span>
                        <span className="cp-plan-price">
                          {money(p.price, 0)}
                          <span className="per">/{p.id === "free" ? "" : "mes"}</span>
                        </span>
                      </div>
                      <div className="cp-plan-tag">{p.tagline}</div>
                      <PlanMeterChips plan={p} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="cp-foot">
              <div className="cp-foot-note">{footNote}</div>
              <Button type="button" variant="ghost" onClick={close}>
                Cancelar
              </Button>
              <Button type="button" disabled={isSame} onClick={() => setStep("confirm")}>
                Continuar
                <Icon name="arrRight" size={15} />
              </Button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="cp-body">
              <div className="cp-confirm-head">
                <span className={"cp-confirm-badge " + (isUpgrade ? "up" : "down")}>
                  <Icon name={isUpgrade ? "arrUp" : "arrDown"} size={13} />
                  {isUpgrade ? "Mejora de plan" : "Bajada de plan"}
                </span>
              </div>

              <div className="cp-move">
                <div className="cp-move-side">
                  <div className="cp-move-lbl">Actual</div>
                  <div className="cp-move-plan">
                    {current.name} <span className="per">· {money(current.price, 0)}/mes</span>
                  </div>
                </div>
                <Icon name="arrRight" size={20} className="cp-move-arrow" />
                <div className="cp-move-side">
                  <div className="cp-move-lbl">Nuevo</div>
                  <div className="cp-move-plan">
                    {target.name}{" "}
                    <span className="per">· {target.price === 0 ? "gratis" : money(target.price, 0) + "/mes"}</span>
                  </div>
                </div>
              </div>

              {isUpgrade ? (
                <>
                  <div className="cp-proration">
                    <div className="cp-pror-row">
                      Crédito por los {DAYS_LEFT} días no usados de {current.name}
                      <span className="v credit">−{money(creditUnused)}</span>
                    </div>
                    <div className="cp-pror-row">
                      {target.name} · {DAYS_LEFT} días hasta la renovación
                      <span className="v">{money(chargeNew)}</span>
                    </div>
                    <div className="cp-pror-row total">
                      A pagar hoy <span className="v">{money(dueToday)}</span>
                    </div>
                  </div>
                  <div className="cp-pror-note">
                    <Icon name="info" size={14} />
                    <span>
                      El acceso a {target.name} se activa al instante. A partir del <b>{CYCLE_END}</b> se te cobrarán{" "}
                      {money(target.price)}/mes.
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="cp-pror-note" style={{ marginTop: 16 }}>
                    <Icon name="info" size={14} />
                    <span>
                      El cambio a <b>{target.name}</b> se aplica de inmediato. Todavía no hay cobro real activado.
                    </span>
                  </div>
                  {diffs.length > 0 && (
                    <div className="cp-diff">
                      <div className="cp-diff-h">
                        <Icon name="alertCircle" size={14} />
                        Qué se reduce al bajar a {target.name}
                      </div>
                      <ul className="cp-diff-list">
                        {diffs.map((d) => (
                          <li key={d.label}>
                            <Icon name={d.icon} size={14} />
                            <span className="k">{d.label}</span>
                            <span className="from">{d.get(current)}</span>
                            <Icon name="arrRight" size={13} />
                            <span className="to">{d.get(target)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <div className="cp-foot-note">
                {isUpgrade ? (
                  <>
                    Total hoy: <b>{money(dueToday)}</b>
                  </>
                ) : (
                  <>
                    Efectivo <b>de inmediato</b>
                  </>
                )}
              </div>
              <Button type="button" variant="ghost" onClick={() => setStep("select")} disabled={isPending}>
                <Icon name="chevLeft" size={15} />
                Atrás
              </Button>
              <Button type="button" disabled={isPending} onClick={handleConfirm}>
                {isPending ? "Guardando…" : isUpgrade ? "Confirmar y pagar " + money(dueToday) : "Confirmar cambio"}
              </Button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div className="cp-done">
              <div className="cp-done-badge">
                <Icon name="check" size={30} />
              </div>
              {isUpgrade ? (
                <>
                  <h3>Ya estás en {target.name}</h3>
                  <p>
                    Hemos cobrado <b>{money(dueToday)}</b> a tu Visa ···· 4242. Tu plan <b>{target.name}</b> está
                    activo y ya puedes usar todas sus funciones. La próxima factura será de{" "}
                    <b>{money(target.price)}</b> el {CYCLE_END}.
                  </p>
                </>
              ) : (
                <>
                  <h3>Ya estás en {target.name}</h3>
                  <p>
                    Tu plan <b>{target.name}</b> está activo desde ahora. Puedes cambiarlo cuando quieras desde Plan y
                    facturación.
                  </p>
                </>
              )}
            </div>
            <div className="cp-foot" style={{ justifyContent: "flex-end" }}>
              <Button type="button" onClick={onClose}>
                Entendido
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
