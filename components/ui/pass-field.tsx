"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

interface PassFieldProps {
  label?: string;
  id?: string;
  name?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  rightSlot?: ReactNode;
  autoFocus?: boolean;
  required?: boolean;
}

export function PassField({
  label,
  id,
  name,
  value,
  onChange,
  placeholder,
  rightSlot,
  autoFocus,
  required,
}: PassFieldProps) {
  const [show, setShow] = useState(false);
  const controlled = value !== undefined;

  return (
    <div>
      {(label || rightSlot) && (
        <div className="field-row-top">
          {label && (
            <label className="field-label" htmlFor={id}>
              {label}
            </label>
          )}
          {rightSlot}
        </div>
      )}
      <div className="field-pass">
        <input
          id={id}
          className="field"
          type={show ? "text" : "password"}
          name={name}
          {...(controlled ? { value, onChange } : {})}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
        />
        <button
          type="button"
          className="field-eye"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          <Icon name="eye" size={17} />
        </button>
      </div>
    </div>
  );
}
