# Asistente de alta: diagnóstico de la prueba real y propuesta UX — SOLO PROPUESTA

**Estado:** diagnóstico por lectura de código y de las cuatro capturas descritas por el Director. **No se ha implementado nada**, no se ha repetido ninguna llamada de pago, no hay escaneo, no se ha tocado `lib/web-audit/**` ni ninguna configuración. Respuesta al comentario Director 6070252733 (#553).
Antes de implementar hace falta revisión de alcance del Director y, para el punto 4, revisión de `data-guardian` (`lib/web-audit/fetch-page.ts` es zona adyacente a «crawler», `.claude/rules/web-audit.md`).

Prioridad (regla 1 primer cliente): el P0 es retirar el falso caso y seguridad/cobro 99 €. Esto es **P1 en paralelo**; el punto 4 es **diagnóstico acotado del lector y del camino alternativo, no infraestructura nueva** que bloquee facturación.

---

## 0. Qué probó Denis (commit / deployment) y qué NO es

Lo que consta (no he podido abrir Vercel: 403; todo sale de los estados de commit de GitHub):

| Commit de #553 | Estado Vercel del commit | Qué contiene |
|---|---|---|
| `4b4a20ed` (22:02 UTC) | «Deployment has completed» (panel `…/geo-tool/4Dmf14HikDcsmMDDPixjBwB4S2XK`) | wizard de identidad + responsive; **sin #550** |
| `aab4802d` (22:07 UTC) | **«Canceled by Ignored Build Step»** (solo docs) | no construye: el alias de la rama sigue sirviendo el último build válido |

Por tanto el producto que Denis pudo probar a las 00:20 (hora local; 22:20 UTC si es CEST) es, con la mayor probabilidad, **el build de `4b4a20ed`**: llamadas **reales** (Gemini, lectura de portada), sin banda FIXTURE y con un límite de plan distinto del fixture (300 frente a 15). **Esto es una inferencia**: la URL exacta que abrió y el commit que mostraba tienen que confirmarse en el panel (el pie de la página/«Deployment» lo dice). **No es** la rama de fixture `claude/onb-responsive-preview-2` @ `e478195c`, **no** contiene las 72 de #550 y **no** valida un contrato 99/75.
Movistar llegando a propuestas **no equivale a un escaneo completado**: solo prueba que la lectura + sugerencia funcionaron.

**Hallazgo sobre mi propia evidencia:** todos mis fixtures usaban `brandProposal.pending = false`. El estado «identidad pendiente» —el que ve cualquier usuario real cuya marca sale del dominio— **nunca estuvo en las capturas**, y es justo donde más texto se apila. La evidencia previa no cubría el caso real.

---

## 1. Marca — causa y propuesta

### Causa (por lectura de `components/onboarding/brand-identity-card.tsx`)

1. **Cinco bloques de texto antes de poder actuar** cuando `pending` es verdadero: título «Tu marca» + frase «Así escribirán tu marca las IAs…» + aviso «Identidad pendiente de confirmar. Hemos sacado «X» del dominio y puede estar mal escrito (espacios, tildes)…» + etiqueta «Nombre comercial» + columna «Dominio», y debajo el bloque de alias con su propia etiqueta y su ayuda. El dominio se repite (aquí, en el título de la página y en el resumen lateral).
2. **«El nombre es correcto» no parece un botón:** es un `Button variant="outline"` metido **dentro de un párrafo `.add-hint`** (texto 12,5 px gris, `display:flex`), con `marginLeft: 6` y en línea con el texto, que al envolver en móvil queda a media frase. Para el ojo es una frase con un enlace, no una acción. Además está **separado del campo** que confirma.
3. **Mal formateado:** rejilla `repeat(auto-fit, minmax(220px,1fr))` con estilos en línea (Nombre | Dominio): a 390 px cae a una columna y el dominio queda con su etiqueta como un segundo «campo» que no se puede editar; el dominio largo rompe por `overflowWrap:anywhere`. Los alias, la ayuda y el chip `×` usan tamaños de 24 px.

### Propuesta (antes → después, 390 px)

```
ANTES (pendiente)                        DESPUÉS (pendiente)
Tu marca                                 Confirma tu marca
Así escribirán tu marca las IAs. …       Nombre comercial
Identidad pendiente de confirmar.        [ Elcorteingles                  ]
 Hemos sacado «Elcorteingles» del        Revisa cómo se escribe tu marca
 dominio y puede estar mal escrito …     [ Confirmar nombre ]   (botón 44 px)
 [El nombre es correcto] (en la frase)   elcorteingles.es       (línea secundaria)
Nombre comercial | Dominio               ▸ Otros nombres (opcional) · 1 propuesto
[ Elcorteingles ]  elcorteingles.es      
Otros nombres …  (ayuda larga)           
[ alias × ] [ campo ] [Añadir]           
```

- **Título** «Confirma tu marca»; **campo** «Nombre comercial»; **botón separado «Confirmar nombre»** con aspecto de botón (`Button` primario/secundario, `min-height:44px`, foco visible), **debajo del campo** y no dentro de un párrafo. Al confirmarse, el mensaje desaparece (mismo estado `pending=false` que hoy, misma función `onConfirmBrand`).
- **Mensaje breve solo si pendiente:** «Revisa cómo se escribe tu marca». Sin él cuando ya está confirmada.
- **Dominio** en una línea secundaria bajo el campo (una vez, no como columna).
- **Alias en `<details>`** («Otros nombres con los que te nombran (opcional)»), **abierto por defecto si hay propuestas que revisar** (`aliasesAutoFound > 0`), cerrado si no hay ninguna.
- **No se quita:** la confirmación previa al escaneo, las validaciones de `addConfirmedAlias`/`sanitizeBrandName`, ni los alias propuestos. Solo se reorganiza y se acorta el texto. Se evita repetir el dominio, la explicación de identidad y el párrafo del cero.
- **Diff estimado:** `brand-identity-card.tsx` (reestructura JSX, sin cambio de props ni de lógica), `globals.css` (bloque `.onb2-scope`: clases `.onb2-confirm`, `.onb2-alias-details`; se retiran estilos en línea). Los tests de contenido (`onboarding-identity.test.tsx`) se actualizan: siguen afirmando que el aviso sale solo con `pending` y que el botón llama a `onConfirmBrand`.

---

## 2. Competidores — causa y propuesta

### Causa
`components/onboarding-wizard.tsx` (paso 2) muestra `COMPETITORS_SUBTITLE` (una frase de ~170 caracteres con el dominio en mono delante) **y** una línea «Criterio de la propuesta: sector / subsector · mercado · idioma» a continuación. Es honesto pero ocupa el primer plano con método en vez de con la tarea («revisa o edita»).

### Propuesta
- **Una frase** bajo el título: «Propuestas de IA. Revisa o edita antes de continuar.»
- **Sector / país / idioma y método** pasan a un `<details>` «Cómo se han propuesto» (cerrado por defecto) que contiene: «Propuesta de un modelo de IA a partir de tu web y de una búsqueda, no una lista verificada», el criterio (sector/subsector/mercado/idioma) y la explicación de «con fuente» / «sin verificar».
- **Se mantienen** los chips «con fuente» / «sin verificar» en cada fila y la edición/quitar. `proposal-copy.ts` conserva las constantes y el test de honestidad (`ALL_PROPOSAL_COPY`); se añade la nueva frase corta a esa lista para que no pueda prometer más de lo que sabe.
- **Diff estimado:** `proposal-copy.ts` (+2 constantes), `onboarding-wizard.tsx` (cabecera del paso 2), CSS mínimo del `<details>`.

---

## 3. Prompts — causa y propuesta

### Causa
- **País e idioma:** `prompts-context.tsx` pinta el país como texto y el idioma como `<select>` nativo (`.onb2-lang-select`, 32 px; 44 px solo ≤760) con una etiqueta suelta. El país de la barra de dominio, en cambio, es el control del sistema `.country-sel` (bandera + nombre + chevron). Son **dos lenguajes visuales** para el mismo concepto.
- **Texto innecesario:** tres notas apiladas (`MARKET_LANGUAGE_NOTE`, `PROMPTS_NATURE_NOTE`, bloque «Estimado: …» + `INTENT_ESTIMATE_NOTE`) y, **en cada fila**, una segunda línea «Comercial · sin marca · estimado» (repetida 8-15 veces) bajo cada pregunta.
- **768 / 561–760:** el texto del prompt sigue en una línea con puntos suspensivos; esta fila ya está documentada como no resuelta.

### Propuesta
- **País y idioma con el mismo componente visual que el país de la barra de dominio** (envoltorio `.country-sel`/variante `.field-sel`: bandera/etiqueta + chevron, `<select>` transparente encima), **44 px**, etiqueta visible «Idioma», foco visible y operable con teclado (se mantiene `aria-label`).
- **Una línea de aviso:** «Preguntas propuestas por IA, sin volumen de búsqueda medido.»
- **Todo lo demás en `<details>` «Cómo se han elegido»:** el recuento por intención/marca («Estimado: 1 informativas · 6 comerciales…»), `INTENT_ESTIMATE_NOTE`, `COVERAGE_NOTE` (15 = recomendación, no garantía) y la nota de mercado/idioma. **No se borra honestidad**, se baja de nivel.
- **Fila:** pregunta completa visible (≤560 ya lo está; se adopta también 561–900: hasta 3 líneas con `line-clamp`, el texto íntegro sigue en el editor); la etiqueta de intención por fila **solo cuando aporta** (p. ej. «Local») en lugar de en todas; se conservan editar/eliminar y la **advertencia contextual de falta local** («Ninguna es local: si tu negocio atiende a una zona, añade alguna a mano») visible cuando `mix.local === 0` y aplique.
- **Diff estimado:** `prompts-context.tsx` (reestructura), `proposal-copy.ts` (+ aviso corto), `onboarding-wizard.tsx` (fila: etiqueta condicional), `globals.css` (variante de selector + `line-clamp` 561–900). Medir de nuevo a 390/768/1280 y texto largo.

---

## 4. ECI: «No hemos podido leer tu web» ≠ «no se puede medir»

### Recorrido real (commit `aab4802d`, lectura de código)

`suggestProjectSetup` → `fetchHomepageEvidence(domain)` (`lib/projects/business-profile.ts:73`) → `fetchPageSafely("https://" + domain, domain)` (`lib/web-audit/fetch-page.ts:238`) → `resolveBusinessContext`.

`fetchPageSafely` usa **4 s por salto, 3 redirecciones, 512 KiB, verificación SSRF por salto** (`hostnameResolvesToPublicIp`, `isAllowedAuditHost`), `redirect: "manual"` y el user-agent honesto `GEOStudioAudit/1.0 (+https://genscore.es/bots)`. Y **colapsa causas distintas en el mismo valor**:

| Qué pasó | Estado que devuelve hoy |
|---|---|
| Respuesta HTTP **no OK** (403, 401, 429, 404, 5xx) | `skipped_offsite` (el nombre es engañoso) |
| Fallo de red que **no** es timeout (DNS, TLS, reset) | `skipped_offsite` |
| Redirección sin `Location`, URL inválida o más de 3 saltos | `skipped_offsite` |
| Salto a otro host fuera del dominio | `skipped_offsite` |
| Timeout de 4 s | `skipped_timeout` |
| Resuelve a IP no pública | `skipped_unsafe_ip` |
| No es `text/html` | `skipped_not_html` |
| HTML vacío / SPA sin contenido (sin título, descripción, h1/h2 ni ≥ umbral de texto) | `ok` → `unavailable` en `fetchHomepageEvidence` |

Y `fetchHomepageEvidence` reduce **todo lo que no sea `analyzed`** a `{ status: "unavailable" }`; `resolveBusinessContext` lo traduce a `homepage_unreadable` y la pantalla dice «No hemos podido leer tu web — Pasa con webs grandes o protegidas». **Se pierde el estado 403, la diferencia DNS/timeout/HTML vacío**, así que ni el usuario ni el operador pueden distinguirlos.

**Lectura pública independiente** (aportada por el Director, otra red, 00:21:25): `elcorteingles.es` → 301 a `www` → **403 AkamaiGHost «Access Denied»**. Es coherente con un bloqueo del CDN, **pero no demuestra el motivo en el entorno de Vercel de Denis**: no se atribuye el bloqueo exacto sin la evidencia de su ejecución. Lo único que el código permite afirmar con certeza es «no obtuvimos HTML legible».

### Qué se propone (diagnóstico acotado del lector + fallback; **no** infraestructura nueva)

1. **Conservar la causa, no la respuesta.** Que `fetchHomepageEvidence` devuelva `{ status: "unavailable", cause }` con `cause ∈ {"blocked", "timeout", "network", "not_html", "empty", "unsafe"}` (constantes **escritas por nosotros**, nunca el mensaje del proveedor ni del servidor remoto; `.claude/rules/scan.md`, «Persist categorized, self-authored error messages»).
   - Para distinguir «blocked» (HTTP no OK) del resto, `fetchPageSafely` necesitaría exponer un campo opcional con el **código de estado HTTP** (tri-estado: `undefined` = no medido; `.claude/rules/web-audit.md`). Es un cambio aditivo en una función **compartida con la auditoría técnica**: **requiere revisión de `data-guardian` y los tests de `technical-audit.test.ts` intactos**. Alternativa sin tocar `fetch-page.ts`: aceptar solo la distinción que ya existe (`timeout` / `unsafe` / `not_html` / resto «no legible»).
2. **Copy por causa, siempre con salida:** «No hemos podido leer tu web» se mantiene como titular, pero la frase de apoyo cambia con `cause` («La web rechazó la lectura automática» para `blocked`; «Tardó demasiado en responder» para `timeout`; «No encontramos contenido legible» para `empty`/`not_html`). **Sin acusar a la web de la persona** cuando no se sabe, y sin atribuir el bloqueo a Akamai ni a ningún CDN.
3. **Camino alternativo ya existente, hecho evidente:** descripción manual del negocio + **nombre confirmado** + alias → se puede **sugerir y medir** sin lectura de portada (`resolveBusinessContext` ya admite `userDescription`; el escaneo mide con el nombre confirmado; es la causa corregida en §237 para elcorteingles). La propuesta es solo subir ese camino de la 2.ª línea a la primaria del estado de error: «Cuéntanos qué hace tu negocio y lo medimos igual» + «Continuar sin sugerencias».
4. **Qué NO se hace** (ninguna se plantea): relajar el guardián SSRF, rotar IP/red/user-agent, saltarse protecciones (bypass), añadir un navegador/motor anti-bot general, reintentar con otra identidad. El user-agent honesto y la lista de bloqueos de `fetch-page.ts` se quedan como están.
5. **Prueba sin red:** tests que simulan cada fila de la tabla con `fetchPageSafely` mockeado (403, DNS, timeout, HTML vacío) y comprueban `cause` + que **siempre** aparece el campo de descripción. Sin llamadas reales.

---

## 5. Estados y anchos — dónde queda cada cosa

Estados: **normal** (identidad confirmada, propuestas listas) · **pendiente** (marca sacada del dominio) · **error** (portada ilegible, con causa) · **texto largo** (marca de 85 caracteres, competidor de 86, prompt de 218).

| Paso | Arriba (siempre visible) | Va a detalle (`<details>`) | Cambia por estado |
|---|---|---|---|
| 2 · Marca | Título «Confirma tu marca», campo, botón «Confirmar nombre», dominio secundario | Otros nombres (abierto si hay propuestas) | **pendiente:** + «Revisa cómo se escribe tu marca». **error:** el bloque de descripción pasa **encima** de la marca y de la lista |
| 2 · Competidores | «Propuestas de IA. Revisa o edita antes de continuar.», lista con chips | «Cómo se han propuesto» (criterio y método) | **error:** lista vacía, solo la descripción y «Continuar sin sugerencias» |
| 3 · Prompts | País e idioma (mismo componente que el país de la barra), aviso corto, lista con pregunta completa | «Cómo se han elegido» (recuento de intención/marca, 15 = cobertura, notas) | **sin locales:** aviso contextual visible |
| Largo | Nombre/dominio/competidor con elipsis y expansión por teclado; prompt hasta 3 líneas (561–900) y completo ≤560 | idem | idem |

| Ancho | Layout |
|---|---|
| 390 | Una columna; botones a 44 px; chips y acciones bajo el texto (ya existe) |
| 768 | Una columna del wizard + panel lateral de resumen (ya existe); prompt hasta 3 líneas |
| 1280 | Idem 768 con más ancho; sin cambios de estructura |

**Para decidir/medir al implementar:** capturas de los cuatro estados en 390/768/1280 **con un fixture que incluya `pending = true` y `reason = homepage_unreadable`** (los actuales no los tenían). Se reutilizarán las capturas ya hechas para el estado normal.

---

## Qué se necesita para pasar a implementar

1. **OK de alcance del Director** a los puntos 1–3 (UX, sin esquema, sin backend) y, por separado, al punto 4.
2. **Revisión de `data-guardian`** si se toca `lib/web-audit/fetch-page.ts` (campo opcional de estado HTTP); si no se aprueba, el punto 4 usa solo las distinciones que existen.
3. **Confirmación del dueño** del commit/deployment que Denis abrió (panel de Vercel) para dar el diagnóstico por cerrado sobre el producto real.
4. Nada de esto requiere esquema, SQL, Stripe, configuración ni llamadas de pago; no se lanzan escaneos.

Do you approve this plan? I will not implement until you confirm.
