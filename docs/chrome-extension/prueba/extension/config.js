/* GenScore test extension: where the account lives (paso 02). The panel
   reads /api/ext/* here with GenScore's own session cookie, so the manifest's
   host_permissions must name exactly this origin. The test build points it
   at the pull request's Vercel preview; the store build, at www.genscore.es. */
const GS_API = "https://www.genscore.es";
