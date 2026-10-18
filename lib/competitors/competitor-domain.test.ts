import { describe, expect, it } from "vitest";
import { parseCompetitorDomain } from "./competitor-domain";
import { domainSchemaForTests } from "./manage-competitors";

describe("parseCompetitorDomain", () => {
  it("normalizes and accepts what the server accepts", () => {
    expect(parseCompetitorDomain("https://www.Semrush.com/blog")).toBe("semrush.com");
    expect(parseCompetitorDomain("rankscale.ai")).toBe("rankscale.ai");
  });

  it("rejects what the server rejects", () => {
    for (const bad of ["rankscale", "", "a.", "-bad.com", "con espacio.com"]) {
      expect(parseCompetitorDomain(bad)).toBeNull();
      expect(domainSchemaForTests.safeParse(bad).success).toBe(false);
    }
  });
});
