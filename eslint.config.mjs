import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const eslintConfigNextPath = require.resolve("eslint-config-next");
const nextConfigRequire = createRequire(eslintConfigNextPath);
const nextPlugin = nextConfigRequire("@next/eslint-plugin-next");
const tsParser = nextConfigRequire("@typescript-eslint/parser");

const nextRecommendedRules = nextPlugin.configs.recommended.rules ?? {};
const nextCoreWebVitalsRules = nextPlugin.configs["core-web-vitals"].rules ?? {};

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "tsconfig.tsbuildinfo",
      "Documentacion/**"
    ]
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextRecommendedRules,
      ...nextCoreWebVitalsRules
    },
    settings: {
      next: {
        rootDir: "."
      }
    }
  }
];
