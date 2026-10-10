# Informe de GenScore — invariantes

Se inyectan solos al tocar `lib/report/**`. Cada regla es trazable al
histórico (`docs/brand/design-decisions-log.md` §248) o al diseño aprobado
(`docs/design-reference/geo-report-1/`).

- **Sólo porcentajes y proporciones.** Ninguna cifra absoluta de preguntas,
  respuestas, escaneos o webs sale del modelo: todo es una fracción que se
  formatea con `formatShare`. Es norma del fundador para todo lo que lee un
  cliente o un prospecto («nada de cifras absolutas, y menos si son tan bajas,
  quita credibilidad», §246–§248). El test recorre el modelo serializado.
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

## Fase 2: página, cargador e impresión (log §250)

- **El cargador (`report-data.ts`) toma cada cifra de su dueño, nunca la
  rehace.**
  - La Puntuación GEO sale de `resolveGeoScore` con
    `GEO_SCORE_LOOKBACK_ROWS`.
  - La parte técnica sale de `buildTechnicalIssuesReport`.
  - El plan sale de `selectPlan` sobre `computeRecommendationPotentialPoints`.
    Las tres acciones del informe tienen que ser las de la pantalla de
    Recomendaciones.
  - Una respuesta sin `extracted_json`, o con `extraction_error`, no entra:
    contarla como «no te nombra» inventaría un fallo.
- **Ninguna pregunta se recorta.** La matriz se reparte en páginas con
  `paginateMatrix` (`report-pages.ts`). Si cambian el tamaño de letra o el
  alto de fila, se recalibra la estimación y se vuelve a generar el PDF.
- **La impresión hereda §217–§219 tal cual.**
  - Las páginas se montan con `createPortal` como hijas directas de `body`.
  - `html, body` y `.gr-page` llevan `height: 100%` y no una altura en px,
    porque Safari iOS impone márgenes de página.
  - `box-sizing: border-box` en todo.
  - Sólo la última página lleva `.gr-last`, para que no salga una hoja en
    blanco.
  - Cualquier cambio en `geo-report.*` se prueba generando el PDF de verdad,
    contando sus páginas y abriéndolas, también con el escenario
    `safari-like`.
- **Las imágenes del informe son `<img>`, no `next/image`.** La carga
  diferida deja huecos en el diálogo de impresión.
- **El informe vive fuera de `app/dashboard/`.** Meterlo en el layout de la
  consola reabre el fallo de §217: los ancestros con
  `overflow`/`transform` deforman las páginas.
