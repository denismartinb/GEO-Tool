import { describe, expect, it } from "vitest";
import {
  allClinicSlugs,
  CITIES,
  CITY_IDS,
  clinicName,
  EDITION,
  ENGINES,
  getCity,
  getClinicSightings,
  studyExists
} from "./clinicas-dentales";

describe("observatorio clinicas dentales", () => {
  it("el estudio del que salen los datos existe en el blog", () => {
    expect(studyExists()).toBe(true);
  });

  it("los slugs de clínica son únicos por ciudad y válidos como ruta", () => {
    for (const city of CITY_IDS) {
      const slugs = CITIES[city].clinics.map((c) => c.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("regla pública: solo se nombran clínicas que la IA recomienda (presencia > 0)", () => {
    for (const city of CITY_IDS) {
      for (const clinic of CITIES[city].clinics) {
        expect(clinic.presence, `${clinic.name} en ${city}`).toBeGreaterThan(0);
      }
    }
  });

  it("todos los porcentajes están entre 0 y 100", () => {
    for (const city of CITY_IDS) {
      for (const clinic of CITIES[city].clinics) {
        expect(clinic.presence).toBeLessThanOrEqual(100);
        for (const engine of Object.keys(ENGINES) as (keyof typeof ENGINES)[]) {
          const value = clinic.byEngine[engine];
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("getCity solo acepta las ciudades medidas", () => {
    expect(getCity("madrid")?.name).toBe("Madrid");
    expect(getCity("valencia")?.name).toBe("Valencia");
    expect(getCity("barcelona")).toBeUndefined();
  });

  it("una cadena presente en dos ciudades comparte slug y nombre", () => {
    const sightings = getClinicSightings("vitaldent");
    expect(sightings.length).toBe(2);
    expect(new Set(sightings.map((s) => s.clinic.name)).size).toBe(1);
    expect(clinicName("vitaldent")).toBe("Vitaldent");
  });

  it("allClinicSlugs no devuelve duplicados", () => {
    const slugs = allClinicSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBeGreaterThan(0);
  });

  it("la edición declara la fecha de la medición del estudio", () => {
    expect(EDITION.measuredAt).toBe("2026-10-10");
  });
});
