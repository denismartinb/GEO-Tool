import "server-only";
import { cookies } from "next/headers";
import { APP_MODE_COOKIE, APP_MODE_COOKIE_VALUE } from "@/lib/app-mode";

/** ¿Se está sirviendo esta petición a la app de Android? Solo para ocultar ventas. */
export async function isInApp(): Promise<boolean> {
  const store = await cookies();
  return store.get(APP_MODE_COOKIE)?.value === APP_MODE_COOKIE_VALUE;
}

export const IN_APP_BILLING_ERROR = "Esta acción no está disponible en la app.";
