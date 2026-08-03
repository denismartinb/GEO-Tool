/**
 * GROWTH-3 Fase 3.1 — barril de la librería de composición de artículos.
 *
 * Un artículo importa de aquí, no de los ficheros sueltos:
 *
 *   import { KeyTakeaway, NumberedSection, Figure } from "@/components/blog/article";
 *
 * Diseño y reglas: `docs/brand/article-design-system.md`.
 * Política de imágenes: `docs/adr/0026-article-imagery-policy.md`.
 */
export {
  KeyTakeaway,
  Verdict,
  NumberedSection,
  QuickAction,
  PullQuote,
  Checklist,
  Stat,
  StatGrid,
  CompareTable,
  Pill,
  CodeBlock,
  AuthorBio,
  ArticleCta
} from "./blocks";

export { Figure, ProductMock, ShareOfVoice, PromptSet, type MockRow } from "./figure";
