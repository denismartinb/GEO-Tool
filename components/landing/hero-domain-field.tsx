"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useTypewriter } from "@/components/ui/use-typewriter";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";
import { PENDING_DOMAIN_KEY } from "@/lib/onboarding/pending-domain";

const HERO_DOMAIN_SAMPLES = ["tudominio.com", "miempresa.io", "tienda.es", "startup.ai", "agencia.com"];

/** Los tres motores que GenScore analiza de verdad. */
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
 * **HOME-2026-08 Fase A llevó el botón al comprobador; revertido 2026-08-24.**
 * Fase A cambiaba la promesa del hero de «date de alta y analiza» a
 * «compruébalo ahora mismo, sin cuenta», usando el comprobador gratuito
 * (FREE-CHECKER-1). El fundador pidió volver al registro directo — mismo
 * patrón que Semrush, cuyo CTA de portada lleva al alta, no a una
 * comprobación anónima — así que el botón vuelve a `/signup`. El comprobador
 * gratuito sigue existiendo y accesible por su propia URL; sólo deja de ser
 * el destino del hero.
 */
/**
 * `withEngines` existe para el CIERRE de la portada (Fase C), que usa el mismo
 * campo sin la fila de motores: allí ya se han nombrado tres veces. Se
 * comparte el componente en vez de copiar el campo porque lo que hay detrás no
 * es un `<input>` — es el arrastre del dominio a `localStorage`, el validador
 * y la regla de «rellena pero no lanza». Duplicarlo sería duplicar eso.
 */
export function HeroDomainField({ withEngines = true }: { withEngines?: boolean } = {}) {
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
    router.push("/signup");
  }

  return (
    <>
      {/* El botón es HERMANO del campo, no hijo, y eso es del diseño: en el
          artboard de escritorio va dentro de la píldora y en el de móvil va
          fuera, debajo, con su propio hueco. Con un solo marcado eso se
          resuelve moviendo el «cromado» de la píldora —borde, fondo, sombra,
          radio— entre el envoltorio (escritorio: los dos dentro de la misma
          cápsula) y el campo (móvil: cápsula sólo alrededor del campo). Si
          estuviera dentro, el recuadro blanco envolvería también al botón y en
          el móvil quedaría una caja alta con el botón flotando dentro
          (fundador, 2026-08-22, sobre el preview en su teléfono). */}
      <div className="lp-field-wrap">
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
      </div>
        <button type="button" className="lp-cta lp-field-cta" onClick={start}>
          Analiza gratis
        </button>
      </div>
      {withEngines && (
        <div className="lp-engines">
          {ENGINES.map((engine) => (
            <span className="lp-engine" key={engine.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={engine.src} alt="" width={22} height={22} aria-hidden="true" />
              {engine.name}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
