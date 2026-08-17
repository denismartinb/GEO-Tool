import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRELAUNCH-HARDENING-1 Fase Q4 — el punto de control de autenticación.
 *
 * `requireUser` son 12 líneas de las que cuelga toda la capa de servidor: si
 * deja de redirigir, cada `*Core` del repositorio recibe un `user` inválido y
 * los filtros `owner_user_id` dejan de filtrar nada útil. Que sea corto es
 * justamente por qué nadie le había puesto tests.
 */

const getUser = vi.fn(async () => ({ data: { user: null as { id: string } | null } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } })
}));

const redirect = vi.fn((_to: string) => {
  // Next's `redirect` throws to abort the render; imitarlo importa, porque el
  // código de `requireUser` NO comprueba nada después de llamarlo.
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import { requireUser } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireUser", () => {
  it("devuelve el cliente y el usuario cuando hay sesión", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const context = await requireUser();

    expect(context.user).toEqual({ id: "user-1" });
    expect(context.supabase).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  /**
   * Sin usuario redirige a `/login`, y **el redirect lanza**. Las dos mitades
   * importan: si algún día `redirect` dejara de abortar, este código seguiría
   * hasta el `return` y devolvería `user: null` a toda la capa de servidor sin
   * que nada fallara.
   */
  it("sin sesión redirige a /login y aborta", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  /**
   * **La memoización NO está cubierta, y no por olvido.**
   *
   * `getUser()` es un viaje de red al servidor de Auth, y `React.cache()` lo
   * memoiza por petición para que las muchas llamadas de un mismo render
   * —layout, página, `requireActiveProject`, `getPlanForUser`— colapsen en un
   * solo viaje (`docs/architecture-audit-2026-07.md`, hallazgo 1.2).
   *
   * Pero `React.cache()` sólo memoiza **dentro del ámbito de una petición de
   * React**: fuera de él es un paso a través, así que desde un test de node
   * tres llamadas producen tres viajes y la aserción obvia
   * (`toHaveBeenCalledTimes(1)`) falla contra código correcto. Se escribió, se
   * vio fallar, y se quita.
   *
   * Queda anotado para que la próxima sesión no lo vuelva a intentar: perder
   * ese `cache()` no rompe nada visible —sólo multiplica la latencia de cada
   * pantalla— y hoy no hay forma de detectarlo con un test unitario.
   */
});
