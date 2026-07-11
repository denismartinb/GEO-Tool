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

// remarkGfm: @next/mdx defaults to plain CommonMark, which does NOT parse
// pipe tables — without this, "| Componente | Peso |..." rendered as raw
// text with the pipe characters visible instead of an actual <table>
// (found via founder screenshot on the geo-score article's preview).
// Passed as a string module specifier, not the imported function: Turbopack
// needs to serialize the MDX loader options across its own worker
// processes, and a live function reference isn't serializable.
const withMDX = createMDX({ options: { remarkPlugins: [["remark-gfm"]] } });

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
