import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * SEO-POS-1 (T10). `/forgot-password` es un componente cliente entero, así que
 * no puede exportar `metadata` — va aquí, que es lo mínimo para etiquetarla sin
 * reescribir la pantalla. Mismo criterio que login/signup: contenido fino y sin
 * valor de búsqueda, enlazado desde los shells de marketing.
 */
export const metadata: Metadata = {
  title: "Recuperar contraseña — GenScore",
  robots: { index: false, follow: true }
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
