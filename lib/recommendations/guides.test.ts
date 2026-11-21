import { describe, expect, it } from "vitest";
import { getBlogPost } from "@/lib/blog/posts";
import { KNOWN_RECOMMENDATION_TYPES } from "@/lib/recommendations/recommendation-engine";
import { GUIDED_TYPES, guideForType } from "./guides";

describe("guideForType (RECS-GUIDES-1)", () => {
  it("cada tipo enlaza a un artículo que existe", () => {
    for (const type of GUIDED_TYPES) {
      const guide = guideForType(type);
      expect(guide, type).not.toBeNull();
      const slug = guide!.href.split("?")[0].replace("/blog/", "");
      expect(getBlogPost(slug), slug).toBeDefined();
      expect(guide!.href).toContain("desde=recomendaciones");
    }
  });

  it("sólo mapea tipos que el motor emite", () => {
    for (const type of GUIDED_TYPES) expect(KNOWN_RECOMMENDATION_TYPES).toContain(type);
  });

  it("un tipo sin guía no enlaza nada", () => {
    expect(guideForType("amplify_positive_pattern")).toBeNull();
    expect(guideForType("google_page_one")).toBeNull();
  });

  it("los textos no llevan rayas largas", () => {
    for (const type of GUIDED_TYPES) expect(guideForType(type)!.label).not.toContain("—");
  });
});
