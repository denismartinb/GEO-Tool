"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useTypewriter } from "@/components/ui/use-typewriter";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";
import { PENDING_DOMAIN_KEY } from "@/lib/onboarding/pending-domain";

const HERO_DOMAIN_SAMPLES = ["tudominio.com", "miempresa.io", "tienda.es", "startup.ai", "agencia.com"];

const FREE_CHECKER_PATH = "/gratis/aparece-mi-marca-en-chatgpt";

/** Los tres motores que el comprobador consulta de verdad. */
const ENGINES = [
  { name: "ChatGPT", src: "/brand/engines/chatgpt.svg" },
  { name: "Gemini", src: "/brand/engines/gemini.svg" },
  { name: "Claude", src: "/brand/engines/claude.svg" }
];

/**
 * El campo del hero y su llamada a la acción (PRELAUNCH-HARDENING-1 Fase V,
 * V4; el arrastre del dominio, 2026-08-10).
 *
 * **Por qué es la única parte de cliente de la landing.** La página entera era
 * `"use client"` por este campo: estado y marcador que se teclea solo. Todo lo
 * demás —seis secciones de markup que no cambian nunca— se hidrataba a su
 * cuenta. Aislado aquí, el resto se renderiza en servidor.
 *
 * **Y por qué el botón vive aquí y no fuera, como un `<Link>` de servidor.**
 * Hasta hoy la landing te invitaba a escribir tu dominio y lo tiraba: pulsabas
 * «Analiza gratis» y llegabas al registro sin rastro de lo que habías escrito;
 * luego el asistente te lo volvía a pedir. Escribir un campo que no sirve para
 * nada es teatro, exactamente lo que el CLAUDE.md prohíbe. Ahora se guarda y el
 * asistente lo recoge.
 *
 * Se guarda en `localStorage` y no en la URL a propósito: entre el hero y el
 * asistente hay un registro con confirmación por correo, así que el dato tiene
 * que sobrevivir a salir del navegador y volver. Y sólo se guarda si de verdad
 * parece un dominio —mismo validador que usa el asistente, no una copia—:
 * arrastrar basura sería peor que no arrastrar nada.
 *
 * **HOME-2026-08 Fase A: el botón lleva al comprobador, no al registro.** El
 * diseño aprobado cambia la promesa del hero — de «date de alta y analiza» a
 * «compruébalo ahora mismo, sin cuenta»—, y el comprobador gratuito existe y es
 * real (FREE-CHECKER-1). El dominio viaja DOS veces y las dos hacen falta:
 * por la URL (`?d=`) para que el comprobador salga con el campo puesto, y por
 * `localStorage` porque el alta sigue estando después y el asistente lo sigue
 * recogiendo igual.
 *
 * **Rellena, pero no lanza.** Llegar por un enlace no dispara la comprobación:
 * es una llamada real a un LLM con tope diario, y auto-ejecutarla desde un
 * parámetro convierte cualquier enlace en una forma de gastarle el cupo a
 * otro. El visitante llega con su dominio escrito y pulsa.
 */
export function HeroDomainField() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [isDomainFocused, setIsDomainFocused] = useState(false);
  const typedPlaceholder = useTypewriter(HERO_DOMAIN_SAMPLES, !isDomainFocused && domain === "");

  function start() {
    const candidate = cleanDomain(domain);
    try {
      if (isWellFormedDomain(candidate)) {
        window.localStorage.setItem(PENDING_DOMAIN_KEY, candidate);
      }
    } catch {
      // Navegador sin almacenamiento: se sigue al registro igual. Perder el
      // arrastre es un incordio; bloquear el alta sería un fallo.
    }
    router.push(
      isWellFormedDomain(candidate)
        ? `${FREE_CHECKER_PATH}?d=${encodeURIComponent(candidate)}`
        : FREE_CHECKER_PATH
    );
  }

  return (
    <>
      <div className="lp-field">
        <Icon name="globe" size={18} className="lp-field-ico" />
        <input
          className="lp-field-input"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          onFocus={() => setIsDomainFocused(true)}
          onBlur={() => setIsDomainFocused(false)}
          placeholder={isDomainFocused || domain ? "Escribe tu sitio web" : ""}
          spellCheck={false}
          aria-label="Tu dominio"
        />
        {!isDomainFocused && !domain && (
          <span className="lp-field-ghost" aria-hidden="true">
            {typedPlaceholder}
            <span className="type-caret" />
          </span>
        )}
        <button type="button" className="lp-cta lp-field-cta" onClick={start}>
          Comprobar gratis
        </button>
      </div>
      <div className="lp-engines">
        {ENGINES.map((engine) => (
          <span className="lp-engine" key={engine.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={engine.src} alt="" width={22} height={22} aria-hidden="true" />
            {engine.name}
          </span>
        ))}
      </div>
    </>
  );
}
