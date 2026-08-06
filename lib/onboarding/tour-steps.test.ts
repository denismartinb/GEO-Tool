import { describe, expect, it } from "vitest";

import {
  FREEZE_OFFSET_MS,
  TOUR_DURATION_MS,
  TOUR_SEEN_STORAGE_KEY,
  TOUR_STEPS,
  freezeTimeFor,
  hasSeenTour,
  markTourSeen,
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

describe("marca de «ya visto»", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      read: () => data
    };
  }

  it("no da por visto lo que nunca se marcó", () => {
    expect(hasSeenTour(fakeStorage())).toBe(false);
  });

  it("marca y reconoce", () => {
    const s = fakeStorage();
    markTourSeen(s);
    expect(s.read()[TOUR_SEEN_STORAGE_KEY]).toBe("1");
    expect(hasSeenTour(s)).toBe(true);
  });

  it("trata como no visto cualquier valor que no sea exactamente «1»", () => {
    expect(hasSeenTour(fakeStorage({ [TOUR_SEEN_STORAGE_KEY]: "true" }))).toBe(false);
    expect(hasSeenTour(fakeStorage({ [TOUR_SEEN_STORAGE_KEY]: "" }))).toBe(false);
  });

  it("sobrevive a un almacenamiento ausente — servidor, o navegador que lo bloquea", () => {
    expect(hasSeenTour(null)).toBe(false);
    expect(hasSeenTour(undefined)).toBe(false);
    expect(() => markTourSeen(null)).not.toThrow();
  });

  it("sobrevive a un almacenamiento que lanza — Safari en modo privado", () => {
    const roto = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("QuotaExceededError");
      }
    };
    expect(hasSeenTour(roto)).toBe(false);
    expect(() => markTourSeen(roto)).not.toThrow();
  });
});
