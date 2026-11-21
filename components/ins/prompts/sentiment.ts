const LABELS: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutral",
  negative: "Negativo",
  mixed: "Mixto",
  // Extraction's "unknown" reads as "Neutral", never the raw English value.
  unknown: "Neutral",
};

export function sentimentText(s: string | null | undefined): string {
  return s ? (LABELS[s] ?? s) : "";
}

/** Tone class of the prototype: positive green, negative and mixed warm, the rest plain. */
export function sentimentClass(s: string | null | undefined): string {
  return s === "positive" ? "tpos" : s === "negative" || s === "mixed" ? "twarm" : "";
}
