/**
 * MCP-CHATGPT-SUBMIT-1 (log §429): OpenAI's domain verification for the
 * ChatGPT plugin. The portal gives a token; it goes in
 * `OPENAI_APPS_CHALLENGE_TOKEN` and this route answers it as plain text,
 * with nothing else (no JSON, no newline), as the portal requires. Without
 * the variable it is a 404, so nothing is claimed before Denis sets it.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const token = (process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "").trim();
  if (!token || /\s/.test(token)) return new Response("Not found", { status: 404 });
  return new Response(token, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
