// ANDROID-TWA-1 · la web dentro de la app de Android (log §381).
//
// La app es una TWA: Chrome a pantalla completa sobre genscore.es. Google Play
// obliga a cobrar dentro de la app lo digital y prohíbe enseñar o enviar a pagar
// fuera, así que dentro de la app la web NO vende nada: ni precios, ni cambio de
// plan, ni checkout. La compra ocurre en genscore.es, fuera de la app.
//
// Este fichero es puro (lo importa el middleware, que corre en Edge): la lectura
// de la cookie en servidor vive en `app-mode-server.ts`.

/** Cookie que marca «esta sesión es la app». Solo oculta; nunca autoriza nada. */
export const APP_MODE_COOKIE = "gs_app";
export const APP_MODE_COOKIE_VALUE = "android";
export const APP_MODE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/** El `start_url` de la TWA lleva `?source=twa`; `?source=web` sale del modo (pruebas). */
export const APP_MODE_PARAM = "source";
export const APP_MODE_ENTER = "twa";
export const APP_MODE_LEAVE = "web";

/** Identificador de la app en Play. Chrome lo manda como `android-app://<paquete>` en el referrer. */
export const ANDROID_PACKAGE = "es.genscore.app";

/** Dónde aterriza lo que dentro de la app no existe (precios, portada, blog…). */
export const APP_MODE_HOME = "/dashboard";

export type AppModeSignal = "enter" | "leave" | null;

/** ¿Esta petición abre o cierra el modo app? Es la única puerta de entrada. */
export function appModeSignal(searchParams: URLSearchParams, referer: string | null): AppModeSignal {
  const source = searchParams.get(APP_MODE_PARAM);
  if (source === APP_MODE_LEAVE) return "leave";
  if (source === APP_MODE_ENTER) return "enter";
  if (referer && referer.startsWith(`android-app://${ANDROID_PACKAGE}`)) return "enter";
  return null;
}

/**
 * Lo único que existe dentro de la app: la consola, el acceso y lo legal. Todo
 * lo demás (portada, `/precios`, comparativas, blog, docs…) lleva precios o
 * llamadas a contratar, y se redirige. Lista de permitidos, no de prohibidos:
 * una página pública nueva queda fuera de la app salvo que alguien la añada aquí.
 */
const APP_ALLOWED_PREFIXES = [
  "/dashboard",
  "/login",
  "/signup",
  "/forgot-password",
  "/auth",
  "/mfa",
  "/api",
  "/baja",
  "/informe",
  "/privacidad",
  "/terminos",
  "/cookies",
  "/offline.html",
  "/manifest.webmanifest",
  "/sw.js",
  "/icons",
  "/.well-known",
  "/_next"
];

export function isAppModePathAllowed(pathname: string): boolean {
  return APP_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * APP-LAUNCH-1 (log §389). Puerta de entrada de cada apertura de la app: el
 * inicio de sesión, donde sale la splash. El `start_url` ya apunta aquí; esta
 * constante es la que construye `appLaunchRedirect`.
 */
export const APP_LAUNCH_PATH = "/login";

/**
 * Una apertura de la app que aterriza en la consola (un `start_url` antiguo o
 * un enlace verificado que Android abre en la app) pasa antes por el inicio de
 * sesión, para que la splash salga una vez por apertura también con la sesión
 * abierta. Devuelve la ruta y query del desvío, o null si no toca desviar.
 * El destino viaja en `next` sin `source`, así que la consola no vuelve a
 * desviarse al llegar.
 */
export function appLaunchRedirect(pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) return null;
  const rest = new URLSearchParams(searchParams);
  rest.delete(APP_MODE_PARAM);
  const query = rest.toString();
  const next = query ? `${pathname}?${query}` : pathname;
  const target = new URLSearchParams({ [APP_MODE_PARAM]: APP_MODE_ENTER });
  if (next !== APP_MODE_HOME) target.set("next", next);
  return `${APP_LAUNCH_PATH}?${target.toString()}`;
}
