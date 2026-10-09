# Informe de GenScore — invariantes

Se inyectan solos al tocar `lib/report/**`. Cada regla es trazable al
histórico (`docs/brand/design-decisions-log.md` §247) o al diseño aprobado
(`docs/design-reference/geo-report-1/`).

- **Sólo porcentajes y proporciones.** Ninguna cifra absoluta de preguntas,
  respuestas, escaneos o webs sale del modelo: todo es una fracción que se
  formatea con `formatShare`. Es norma del fundador para todo lo que lee un
  cliente o un prospecto («nada de cifras absolutas, y menos si son tan bajas,
  quita credibilidad», §246–§247). El test recorre el modelo serializado.
- **El conjunto de preguntas se llama «preguntas principales de búsqueda»**
  (`QUESTION_SET_LABEL`), nunca «las preguntas» a secas, para que no se lea
  como el total.
- **Motores por su nombre, nunca por versión**, y sin decir cómo se mide por
  dentro.
- **El texto narrativo es plantilla sobre datos; lo único literal son las
  citas.** Una cita es una frase tal cual de una respuesta guardada
  (`findQuote`), y si no existe se omite: nunca se parafrasea ni se inventa
  (`CLAUDE.md`, «fake recommendations / fake metrics»).
- **Un bloque sin datos se omite.** Sin auditoría de cobertura, la columna
  «¿Página tuya?» queda vacía (`page: null`), no «No»; sin citas, no hay
  página de fuentes.
- **Las cifras no se recalculan por su cuenta frente a las pantallas.** La
  mención es `extracted_json.brand.mentioned`, igual que `prompt-gap.ts`; las
  marcas pasan por `isGenericEntityName` como en Competidores (§200); el
  dominio propio se compara con `isSameOrSubdomain`.
- **El modelo es puro.** Sin Supabase, sin reloj, sin DOM: el cargador decide
  qué escaneo y qué filas, el modelo decide qué se dice de ellas.
