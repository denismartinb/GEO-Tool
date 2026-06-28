"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { SettingRow } from "@/components/settings/setting-row";
import type { AccountRole } from "@/lib/account-role";
import { deriveNameFromEmail } from "@/lib/derive-name-from-email";

export function ProfileTab({
  email,
  role,
  initials
}: {
  email: string;
  role: AccountRole;
  initials: string;
}) {
  const [name, setName] = useState(deriveNameFromEmail(email));
  const [lang, setLang] = useState("Español");
  const [tz, setTz] = useState("(GMT+1) Madrid");

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
              <label className="field-label" htmlFor="profile-name">
                Nombre completo
              </label>
              <input
                id="profile-name"
                className="set-field"
                value={name}
                onChange={(event) => setName(event.target.value)}
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
            <Button type="button">Guardar cambios</Button>
            <span className="set-role-pill">
              <Icon name={role === "admin" ? "shield" : "user"} size={13} />
              {role === "admin" ? "Administrador" : "Miembro"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="card-title">Seguridad</p>
        </CardHeader>
        <CardContent>
          <SettingRow title="Contraseña" desc="Última actualización hace 3 meses">
            <Button type="button" variant="outline">
              Cambiar contraseña
            </Button>
          </SettingRow>
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
    </div>
  );
}
