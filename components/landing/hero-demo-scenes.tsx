import { Icon } from "@/components/ui/icon";
import { FaviconImg } from "@/components/ui/favicon-img";

/**
 * Las cinco escenas de la demo del hero (HOME-2026-08 Fase A2).
 *
 * **Es marcado del SERVIDOR, no de la isla.** Lo primero que se ve de la página
 * no puede depender de que hidrate: la escena 0 se sirve con `on` y se lee
 * entera sin una línea de JavaScript. `HeroDemo` sólo mueve esa clase y pinta
 * los mandos, igual que `ProductTabs` con las cinco pantallas.
 *
 * **Dos cifras se apartan del artboard, y por el mismo motivo de siempre.**
 *
 * 1. El artboard llama **«Franja invisible»** a un 34. El producto no tiene esa
 *    franja: son «competitivo» desde 70, «emergente» desde 40 e **«inicial»**
 *    por debajo (`app/dashboard/projects/[projectId]/page.tsx`). Publicar
 *    «invisible» en la primera pantalla de la portada sería estrenar
 *    vocabulario que la consola nunca enseña.
 * 2. Los pesos y los rótulos que se repiten en otras secciones —14 prompts, 3
 *    motores, «Te mencionan» y «Te citan»— se dicen igual aquí que abajo. La
 *    portada no puede contradecirse a sí misma al hacer scroll (§146).
 *
 * Las cifras de la historia (34 → 71) son ilustrativas, como el resto de la
 * maqueta, por decisión del fundador (2026-08-22). Lo que NO es ilustrativo es
 * el vocabulario.
 */

function ChatGptMark({ size = 18 }: { size?: number }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src="/brand/engines/chatgpt.svg" alt="" width={size} height={size} />
  );
}

/** 0 · La respuesta que ya se está dando sin ti. */
function Escena0() {
  return (
    <div className="lp-hx-sc on" id="hx-sc-0" role="tabpanel" aria-label="La respuesta">
      <div className="lp-hx-marca">
        <span className="lp-sheet-fav">
          <FaviconImg domain="ikea.es" cssSize={26} fallback={<span>IK</span>} />
        </span>
        <span className="n">IKEA</span>
        <span className="d">ikea.es</span>
        <span className="q">La marca que analizamos</span>
      </div>

      <div className="lp-hx-card lp-hx-resp">
        <div className="lp-hx-motor">
          <ChatGptMark />
          <span className="m">ChatGPT</span>
          <span className="t">hace 20 s</span>
        </div>
        <p className="lp-hx-preg">
          «¿Dónde compro muebles de calidad para el salón sin gastarme una fortuna?»
        </p>
        <p className="lp-hx-texto">
          Depende del estilo que busques, pero las tiendas más recomendadas son{" "}
          <mark>Maisons du Monde</mark> por diseño, <mark>Kave Home</mark> si priorizas
          materiales, y <mark>Leroy Merlin</mark> para soluciones a medida…
        </p>
      </div>

      <div className="lp-hx-foco" id="hx-foco">
        <span className="lp-hx-focoico" aria-hidden="true">
          <Icon name="x" size={15} />
        </span>
        <span>
          <b>IKEA no aparece</b>
          <span className="s">en 11 de sus 14 preguntas clave</span>
        </span>
      </div>
    </div>
  );
}

/** 1 · El marcador, y está bajo. */
function Escena1() {
  return (
    <div className="lp-hx-sc" id="hx-sc-1" role="tabpanel" aria-label="Tu puntuación">
      <div className="lp-hx-head">
        <span className="t">Visión general</span>
        <span className="m">Primer escaneo</span>
      </div>

      <div className="lp-hx-marcador">
        <div className="lp-hx-card lp-hx-dialcard">
          <div className="lp-hx-dial">
            <svg viewBox="0 0 112 112" aria-hidden="true">
              <circle cx="56" cy="56" r="48" fill="none" stroke="#EEF1F6" strokeWidth="12" />
              <circle
                className="lp-hx-arc mal"
                cx="56" cy="56" r="48" fill="none" stroke="#D23B48" strokeWidth="12"
                strokeLinecap="round" strokeDasharray="301.6" strokeDashoffset="199"
                transform="rotate(-90 56 56)"
              />
            </svg>
            <span className="n">34</span>
          </div>
          <div className="lp-hx-dialtxt">
            <span className="lp-prod-cap">GEO Score</span>
            <span className="f mal">Franja «inicial»</span>
            <span className="s">De 100 puntos posibles</span>
          </div>
        </div>

        <div className="lp-hx-card lp-hx-tasas">
          {[
            { t: "Te mencionan", v: "21%", w: 21, n: 1 },
            { t: "Te citan", v: "4%", w: 4, n: 2 }
          ].map((k) => (
            <div className="lp-hx-tasa" key={k.t}>
              <span className="t">{k.t}</span>
              <span className="bar">
                <span className={`fill mal crece e${k.n}`} style={{ width: `${k.w}%` }} />
              </span>
              <span className="v">{k.v}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="lp-hx-pie">Lo primero es saber en qué punto estás.</p>
    </div>
  );
}

/** 2 · Quién se lleva las respuestas. */
function Escena2() {
  const filas = [
    { n: 1, m: "Maisons du Monde", d: "maisonsdumonde.com", ini: "MM", v: "26%", w: 100, tuya: false },
    { n: 2, m: "Leroy Merlin", d: "leroymerlin.es", ini: "LM", v: "21%", w: 81, tuya: false },
    { n: 3, m: "Kave Home", d: "kavehome.com", ini: "KH", v: "16%", w: 62, tuya: false },
    { n: 8, m: "IKEA", d: "ikea.es", ini: "IK", v: "4%", w: 15, tuya: true }
  ];
  return (
    <div className="lp-hx-sc" id="hx-sc-2" role="tabpanel" aria-label="Competidores">
      <div className="lp-hx-head">
        <span className="t">Competidores · cuota de voz en IA</span>
        <span className="m">14 prompts · 3 motores</span>
      </div>

      <div className="lp-hx-card lp-hx-rank">
        {filas.map((f, i) => (
          <div className={`lp-hx-fila ${f.tuya ? "tuya" : ""}`} key={f.m}>
            <span className="pos">{f.n}</span>
            <span className="lp-sheet-fav">
              <FaviconImg domain={f.d} cssSize={26} fallback={<span>{f.ini}</span>} />
            </span>
            <span className="nm">{f.m}</span>
            <span className="bar">
              <span className={`fill ${f.tuya ? "mal" : ""} crece e${i + 1}`} style={{ width: `${f.w}%` }} />
            </span>
            <span className="v">{f.v}</span>
          </div>
        ))}
      </div>

      <p className="lp-hx-pie">Y quién se está llevando las respuestas que le tocaban.</p>
    </div>
  );
}

/** 3 · La recomendación que se ejecuta sola. */
function Escena3() {
  return (
    <div className="lp-hx-sc" id="hx-sc-3" role="tabpanel" aria-label="La solución">
      <div className="lp-hx-head">
        <span className="t">Recomendaciones</span>
      </div>

      <div className="lp-hx-card lp-hx-accion">
        <span className="lp-prod-pill alto">Impacto alto</span>
        <h4>Te mencionan pero no citan tu dominio en «mejores tiendas de muebles»</h4>
        <p>
          La IA te nombra en 6 respuestas y cita a elmueble.com como fuente. Falta una página
          tuya que se pueda citar.
        </p>
        {/* Dibujos de botones dentro de una maqueta: sin acción, van como
            `span`. El cursor de la escena finge el clic sobre el primero. */}
        <div className="lp-hx-botones" aria-hidden="true">
          <span className="lp-prod-btn primario" id="hx-generar">
            <Icon name="sparkles" size={14} />
            Generar solución
          </span>
          <span className="lp-prod-btn">Ver la evidencia</span>
        </div>
      </div>

      {/* El artefacto: primero la espera, luego lo generado. Las dos capas
          ocupan el mismo hueco para que la escena no cambie de alto a mitad. */}
      <div className="lp-hx-artefacto">
        <div className="lp-hx-card lp-hx-espera">
          <svg className="lp-hx-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="#E4E9F2" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span>
            <b>Generando la página citable…</b>
            <span className="s">Redactando las preguntas y el schema a partir de tus respuestas</span>
          </span>
        </div>

        <div className="lp-hx-card lp-hx-hecho">
          <div className="lp-hx-hechohead">
            <Icon name="check" size={14} />
            <span>Generado · listo para publicar</span>
          </div>
          <pre className="lp-sheet-code lp-hx-code">
            <span className="tag">&lt;script type=&quot;application/ld+json&quot;&gt;</span>
            {'\n{ "@type": "FAQPage", "mainEntity": [ … ] }\n'}
            <span className="tag">&lt;/script&gt;</span>
          </pre>
        </div>
      </div>

      <p className="lp-hx-pie">La recomendación no te dice qué hacer: lo hace.</p>
    </div>
  );
}

/** 4 · La misma pregunta, ya contigo dentro. */
function Escena4() {
  return (
    <div className="lp-hx-sc" id="hx-sc-4" role="tabpanel" aria-label="El resultado">
      <div className="lp-hx-card lp-hx-prompt">
        <ChatGptMark size={16} />
        <span className="q">«¿Qué tienda de muebles tiene mejor relación calidad-precio?»</span>
        <span className="lp-prod-pill cita">Ahora te cita</span>
      </div>

      <div className="lp-hx-card lp-hx-r2">
        <p>
          «Para calidad-precio la referencia es <mark className="bien">IKEA</mark>, sobre todo en
          salón y almacenaje…»
        </p>
        <span className="lp-hx-url">
          <Icon name="link" size={13} />
          ikea.es/guia-de-compra
        </span>
      </div>

      <div className="lp-hx-r3">
        <div className="lp-hx-card lp-hx-dialcard fin">
          <div className="lp-hx-dial">
            <svg viewBox="0 0 112 112" aria-hidden="true">
              <circle cx="56" cy="56" r="48" fill="none" stroke="#EEF1F6" strokeWidth="12" />
              <circle
                className="lp-hx-arc2"
                cx="56" cy="56" r="48" fill="none" stroke="#2563EB" strokeWidth="12"
                strokeLinecap="round" strokeDasharray="301.6" strokeDashoffset="87.5"
                transform="rotate(-90 56 56)"
              />
            </svg>
            <span className="n">71</span>
          </div>
          <span className="lp-prod-pill pos">+37 pts</span>
        </div>

        <div className="lp-hx-card lp-hx-evo">
          <span className="lp-prod-lbl">Evolución del GEO Score</span>
          <span className="s">últimos 5 escaneos</span>
          <svg viewBox="0 0 460 84" preserveAspectRatio="none" aria-hidden="true">
            <path
              className="lp-hx-linea"
              d="M8,74 L120,68 L232,48 L344,28 L452,10"
              fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle className="lp-hx-pt p1" cx="8" cy="74" r="4" fill="#D23B48" />
            <circle className="lp-hx-pt p2" cx="120" cy="68" r="4" fill="#93b0f2" />
            <circle className="lp-hx-pt p3" cx="232" cy="48" r="4" fill="#93b0f2" />
            <circle className="lp-hx-pt p3" cx="344" cy="28" r="4" fill="#93b0f2" />
            <circle className="lp-hx-pt p4" cx="452" cy="10" r="5.5" fill="#2563EB" />
          </svg>
          <span className="lp-hx-evofoot"><span>34</span><span>71</span></span>
        </div>
      </div>

      <p className="lp-hx-pie">Y la siguiente respuesta ya se da contigo dentro.</p>
    </div>
  );
}

export function HeroDemoScenes() {
  return (
    <>
      <Escena0 />
      <Escena1 />
      <Escena2 />
      <Escena3 />
      <Escena4 />
    </>
  );
}
