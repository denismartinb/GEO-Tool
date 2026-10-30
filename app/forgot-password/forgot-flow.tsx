"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Ic } from "@/components/ins/ic";
import { AU_N, bumpAuthEnergy, setAuthState } from "@/components/ins/auth/fx";
import { OtpInput } from "@/components/ins/auth/parts";
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
const STRENGTH_COL = ["var(--warm)", "var(--warm)", "var(--warm)", "var(--blue)", "var(--pos)"];

type Step = "request" | "sent" | "reset" | "success";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Spin() {
  return <span className="au-spin" aria-hidden="true" />;
}

function ErrorLine({ msg }: { msg: string }) {
  return (
    <div className="au-fail" role="alert">
      <Ic n="warn" sm />
      {msg}
    </div>
  );
}

export function ForgotFlow() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [secs, setSecs] = useState(0);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (secs <= 0) return;
    const tm = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(tm);
  }, [secs]);

  useEffect(() => {
    setAuthState(step === "request" ? 0 : AU_N / 2, step === "success");
  }, [step]);

  const emailOk = EMAIL_RE.test(email.trim());

  const goSent = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendOtpAction(email);
      if (result.error) { setError(result.error); return; }
      setStep("sent");
      setSecs(30);
      setCode("");
    });
  };

  const goResend = () => {
    setError(null);
    startTransition(async () => {
      await sendOtpAction(email);
      setSecs(30);
      setCode("");
    });
  };

  const goVerify = () => {
    setError(null);
    startTransition(async () => {
      const result = await verifyOtpAction(email, code);
      if (result.error) { setError(result.error); return; }
      setStep("reset");
      setPw(""); setPw2("");
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

  const reqOk = PW_REQS.map((r) => r.test(pw));
  const score = reqOk.filter(Boolean).length;
  const match = pw.length > 0 && pw === pw2;
  const canReset = score >= 3 && match;

  if (step === "request") {
    return (
      <div key="request" className="au-step">
        <h1 className="au-t">Recupera tu contraseña</h1>
        <p className="au-s">Te enviamos un código a tu email.</p>
        {error ? <ErrorLine msg={error} /> : null}
        <form
          className="au-f au-fg"
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (emailOk && !isPending) goSent(); }}
        >
          <div className="au-fld">
            <div className="au-fh"><label htmlFor="fe">Email</label></div>
            <div className="au-iw">
              <input
                id="fe"
                className="au-in au-em"
                type="email"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(e) => { setEmail(e.target.value); bumpAuthEnergy(); }}
                placeholder="nombre@empresa.com"
                autoFocus
              />
            </div>
          </div>
          <button type="submit" className={`au-btn au-p${isPending ? " loading" : ""}`} disabled={!emailOk || isPending}>
            <Spin /><span className="lbl">{isPending ? "Enviando…" : "Enviar código"}</span>
          </button>
        </form>
        <p className="au-alt"><Link href="/login">Volver a iniciar sesión</Link></p>
      </div>
    );
  }

  if (step === "sent") {
    return (
      <div key="sent" className="au-step">
        <h1 className="au-t">Revisa tu correo</h1>
        <p className="au-s">Te hemos enviado un código de 6 dígitos a <b>{email}</b>.</p>
        {error ? <ErrorLine msg={error} /> : null}
        <form
          className="au-step-form"
          onSubmit={(e) => { e.preventDefault(); if (code.length === 6 && !isPending) goVerify(); }}
        >
          <OtpInput label="Código de 6 dígitos" value={code} onChange={(c) => { setCode(c); bumpAuthEnergy(); }} />
          <button type="submit" className={`au-btn au-p${isPending ? " loading" : ""}`} disabled={code.length < 6 || isPending}>
            <Spin /><span className="lbl">{isPending ? "Verificando…" : "Verificar código"}</span>
          </button>
        </form>
        <p className="au-alt">
          {secs > 0 ? (
            <span>Reenviar código en {secs} s</span>
          ) : (
            <button type="button" className="au-lnk-inline" onClick={() => { if (!isPending) goResend(); }}>
              Reenviar código
            </button>
          )}
        </p>
        <p className="au-back">
          <button type="button" onClick={() => { setStep("request"); setError(null); }}>Usar otro email</button>
        </p>
      </div>
    );
  }

  if (step === "reset") {
    const pct = (score / 4) * 100;
    return (
      <div key="reset" className="au-step">
        <h1 className="au-t">Crea una contraseña nueva</h1>
        <p className="au-s">Una que no hayas usado antes.</p>
        <form
          className="au-f"
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (canReset && !isPending) goUpdate(); }}
        >
          <div className="au-fld">
            <div className="au-fh"><label htmlFor="np1">Nueva contraseña</label></div>
            <div className="au-iw">
              <input
                id="np1"
                className="au-in"
                type={shown ? "text" : "password"}
                autoComplete="new-password"
                value={pw}
                onChange={(e) => { setPw(e.target.value); bumpAuthEnergy(); }}
                autoFocus
              />
              <button
                type="button"
                className="au-eye"
                aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={shown}
                onClick={() => setShown((s) => !s)}
              >
                <Ic n="eye" sm />
              </button>
            </div>
          </div>
          {pw ? (
            <div className="au-str" style={{ color: STRENGTH_COL[score] }}>
              <div
                className="tb thin lit"
                style={{ ["--w" as string]: `${pct}%`, ["--c" as string]: STRENGTH_COL[score] }}
                role="img"
                aria-label={`Seguridad: ${STRENGTH_LBL[score] || "muy débil"}`}
              >
                <i /><b />
              </div>
              <span>{STRENGTH_LBL[score] || "Débil"}</span>
            </div>
          ) : null}
          <ul className="au-chk">
            {PW_REQS.map((r, i) => (
              <li key={r.id} className={reqOk[i] ? "ok" : ""}>
                <Ic n={reqOk[i] ? "checkc" : "c-dot"} sm />
                {r.label}
              </li>
            ))}
          </ul>
          <div className={`au-fld${pw2 && !match ? " bad" : ""}`}>
            <div className="au-fh"><label htmlFor="np2">Repite la contraseña</label></div>
            <div className="au-iw">
              <input
                id="np2"
                className="au-in"
                type={shown ? "text" : "password"}
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>
            <div className="au-err" aria-live="polite">
              {pw2 && !match ? "Las contraseñas no coinciden." : match && score < 3 ? "Tu contraseña debe cumplir al menos 3 de los 4 requisitos." : ""}
            </div>
          </div>
          {error ? <ErrorLine msg={error} /> : null}
          <button type="submit" className={`au-btn au-p${isPending ? " loading" : ""}`} disabled={!canReset || isPending}>
            <Spin /><span className="lbl">{isPending ? "Guardando…" : "Guardar contraseña"}</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div key="success" className="au-step">
      <h1 className="au-t">Contraseña actualizada</h1>
      <p className="au-s">Ya puedes entrar con ella.</p>
      <Link href="/login" className="au-btn au-p"><span className="lbl">Iniciar sesión</span></Link>
    </div>
  );
}
