// Frescura de un dominio en el selector («Escaneado hoy», «Escaneado ayer»…).
export type DomainScanTone = "ok" | "run" | "err" | "fresh";

const DAY = 24 * 60 * 60 * 1000;

export function domainScanLabel(
  status: string | undefined,
  finishedAt: string | null | undefined,
  now: number
): { tone: DomainScanTone; text: string } {
  if (!status) return { tone: "fresh", text: "Primer escaneo pendiente" };
  if (status === "pending" || status === "running") return { tone: "run", text: "Escaneando" };
  if (status === "failed") return { tone: "err", text: "El último escaneo falló" };
  const at = finishedAt ? Date.parse(finishedAt) : NaN;
  if (!Number.isFinite(at)) return { tone: "ok", text: "Escaneado" };
  const days = Math.floor((startOfDay(now) - startOfDay(at)) / DAY);
  if (days <= 0) return { tone: "ok", text: "Escaneado hoy" };
  if (days === 1) return { tone: "ok", text: "Escaneado ayer" };
  return { tone: "ok", text: `Escaneado hace ${days} días` };
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
