import { describe, expect, it } from "vitest";
import { proposeBrand, sanitizeBrandName, sanitizeConfirmedAliases } from "./brand-identity";

describe("proposeBrand", () => {
  it("usa el tramo del título que es la etiqueta del dominio", () => {
    const p = proposeBrand("elcorteingles.es", "El Corte Inglés | Moda, electrónica y hogar");
    expect(p).toEqual({ brand: "El Corte Inglés", source: "homepage_title", pending: false });
  });

  it("sin título (portada bloqueada) cae al dominio y queda pendiente", () => {
    const p = proposeBrand("elcorteingles.es", null);
    expect(p).toEqual({ brand: "Elcorteingles", source: "domain", pending: true });
  });

  it("un título que no coincide con el dominio no se usa", () => {
    const p = proposeBrand("genscore.es", "Software de visibilidad en IA para marcas");
    expect(p.source).toBe("domain");
    expect(p.pending).toBe(true);
  });

  it("no inventa espacios: con guiones los separa como siempre", () => {
    expect(proposeBrand("mi-tienda.com", null).brand).toBe("Mi Tienda");
  });

  it("limpia protocolo y www del dominio", () => {
    expect(proposeBrand("https://www.elcorteingles.es/", "El Corte Inglés").brand).toBe("El Corte Inglés");
  });
});

describe("sanitizeBrandName", () => {
  it("colapsa espacios y conserva tildes", () => {
    expect(sanitizeBrandName("  El   Corte  Inglés ")).toBe("El Corte Inglés");
  });
  it("rechaza vacío y excesos", () => {
    expect(sanitizeBrandName("   ")).toBeNull();
    expect(sanitizeBrandName("x".repeat(121))).toBeNull();
    expect(sanitizeBrandName(null)).toBeNull();
  });
});

describe("sanitizeConfirmedAliases", () => {
  it("acepta un alias real y descarta con motivo el genérico, el corto y el repetido", () => {
    const { accepted, rejected } = sanitizeConfirmedAliases(
      ["El Corte Inglés", "tienda", "ECI", "el corte inglés"],
      "Elcorteingles"
    );
    expect(accepted).toEqual(["El Corte Inglés"]);
    expect(rejected.map((r) => r.alias)).toEqual(["tienda", "ECI", "el corte inglés"]);
    expect(rejected.every((r) => r.error.length > 0)).toBe(true);
  });

  it("un alias igual a la marca no se duplica", () => {
    const { accepted } = sanitizeConfirmedAliases(["El Corte Inglés"], "El Corte Inglés");
    expect(accepted).toEqual([]);
  });

  it("un asistente de IA no es un alias", () => {
    const { accepted } = sanitizeConfirmedAliases(["ChatGPT"], "Marca");
    expect(accepted).toEqual([]);
  });
});
