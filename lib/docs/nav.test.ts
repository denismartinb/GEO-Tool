import { describe, expect, it } from "vitest";
import { DOCS_NAV, getDocPage, getDocSectionFor } from "./nav";

describe("DOCS_NAV", () => {
  it("every page has a unique slug", () => {
    const slugs = DOCS_NAV.flatMap((section) => section.pages.map((p) => p.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every slug is a clean relative path with no leading/trailing slash", () => {
    for (const section of DOCS_NAV) {
      for (const page of section.pages) {
        expect(page.slug.startsWith("/")).toBe(false);
        expect(page.slug.endsWith("/")).toBe(false);
      }
    }
  });
});

describe("getDocPage", () => {
  it("finds an existing page and returns undefined for an unknown slug", () => {
    const firstSlug = DOCS_NAV[0].pages[0].slug;
    expect(getDocPage(firstSlug)?.slug).toBe(firstSlug);
    expect(getDocPage("no-existe/nada")).toBeUndefined();
  });
});

describe("getDocSectionFor", () => {
  it("finds the section containing a given slug", () => {
    const firstSlug = DOCS_NAV[0].pages[0].slug;
    expect(getDocSectionFor(firstSlug)?.title).toBe(DOCS_NAV[0].title);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getDocSectionFor("no-existe/nada")).toBeUndefined();
  });
});
