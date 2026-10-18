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

## Recomendaciones con datos de Google (log §293, §294, §298)

- **Se calculan en vivo; sólo se guarda lo que el cliente hizo con ellas.**
  `buildGoogleRecommendations` es pura y trabaja sobre las filas que ya leyó
  `loadSearchConsoleScreen`. Una tarjeta existe porque Google lo dice hoy.
  «Marcar como hecho» y «Ahora no» escriben en `search_console_rec_states`
  (migración 0042, log §294): tipo, búsqueda, estado y las cifras del momento,
  nada más. Una tarjeta guardada se salta con `hidden` y deja su sitio al
  siguiente caso del mismo tipo.
- **Esa tabla se escribe sólo desde las server actions**, con service role,
  después de comprobar con el cliente del usuario que el proyecto es suyo, y
  filtrando por `project_id` y `owner_user_id`. El dueño sólo la lee (RLS).
  La búsqueda no va a los logs.
- **Sin la migración no hay botones.** `readRecStates` devuelve
  `available: false` y las tarjetas salen sin «Marcar como hecho» ni «Ahora
  no».
- **Las dos pantallas leen los datos propios con `readSearchConsoleInputs`.**
  La analítica de búsquedas se guarda en su propia entrada de caché
  (`screen-rows`), sin las URL auditadas en la clave, y la comparten las dos.
  Las inspecciones de indexación van en otra entrada que sólo pide «Posición
  en Google». Recomendaciones llama con `inspect = false`, porque son lo más
  lento de una carga sin caché (log §298).
- **El bloque de Recomendaciones reserva su sitio.** La página lee
  `readSearchConsoleAvailability` (nuestra base de datos, sin Google). Sólo si está
  conectado monta las ranuras, con su esqueleto mientras llega Google. Sin
  conexión no pinta nada (log §298, ranuras de §307).
- **El bloque va en un `Suspense`.** Google no puede retrasar las
  recomendaciones de IA.
- **Una tarjeta de cada tipo como mucho.** La lista completa ya está en
  «Posición en Google».
- **Las tarjetas se reparten en la cola de Recomendaciones (log §307).** La
  de la página 1 (o, si no hay, la de título) va al puesto 2 del plan
  (`GooglePlanSlot`); el resto, a la fila de «Más adelante»
  (`GoogleLaterSlot`). Las dos ranuras leen Google una sola vez por petición
  (`cache` de React en `google-recs.tsx`), cada una en su `Suspense`.

## Invitación a conectar (GSC-CONNECT-CTA-1, log §313)

- **Se invita a conectar donde saldrían los datos, y sólo ahí.** La mitad de
  Google de la tarjeta SEO de Visión general (`GscConnectPanel`) y la fila
  «Con tus datos de Google» de «Más adelante» (`GscConnectRow`), ambas de
  `app/dashboard/projects/[projectId]/_components/gsc-connect-invite.tsx`. Salen con
  `disconnected` o `reconnect`; con `off` (sin configurar o sin migración)
  no sale nada, porque un botón que no puede funcionar es peor que ninguno.
- **Sin cifras de ejemplo.** La invitación dice qué se gana, nunca enseña
  números que todavía no existen (lo vigila `gsc-connect-invite.test.tsx`).
- **El botón va directo a `/api/search-console/connect`**, que comprueba la
  propiedad del proyecto por su cuenta. Elegir propiedad sigue en «Posición
  en Google», donde vuelve la conexión.

## Tabla de búsquedas (GSC-QUERIES-SORT-1, log §329)

- **Ordenar sólo reordena.** El conjunto visible son las 50 búsquedas con más
  impresiones del filtro; la columna elegida (`sortQueries`) las reordena
  dentro de ese conjunto. Ordenar antes de recortar enseñaría otro conjunto y
  la nota de «las 50 con más impresiones» mentiría.
- **En móvil no se oculta ninguna columna de esta tabla.** Un puesto sin sus
  impresiones al lado engaña (un 1,0 de una impresión parece un primer puesto
  firme). La tabla se desliza en horizontal con la búsqueda fija.
