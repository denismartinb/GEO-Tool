import { describe, expect, it } from "vitest";
import { describeTopicContrast } from "./topic-contrast";

describe("describeTopicContrast", () => {
  it("all topics at 0% is NOT 'strong in one, weak in another'", () => {
    const result = describeTopicContrast([
      { category: "Precio y planes", visibilidad: 0 },
      { category: "Cómo hacer / guía", visibilidad: 0 },
      { category: "Comparación", visibilidad: 0 }
    ]);
    expect(result).toEqual({ kind: "all_zero" });
  });

  it("a non-zero tie is a tie, whatever order the topics arrive in", () => {
    const a = describeTopicContrast([
      { category: "A", visibilidad: 40 },
      { category: "B", visibilidad: 40 }
    ]);
    const b = describeTopicContrast([
      { category: "B", visibilidad: 40 },
      { category: "A", visibilidad: 40 }
    ]);
    expect(a).toEqual({ kind: "tie", pct: 40 });
    expect(b).toEqual(a);
  });

  it("reports best and worst only when they differ", () => {
    expect(
      describeTopicContrast([
        { category: "Precio y planes", visibilidad: 0 },
        { category: "Comparación", visibilidad: 33 },
        { category: "Cómo hacer / guía", visibilidad: 10 }
      ])
    ).toEqual({
      kind: "spread",
      best: { category: "Comparación", pct: 33 },
      worst: { category: "Precio y planes", pct: 0 }
    });
  });

  it("with fewer than two topics there is nothing to contrast", () => {
    expect(describeTopicContrast([])).toEqual({ kind: "none" });
    expect(describeTopicContrast([{ category: "A", visibilidad: 50 }])).toEqual({ kind: "none" });
  });
});
