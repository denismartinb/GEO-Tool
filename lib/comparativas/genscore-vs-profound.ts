/**
 * SEO-POS-1 Fase C, S2 — datos de la comparativa GenScore vs Profound.
 *
 * Fuente de los datos de Profound: información pública de terceros (reseñas,
 * cobertura de prensa de su financiación, agregadores de reviews) consultada
 * el 10 de agosto de 2026, y refrescada el 9 de octubre de 2026 contra su
 * propia web (tryprofound.com/pricing, su página principal y su centro de
 * ayuda) en GEO-SELF-1 Fase 2 (log §257): precio, motores, gestión de
 * clientes y bucle de acción. Las reseñas (G2) y la financiación siguen
 * siendo de la investigación de agosto. Los precios y límites de GenScore
 * vienen de app/pricing/plans-data.ts, la misma fuente que usa /precios — no
 * se reescriben a mano.
 *
 * **El precio de Profound no se declara con una cifra fija a propósito.**
 * Su página de precios pública ha pasado a exigir una demo — no publican
 * ningún importe hoy. Fuentes de terceros citan cifras muy distintas según su
 * fecha (499 $/mes "Lite" en el lanzamiento de 2025; 99 $/mes "Starter" en
 * reseñas más recientes de 2026), lo que sugiere que su estructura de precios
 * ha cambiado más de una vez. Publicar aquí una cifra concreta sería
 * exactamente el tipo de dato desactualizado que esta página advierte de
 * confirmar en destino.
 *
 * 2026-10-09: su web enseña hoy una prueba gratuita de 7 días y un plan
 * Enterprise a medida. Según un tercero (GEO Toolbox, competidor, comprobado
 * el 28-09-2026), los planes de marca de entrada se retiraron a mediados de
 * septiembre de 2026; se cita con su fuente y su fecha, no como hecho propio.
 */
import { PLANS } from "@/app/pricing/plans-data";

const STARTER_PRICE = PLANS.find((p) => p.id === "starter")!.price;

export const PROFOUND_RESEARCH_DATE = "9 de octubre de 2026";

export const COMPARISON_ROWS: {
  label: string;
  genscore: string;
  profound: string;
  profoundWins?: boolean;
  genscoreWins?: boolean;
}[] = [
  {
    label: "Precio de entrada",
    genscore: `Precio público desde ${STARTER_PRICE} €/mes, con 7 días de Pro gratis y sin tarjeta para probar`,
    profound:
      "Sin precio público: su web ofrece una prueba gratuita de 7 días y un plan Enterprise a medida. Según GEO Toolbox (tercero, comprobado el 28-09-2026), los planes de entrada de 99 y 399 $/mes que aún citan muchas reseñas se retiraron a mediados de septiembre de 2026",
    genscoreWins: true
  },
  {
    label: "Motores de IA cubiertos",
    genscore: "3 (Gemini, Claude, ChatGPT), los mismos en todos los planes de pago y en la prueba de Pro",
    profound:
      "Hasta 9 motores en Enterprise (entre ellos Perplexity, Microsoft Copilot, Google AI Mode y Claude); la prueba gratuita cubre 3: ChatGPT, Gemini y AI Overviews",
    profoundWins: true
  },
  {
    label: "A quién se dirige",
    genscore: "Desde autónomos y pymes hasta agencias — la prueba de 7 días no exige ni tarjeta ni contacto con ventas",
    profound: "Explícitamente mid-market y enterprise (50-1.000+ empleados); reseñas independientes señalan que \"el coste por cliente rara vez sale a cuenta\" para agencias pequeñas o pymes",
    profoundWins: true
  },
  {
    // Sin insignia desde el 2026-10-09 (log §257): la fila decía que Profound
    // exigía una cuenta por cliente, y su centro de ayuda documenta hoy un
    // «Agency Mode» con espacios de cliente. Ninguna de las dos ofrece marca
    // blanca documentada, así que no hay victoria clara de ningún lado.
    label: "Varios clientes/dominios bajo una cuenta",
    genscore: "Una cuenta de Agencia sigue varios dominios de cliente a la vez, sin credenciales separadas por cliente — aunque todavía sin paneles white-label ni permisos por rol",
    profound:
      "«Agency Mode»: espacios de cliente y espacios de «pitch» para prospectos (caducan a los 30 días salvo extensión), según su centro de ayuda — que no menciona marca blanca"
  },
  {
    label: "Idioma del producto",
    genscore: "Castellano nativo",
    profound: "Selector de idioma anunciado para 30+ idiomas — sin confirmación pública de que el castellano esté entre ellos, y sin ningún cliente ni caso de estudio en español encontrado",
    genscoreWins: true
  },
  {
    label: "Bucle de acción",
    genscore: "Recomendaciones basadas en evidencia + generador de soluciones (FAQ, schema, briefs) incluido desde Pro",
    profound:
      "«AI Marketer» lleva del dato al brief y al contenido terminado, pero según su propia documentación es una función del plan Enterprise, a medida y previa demo",
    genscoreWins: true
  },
  {
    label: "Reputación en reseñas públicas",
    genscore: "Producto reciente, sin volumen de reseñas públicas todavía",
    profound: "4,5/5 en G2, valorado por la profundidad de su analítica — con quejas recurrentes de curva de aprendizaje pronunciada y soporte más lento a partir de cierto volumen",
    profoundWins: true
  },
  {
    // Fila deliberadamente SIN `profoundWins` (revisión del fundador,
    // 2026-08-11). Levantar más dinero no es un beneficio para quien compra la
    // herramienta: no mejora ningún resultado suyo, y corta en las dos
    // direcciones (respaldo y continuidad, pero también presión por rentabilizar
    // la ronda). Marcarla como victoria del competidor era conceder un punto
    // que no es un punto. Se mantiene la fila porque la viabilidad del
    // proveedor sí es contexto legítimo antes de firmar con nadie.
    label: "Respaldo y modelo de negocio",
    genscore:
      "Autofinanciado — sin inversores a los que devolver una ronda, y por tanto sin presión externa para subir precios o pivotar",
    profound:
      "155 M$ levantados en total; última ronda (Serie C) valoró la empresa en 1.000 M$ (febrero de 2026) — más músculo para invertir en producto, y también más expectativa de retorno que atender"
  }
];
