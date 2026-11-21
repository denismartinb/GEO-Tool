/* GenScore test extension: the SAMPLE account.
   Everything in this file is invented, and every screen that reads it carries
   the «Ejemplo» badge. The connected version (test step 02) replaces it with
   read-only calls to the account; until then nothing here comes from a scan,
   from Search Console or from DataForSEO. */
const SAMPLE = {
  plan: "Pro",
  trial: true,
  cap: 5,
  extraDomains: ["otro-dominio-ejemplo.es"],
  score: 47,
  delta: 3,
  say: "Te nombran menos que a Rival Uno en ChatGPT y en Gemini.",
  engines: { chatgpt: 38, gemini: 52, claude: 21, perplexity: 30 },
  rivals: [["Rival Uno", 54], ["Tú", 41, true], ["Rival Dos", 35], ["Rival Tres", 22]],
  seo: 68,
  agent: 44,
  agentParts: [["Descubrimiento", 22, 30], ["Comprensión", 18, 30], ["Confianza", 8, 20], ["Compra", 10, 20]],
  plan: [
    { id: "p1", kind: "plan", lane: "ia", pts: 8, t: "Publica la comparativa con Rival Uno", why: "Es la marca que más aparece en las respuestas donde no te nombran." },
    { id: "p2", kind: "plan", lane: "ia", pts: 5, t: "Pide a una revista del sector que te incluya en su lista", why: "La citan dos motores en tus prompts y nombra a tus rivales, no a ti." },
    { id: "p3", kind: "goal", lane: "google", t: "Sube «tu búsqueda principal» a la página 1", goal: "del puesto 14 a la página 1", why: "Es la búsqueda que más impresiones te trae en Google." }
  ],
  prompts: [
    ["¿Qué empresa me recomiendas para esto en España?", ["chatgpt", "gemini"], "Te nombran en segundo lugar"],
    ["¿Cuál es la mejor alternativa a Rival Uno?", ["perplexity"], "Te nombran"],
    ["¿Qué opciones hay y cuánto cuestan?", ["gemini"], "No te nombran"]
  ]
};
