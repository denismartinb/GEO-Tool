/**
 * schema.org FAQPage structured data (GROWTH-2 Fase 2.7, content-strategy.md
 * §4.3: "FAQPage donde haya preguntas frecuentes reales"). `items` must be
 * the exact question/answer pairs actually rendered on the page — never
 * invent or duplicate questions the visible content doesn't answer.
 */
export function FaqPageSchema({ items }: { items: { question: string; answer: string }[] }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
