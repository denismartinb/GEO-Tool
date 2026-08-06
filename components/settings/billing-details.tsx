"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { updateBillingDetails } from "@/app/dashboard/settings/organization/actions";
import type { BillingDetails as BillingDetailsValue } from "@/lib/settings/company-details";

type Feedback = { type: "ok" | "err"; text: string };

/**
 * CONSOLE-REDESIGN-1. Razón social + NIF, in the Plan section rather than in
 * the personal profile.
 *
 * A NIF gets filled in when someone is about to pay, and that is exactly the
 * moment they are looking at Plan — asking for it on the identity screen asks
 * for it where nobody needs it. It replaces the old single free-text "Datos
 * fiscales" field, which never said what to write inside.
 *
 * Open by default, unlike the company fold: these two fields have a real
 * destination (the invoice), so hiding them behind a click would bury the one
 * part of the old Organización screen that was actually load-bearing.
 */
export function BillingDetailsForm({ initial }: { initial: BillingDetailsValue }) {
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
    <div className="set-billing-details">
      <p className="set-billing-details-t">Datos de facturación</p>
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
          {isSaving ? "Guardando…" : "Guardar datos de facturación"}
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
    </div>
  );
}
