import type { MetadataRoute } from "next";
import { AI_CRAWLERS, DISALLOWED_PATHS } from "@/lib/seo/robots-rules";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS },
      { userAgent: [...AI_CRAWLERS], allow: "/", disallow: DISALLOWED_PATHS }
    ],
    sitemap: "https://www.genscore.es/sitemap.xml"
  };
}
