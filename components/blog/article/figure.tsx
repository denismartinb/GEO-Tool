import type { ReactNode } from "react";

/**
 * GROWTH-3 Fase 3.1 — evidencia visual.
 *
 * `Figure` es el contenedor de TODO lo visual de un artículo: marco, pie y
 * fuente. `ProductMock` es la maqueta del panel de GenScore, construida en
 * SVG/CSS con datos de ejemplo — nunca una captura de la cuenta piloto (ver
 * `docs/adr/0028-article-imagery-policy.md`).
 */

/**
 * Marco + pie de figura. `label` numera la figura; `caption` explica qué se
 * está viendo y de dónde salen los datos.
 *
 * `wide` es obligatorio cuando el contenido es una tabla. `.art-frame` nace
 * con `overflow: hidden`, que es lo correcto para un `ProductMock` o un SVG
 * —recortar un degradado contra el radio del borde— y es exactamente lo
 * incorrecto para una tabla: la parte que no cabe **desaparece sin dejar
 * forma de alcanzarla**, que es el fallo de `/docs/metodologia` del §77 otra
 * vez. Lo encontró el piloto de S8: en 375 px, la última columna de las dos
 * figuras nuevas —la que lleva la conclusión— no existía, y la de S6 llevaba
 * dos días igual. Con `wide`, el marco desliza y anuncia que desliza, igual
 * que `.art-tablewrap` (log §85).
 */
export function Figure({
  label,
  caption,
  wide = false,
  children
}: {
  label: string;
  caption: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <figure className="art-figure">
      <div className={wide ? "art-frame art-frame-wide" : "art-frame"}>{children}</div>
      <figcaption className="art-caption">
        <b>{label}</b>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Maqueta de cuota de voz: qué marcas se reparten las menciones de un
 * conjunto de prompts, con la tuya marcada. Reproduce la pantalla de
 * competidores del producto.
 *
 * `total` es obligatorio y se pinta en la cabecera: una cuota de voz sin
 * decir sobre cuántos prompts se calcula no significa nada, y este proyecto
 * no publica cifras sin su denominador.
 */
export function ShareOfVoice({
  brands,
  total
}: {
  brands: { name: string; value: number; you?: boolean }[];
  total: string;
}) {
  const max = Math.max(...brands.map((b) => b.value));
  return (
    <div className="art-sov">
      <div className="art-sov-h">
        <span>Cuota de voz</span>
        <span className="art-sov-total">{total}</span>
      </div>
      {brands.map((b) => (
        <div key={b.name} className={b.you ? "art-sov-row art-sov-you" : "art-sov-row"}>
          <span className="art-sov-n">
            {b.name}
            {b.you && <em>tu marca</em>}
          </span>
          <div className="art-sov-track">
            <div className="art-sov-fill" style={{ width: `${(b.value / max) * 100}%` }} />
          </div>
          <span className="art-sov-v">{b.value}%</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Maqueta de una respuesta generativa, con o sin fuente citada.
 *
 * Existe para enseñar la distinción entre **mención** y **citación**, que en
 * prosa cuesta un párrafo y en dos tarjetas se ve de un golpe. El texto es
 * siempre ilustrativo — nunca la respuesta real de un motor, porque eso sería
 * atribuirle a ChatGPT o Gemini palabras que no hemos verificado que dijeran
 * (misma regla que `PullQuote`, ver `docs/brand/article-design-system.md`).
 */
export function AnswerSample({
  verdict,
  text,
  source
}: {
  verdict: string;
  text: string;
  /** Ausente = la respuesta nombra la marca pero no respalda nada con una fuente. */
  source?: string;
}) {
  return (
    <div className={source ? "art-ans art-ans-cited" : "art-ans"}>
      <div className="art-ans-h">{verdict}</div>
      <p className="art-ans-body">{text}</p>
      {source ? (
        <div className="art-ans-src">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6.5 9.5a3 3 0 004.2 0l2-2a3 3 0 10-4.2-4.2l-.6.6M9.5 6.5a3 3 0 00-4.2 0l-2 2a3 3 0 104.2 4.2l.6-.6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          {source}
        </div>
      ) : (
        <div className="art-ans-nosrc">Sin fuente: nada apunta a tu web</div>
      )}
    </div>
  );
}

export function AnswerPair({ children }: { children: ReactNode }) {
  return <div className="art-ans-pair">{children}</div>;
}

/**
 * Maqueta de una recomendación del producto.
 *
 * `confidence` es obligatorio y se pinta siempre: el producto real nunca
 * muestra una recomendación sin decir con cuánta confianza la hace, y una
 * maqueta que lo ocultara estaría enseñando un producto que no existe.
 */
export function RecommendationSample({
  title,
  priority,
  confidence,
  why
}: {
  title: string;
  priority: string;
  confidence: string;
  why: string;
}) {
  return (
    <div className="art-rec">
      <div className="art-rec-h">
        <span className="art-rec-pri">{priority}</span>
        <span className="art-rec-conf">{confidence}</span>
      </div>
      <h4 className="art-rec-t">{title}</h4>
      <p className="art-rec-why">{why}</p>
    </div>
  );
}

/**
 * Maqueta de un conjunto de prompts con su intención. Existe porque el
 * consejo "cubre varias intenciones" es abstracto hasta que ves cuatro
 * prompts reales uno debajo de otro y notas que preguntan cosas distintas.
 */
export function PromptSet({ prompts }: { prompts: { text: string; intent: string }[] }) {
  return (
    <div className="art-prompts">
      {prompts.map((p) => (
        <div key={p.text} className="art-prompt-row">
          <span className="art-prompt-q">{p.text}</span>
          <span className="art-prompt-i">{p.intent}</span>
        </div>
      ))}
    </div>
  );
}

export type MockRow = {
  label: string;
  hint: string;
  /** 0-100. */
  value: number;
  /**
   * Peso del componente dentro del GEO Score, si aplica. **No se pinta.**
   *
   * Se conserva porque es lo que hace verificable el número del gauge:
   * `article-recipes.test.ts` comprueba que el score declarado sea la media
   * ponderada real de las filas que la figura enseña, y sin el peso esa
   * comprobación se quedaría sin datos y una maqueta podría contradecirse a sí
   * misma a la vista del lector (ya pasó dos veces).
   *
   * Dejó de renderizarse el 2026-08-13 por decisión del fundador: los pesos son
   * configuración interna del producto y no se publican (log §75). El dato vive
   * en el fuente del artículo, que no es una superficie pública.
   */
  weight?: number;
  tone?: "blue" | "blue2" | "cyan" | "warm";
};

const GAUGE_R = 54;
const GAUGE_C = 2 * Math.PI * GAUGE_R;

/**
 * Maqueta del panel de GEO Score. Reproduce el lenguaje visual del producto
 * real (gauge + descomposición por componente) para que un artículo pueda
 * mostrar de qué habla sin depender de una captura.
 *
 * `highlight` marca una fila con un anillo y una etiqueta — es el equivalente
 * al recuadro con flecha de las capturas anotadas, pero anclado a la fila en
 * vez de posicionado en absoluto, así que no se descuadra en ningún ancho.
 */
export function ProductMock({
  score,
  rows,
  highlight,
  annotation
}: {
  score: number;
  rows: MockRow[];
  highlight?: number;
  annotation?: string;
}) {
  return (
    <div className="art-mock">
      <div className="art-gauge">
        <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
          <circle cx="66" cy="66" r={GAUGE_R} fill="none" stroke="var(--line)" strokeWidth="11" />
          <circle
            cx="66"
            cy="66"
            r={GAUGE_R}
            fill="none"
            stroke="var(--brand-blue)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${(GAUGE_C * score) / 100} ${GAUGE_C}`}
            transform="rotate(-90 66 66)"
          />
        </svg>
        <div className="art-gauge-val">
          <div>
            <div className="art-gauge-num">{score}</div>
            <div className="art-gauge-cap">GEO Score</div>
          </div>
        </div>
      </div>

      <div className="art-rows">
        {rows.map((row, i) => {
          const isHl = highlight === i;
          return (
            <div key={row.label} className={isHl ? "art-row art-row-hl" : "art-row"}>
              {isHl && annotation && (
                <span className="art-anno-lbl">
                  {annotation}
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true">
                    <path d="M1 1l4.5 4.5L10 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              <div className="art-row-top">
                <span className="art-row-l">
                  {row.label}
                  <em>{row.hint}</em>
                </span>
                <span className="art-row-v">{row.value}%</span>
              </div>
              <div className="art-track">
                <div className={`art-fill art-tone-bg-${row.tone ?? "blue"}`} style={{ width: `${row.value}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
