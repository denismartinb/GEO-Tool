"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { SettingRow } from "@/components/settings/setting-row";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import type { AccountRole } from "@/lib/account-role";
import { updateProfileName, changePassword } from "@/app/dashboard/settings/profile/actions";

type Feedback = { type: "ok" | "err"; text: string };

export function ProfileTab({
  email,
  role,
  initials,
  firstName,
  lastName
}: {
  email: string;
  role: AccountRole;
  initials: string;
  firstName: string;
  lastName: string;
}) {
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [lang, setLang] = useState("Español");
  const [tz, setTz] = useState("(GMT+1) Madrid");

  const [isSavingName, startSavingName] = useTransition();
  const [nameFeedback, setNameFeedback] = useState<Feedback | null>(null);

  const saveName = () => {
    setNameFeedback(null);
    startSavingName(async () => {
      const result = await updateProfileName(first, last);
      setNameFeedback(
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
    <div className="set-pane">
      <Card>
        <CardHeader>
          <p className="card-title">Datos personales</p>
        </CardHeader>
        <CardContent>
          <div className="set-profile-head">
            <div className="set-avatar-lg">{initials}</div>
            <div>
              <Button type="button" variant="outline">
                <Icon name="image" size={14} />
                Cambiar foto
              </Button>
              <div className="set-hint" style={{ marginTop: 7 }}>
                JPG o PNG, máx. 2&nbsp;MB. Si no, usamos tus iniciales.
              </div>
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
              <input id="profile-email" className="set-field" value={email} disabled style={{ opacity: 0.7 }} />
              <div className="set-hint">
                <Icon name="lock" size={11} />
                El email es tu identificador de acceso.
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="profile-lang">
                Idioma
              </label>
              <select
                id="profile-lang"
                className="set-field"
                value={lang}
                onChange={(event) => setLang(event.target.value)}
              >
                <option>Español</option>
                <option>English</option>
                <option>Français</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="profile-tz">
                Zona horaria
              </label>
              <select
                id="profile-tz"
                className="set-field"
                value={tz}
                onChange={(event) => setTz(event.target.value)}
              >
                <option>(GMT+1) Madrid</option>
                <option>(GMT+0) Londres</option>
                <option>(GMT-5) Nueva York</option>
              </select>
            </div>
          </div>

          <div className="set-actions">
            <Button type="button" onClick={saveName} disabled={isSavingName}>
              {isSavingName ? "Guardando…" : "Guardar cambios"}
            </Button>
            <span className="set-role-pill">
              <Icon name={role === "admin" ? "shield" : "user"} size={13} />
              {role === "admin" ? "Administrador" : "Miembro"}
            </span>
          </div>
          {nameFeedback && (
            <div
              className={nameFeedback.type === "err" ? "field-err" : "field-ok"}
              style={{ justifyContent: "flex-start", marginTop: 8 }}
            >
              {nameFeedback.type === "err" && <Icon name="alertCircle" size={13} />}
              {nameFeedback.text}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="card-title">Seguridad</p>
        </CardHeader>
        <CardContent>
          <div className="set-row" style={showPasswordForm ? { borderBottom: "none" } : undefined}>
            <div className="set-row-txt">
              <div className="set-row-t">Contraseña</div>
              <div className="set-row-d">Actualízala cuando quieras</div>
            </div>
            {!showPasswordForm && (
              <div className="set-row-ctrl">
                <Button type="button" variant="outline" onClick={openPasswordForm}>
                  Cambiar contraseña
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

          <SettingRow
            title="Verificación en dos pasos"
            desc="Añade una capa extra de seguridad al iniciar sesión"
            last
          >
            <Button type="button" variant="outline">
              <Icon name="shield" size={13} />
              Activar 2FA
            </Button>
          </SettingRow>
        </CardContent>
      </Card>

      <Card className="card-danger-zone">
        <CardHeader>
          <p className="card-title" style={{ color: "var(--neg-ink)" }}>
            Zona de peligro
          </p>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Eliminar cuenta"
            desc="Elimina tu cuenta y todos tus datos de forma permanente. Esta acción no se puede deshacer."
            last
          >
            <DeleteAccountButton email={email} />
          </SettingRow>
        </CardContent>
      </Card>
    </div>
  );
}
