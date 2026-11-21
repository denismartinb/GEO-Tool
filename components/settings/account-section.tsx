"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import type { BillingDetails, CompanyDetails } from "@/lib/settings/company-details";
import { changePassword } from "@/app/dashboard/settings/profile/actions";
import { saveAccount } from "@/app/dashboard/settings/organization/actions";

type Feedback = { type: "ok" | "err"; text: string };

/**
 * CONSOLE-REDESIGN-1. The "Cuenta" section of the single settings page —
 * what used to be the Perfil tab, minus everything that was not connected to
 * anything.
 *
 * Removed with founder approval (2026-08-06): Idioma and Zona horaria (both
 * held React state that vanished on reload), Cambiar foto (no backend, and
 * enabled, so it looked live), Activar 2FA (no backend), and the
 * Administrador/Miembro pill (with no teams, every account is admin of itself,
 * so it hinted at a feature that does not exist).
 *
 * The avatar stays as initials, round, flat ink — round is a person, squircle
 * is a domain (see docs/brand/brand-guidelines.md).
 */
export function AccountSection({
  email,
  firstName,
  lastName,
  company,
  billingDetails
}: {
  email: string;
  firstName: string;
  lastName: string;
  company: CompanyDetails;
  billingDetails: BillingDetails;
}) {
  // Fields read as saved until «Editar» is pressed; «Cancelar» restores the
  // last saved values (founder, 2026-10-30).
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState({ first: firstName, last: lastName, billing: billingDetails });
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  // "Datos de empresa" is hidden (nothing in the product reads it — see
  // lib/settings/company-details.ts), so there is no UI left to change
  // `company`. It is only round-tripped here so saving does not wipe out
  // whatever an account saved before the fold was hidden.
  const [billingValue, setBillingValue] = useState(billingDetails);

  const [isSaving, startSaving] = useTransition();
  const [saveFeedback, setSaveFeedback] = useState<Feedback | null>(null);

  const save = () => {
    setSaveFeedback(null);
    startSaving(async () => {
      const result = await saveAccount({
        firstName: first,
        lastName: last,
        companyName: company.name,
        companyWebsite: company.website,
        companySector: company.sector,
        legalName: billingValue.legalName,
        taxId: billingValue.taxId
      });
      setSaveFeedback(
        result.success ? { type: "ok", text: "Cambios guardados." } : { type: "err", text: result.error }
      );
      if (result.success) {
        setSaved({ first, last, billing: billingValue });
        setEditing(false);
      }
    });
  };

  const cancelEdit = () => {
    setFirst(saved.first);
    setLast(saved.last);
    setBillingValue(saved.billing);
    setSaveFeedback(null);
    setEditing(false);
  };

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, startSavingPassword] = useTransition();
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null);

  const openPasswordForm = () => {
    setPasswordFeedback(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswordForm(true);
  };

  const cancelPasswordForm = () => {
    if (isSavingPassword) return;
    setShowPasswordForm(false);
    setPasswordFeedback(null);
  };

  const submitPassword = () => {
    if (newPassword.length < 8) {
      setPasswordFeedback({ type: "err", text: "La nueva contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "err", text: "Las contraseñas no coinciden." });
      return;
    }
    setPasswordFeedback(null);
    startSavingPassword(async () => {
      const result = await changePassword(currentPassword, newPassword);
      if (!result.success) {
        setPasswordFeedback({ type: "err", text: result.error });
        return;
      }
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({ type: "ok", text: "Contraseña actualizada." });
    });
  };

  const fieldErr = (f: Feedback) => (
    <div className={f.type === "err" ? "field-err" : "field-ok"} style={{ justifyContent: "flex-start" }}>
      {f.type === "err" && <Icon name="alertCircle" size={13} />}
      {f.text}
    </div>
  );

  const ro = editing ? "" : " ro";

  return (
    <>
    <div className="pf-editbar">
      {editing ? (
        <>
          <button type="button" className="btn ghost sm" onClick={cancelEdit} disabled={isSaving}>
            Cancelar
          </button>
          <button type="button" className="btn ink sm" onClick={save} disabled={isSaving}>
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      ) : (
        <button type="button" className="btn line sm" onClick={() => { setSaveFeedback(null); setEditing(true); }}>
          Editar
        </button>
      )}
    </div>
    {saveFeedback ? <div className="pf-editfb">{fieldErr(saveFeedback)}</div> : null}
    <div className="grid2 pf-acc">
      <section>
        <div className="eyebrow">Datos personales</div>
        <div className="pf-form">
          <div className="pf-f2">
            <label className="pf-fld" htmlFor="profile-first-name">
              <span>Nombre</span>
              <input id="profile-first-name" className={`pf-in${ro}`} readOnly={!editing} value={first} onChange={(event) => setFirst(event.target.value)} />
            </label>
            <label className="pf-fld" htmlFor="profile-last-name">
              <span>Apellidos</span>
              <input id="profile-last-name" className={`pf-in${ro}`} readOnly={!editing} value={last} onChange={(event) => setLast(event.target.value)} />
            </label>
          </div>
          <label className="pf-fld" htmlFor="profile-email">
            <span>Email</span>
            <input id="profile-email" className="pf-in" value={email} disabled readOnly />
            <small className="pf-hint">Es tu identificador de acceso.</small>
          </label>
        </div>
      </section>

      <section>
        {/* "Datos de empresa" stays hidden (founder, 2026-08-25): nothing reads
            org_name/org_website/org_sector. "Datos de facturación" is what the
            Stripe invoice sync reads. One save covers the whole tab. */}
        <div className="eyebrow">Datos de facturación</div>
        <div className="pf-form">
          <label className="pf-fld" htmlFor="billing-legal-name">
            <span>Empresa o razón social</span>
            <input
              id="billing-legal-name"
              className={`pf-in${ro}`}
              readOnly={!editing}
              value={billingValue.legalName}
              onChange={(event) => setBillingValue({ ...billingValue, legalName: event.target.value })}
            />
          </label>
          <label className="pf-fld" htmlFor="billing-tax-id">
            <span>NIF/CIF</span>
            <input
              id="billing-tax-id"
              className={`pf-in mono${ro}`}
              readOnly={!editing}
              value={billingValue.taxId}
              onChange={(event) => setBillingValue({ ...billingValue, taxId: event.target.value })}
            />
          </label>
          <p className="pf-hint">Aparecen en tus facturas.</p>
        </div>

        <div className="eyebrow" style={{ marginTop: 36 }}>
          Acceso
        </div>
        <div className="pf-list">
          <div className="pf-row">
            <div className="l">
              <b>Contraseña</b>
            </div>
            {!showPasswordForm ? (
              <div className="c">
                <button type="button" className="btn sm line" onClick={openPasswordForm}>
                  Cambiar
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {showPasswordForm ? (
          <div className="pf-form pf-pwd">
            <label className="pf-fld" htmlFor="current-password">
              <span>Contraseña actual</span>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                className="pf-in"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className="pf-fld" htmlFor="new-password">
              <span>Nueva contraseña</span>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                className="pf-in"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label className="pf-fld" htmlFor="confirm-password">
              <span>Confirmar nueva contraseña</span>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                className="pf-in"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submitPassword()}
              />
            </label>
            {passwordFeedback ? fieldErr(passwordFeedback) : null}
            <div className="pf-end">
              <button type="button" className="btn ghost sm" onClick={cancelPasswordForm} disabled={isSavingPassword}>
                Cancelar
              </button>
              <button type="button" className="btn ink sm" onClick={submitPassword} disabled={isSavingPassword}>
                {isSavingPassword ? "Guardando…" : "Guardar contraseña"}
              </button>
            </div>
          </div>
        ) : passwordFeedback?.type === "ok" ? (
          <div className="field-ok" style={{ justifyContent: "flex-start", marginTop: 8 }}>
            {passwordFeedback.text}
          </div>
        ) : null}
      </section>
    </div>
    </>
  );
}
