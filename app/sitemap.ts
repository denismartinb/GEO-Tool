import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog/posts";

const SITE_URL = "https://www.genscore.es";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/geo", "/pricing", "/blog", "/privacidad", "/cookies", "/terminos"].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date()
  }));

  const blogRoutes = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.datePublished)
  }));

  return [...staticRoutes, ...blogRoutes];
}
