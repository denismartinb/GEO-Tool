import { describe, expect, it } from "vitest";
import { sourceForDomain } from "./competitor-sources";

const SOURCES = [
  { uri: "https://vertexaisearch.example/r/1", title: "otterly.ai" },
  { uri: "https://vertexaisearch.example/r/2", title: "www.Profound.com" },
  { uri: "https://vertexaisearch.example/r/3", title: "Mejores herramientas GEO 2026" }
];

describe("sourceForDomain", () => {
  it("devuelve la fuente cuyo título es el sitio del competidor", () => {
    expect(sourceForDomain("otterly.ai", SOURCES)?.uri).toContain("/r/1");
    expect(sourceForDomain("https://www.profound.com/", SOURCES)?.uri).toContain("/r/2");
  });

  it("sin fuente propia queda sin fuente: no se reparte una fuente genérica", () => {
    expect(sourceForDomain("peec.ai", SOURCES)).toBeNull();
  });

  it("un dominio que sólo termina igual no cuenta", () => {
    expect(sourceForDomain("terly.ai", SOURCES)).toBeNull();
    expect(sourceForDomain("nototterly.ai", [{ uri: "u", title: "otterly.ai" }])).toBeNull();
  });

  it("un subdominio de la fuente respalda al dominio", () => {
    expect(sourceForDomain("otterly.ai", [{ uri: "u", title: "blog.otterly.ai" }])?.uri).toBe("u");
  });

  it("entradas vacías o inválidas no rompen", () => {
    expect(sourceForDomain("", SOURCES)).toBeNull();
    expect(sourceForDomain("sinpunto", SOURCES)).toBeNull();
    expect(sourceForDomain("otterly.ai", [])).toBeNull();
    expect(sourceForDomain("otterly.ai", [{ uri: "u" }])).toBeNull();
  });
});
