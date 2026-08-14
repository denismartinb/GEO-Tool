/**
 * La condición de **fuente** que `/blog/como-medir-trafico-chatgpt-ga4` le pide
 * al lector que pegue en su grupo de canales personalizado de GA4
 * (SEO-POS-1 Fase C, S8).
 *
 * **Vive aquí, y no dentro del MDX, por un fallo real.** La primera versión la
 * escribía como texto suelto dentro del `<CodeBlock>`, y MDX **se comió todas
 * las barras invertidas** al renderizar: el fichero decía `chatgpt\.com` y el
 * lector copiaba `chatgpt.com`, con cada punto convertido en comodín. Lo peor
 * no fue el fallo sino que `ga4-chatgpt.test.ts` lo aprobaba, porque leía el
 * MDX del disco —donde las barras sí estaban— en vez de lo que llega a la
 * pantalla. Un guardián que mira el lado equivocado de una transformación no
 * es un guardián: es una garantía falsa, que es peor que ninguna.
 *
 * Como constante de TypeScript, el mismo valor que se renderiza es el que
 * importa el test, y esa clase de fallo deja de ser posible. Se comprobó sobre
 * el HTML del build que el texto que llega al portapapeles es exactamente
 * este (log §85).
 */
export const GA4_AI_SOURCE_REGEX =
  "chatgpt\\.com|chat\\.openai\\.com|openai\\.com|perplexity\\.ai|claude\\.ai|gemini\\.google\\.com|copilot\\.microsoft\\.com|deepseek\\.com|grok\\.com|meta\\.ai|you\\.com";

/**
 * Los asistentes que el artículo nombra en su prosa como fuentes que hay que
 * capturar. Si el texto nombra uno más, entra aquí y el test exige que la
 * expresión lo recoja — que es la promesa que le hace la pieza al lector.
 */
export const GA4_AI_SOURCE_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com"
];
