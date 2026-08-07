"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SettingsFold } from "@/components/settings/settings-fold";
import { updateBillingDetails } from "@/app/dashboard/settings/organization/actions";
import type { BillingDetails } from "@/lib/settings/company-details";

type Feedback = { type: "ok" | "err"; text: string };

/**
 * CONSOLE-REDESIGN-1. Razón social + NIF.
 *
 * It replaces the old single free-text "Datos fiscales" field, which never said
 * what to write inside.
 *
 * It sits in Cuenta, directly under «Datos de empresa» and with the same
 * chrome — founder's call (2026-08-06), overriding the first implementation
 * that put it in the Plan section next to the invoice. Both blocks are "things
 * you fill in once", so they read better as twins than split across sections.
 */
export function BillingDetailsFold({ initial }: { initial: BillingDetails }) {
  const [legalName, setLegalName] = useState(initial.legalName);
  const [taxId, setTaxId] = useState(initial.taxId);

  const [isSaving, startSaving] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const save = () => {
    setFeedback(null);
    startSaving(async () => {
      const result = await updateBillingDetails(legalName, taxId);
      setFeedback(result.success ? { type: "ok", text: "Guardado." } : { type: "err", text: result.error });
    });
  };

  return (
    <SettingsFold id="billing-fold" title="Datos de facturación" hint="Salen en la factura">
      <div className="set-form-grid">
        <div>
          <label className="field-label" htmlFor="billing-legal-name">
            Razón social
          </label>
          <input
            id="billing-legal-name"
            className="set-field"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="billing-tax-id">
            NIF
          </label>
          <input
            id="billing-tax-id"
            className="set-field"
            value={taxId}
            onChange={(event) => setTaxId(event.target.value)}
          />
        </div>
      </div>

      <div className="set-actions">
        <Button type="button" variant="outline" onClick={save} disabled={isSaving}>
          {isSaving ? "Guardando…" : "Guardar facturación"}
        </Button>
      </div>

      {feedback && (
        <div
          className={feedback.type === "err" ? "field-err" : "field-ok"}
          style={{ justifyContent: "flex-start", marginTop: 8 }}
        >
          {feedback.type === "err" && <Icon name="alertCircle" size={13} />}
          {feedback.text}
        </div>
      )}
    </SettingsFold>
  );
}
