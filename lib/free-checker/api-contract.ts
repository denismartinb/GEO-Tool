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
      brandPosition: number | null;
      otherBrands: string[];
      citedOwnDomain: boolean;
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
