import { state, reset } from "./harness";
import { POST as POST_CLAUDE } from "@/app/api/mcp/route";
import { POST as POST_CHATGPT } from "@/app/api/mcp/chatgpt/route";
export type Profile = "claude" | "chatgpt";
export async function rpc(profile: Profile, body: unknown) {
  const path = profile === "claude" ? "/api/mcp" : "/api/mcp/chatgpt";
  const res = await (profile === "claude" ? POST_CLAUDE : POST_CHATGPT)(new Request(`https://www.genscore.es${path}`, {
    method: "POST", headers: { "content-type": "application/json", ...(state.bearer !== "none" ? { authorization: "Bearer " + "x".repeat(30) } : {}) }, body: JSON.stringify(body) }) as any);
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, www: res.headers.get("www-authenticate"), json };
}
export async function callTool(profile: Profile, tool: string, args: Record<string, unknown> = {}) {
  const r = await rpc(profile, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  const res = r.json?.result;
  return { ...r, text: (res?.content?.[0]?.text ?? r.json?.error?.message ?? "") as string, structured: res?.structuredContent, isError: !!res?.isError };
}
export async function listTools(profile: Profile) {
  const r = await rpc(profile, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  const init = await rpc(profile, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  return { tools: r.json.result.tools as any[], instructions: init.json.result.instructions as string };
}
export { state, reset };
