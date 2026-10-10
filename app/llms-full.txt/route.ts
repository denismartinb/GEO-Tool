import { buildLlmsFullTxt } from "@/lib/seo/llms-full-txt";

/**
 * GEO-SELF-1 Fase 1. El contenido clave del sitio en texto plano, para los
 * asistentes que leen `llms-full.txt` además del índice `llms.txt`. Mismo
 * patrón que `app/llms.txt/route.ts`: se deriva de las SSOT y se revalida cada
 * hora.
 */
export const revalidate = 3600;

export function GET() {
  return new Response(buildLlmsFullTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600"
    }
  });
}
