"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { updateOrganization } from "@/app/dashboard/settings/organization/actions";
import type { CompanyDetails } from "@/lib/settings/company-details";

type Feedback = { type: "ok" | "err"; text: string };

/**
 * CONSOLE-REDESIGN-1. What used to be the whole "Organización" screen, now a
 * fold inside Cuenta, closed by default (founder, 2026-08-06: "quiero que tenga
 * menos protagonismo, puede ir dentro de perfil de forma opcional y plegada").
 *
 * The fiscal fields are NOT here — they moved to the Plan section, because they
 * exist for the invoice. The logo upload is gone entirely: it had no backend
 * and a disabled button promising "Próximamente" is still a control that does
 * nothing.
 *
 * A real `aria-expanded` button rather than <details>/<summary> so the pilot's
 * interaction sweep can find and open it (same reason as the notifications
 * bell, log §28).
 */
export function CompanyFold({ initial, readOnly }: { initial: CompanyDetails; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [website, setWebsite] = useState(initial.website);
  const [sector, setSector] = useState(initial.sector);

  const [isSaving, startSaving] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const save = () => {
    setFeedback(null);
    startSaving(async () => {
      const result = await updateOrganization(name, website, sector);
      setFeedback(result.success ? { type: "ok", text: "Guardado." } : { type: "err", text: result.error });
    });
  };

  return (
    <div className="set-fold">
      <button
        type="button"
        className="set-fold-h"
        aria-expanded={open}
        aria-controls="company-fold-body"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`set-caret ${open ? "open" : ""}`} aria-hidden="true" />
        <span className="set-fold-t">Datos de empresa</span>
        <span className="set-fold-d">Opcional</span>
      </button>

      {open && (
        <div className="set-fold-b" id="company-fold-body">
          <div className="set-form-grid">
            <div>
              <label className="field-label" htmlFor="company-name">
                Nombre
              </label>
              <input
                id="company-name"
                className="set-field"
                value={name}
                disabled={readOnly}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="company-website">
                Sitio web
              </label>
              <input
                id="company-website"
                className="set-field"
                value={website}
                disabled={readOnly}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="company-sector">
                Sector
              </label>
              <input
                id="company-sector"
                className="set-field"
                value={sector}
                disabled={readOnly}
                onChange={(event) => setSector(event.target.value)}
              />
            </div>
          </div>

          {!readOnly && (
            <div className="set-actions">
              <Button type="button" onClick={save} disabled={isSaving}>
                {isSaving ? "Guardando…" : "Guardar empresa"}
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
        </div>
      )}
    </div>
  );
}
