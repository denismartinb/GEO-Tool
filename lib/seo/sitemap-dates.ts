/**
 * Sitemap freshness derived from the blog's own SSOT (GEO-SELF-1 Fase 1).
 * Lives outside `app/sitemap.ts` so tests and other builders can import it
 * without adding non-route exports to a Next metadata route file.
 */

/** A post's real last change: its refresh date when it has one, else its publication date. */
export function postLastModified(post: { datePublished: string; dateUpdated?: string }): string {
  return post.dateUpdated ?? post.datePublished;
}

/**
 * Latest `postLastModified` among `posts` — `YYYY-MM-DD` strings, so string
 * order is date order.
 *
 * Replaces `PILLAR_LAST_MODIFIED` and the hand-kept `/blog`
 * date. Both pages list their posts, so publishing or refreshing a post
 * changes them for real — and both had gone stale exactly that way: `/blog`
 * declared 2026-07-12 with articles published through 2026-10-09, and
 * `medicion` was bumped by hand once (S8, 2026-08-14) after S6 forgot to. A
 * date derived from the posts cannot be forgotten.
 */
export function latestPostDate(posts: { datePublished: string; dateUpdated?: string }[]): string | undefined {
  return posts.map(postLastModified).sort().at(-1);
}

