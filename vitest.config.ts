import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".claude/worktrees/**"]
  },
  resolve: {
    alias: {
      // Mirrors the "@/*" -> "./*" path alias from tsconfig.json so tests and
      // source files can use the same `@/lib/...` imports.
      "@": path.resolve(__dirname, "."),
      // `scan-runner.ts` starts with `import "server-only"`, which throws when
      // imported outside of the Next.js build (the real package errors on
      // purpose to prevent server-only code from being bundled into client
      // code). This alias points it at a no-op module so the pure helper
      // functions in scan-runner.ts can be unit-tested under Vitest without
      // pulling in Next's server-only enforcement. This is test-only
      // configuration and does not change any production code.
      "server-only": path.resolve(__dirname, "vitest.server-only-stub.ts")
    }
  }
});
