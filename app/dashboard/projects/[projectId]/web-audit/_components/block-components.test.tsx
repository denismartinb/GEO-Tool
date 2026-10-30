import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuditBlockView } from "@/lib/web-audit/audit-blocks";
import type { TechnicalIssue } from "@/lib/web-audit/issues";

vi.mock("next/link", () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: unknown; scroll?: boolean }) => (
    <a href={href} {...rest}>
      {children as never}
    </a>
  )
}));

const { BLOCK_NOTES, InsBlockHero } = await import("@/components/ins/audit/block-cards");
const { BlockIssuesCard, BlockPassingCard } = await import("./block-panels");

/**
 * Render tests for the two audit blocks (SEARCH-SEO-1 Fase 1b, log §275).
 * Content only: the numbers shown are the numbers passed in, and an empty
 * block says so instead of inventing rows.
 */

function issue(overrides: Partial<TechnicalIssue> = {}): TechnicalIssue {
  return {
    check: "structured_data",
    severity: "critical",
    affectedCount: 4,
    applicableCount: 5,
    pointDelta: 12,
    affectedLabels: ["https://acme.com/"],
    ...overrides
  };
}

function view(overrides: Partial<AuditBlockView> = {}): AuditBlockView {
  return {
    key: "geo",
    score: 55,
    projectedScore: 100,
    issues: [
      { issue: issue(), blockPoints: 21.8 },
      { issue: issue({ check: "bot_blocked", affectedCount: 1, applicableCount: 7, pointDelta: null }), blockPoints: null },
      { issue: issue({ check: "list_or_table", severity: "warning", affectedCount: 1 }), blockPoints: 3.6 }
    ],
    scoredIssueCount: 2,
    passing: [],
    ...overrides
  };
}

describe("InsBlockHero", () => {
  it("shows the open block's score and counts its critical problems", () => {
    const html = renderToStaticMarkup(<InsBlockHero projectId="p1" view={view()} />);
    expect(html).toContain('aria-label="55"');
    expect(html).toContain("Nota GEO");
    expect(html).toContain("2 críticos");
    expect(html).toContain("3 problemas");
  });

  it("has no block selector: the menu picks the block", () => {
    const html = renderToStaticMarkup(<InsBlockHero projectId="p1" view={view({ key: "seo", score: 76, issues: [] })} />);
    expect(html).toContain("Salud SEO");
    expect(html).toContain("Sin problemas");
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("Auditoría GEO");
  });

  it("draws a dash, not a zero, for a block with nothing measured", () => {
    const html = renderToStaticMarkup(<InsBlockHero projectId="p1" view={view({ score: null })} />);
    expect(html).toContain(">—<");
  });
});

describe("InsBlockHero potential line", () => {
  it("prints the real gain and the scored count, linked to its own block", () => {
    const html = renderToStaticMarkup(
      <InsBlockHero projectId="p1" view={view({ key: "seo", score: 76, projectedScore: 100, scoredIssueCount: 3 })} />
    );
    expect(html).toContain("+24 pt");
    expect(html).toContain("los 3 problemas que puntúan");
    expect(html).toContain('href="/dashboard/projects/p1/web-audit?bloque=seo#problemas"');
    expect(BLOCK_NOTES.seo).toContain("Lo que Google necesita");
  });

  it("uses the singular for one problem and draws no line when nothing is gained", () => {
    const one = renderToStaticMarkup(
      <InsBlockHero projectId="p1" view={view({ score: 90, projectedScore: 100, scoredIssueCount: 1 })} />
    );
    expect(one).toContain("el problema que puntúa");
    const none = renderToStaticMarkup(
      <InsBlockHero projectId="p1" view={view({ score: 100, projectedScore: 100, scoredIssueCount: 0 })} />
    );
    expect(none).not.toContain("class=\"pot\"");
  });
});

describe("BlockIssuesCard", () => {
  it("counts by severity and shows points, or «sin puntos» for an unscored check", () => {
    const html = renderToStaticMarkup(
      <BlockIssuesCard view={view()} llmsTxtFile={null} llmsPublishSteps={[]} sitemapFixSteps={[]} />
    );
    expect(html).toContain("Críticos");
    expect(html).toContain("Aviso");
    expect(html).toContain("+22 pt");
    expect(html).toContain("+4 pt");
    expect(html).toContain("sin puntos");
  });

  it("says the block is clean instead of drawing an empty list", () => {
    const html = renderToStaticMarkup(
      <BlockIssuesCard view={view({ issues: [] })} llmsTxtFile={null} llmsPublishSteps={[]} sitemapFixSteps={[]} />
    );
    expect(html).toContain("Ningún problema en este bloque");
  });
});

describe("BlockPassingCard", () => {
  it("lists what passes and, in GEO, the topics the AI already cites", () => {
    const html = renderToStaticMarkup(
      <BlockPassingCard
        view={view({ passing: [{ check: "content_length", passedCount: 5, applicableCount: 5 }] })}
        citedTopics={[{ promptId: "a", topic: "Precio de implantes" } as never]}
      />
    );
    expect(html).toContain("5 de 5 páginas");
    expect(html).toContain("Temas que la IA ya cita");
    expect(html).toContain("Precio de implantes");
  });
});
