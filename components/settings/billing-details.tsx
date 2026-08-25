"use client";

import { SettingsFold } from "@/components/settings/settings-fold";
import type { BillingDetails } from "@/lib/settings/company-details";

/**
 * CONSOLE-REDESIGN-1. Razón social + NIF, replacing the old single free-text
 * "Datos fiscales" field, which never said what to write inside.
 *
 * It sits in Cuenta, directly under «Datos de empresa» and with the same
 * chrome — founder's call (2026-08-06), overriding the first implementation
 * that put it in the Plan section next to the invoice. Both blocks are "things
 * you fill in once", so they read better as twins than split across sections.
 *
 * Presentational, like its twin: one save for the whole card in AccountSection.
 */
export function BillingDetailsFold({
  value,
  onChange
}: {
  value: BillingDetails;
  onChange: (next: BillingDetails) => void;
}) {
  return (
    <SettingsFold id="billing-fold" title="Datos de facturación">
      <div className="set-form-grid">
        <div>
          <label className="field-label" htmlFor="billing-legal-name">
            Razón social
          </label>
          <input
            id="billing-legal-name"
            className="set-field"
            value={value.legalName}
            onChange={(event) => onChange({ ...value, legalName: event.target.value })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="billing-tax-id">
            NIF/CIF
          </label>
          <input
            id="billing-tax-id"
            className="set-field"
            value={value.taxId}
            onChange={(event) => onChange({ ...value, taxId: event.target.value })}
          />
        </div>
      </div>
    </SettingsFold>
  );
}
