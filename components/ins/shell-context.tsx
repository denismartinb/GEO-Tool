"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { resolveSelectedProject } from "@/lib/active-project-cookie";
import { projectIdFromPath } from "@/lib/ins/nav";

/** Datos que el marco necesita y que el layout resuelve en servidor. */
export type ShellProject = {
  id: string;
  name: string;
  domain: string;
};

export type ShellData = {
  projects: ShellProject[];
  /** Proyecto activo (ruta, `?active=` o cookie), resuelto en el cliente. */
  project: ShellProject | null;
  promptCountByProject: Record<string, number>;
  competitorCountByProject: Record<string, number>;
  recommendationCountByProject: Record<string, number>;
  latestScanStatusByProject: Record<string, string>;
  latestScoreByProject: Record<string, number | null>;
  latestScanDateByProject: Record<string, string | null>;
  userEmail: string;
  planId: string;
  planName: string;
  planProjectCap: number;
  /** `true` mientras la cuenta está en la prueba de Pro. */
  onTrial: boolean;
  /** `true` dentro de la app de Android: nada que venda (ANDROID-TWA-1, log §364). */
  inApp: boolean;
  signOutAction: () => Promise<void>;
};

const ShellDataCtx = createContext<ShellData | null>(null);

export type ShellDataInput = Omit<ShellData, "project"> & {
  /** Cookie `geo_active_project` leída en el layout (DOMAINS-LIVE-SELECT-1). */
  preferredProjectId: string | null;
};

/**
 * Resuelve el proyecto activo como lo hacía el menú anterior: la ruta manda;
 * en `/dashboard/domains` manda `?active=`, que cambia sin recargar el layout
 * (log §122); si no, la cookie y, al final, el más reciente.
 */
export function ShellDataProvider({ value, children }: { value: ShellDataInput; children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromPath = projectIdFromPath(pathname);
  const fromQuery = pathname === "/dashboard/domains" ? searchParams.get("active") : null;
  const project = resolveSelectedProject(value.projects, fromPath ?? fromQuery, value.preferredProjectId) ?? null;
  return <ShellDataCtx.Provider value={{ ...value, project }}>{children}</ShellDataCtx.Provider>;
}

export function useShellData(): ShellData {
  const ctx = useContext(ShellDataCtx);
  if (!ctx) throw new Error("useShellData debe usarse dentro del marco de la consola");
  return ctx;
}

/** Etiqueta del plan bajo el nombre (`xoPlanLabel` del prototipo). */
export function planLabel(d: Pick<ShellData, "planId" | "planName" | "onTrial">): string {
  if (d.planId === "free") return "Sin plan · solo lectura";
  if (d.onTrial) return `${d.planName} · prueba`;
  return d.planName;
}

/** Texto de dos letras del avatar. */
export function initialsOf(email: string): string {
  return email.slice(0, 2).toUpperCase();
}
