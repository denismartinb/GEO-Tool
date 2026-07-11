import type { MDXComponents } from "mdx/types";

// GROWTH-1: reuses the same typographic classes as /privacidad, /terminos,
// /cookies (components/legal-page-shell.tsx's ".legal-body h2/p/ul" rules in
// globals.css) so blog posts look like the rest of the site without a
// separate stylesheet.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components
  };
}
