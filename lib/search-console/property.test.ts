import { describe, expect, it } from "vitest";
import { propertyLabel, propertyMatchesDomain, rankMatchingProperties } from "./property";

describe("propertyMatchesDomain", () => {
  it("accepts a domain property that covers the project", () => {
    expect(propertyMatchesDomain("sc-domain:ikea.es", "ikea.es")).toBe(true);
    expect(propertyMatchesDomain("sc-domain:ikea.es", "www.ikea.es")).toBe(true);
    expect(propertyMatchesDomain("sc-domain:blog.ikea.es", "ikea.es")).toBe(false);
  });
  it("accepts a URL prefix on the same host in either direction", () => {
    expect(propertyMatchesDomain("https://www.ikea.es/", "ikea.es")).toBe(true);
    expect(propertyMatchesDomain("https://ikea.es/es/", "tienda.ikea.es")).toBe(true);
  });
  it("rejects unrelated or look-alike hosts and junk", () => {
    expect(propertyMatchesDomain("sc-domain:notikea.es", "ikea.es")).toBe(false);
    expect(propertyMatchesDomain("https://ikea.es.evil.com/", "ikea.es")).toBe(false);
    expect(propertyMatchesDomain("ftp://ikea.es/", "ikea.es")).toBe(false);
    expect(propertyMatchesDomain("sc-domain:", "ikea.es")).toBe(false);
  });
});

describe("rankMatchingProperties", () => {
  it("prefers the domain property, then https, and drops non-matching ones", () => {
    expect(
      rankMatchingProperties(
        ["http://ikea.es/", "https://www.ikea.es/", "sc-domain:ikea.es", "https://other.com/"],
        "ikea.es"
      )
    ).toEqual(["sc-domain:ikea.es", "https://www.ikea.es/", "http://ikea.es/"]);
  });
});

describe("propertyLabel", () => {
  it("names a domain property in plain words", () => {
    expect(propertyLabel("sc-domain:ikea.es")).toBe("ikea.es (todo el dominio)");
    expect(propertyLabel("https://www.ikea.es/")).toBe("https://www.ikea.es/");
  });
});
