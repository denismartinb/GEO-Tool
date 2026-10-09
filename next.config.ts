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
  },
  // GEO-SELF-1 Fase 1 (log §256): the public pricing page lives at the
  // Spanish URL `/precios` (founder decision 2026-10-09) — the one canonical
  // URL, the one every internal link and the menu point to. `/pricing`, its
  // old route, answers with a permanent redirect so old links, bookmarks,
  // search results and AI answers still land; Next keeps the query string
  // (`/pricing?openPlan=pro` → `/precios?openPlan=pro`). This is NOT the
  // apex → www redirect `docs/environment-contract.md` says must stay in
  // Vercel's domain config; that one still lives there.
  async redirects() {
    return [
      { source: "/pricing", destination: "/precios", permanent: true },
      { source: "/pricing/:path*", destination: "/precios/:path*", permanent: true }
    ];
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

const configWithMDX = withMDX(nextConfig);

// VERCEL-COST-1: withSentryConfig's webpack plugin instruments every route
// at build time (auto error-capture wrapping) independently of whether it
// ends up uploading a source map — that instrumentation was running on
// every single build even though no environment has SENTRY_ORG/
// SENTRY_AUTH_TOKEN set (Sentry isn't live yet, docs/environment-contract.md).
// Only pay that build cost once those vars exist; revert this gate when
// Fase 3 of docs/launch-plan.md turns Sentry on for real.
export default process.env.SENTRY_ORG && process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(configWithMDX, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      widenClientFileUpload: true
    })
  : configWithMDX;
