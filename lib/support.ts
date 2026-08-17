/**
 * La única dirección de contacto del producto.
 *
 * Estaba escrita a mano en cinco sitios (`billing-content.tsx`,
 * `change-plan-modal.tsx`, las dos páginas legales y los mensajes de error de
 * `billing/actions.ts`), dos de ellos con nombres distintos para la misma
 * cadena — `SUPPORT_EMAIL` y `SALES_EMAIL`. No son dos canales: es el mismo
 * buzón. Mientras haya copias, cambiar de dirección deja alguna atrás y esa
 * pantalla manda al usuario a un sitio que ya no lee nadie.
 */
export const SUPPORT_EMAIL = "soporte@genscore.es";

/** `mailto:` con asunto, para que el correo llegue ya clasificado. */
export function supportMailto(subject?: string): string {
  return subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;
}
