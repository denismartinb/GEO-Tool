import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // GROWTH-1: blog posts are .mdx files under app/blog/**, file-based routed
  // like any other page — no CMS, no content-parsing library.
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb"
    }
  }
};

const withMDX = createMDX({});

// PLATFORM-COMMERCIAL-1: safe to apply unconditionally — without
// SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN (none set until the founder
// creates a Sentry account) the build plugin skips source-map upload and
// falls through to a plain build, it does not fail.
export default withSentryConfig(withMDX(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true
});
