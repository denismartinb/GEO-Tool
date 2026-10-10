"use client";

import { AnswerMarkdown } from "@/components/free-checker/answer-markdown";
import { PUBLIC_CHECK_MESSAGES, type PublicCheckResponse } from "@/lib/free-checker/api-contract";
import { variabilityNotice } from "@/lib/free-checker/result-copy";

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
 * - **Ningún puesto, ni para la marca ni para las demás** (Fase C, 2026-08-16).
 *   Aquí `competitors` va vacío a propósito, así que la única entidad que el
 *   extractor rankea es la propia marca: su `position` vale 1 SIEMPRE que
 *   aparezca, diga lo que diga el resto de la respuesta. Se enseñó como
 *   "Movistar en el puesto 1" en una respuesta que nombraba a Orange antes —
 *   un dato que parecía medido y no lo estaba. Y `other_brands_mentioned` es
 *   una lista de nombres **sin posición**: numerarla 1..N era numerar el índice
 *   de un array. Un puesto real exige un conjunto contra el que rankear, y eso
 *   es la Fase D, no un ajuste de copy.
 * - **Las demás marcas no se llaman "competidores".** El motor nombra lo que
 *   hay en la respuesta, y en la primera ejecución real eso incluyó a Netflix,
 *   HBO Max y DAZN junto a Orange y Yoigo: plataformas incluidas en los
 *   paquetes, no rivales del operador. Llamarlas competencia era una
 *   interpretación nuestra sobre un dato que no la sostiene.
 *
 * El aviso de variabilidad va en bloque destacado, no en letra pequeña: es
 * parte del resultado, no una nota legal.
 *
 * **GEO-SELF-1 Fase 5 (log §263): la misma tarjeta que el ejemplo de la
 * página.** «Así es un resultado» enseña una forma; el resultado real tiene
 * que tener esa misma forma, o el ejemplo promete algo que no llega. Cabecera
 * con el veredicto (cálida si no te nombró, verde si sí), la pregunta, la
 * respuesta completa y, al lado, las marcas y las fuentes. Debajo, el aviso y
 * el paso al escaneo completo con las mismas filas que la tabla «gratis
 * frente a completo» — sin cifras absolutas («1 pregunta», «10 preguntas»).
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
      <div className="fcr">
        <div className="fcr-note">
          <span className="fcp-lbl fcp-lbl-warn">No hemos podido comprobarlo</span>
          <p>{PUBLIC_CHECK_MESSAGES[key] || "Inténtalo de nuevo en un momento."}</p>
        </div>
        <div className="fcr-actions">
          <button type="button" className="fcr-btn" onClick={onSignup}>
            Empezar los 7 días de Pro
          </button>
          <button type="button" className="fcr-btn fcr-btn-soft" onClick={onRetry}>
            Probar otro dominio
          </button>
        </div>
      </div>
    );
  }

  const { brand, prompt, engineLabel, answer, brandMentioned, otherBrands, sources } = response;
  const { citedOwnDomain } = response;
  const isOwnSource = (sourceDomain: string) => sourceDomain === domain || sourceDomain.endsWith(`.${domain}`);
  const notice = variabilityNotice({ engineLabel, brandMentioned });

  return (
    <div className="fcr">
      <p className="fcp-kicker">Tu resultado · {domain}</p>
      <div className="fcp-example fcr-card">
        <div className={brandMentioned ? "fcp-example-head fcr-head-pos" : "fcp-example-head"}>
          <span className={brandMentioned ? "fcp-lbl fcr-lbl-pos" : "fcp-lbl fcp-lbl-warn"}>Resultado de esta consulta</span>
          <h2 className="fcp-verdict">
            {brandMentioned
              ? `${engineLabel} sí nombró a ${brand} en esta respuesta`
              : otherBrands.length > 0
                ? `${engineLabel} nombró otras marcas, pero no a ${brand}, en esta respuesta`
                : `${engineLabel} no nombró a ${brand} en esta respuesta`}
          </h2>
        </div>

        <div className="fcr-prompt-row">
          <span className="fcp-lbl">La pregunta que hicimos</span>
          <p className="fcp-prompt">«{prompt}»</p>
        </div>

        <div className="fcr-grid">
          <div>
            <span className="fcp-lbl">Respuesta completa de {engineLabel}</span>
            <div className="fcr-answer">
              <AnswerMarkdown text={answer} />
            </div>
          </div>

          <div className="fcr-side">
            {/* Sin números y sin la palabra "competidores": ver la cabecera. Se
                pintan como etiquetas, no como una lista ordenada, porque una
                lista numerada se lee como un ranking aunque el número no esté. */}
            {otherBrands.length > 0 && (
              <div>
                <span className="fcp-lbl">
                  {brandMentioned ? "Otras marcas que nombró" : "Marcas que sí nombró"}
                </span>
                <ul className="fcp-chips">
                  {otherBrands.map((name, i) => (
                    <li key={`${name}-${i}`}>{name}</li>
                  ))}
                </ul>
                <p className="fcr-small">
                  Tal cual las nombró, sin orden. Alguna puede no ser competencia tuya.
                </p>
              </div>
            )}

            {/* Fase D1: la metadata de búsqueda real del proveedor, no lo que el
                extractor cree haber leído. Sólo se pinta si hay algo que
                enseñar: una respuesta sin búsqueda no tiene fuentes. */}
            {sources.length > 0 && (
              <div>
                <span className="fcp-lbl">De dónde lo sacó</span>
                <ul className="fcr-sources">
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

            {/* La cita del propio dominio sólo se enseña cuando es verdad:
                decirlo en negativo en una sola consulta sería un veredicto
                prematuro. */}
            {citedOwnDomain && (
              <div className="fcr-cited">
                <span className="fcp-lbl fcr-lbl-pos">Además</span>
                <p>
                  {engineLabel} citó tu web como fuente. No te nombró de memoria: fue a leerte.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* No es letra pequeña: con una sola respuesta esto es la mitad del
          resultado. El texto se elige por el resultado (CHECKER-COPY-1,
          `lib/free-checker/result-copy.ts`). */}
      <div className="fcr-note">
        <span className="fcp-lbl fcp-lbl-warn">{notice.label}</span>
        <p>{notice.body}</p>
      </div>

      <div className="fcr-upsell">
        <h3>Esto es una pregunta en un motor. El escaneo completo mide el resto.</h3>
        <ul>
          <li>Las preguntas principales de búsqueda de tu sector</li>
          <li>ChatGPT, Gemini y Claude</li>
          <li>Múltiples veces en distintos momentos del tiempo</li>
          <li>Puntuación GEO, competidores, fuentes citadas, auditoría de tu web y plan de acción</li>
        </ul>
        <div className="fcr-actions">
          <button type="button" className="fcr-btn" onClick={onSignup}>
            Escanear {domain} con 7 días de Pro gratis
          </button>
          <button type="button" className="fcr-btn fcr-btn-soft" onClick={onRetry}>
            Probar otro dominio
          </button>
        </div>
      </div>
    </div>
  );
}
