import type { PublicCheckError } from "@/lib/free-checker/run-check";
import type { PublicCheckDenial } from "@/lib/free-checker/rate-limit";

/**
 * FREE-CHECKER-1 Fase B3 — el contrato entre la ruta y la pantalla.
 *
 * Vive en su propio módulo, sin `server-only` ni imports de servidor, para
 * que el componente de cliente pueda importar **el tipo** sin arrastrar el
 * cliente de Supabase ni la capa de LLM al bundle del navegador.
 *
 * **`degraded` no es un error.** Es el modo en que esta página deja de
 * comprobar y se comporta como la Fase A: capturar el dominio y llevar al
 * registro. Ocurre cuando se agota el techo del día o cuando falta
 * configuración — y en los dos casos el visitante ve una página que funciona,
 * no una rota. Es el mejor argumento de haber construido la Fase A primero:
 * el modo degradado ya estaba escrito y desplegado antes de que existiera
 * nada que degradar.
 */

export type PublicCheckResponse =
  | {
      status: "completed";
      brand: string;
      prompt: string;
      /** Cómo se nombra el motor ante el visitante: "ChatGPT", nunca "openai". */
      engineLabel: string;
      answer: string;
      brandMentioned: boolean;
      /**
       * **Sigue sin haber `brandPosition` a propósito** (Fase C, 2026-08-16;
       * revisado en Fase D2). Con `competitors: []`, la posición de la marca
       * era un 1 estructural sin nada contra lo que rankear. Fase D2 pide al
       * modelo que comparta esa misma numeración con `other_brands_detail`
       * (abajo), así que `brand.position` ya podría ser un dato real cuando
       * hay otras marcas — pero exponerlo al visitante no formaba parte de lo
       * aprobado en esta fase, y sigue sin verificarse contra el texto igual
       * que `other_brands_detail`. Queda para una fase futura, con su propio
       * Task Intake.
       */
      otherBrands: Array<{
        name: string;
        /**
         * Fase D2 (2026-08-17) — comparte ranking con `brand`, así que un
         * puesto aquí SÍ es un dato medido, a diferencia de `brandPosition`
         * de arriba (que ni siquiera se envía). `null` cuando el extractor no
         * lo devolvió — nunca un número inventado por reconstrucción.
         */
        position: number | null;
        /**
         * `false` cuando el motor la nombró en la misma respuesta pero no es
         * una alternativa real para la misma necesidad — el caso Netflix/HBO
         * Max junto a Orange y Yoigo en una respuesta sobre operadores de
         * telecomunicaciones (Fase C, log §111/§113).
         */
        sameCategory: boolean;
      }>;
      citedOwnDomain: boolean;
      /**
       * Fase D1 (2026-08-17) — las fuentes reales que ChatGPT consultó con
       * `web_search`, deduplicadas por dominio. Distinto de `citedOwnDomain`:
       * ése viene de lo que el extractor CREE haber leído en el texto (Fase B),
       * esto viene de la metadata de búsqueda del propio proveedor.
       */
      sources: Array<{ domain: string; url: string; title: string | null }>;
    }
  /** Se intentó y no salió. El visitante ve qué pasó y puede reintentar. */
  | { status: "failed"; error: PublicCheckError }
  /**
   * No se intentó. Cuando el motivo es el techo global o la configuración, la
   * pantalla cae al comportamiento de la Fase A en vez de enseñar un fallo:
   * no es culpa del visitante y no gana nada sabiendo la causa.
   */
  | { status: "degraded"; reason: PublicCheckDenial };

/** Mensajes de cara al visitante. Aquí y en ningún otro sitio. */
export const PUBLIC_CHECK_MESSAGES: Record<PublicCheckError | PublicCheckDenial, string> = {
  site_unreachable:
    "No hemos podido leer tu web, así que no sabemos por qué categoría preguntar. Comprueba que el dominio es correcto y que la página carga.",
  // Deliberadamente NO manda a revisar la web: aquí la web se leyó bien y el
  // que no supo fue nuestro modelo. El mensaje dice lo que es cierto y da la
  // salida real —probar otro dominio o crear la cuenta—, sin prometer que
  // reintentar lo arregle, porque a menudo no lo hace.
  profile_unclear:
    "Hemos leído tu web pero no hemos sabido decir con seguridad a qué se dedica, y preguntar por una categoría equivocada daría un resultado sobre un mercado que no es el tuyo. No es un fallo de tu web.",
  engine_unavailable:
    "ChatGPT no ha respondido esta vez. No es culpa de tu web — inténtalo de nuevo en un momento.",
  extraction_failed:
    "Hemos recibido la respuesta pero no hemos podido interpretarla. Inténtalo de nuevo.",
  budget_exhausted:
    "La comprobación ha tardado más de lo que podemos esperar. Inténtalo de nuevo en un momento.",
  config: "Ahora mismo no podemos comprobar. Vuelve a intentarlo más tarde.",
  ip_limit_reached:
    "Ya has hecho tus comprobaciones gratuitas de hoy. Crea una cuenta para escanear sin ese límite.",
  domain_limit_reached:
    "Este dominio ya se ha comprobado hoy varias veces. Crea una cuenta para escanearlo cuando quieras.",
  global_ceiling_reached: "",
  limit_check_failed: ""
};
