// Packaging de Lumira: 4 tramos, precio único en euros, facturación mensual.
// Ejes de valor: bucle de acción + credibilidad — no el volumen de datos.

export type PlanCell = boolean | string;

export type PlanMeter = {
  projects: string;
  prompts: number;
  engines: number | string;
  refresh: string;
};

export type Plan = {
  id: "free" | "starter" | "pro" | "agency";
  name: string;
  price: number;
  period: string;
  tagline: string;
  who: string;
  cta: string;
  ctaStyle: "primary" | "ghost";
  recommended?: boolean;
  highlights: string[];
  meter: PlanMeter;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free / Scan",
    price: 0,
    period: "siempre",
    tagline: "Tu primer escaneo, gratis",
    who: "Gancho de adquisición · pruébalo sin tarjeta",
    cta: "Escanear gratis",
    ctaStyle: "ghost",
    highlights: [
      "1 escaneo instantáneo, 1 dominio",
      "~10 prompts · 1 motor de IA",
      "GEO Score creíble + 3 acciones",
      "Sin tendencia ni monitorización"
    ],
    meter: { projects: "1", prompts: 10, engines: 1, refresh: "Puntual" }
  },
  {
    id: "starter",
    name: "Starter",
    price: 45,
    period: "mes",
    tagline: "Empieza a monitorizar",
    who: "Consultor o marca pequeña",
    cta: "Empezar con Starter",
    ctaStyle: "ghost",
    highlights: [
      "1 proyecto · ~25 prompts",
      "2 motores de IA",
      "Refresco semanal + tendencia",
      "Bucle de acción básico",
      "Credibilidad de medición visible"
    ],
    meter: { projects: "1", prompts: 25, engines: 2, refresh: "Semanal" }
  },
  {
    id: "pro",
    name: "Pro",
    price: 179,
    period: "mes",
    tagline: "El bucle de acción completo",
    who: "Equipo in-house o consultor avanzado",
    recommended: true,
    cta: "Probar Pro · 14 días",
    ctaStyle: "primary",
    highlights: [
      "3–5 proyectos · ~100 prompts",
      "4 motores de IA · refresco diario",
      "Bucle de acción completo",
      "Generador de soluciones (FAQ, schema, briefs)",
      "Sentimiento, temas y citas profundas"
    ],
    meter: { projects: "3–5", prompts: 100, engines: 4, refresh: "Diario" }
  },
  {
    id: "agency",
    name: "Agencia",
    price: 449,
    period: "mes",
    tagline: "Escala multi-cliente",
    who: "Agencias que reportan a sus clientes",
    cta: "Hablar con ventas",
    ctaStyle: "ghost",
    highlights: [
      "Workspaces multi-cliente · roles",
      "~300 prompts · todos los motores",
      "Informes white-label exportables",
      "Alertas por email y Slack",
      "Acceso API e integraciones"
    ],
    meter: { projects: "∞", prompts: 300, engines: "Todos", refresh: "Diario" }
  }
];

// Matriz de comparación, agrupada por bloque de valor.
// Celdas: true = incluido · false = no · string = detalle/límite.
// Orden de columnas: free, starter, pro, agency.
export const PLAN_MATRIX: Array<{ group: string; rows: Array<{ label: string; vals: PlanCell[] }> }> = [
  {
    group: "Medición",
    rows: [
      { label: "Proyectos / dominios", vals: ["1", "1", "3–5", "Ilimitados"] },
      { label: "Prompts monitorizados", vals: ["~10", "~25", "~100", "~300"] },
      { label: "Motores de IA", vals: ["1", "2", "4", "Todos"] },
      { label: "Frecuencia de refresco", vals: ["Puntual", "Semanal", "Diario", "Diario"] },
      { label: "Tendencia temporal", vals: [false, true, true, true] },
      { label: "Usuarios del equipo", vals: ["1", "Ilimitados", "Ilimitados", "Ilimitados"] }
    ]
  },
  {
    group: "Análisis",
    rows: [
      { label: "Panorámica competitiva y cuota de voz", vals: [true, true, true, true] },
      { label: "Distribución por motor de IA", vals: ["1 motor", true, true, true] },
      { label: "Sentimiento y análisis de temas", vals: [false, false, true, true] },
      { label: "Citas y fuentes profundas", vals: [false, "Básico", true, true] },
      { label: "Detección de oportunidades de prompt", vals: [false, true, true, true] }
    ]
  },
  {
    group: "Acción",
    rows: [
      { label: "Bucle de acción priorizado", vals: ["3 acciones", true, true, true] },
      { label: "Recomendaciones basadas en evidencia", vals: [false, true, true, true] },
      { label: "Generador de soluciones", vals: [false, false, true, true] },
      { label: "Credibilidad de medición visible", vals: [true, true, true, true] }
    ]
  },
  {
    group: "Agencia y plataforma",
    rows: [
      { label: "Workspaces multi-cliente", vals: [false, false, false, true] },
      { label: "Informes white-label", vals: [false, false, false, true] },
      { label: "Alertas (email / Slack)", vals: [false, false, "Email", true] },
      { label: "Roles y permisos", vals: [false, false, false, true] },
      { label: "Acceso API e integraciones CMS", vals: [false, false, false, true] }
    ]
  }
];

export const PLAN_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "¿Qué es el escaneo gratuito?",
    a: "Un análisis instantáneo de tu dominio: tu GEO Score, tu brecha frente a competidores y 3 acciones específicas. No pedimos tarjeta. Es la mejor forma de ver el diferenciador de Lumira antes de pagar nada."
  },
  {
    q: "¿Por qué cobráis por prompts y motores, y no por usuarios?",
    a: "Porque el valor está en cuánto monitorizas, no en cuánta gente lo mira. Los usuarios son ilimitados desde Starter. Pagas por prompts × motores × frecuencia de refresco — la unidad real de coste y de valor."
  },
  {
    q: "¿Puedo cambiar de plan en cualquier momento?",
    a: "Sí. Subes o bajas de plan cuando quieras; el prorrateo es automático. La cobertura de motores y la frecuencia de refresco son las palancas naturales para crecer de Starter a Pro y a Agencia."
  },
  {
    q: "¿Qué incluye la prueba de Pro?",
    a: "14 días con el bucle de acción completo, el generador de soluciones y los 4 motores. Onboarding en menos de una hora. Sin compromiso: si no conviertes, vuelves a Free."
  },
  {
    q: "¿Cómo se mide la fiabilidad de los datos?",
    a: "Cada métrica muestra su tamaño de muestra y metodología. No inflamos puntuaciones ni mostramos progreso falso: si la confianza de un dato es baja, lo verás. Es nuestro principio de credibilidad de medición."
  },
  {
    q: "¿El plan Agencia tiene white-label completo?",
    a: "Incluye informes white-label exportables (PDF / Sheets / Looker), workspaces por cliente, roles y alertas. Es el plan pensado para agencias que reportan resultados a sus clientes."
  }
];
