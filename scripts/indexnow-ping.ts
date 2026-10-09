/**
 * `pnpm indexnow:ping` — GEO-SELF-1 Fase 1.
 *
 * Submits every URL in the sitemap to IndexNow. Run by hand after publishing
 * (it is deliberately NOT part of the build). Needs `INDEXNOW_KEY` in the
 * environment — the same value Vercel serves at `/indexnow-key.txt`, or
 * IndexNow will reject the ping (it fetches that file to verify ownership).
 * Without the key it exits without calling anything.
 */
import sitemap from "../app/sitemap";
import { pingIndexNow } from "../lib/seo/indexnow";

async function main() {
  const urls = sitemap().map((entry) => entry.url);
  const result = await pingIndexNow(urls);
  console.log(JSON.stringify({ urls: urls.length, ...result }));
  if (result.status === "failed") process.exitCode = 1;
}

void main();
