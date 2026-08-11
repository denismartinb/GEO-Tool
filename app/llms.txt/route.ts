import { buildLlmsTxt } from "@/lib/seo/llms-txt";

/**
 * SEO-POS-1 (T6). Sustituye al `public/llms.txt` estático, que se mantenía a
 * mano y había derivado hasta listar la mitad del contenido publicado. Mismo
 * patrón que `app/sitemap.ts` y `app/feed.xml/route.ts`: se deriva de las SSOT.
 */
export const revalidate = 3600;

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600"
    }
  });
}
