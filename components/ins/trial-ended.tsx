"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ic } from "@/components/ins/ic";
import { useLayer, XoClose } from "@/components/ins/layer";
import { useShellData } from "@/components/ins/shell-context";

/*
 * CONSOLE-INSTRUMENTO-1 F8b (log §367): la experiencia de la prueba de Pro
 * terminada. Una cuenta `free` es de sólo lectura (TRIAL-ONLY-1, log §243):
 * aviso la primera vez que entra, y piezas fijas que llevan a elegir plan.
 * Diseño aprobado: docs/design-reference/console-instrumento-1/prueba-caducada.html
 */

export const PICK_PLAN_HREF = "/dashboard/settings?openPlan=pro#plan";
const pickPlanHref = (planId: string) => `/dashboard/settings?openPlan=${encodeURIComponent(planId)}#plan`;
const SEEN_KEY = "gs-trial-ended-seen";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* sin almacenamiento: el aviso puede repetirse, no se rompe nada */
  }
}

/** Franja bajo la cabecera, en todas las pantallas. */
export function TrialEndedStrip() {
  const d = useShellData();
  if (d.planId !== "free") return null;
  return (
    <div className="te-strip" role="status">
      <span className="dot" aria-hidden="true" />
      <p>
        <b>Tu prueba de Pro ha terminado.</b> Tus datos siguen aquí; los escaneos están en pausa hasta que elijas un plan.
      </p>
      <Link href={PICK_PLAN_HREF} className="btn ink sm">
        Elegir plan
      </Link>
    </div>
  );
}

/** Tarjeta del menú lateral: sustituye al chip del plan en el pie. */
export function TrialEndedPlanCard({ onNavigate }: { onNavigate?: () => void }) {
  const d = useShellData();
  if (d.planId !== "free") return null;
  return (
    <div className="te-card">
      <b>Prueba terminada</b>
      <p>Consultas tus datos, pero no se escanea.</p>
      <Link href={PICK_PLAN_HREF} className="btn ink sm" onClick={onNavigate}>
        Elegir plan
      </Link>
    </div>
  );
}

/** Barra inferior en móvil, donde no hay menú a la vista. */
export function TrialEndedDock() {
  const d = useShellData();
  if (d.planId !== "free") return null;
  return (
    <div className="te-dock" role="status">
      <div className="t">
        <b>Prueba terminada</b>
        Solo lectura hasta que elijas plan
      </div>
      <Link href={PICK_PLAN_HREF} className="btn ink sm">
        Elegir plan
      </Link>
    </div>
  );
}

/** Aviso de primera entrada: se abre una vez por navegador y cerrarlo no lo reabre. */
export function TrialEndedFirstEntry() {
  const d = useShellData();
  const { dlg } = useLayer();
  const isFree = d.planId === "free";
  useEffect(() => {
    if (!isFree || readSeen()) return;
    markSeen();
    const t = setTimeout(() => dlg(<TrialEndedDialog />, { label: "Tu prueba de Pro ha terminado" }), 600);
    return () => clearTimeout(t);
  }, [isFree]);
  return null;
}

function TrialEndedDialog() {
  const d = useShellData();
  const { close } = useLayer();
  const [picked, setPicked] = useState("pro");
  return (
    <div className="te-dlg">
      <div className="xo-dh">
        <XoClose />
        <div className="eyebrow bare" style={{ color: "var(--warm)" }}>
          Prueba Pro terminada
        </div>
        <h2>Tu prueba de Pro ha terminado</h2>
        <p>Tus datos siguen aquí y puedes consultarlos cuando quieras. Para que GenScore vuelva a escanear tu web, elige un plan.</p>
      </div>
      <div className="xo-db">
        <div className="te-two">
          <div className="te-box">
            <h5>Sigue contigo</h5>
            <ul>
              <li>Tus escaneos, prompts y competidores</li>
              <li>Las recomendaciones y el informe</li>
              <li>La auditoría técnica de tu web</li>
            </ul>
          </div>
          <div className="te-box hold">
            <h5>En pausa</h5>
            <ul>
              <li>Escaneos nuevos, también los automáticos</li>
              <li>Añadir dominios nuevos</li>
              <li>Marcar recomendaciones como hechas</li>
            </ul>
          </div>
        </div>
        {d.trialEndedOffers.length > 0 ? (
          <div className="te-plans">
            {d.trialEndedOffers.map((o) => (
              <button
                type="button"
                key={o.id}
                className={`te-plan${picked === o.id ? " rec" : ""}`}
                aria-pressed={picked === o.id}
                onClick={() => setPicked(o.id)}
              >
                <b>{o.name}</b>
                <span className="p num">
                  {o.promoPrice !== null ? <s>{o.price} €</s> : null}
                  {o.promoPrice ?? o.price} €<small> /mes</small>
                </span>
                <span className="n">{o.promoPrice !== null ? `Precio fundador, ${o.note}` : o.note}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="xo-df te-acts">
        <button type="button" className="btn line" onClick={close}>
          Ahora no, ver mis datos
        </button>
        <Link href={pickPlanHref(picked)} className="btn ink" onClick={close}>
          Elegir plan
          <Ic n="arrowr" sm />
        </Link>
      </div>
    </div>
  );
}
