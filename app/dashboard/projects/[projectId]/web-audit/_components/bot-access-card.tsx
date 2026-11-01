import type { BotAccessReport } from "@/lib/web-audit/robots";
import {
  AI_BOT_SWITCHES,
  AI_ENGINES,
  aiTokenStates,
  engineLabel,
  engineReadStates,
  switchStates
} from "@/lib/web-audit/ai-bots";
import type { AiBotsEngineTile, AiBotsSwitchRow } from "@/components/ins/audit/ai-bots";
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

/**
 * AI-BOTS-CONSOLE-1 (log §424): what `AiBotsSection` shows, from the snapshot.
 * Server-side and pure, so the client only receives the states.
 */
export function aiBotsSectionProps(bots: BotAccessReport, domain: string): {
  engines: AiBotsEngineTile[];
  switches: AiBotsSwitchRow[];
  starRules: string[] | null;
  robotsUrl: string;
  note: string | null;
} {
  const engineStates = engineReadStates(bots);
  const states = switchStates(bots);
  const token = aiTokenStates(bots);
  const unread = bots.probes?.robots === "unknown";
  return {
    engines: AI_ENGINES.map(({ engine, name }) => ({
      engine,
      name,
      state: engineStates[engine],
      // Gemini also needs Googlebot, which no switch here touches.
      hint: engine === "gemini" && token("Googlebot") === false ? "Googlebot cerrado" : null
    })),
    switches: AI_BOT_SWITCHES.map((sw) => ({
      id: sw.id,
      engine: sw.engine,
      name: engineLabel(sw.engine),
      what: sw.what,
      tokens: sw.tokens,
      training: sw.kind === "training",
      state: states[sw.id]
    })),
    starRules: unread ? null : (bots.aiBots?.starRules ?? null),
    robotsUrl: `https://${domain}/robots.txt`,
    note: unread
      ? "No hemos podido abrir tu robots.txt (bloqueo, error del servidor o tiempo agotado). Lo volvemos a intentar en la próxima revisión."
      : !bots.robotsFound
        ? "Tu web no tiene robots.txt, así que todos los bots pueden entrar."
        : !bots.aiBots
          ? "Algunos bots se comprueban desde la próxima revisión."
          : null
  };
}

/** llms.txt, sitemap.xml and Bing: the files and the crawler that are not AI-bot switches. */
export function BotAccessCard({ bots, checkedAt }: { bots: BotAccessReport; checkedAt: string }) {
  const { sitemapIsReal, sitemapBadge, sitemapDetail } = describeSitemap(bots);
  const bing = bots.probes?.robots === "unknown" ? undefined : bots.bots?.find((b) => b.agent === "Bingbot")?.allowed;
  return (
    <div className="card">
      <div style={{ padding: "13px 16px 0" }}>
        <div style={{ fontSize: 13.5, fontWeight: 750 }}>Ficheros para la IA</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>Comprobado {formatDate(checkedAt)}.</div>
      </div>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
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
        {bing !== undefined && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>Bing y Copilot</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--mono)" }}>Bingbot</div>
            </div>
            <span className={`badge ${bing ? "badge-pos" : "badge-neg"}`}>{bing ? "Abierto" : "Cerrado"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
