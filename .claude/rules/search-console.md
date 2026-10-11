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
- **Nada de Search Console se guarda y no hay caché entre peticiones.** Sólo
  `React.cache` por petición. Una caché compartida tendría que ir por
  proyecto **y** dueño para no servir los datos de una cuenta a otra, y
  guardar resultados necesita su propia migración y aprobación.
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
