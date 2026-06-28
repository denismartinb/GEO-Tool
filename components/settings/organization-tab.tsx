"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import type { AccountRole } from "@/lib/account-role";

export function OrganizationTab({ role }: { role: AccountRole }) {
  const ro = role !== "admin";
  const [name, setName] = useState("Agencia Acme");
  const [website, setWebsite] = useState("agenciaacme.com");
  const [sector, setSector] = useState("Agencia de marketing");
  const [taxInfo, setTaxInfo] = useState("Agencia Acme S.L. · ESB12345678");

  return (
    <div className="set-pane">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <p className="card-title">Organización</p>
          {ro && (
            <span className="set-role-pill ghost">
              <Icon name="eye" size={12} />
              Solo lectura
            </span>
          )}
        </CardHeader>
        <CardContent>
          <div className="set-profile-head">
            <div className="set-org-logo">A</div>
            <div>
              <Button type="button" variant="outline" disabled={ro}>
                <Icon name="image" size={14} />
                Cambiar logo
              </Button>
              <div className="set-hint" style={{ marginTop: 7 }}>
                Aparece en los informes white-label.
              </div>
            </div>
          </div>

          <div className="set-form-grid">
            <div>
              <label className="field-label" htmlFor="org-name">
                Nombre de la organización
              </label>
              <input
                id="org-name"
                className="set-field"
                value={name}
                disabled={ro}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="org-website">
                Sitio web
              </label>
              <input
                id="org-website"
                className="set-field"
                value={website}
                disabled={ro}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="org-sector">
                Sector
              </label>
              <input
                id="org-sector"
                className="set-field"
                value={sector}
                disabled={ro}
                onChange={(event) => setSector(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="org-tax">
                Datos fiscales
              </label>
              <input
                id="org-tax"
                className="set-field"
                value={taxInfo}
                disabled={ro}
                onChange={(event) => setTaxInfo(event.target.value)}
              />
            </div>
          </div>

          {!ro && (
            <div className="set-actions">
              <Button type="button">Guardar cambios</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
