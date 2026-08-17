import { describe, expect, it } from "vitest";
import { parseAnswerMarkdown, parseInline } from "./answer-markdown";

/**
 * FREE-CHECKER-1 Fase C.
 *
 * Lo que estos tests protegen es doble: que la respuesta se lea (era un muro de
 * URLs crudas) y que **no haya ninguna ruta por la que el texto de un LLM se
 * convierta en algo ejecutable**. Lo segundo importa más: esta pantalla es
 * pública, sin sesión, y lo que se pinta lo escribió un modelo sobre contenido
 * de terceros que ha leído en la web.
 */

describe("parseInline", () => {
  it("convierte un enlace de markdown en un nodo de enlace", () => {
    expect(parseInline("Mira [orange.es](https://www.orange.es/orange-tv) aquí")).toEqual([
      { kind: "text", text: "Mira " },
      { kind: "link", text: "orange.es", href: "https://www.orange.es/orange-tv" },
      { kind: "text", text: " aquí" }
    ]);
  });

  it("conserva la URL TAL CUAL, con su utm incluido", () => {
    // Es la respuesta literal del motor. Limpiarla sería enseñar algo distinto
    // de lo que se recibió, en la pantalla cuyo argumento entero es que enseña
    // lo que se recibió.
    const [node] = parseInline("[elpais.com](https://elpais.com/x.html?utm_source=openai)");
    expect(node).toEqual({
      kind: "link",
      text: "elpais.com",
      href: "https://elpais.com/x.html?utm_source=openai"
    });
  });

  it("un protocolo que no sea http(s) pierde el enlace y conserva el texto", () => {
    // Degradar es correcto; ejecutar no. Lo que se afirma es lo que importa:
    // NINGÚN nodo de enlace sale de aquí, y el texto sigue leyéndose. Los
    // caracteres sueltos que queden (el `)` de `alert(1)`) salen como texto,
    // que es la representación fiel de lo que había.
    for (const hostile of [
      "[pulsa aquí](javascript:alert(1))",
      "[ver](data:text/html;base64,PHNjcmlwdD4=)",
      "[abrir](vbscript:msgbox)",
      "[ir](//evil.example.com/x)"
    ]) {
      const nodes = parseInline(hostile);
      expect(nodes.some((node) => node.kind === "link")).toBe(false);
      expect(nodes.map((node) => node.text).join("")).toContain(hostile.slice(1, hostile.indexOf("]")));
    }
  });

  it("el HTML crudo del modelo sigue siendo texto, nunca marcado", () => {
    // No hay ruta a dangerouslySetInnerHTML: esto sale como caracteres.
    const nodes = parseInline('<script>alert(1)</script> y <img src=x onerror=y>');
    expect(nodes).toEqual([{ kind: "text", text: '<script>alert(1)</script> y <img src=x onerror=y>' }]);
  });

  it("respeta el orden entre negritas y enlaces en la misma línea", () => {
    expect(parseInline("**Orange** en [su web](https://orange.es)")).toEqual([
      { kind: "bold", text: "Orange" },
      { kind: "text", text: " en " },
      { kind: "link", text: "su web", href: "https://orange.es" }
    ]);
  });

  it("un enlace sin texto cae al propio dominio en vez de quedarse vacío", () => {
    expect(parseInline("[](https://redeszone.net/x)")).toEqual([
      { kind: "link", text: "https://redeszone.net/x", href: "https://redeszone.net/x" }
    ]);
  });
});

describe("parseAnswerMarkdown", () => {
  it("separa párrafos por líneas en blanco y une los saltos simples", () => {
    // Un salto simple es envoltura del motor, no una separación intencionada.
    const blocks = parseAnswerMarkdown("Primera línea\ny su continuación.\n\nOtro párrafo.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      inline: [{ kind: "text", text: "Primera línea y su continuación." }]
    });
  });

  it("agrupa viñetas contiguas en UNA lista", () => {
    const blocks = parseAnswerMarkdown("- Fibra 600 Mb\n- Línea móvil\n- 90 canales");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("list");
    if (blocks[0]?.kind !== "list") return;
    expect(blocks[0].items).toHaveLength(3);
  });

  it("reconoce listas numeradas y con asterisco, que ChatGPT mezcla", () => {
    const numbered = parseAnswerMarkdown("1. Orange\n2. Movistar");
    expect(numbered[0]?.kind).toBe("list");
    const starred = parseAnswerMarkdown("* Orange\n* Movistar");
    expect(starred[0]?.kind).toBe("list");
  });

  it("una línea entera en negrita es un título de apartado, no un párrafo", () => {
    // Es como ChatGPT titula cada opción ("**Orange Fútbol y Cine**"), y sin
    // esto todo el bloque se leía como un solo muro.
    const blocks = parseAnswerMarkdown("**Orange Fútbol y Cine**\nIncluye fibra de 600 Mb.");
    expect(blocks[0]).toEqual({ kind: "heading", inline: [{ kind: "text", text: "Orange Fútbol y Cine" }] });
    expect(blocks[1]?.kind).toBe("paragraph");
  });

  it("reconoce encabezados con almohadilla", () => {
    const blocks = parseAnswerMarkdown("## Opciones destacadas\nTexto.");
    expect(blocks[0]).toEqual({ kind: "heading", inline: [{ kind: "text", text: "Opciones destacadas" }] });
  });

  it("una respuesta vacía no produce bloques", () => {
    expect(parseAnswerMarkdown("")).toEqual([]);
    expect(parseAnswerMarkdown("\n\n  \n")).toEqual([]);
  });

  it("no pierde texto: todo lo que entra sale", () => {
    // La respuesta literal es la prueba de que la comprobación es real. Un
    // parser que se coma un trozo convierte esa prueba en un resumen.
    const raw = [
      "En España, varios operadores ofrecen paquetes.",
      "",
      "**Orange Fútbol y Cine**",
      "- Fibra de 600 Mb",
      "- Todo el fútbol ([orange.es](https://www.orange.es/orange-tv))",
      "",
      "Te recomiendo contactar con cada operador."
    ].join("\n");
    const flat = parseAnswerMarkdown(raw)
      .flatMap((block) => (block.kind === "list" ? block.items.flat() : block.inline))
      .map((node) => node.text)
      .join(" ");
    for (const fragment of ["varios operadores", "Orange Fútbol y Cine", "600 Mb", "orange.es", "contactar"]) {
      expect(flat).toContain(fragment);
    }
  });
});
