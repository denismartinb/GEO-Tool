# Páginas citadas — invariantes

Invariantes de la pantalla de Páginas citadas (`app/dashboard/projects/*/
citations/**`, `lib/citations/**`). Se inyectan solos al tocar esos ficheros.
Cada regla es trazable a un documento — una regla que nadie puede justificar
es peor que ninguna, porque una sesión futura la obedecerá igual.

- **`competitors`/`otherBrands` en `CitationRow` son un hecho sobre la
  RESPUESTA, nunca sobre la PÁGINA.** `aggregate-citations.ts` los llena con
  los nombres que el modelo mencionó en la misma respuesta donde citó esa
  página — la pantalla no lee el contenido de ninguna URL citada, y no existe
  ningún mecanismo que lo haga (CITATIONS-HONESTY-1, P0-09, log §182). Un
  texto de UI que diga "cita a X" sobre estos campos es la sobreafirmación
  exacta que la auditoría externa encontró. La forma correcta es "citada en
  una respuesta donde también apareció X", con un aviso explícito de que no
  se ha verificado en la página.
- **Que una fuente entre en «Fuentes alcanzables» (outreach) es un criterio
  de alcanzabilidad, nunca del competidor co-citado.** Cualifica el hecho
  comprobable — la IA cita este dominio y la marca no aparece en esas
  respuestas — nunca `competitors.length > 0`. El nombre del competidor
  co-citado se puede seguir mostrando, pero como aviso aparte
  (`coCitedCompetitors`, con calificador "sin verificar"), jamás como el
  motivo por el que la fuente aparece en la lista ni como requisito de
  inclusión.
- **La lista de fuentes alcanzables se agrupa por dominio antes de mostrarla**
  (`groupOpportunitiesByDomain`, `lib/citations/aggregate-citations.ts`):
  frecuencia total, motores y consultas asociadas por dominio, no una fila
  por URL. Necesario porque la lista sin el filtro de competidor puede crecer
  mucho — el informe de auditoría hablaba de 240 URLs en una cuenta real — y
  una lista plana de esa escala no es priorizable. La relevancia editorial
  completa (`relevance_score` frente a sector y mercado) es una fase de
  diferenciación aparte, no ésta.
- **No existe verificación real de contenido de página, y no se simula.**
  Verificar si una URL citada menciona de verdad a un competidor exige leer
  su HTML — eso es un crawler, y está en la lista de prohibido de `CLAUDE.md`
  sin aprobación explícita del fundador. No se introduce un campo `verified`
  que sólo puede valer `false`/`undefined` para aparentar que existe un
  tercer estado: misma lección que ya deja `.claude/rules/web-audit.md` sobre
  el tri-estado de `PageCheckResult` — un campo que nace y nunca puede
  afirmar nada no es una función, es un compromiso sin cumplir. Verificación
  real de contenido de página es una fase futura y propia, con su propio
  Task Intake y su propia revisión de data-guardian antes de tocar
  `lib/citations/**` con ese objetivo.
- **`ImpactBar` (`citations-client.tsx`) ya habla en el tiempo verbal
  correcto — no lo cambies al revés.** Sus etiquetas dicen "La respuesta
  mencionó..." (favorable/adverse/otherBrands), nunca "la página menciona...".
  Es el mismo principio que esta regla protege en el resto de la pantalla;
  no hace falta tocarlo, hace falta no romperlo.
