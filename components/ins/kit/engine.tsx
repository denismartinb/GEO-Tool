import { getEngineMeta } from "@/lib/scan/engine-meta";

/** Provider key (`openai`) to the console sprite symbol (`#e-chatgpt`). */
const SPRITE_KEY: Record<string, string> = {
  openai: "chatgpt",
  chatgpt: "chatgpt",
  gemini: "gemini",
  claude: "claude",
  perplexity: "perplexity"
};

export function engineSpriteKey(provider: string): string | null {
  return SPRITE_KEY[provider] ?? null;
}

/** Engine glyph from the sprite (`lg()` in the prototype). Nothing for an unknown provider. */
export function EngineLogo({ provider, size = 16 }: { provider: string; size?: number }) {
  const key = engineSpriteKey(provider);
  if (!key) return null;
  return (
    <svg width={size} height={size} aria-hidden="true" focusable="false">
      <use href={`#e-${key}`} />
    </svg>
  );
}

/** Visible engine name (ChatGPT, Gemini, Claude, Perplexity), never a model version. */
export function engineName(provider: string): string {
  return getEngineMeta(provider).label;
}
