/* runs-data.jsx — dominios monitorizados + historial de escaneos */

const DOMAINS = [
  { id: "d1", name: "Vela Analytics", domain: "vela.io", country: "Estados Unidos", cc: "us", lang: "Inglés",
    score: 41, scoreDelta: +6, lastScan: "28 may 2026", status: "active", prompts: 64, competitors: 5, runs: 7, you: true, color: "#6366f1" },
  { id: "d2", name: "Northwind CRM", domain: "northwind.com", country: "Reino Unido", cc: "uk", lang: "Inglés",
    score: 58, scoreDelta: +3, lastScan: "27 may 2026", status: "active", prompts: 48, competitors: 4, runs: 5, color: "#0d9488" },
  { id: "d3", name: "Beltway Health", domain: "beltway.health", country: "Estados Unidos", cc: "us", lang: "Inglés",
    score: 33, scoreDelta: -2, lastScan: "26 may 2026", status: "error", prompts: 52, competitors: 6, runs: 9, color: "#d9772b" },
  { id: "d4", name: "Aurora Labs", domain: "auroralabs.ai", country: "Alemania", cc: "de", lang: "Inglés",
    score: 22, scoreDelta: +5, lastScan: "Escaneando…", status: "scanning", prompts: 40, competitors: 3, runs: 2, color: "#9333a8" },
  { id: "d5", name: "Quantix Retail", domain: "quantix.es", country: "España", cc: "es", lang: "Español",
    score: 47, scoreDelta: 0, lastScan: "20 may 2026", status: "paused", prompts: 36, competitors: 4, runs: 4, color: "#3b6fd6" },
];

// historial de escaneos por dominio
const RUNS = {
  d1: [
    { id: 7, date: "28 may 2026", time: "14:22", trigger: "Manual", prompts: 64, ok: 64, failed: 0, duration: "3m 41s", scoreDelta: +6, status: "done" },
    { id: 6, date: "21 may 2026", time: "09:05", trigger: "Programado", prompts: 64, ok: 64, failed: 0, duration: "3m 28s", scoreDelta: +2, status: "done" },
    { id: 5, date: "14 may 2026", time: "09:05", trigger: "Programado", prompts: 64, ok: 58, failed: 6, duration: "4m 02s", scoreDelta: -1, status: "errors",
      fails: [{ engine: "ppx", reason: "Límite de tasa", count: 5 }, { engine: "cld", reason: "Timeout", count: 1 }] },
    { id: 4, date: "07 may 2026", time: "09:05", trigger: "Programado", prompts: 60, ok: 60, failed: 0, duration: "3m 19s", scoreDelta: +3, status: "done" },
    { id: 3, date: "30 abr 2026", time: "11:48", trigger: "Manual", prompts: 60, ok: 60, failed: 0, duration: "3m 22s", scoreDelta: +1, status: "done" },
    { id: 2, date: "23 abr 2026", time: "09:05", trigger: "Programado", prompts: 52, ok: 52, failed: 0, duration: "2m 58s", scoreDelta: +4, status: "done" },
    { id: 1, date: "16 abr 2026", time: "16:30", trigger: "Manual", prompts: 52, ok: 52, failed: 0, duration: "3m 05s", scoreDelta: null, status: "done" },
  ],
  d2: [
    { id: 5, date: "27 may 2026", time: "08:00", trigger: "Programado", prompts: 48, ok: 48, failed: 0, duration: "2m 51s", scoreDelta: +3, status: "done" },
    { id: 4, date: "20 may 2026", time: "08:00", trigger: "Programado", prompts: 48, ok: 47, failed: 1, duration: "3m 10s", scoreDelta: +1, status: "errors",
      fails: [{ engine: "aio", reason: "Sin respuesta", count: 1 }] },
    { id: 3, date: "13 may 2026", time: "08:00", trigger: "Programado", prompts: 44, ok: 44, failed: 0, duration: "2m 40s", scoreDelta: +2, status: "done" },
    { id: 2, date: "06 may 2026", time: "10:12", trigger: "Manual", prompts: 44, ok: 44, failed: 0, duration: "2m 44s", scoreDelta: +5, status: "done" },
    { id: 1, date: "29 abr 2026", time: "09:00", trigger: "Manual", prompts: 40, ok: 40, failed: 0, duration: "2m 30s", scoreDelta: null, status: "done" },
  ],
  d3: [
    { id: 9, date: "26 may 2026", time: "07:30", trigger: "Programado", prompts: 52, ok: 19, failed: 33, duration: "1m 12s", scoreDelta: null, status: "failed",
      fails: [{ engine: "gpt", reason: "Clave de API rechazada", count: 18 }, { engine: "ppx", reason: "Límite de tasa", count: 15 }] },
    { id: 8, date: "19 may 2026", time: "07:30", trigger: "Programado", prompts: 52, ok: 52, failed: 0, duration: "3m 33s", scoreDelta: -2, status: "done" },
    { id: 7, date: "12 may 2026", time: "07:30", trigger: "Programado", prompts: 52, ok: 50, failed: 2, duration: "3m 48s", scoreDelta: +1, status: "errors",
      fails: [{ engine: "cld", reason: "Timeout", count: 2 }] },
    { id: 6, date: "05 may 2026", time: "14:00", trigger: "Manual", prompts: 48, ok: 48, failed: 0, duration: "3m 20s", scoreDelta: +3, status: "done" },
  ],
  d4: [
    { id: 2, date: "Hoy", time: "—", trigger: "Manual", prompts: 40, ok: 28, failed: 0, duration: "en curso", scoreDelta: null, status: "running" },
    { id: 1, date: "30 abr 2026", time: "12:00", trigger: "Manual", prompts: 40, ok: 40, failed: 0, duration: "2m 36s", scoreDelta: null, status: "done" },
  ],
  d5: [
    { id: 4, date: "20 may 2026", time: "09:00", trigger: "Programado", prompts: 36, ok: 36, failed: 0, duration: "2m 18s", scoreDelta: 0, status: "done" },
    { id: 3, date: "13 may 2026", time: "09:00", trigger: "Programado", prompts: 36, ok: 36, failed: 0, duration: "2m 22s", scoreDelta: +2, status: "done" },
    { id: 2, date: "06 may 2026", time: "09:00", trigger: "Programado", prompts: 32, ok: 32, failed: 0, duration: "2m 05s", scoreDelta: +1, status: "done" },
    { id: 1, date: "29 abr 2026", time: "15:40", trigger: "Manual", prompts: 32, ok: 32, failed: 0, duration: "2m 11s", scoreDelta: null, status: "done" },
  ],
};

window.RUNS_DATA = { DOMAINS, RUNS };
