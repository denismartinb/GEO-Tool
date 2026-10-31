import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, currentTheme, parseTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

// DARK-MODE-MENU-1 (log §397).

function fakeDom() {
  const attrs = new Map<string, string>();
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    documentElement: {
      getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k)
    }
  };
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    }
  };
  return { attrs, store };
}

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.window;
});

const read = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("tema de la consola", () => {
  it("claro salvo que se elija oscuro", () => {
    expect(parseTheme(null)).toBe("light");
    expect(parseTheme("system")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(currentTheme()).toBe("light");
  });

  it("applyTheme pone y quita el atributo y lo recuerda", () => {
    const { attrs, store } = fakeDom();
    applyTheme("dark");
    expect(attrs.get("data-theme")).toBe("dark");
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(currentTheme()).toBe("dark");
    applyTheme("light");
    expect(attrs.has("data-theme")).toBe(false);
    expect(store.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it("el script inicial va en el layout raíz y nunca sigue al sistema", () => {
    expect(read("app/layout.tsx")).toContain("THEME_INIT_SCRIPT");
    expect(THEME_INIT_SCRIPT).not.toContain("prefers-color-scheme");
  });

  it("el selector vive en el menú de cuenta y no en la cabecera", () => {
    const menus = read("components/ins/menus.tsx");
    const account = menus.slice(menus.indexOf("export function AccountPanel"), menus.indexOf("export function ThemeSwitchItem"));
    expect(account).toContain("<ThemeSwitchItem />");
    expect(read("components/ins/shell.tsx")).not.toMatch(/applyTheme|ThemeSwitchItem/);
  });

  it("dark.css solo actúa en oscuro y dentro de la consola", () => {
    const css = read("app/ins/dark.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = css.match(/[^{}]+(?=\{)/g) ?? [];
    expect(selectors.length).toBeGreaterThan(0);
    for (const group of selectors) {
      for (const sel of group.split(",")) {
        expect(sel.trim()).toMatch(/^:root\[data-theme="dark"\] \.ins\b/);
      }
    }
    expect(css).not.toContain("prefers-color-scheme");
  });
});
