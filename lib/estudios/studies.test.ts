import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { getStudies, studiesLastModified, STUDIES_LEAD, STUDIES_METHOD } from "./studies";

describe("studies hub (GEO-SELF-1 Fase 4)", () => {
  it("every study is a published blog post", () => {
    for (const s of getStudies()) {
      expect(BLOG_POSTS.some((p) => p.slug === s.post.slug)).toBe(true);
      expect(s.href).toBe(`/blog/${s.post.slug}`);
    }
  });

  it("every study has a headline figure with its source", () => {
    for (const s of getStudies()) {
      expect(s.post.heroStat?.source, s.post.slug).toBeTruthy();
    }
  });

  it("lists the newest study first", () => {
    const dates = getStudies().map((s) => s.post.datePublished);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("derives its last-modified date from the studies", () => {
    expect(studiesLastModified()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("names only the engines GenScore runs and no model versions", () => {
    const text = [STUDIES_LEAD, ...STUDIES_METHOD].join(" ");
    expect(text).not.toMatch(/Perplexity|Copilot|gpt-|gemini-\d|claude-|haiku|sonnet/i);
    expect(text).toContain("ChatGPT");
    expect(text).toContain("Gemini");
    expect(text).toContain("Claude");
  });

  it("publishes no absolute counts of questions or answers", () => {
    const text = [STUDIES_LEAD, ...STUDIES_METHOD].join(" ");
    expect(text).not.toMatch(/\d+\s+(preguntas|respuestas|consultas|escaneos)/i);
  });
});
