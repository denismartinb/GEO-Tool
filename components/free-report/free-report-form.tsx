"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { requestFreeReport } from "@/app/gratis/informe-geo/actions";
import { FREE_REPORT_FIELDS } from "@/lib/free-report/request";
import type { FreeReportState } from "@/lib/free-report/submit";
import { PROMO_REQUESTED_KEY } from "@/lib/free-report/promo";

/**
 * FREE-REPORT-1 Fase 1 — the hero, the form and its confirmation.
 *
 * Owns the whole hero because the confirmation replaces it: once the request
 * is in, the selling copy below (`children`) has done its job and goes away,
 * same reasoning as `FreeCheckerForm`. Design: `docs/design-reference/
 * free-report-1/` (approved by the founder 2026-10-09).
 *
 * The button is never painted disabled (log §113): a grey CTA before the
 * visitor has done anything reads as broken. Validation answers after the
 * click, next to the field that needs fixing.
 */

const INITIAL: FreeReportState = { status: "idle" };

function CheckIcon({ color = "#09c5d6" }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="fr-check">
      <path d="M4 10.5 L8 14 L16 6" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FreeReportForm({ children }: { children?: ReactNode }) {
  const [state, formAction, pending] = useActionState(requestFreeReport, INITIAL);
  // Set after mount: the server render must not bake a timestamp into the HTML
  // cache, and a bot that never runs JS keeps 0, which the server rejects.
  const [renderedAt, setRenderedAt] = useState("0");
  const [source, setSource] = useState("");
  // Controlled on purpose: React resets an uncontrolled form after its action
  // runs, so a visitor who mistyped the email would lose all three fields.
  const [values, setValues] = useState({ domain: "", email: "", business: "", marketing: false });
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRenderedAt(String(Date.now()));
    const params = new URLSearchParams(window.location.search);
    // `desde` tags the GenScore page that sent the visitor (FREE-REPORT-2).
    const parts = [params.get("utm_source"), params.get("utm_campaign"), params.get("desde")].filter(Boolean);
    setSource(parts.join(" / "));
  }, []);

  useEffect(() => {
    if (state.status !== "ok") return;
    topRef.current?.scrollIntoView({ block: "start" });
    // The corner card on content pages never comes back once asked for.
    try {
      window.localStorage.setItem(PROMO_REQUESTED_KEY, "1");
    } catch {
      // Unavailable storage only means the card may show again.
    }
  }, [state.status]);

  if (state.status === "ok") {
    return (
      <div ref={topRef} className="fr-hero fr-hero--done">
        <div className="fr-done" role="status">
          <span className="fr-done-badge">
            <CheckIcon color="#0e7490" />
          </span>
          <h1 className="fr-done-title">Recibido. Nos ponemos con {state.domain || "tu web"}</h1>
          <p className="fr-done-lede">
            Te enviaremos el informe{state.email ? <> a <strong>{state.email}</strong></> : null} en 48 h laborables.
            Acabamos de mandarte un correo de confirmación: si no lo ves, mira en promociones o spam.
          </p>
          <div className="fr-done-next">
            <strong>Qué pasa ahora</strong>
            <ol>
              <li>Hacemos las preguntas principales de búsqueda de tu sector a ChatGPT, Gemini y Claude.</li>
              <li>Una persona revisa los resultados.</li>
              <li>Te llega el PDF con tres acciones para empezar.</li>
            </ol>
          </div>
          <div className="fr-done-ctas">
            <Link href="/gratis/aparece-mi-marca-en-chatgpt" className="fr-btn">
              Mientras, prueba el comprobador gratis
            </Link>
            <Link href="/pricing" className="fr-btn fr-btn--ghost">
              Ver precios
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const fieldError = state.status === "error" ? state.field : undefined;
  const generalError = state.status === "error" && !state.field ? state.message : null;
  const errorFor = (field: string) =>
    state.status === "error" && (fieldError === field || (field === "email" && fieldError === "email_disposable"))
      ? state.message
      : null;

  const domainError = errorFor("domain");
  const emailError = errorFor("email");
  const businessError = errorFor("business");

  return (
    <>
      <section className="fr-hero" ref={topRef}>
        <div className="fr-hero-inner">
          <div className="fr-hero-copy">
            <span className="fr-pill">Informe gratuito · ChatGPT, Gemini y Claude</span>
            <div className="fr-ask" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 20 20">
                <circle cx="8.5" cy="8.5" r="5.5" stroke="#8fe9f1" strokeWidth="2" fill="none" />
                <path d="M13 13 L17 17" stroke="#8fe9f1" strokeWidth="2" strokeLinecap="round" />
              </svg>
              «¿Qué empresa me recomiendas para…?»<span className="fr-caret" />
            </div>
            <h1 className="fr-title">
              Cuando tu cliente le pregunta a la IA, <span className="fr-grad">¿te nombra a ti o a tu competencia?</span>
            </h1>
            <p className="fr-lede">
              Te preparamos un informe de tu marca: en qué preguntas principales de búsqueda apareces, a quién
              recomienda la IA en tu lugar, qué fuentes cita y qué cambiar primero.
            </p>
            <ul className="fr-bullets">
              <li>
                <CheckIcon />
                PDF de marca, listo para enseñar a tu equipo o a tu cliente
              </li>
              <li>
                <CheckIcon />
                Revisado por una persona antes de enviártelo
              </li>
              <li>
                <CheckIcon />
                En tu correo en 48 h laborables. Sin tarjeta, sin compromiso
              </li>
            </ul>
          </div>

          <form className="fr-form" action={formAction} noValidate>
            <div className="fr-form-head">
              <h2>Pide tu informe GEO gratis</h2>
              <p>Tres datos y nos ponemos con ello.</p>
            </div>

            <label className="fr-field">
              Tu web
              <input
                type="text"
                name={FREE_REPORT_FIELDS.domain}
                value={values.domain}
                onChange={(e) => setValues((v) => ({ ...v, domain: e.target.value }))}
                placeholder="tuempresa.es"
                autoComplete="url"
                inputMode="url"
                required
                aria-invalid={domainError ? true : undefined}
                aria-describedby={domainError ? "fr-err-domain" : undefined}
              />
              {domainError && (
                <span className="fr-err" id="fr-err-domain">
                  {domainError}
                </span>
              )}
            </label>

            <label className="fr-field">
              Email de trabajo
              <input
                type="email"
                name={FREE_REPORT_FIELDS.email}
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                placeholder="nombre@tuempresa.es"
                autoComplete="email"
                required
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "fr-err-email" : undefined}
              />
              {emailError && (
                <span className="fr-err" id="fr-err-email">
                  {emailError}
                </span>
              )}
            </label>

            <label className="fr-field">
              ¿Qué vendes?
              <textarea
                name={FREE_REPORT_FIELDS.business}
                value={values.business}
                onChange={(e) => setValues((v) => ({ ...v, business: e.target.value }))}
                rows={2}
                maxLength={300}
                placeholder="Ej.: software de facturación para autónomos"
                required
                aria-invalid={businessError ? true : undefined}
                aria-describedby={businessError ? "fr-err-business fr-hint-business" : "fr-hint-business"}
              />
              <span className="fr-hint" id="fr-hint-business">
                Una frase basta. Con ella elegimos las preguntas principales de búsqueda de tu sector.
              </span>
              {businessError && (
                <span className="fr-err" id="fr-err-business">
                  {businessError}
                </span>
              )}
            </label>

            {/* Honeypot: off-screen and out of the tab order; people never fill it. */}
            <div className="fr-hp" aria-hidden="true">
              <label>
                Web de tu empresa
                <input type="text" name={FREE_REPORT_FIELDS.website} tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
            </div>
            <input type="hidden" name={FREE_REPORT_FIELDS.renderedAt} value={renderedAt} />
            <input type="hidden" name={FREE_REPORT_FIELDS.source} value={source} />

            {generalError && (
              <p className="fr-err fr-err--general" role="alert">
                {generalError}
              </p>
            )}

            <button type="submit" className="fr-submit" aria-busy={pending || undefined}>
              {pending ? "Enviando…" : "Pedir mi informe gratis"}
            </button>

            <label className="fr-consent">
              <input
                type="checkbox"
                name={FREE_REPORT_FIELDS.marketing}
                checked={values.marketing}
                onChange={(e) => setValues((v) => ({ ...v, marketing: e.target.checked }))}
              />
              Envíame también los estudios de GenScore sobre qué marcas recomienda la IA, y novedades de vez en cuando. Me doy de baja cuando quiera.
            </label>
            <p className="fr-legal">
              Al enviar aceptas la <Link href="/privacidad">Política de privacidad</Link>. GenScore tratará tus datos
              para preparar tu informe y atender tu solicitud. Un informe por dominio.
            </p>
          </form>
        </div>
      </section>
      {children}
    </>
  );
}
