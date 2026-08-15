"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";
import { PENDING_DOMAIN_KEY } from "@/lib/onboarding/pending-domain";

/**
 * FREE-CHECKER-1 Fase A. Mismo mecanismo de arrastre que `HeroDomainField`
 * (localStorage, mismo validador importado, no una copia) — la diferencia es
 * que aquí el botón se deshabilita con un dominio inválido en vez de navegar
 * igual, porque el propósito entero de esta página es comprobar un dominio
 * concreto, no un CTA genérico de alta.
 *
 * Cero llamadas LLM, cero escritura en base de datos: guarda el dominio y
 * lleva al registro real, donde el asistente lo recoge y lanza el escaneo
 * real del plan Free (Task Intake FREE-CHECKER-1, Fase A).
 */
export function FreeCheckerForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const candidate = cleanDomain(domain);
  const canSubmit = isWellFormedDomain(candidate);

  function start() {
    if (!canSubmit) return;
    try {
      window.localStorage.setItem(PENDING_DOMAIN_KEY, candidate);
    } catch {
      // Navegador sin almacenamiento: se sigue al registro igual. Perder el
      // arrastre es un incordio; bloquear el alta sería un fallo.
    }
    router.push("/signup");
  }

  return (
    <div className="lp-hero-form">
      <div className="lp-field">
        <Icon name="globe" size={18} className="lp-field-ico" />
        <input
          className="lp-field-input"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={isFocused || domain ? "tudominio.com" : "Escribe tu dominio"}
          spellCheck={false}
          aria-label="Tu dominio"
        />
      </div>
      <div className="lp-hero-actions">
        <button type="button" className="lp-cta" onClick={start} disabled={!canSubmit}>
          Comprobar mi marca <Icon name="arrRight" size={16} />
        </button>
      </div>
    </div>
  );
}
