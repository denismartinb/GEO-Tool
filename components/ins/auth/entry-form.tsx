"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AU_N, bumpAuthEnergy, setAuthState } from "./fx";
import { EyeButton, FieldError, GoogleLogo, SubmitButton } from "./parts";
import { Ic } from "@/components/ins/ic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Two-step entry form of Bruma: email first, then password. Step one is a
 * local check (nothing is sent), step two submits the real server action, so
 * the credentials and the redirect rules stay exactly where they were.
 * Server errors arrive as `?error=` and are shown above the form.
 */
export function EntryForm({
  mode,
  action,
  googleAction,
  next,
  error
}: {
  mode: "login" | "signup";
  action: (formData: FormData) => void | Promise<void>;
  googleAction: (formData: FormData) => void | Promise<void>;
  next?: string | null;
  error?: string | null;
}) {
  const signup = mode === "signup";
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [shown, setShown] = useState(false);
  const [emailErr, setEmailErr] = useState("");
  const [pwErr, setPwErr] = useState("");
  const emailRef = useRef<HTMLInputElement | null>(null);
  const pwRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 120);
    return () => clearTimeout(t);
  }, []);

  const goStep = (n: 1 | 2) => {
    setStep(n);
    if (n === 2) {
      setAuthState(AU_N / 2);
      setTimeout(() => pwRef.current?.focus({ preventScroll: true }), 260);
    } else {
      setPw("");
      setPwErr("");
      setAuthState(0);
      setTimeout(() => emailRef.current?.focus(), 0);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const v = email.trim();
    if (step === 1) {
      e.preventDefault();
      const msg = !v ? "Escribe tu email." : !EMAIL_RE.test(v) ? "Revisa el email: parece incompleto." : "";
      setEmailErr(msg);
      if (msg) {
        emailRef.current?.focus();
        return;
      }
      goStep(2);
      return;
    }
    if (!pw) {
      e.preventDefault();
      setPwErr("Escribe tu contraseña.");
      pwRef.current?.focus();
      return;
    }
    if (signup && pw.length < 8) {
      e.preventDefault();
      setPwErr("Usa al menos 8 caracteres.");
      pwRef.current?.focus();
      return;
    }
    setAuthState(AU_N, true);
  };

  const cta = step === 1 ? "Continuar" : signup ? "Crear cuenta" : "Iniciar sesión";
  const busy = signup ? "Creando tu cuenta…" : "Entrando…";

  return (
    <>
      {error ? (
        <div className="au-fail" role="alert">
          <Ic n="warn" sm />
          {error}
        </div>
      ) : null}
      <form action={action} onSubmit={onSubmit} className="au-f" data-step={step} noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {signup ? <input type="hidden" name="confirmPassword" value={pw} /> : null}
        <div className={`au-fld${emailErr ? " bad" : ""}`}>
          <div className="au-fh">
            <label htmlFor={`${mode}-em`}>Email</label>
          </div>
          <div className="au-iw">
            <input
              ref={emailRef}
              className="au-in au-em"
              id={`${mode}-em`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="nombre@empresa.com"
              value={email}
              readOnly={step === 2}
              onChange={(e) => {
                setEmail(e.target.value);
                bumpAuthEnergy();
                if (emailErr) setEmailErr("");
              }}
            />
            <button type="button" className="au-chg" onClick={() => goStep(1)} tabIndex={step === 2 ? 0 : -1}>
              Cambiar
            </button>
          </div>
          <FieldError msg={emailErr} />
        </div>
        <div className="au-rv">
          <div>
            <div className={`au-fld${pwErr ? " bad" : ""}`}>
              <div className="au-fh">
                <label htmlFor={`${mode}-pw`}>{signup ? "Elige una contraseña" : "Contraseña"}</label>
                {!signup ? <Link href="/forgot-password" tabIndex={step === 2 ? 0 : -1}>¿Olvidaste tu contraseña?</Link> : null}
              </div>
              <div className="au-iw">
                <input
                  ref={pwRef}
                  className="au-in au-pw"
                  id={`${mode}-pw`}
                  name="password"
                  type={shown ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder={signup ? "Al menos 8 caracteres" : "Tu contraseña"}
                  tabIndex={step === 2 ? 0 : -1}
                  value={pw}
                  onChange={(e) => {
                    setPw(e.target.value);
                    bumpAuthEnergy();
                    if (pwErr) setPwErr("");
                  }}
                />
                <EyeButton shown={shown} onToggle={() => setShown((s) => !s)} />
              </div>
              <FieldError msg={pwErr} />
            </div>
          </div>
        </div>
        <SubmitButton pendingLabel={busy}>{cta}</SubmitButton>
      </form>
      <div className="au-or">
        <span>o</span>
      </div>
      <form action={googleAction} style={{ width: "100%" }}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {signup ? <input type="hidden" name="from" value="signup" /> : null}
        <SubmitButton pendingLabel="Conectando con Google…" className="au-btn au-g">
          <GoogleLogo />
          Continuar con Google
        </SubmitButton>
      </form>
    </>
  );
}
