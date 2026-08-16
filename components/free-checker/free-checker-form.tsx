"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";
import { PENDING_DOMAIN_KEY } from "@/lib/onboarding/pending-domain";
import { PUBLIC_CHECK_MESSAGES, type PublicCheckResponse } from "@/lib/free-checker/api-contract";
import { FreeCheckerResult } from "@/components/free-checker/free-checker-result";

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
 * la captura (log §111).
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
  children
}: {
  /** H1 + entradilla. Se retiran cuando hay resultado. */
  heading?: React.ReactNode;
  /** Copy de venta. Se retira cuando hay resultado. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [domain, setDomain] = useState("");
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
    } catch {
      setState({ kind: "done", response: { status: "failed", error: "engine_unavailable" } });
    } finally {
      clearInterval(ticker);
    }
  }

  if (state.kind === "checking") {
    return (
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
        <FreeCheckerResult
          response={state.response}
          domain={cleanDomain(domain)}
          onRetry={() => setState({ kind: "idle" })}
          onSignup={() => goToSignup(cleanDomain(domain))}
        />
        {failed && children}
      </>
    );
  }

  return (
    <>
      {heading}
      <div className="lp-hero-form">
        <div className="lp-field">
          <Icon name="globe" size={18} className="lp-field-ico" />
          <input
            ref={inputRef}
            className="lp-field-input"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              if (state.kind === "invalid") setState({ kind: "idle" });
            }}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="tudominio.com"
            spellCheck={false}
            aria-label="Tu dominio"
            aria-describedby={state.kind === "invalid" ? "fc-hint" : undefined}
          />
        </div>
        <div className="lp-hero-actions">
          <button type="button" className="lp-cta" onClick={start}>
            Comprobar mi marca <Icon name="arrRight" size={16} />
          </button>
        </div>
        {/* `role="alert"` para que un lector de pantalla anuncie la pista: sin
            él, quien no ve el campo sólo percibe que no ha pasado nada. */}
        {state.kind === "invalid" && (
          <p className="fc-hint" id="fc-hint" role="alert">
            Escribe un dominio completo, como <strong>tudominio.com</strong>.
          </p>
        )}
      </div>
      {children}
    </>
  );
}

export { PUBLIC_CHECK_MESSAGES };
