import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/active-project-cookie";

/**
 * PRELAUNCH-HARDENING-1 Fase Q4 — el middleware.
 *
 * Lo más importante de este fichero es lo que **no** hace: no es una puerta.
 * Su propio comentario lo dice —«This middleware does not gate access — its
 * result is discarded»— y sin embargo es exactamente el sitio donde alguien
 * añadiría un control de acceso creyendo que ayuda. Los tests fijan las dos
 * mitades: que refresca la sesión, y que **no bloquea nada** aunque no haya
 * usuario. Confundir lo segundo movería la autorización real
 * (`requireUser`, las rutas de API) a un sitio que además corre en cada
 * petición.
 */

const getClaims = vi.fn(async () => ({ data: null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, _opts: unknown) => ({ auth: { getClaims } })
}));

import { config, middleware } from "./middleware";

const PROJECT_ID = "44444444-4444-4444-4444-444444444444";

function request(pathname: string) {
  return new NextRequest(new Request(`https://genscore.es${pathname}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

describe("middleware · refresco de sesión", () => {
  it("dispara el refresco en cada petición", async () => {
    await middleware(request("/dashboard"));
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  /**
   * **No es una puerta.** Sin sesión responde igual: `NextResponse.next()`, no
   * un redirect ni un 401. Quien autoriza es `requireUser()` en cada pantalla y
   * el secreto compartido en cada ruta interna. Si este test empieza a fallar
   * porque alguien metió aquí un control de acceso, la pregunta no es cómo
   * arreglar el test.
   */
  it("no bloquea ni redirige aunque no haya sesión", async () => {
    getClaims.mockResolvedValue({ data: null });

    const response = await middleware(request("/dashboard/projects"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("middleware · cookie del proyecto activo", () => {
  it("recuerda el proyecto cuando la ruta lleva uno", async () => {
    const response = await middleware(request(`/dashboard/projects/${PROJECT_ID}/competitors`));
    const cookie = response.cookies.get(ACTIVE_PROJECT_COOKIE);

    expect(cookie?.value).toBe(PROJECT_ID);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
  });

  it("no la escribe en rutas sin proyecto", async () => {
    for (const path of ["/dashboard", "/dashboard/domains", "/blog", "/"]) {
      const response = await middleware(request(path));
      expect(response.cookies.get(ACTIVE_PROJECT_COOKIE), path).toBeUndefined();
    }
  });

  /**
   * Un segmento que no es un uuid no se guarda. La cookie no es autorización
   * —donde se lee se re-comprueba la propiedad con RLS— pero escribir basura
   * ahí sólo produce fallos raros aguas abajo.
   */
  it("ignora un segmento que no es un uuid", async () => {
    const response = await middleware(request("/dashboard/projects/new"));
    expect(response.cookies.get(ACTIVE_PROJECT_COOKIE)).toBeUndefined();
  });
});

describe("middleware · alcance", () => {
  /**
   * El matcher excluye estáticos. Sin eso, este middleware —que abre un cliente
   * de Supabase y hace una comprobación de JWT— correría en cada imagen y cada
   * bundle de la página.
   */
  it("no corre sobre estáticos ni imágenes", () => {
    // Next ancla sus matchers; sin `^...$` el patrón casa en cualquier punto
    // de la ruta y las exclusiones parecen no funcionar.
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    for (const excluded of [
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/brand/genscore-email-header.png",
      "/logo.svg"
    ]) {
      expect(matcher.test(excluded), excluded).toBe(false);
    }
  });

  it("sí corre sobre las pantallas de producto", () => {
    // Next ancla sus matchers; sin `^...$` el patrón casa en cualquier punto
    // de la ruta y las exclusiones parecen no funcionar.
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    for (const included of ["/", "/dashboard", `/dashboard/projects/${PROJECT_ID}`, "/blog", "/pricing"]) {
      expect(matcher.test(included), included).toBe(true);
    }
  });
});
