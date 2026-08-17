#!/usr/bin/env node
/**
 * PRELAUNCH-HARDENING-1 — el autofix de `docs/brand/design-decisions-log.md`.
 *
 *   pnpm run fix:log-numbering
 *
 * `tests/log-numbering.test.ts` detecta cuándo dos secciones comparten
 * número — pasó siete veces en dos días (log §110) porque el identificador es
 * un ordinal en un fichero append-only: dos ramas calculan `max + 1` sobre
 * bases que envejecen, y git mezcla los dos apéndices sin un solo marcador de
 * conflicto. El coste real no era la detección, era arreglarlo: mergear,
 * renumerar la cabecera, mover la sección al final, y actualizar SUS
 * referencias sin tocar las de la otra sección — a mano, cada vez.
 *
 * **Lo que este script decide, y por qué es seguro decidirlo solo:** de las
 * dos secciones que comparten número, la que ya está publicada en
 * `origin/main` (mismo número, mismo título) se queda donde está; la que no
 * está en `main` se renumera al siguiente libre. Es el mismo criterio que el
 * mensaje de `log-numbering.test.ts` ya recomendaba a mano: "renumera la que
 * NO esté en main".
 *
 * **Alcance de las referencias que toca.** Sólo actualiza `§N` en líneas que
 * el `git diff` contra `origin/main` marca como AÑADIDAS por esta rama (o en
 * ficheros que no existen en `main`, donde se tocan todas). Nunca toca una
 * línea que ya estaba en `main` sin cambios — es lo que impide corromper una
 * referencia legítima a la sección que se queda.
 *
 * **Lo que NO arregla, dicho claro:**
 * - Las colisiones heredadas (`DUPLICADOS_HEREDADOS` en el test) — están
 *   congeladas a propósito porque renumerarlas rompe referencias ya
 *   publicadas; merecen su propia pasada deliberada.
 * - Una colisión que YA existe dentro de `origin/main` entre dos PRs ajenos,
 *   ninguno de los cuales es "mi" rama (pasó una vez: log §110, HEADER-FLAT-1
 *   vs SEO-POS-1 Fase A, ambos ya mergeados cuando colisionaron). Ahí ninguna
 *   de las dos secciones es "la que no está en main", así que el script no
 *   puede decidir solo — imprime el hallazgo y sale sin tocar nada.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const LOG_PATH_REL = "docs/brand/design-decisions-log.md";
const TRAILER = "## Cómo mantener este documento";
const SECTION_RE = /^## (\d+)\. (.+)$/gm;

// Debe reflejar exactamente `DUPLICADOS_HEREDADOS` en tests/log-numbering.test.ts.
// Congeladas a propósito: renumerarlas rompería referencias ya publicadas.
export const DUPLICADOS_HEREDADOS = new Set([33, 36, 39, 54, 55, 65, 70]);

export type Section = { number: number; title: string; headerStart: number; headerLine: string };
export type SectionBlock = Section & { block: string };
export type MainSection = { number: number; title: string };
export type RenumberPlan = { number: number; newNumber: number; title: string };
export type UnresolvedCollision = { number: number; titles: string[] };

/** Encabezados `## N. Título` de un texto, con su posición en el string. */
export function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(SECTION_RE);
  while ((m = re.exec(text))) {
    sections.push({ number: Number(m[1]), title: m[2], headerStart: m.index, headerLine: m[0] });
  }
  return sections;
}

/**
 * Añade a cada sección su rango `[blockStart, blockEnd)`: desde justo después
 * del separador `---` que la precede hasta justo antes del que la sigue (o el
 * trailer, o el final del fichero). Recorta blancos/`---` en los bordes.
 */
export function sectionBlocks(text: string): SectionBlock[] {
  const sections = parseSections(text);
  const trailerIdx = text.indexOf(`\n${TRAILER}`);
  const boundaries = sections.map((s) => s.headerStart).concat([trailerIdx === -1 ? text.length : trailerIdx + 1]);

  return sections.map((s, i) => {
    const end = boundaries[i + 1];
    // Recorta blancos y '---' sueltos del final: son el separador que precede
    // a la siguiente sección, no parte del cuerpo de ésta.
    const block = text.slice(s.headerStart, end).replace(/\n(?:\s*\n)*(?:---\s*\n\s*)*$/g, "\n");
    return { ...s, block: block.replace(/\s+$/, "") };
  });
}

/**
 * Decide qué renumerar. Devuelve `{ toRename: [{number, newNumber, title}], unresolved: [{number, titles}] }`.
 * `mainSections` sólo necesita `{number, title}`.
 */
export function planRenumbers(
  localSections: Section[],
  mainSections: MainSection[]
): { toRename: RenumberPlan[]; unresolved: UnresolvedCollision[]; heredadaSkipped: number[] } {
  const byNumber = new Map<number, Section[]>();
  for (const s of localSections) {
    if (!byNumber.has(s.number)) byNumber.set(s.number, []);
    byNumber.get(s.number)!.push(s);
  }

  const mainByNumber = new Map<number, string[]>();
  for (const s of mainSections) {
    if (!mainByNumber.has(s.number)) mainByNumber.set(s.number, []);
    mainByNumber.get(s.number)!.push(s.title);
  }

  const maxNumber = Math.max(0, ...localSections.map((s) => s.number));
  let nextFree = maxNumber + 1;

  const toRename: RenumberPlan[] = [];
  const unresolved: UnresolvedCollision[] = [];
  const heredadaSkipped: number[] = [];

  for (const [number, group] of byNumber) {
    if (group.length < 2) continue;
    if (DUPLICADOS_HEREDADOS.has(number)) {
      heredadaSkipped.push(number);
      continue;
    }

    const onMain = mainByNumber.get(number) ?? [];
    const isPublished = (s: Section) => onMain.includes(s.title);
    const published = group.filter(isPublished);
    const notPublished = group.filter((s) => !isPublished(s));

    if (published.length === 1 && notPublished.length === group.length - 1) {
      for (const s of notPublished) {
        toRename.push({ number: s.number, newNumber: nextFree, title: s.title });
        nextFree += 1;
      }
    } else if (published.length === 0) {
      // Ninguna está en main: duplicado nacido dentro de esta misma rama
      // (copia/pega). Se conserva la primera aparición, se renumeran las demás.
      for (const s of group.slice(1)) {
        toRename.push({ number: s.number, newNumber: nextFree, title: s.title });
        nextFree += 1;
      }
    } else {
      // Ambigua: dos o más ya están "publicadas" con ese número, o el reparto
      // no deja una única `notPublished`. Típicamente, la colisión ya vive
      // entera dentro de origin/main entre dos PRs ajenos — ninguno es "mi"
      // rama, así que no hay una decisión segura que tomar en automático.
      unresolved.push({ number, titles: group.map((s) => s.title) });
    }
  }

  return { toRename, unresolved, heredadaSkipped };
}

/**
 * Aplica un renumerado: cambia la cabecera y mueve el bloque al final del
 * histórico. Busca por número Y título — con un número duplicado, el número
 * solo no basta para saber CUÁL de las dos secciones toca mover.
 */
export function applyRenumber(text: string, { number, newNumber, title }: { number: number; newNumber: number; title?: string }): string {
  const blocks = sectionBlocks(text);
  const candidates = blocks.filter((b) => b.number === number);
  const target = title === undefined ? candidates[0] : candidates.find((b) => b.title === title);
  if (!target) throw new Error(`No se encontró la sección §${number}${title ? ` "${title}"` : ""} para renumerar.`);

  const before = text.slice(0, target.headerStart);
  const after = text.slice(target.headerStart + target.block.length);

  const renumberedBlock = target.block.replace(`## ${number}. `, `## ${newNumber}. `);
  const withoutSection = (before + after).replace(/\n{3,}/g, "\n\n\n");

  const trailerIdx = withoutSection.indexOf(`\n${TRAILER}`);
  const insertAt = trailerIdx === -1 ? withoutSection.length : trailerIdx + 1;

  let head = withoutSection.slice(0, insertAt).replace(/\n*$/, "\n");
  const tail = withoutSection.slice(insertAt);

  return `${head}\n---\n\n${renumberedBlock}\n\n---\n\n${tail}`;
}

/** Parsea `@@ -a,b +c,d @@` de un `git diff -U0` y devuelve el set de números de línea AÑADIDOS en la versión nueva. */
export function addedLineNumbers(diffOutput: string): Set<number> {
  const added = new Set<number>();
  const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let m;
  while ((m = hunkRe.exec(diffOutput))) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < count; i += 1) added.add(start + i);
  }
  return added;
}

/** Reemplaza `§old` por `§new` sólo en los números de línea (1-indexados) dados. */
export function replaceOnLines(
  text: string,
  lineNumbers: Set<number>,
  oldNumber: number,
  newNumber: number
): { text: string; changed: number } {
  if (lineNumbers.size === 0) return { text, changed: 0 };
  const lines = text.split("\n");
  let changed = 0;
  const token = new RegExp(`§${oldNumber}\\b`, "g");
  for (const ln of lineNumbers) {
    const idx = ln - 1;
    if (idx < 0 || idx >= lines.length) continue;
    if (token.test(lines[idx])) {
      lines[idx] = lines[idx].replace(token, `§${newNumber}`);
      changed += 1;
    }
    token.lastIndex = 0;
  }
  return { text: lines.join("\n"), changed };
}

function sh(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function repoRoot(cwd: string): string {
  return sh(cwd, ["rev-parse", "--show-toplevel"]).trim();
}

function fileAtRef(cwd: string, ref: string, relPath: string): string | null {
  try {
    return sh(cwd, ["show", `${ref}:${relPath}`]);
  } catch {
    return null; // no existe en esa ref
  }
}

function trackedTextFiles(cwd: string): string[] {
  const out = sh(cwd, ["ls-files", "-co", "--exclude-standard"]);
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(md|ts|tsx|yml|yaml)$/.test(f))
    .filter((f) => !f.startsWith("node_modules/") && !f.includes("/node_modules/"));
}

function filesReferencing(cwd: string, number: number): string[] {
  const files = trackedTextFiles(cwd);
  if (files.length === 0) return [];
  try {
    const out = sh(cwd, ["grep", "--untracked", "-l", "-E", `§${number}\\b`, "--"].concat(files));
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function main({ mainRef = "origin/main", cwd = process.cwd() }: { mainRef?: string; cwd?: string } = {}): number {
  const root = repoRoot(cwd);
  const logPath = path.join(root, LOG_PATH_REL);
  const localText = readFileSync(logPath, "utf8");
  const mainText = fileAtRef(root, mainRef, LOG_PATH_REL);

  if (mainText === null) {
    console.error(`No se pudo leer ${LOG_PATH_REL} en ${mainRef}. ¿Has hecho \`git fetch origin main\`?`);
    return 1;
  }

  const localSections = parseSections(localText);
  const mainSections = parseSections(mainText);
  const { toRename, unresolved, heredadaSkipped } = planRenumbers(localSections, mainSections);

  if (heredadaSkipped.length > 0) {
    console.log(`Colisiones heredadas, sin tocar (congeladas a propósito): ${heredadaSkipped.map((n) => `§${n}`).join(", ")}`);
  }

  if (toRename.length === 0 && unresolved.length === 0) {
    console.log("Sin colisiones nuevas que arreglar.");
    return 0;
  }

  let text = localText;
  for (const r of toRename) {
    text = applyRenumber(text, r);
    console.log(`§${r.number} → §${r.newNumber}: ${r.title}`);
  }
  if (text !== localText) writeFileSync(logPath, text, "utf8");

  for (const r of toRename) {
    for (const relFile of filesReferencing(root, r.number)) {
      if (relFile === LOG_PATH_REL) continue; // ya resuelto arriba
      const filePath = path.join(root, relFile);
      const current = readFileSync(filePath, "utf8");
      const onMain = fileAtRef(root, mainRef, relFile);

      let lineNumbers;
      if (onMain === null) {
        // Fichero nuevo en esta rama: todas sus líneas son "añadidas".
        lineNumbers = new Set(current.split("\n").map((_, i) => i + 1));
      } else {
        let diff;
        try {
          diff = sh(root, ["diff", "-U0", "--no-color", mainRef, "--", relFile]);
        } catch {
          diff = "";
        }
        lineNumbers = addedLineNumbers(diff);
      }

      const { text: updated, changed } = replaceOnLines(current, lineNumbers, r.number, r.newNumber);
      if (changed > 0) {
        writeFileSync(filePath, updated, "utf8");
        console.log(`  ${relFile}: ${changed} referencia(s) actualizada(s)`);
      }
    }
  }

  if (unresolved.length > 0) {
    console.error("\nColisiones que necesitan una decisión humana (ninguna de las dos ramas es claramente 'la nueva'):");
    for (const u of unresolved) {
      console.error(`  §${u.number}: ${u.titles.join("  +  ")}`);
    }
    console.error(
      "Suele pasar cuando dos PRs ajenos, ya mergeados, colisionaron entre sí antes de que esta rama tocara nada. " +
        "Decide a mano cuál mergeó después (git log --format='%h %cI %s' origin/main) y renumérala."
    );
    return 1;
  }

  return 0;
}
