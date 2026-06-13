// No-op stub for the "server-only" package, used only by vitest.config.ts's
// resolve.alias so modules that start with `import "server-only"` (e.g.
// lib/scan/scan-runner.ts) can be imported under Vitest. See the comment in
// vitest.config.ts for why this exists. Not part of the production build.
export {};
