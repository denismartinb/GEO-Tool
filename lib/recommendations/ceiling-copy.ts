/**
 * Cómo se nombran los dos «techos» de puntos que enseña el producto.
 *
 * Visión general enseñaba «+87 puntos potenciales» y Recomendaciones «Hasta
 * +22 puntos»: dos cifras que nadie sabía reconciliar y que se leían como una
 * previsión (auditoría 2026-10-08, hallazgo 4). No son una suma ni se
 * contradicen: las dos son un contrafactual CONJUNTO (`computeJointPotential
 * Points`, ADR 0017 §3) sobre conjuntos distintos —todas las recomendaciones
 * activas, o sólo las 3 del plan— y el solapamiento ya está colapsado. Lo que
 * sí fallaba era el nombre: «potenciales» y «techo optimista… tu próximo
 * escaneo lo confirma» prometen una subida, cuando el cálculo asume que cada
 * consulta afectada acaba nombrándote primero y citándote. Es el límite
 * superior, no lo esperable.
 *
 * Aquí sólo viven las palabras. Las cifras no se tocan. El titular de Visión
 * general se retiró (log §236); queda el del plan en Recomendaciones.
 */
export function planCeilingSuffix(planSize: number, points: string): string {
  const scope = planSize === 1 ? "esta acción" : `estas ${planSize}`;
  return `. Techo teórico de ${scope}: +${points} pt`;
}
