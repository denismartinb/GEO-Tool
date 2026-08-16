import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addedLineNumbers,
  applyRenumber,
  DUPLICADOS_HEREDADOS,
  main as fixMain,
  parseSections,
  planRenumbers,
  replaceOnLines,
  sectionBlocks
} from "./fix-log-numbering-core";

/**
 * PRELAUNCH-HARDENING-1 — el autofix del histórico, y la prueba de que hace
 * exactamente lo que promete y ni un carácter más.
 *
 * Dos capas de test a propósito. Las funciones puras se comprueban solas —
 * baratas y precisas — y el `describe` de integración monta un repo git de
 * verdad y corre `main()` de punta a punta, siguiendo el mismo patrón que
 * `vercel-should-build.test.ts`: el riesgo real de este script no está en la
 * lógica de texto, está en qué considera "línea añadida por mi rama", y eso
 * sólo se puede afirmar contra un `git diff` de verdad.
 */

describe("parseSections / sectionBlocks", () => {
  const TEXT = [
    "# Título",
    "",
    "## 1. Primera",
    "",
    "Cuerpo uno.",
    "",
    "---",
    "",
    "## 2. Segunda",
    "",
    "Cuerpo dos.",
    "",
    "---",
    "",
    "## Cómo mantener este documento",
    "",
    "Instrucciones."
  ].join("\n");

  it("encuentra las cabeceras numeradas, no el trailer", () => {
    const sections = parseSections(TEXT);
    expect(sections.map((s) => s.number)).toEqual([1, 2]);
    expect(sections.map((s) => s.title)).toEqual(["Primera", "Segunda"]);
  });

  it("cada bloque contiene su propio cuerpo y no el de la siguiente sección", () => {
    const blocks = sectionBlocks(TEXT);
    expect(blocks[0].block).toContain("Cuerpo uno.");
    expect(blocks[0].block).not.toContain("Cuerpo dos.");
    expect(blocks[1].block).toContain("Cuerpo dos.");
    expect(blocks[1].block).not.toContain("Instrucciones.");
  });
});

describe("planRenumbers", () => {
  const s = (number: number, title: string) => ({ number, title, headerStart: 0, headerLine: "" });

  it("la sección que YA está en main se queda; la otra se renumera", () => {
    const local = [s(1, "Vieja"), s(5, "De main"), s(5, "Mía, nueva")];
    const main = [{ number: 5, title: "De main" }];
    const { toRename, unresolved } = planRenumbers(local, main);
    expect(unresolved).toEqual([]);
    expect(toRename).toEqual([{ number: 5, newNumber: 6, title: "Mía, nueva" }]);
  });

  it("una colisión ya heredada no se toca", () => {
    const number = [...DUPLICADOS_HEREDADOS][0];
    const local = [s(number, "A"), s(number, "B")];
    const { toRename, heredadaSkipped } = planRenumbers(local, []);
    expect(toRename).toEqual([]);
    expect(heredadaSkipped).toEqual([number]);
  });

  it("dos secciones ya publicadas con el mismo número: ambigua, no se decide sola", () => {
    const local = [s(7, "Una"), s(7, "Otra")];
    const main = [
      { number: 7, title: "Una" },
      { number: 7, title: "Otra" }
    ];
    const { toRename, unresolved } = planRenumbers(local, main);
    expect(toRename).toEqual([]);
    expect(unresolved).toEqual([{ number: 7, titles: ["Una", "Otra"] }]);
  });

  it("ninguna está en main: duplicado nacido dentro de la misma rama, se queda la primera", () => {
    const local = [s(3, "Copiada"), s(3, "Copiada de nuevo")];
    const { toRename } = planRenumbers(local, []);
    expect(toRename).toEqual([{ number: 3, newNumber: 4, title: "Copiada de nuevo" }]);
  });

  it("el siguiente libre es el máximo de TODAS las secciones + 1, no sólo las del grupo", () => {
    const local = [s(1, "a"), s(9, "b"), s(9, "c")];
    const main = [{ number: 9, title: "b" }];
    const { toRename } = planRenumbers(local, main);
    expect(toRename).toEqual([{ number: 9, newNumber: 10, title: "c" }]);
  });
});

describe("applyRenumber", () => {
  const TEXT = [
    "## 1. Uno",
    "",
    "Cuerpo.",
    "",
    "---",
    "",
    "## 2. Dos",
    "",
    "Cuerpo dos.",
    "",
    "---",
    "",
    "## Cómo mantener este documento",
    "",
    "Fin."
  ].join("\n");

  it("renumera la cabecera y mueve el bloque al final, antes del trailer", () => {
    const out = applyRenumber(TEXT, { number: 1, newNumber: 3 });
    const sections = parseSections(out);
    expect(sections.map((s) => s.number)).toEqual([2, 3]);
    expect(out.indexOf("## 3. Uno")).toBeGreaterThan(out.indexOf("## 2. Dos"));
    expect(out.indexOf("## 3. Uno")).toBeLessThan(out.indexOf(TRAILER_MARK));
  });
});
const TRAILER_MARK = "## Cómo mantener este documento";

describe("addedLineNumbers / replaceOnLines", () => {
  it("sólo lee líneas `+` de los hunks, no las `-`", () => {
    const diff = ["@@ -3,1 +3,2 @@", "-vieja", "+nueva uno", "+nueva dos"].join("\n");
    expect(addedLineNumbers(diff)).toEqual(new Set([3, 4]));
  });

  it("reemplaza sólo en los números de línea dados", () => {
    const text = ["ve §5 aquí", "no toca §5 aquí", "ve §5 otra vez"].join("\n");
    const { text: out, changed } = replaceOnLines(text, new Set([1, 3]), 5, 9);
    expect(out.split("\n")[0]).toBe("ve §9 aquí");
    expect(out.split("\n")[1]).toBe("no toca §5 aquí");
    expect(out.split("\n")[2]).toBe("ve §9 otra vez");
    expect(changed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Integración: repo git real, siguiendo el patrón de vercel-should-build.test.ts
// ---------------------------------------------------------------------------

const repos: string[] = [];

afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop() as string, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com"
    }
  }).trim();
}

const LOG_REL = "docs/brand/design-decisions-log.md";

function baseLog(sections: string): string {
  return `# Histórico\n\n${sections}\n---\n\n${TRAILER_MARK}\n\nInstrucciones.\n`;
}

function initRepo(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), "log-fix-"));
  repos.push(cwd);
  git(cwd, "init", "--quiet", "--initial-branch", "main");
  return cwd;
}

function write(cwd: string, rel: string, content: string) {
  const target = path.join(cwd, rel);
  execFileSync("mkdir", ["-p", path.dirname(target)]);
  writeFileSync(target, content);
}

function commit(cwd: string, message: string) {
  git(cwd, "add", "-A");
  git(cwd, "commit", "--quiet", "-m", message);
}

describe("main() de punta a punta, sobre un repo git real", () => {
  it("caso común: mi §5 choca con el §5 ya publicado — se renumera el mío, se mueve, y su referencia se actualiza SÓLO en la línea que añadí", () => {
    const cwd = initRepo();
    write(cwd, LOG_REL, baseLog("## 5. De main\n\nYa publicada.\n\n"));
    write(cwd, "docs/otro.md", "Referencia previa a §5 (de main), sin tocar.\n");
    commit(cwd, "baseline en main");

    // Rama de verdad, separada de `main`: si los dos commits fueran a la misma
    // rama, `git show main:...` vería el segundo commit y ya no habría "lo que
    // main ya publicó" contra qué comparar — es el error que tuvo este test.
    git(cwd, "checkout", "-q", "-b", "feature");

    write(
      cwd,
      LOG_REL,
      baseLog("## 5. De main\n\nYa publicada.\n\n---\n\n## 5. Mía, nueva\n\nMi trabajo.\n\n")
    );
    write(
      cwd,
      "docs/otro.md",
      "Referencia previa a §5 (de main), sin tocar.\nY mi referencia nueva a §5 (log §5).\n"
    );
    commit(cwd, "mi rama añade una sección que colisiona");

    const code = fixMain({ mainRef: "main", cwd });
    expect(code).toBe(0);

    const log = readFileSync(path.join(cwd, LOG_REL), "utf8");
    expect(log).toContain("## 6. Mía, nueva");
    expect(log).not.toContain("## 5. Mía, nueva");
    expect(log.indexOf("## 6. Mía, nueva")).toBeGreaterThan(log.indexOf("## 5. De main"));

    const otro = readFileSync(path.join(cwd, "docs/otro.md"), "utf8");
    expect(otro).toContain("Referencia previa a §5 (de main), sin tocar.");
    expect(otro).toContain("Y mi referencia nueva a §6");
    expect(otro).not.toContain("§5).");
  });

  it("una colisión heredada no se toca ni produce error", () => {
    const cwd = initRepo();
    const n = [...DUPLICADOS_HEREDADOS][0];
    write(cwd, LOG_REL, baseLog(`## ${n}. Original\n\nCuerpo.\n\n`));
    commit(cwd, "baseline");

    write(cwd, LOG_REL, baseLog(`## ${n}. Original\n\nCuerpo.\n\n---\n\n## ${n}. Otra vez\n\nCuerpo.\n\n`));
    commit(cwd, "duplica una heredada");

    const before = readFileSync(path.join(cwd, LOG_REL), "utf8");
    const code = fixMain({ mainRef: "main", cwd });
    const after = readFileSync(path.join(cwd, LOG_REL), "utf8");

    expect(code).toBe(0);
    expect(after).toBe(before);
  });

  it("colisión ya dentro de main entre dos ramas ajenas: sale en rojo y no toca nada", () => {
    const cwd = initRepo();
    write(cwd, LOG_REL, baseLog("## 9. Una\n\nCuerpo.\n\n---\n\n## 9. Otra\n\nCuerpo.\n\n"));
    commit(cwd, "main ya trae la colisión");

    const before = readFileSync(path.join(cwd, LOG_REL), "utf8");
    const code = fixMain({ mainRef: "main", cwd });
    const after = readFileSync(path.join(cwd, LOG_REL), "utf8");

    expect(code).toBe(1);
    expect(after).toBe(before);
  });

  it("es idempotente: una segunda pasada no cambia nada", () => {
    const cwd = initRepo();
    write(cwd, LOG_REL, baseLog("## 5. De main\n\nYa publicada.\n\n"));
    commit(cwd, "baseline");
    git(cwd, "checkout", "-q", "-b", "feature");
    write(cwd, LOG_REL, baseLog("## 5. De main\n\nYa publicada.\n\n---\n\n## 5. Mía\n\nMi trabajo.\n\n"));
    commit(cwd, "colisión");

    fixMain({ mainRef: "main", cwd });
    const afterFirst = readFileSync(path.join(cwd, LOG_REL), "utf8");
    const code = fixMain({ mainRef: "main", cwd });
    const afterSecond = readFileSync(path.join(cwd, LOG_REL), "utf8");

    expect(code).toBe(0);
    expect(afterSecond).toBe(afterFirst);
  });
});
