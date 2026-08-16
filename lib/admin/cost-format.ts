/**
 * ADMIN-CONSOLE-2a. Formato de presentación del coste — deliberadamente
 * separado de `cost-model.ts` (que lleva `import "server-only"` porque
 * calcula el coste a partir de tarifas internas) para que `shared.tsx`
 * pueda usarlo desde `users-table.tsx` (`"use client"`, ADMIN-CONSOLE-UX-1)
 * sin arrastrar ese cómputo server-only al bundle de cliente. No hay nada
 * sensible aquí: son sólo las dos funciones de formato, sin las tarifas.
 */

export type CostProvenance = "medido" | "estimado" | "no_medido";

export function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return "<$0,01";
  return `$${value.toFixed(2).replace(".", ",")}`;
}

/** Etiqueta corta para acompañar SIEMPRE a la cifra — nunca se muestra un coste desnudo. */
export function provenanceLabel(provenance: CostProvenance): string {
  switch (provenance) {
    case "medido":
      return "medido";
    case "estimado":
      return "estimado";
    case "no_medido":
      return "sin medir";
  }
}
