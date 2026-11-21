"use client";

import { useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Ic } from "@/components/ins/ic";

/** Primary button that shows the spinner while its form action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "au-btn au-p",
  disabled
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${className}${pending ? " loading" : ""}`} disabled={pending || disabled}>
      <span className="au-spin" aria-hidden="true" />
      <span className="lbl">{pending ? pendingLabel : children}</span>
    </button>
  );
}

export function GoogleLogo() {
  return (
    <svg width="18" height="18" aria-hidden="true">
      <use href="#e-google" />
    </svg>
  );
}

/** Show/hide button that sits inside a password field. */
export function EyeButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="au-eye"
      aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
      aria-pressed={shown}
      onClick={onToggle}
    >
      <Ic n="eye" sm />
    </button>
  );
}

export function FieldError({ msg }: { msg: string }) {
  return (
    <div className="au-err" aria-live="polite">
      {msg}
    </div>
  );
}

/**
 * Six one-digit boxes. Writes the joined code into a hidden input named
 * `name`, so it works inside a plain server-action form, and also reports it
 * to `onChange` for client flows.
 */
export function OtpInput({
  name,
  label,
  value,
  onChange,
  autoFocus = true
}: {
  name?: string;
  label: string;
  value?: string;
  onChange?: (code: string) => void;
  autoFocus?: boolean;
}) {
  const [inner, setInner] = useState("");
  const code = value ?? inner;
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => code[i] ?? "");

  const commit = (next: string[]) => {
    const joined = next.join("");
    setInner(joined);
    onChange?.(joined);
  };
  const onDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    commit(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent) => {
    const txt = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!txt) return;
    e.preventDefault();
    const next = Array.from({ length: 6 }, (_, k) => txt[k] ?? "");
    commit(next);
    refs.current[Math.min(txt.length, 6) - 1]?.focus();
  };

  return (
    <div className="au-otp-w">
      {name ? <input type="hidden" name={name} value={code} /> : null}
      <div className="au-otp" role="group" aria-label={label} onPaste={onPaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            aria-label={`Dígito ${i + 1}`}
            value={d}
            autoFocus={autoFocus && i === 0}
            onChange={(e) => onDigit(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
          />
        ))}
      </div>
    </div>
  );
}
