/**
 * SEO-POS-1 Fase C, S2 — datos de la comparativa GenScore vs Profound.
 *
 * Fuente de los datos de Profound: información pública de terceros (reseñas,
 * cobertura de prensa de su financiación, agregadores de reviews) consultada
 * el 10 de agosto de 2026 — ver la nota de fecha en la propia página. Los
 * precios y límites de GenScore vienen de app/pricing/plans-data.ts, la misma
 * fuente que usa /pricing — no se reescriben a mano.
 *
 * **El precio de Profound no se declara con una cifra fija a propósito.**
 * Su página de precios pública ha pasado a exigir una demo — no publican
 * ningún importe hoy. Fuentes de terceros citan cifras muy distintas según su
 * fecha (499 $/mes "Lite" en el lanzamiento de 2025; 99 $/mes "Starter" en
 * reseñas más recientes de 2026), lo que sugiere que su estructura de precios
 * ha cambiado más de una vez. Publicar aquí una cifra concreta sería
 * exactamente el tipo de dato desactualizado que esta página advierte de
 * confirmar en destino.
 */
export const PROFOUND_RESEARCH_DATE = "10 de agosto de 2026";

export const COMPARISON_ROWS: {
  label: string;
  genscore: string;
  profound: string;
  profoundWins?: boolean;
  genscoreWins?: boolean;
}[] = [
  {
    label: "Precio de entrada",
    genscore: "Gratis (escaneo permanente, sin tarjeta)",
    profound: "Sin precio público — su web pide una demo. Terceros citan cifras muy distintas según la fecha, entre 99 y 499 $/mes",
    genscoreWins: true
  },
  {
    label: "Motores de IA cubiertos",
    genscore: "3 en planes de pago (Gemini, Claude, ChatGPT), 1 en Free — los mismos en todos los planes de pago",
    profound: "Hasta 9 motores nominalmente (incluidos Perplexity y Grok), pero los planes de entrada solo cubren ChatGPT o 3 motores — la cobertura amplia parece reservada a Enterprise",
    profoundWins: true
  },
  {
    label: "A quién se dirige",
    genscore: "Desde autónomos y pymes hasta agencias — el plan gratuito no exige ni tarjeta ni contacto con ventas",
    profound: "Explícitamente mid-market y enterprise (50-1.000+ empleados); reseñas independientes señalan que \"el coste por cliente rara vez sale a cuenta\" para agencias pequeñas o pymes",
    profoundWins: true
  },
  {
    label: "Varios clientes/dominios bajo una cuenta",
    genscore: "Una cuenta de Agencia sigue varios dominios de cliente a la vez, sin credenciales separadas por cliente — aunque todavía sin paneles white-label ni permisos por rol",
    profound: "Reseñas de usuarios señalan que gestionar 5 clientes exige 5 cuentas separadas, sin panel ni permisos compartidos",
    genscoreWins: true
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
    profound: "Centrado en analítica e insights (menciones, citas, tráfico de agentes de IA, volumen de prompts) — sin generador de acciones/soluciones documentado públicamente",
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
