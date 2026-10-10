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

  /**
   * DOMAINS-LIVE-SELECT-1 — seleccionar una tarjeta en /dashboard/domains no
   * navega (decisión del fundador, 2026-08-05), así que nunca casa con el
   * regex de ruta de arriba. Sin esta segunda rama la cookie se quedaba con
   * el proyecto anterior y el resto de la consola no se enteraba de la
   * selección hasta entrar de verdad al proyecto.
   */
  it("recuerda el proyecto cuando /dashboard/domains lleva ?active=", async () => {
    const response = await middleware(request(`/dashboard/domains?active=${PROJECT_ID}`));
    expect(response.cookies.get(ACTIVE_PROJECT_COOKIE)?.value).toBe(PROJECT_ID);
  });

  it("ignora un ?active= que no es un uuid", async () => {
    const response = await middleware(request("/dashboard/domains?active=not-a-uuid"));
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

  it("no corre sobre las páginas públicas estáticas que no leen la sesión", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    for (const excluded of ["/sobre-genscore", "/estudios", "/comparativas/genscore-vs-otterly"]) {
      expect(matcher.test(excluded), excluded).toBe(false);
    }
  });

  it("sí corre sobre las pantallas de producto", () => {
    // Next ancla sus matchers; sin `^...$` el patrón casa en cualquier punto
    // de la ruta y las exclusiones parecen no funcionar.
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    for (const included of ["/", "/dashboard", `/dashboard/projects/${PROJECT_ID}`, "/blog", "/precios"]) {
      expect(matcher.test(included), included).toBe(true);
    }
  });

  it("no corre sobre /afiliados en una visita normal (AFFILIATES-1)", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test("/afiliados")).toBe(false);
  });

  /**
   * AFFILIATES-1 — un enlace de afiliado puede caer en una página pública que
   * el primer patrón salta. La segunda entrada sólo corre con `?ref=`, así que
   * la exclusión de coste se mantiene para cualquier otra visita.
   */
  it("corre en cualquier página con ?ref=, salvo estáticos", () => {
    const entry = config.matcher[1] as { source: string; has: Array<{ type: string; key: string }> };
    expect(entry.has).toEqual([{ type: "query", key: "ref" }]);
    const matcher = new RegExp(`^${entry.source}$`);
    for (const included of ["/", "/comparativas/genscore-vs-otterly", "/gratis/informe-geo", "/afiliados"]) {
      expect(matcher.test(included), included).toBe(true);
    }
    for (const excluded of ["/_next/static/chunks/main.js", "/logo.svg", "/favicon.ico"]) {
      expect(matcher.test(excluded), excluded).toBe(false);
    }
  });
});

describe("middleware · enlace de afiliado (AFFILIATES-1)", () => {
  beforeEach(() => {
    process.env.AFFILIATE_CODES = "campamentoweb,newsletter-seo";
  });

  it("guarda un código aprobado 90 días, sólo en el servidor", async () => {
    const response = await middleware(request("/?ref=CampamentoWeb"));
    const cookie = response.cookies.get("gs_ref");
    expect(cookie?.value).toBe("campamentoweb");
    expect(cookie?.maxAge).toBe(90 * 24 * 60 * 60);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
  });

  it("ignora un código que no está en AFFILIATE_CODES o mal formado", async () => {
    for (const path of ["/?ref=desconocido", "/?ref=%3Cscript%3E", "/?ref=", "/blog"]) {
      const response = await middleware(request(path));
      expect(response.cookies.get("gs_ref"), path).toBeUndefined();
    }
  });

  it("sin AFFILIATE_CODES no guarda nada", async () => {
    delete process.env.AFFILIATE_CODES;
    const response = await middleware(request("/?ref=campamentoweb"));
    expect(response.cookies.get("gs_ref")).toBeUndefined();
  });

  it("no bloquea ni redirige por llevar ?ref=", async () => {
    const response = await middleware(request("/precios?ref=campamentoweb"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
