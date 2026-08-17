import { Fragment } from "react";
import { parseAnswerMarkdown, type InlineNode } from "@/lib/free-checker/answer-markdown";

/**
 * FREE-CHECKER-1 Fase C — pinta la respuesta del motor.
 *
 * Toda la lógica vive en `lib/free-checker/answer-markdown.ts`, que devuelve
 * datos y tiene tests sin navegador. Aquí sólo se convierten esos datos en
 * elementos de React: **no hay ninguna ruta a `dangerouslySetInnerHTML`**, así
 * que el texto de un LLM no puede convertirse en marcado por descuido.
 *
 * Los enlaces salen a una pestaña nueva con `rel="nofollow noopener noreferrer"`:
 * apuntan a webs de terceros que el motor eligió, no que nosotros avalemos, y
 * el visitante está a mitad de leer su resultado — llevárselo de la página
 * sería perderlo.
 */
function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.kind === "bold") return <strong key={i}>{node.text}</strong>;
        if (node.kind === "link") {
          return (
            <a key={i} href={node.href} target="_blank" rel="nofollow noopener noreferrer">
              {node.text}
            </a>
          );
        }
        return <Fragment key={i}>{node.text}</Fragment>;
      })}
    </>
  );
}

export function AnswerMarkdown({ text }: { text: string }) {
  const blocks = parseAnswerMarkdown(text);

  // Una respuesta que no produce bloques se enseña tal cual antes que no
  // enseñarse: el texto literal del motor es la prueba de que esto es real, y
  // un parser que se quede corto no puede hacerla desaparecer.
  if (blocks.length === 0) return <p className="fc-answer-p">{text}</p>;

  return (
    <div className="fc-answer">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <p key={i} className="fc-answer-h">
              <Inline nodes={block.inline} />
            </p>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i} className="fc-answer-ul">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline nodes={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="fc-answer-p">
            <Inline nodes={block.inline} />
          </p>
        );
      })}
    </div>
  );
}
