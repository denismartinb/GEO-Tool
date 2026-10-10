"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";
import { PENDING_DOMAIN_KEY } from "@/lib/onboarding/pending-domain";
import { PUBLIC_CHECK_MESSAGES, type PublicCheckResponse } from "@/lib/free-checker/api-contract";
import { FreeCheckerResult } from "@/components/free-checker/free-checker-result";
import { trackConversion } from "@/lib/ads/track";

/**
 * FREE-CHECKER-1 — el formulario y los cuatro estados de la comprobación.
 *
 * **El botón nunca se pinta deshabilitado**, y no es un descuido. La primera
 * versión lo deshabilitaba hasta tener un dominio válido, que suena correcto y
 * en pantalla era lo contrario: el CTA principal —lo único que esta página
 * existe para que pulses— te recibía gris y apagado antes de que hubieras
 * hecho nada mal, y eso se lee como "esto está roto", no como "escribe algo
 * primero". El piloto lo dio por bueno porque su chequeo de contraste salta
 * los controles deshabilitados (correcto según WCAG: quedan exentos), así que
 * es justo el fallo que ninguna aserción podía cazar y sólo aparece al mirar
 * la captura (log §113).
 *
 * **La espera enseña la pregunta, no una barra falsa.** Una llamada real con
 * búsqueda tarda entre 10 y 25 segundos, así que la espera existe y hay que
 * usarla: se dice qué se está haciendo en cada momento, con pasos que
 * corresponden a trabajo real. Un porcentaje inventado sería exactamente el
 * "fake progress" que la constitución prohíbe.
 *
 * **`degraded` cae al comportamiento de la Fase A**: guarda el dominio y
 * lleva al registro. Ocurre cuando se agota el techo del día o falta
 * configuración, y el visitante ve una página que funciona en vez de una rota.
 *
 * **Cuando hay resultado, la página ES el resultado.** Por eso este componente
 * recibe la cabecera y el contenido de venta como `props` y deja de pintarlos
 * en cuanto hay algo que enseñar: todo ese copy —"qué comprobamos", "por qué
 * importa", las FAQ— existe para convencerte de hacer una cosa que acabas de
 * hacer, y dejarlo debajo del veredicto convierte la respuesta en un anuncio
 * con un dato encima. Sigue renderizándose en servidor (llega como JSX, no se
 * duplica en el cliente); lo único que decide el cliente es si se ve.
 */

type State =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "checking" }
  | { kind: "done"; response: PublicCheckResponse };

/** Pasos de la espera. Cada uno es trabajo real, en el orden en que ocurre. */
const WAIT_STEPS = [
  "Leyendo tu web",
  "Escribiendo la pregunta de tu categoría",
  "Preguntando a ChatGPT",
  "Comprobando su respuesta palabra por palabra"
];

export function FreeCheckerForm({
  heading,
  note,
  children
}: {
  /** Migas, antetítulo, H1 y entradilla, dentro de la portada oscura. Se retiran cuando hay resultado. */
  heading?: React.ReactNode;
  /** Línea bajo el campo ("Sin registro · Sin tarjeta…"), también en la portada. */
  note?: React.ReactNode;
  /**
   * Copy de venta, ya envuelto en sus propias secciones a ancho completo.
   * Se retira cuando hay resultado y se queda cuando la comprobación falla.
   */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * HOME-2026-08 Fase A: el hero de la portada manda aquí lo que el visitante
   * escribió, por `?d=`. Se rellena, NO se lanza: cada comprobación es una
   * llamada real a un LLM con tope diario, así que auto-ejecutarla desde un
   * parámetro convertiría cualquier enlace en una forma de gastarle el cupo a
   * otro. Y se filtra con el mismo validador que habilita el botón —no una
   * copia—, para que un parámetro con basura no deje el campo en un estado que
   * el propio formulario rechazaría.
   *
   * Valor inicial y no efecto: escribir el campo después del primer pintado lo
   * pisaría si el visitante ya hubiera empezado a teclear.
   */
  const [domain, setDomain] = useState(() => {
    const fromUrl = cleanDomain(searchParams.get("d") ?? "");
    return isWellFormedDomain(fromUrl) ? fromUrl : "";
  });
  const [state, setState] = useState<State>({ kind: "idle" });
  const [step, setStep] = useState(0);

  /** Guarda el dominio para el asistente y va al registro. El camino de la Fase A. */
  function goToSignup(candidate: string) {
    try {
      window.localStorage.setItem(PENDING_DOMAIN_KEY, candidate);
    } catch {
      // Navegador sin almacenamiento: se sigue al registro igual. Perder el
      // arrastre es un incordio; bloquear el alta sería un fallo.
    }
    router.push("/signup");
  }

  async function start() {
    const candidate = cleanDomain(domain);
    if (!isWellFormedDomain(candidate)) {
      setState({ kind: "invalid" });
      inputRef.current?.focus();
      return;
    }

    setState({ kind: "checking" });
    setStep(0);
    // Los pasos avanzan con el tiempo porque el servidor no informa por
    // etapas: es UNA petición. No se afirma progreso medido, se describe lo
    // que está ocurriendo — por eso no hay porcentaje ni barra.
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, WAIT_STEPS.length - 1)), 6000);

    try {
      const res = await fetch("/api/gratis/comprobar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: candidate })
      });
      const response = (await res.json()) as PublicCheckResponse;

      // El techo del día o un fallo de configuración: no se le cuenta al
      // visitante, se le lleva por el camino que sí funciona.
      if (
        response.status === "degraded" &&
        (response.reason === "global_ceiling_reached" || response.reason === "limit_check_failed")
      ) {
        goToSignup(candidate);
        return;
      }
      setState({ kind: "done", response });
      // PAID-ADS-1: only a real answer counts as a checker conversion — a
      // failed or degraded check is not a lead, and counting it would teach
      // the ad platforms to buy more of the traffic that hits our ceiling.
      if (response.status === "completed") trackConversion("free_check");
    } catch {
      setState({ kind: "done", response: { status: "failed", error: "engine_unavailable" } });
    } finally {
      clearInterval(ticker);
    }
  }

  if (state.kind === "checking") {
    return (
      <FcSection>
      <div className="fc-wait" role="status" aria-live="polite">
        <span className="fc-wait-lbl">Comprobando en ChatGPT</span>
        <ul className="fc-steps">
          {WAIT_STEPS.map((label, i) => (
            <li key={label} className={i < step ? "done" : i === step ? "live" : ""}>
              <span className="fc-dot" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
        <p className="fc-wait-note">Tarda unos segundos porque de verdad le estamos preguntando.</p>
      </div>
      </FcSection>
    );
  }

  if (state.kind === "done") {
    // La página sólo se retira cuando hay algo que la sustituya. Un fallo NO es
    // un resultado: retirarla también dejaba al visitante con un panel de error
    // solo en medio de una pantalla en blanco, que se lee como una web rota en
    // vez de como un intento que no salió (fundador, 2026-08-16, sobre un
    // `site_unreachable` real). El titular sí se va —invita a escribir un
    // dominio en un sitio donde ya no hay campo—, pero el contenido se queda.
    const failed = state.response.status !== "completed";
    return (
      <>
        <FcSection>
          <FreeCheckerResult
            response={state.response}
            domain={cleanDomain(domain)}
            onRetry={() => setState({ kind: "idle" })}
            onSignup={() => goToSignup(cleanDomain(domain))}
          />
        </FcSection>
        {failed && children}
      </>
    );
  }

  // GEO-SELF-1 Fase 5: la portada oscura del artículo (`.art-hero`) con el
  // campo dentro, como el diseño aprobado. El campo y el botón van en fila en
  // escritorio y apilados en móvil; el botón sigue sin pintarse deshabilitado.
  return (
    <>
      <section className="fc-hero">
        <div className="fc-hero-inner">
          {heading}
          <div className="fc-hero-form">
            <input
              ref={inputRef}
              className="fc-hero-input"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                if (state.kind === "invalid") setState({ kind: "idle" });
              }}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="tuweb.es"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="url"
              aria-label="Tu dominio"
              aria-invalid={state.kind === "invalid" || undefined}
              aria-describedby={state.kind === "invalid" ? "fc-hint" : undefined}
            />
            <button type="button" className="fc-hero-btn" onClick={start}>
              Comprobar mi marca <Icon name="arrRight" size={16} />
            </button>
          </div>
          {/* `role="alert"` para que un lector de pantalla anuncie la pista: sin
              él, quien no ve el campo sólo percibe que no ha pasado nada. */}
          {state.kind === "invalid" && (
            <p className="fc-hint fc-hero-hint" id="fc-hint" role="alert">
              Escribe un dominio completo, como <strong>tuweb.es</strong>.
            </p>
          )}
          {note}
        </div>
      </section>
      {children}
    </>
  );
}

/** La espera y el resultado ocupan la columna normal, fuera de la portada. */
function FcSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="lp-section fc-state">
      <div className="lp-inner">{children}</div>
    </section>
  );
}

export { PUBLIC_CHECK_MESSAGES };
