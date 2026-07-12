"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import type { AccountRole } from "@/lib/account-role";
import { updateOrganization } from "@/app/dashboard/settings/organization/actions";

type Feedback = { type: "ok" | "err"; text: string };

export function OrganizationTab({
  role,
  name,
  website,
  sector,
  taxInfo
}: {
  role: AccountRole;
  name: string;
  website: string;
  sector: string;
  taxInfo: string;
}) {
  const ro = role !== "admin";
  const [orgName, setOrgName] = useState(name);
  const [orgWebsite, setOrgWebsite] = useState(website);
  const [orgSector, setOrgSector] = useState(sector);
  const [orgTaxInfo, setOrgTaxInfo] = useState(taxInfo);

  const [isSaving, startSaving] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const save = () => {
    setFeedback(null);
    startSaving(async () => {
      const result = await updateOrganization(orgName, orgWebsite, orgSector, orgTaxInfo);
      setFeedback(result.success ? { type: "ok", text: "Cambios guardados." } : { type: "err", text: result.error });
    });
  };

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
            <div className="set-org-logo">{orgName.trim().slice(0, 1).toUpperCase() || "?"}</div>
            <div>
              {/* No upload backend exists yet — a working button here would
                  have nothing to save to. Disabled + "Próximamente" instead
                  of an inert control that looks live (docs/ux-qa-audit-2026-07.md,
                  finding 4). Hint no longer promises exportable reports,
                  which don't exist either. */}
              <Button type="button" variant="outline" disabled title="Próximamente">
                <Icon name="image" size={14} />
                Cambiar logo
              </Button>
              <div className="set-hint" style={{ marginTop: 7 }}>
                Próximamente: personaliza el logo de tu organización.
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
                value={orgName}
                disabled={ro}
                onChange={(event) => setOrgName(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="org-website">
                Sitio web
              </label>
              <input
                id="org-website"
                className="set-field"
                value={orgWebsite}
                disabled={ro}
                onChange={(event) => setOrgWebsite(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="org-sector">
                Sector
              </label>
              <input
                id="org-sector"
                className="set-field"
                value={orgSector}
                disabled={ro}
                onChange={(event) => setOrgSector(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="org-tax">
                Datos fiscales
              </label>
              <input
                id="org-tax"
                className="set-field"
                value={orgTaxInfo}
                disabled={ro}
                onChange={(event) => setOrgTaxInfo(event.target.value)}
              />
            </div>
          </div>

          {!ro && (
            <div className="set-actions">
              <Button type="button" onClick={save} disabled={isSaving}>
                {isSaving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          )}
          {feedback && (
            <div
              className={feedback.type === "err" ? "field-err" : "field-ok"}
              style={{ justifyContent: "flex-start", marginTop: 8 }}
            >
              {feedback.type === "err" && <Icon name="alertCircle" size={13} />}
              {feedback.text}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
