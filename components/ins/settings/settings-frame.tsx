"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Ic } from "@/components/ins/ic";
import { Seg } from "@/components/ins/kit/seg";
import { useShellData } from "@/components/ins/shell-context";

/**
 * Ajustes, marco «Instrumento» (CONSOLE-INSTRUMENTO-1 F8c, log §369): the
 * profile header and the Plan / Cuenta / Notificaciones tabs. Only the frame is
 * new; the three sections keep the markup, server actions and copy they had.
 *
 * The panels are server-rendered once and passed in as children. Switching tab
 * toggles `hidden`, never unmounts, so a half-typed form survives a tab change.
 * The old anchors (`#cuenta`, `#plan`, `#avisos`) and `?openPlan=` still land on
 * the right panel: four transactional emails already link to them.
 */

export type SettingsTabId = "plan" | "cuenta" | "avisos";

const HASH_TO_TAB: Record<string, SettingsTabId> = { plan: "plan", cuenta: "cuenta", avisos: "avisos" };

export function SettingsFrame({
  name,
  email,
  initials,
  planPill,
  showPlan,
  forcePlan,
  plan,
  account,
  notifications,
}: {
  name: string;
  email: string;
  initials: string;
  /** «Plan Pro · 4 días de prueba» or «Sin plan · solo lectura»; null for a non-admin. */
  planPill: { text: string; readOnly: boolean } | null;
  showPlan: boolean;
  /** `?openPlan=` or `?checkout=` in the URL: land on Plan whatever the hash says. */
  forcePlan: boolean;
  plan: ReactNode;
  account: ReactNode;
  notifications: ReactNode;
}) {
  const shell = useShellData();
  const first: SettingsTabId = showPlan ? "plan" : "cuenta";
  const [tab, setTab] = useState<SettingsTabId>(forcePlan && showPlan ? "plan" : first);

  useEffect(() => {
    function fromHash() {
      const wanted = HASH_TO_TAB[window.location.hash.replace("#", "")];
      if (!wanted) return;
      if (wanted === "plan" && !showPlan) return;
      setTab(wanted);
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [showPlan]);

  const options: Array<readonly [SettingsTabId, string]> = [
    ...(showPlan ? ([["plan", "Plan"]] as const) : []),
    ["cuenta", "Cuenta"],
    ["avisos", "Notificaciones"],
  ];

  return (
    <div className="page sc-set">
      <header className="st-head">
        <span className="av st-av" aria-hidden="true">
          {initials}
        </span>
        <div className="st-id">
          <div className="eyebrow bare">Tu perfil</div>
          <h1>{name}</h1>
          <p className="mono">{email}</p>
          {planPill ? (
            <div className="pills">
              <span className={`badge ${planPill.readOnly ? "b-warm" : "b-blue"}`}>{planPill.text}</span>
            </div>
          ) : null}
        </div>
        <form action={shell.signOutAction} className="st-out">
          <button type="submit" className="btn ghost sm">
            <Ic n="c-logout" sm />
            Cerrar sesión
          </button>
        </form>
      </header>

      <div className="st-tabs">
        <Seg label="Secciones de ajustes" options={options} value={tab} onChange={setTab} />
      </div>

      <div className="set-scope st-panels">
        {showPlan ? (
          <section id="plan" role="tabpanel" hidden={tab !== "plan"}>
            {plan}
          </section>
        ) : null}
        <section id="cuenta" role="tabpanel" hidden={tab !== "cuenta"}>
          {account}
        </section>
        <section id="avisos" role="tabpanel" hidden={tab !== "avisos"}>
          {notifications}
        </section>
      </div>
    </div>
  );
}
