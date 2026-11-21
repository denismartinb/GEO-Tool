import { engineName } from "@/components/ins/kit/engine";
import type { InsCard } from "@/lib/ins/recs-cards";
import { EngineRow } from "./card-parts";

/** «Visto en N preguntas de ChatGPT y Gemini», with the logos in front. */
export function enginesLine(card: InsCard) {
  const names = Array.from(new Set(card.providers.map(engineName)));
  const list =
    names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  const n = card.questions.length;
  return (
    <>
      <EngineRow providers={card.providers} size={13} />
      {n > 0 ? `Visto en ${n} ${n === 1 ? "pregunta" : "preguntas"}` : "Visto"}
      {list ? ` de ${list}` : ""}
    </>
  );
}
