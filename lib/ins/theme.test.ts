import { describe, expect, it } from "vitest";
import { parseTheme, THEME_INIT_SCRIPT } from "./theme";

describe("tema de la consola", () => {
  it("es claro salvo que se elija oscuro", () => {
    expect(parseTheme(null)).toBe("light");
    expect(parseTheme("system")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });
  it("el script de arranque no mira el tema del sistema", () => {
    expect(THEME_INIT_SCRIPT).not.toContain("prefers-color-scheme");
  });
});
