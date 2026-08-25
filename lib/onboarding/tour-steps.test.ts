import { describe, expect, it } from "vitest";

import {
  AUTOPLAY_THROUGH_STEP_INDEX,
  FREEZE_OFFSET_MS,
  STEP_END_MARGIN_MS,
  TOUR_DURATION_MS,
  TOUR_STEPS,
  freezeTimeFor,
  holdTimeFor,
  stepIndexAt
} from "./tour-steps";

describe("línea de tiempo del tour", () => {
  it("cubre el reloj entero sin huecos ni solapes", () => {
    expect(TOUR_STEPS[0].from).toBeGreaterThan(0); // la entrada del cursor
    TOUR_STEPS.forEach((step, i) => {
      expect(step.to).toBeGreaterThan(step.from);
      if (i > 0) expect(step.from).toBe(TOUR_STEPS[i - 1].to);
    });
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].to).toBe(TOUR_DURATION_MS);
  });

  it("numera los pasos de 1 a 8 en orden", () => {
    expect(TOUR_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("da a cada paso tiempo suficiente para leer su subtítulo", () => {
    // Por debajo de ~3 s por pantalla el rótulo no da tiempo a leerse; es la
    // razón por la que el tour tiene ocho pasos y no catorce.
    TOUR_STEPS.forEach((step) => {
      expect(step.to - step.from).toBeGreaterThanOrEqual(3_000);
    });
  });

  it("gasta la mayoría del metraje en producto, no en el montaje", () => {
    const montaje = TOUR_STEPS[0].to - TOUR_STEPS[0].from + (TOUR_STEPS[1].to - TOUR_STEPS[1].from);
    expect(montaje / TOUR_DURATION_MS).toBeLessThan(0.2);
  });

  it("sólo admite <b> como marcado en los subtítulos", () => {
    TOUR_STEPS.forEach((step) => {
      const etiquetas = step.sub.match(/<[^>]+>/g) ?? [];
      etiquetas.forEach((tag) => expect(["<b>", "</b>"]).toContain(tag));
    });
  });
});

describe("stepIndexAt", () => {
  it("mapea cada instante a su paso", () => {
    expect(stepIndexAt(0)).toBe(0);
    expect(stepIndexAt(TOUR_STEPS[0].from)).toBe(0);
    expect(stepIndexAt(TOUR_STEPS[3].from + 1)).toBe(3);
    expect(stepIndexAt(TOUR_DURATION_MS)).toBe(TOUR_STEPS.length - 1);
  });

  it("devuelve el último paso pasado el final, no un índice fuera de rango", () => {
    expect(stepIndexAt(TOUR_DURATION_MS + 10_000)).toBe(TOUR_STEPS.length - 1);
  });

  it("el paso 0 cubre también el tramo de entrada del cursor", () => {
    expect(stepIndexAt(TOUR_STEPS[0].from - 100)).toBe(0);
  });
});

describe("freezeTimeFor", () => {
  it("congela dentro del paso, nunca en su arranque", () => {
    TOUR_STEPS.forEach((step, i) => {
      const t = freezeTimeFor(i);
      expect(t).toBeGreaterThan(step.from);
      expect(t).toBeLessThan(step.to);
      // Y el instante congelado tiene que seguir perteneciendo al paso.
      expect(stepIndexAt(t)).toBe(i);
    });
  });

  it("no se pasa del final en los pasos cortos", () => {
    const corto = TOUR_STEPS.findIndex((s) => s.to - s.from < FREEZE_OFFSET_MS);
    expect(corto).toBeGreaterThanOrEqual(0); // el paso 2 dura 3,3 s
    expect(freezeTimeFor(corto)).toBe(TOUR_STEPS[corto].to - 200);
  });

  it("acota los índices fuera de rango en vez de reventar", () => {
    expect(freezeTimeFor(-5)).toBe(freezeTimeFor(0));
    expect(freezeTimeFor(999)).toBe(freezeTimeFor(TOUR_STEPS.length - 1));
  });
});

describe("holdTimeFor", () => {
  it("se detiene dentro del paso, no en el siguiente", () => {
    TOUR_STEPS.forEach((step, i) => {
      const t = holdTimeFor(i);
      expect(t).toBeGreaterThan(step.from);
      expect(t).toBeLessThan(step.to);
      // Lo que hace que la parada sirva: el fotograma congelado sigue siendo
      // de este paso, así que el subtítulo que se queda leyendo es el suyo.
      expect(stepIndexAt(t)).toBe(i);
    });
  });

  it("para lo más tarde posible dentro del paso", () => {
    TOUR_STEPS.forEach((step, i) => {
      expect(holdTimeFor(i)).toBe(step.to - STEP_END_MARGIN_MS);
    });
  });

  it("acota los índices fuera de rango en vez de reventar", () => {
    expect(holdTimeFor(-3)).toBe(holdTimeFor(0));
    expect(holdTimeFor(999)).toBe(holdTimeFor(TOUR_STEPS.length - 1));
  });

  it("el último paso no se pasa del reloj", () => {
    expect(holdTimeFor(TOUR_STEPS.length - 1)).toBeLessThan(TOUR_DURATION_MS);
  });
});

describe("reproducción automática", () => {
  it("sólo cubre el primer paso", () => {
    // Si algún día se amplía, hay que revisar que el subtítulo del último
    // paso autorreproducido dé tiempo a leerse antes de la parada.
    expect(AUTOPLAY_THROUGH_STEP_INDEX).toBe(0);
  });

  it("para en un instante que pertenece al paso autorreproducido", () => {
    const t = holdTimeFor(AUTOPLAY_THROUGH_STEP_INDEX);
    expect(stepIndexAt(t)).toBe(AUTOPLAY_THROUGH_STEP_INDEX);
  });

  it("deja los demás pasos al usuario", () => {
    expect(AUTOPLAY_THROUGH_STEP_INDEX).toBeLessThan(TOUR_STEPS.length - 1);
  });
});
