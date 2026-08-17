"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyFold } from "@/components/settings/company-fold";
import { BillingDetailsFold } from "@/components/settings/billing-details";
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
  initials,
  firstName,
  lastName,
  company,
  companyReadOnly,
  billingDetails
}: {
  email: string;
  initials: string;
  firstName: string;
  lastName: string;
  company: CompanyDetails;
  companyReadOnly: boolean;
  billingDetails: BillingDetails;
}) {
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  // Lifted out of the two folds: they used to own this state and carry their
  // own «Guardar», so the card's button silently dropped whatever had been
  // typed inside them (founder, 2026-08-06). One card, one save.
  const [companyValue, setCompanyValue] = useState(company);
  const [billingValue, setBillingValue] = useState(billingDetails);

  const [isSaving, startSaving] = useTransition();
  const [saveFeedback, setSaveFeedback] = useState<Feedback | null>(null);

  const save = () => {
    setSaveFeedback(null);
    startSaving(async () => {
      const result = await saveAccount({
        firstName: first,
        lastName: last,
        companyName: companyValue.name,
        companyWebsite: companyValue.website,
        companySector: companyValue.sector,
        legalName: billingValue.legalName,
        taxId: billingValue.taxId
      });
      setSaveFeedback(
        result.success ? { type: "ok", text: "Cambios guardados." } : { type: "err", text: result.error }
      );
    });
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

  return (
    <>
      <Card>
        <CardContent>
          <div className="set-idrow">
            <div className="set-avatar-lg">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="set-idname">{[first, last].filter(Boolean).join(" ") || "Tu cuenta"}</div>
              <div className="set-idmail">{email}</div>
            </div>
          </div>

          <div className="set-form-grid">
            <div>
              <label className="field-label" htmlFor="profile-first-name">
                Nombre
              </label>
              <input
                id="profile-first-name"
                className="set-field"
                value={first}
                onChange={(event) => setFirst(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="profile-last-name">
                Apellidos
              </label>
              <input
                id="profile-last-name"
                className="set-field"
                value={last}
                onChange={(event) => setLast(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="profile-email">
                Email
              </label>
              <input id="profile-email" className="set-field" value={email} disabled readOnly />
              <div className="set-hint">
                <Icon name="lock" size={11} />
                Es tu identificador de acceso.
              </div>
            </div>
          </div>

          {/* Twin folds, «empresa» then «facturación» — founder, 2026-08-06:
              "mete datos de facturación en un acordeón similar a datos de
              empresa justo debajo". Both are things you fill in once, so they
              read better as a pair than split across two sections. */}
          <div className="set-folds">
            <CompanyFold value={companyValue} onChange={setCompanyValue} readOnly={companyReadOnly} />
            <BillingDetailsFold value={billingValue} onChange={setBillingValue} />
          </div>

          <div className="set-actions">
            <Button type="button" onClick={save} disabled={isSaving}>
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
          {saveFeedback && (
            <div
              className={saveFeedback.type === "err" ? "field-err" : "field-ok"}
              style={{ justifyContent: "flex-start", marginTop: 8 }}
            >
              {saveFeedback.type === "err" && <Icon name="alertCircle" size={13} />}
              {saveFeedback.text}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="set-security">
        <CardContent>
          <div className="set-row last">
            <div className="set-row-txt">
              <div className="set-row-t">Contraseña</div>
            </div>
            {!showPasswordForm && (
              <div className="set-row-ctrl">
                <Button type="button" variant="outline" onClick={openPasswordForm}>
                  Cambiar
                </Button>
              </div>
            )}
          </div>

          {showPasswordForm && (
            <div className="set-password-form">
              <div className="set-form-grid" style={{ gridTemplateColumns: "1fr", maxWidth: 360 }}>
                <div>
                  <label className="field-label" htmlFor="current-password">
                    Contraseña actual
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    className="set-field"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="new-password">
                    Nueva contraseña
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    className="set-field"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="confirm-password">
                    Confirmar nueva contraseña
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    className="set-field"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && submitPassword()}
                  />
                </div>
              </div>

              {passwordFeedback && (
                <div
                  className={passwordFeedback.type === "err" ? "field-err" : "field-ok"}
                  style={{ justifyContent: "flex-start" }}
                >
                  {passwordFeedback.type === "err" && <Icon name="alertCircle" size={13} />}
                  {passwordFeedback.text}
                </div>
              )}

              <div className="set-password-actions">
                <Button type="button" onClick={submitPassword} disabled={isSavingPassword}>
                  {isSavingPassword ? "Guardando…" : "Guardar contraseña"}
                </Button>
                <Button type="button" variant="ghost" onClick={cancelPasswordForm} disabled={isSavingPassword}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {!showPasswordForm && passwordFeedback?.type === "ok" && (
            <div className="field-ok" style={{ justifyContent: "flex-start" }}>
              {passwordFeedback.text}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
