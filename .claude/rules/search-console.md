# Posición en Google (Search Console) — invariantes

Se inyectan solos al tocar `lib/search-console/**`,
`app/api/search-console/**` y `app/dashboard/projects/*/search-console/**`.
Cada regla es trazable a `docs/brand/design-decisions-log.md` §284 o a la
revisión de data-guardian que lo precedió.

- **El token de Google es un secreto y sólo existe cifrado.** AES-256-GCM con
  AAD ligado a proyecto y dueño, con una subclave HKDF propia de
  `GSC_TOKEN_ENCRYPTION_KEY`. Nunca se usa la clave maestra directamente, ni
  para cifrar ni para firmar el `state`. Nunca se registra en logs un código,
  un token, el `state`, la cookie ni el cuerpo de una respuesta de Google.
- **`search_console_connections` no tiene política RLS a propósito.** El
  navegador no la lee nunca. La toca código de servidor con service role,
  siempre con ids ya verificados (`requireActiveProject(projectId)` +
  `requireUser().user.id`) y filtrando por `project_id` **y**
  `owner_user_id`. Las funciones de `connection.ts` reciben esos ids; no les
  pases un `projectId` que venga de un formulario sin verificarlo antes.
  `tests/service-role-identity.test.ts` sólo mira `app/`, así que este
  contrato es lo único que protege `lib/`.
- **Una columna nueva de esta tabla se lee donde se usa, con tolerancia a que
  falte.** La migración se aplica a mano; hasta entonces `readConnection`
  devuelve `unavailable` y la pantalla lo dice, nunca un 404.
- **La vuelta de OAuth comprueba en este orden:** firma y caducidad del
  `state`, nonce igual a la cookie, usuario de la sesión igual al del
  `state`, y que sigue siendo dueño del proyecto. Sólo entonces canjea el
  código, con PKCE. La redirección se construye en el servidor desde el
  proyecto verificado; no se acepta `next`. La cookie se borra en todos los
  desenlaces.
- **Sólo se acepta una propiedad que esté verificada en la cuenta y cubra el
  dominio del proyecto** (`propertyMatchesDomain`), comprobado contra la
  lista en vivo de Google. Enseñar los datos de otra web sería una métrica
  falsa.
- **Nada de Search Console va a nuestra base de datos.** Las filas crudas de
  Google se reutilizan como mucho `GOOGLE_DATA_TTL_SECONDS` (30 min) en la
  caché de datos de Next (`withGoogleData`, `lib/search-console/load.ts`), a
  petición del fundador (log §289). La clave lleva proyecto, dueño y
  propiedad, siempre los tres; sin ellos una cuenta podría ver los datos de
  otra. El token vive sólo en el cierre de la función y nunca en la clave.
  La conexión se lee en cada carga **antes** de la caché: un proyecto
  desconectado o revocado no enseña nada, haya caché o no. Lo que depende de
  nuestros datos (páginas auditadas, prompts vigilados) se calcula siempre
  encima de las filas cacheadas, nunca dentro. Guardar resultados de forma
  duradera sigue necesitando migración y aprobación.
- **Cada número sale de Google, y lo que no se pudo leer no se pinta.** Sin
  conexión, la mitad de Google de Visión general invita a conectar; sin
  configuración, sin tabla o con Google fallando, no sale. Un botón que no
  puede funcionar es peor que no tener la mitad.
- **La indexación es de las páginas que ya revisa la auditoría** (como mucho
  `INSPECTION_LIMIT`), y la pantalla lo dice. Ampliarla a toda la web sería
  un rastreador, prohibido sin aprobación (`CLAUDE.md`).
- **Un permiso revocado borra el token.** `markConnectionFailed("revoked")`
  deja la fila sin secreto y pide reconectar. Los fallos pasajeros (tiempo,
  cupo, 5xx) no marcan nada.
- **Si se filtran a la vez la clave y la base de datos, rotar no basta:** se
  revocan en Google todos los tokens con `pnpm search-console:revoke-all`.

## Fase 3b: puesto, páginas y oportunidades (log §287)

- **Toda referencia es la propia web.** «Lo habitual» en un tramo es el CTR
  de las otras búsquedas de la web en ese tramo (`findCtrOpportunities`),
  nunca una curva de CTR del sector. Inventarse una sería una métrica falsa.
- **Los problemas SEO de una página los cuenta la auditoría, no esta zona.**
  `auditedPagesFromSnapshot` reutiliza `pageCheckStates` y
  `seoPageExtraStates` filtrados por `AUDIT_BLOCKS.seo.checks`. Una página
  sin analizar es «Sin auditar», nunca «Correcta».
- **«Vigilar prompt» (antes «Vigilar en IA», renombrado por el fundador el 2026-10-11, log §289) pasa por `addPrompts` (modo manual)**, con su tope de
  plan y su escaneo. No se escribe en `project_prompts` por otro camino.
- **Sólo se enlaza lo que `isWebUrl` acepta.**

## Ajustes del fundador (log §289)

- **La pantalla de carga es ambiente, no progreso.** `gsc-loading.tsx` no
  dice cuánto falta ni por qué paso va, porque nada lo sabe. Con
  `prefers-reduced-motion` se queda quieta en su último fotograma.
- **«Vigilar prompt» se marca al pulsarlo** y se deshace si `addPrompts`
  falla. Mientras se añade, la fila lo dice («Añadiéndola a tus prompts…»).

## Recomendaciones con datos de Google (log §293)

- **Se calculan en vivo y no se guardan.** `buildGoogleRecommendations` es
  pura y trabaja sobre las filas que ya leyó `loadSearchConsoleScreen`. Una
  tarjeta existe porque Google lo dice hoy. Darles estado («Marcar como
  hecho», «Ahora no») exige guardarlas, y eso es migración y aprobación.
- **Las dos pantallas leen los datos propios con `readSearchConsoleInputs`.**
  Si una pidiera otras URLs auditadas, la clave de caché cambiaría y cada
  pantalla volvería a llamar a Google.
- **El bloque va en un `Suspense`.** Google no puede retrasar las
  recomendaciones de IA.
- **Una tarjeta de cada tipo como mucho.** La lista completa ya está en
  «Posición en Google».
