/**
 * El robots.txt de ejemplo que `/blog/bots-de-ia-robots-txt-cuales-dejar-entrar`
 * le propone al lector: no entrenar con su web, pero seguir pudiendo salir
 * citado en las respuestas que buscan en internet.
 *
 * Vive aquí, y no escrito dentro del MDX, por la misma razón que
 * `ga4-source-regex.ts` (log §85): es lo único de la pieza que el lector copia
 * y pega, así que el test tiene que mirar exactamente el texto que se publica.
 * `robots-ai-snippet.test.ts` lo pasa por el mismo lector de robots.txt que
 * usa la Auditoría técnica y comprueba que hace lo que el artículo promete.
 */
export const ROBOTS_TRAINING_OFF_SEARCH_ON = `# Entrenamiento de modelos: fuera
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

# Búsqueda con IA: dentro
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

# Todo lo demás, como siempre
User-agent: *
Allow: /`;
