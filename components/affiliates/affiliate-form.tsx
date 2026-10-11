"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { applyAsAffiliate } from "@/app/afiliados/actions";
import { AFFILIATE_FIELDS } from "@/lib/affiliates/request";
import type { AffiliateApplyState } from "@/lib/affiliates/submit";

/**
 * AFFILIATES-1 — the application form inside the dark hero of `/afiliados`.
 *
 * Same contract as `FreeReportForm`: controlled fields (React resets an
 * uncontrolled form after its action runs), a honeypot, `rendered_at` set
 * after mount, and the UTM source for the operator. The confirmation only
 * appears when the operator email was accepted (`submitAffiliateApplicationCore`).
 * The button is never painted disabled (log §113).
 */

const INITIAL: AffiliateApplyState = { status: "idle" };

export function AffiliateForm() {
  const [state, formAction, pending] = useActionState(applyAsAffiliate, INITIAL);
  const [renderedAt, setRenderedAt] = useState("0");
  const [source, setSource] = useState("");
  const [values, setValues] = useState({ name: "", email: "", channel: "" });
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRenderedAt(String(Date.now()));
    const params = new URLSearchParams(window.location.search);
    const parts = [params.get("utm_source"), params.get("utm_campaign")].filter(Boolean);
    setSource(parts.join(" / "));
  }, []);

  useEffect(() => {
    if (state.status === "ok") doneRef.current?.focus();
  }, [state.status]);

  if (state.status === "ok") {
    return (
      <div className="af-done" role="status" tabIndex={-1} ref={doneRef}>
        <strong>Solicitud recibida{state.name ? `, ${state.name}` : ""}.</strong>
        <p>
          La revisamos y te escribimos{state.email ? <> a <span className="af-done-email">{state.email}</span></> : null} con
          tu enlace propio. Te acabamos de mandar un correo de confirmación: si no lo ves, mira en promociones o spam.
        </p>
      </div>
    );
  }

  const fieldError = state.status === "error" ? state.field : undefined;
  const generalError = state.status === "error" && !state.field ? state.message : null;
  const errorFor = (field: string) =>
    state.status === "error" && (fieldError === field || (field === "email" && fieldError === "email_disposable"))
      ? state.message
      : null;
  const nameError = errorFor("name");
  const emailError = errorFor("email");
  const channelError = errorFor("channel");

  return (
    <form className="af-form" action={formAction} noValidate aria-label="Solicitud de afiliado">
      <label className="af-field">
        <span className="af-label">Tu nombre</span>
        <input
          type="text"
          name={AFFILIATE_FIELDS.name}
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          placeholder="Tu nombre"
          autoComplete="name"
          maxLength={80}
          required
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "af-err-name" : undefined}
        />
        {nameError && (
          <span className="af-err" id="af-err-name">
            {nameError}
          </span>
        )}
      </label>

      <label className="af-field">
        <span className="af-label">Email</span>
        <input
          type="email"
          name={AFFILIATE_FIELDS.email}
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          placeholder="Email"
          autoComplete="email"
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "af-err-email" : undefined}
        />
        {emailError && (
          <span className="af-err" id="af-err-email">
            {emailError}
          </span>
        )}
      </label>

      <label className="af-field">
        <span className="af-label">Tu web, newsletter o perfil</span>
        <input
          type="text"
          name={AFFILIATE_FIELDS.channel}
          value={values.channel}
          onChange={(e) => setValues((v) => ({ ...v, channel: e.target.value }))}
          placeholder="Tu web, newsletter o perfil"
          autoComplete="url"
          maxLength={200}
          required
          aria-invalid={channelError ? true : undefined}
          aria-describedby={channelError ? "af-err-channel" : undefined}
        />
        {channelError && (
          <span className="af-err" id="af-err-channel">
            {channelError}
          </span>
        )}
      </label>

      {/* Honeypot: off-screen and out of the tab order; people never fill it. */}
      <div className="af-hp" aria-hidden="true">
        <label>
          Web de tu empresa
          <input type="text" name={AFFILIATE_FIELDS.website} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <input type="hidden" name={AFFILIATE_FIELDS.renderedAt} value={renderedAt} />
      <input type="hidden" name={AFFILIATE_FIELDS.source} value={source} />

      {generalError && (
        <p className="af-err af-err--general" role="alert">
          {generalError}
        </p>
      )}

      <button type="submit" className="af-submit" aria-busy={pending || undefined}>
        {pending ? "Enviando…" : "Quiero ser afiliado"}
      </button>

      <p className="af-legal">
        Al enviar aceptas la <Link href="/privacidad">Política de privacidad</Link>. Usaremos estos datos para revisar tu
        solicitud y escribirte sobre el programa.
      </p>
    </form>
  );
}
