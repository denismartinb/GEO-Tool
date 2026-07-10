import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb"
    }
  }
};

// PLATFORM-COMMERCIAL-1: safe to apply unconditionally — without
// SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN (none set until the founder
// creates a Sentry account) the build plugin skips source-map upload and
// falls through to a plain build, it does not fail.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true
});
