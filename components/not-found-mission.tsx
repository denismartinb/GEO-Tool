import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { MARKETING_CONTENT_LINKS } from "@/components/marketing-content-links";

/**
 * NOT-FOUND-ROCKET-1 — la 404 pública, «Fuera de trayectoria».
 *
 * Diseño aprobado: `docs/design-reference/not-found-rocket-1/`. Sustituye a la
 * 404 de SEO-POS-1 (T7), que era correcta y fea: un `<h1>` y tres listas
 * heredadas del shell del blog, sin jerarquía ni aire.
 *
 * **No reutiliza `BlogPageShell` a propósito.** Ese shell encierra su
 * contenido en `.lp-inner` (max-width 1180px), que es exactamente lo que
 * impide una escena a sangre; ampliarlo tocaría blog, legales y pricing por
 * una pantalla. Duplicar la barra de navegación aquí sigue el precedente ya
 * escrito en el repo — `blog-page-shell.tsx` es a su vez copia deliberada de
 * `legal-page-shell.tsx`. La deuda declarada: son tres copias de la misma nav;
 * si aparece una cuarta, toca extraerla.
 *
 * **Sin datos, sin sesión, sin JavaScript propio.** Toda la animación es CSS,
 * sin `requestAnimationFrame` ni timers, para que el navegador la congele sola
 * cuando la pestaña no está visible. Es también la razón de que esto siga
 * siendo un server component.
 *
 * El cohete es el mismo que el del primer escaneo — ver
 * `.claude/rules/mission-rocket.md` antes de tocar cualquiera de los dos.
 */

const NAV_LINKS = [
  { href: "/geo", label: "Qué es GEO" },
  { href: "/blog", label: "Blog" },
  { href: "/comparativas", label: "Comparativas" },
  { href: "/pricing", label: "Precios" }
];

/**
 * Los atajos del cuerpo. `/blog` no entra aquí porque ya es el CTA secundario
 * («Leer el blog»), y repetirlo dos veces en la misma pantalla no da una
 * salida más, sólo ruido.
 */
const SHORTCUTS = [
  ...MARKETING_CONTENT_LINKS.filter((l) => l.href !== "/blog"),
  { href: "/geo", label: "Qué es el GEO" },
  { href: "/pricing", label: "Precios" }
];

export function NotFoundMission() {
  return (
    <div className="lp nf-page">
      {/* La ventana es la nav + la escena. El pie queda fuera de este bloque a
          propósito: dentro, se llevaría de la escena los ~200px que mide y la
          misión dejaría de ocupar la pantalla. */}
      <div className="nf-viewport">
        <div className="lp-nav-wrap">
          <nav className="lp-nav">
            <MarketingMobileNav links={[{ href: "/", label: "Inicio" }, ...NAV_LINKS]} />
            <Link href="/" className="lp-logo">
              <BrandLogo size={22} />
            </Link>
            <div className="lp-nav-links">
              {NAV_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
            <div className="lp-nav-right">
              <Link href="/login" className="btn btn-ghost btn-sm">
                Iniciar sesión
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                Prueba gratis
              </Link>
            </div>
          </nav>
        </div>

        <div className="nf-stage">
          <MissionScene />
          <div className="nf-glow" aria-hidden="true" />
          {/* El velo no es adorno: es lo que garantiza contraste del texto
              sobre una escena que se mueve. */}
          <div className="nf-veil" aria-hidden="true" />

          <div className="nf-copy">
            <p className="nf-kicker">
              <i aria-hidden="true" />
              Error 404 · ruta no encontrada
            </p>
            <h1 className="nf-title">Esta dirección no está en el mapa</h1>
            <p className="nf-sub">
              El enlace que has seguido apunta a un punto donde no hay nada publicado, o el
              contenido se movió de sitio. Te devolvemos a la trayectoria.
            </p>
            <div className="nf-cta">
              <Link href="/" className="nf-btn nf-btn-solid">
                Volver al inicio
              </Link>
              <Link href="/blog" className="nf-btn nf-btn-ghost">
                Leer el blog
              </Link>
            </div>
            <div className="nf-rail">
              <span>Atajos</span>
              {SHORTCUTS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <BrandLogo size={19} />
            </Link>
            <div className="links">
              <Link href="/#producto">Producto</Link>
              <Link href="/geo">Qué es GEO</Link>
              <Link href="/pricing">Precios</Link>
              {MARKETING_CONTENT_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Términos</Link>
            </div>
          </div>
          <div className="copy">
            © 2026 GenScore · Generative Engine Optimization para empresas y agencias.
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * La escena, a sangre completa bajo la cabecera.
 *
 * `preserveAspectRatio="xMidYMid slice"` conserva la proporción y recorta por
 * los bordes en vez de deformar, así que **el cohete y su trayectoria viven en
 * la banda central del lienzo**: eso es lo que les hace sobrevivir al recorte
 * vertical de una pantalla panorámica y al lateral de un móvil. Cualquier
 * elemento nuevo que se salga de esa banda desaparecerá en una de las dos.
 *
 * La composición reparte por ejes: misión a la derecha y texto a la izquierda
 * en horizontal; misión arriba y texto abajo en vertical, donde además la
 * misión se encoge y sube (ver el bloque `nf-` de globals.css). Con el texto
 * centrado encima, el cohete le pasaba por detrás del titular — en pantalla
 * panorámica sólo quedan ~170px libres sobre el copy y no caben las dos cosas
 * en el mismo eje.
 *
 * Nada de aquí significa nada. En el primer escaneo el movimiento del cohete
 * SÍ codifica datos reales (altitud = progreso); aquí no hay progreso que
 * contar, así que no hay barra, ni anillo, ni contador que pudiera leerse como
 * tal.
 */
function MissionScene() {
  return (
    <svg
      className="nf-scene"
      viewBox="0 0 1200 760"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Un cohete se ha salido de su trayectoria hacia un destino que no existe"
    >
      <defs>
        <linearGradient id="nf-earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b4a7a" />
          <stop offset="1" stopColor="#0a1728" />
        </linearGradient>
      </defs>

      <rect width="1200" height="760" fill="#081223" />

      {/* Dos capas de estrellas a distinta velocidad. Cada una está duplicada
          a +1200 —el ancho del lienzo— para que el bucle no tenga costura. */}
      <g className="nf-stars-far" fill="#cfe0ff" opacity=".5">
        <StarField
          points={[
            [64, 132, 1.2], [196, 58, 1], [318, 214, 0.9], [402, 96, 1.1], [548, 168, 0.9],
            [676, 62, 1], [742, 246, 1.1], [858, 130, 0.9], [962, 208, 1], [1094, 88, 1.2],
            [148, 322, 1], [286, 430, 0.9], [430, 356, 1.1], [598, 470, 0.9], [726, 392, 1],
            [872, 486, 1.1], [1018, 366, 0.9], [1136, 452, 1], [92, 560, 1.1], [352, 618, 0.9],
            [508, 690, 1], [640, 574, 0.9], [796, 664, 1.1], [1052, 606, 1]
          ]}
        />
      </g>
      <g className="nf-stars-near" fill="#eaf1ff">
        <StarField
          points={[
            [112, 76, 1.6], [268, 176, 1.3], [376, 42, 1.5], [520, 262, 1.2], [654, 148, 1.4],
            [808, 74, 1.3], [934, 288, 1.5], [1078, 176, 1.2], [206, 402, 1.4], [468, 524, 1.3],
            [606, 336, 1.5], [758, 566, 1.2], [890, 424, 1.4], [1146, 542, 1.3], [56, 462, 1.2],
            [330, 706, 1.4]
          ]}
        />
      </g>

      {/* El planeta del que salió. Enorme y muy abajo: sólo se ve el limbo. */}
      <circle cx="600" cy="2060" r="1466" fill="none" stroke="rgba(9,197,214,.16)" strokeWidth="16" />
      <circle cx="600" cy="2060" r="1458" fill="none" stroke="rgba(127,227,236,.5)" strokeWidth="2" />
      <circle cx="600" cy="2060" r="1456" fill="url(#nf-earth)" />

      <g className="nf-mission">
        {/* Lo que sí voló. Va en tres tramos porque en vertical el de más
            abajo se oculta: entero, cruzaba el titular. El primero arranca
            FUERA del lienzo (y=796 > 760) a propósito: terminado dentro, su
            extremo se veía flotando a media pantalla como si la estela
            empezara de la nada. */}
        <path
          className="nf-live lo"
          d="M548 796 C 620 704, 668 650, 706 604"
          fill="none"
          stroke="#4f7bff"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeDasharray="32 24"
        />
        <path
          className="nf-live mid"
          d="M706 604 C 730 576, 754 552, 774 522"
          fill="none"
          stroke="#4f7bff"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeDasharray="32 24"
        />
        <path
          className="nf-live"
          d="M774 522 C 786 506, 798 496, 808 486"
          fill="none"
          stroke="#4f7bff"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeDasharray="32 24"
        />

        {/* El tramo que no llega a ninguna parte. */}
        <path
          className="nf-lost"
          d="M916 306 C 960 266, 1000 232, 1032 206"
          fill="none"
          stroke="#7f9dc9"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="1 15"
        />

        {/* El destino que no existe. */}
        <g transform="translate(1060 180)">
          <circle className="nf-target" r="25" fill="none" stroke="#7f9dc9" strokeWidth="1.8" strokeDasharray="4 9" />
          <path d="M-9 -9 L9 9 M9 -9 L-9 9" stroke="#8fa6cc" strokeWidth="2.4" strokeLinecap="round" />
          <text x="0" y="48" textAnchor="middle" fill="#8fa6cc" className="nf-target-label">
            404
          </text>
        </g>

        {/* El cohete. Mismo casco, aletas, toberas y ventana que
            `components/scan-mission-rocket.tsx` — si tocas uno, lee
            `.claude/rules/mission-rocket.md`. El grupo exterior sólo lleva el
            balanceo por CSS; el interior, la colocación por atributo (un
            `transform` de CSS reemplazaría al atributo, no se compone con él). */}
        <g className="nf-flight">
          <g transform="translate(550 114) scale(1.55) rotate(28 200 178)">
            <path className="nf-thrust" d="M186 218 q-7 9 -11 20 q9 -5 13 -13 Z" fill="#7fe3ec" />
            <path className="nf-thrust t2" d="M214 218 q7 9 11 20 q-9 -5 -13 -13 Z" fill="#7fe3ec" />
            <rect x="184" y="208" width="9" height="8" rx="2" fill="#8fa8cc" />
            <rect x="196" y="208" width="9" height="9" rx="2" fill="#8fa8cc" />
            <rect x="208" y="208" width="9" height="8" rx="2" fill="#8fa8cc" />
            <path d="M184 188 L174 210 L184 206 Z" fill="#3f6fd8" />
            <path d="M217 188 L227 210 L217 206 Z" fill="#3f6fd8" />
            <path d="M200 138 q16 16 16 39 v30 h-32 v-30 q0 -23 16 -39 Z" fill="#d7e2f5" />
            <path d="M200 138 q16 16 16 39 h-32 q0 -23 16 -39 Z" fill="#eef4ff" />
            <circle cx="200" cy="176" r="6.5" fill="#0b1426" />
            <circle cx="200" cy="176" r="4" fill="#09c5d6" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Cada estrella, dibujada dos veces con 1200 de separación, para que el desplazamiento cierre el bucle sin salto. */
function StarField({ points }: { points: Array<[number, number, number]> }) {
  return (
    <>
      {points.map(([cx, cy, r], i) => (
        <circle key={`a${i}`} cx={cx} cy={cy} r={r} />
      ))}
      {points.map(([cx, cy, r], i) => (
        <circle key={`b${i}`} cx={cx + 1200} cy={cy} r={r} />
      ))}
    </>
  );
}
