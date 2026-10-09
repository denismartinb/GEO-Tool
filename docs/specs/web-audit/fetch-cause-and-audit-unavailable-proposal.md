# Causa de la lectura rechazada y «Auditoría web no disponible» — SOLO PROPUESTA

**Estado:** propuesta separada, **sin implementar**. No toca `lib/web-audit/**`, `fetch-page.ts` ni la auditoría hasta que el Director dé alcance y `data-guardian` revise (`.claude/rules/web-audit.md`: zona adyacente a «crawler»). Respuesta a Director 6070300363 (punto 4) y al complemento 6070280041. Diagnóstico de partida: `docs/specs/onboarding/wizard-ux-and-eci-diagnosis-proposal.md` §4 y §4b.
**No hay bypass, importador manual, URL arbitraria, rotación de IP/UA, ni proveedor de rastreo en este documento** (el proveedor queda en backlog después del primer cliente, sin compra).

## 0. Hecho frente a diagnóstico (Director 6070505045)

| Afirmación | Estatus |
|---|---|
| `fetchPageSafely` devuelve `skipped_offsite` para HTTP no OK y para fallos de red que no son timeout; `skipped_error` existe y nunca se devuelve | **Hecho** (lectura de código) |
| `readiness_score` es `null` (no 0) si ninguna página se analiza y la puntuación GEO excluye `technical` | **Hecho** (lectura de código) |
| La web de `elcorteingles.es` respondió 301 → 403 a una lectura pública desde otra red | **Observación ajena** (aportada por el Director, otra red, 00:21:25) |
| El fallo que vio Denis en Vercel fue un bloqueo de CDN | **Diagnóstico NO demostrado**: falta la evidencia de su ejecución; no se atribuye |
| Que `cause = "blocked"` describa lo que pasó en producción | **Diagnóstico**: solo sería cierto si `httpStatus` se mide; hasta entonces `cause` sería una hipótesis rotulada como tal |

Reglas que no cambian: campos nuevos **opcionales** y tri-estado; los lectores de filas antiguas siguen leyendo lo que ya leen; **no se reescriben históricos** (los snapshots con `skipped_offsite` para un 403 se muestran con su etiqueta histórica); no se importa una URL arbitraria.

## 1. Cuatro cosas que NO se mezclan

| | Qué es | Depende de leer la web |
|---|---|---|
| A. Portada no leída | El asistente no obtuvo HTML al dar de alta | sí |
| B. Propuesta manual | Sugerencias a partir de la descripción escrita por la persona | no |
| C. Auditoría web | Salud técnica / cobertura sobre páginas del dominio | sí |
| D. Medición de IA | Menciones con el nombre confirmado y alias | no |

La descripción manual habilita B y D, **no C**. Una auditoría no realizada **no se presenta como 0 ni como «sin problemas»**.

## 2. Tipos propuestos (todos aditivos y opcionales)

1. `PageFetchResult` (no `analyzed`) gana un campo **opcional** `httpStatus?: number` — solo el código numérico, nunca cabeceras ni cuerpo. Tri-estado (`.claude/rules/web-audit.md`): `undefined` = no medido (fixtures y filas previas), número = medido. Lo rellena `fetchPageSafely` cuando hay respuesta HTTP no OK.
2. **Sin enum nuevo para «bloqueada»**: `fetchPageSafely` devolvería `skipped_error` (ya existe en `PageFetchStatus` y en `PAGE_SKIP_LABELS`) para «HTTP no OK» y fallos de red que no son timeout, en lugar de `skipped_offsite`. `skipped_offsite` queda solo para lo que de verdad es «fuera del dominio» (salto a otro host, URL inválida).
3. `HomepageEvidence` (`business-profile.ts`) pasa de `{ status: "unavailable" }` a `{ status: "unavailable"; cause: HomepageUnavailableCause }` con `HomepageUnavailableCause = "blocked" | "timeout" | "network" | "not_html" | "empty" | "unsafe"` (constantes **propias**; mapeo desde `PageFetchResult`).
4. `BusinessContextUnidentifiedReason` no cambia; `suggestProjectSetup` añade **opcional** `readCause?: HomepageUnavailableCause` al resultado (solo cuando `reason === "homepage_unreadable"`).
5. Estado de pantalla `AuditUnavailableState = { reason: "blocked" | "timeout" | "network" | "not_html" | "empty" | "unknown"; httpStatus?: number }`, **derivado** al leer (no se persiste nada nuevo): una auditoría con `readiness_score === null` y todas las páginas en estado no analizado.

## 3. Consumidores (y qué les cambia)

| Consumidor | Cambio / riesgo |
|---|---|
| `lib/web-audit/fetch-page.ts` | Devuelve `skipped_error` + `httpStatus` donde hoy devuelve `skipped_offsite`. **Nada** del guardián SSRF cambia (`verifyUrlIsSafe`, `hostnameResolvesToPublicIp`, `isAllowedAuditHost`, redirecciones manuales por salto). |
| `lib/projects/business-profile.ts` | Mapea a `cause`; copy por causa en el asistente. |
| `lib/web-audit/technical-audit.ts` | Recibe el nuevo estado; sigue persistiendo la fila incluso con todo descartado (invariante 4: cada unidad de límite consumida deja fila). `computeReadinessScore` sigue devolviendo `null`. |
| `page-audit-row.tsx` (`PAGE_SKIP_LABELS`) | `skipped_error` ya tiene etiqueta («no se ha podido cargar»); con `httpStatus` se puede añadir «la web respondió {estado}». Deja de decir «fuera del dominio verificado» para un 403 del propio dominio. |
| `lib/web-audit/regressions.ts` | Trata `skipped_timeout`/`skipped_error` como «inalcanzables» (`UNREACHABLE_STATUSES`). Mover los 403 a `skipped_error` **puede generar un aviso de regresión** si una web antes legible empieza a rechazar. Requiere decidir si ese aviso es deseado y fijarlo con tests (transición, nunca estado). |
| `lib/web-audit/page-data.ts`, `web-audit/page.tsx` | Sustituir «—» + «Media de 0 páginas clave» por «Auditoría web no disponible» (§5). |
| `lib/web-audit/issues.ts`, `page-fixes.ts`, `lib/recommendations/citation-blockers.ts` | Solo leen páginas analizadas (`isAnalyzed`); deben seguir sin tocar páginas no analizadas. Tests de regresión: ninguna recomendación se genera sobre una página no leída. |
| `lib/scoring/run-scoring.ts` | **No cambia**: `technical` sigue excluyéndose y los otros cuatro pesos renormalizándose. Lo que cambia es que la pantalla lo **diga**. |
| `lib/scan/citation-resolution.ts` | No usa `fetchPageSafely` (usa su propio resolutor con el mismo guardián importado); fuera de alcance. |

## 4. Compatibilidad

- Campos **opcionales y tri-estado**: las filas persistidas antes (sin `httpStatus`) siguen leyéndose; `undefined` no cuenta como «medido y limpio» ni como fallo (misma lección que tumbó producción el 2026-07-12).
- `PageAuditEntry.status` ya admite `skipped_error`; los snapshots antiguos con `skipped_offsite` para un 403 **no se reescriben** (no se reinterpreta el pasado): la pantalla puede mostrarlos con su etiqueta histórica.
- Los tests de `technical-audit.test.ts`, `regressions.test.ts` y los de render de `page-audit-row` deben seguir verdes sin cambios salvo los que fijan `skipped_offsite` para respuestas no OK, que cambian a propósito y se listan en el PR.
- Sin migración, sin RLS, sin SQL, sin nuevas variables de entorno.

## 5. Copy y estados

**Estado «Auditoría web no disponible»** (pantalla de auditoría), en este orden:
1. **Qué pasó (motivo seguro, solo si se conoce):** «La web rechazó la lectura automática» (`blocked`, y «respondió {estado}» si se midió) · «Tardó demasiado en responder» (`timeout`) · «No encontramos contenido legible» (`empty`/`not_html`) · «No hemos podido leerla» (`unknown`).
2. **Alcance no evaluado:** salud técnica, robots/sitemap, cobertura de contenido de tu web. «Tu puntuación GEO se calcula sin el componente técnico.»
3. **Lo que sí vale:** «La medición en IAs no depende de leer tu web.»
4. **Siguiente salida:** «Reintentar más tarde» (la auditoría ya se reintenta sola).

**Prohibido en el copy:** «esto SÍ es tu web» (no sabemos que lo sea); atribuir la causa a un tercero —CDN, firewall, Vercel, un proveedor— **sin logs que lo prueben**; «con la descripción se resuelve todo»; mostrar 0 o «Media de 0 páginas» como si fuera un resultado.
En el asistente: «No hemos podido leer tu web» + frase por causa + descripción manual como camino a **sugerir y medir** (B y D), nunca como sustituto de C.

## 6. Revisión de seguridad que hace falta (`data-guardian`) antes de implementar

- Confirmar que **no se persiste** cuerpo, cabeceras ni texto de error del servidor remoto: solo constantes propias y un entero (`httpStatus`) acotado (100–599).
- Confirmar que el cambio de `skipped_offsite → skipped_error` **no relaja** ninguna comprobación (los `return` ocurren **después** de `verifyUrlIsSafe` y en las mismas ramas).
- Confirmar que el aviso de regresión nuevo (si se admite) no filtra datos de otros proyectos ni genera ruido diario (transición, no estado).
- Confirmar que la salida del asistente no permite sondear hosts internos: el `cause` solo se devuelve para el dominio ya validado por el alta.

## 7. Alternativa acotada (diseñada, NO existe y NO se implementa aquí)

Contenido aportado por la persona, o **una** URL pública alternativa **del MISMO dominio**, validada con **exactamente** las reglas de `fetchPageSafely` (HTTPS, `isAllowedAuditHost`, DNS pública, redirecciones verificadas por salto). Sería **una página concreta**, etiquetada «auditoría de una página aportada», **nunca** «auditoría de tu web»: no implica cobertura del sitio entero ni equivale a la auditoría automática. **Hoy no existe importación manual**: los candidatos salen de la portada, del mapa de cobertura y de citas propias. No se acepta URL arbitraria ni se relajan guardias.

## 8. Backlog posterior al primer cliente

Un proveedor de rastreo legítimo para webs con protección anti-bot: coste, cobertura y límites **a investigar entonces**. Sin compra ahora, sin bypass, sin rotación de IP/user-agent, sin escaneos de pago nuevos.

## 9. Orden propuesto si se aprueba (cada paso con su PR/revisión)

1. Solo asistente: `cause` desde el estado actual (`timeout`/`unsafe`/`not_html`/«no legible») **sin tocar `fetch-page.ts`**.
2. `fetch-page.ts`: `skipped_error` + `httpStatus` (con `data-guardian` y tests de `regressions`).
3. Pantalla: «Auditoría web no disponible».
4. Después, y solo con decisión: alternativa acotada (§7).

Do you approve this plan? I will not implement until you confirm.
