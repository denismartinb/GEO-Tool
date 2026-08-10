"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useTypewriter } from "@/components/ui/use-typewriter";

const HERO_DOMAIN_SAMPLES = ["tudominio.com", "miempresa.io", "tienda.es", "startup.ai", "agencia.com"];

/**
 * La única parte de la landing que necesita JavaScript (PRELAUNCH-HARDENING-1
 * Fase V, V4).
 *
 * La página entera era `"use client"` por esto: un campo con estado y un
 * marcador de posición que se teclea solo. Todo lo demás —seis secciones de
 * markup estático— se hidrataba a cuenta de este campo. Aislarlo deja que el
 * resto del árbol se renderice en servidor y no viaje al navegador.
 *
 * Se queda fuera de esta isla el botón «Analiza gratis», que ahora es un
 * `<Link>` de servidor: navegar no necesita estado. Lo de aquí es sólo lo que
 * de verdad reacciona a lo que el usuario escribe.
 */
export function HeroDomainField() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [isDomainFocused, setIsDomainFocused] = useState(false);
  const typedPlaceholder = useTypewriter(HERO_DOMAIN_SAMPLES, !isDomainFocused && domain === "");

  return (
    <div className="lp-field">
      <Icon name="globe" size={18} className="lp-field-ico" />
      <input
        className="lp-field-input"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && router.push("/signup")}
        onFocus={() => setIsDomainFocused(true)}
        onBlur={() => setIsDomainFocused(false)}
        placeholder={isDomainFocused || domain ? "Escribe tu sitio web" : ""}
        spellCheck={false}
      />
      {!isDomainFocused && !domain && (
        <span className="lp-field-ghost" aria-hidden="true">
          {typedPlaceholder}
          <span className="type-caret" />
        </span>
      )}
    </div>
  );
}
