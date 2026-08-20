"use client";

import { AnswerMarkdown } from "@/components/free-checker/answer-markdown";
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
 * - **`brandPosition` sigue sin publicarse** (Fase C, 2026-08-16; vigente tras
 *   Fase D2). Con `competitors: []`, la posición de la marca era un 1
 *   estructural sin nada contra lo que rankear — se enseñó como "Movistar en
 *   el puesto 1" en una respuesta que nombraba a Orange antes, un dato que
 *   parecía medido y no lo estaba. Ver `api-contract.ts` para por qué sigue
 *   fuera aunque el dato ya podría ser real.
 * - **Las demás marcas SÍ tienen puesto real desde Fase D2** (2026-08-17):
 *   `otherBrands[].position` comparte ranking con la propia marca, así que un
 *   número aquí es un dato medido, no un índice de array — lo contrario de lo
 *   que Fase C retiró. `null` cuando el extractor no lo devolvió; nunca se
 *   inventa uno.
 * - **Y ya distinguen si son competencia de verdad.** `sameCategory` es el
 *   arreglo directo del caso que Fase C sólo pudo avisar: una respuesta sobre
 *   operadores de telecomunicaciones que nombraba a Netflix y HBO Max junto a
 *   Orange y Yoigo. Las de categoría distinta se enseñan aparte, nunca
 *   mezcladas con las alternativas reales.
 *
 * El aviso de variabilidad va en bloque destacado, no en letra pequeña: es
 * parte del resultado, no una nota legal.
 *
 * **`response.sources` (Fase D1) es un dato distinto de `citedOwnDomain`, y
 * los dos se enseñan por separado a propósito.** `citedOwnDomain` viene de lo
 * que el EXTRACTOR cree haber leído en el texto (Fase B); `sources` es la
 * metadata de búsqueda real que devuelve el proveedor. Casi siempre van a
 * coincidir, pero fusionarlos en un único indicador escondería el caso en que
 * no coinciden — y ahí es donde más importa poder distinguir "el extractor se
 * equivocó" de "el motor no consultó nada".
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

  const { brand, prompt, engineLabel, answer, brandMentioned, otherBrands, sources } = response;
  const { citedOwnDomain } = response;
  const isOwnSource = (sourceDomain: string) => sourceDomain === domain || sourceDomain.endsWith(`.${domain}`);

  return (
    <div className="fc-result">
      <span className="fc-lbl fc-lbl-blue">Resultado de esta consulta</span>
      <h2 className="fc-verdict">
        {brandMentioned
          ? `${engineLabel} sí nombró a ${brand} en esta respuesta.`
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
        <AnswerMarkdown text={answer} />
      </div>

      {/* Fase D1: la metadata de búsqueda real del proveedor, no lo que el
          extractor cree haber leído. Coste cero — ya llegaba en la llamada de
          generación y se tiraba antes de este cambio. Sólo se pinta si hay
          algo que enseñar: una respuesta sin `web_search` no tiene fuentes. */}
      {sources.length > 0 && (
        <div className="fc-panel">
          <span className="fc-lbl">De dónde sacó {engineLabel} esta respuesta</span>
          <ul className="fc-sources">
            {sources.map((source) => (
              <li key={source.domain}>
                <a href={source.url} target="_blank" rel="nofollow noopener noreferrer">
                  {source.domain}
                </a>
                {isOwnSource(source.domain) && <span className="fc-source-own">tu web</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fase D2: alternativas reales primero (posición real cuando existe,
          ordenadas por ella), las de categoría distinta aparte y sin
          etiqueta — nunca mezcladas, porque una etiqueta ya afirma "esto
          compite contigo" y para esas no es cierto. */}
      {otherBrands.length > 0 && (() => {
        const alternatives = otherBrands
          .filter((b) => b.sameCategory)
          .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
        const offCategory = otherBrands.filter((b) => !b.sameCategory);

        return (
          <div className="fc-panel">
            <span className="fc-lbl">
              {brandMentioned
                ? `Las demás marcas que ${engineLabel} nombró`
                : `Las marcas que ${engineLabel} sí nombró`}
            </span>
            {alternatives.length > 0 && (
              <ul className="fc-rivals">
                {alternatives.map((b) => (
                  <li key={b.name}>
                    {b.position !== null && <span className="fc-rival-pos">{b.position}</span>}
                    {b.name}
                  </li>
                ))}
              </ul>
            )}
            {offCategory.length > 0 && (
              <p className="fc-rivals-other">
                <strong>También mencionó, aunque no compite en tu categoría:</strong>{" "}
                {offCategory.map((b) => b.name).join(", ")}.
              </p>
            )}
          </div>
        );
      })()}

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
