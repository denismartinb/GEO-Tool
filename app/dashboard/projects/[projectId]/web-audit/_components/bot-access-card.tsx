import type { BotAccessReport, BotAgent } from "@/lib/web-audit/robots";
import { formatDate } from "./format";

/**
 * PRELAUNCH-HARDENING-1 Fase R7 — un trozo de la pantalla de Auditoría web.
 *
 * `page.tsx` tenía 1.933 líneas con catorce componentes de presentación
 * definidos dentro, así que para cambiar una fila había que navegar la página
 * entera. Son todos componentes de servidor y puros: reciben datos ya
 * calculados y devuelven marcado. Cero cambios de lógica y cero cambios de
 * marcado — el `ux-pilot` es quien lo verifica, porque esta fase SÍ toca UI
 * (log §83).
 */

// Display names for the AI-bot user agents tracked by robots.ts — the
// UA token stays visible alongside it (badges), since that's what actually
// appears in a robots.txt file and what the founder would go verify.
const BOT_ENGINE_LABELS: Record<BotAgent, string> = {
  GPTBot: "OpenAI (ChatGPT)",
  "OAI-SearchBot": "OpenAI (búsqueda)",
  "Google-Extended": "Google (Gemini)",
  PerplexityBot: "Perplexity",
  ClaudeBot: "Anthropic (Claude)",
  "anthropic-ai": "Anthropic (legado)",
  Bingbot: "Microsoft (Copilot/Bing)"
};

export function describeSitemap(bots: BotAccessReport): {
  sitemapIsReal: boolean;
  sitemapBadge: string;
  sitemapDetail: string | null;
} {
  // "No pudimos comprobarlo" gana a cualquier lectura del contenido: si el
  // servidor nos rechazó, lo que tengamos no es evidencia de nada.
  if (bots.probes?.sitemap === "unknown") {
    return {
      sitemapIsReal: false,
      sitemapBadge: "Sin comprobar",
      sitemapDetail:
        "No hemos podido acceder a la dirección (bloqueo, error del servidor o tiempo agotado). No significa que falte."
    };
  }

  const report = bots.sitemap;

  if (report === undefined) {
    return {
      sitemapIsReal: bots.sitemapFound,
      sitemapBadge: bots.sitemapFound ? "Encontrado" : "No encontrado",
      sitemapDetail: null
    };
  }

  if (!report) {
    return { sitemapIsReal: false, sitemapBadge: "No encontrado", sitemapDetail: null };
  }

  if (report.kind === "invalid") {
    return {
      sitemapIsReal: false,
      sitemapBadge: "No es un sitemap",
      sitemapDetail: "La dirección responde, pero lo que devuelve no es XML de sitemap — normalmente una página de error."
    };
  }

  if (report.kind === "index") {
    return {
      sitemapIsReal: true,
      sitemapBadge: "Índice de sitemaps",
      sitemapDetail: `Apunta a ${report.locCount} ${report.locCount === 1 ? "sitemap" : "sitemaps"}. No se abren: seguirlos sería rastrear tu web, y esta auditoría no lo hace.`
    };
  }

  return {
    sitemapIsReal: true,
    sitemapBadge: "Encontrado",
    sitemapDetail: report.truncated
      ? `Más de ${report.locCount} URLs (el fichero es más largo de lo que leemos).`
      : `${report.locCount} ${report.locCount === 1 ? "URL" : "URLs"}.`
  };
}

export function BotAccessCard({ bots, checkedAt }: { bots: BotAccessReport; checkedAt: string }) {
  const { sitemapIsReal, sitemapBadge, sitemapDetail } = describeSitemap(bots);
  return (
    <div className="card">
      <div style={{ padding: "13px 16px 0" }}>
        <div style={{ fontSize: 13.5, fontWeight: 750 }}>Acceso de bots de IA</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
          Qué motores de IA puede rastrear tu robots.txt. Comprobado {formatDate(checkedAt)}.
        </div>
      </div>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {!bots.robotsFound && (
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", margin: "0 0 4px" }}>
            {bots.probes?.robots === "unknown"
              ? "No hemos podido acceder a robots.txt (bloqueo, error del servidor o tiempo agotado). Los permisos de abajo son el comportamiento por defecto, no lo que dice tu fichero."
              : "No se ha encontrado robots.txt — se asume acceso permitido por defecto."}
          </p>
        )}
        {bots.bots.map((bot) => (
          <div
            key={bot.agent}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>{BOT_ENGINE_LABELS[bot.agent]}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--mono)" }}>{bot.agent}</div>
            </div>
            <span className={`badge ${bot.allowed ? "badge-pos" : "badge-neg"}`}>{bot.allowed ? "Permitido" : "Bloqueado"}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>llms.txt</div>
          <span className={`badge ${bots.llmsTxtFound ? "badge-pos" : "badge-outline"}`}>
            {bots.llmsTxtFound
              ? `Encontrado (${bots.llmsTxtBytes} bytes)`
              : bots.probes?.llmsTxt === "unknown"
                ? "Sin comprobar"
                : "No encontrado"}
          </span>
        </div>
        {/* WEB-AUDIT-SITEMAP-1: ya no es sólo alcanzabilidad. `bots.sitemap`
            es opcional — un snapshot anterior a esta fase no lo trae, y
            entonces se degrada al texto de antes en vez de inventar un
            estado. Un "Encontrado" a secas era engañoso en el caso más común
            de fallo: un 404 blando (página HTML de error servida con 200),
            que respondía y por tanto contaba como encontrado. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>sitemap.xml</div>
            {sitemapDetail && (
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>{sitemapDetail}</div>
            )}
          </div>
          <span className={`badge ${sitemapIsReal ? "badge-pos" : "badge-outline"}`} style={{ flexShrink: 0 }}>
            {sitemapBadge}
          </span>
        </div>
      </div>
    </div>
  );
}
