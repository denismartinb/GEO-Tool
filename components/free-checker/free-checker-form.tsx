"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";
import { PENDING_DOMAIN_KEY } from "@/lib/onboarding/pending-domain";

/**
 * FREE-CHECKER-1 Fase A. Mismo mecanismo de arrastre que `HeroDomainField`
 * (localStorage, mismo validador importado, no una copia).
 *
 * **El botón nunca se pinta deshabilitado**, y no es un descuido. La primera
 * versión lo deshabilitaba hasta tener un dominio válido, que suena correcto y
 * en pantalla era lo contrario: el CTA principal —lo único que esta página
 * existe para que pulses— te recibía gris y apagado antes de que hubieras
 * hecho nada mal, y eso se lee como "esto está roto", no como "escribe algo
 * primero". El piloto lo dio por bueno porque su chequeo de contraste salta
 * los controles deshabilitados (correcto según WCAG: quedan exentos), así que
 * es justo el fallo que ninguna aserción podía cazar y sólo aparece al mirar
 * la captura (log §97).
 *
 * En su lugar el botón siempre invita, y al pulsarlo sin un dominio válido
 * devuelve el foco al campo con una pista concreta. Es además lo que ya hace
 * el hero de la landing, por el mismo motivo declarado allí: bloquear el alta
 * es peor que arrastrar un dato de menos.
 *
 * Cero llamadas LLM, cero escritura en base de datos.
 */
export function FreeCheckerForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [domain, setDomain] = useState("");
  const [showHint, setShowHint] = useState(false);

  function start() {
    const candidate = cleanDomain(domain);

    if (!isWellFormedDomain(candidate)) {
      setShowHint(true);
      inputRef.current?.focus();
      return;
    }

    setShowHint(false);
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
          ref={inputRef}
          className="lp-field-input"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            if (showHint) setShowHint(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="tudominio.com"
          spellCheck={false}
          aria-label="Tu dominio"
          aria-describedby={showHint ? "fc-hint" : undefined}
        />
      </div>
      <div className="lp-hero-actions">
        <button type="button" className="lp-cta" onClick={start}>
          Comprobar mi marca <Icon name="arrRight" size={16} />
        </button>
      </div>
      {/* `role="alert"` para que un lector de pantalla anuncie la pista: sin
          él, quien no ve el campo sólo percibe que no ha pasado nada. */}
      {showHint && (
        <p className="fc-hint" id="fc-hint" role="alert">
          Escribe un dominio completo, como <strong>tudominio.com</strong>.
        </p>
      )}
    </div>
  );
}
