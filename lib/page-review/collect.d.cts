// Types for the generated server copy of the extension's collect.js (MCP-SERVER-1, log §418).
declare function makeCollectPageFacts(
  document: unknown,
  location: URL,
  fetch: (path: string, opts?: { method?: string }) => Promise<{ status: number; headers: Headers; text(): Promise<string> }>,
  performance: { now(): number },
  DOMParser: unknown,
  Node: unknown
): () => Promise<{ url: string; host: string; title: string; [key: string]: unknown }>;
export = makeCollectPageFacts;
