"use client";

import { SettingsFold } from "@/components/settings/settings-fold";
import type { CompanyDetails } from "@/lib/settings/company-details";

/**
 * CONSOLE-REDESIGN-1. What used to be the whole "Organización" screen, now a
 * fold inside Cuenta, closed by default (founder, 2026-08-06: "quiero que tenga
 * menos protagonismo, puede ir dentro de perfil de forma opcional y plegada").
 *
 * Purely presentational: the state and the single save live in AccountSection.
 * It used to hold its own state and its own «Guardar», which meant the card's
 * save button silently discarded whatever had been typed in here.
 *
 * The logo upload is gone entirely: it had no backend, and a disabled button
 * promising "Próximamente" is still a control that does nothing.
 */
export function CompanyFold({
  value,
  onChange,
  readOnly
}: {
  value: CompanyDetails;
  onChange: (next: CompanyDetails) => void;
  readOnly: boolean;
}) {
  return (
    <SettingsFold id="company-fold" title="Datos de empresa" hint="Opcional">
      <div className="set-form-grid">
        <div>
          <label className="field-label" htmlFor="company-name">
            Nombre
          </label>
          <input
            id="company-name"
            className="set-field"
            value={value.name}
            disabled={readOnly}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="company-website">
            Sitio web
          </label>
          <input
            id="company-website"
            className="set-field"
            value={value.website}
            disabled={readOnly}
            onChange={(event) => onChange({ ...value, website: event.target.value })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="company-sector">
            Sector
          </label>
          <input
            id="company-sector"
            className="set-field"
            value={value.sector}
            disabled={readOnly}
            onChange={(event) => onChange({ ...value, sector: event.target.value })}
          />
        </div>
      </div>
    </SettingsFold>
  );
}
