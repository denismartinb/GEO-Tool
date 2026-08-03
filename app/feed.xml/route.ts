import { buildRssFeed } from "@/lib/blog/rss";

export const revalidate = 3600;

export async function GET() {
  return new Response(buildRssFeed(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8"
    }
  });
}
