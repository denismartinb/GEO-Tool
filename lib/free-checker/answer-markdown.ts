/**
 * FREE-CHECKER-1 Fase C — la respuesta de ChatGPT, legible.
 *
 * **Por qué hace falta un parser y no basta con pintar el texto.** La respuesta
 * llega en markdown: `**negritas**`, viñetas y, sobre todo, enlaces
 * `[texto](url)` — que son las fuentes que el motor consultó de verdad. Pintada
 * en crudo dentro de un `<blockquote>`, esa respuesta es un muro con URLs
 * enteras a la vista (fundador, 2026-08-16, sobre la primera ejecución real).
 * Lo que el visitante viene a leer es la prueba de que esto es real, así que
 * tiene que poder leerse.
 *
 * **Por qué es propio y mínimo, y no una librería.** Esto se sirve en una
 * página pública a un desconocido, y lo que se renderiza lo escribió un LLM
 * sobre contenido de terceros que ha leído en la web. Un renderizador de
 * markdown completo trae HTML crudo, imágenes y entidades; aquí no se necesita
 * ninguna de las tres. Este módulo devuelve **datos**, no HTML: nodos que el
 * componente pinta como elementos de React. No existe ninguna ruta a
 * `dangerouslySetInnerHTML`, así que la inyección no es algo que haya que
 * recordar evitar — es imposible por construcción.
 *
 * **Los enlaces se validan por protocolo.** Sólo `http:` y `https:`. Un
 * `javascript:` o un `data:` se degradan a texto plano: se pierde el enlace,
 * nunca se ejecuta. Y la URL se conserva TAL CUAL la devolvió el motor,
 * incluido su `?utm_source=openai` — es la respuesta literal, y limpiarla sería
 * enseñar algo distinto de lo que se recibió.
 */

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

export type AnswerBlock =
  | { kind: "paragraph"; inline: InlineNode[] }
  | { kind: "list"; items: InlineNode[][] }
  /** Un `## título` o una línea entera en negrita, que es como ChatGPT separa apartados. */
  | { kind: "heading"; inline: InlineNode[] };

/** `[texto](url)` o `**negrita**`, en un solo barrido para respetar el orden. */
const INLINE_PATTERN = /\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/** Viñeta (`-`, `*`, `+`) o lista numerada, con sangría opcional. */
const LIST_ITEM_PATTERN = /^\s{0,6}(?:[-*+]|\d{1,2}[.)])\s+(.*)$/;

const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.*)$/;

/** Una línea que es ENTERA una negrita: como ChatGPT titula cada opción. */
const BOLD_LINE_PATTERN = /^\s*\*\*([^*]+)\*\*\s*:?\s*$/;

/**
 * `http`/`https` y nada más. Deliberadamente una comprobación de cadena y no
 * `new URL()`: aquí sólo interesa el protocolo, y un parseo completo añade
 * casos límite (URLs relativas, IDN) sin comprar seguridad.
 */
function isSafeHref(href: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(href);
}

export function parseInline(raw: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let lastIndex = 0;

  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ kind: "text", text: raw.slice(lastIndex, match.index) });
    }

    const [full, linkText, href, boldText] = match;
    if (href !== undefined) {
      const label = linkText?.trim() || href;
      // Un protocolo que no sea http(s) pierde el enlace y conserva el texto:
      // degradar es correcto, ejecutar no.
      nodes.push(isSafeHref(href) ? { kind: "link", text: label, href } : { kind: "text", text: label });
    } else if (boldText !== undefined) {
      nodes.push({ kind: "bold", text: boldText });
    } else {
      nodes.push({ kind: "text", text: full });
    }
    lastIndex = match.index + full.length;
  }

  if (lastIndex < raw.length) nodes.push({ kind: "text", text: raw.slice(lastIndex) });
  return nodes.filter((node) => node.kind !== "text" || node.text.length > 0);
}

export function parseAnswerMarkdown(raw: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  /** Líneas sueltas que todavía no se han cerrado como párrafo. */
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    // Las líneas contiguas se unen con un espacio: un salto simple dentro de un
    // párrafo es envoltura del motor, no una separación que el autor quisiera.
    blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ kind: "list", items: listItems.map((item) => parseInline(item)) });
    listItems = [];
  };

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const listMatch = LIST_ITEM_PATTERN.exec(line);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1] ?? "");
      continue;
    }

    const headingMatch = HEADING_PATTERN.exec(line) ?? BOLD_LINE_PATTERN.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", inline: parseInline(headingMatch[1] ?? "") });
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}
