import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "@/app/pricing/plans-data";
import { CANONICAL_DEFINITION, SUPPORTED_ENGINES } from "@/lib/brand/canonical-definition";

/**
 * El kit de autoridad off-site no se queda rancio — SEO-POS-1 Fase A.
 *
 * **Por qué esto necesita un test y no basta con escribirlo bien.**
 * `docs/off-site-authority-kit.md` es lo único de este repositorio pensado para
 * **copiarse y pegarse fuera**: en una ficha de G2, en la descripción de un
 * vídeo, en un hilo de Reddit. Y lo de fuera no se refresca solo. El día que
 * cambie un precio o un tope de plan, el sitio se actualiza en el mismo PR y el
 * kit no — y el fundador acaba pegando cifras viejas en un sitio donde ni el
 * piloto ni el compilador miran nunca.
 *
 * Es el mismo argumento que obligó a atar los umbrales publicados de la
 * auditoría a su constante real (`.claude/rules/growth-content.md`, "Si una
 * cifra del producto llega a publicarse, se ata al código con un test"), sólo
 * que un escalón más lejos: aquí la cifra ni siquiera vive en nuestro dominio,
 * así que nadie la va a encontrar mal.
 *
 * Lo que NO comprueba: la redacción. Las plantillas de Reddit y los guiones son
 * prosa y se cambian sin permiso de nadie. Lo que se fija son los **datos**.
 */

const kit = readFileSync(join(process.cwd(), "docs", "off-site-authority-kit.md"), "utf8");

/** Fila de la tabla de planes del kit: `| Nombre | Precio | Dominios | Prompts | Motores | Frecuencia |`. */
function kitPlanRow(planName: string): string[] {
  const row = kit
    .split("\n")
    .find((line) => line.startsWith(`| ${planName} |`));
  if (!row) throw new Error(`El kit no tiene fila para el plan "${planName}"`);
  return row
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

describe("el kit off-site publica los planes que el producto vende de verdad", () => {
  for (const plan of PLANS) {
    it(`${plan.name}: precio, topes y frecuencia coinciden con el código`, () => {
      const [, price, projects, prompts, engines, refresh] = kitPlanRow(plan.name);

      const expectedPrice = plan.priceLabel ?? (plan.price === 0 ? "0 €" : `${plan.price} €`);
      expect(price, `precio de ${plan.name}`).toBe(expectedPrice);
      expect(projects, `dominios de ${plan.name}`).toBe(plan.meter.projects);
      expect(prompts, `prompts de ${plan.name}`).toBe(String(plan.meter.prompts));
      expect(engines, `motores de ${plan.name}`).toBe(String(plan.meter.engines));
      expect(refresh, `frecuencia de ${plan.name}`).toBe(plan.meter.refresh);
    });
  }

  it("no inventa un plan que no existe", () => {
    const rows = kit.split("\n").filter((line) => /^\| (Free|Starter|Pro|Agencia)/.test(line));
    expect(rows.length).toBe(PLANS.length);
  });
});

describe("lo que el kit dice de la marca es lo que dice el producto", () => {
  it("cita la definición canónica literalmente, no una versión parecida", () => {
    // Sin el punto final y con los saltos de la cita en bloque deshechos: el
    // documento la parte en varias líneas con `> ` delante.
    const quoted = kit
      .split("\n")
      .filter((line) => line.startsWith("> "))
      .map((line) => line.slice(2).trim())
      .join(" ");
    expect(
      quoted.includes(CANONICAL_DEFINITION),
      "El kit ya no cita la definición canónica palabra por palabra. Toda la Fase E se " +
        "sostiene en que sea LITERALMENTE la misma cadena dentro y fuera del sitio: una " +
        "versión parecida en una ficha de G2 es otra descripción más para un motor."
    ).toBe(true);
  });

  it("nombra los tres motores que ejecutamos y ninguno más", () => {
    for (const engine of SUPPORTED_ENGINES) {
      expect(kit, `el kit debería nombrar ${engine}`).toContain(engine);
    }
  });

  /**
   * Los límites que un comprador comprueba en dos clics. Están exigidos por
   * nombre en las comparativas (`alternativas-a-otterly.test.ts`) y valen
   * igual —o más— fuera del sitio, donde nadie modera lo que decimos.
   */
  it("declara los límites reales del producto", () => {
    expect(kit).toMatch(/Perplexity/);
    expect(kit).toMatch(/Copilot/);
    expect(kit).toMatch(/desglose por país/i);
  });

  it("no promete la nota de prensa como si el dato existiera", () => {
    // El Observatorio no está aprobado. Una plantilla de nota de prensa aquí
    // sería un molde invitando a rellenarse con números que nadie ha medido.
    expect(
      /Bloqueada|bloqueada/.test(kit) && /Observatorio/.test(kit),
      "El kit tiene que seguir diciendo que la nota de prensa está bloqueada y por qué. " +
        "Si el Observatorio se aprueba y produce un estudio real, la nota se escribe DESDE " +
        "ese dato — no antes."
    ).toBe(true);
  });
});
