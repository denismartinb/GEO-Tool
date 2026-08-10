/**
 * El dominio que alguien escribió en el hero de la landing, esperando a que el
 * asistente de alta lo recoja.
 *
 * Vive en `localStorage` y no en la URL ni en el esquema, y las tres cosas son
 * decisiones, no descuidos:
 *
 * - **Ni URL ni sesión de servidor**, porque entre el hero y el asistente hay
 *   un registro con confirmación por correo: el usuario sale del navegador y
 *   vuelve. Un parámetro de URL no sobrevive a ese viaje.
 * - **Ni una columna nueva**, porque una migración exige aprobación explícita
 *   del fundador (CLAUDE.md) y esto no la justifica.
 * - **Se consume al leerlo.** Si se quedara, un segundo dominio en la misma
 *   cuenta nacería relleno con el primero, que es peor que nacer vacío: el
 *   asistente estaría proponiendo algo que el usuario no ha pedido.
 *
 * Coste asumido y declarado: si alguien escribe el dominio en el móvil y
 * confirma el correo en el portátil, el arrastre se pierde y el asistente
 * arranca vacío — igual que antes de que esto existiera.
 */
export const PENDING_DOMAIN_KEY = "genscore.pending-domain";

/** Lee el dominio pendiente y lo borra. Devuelve "" si no había. */
export function takePendingDomain(): string {
  try {
    const value = window.localStorage.getItem(PENDING_DOMAIN_KEY);
    if (!value) return "";
    window.localStorage.removeItem(PENDING_DOMAIN_KEY);
    return value;
  } catch {
    return "";
  }
}
