"use client";

import { PUBLIC_CHECK_MESSAGES, type PublicCheckResponse } from "@/lib/free-checker/api-contract";

/**
 * FREE-CHECKER-1 — la pantalla de resultado.
 *
 * **El golpe no es "no apareces", es quién apareció en tu lugar.** Un "no te
 * mencionan" es abstracto y además discutible con una sola muestra; tres
 * competidores con nombre, en el orden en que los nombró la IA, es concreto e
 * incontestable — y es dato real, no hay que exagerarlo para que duela.
 *
 * **Lo que esta pantalla NO puede decir**, y por qué cada cosa:
 *
 * - **Ninguna puntuación.** El producto exige diez respuestas antes de
 *   etiquetar una puntuación como fiable; un número sacado de una llamada
 *   sería la métrica inventada que CLAUDE.md prohíbe.
 * - **Nunca "tu marca NO aparece en ChatGPT"** como titular. Lo cierto es que
 *   no apareció EN ESTA consulta. La diferencia no es matiz legal: es la que
 *   separa un dato de un susto vendido como dato.
 * - **Ningún análisis de los competidores** más allá de a quién nombró. Su
 *   estrategia o su cuota exigirían datos que en esta consulta no existen.
 *
 * El aviso de variabilidad va en bloque destacado, no en letra pequeña: es
 * parte del resultado, no una nota legal.
 */
export function FreeCheckerResult({
  response,
  domain,
  onRetry,
  onSignup
}: {
  response: PublicCheckResponse;
  domain: string;
  onRetry: () => void;
  onSignup: () => void;
}) {
  if (response.status === "failed" || response.status === "degraded") {
    const key = response.status === "failed" ? response.error : response.reason;
    return (
      <div className="fc-result">
        <div className="fc-panel fc-panel-warn">
          <span className="fc-lbl">No hemos podido comprobarlo</span>
          <p>{PUBLIC_CHECK_MESSAGES[key] || "Inténtalo de nuevo en un momento."}</p>
        </div>
        <div className="lp-hero-actions">
          <button type="button" className="lp-cta" onClick={onSignup}>
            Escanear con una cuenta gratis
          </button>
          <button type="button" className="lp-cta-soft" onClick={onRetry}>
            Probar otro dominio
          </button>
        </div>
      </div>
    );
  }

  const { brand, prompt, engineLabel, answer, brandMentioned, brandPosition, otherBrands } =
    response;
  const { citedOwnDomain } = response;

  return (
    <div className="fc-result">
      <span className="fc-lbl fc-lbl-blue">Resultado de esta consulta</span>
      <h2 className="fc-verdict">
        {brandMentioned
          ? `${engineLabel} nombró a ${brand}${brandPosition ? ` en el puesto ${brandPosition}` : ""}.`
          : otherBrands.length > 0
            ? `${engineLabel} nombró ${otherBrands.length === 1 ? "otra marca" : `${otherBrands.length} marcas`}. Ninguna era ${brand}.`
            : `${engineLabel} no nombró a ${brand} en esta respuesta.`}
      </h2>

      <div className="fc-panel">
        <span className="fc-lbl">La pregunta que hicimos</span>
        <p className="fc-prompt">{prompt}</p>
      </div>

      <div className="fc-panel">
        <span className="fc-lbl">Respuesta completa de {engineLabel}</span>
        <blockquote className="fc-answer">{answer}</blockquote>
      </div>

      {otherBrands.length > 0 && (
        <div className="fc-panel">
          <span className="fc-lbl">
            Quién sí apareció, en el orden en que {engineLabel} los nombró
          </span>
          <ol className="fc-rivals">
            {otherBrands.map((name, i) => (
              <li key={`${name}-${i}`}>
                <span className="fc-rival-n">{i + 1}</span>
                <span className="fc-rival-name">{name}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* La cita del propio dominio se recoge siempre y sólo se enseña cuando
          es verdad: es la señal más fuerte que puede dar una respuesta —que el
          motor use TU web como fuente, no que te nombre de memoria— y decirlo
          en negativo ("no te citó") en una sola consulta sería el mismo
          veredicto prematuro que el aviso de abajo desmonta. */}
      {citedOwnDomain && (
        <div className="fc-panel">
          <span className="fc-lbl fc-lbl-pos">Además</span>
          <p>
            {engineLabel} citó tu web como fuente de la respuesta. Es la señal más fuerte que puede
            dar una consulta: no te nombró de memoria, fue a leerte.
          </p>
        </div>
      )}

      {/* No es letra pequeña: con una sola respuesta esto es la mitad del
          resultado. El producto no da una banda de confianza por debajo de
          diez respuestas, así que aquí tampoco se insinúa una. */}
      <div className="fc-panel fc-panel-warn">
        <span className="fc-lbl">Esto es una respuesta, no un veredicto</span>
        <p>
          La misma pregunta mañana puede dar otras marcas: {engineLabel} busca en tiempo real y no
          es determinista. Con una consulta no se puede decir que no aparezcas — sólo que en ésta no
          apareciste. Para saberlo de verdad hacen falta varias preguntas repetidas en el tiempo.
        </p>
      </div>

      <div className="fc-upsell">
        <h3>Has visto 1 pregunta en 1 motor. Tus clientes hacen decenas.</h3>
        <ul>
          <li>10 preguntas reales de tu categoría, no una</li>
          <li>ChatGPT, Gemini y Claude — cada motor responde distinto</li>
          <li>Repetido en el tiempo, para ver si mejoras</li>
        </ul>
        <div className="lp-hero-actions">
          <button type="button" className="lp-cta" onClick={onSignup}>
            Escanear {domain} gratis
          </button>
          <button type="button" className="lp-cta-soft" onClick={onRetry}>
            Probar otro dominio
          </button>
        </div>
      </div>
    </div>
  );
}
