import { describe, expect, it } from "vitest";
import { classifySourceType } from "@/lib/citations/source-type";

describe("classifySourceType", () => {
  it("classifies known community domains, including subdomains", () => {
    expect(classifySourceType("reddit.com")).toBe("community");
    expect(classifySourceType("old.reddit.com")).toBe("community");
  });

  it("classifies known encyclopedia domains", () => {
    expect(classifySourceType("wikipedia.org")).toBe("encyclopedia");
    expect(classifySourceType("es.wikipedia.org")).toBe("encyclopedia");
  });

  it("classifies known comparator domains", () => {
    expect(classifySourceType("rastreator.com")).toBe("comparator");
  });

  it("classifies known media domains", () => {
    expect(classifySourceType("xataka.com")).toBe("media");
  });

  it("falls back to unknown for unrecognized domains rather than guessing", () => {
    expect(classifySourceType("some-random-blog.example")).toBe("unknown");
  });

  it("falls back to unknown for empty/null input", () => {
    expect(classifySourceType("")).toBe("unknown");
  });

  it("does not match unrelated domains that merely contain a known label", () => {
    // "notreddit.com" is not a subdomain of "reddit.com" — label-boundary
    // matching (isSameOrSubdomain) must reject it.
    expect(classifySourceType("notreddit.com")).toBe("unknown");
  });
});
