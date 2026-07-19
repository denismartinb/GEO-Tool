"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PassField } from "@/components/ui/pass-field";
import { sendOtpAction, verifyOtpAction, updatePasswordAction } from "./actions";

const PW_REQS = [
  { id: "len", label: "Al menos 8 caracteres", test: (p: string) => p.length >= 8 },
  {
    id: "case",
    label: "Mayúsculas y minúsculas",
    test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  { id: "num", label: "Un número", test: (p: string) => /\d/.test(p) },
  {
    id: "sym",
    label: "Un símbolo (!@#$…)",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
] as const;

// Level 2 must NOT read as sufficient: the submit gate below requires
// score >= 3, so calling 2/4 "Aceptable" told users a blocked password was
// fine (founder-reported bug: matching passwords + always-solid button).
const STRENGTH_LBL = ["", "Débil", "Insuficiente", "Buena", "Fuerte"];
const STRENGTH_COL = ["", "var(--neg)", "var(--warn)", "#4f9bd9", "var(--pos)"];

type Step = "request" | "sent" | "reset" | "success";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [secs, setSecs] = useState(0);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (secs <= 0) return;
    const tm = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(tm);
  }, [secs]);

  const goSent = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendOtpAction(email);
      if (result.error) { setError(result.error); return; }
      setStep("sent");
      setSecs(30);
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => refs.current[0]?.focus(), 60);
    });
  };

  const goResend = () => {
    setError(null);
    startTransition(async () => {
      await sendOtpAction(email);
      setSecs(30);
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => refs.current[0]?.focus(), 60);
    });
  };

  const goVerify = () => {
    setError(null);
    startTransition(async () => {
      const result = await verifyOtpAction(email, code.join(""));
      if (result.error) { setError(result.error); return; }
      setStep("reset");
      setPw(""); setPw2(""); setTouched(false);
    });
  };

  const goUpdate = () => {
    setError(null);
    startTransition(async () => {
      const result = await updatePasswordAction(pw);
      if (result.error) { setError(result.error); return; }
      setStep("success");
    });
  };

  const codeFull = code.every((c) => c !== "");

  const onCodeChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...code]; next[i] = d; setCode(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const onCodeKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const onCodePaste = (e: React.ClipboardEvent) => {
    const txt = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!txt) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    txt.split("").forEach((c, k) => (next[k] = c));
    setCode(next);
    refs.current[Math.min(txt.length, 6) - 1]?.focus();
  };

  const reqOk = PW_REQS.map((r) => r.test(pw));
  const score = reqOk.filter(Boolean).length;
  const match = pw.length > 0 && pw === pw2;
  const canReset = score >= 3 && match;

  return (
    <main className="auth-bg">
      <div className="auth-card fade-in" key={step}>
        <div className="auth-logo">
          <BrandLogo size={20} />
        </div>

        {step === "request" && (
          <>
            <div className="auth-h1">¿Olvidaste tu contraseña?</div>
            <div className="auth-sub">
              Introduce el email asociado a tu cuenta y te enviaremos un código para
              restablecerla.
            </div>
            <form
              className="auth-form"
              onSubmit={(e) => { e.preventDefault(); if (email && !isPending) goSent(); }}
            >
              <div>
                <label className="field-label" htmlFor="reset-email">
                  Email de trabajo
                </label>
                <input
                  id="reset-email"
                  className="field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@empresa.com"
                  autoFocus
                  required
                />
              </div>
              {error && <p className="field-err"><Icon name="alertCircle" size={13} />{error}</p>}
              <button
                type="submit"
                className="btn btn-primary auth-btn"
                disabled={!email || isPending}
              >
                {isPending ? "Enviando…" : "Enviar código de recuperación"}
              </button>
            </form>
            <div className="auth-alt">
              ¿Recuerdas tu contraseña?{" "}
              <Link href="/login">Inicia sesión</Link>
            </div>
          </>
        )}

        {step === "sent" && (
          <>
            <div className="auth-icon-badge">
              <Icon name="mail" size={28} />
            </div>
            <div className="auth-h1">Revisa tu correo</div>
            <div className="auth-sub">
              Hemos enviado un código de 6 dígitos a{" "}
              <span className="auth-email-tag">{email}</span>. Introdúcelo para
              continuar.
            </div>
            <form
              className="auth-form"
              onSubmit={(e) => { e.preventDefault(); if (codeFull && !isPending) goVerify(); }}
            >
              <div className="otp-row" onPaste={onCodePaste}>
                {code.map((c, i) => (
                  <input
                    key={i}
                    ref={(el) => { refs.current[i] = el; }}
                    className={c ? "filled" : ""}
                    inputMode="numeric"
                    maxLength={1}
                    value={c}
                    onChange={(e) => onCodeChange(i, e.target.value)}
                    onKeyDown={(e) => onCodeKey(i, e)}
                    aria-label={`Dígito ${i + 1}`}
                  />
                ))}
              </div>
              {error && <p className="field-err"><Icon name="alertCircle" size={13} />{error}</p>}
              <button
                type="submit"
                className="btn btn-primary auth-btn"
                disabled={!codeFull || isPending}
              >
                {isPending ? "Verificando…" : "Verificar código"}
              </button>
            </form>
            <div className="auth-resend">
              {secs > 0 ? (
                <span className="muted">Reenviar código en {secs}s</span>
              ) : (
                <>
                  ¿No lo recibiste?{" "}
                  <a
                    role="button"
                    onClick={() => { if (!isPending) goResend(); }}
                    style={{ cursor: "pointer" }}
                  >
                    Reenviar código
                  </a>
                </>
              )}
            </div>
            <div className="auth-alt">
              <a
                role="button"
                onClick={() => { setStep("request"); setError(null); }}
                style={{ cursor: "pointer" }}
              >
                ← Usar otro email
              </a>
            </div>
          </>
        )}

        {step === "reset" && (
          <>
            <div className="auth-h1">Crea una contraseña nueva</div>
            <div className="auth-sub">Elige una contraseña segura que no hayas usado antes.</div>
            <form
              className="auth-form"
              onSubmit={(e) => { e.preventDefault(); if (canReset && !isPending) goUpdate(); }}
            >
              <div>
                <PassField
                  label="Nueva contraseña"
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setTouched(true); }}
                  placeholder="••••••••"
                  autoFocus
                />
                {touched && pw && (
                  <>
                    <div className={`pw-meter s${score}`}>
                      <i /><i /><i /><i />
                    </div>
                    <div
                      className="pw-meter-lbl"
                      style={{ color: STRENGTH_COL[score] ?? "var(--ink-4)" }}
                    >
                      {STRENGTH_LBL[score]}
                    </div>
                  </>
                )}
                <ul className="pw-reqs">
                  {PW_REQS.map((r, i) => (
                    <li key={r.id} className={reqOk[i] ? "ok" : ""}>
                      <span className="chk">
                        <Icon name="check" size={11} />
                      </span>
                      {r.label}
                    </li>
                  ))}
                </ul>
              </div>
              <PassField
                label="Repite la contraseña"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="••••••••"
              />
              {pw2 && !match && (
                <div className="field-err">
                  <Icon name="x" size={13} />
                  Las contraseñas no coinciden
                </div>
              )}
              {match && score < 3 && (
                <div className="field-err">
                  <Icon name="alertCircle" size={13} />
                  Tu contraseña debe cumplir al menos 3 de los 4 requisitos.
                </div>
              )}
              {error && <p className="field-err"><Icon name="alertCircle" size={13} />{error}</p>}
              <button
                type="submit"
                className="btn btn-primary auth-btn"
                disabled={!canReset || isPending}
              >
                {isPending ? "Guardando…" : "Restablecer contraseña"}
              </button>
            </form>
          </>
        )}

        {step === "success" && (
          <>
            <div className="auth-icon-badge pos">
              <Icon name="check" size={30} />
            </div>
            <div className="auth-h1">Contraseña actualizada</div>
            <div className="auth-sub">
              Tu contraseña se ha restablecido correctamente. Ya puedes iniciar sesión
              con tus nuevas credenciales.
            </div>
            <div className="auth-form">
              <Link href="/login" className="btn btn-primary auth-btn" style={{ textDecoration: "none" }}>
                Iniciar sesión
              </Link>
            </div>
          </>
        )}

        <div className="auth-legal">
          Al continuar, aceptas nuestros Términos y la Política de privacidad.
        </div>
      </div>
    </main>
  );
}
