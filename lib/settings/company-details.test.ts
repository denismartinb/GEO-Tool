import { describe, expect, it } from "vitest";

import { readBillingDetails, readCompanyDetails } from "./company-details";

/**
 * CONSOLE-REDESIGN-1. The old free-text `org_tax_info` ("datos fiscales", which
 * never said what to write inside) became `org_legal_name` + `org_tax_id`.
 *
 * Founder-approved migration (2026-08-06): the old value shows up as Razón
 * social and the NIF starts empty, seeded on READ so there is no migration and
 * the legacy key is never deleted.
 */
describe("readBillingDetails", () => {
  it("seeds Razón social from the legacy org_tax_info and leaves the NIF empty", () => {
    expect(readBillingDetails({ org_tax_info: "Xataka Media S.L." })).toEqual({
      legalName: "Xataka Media S.L.",
      taxId: ""
    });
  });

  it("prefers the new key once it has been saved, and stops reading the legacy one", () => {
    expect(
      readBillingDetails({
        org_tax_info: "lo que hubiera antes",
        org_legal_name: "Xataka Media S.L.",
        org_tax_id: "B-84920011"
      })
    ).toEqual({ legalName: "Xataka Media S.L.", taxId: "B-84920011" });
  });

  it("falls back to the legacy value when the new key exists but is blank", () => {
    expect(readBillingDetails({ org_tax_info: "Xataka Media S.L.", org_legal_name: "   " })).toEqual({
      legalName: "Xataka Media S.L.",
      taxId: ""
    });
  });

  it("returns empty strings for an account that never filled anything in", () => {
    expect(readBillingDetails({})).toEqual({ legalName: "", taxId: "" });
  });

  it("ignores non-string metadata rather than rendering [object Object]", () => {
    expect(readBillingDetails({ org_legal_name: { nope: true }, org_tax_id: 42 })).toEqual({
      legalName: "",
      taxId: ""
    });
  });
});

describe("readCompanyDetails", () => {
  it("reads the three declarative fields that stay in the Cuenta fold", () => {
    expect(
      readCompanyDetails({
        org_name: "Xataka",
        org_website: "xataka.com",
        org_sector: "Medios",
        org_tax_info: "no es asunto de esta sección"
      })
    ).toEqual({ name: "Xataka", website: "xataka.com", sector: "Medios" });
  });

  it("returns empty strings rather than undefined for a fresh account", () => {
    expect(readCompanyDetails({})).toEqual({ name: "", website: "", sector: "" });
  });
});
