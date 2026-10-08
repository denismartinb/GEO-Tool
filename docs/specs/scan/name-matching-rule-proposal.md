# Propuesta: una regla de nombres compartida por el escaneo y el cajón de Prompts

**Estado:** propuesta para revisión. **No hay código integrado.** Hay una implementación **local** en la rama
`claude/matching-word-boundary-1` (sin empujar, sin PR). Sin esquema, sin recálculo de filas, sin escaneos.
**Pedido por el Director (#553):** una regla única para escaneo y cajón, con casos multilingües y frontera clara, sin
reinterpretar en silencio filas persistidas por versiones anteriores, y con alternativas y versionado explícitos.
**No se ha podido hacer la comparación sobre datos reales:** requiere acceso de solo lectura que no está concedido, y este
documento no lo busca ni lo asume. El corpus sintético (23 filas escritas a mano) **no la sustituye**.

## 1. Qué pasa hoy (verificado en el código de `main`)

- El **escaneo** decide una mención en `verifyMention` (`lib/scan/extraction.ts`) con dos comprobaciones: (a) el nombre reclamado casa con
  la marca o un alias, por **subcadena en ambos sentidos** sobre texto normalizado; (b) el nombre reclamado está en la respuesta, también por
  **subcadena**. Resultado: «Zara» casa con «Zaragoza».
- El **cajón de Prompts** re-deriva «coincidió con X» (`matchDisplayName`, `components/prompts/prompt-drawer.tsx`) con una **copia** de (a), sobre los snapshots
  de la propia fila (`brand_snapshot`, `brand_aliases_snapshot`), **sin** (b) y sin el texto de la respuesta.
- La normalización antigua convertía en separador todo lo que no fuera `[a-z0-9]`: el cirílico, el griego y el CJK dejaban una clave vacía
  (nunca casaban) y letras como ø o ß partían las palabras («Ørsted» → «rsted»).

## 2. Qué existe como histórico (campos reales, sin inventar)

Cada fila de `scan_prompt_results` guarda: `brand_snapshot`, `brand_aliases_snapshot`, `brand_mentioned`, `extracted_json` (con
`brand.display_name_found`), `extraction_version` (texto, `'v1'` por defecto en el esquema; hoy `EXTRACTION_VERSION = "verified-mention-v1"`),
`raw_response_text`, `competitors_snapshot`, `country_snapshot`, `language_snapshot`. **No existe** ningún campo que diga con qué regla de nombres se decidió ni qué nombre casó.

> **Trampa documentada: `EXTRACTION_VERSION` NO sirve como interruptor de versión de matching.** `lib/scan/extraction.ts` cuenta como «sin procesar»
> toda fila con `extraction_version` distinta (`.neq("extraction_version", EXTRACTION_VERSION)`), y `lib/scoring/run-scoring.ts` trata como
> «conjunto de competidores no fiable» cualquier run con filas de otra versión. Subirla marcaría **todo el histórico** como pendiente de extraer y degradaría la
> puntuación de los runs antiguos. Cualquier versionado del matching necesita un campo propio.

## 3. La regla compartida que se propone

Una sola función pura, `decideMention({ claimed, names, rawText? })`, usada por el escaneo **y** por el cajón, de modo que **no pueden divergir**. Reglas:

1. **Comparación por palabras completas** (no subcadena): una secuencia de palabras contiene a otra solo si son palabras enteras y seguidas. «Zara» ≠ «Zaragoza»; «Iberia» ↔ «Iberia Líneas Aéreas».
2. **No se borran espacios.** «elcorteingles» ≠ «El Corte Inglés» (se arregla confirmando el nombre en el alta, no relajando la comparación).
3. **Diacríticos plegados** (é = e) y **letras latinas no descomponibles plegadas** con una tabla cerrada: ø→o, ł→l, ß→ss, đ→d, ð→d, þ→th, æ→ae, œ→oe, ı→i. Así «Ørsted» = «Orsted» y «Straße» = «Strasse».
4. **Alfabetos con espacios** (latino, cirílico, griego…): las letras y dígitos de cualquier alfabeto cuentan.
5. **Escrituras sin espacios (chino, japonés, tailandés, lao, jemer, birmano): por defecto se tratan como SEPARADORES, exactamente como hacía el código antiguo.**
   Un nombre solo en ellas queda con la clave vacía y no casa (ni en el escaneo ni en el cajón); un nombre mixto («Toyota トヨタ») conserva su parte latina y sigue casando por ella;
   y un nombre latino pegado a japonés («Toyotaは») se sigue encontrando. Es **paridad con lo anterior**, no una regla nueva ni un estrechamiento. Una regla versionada con segmentador es la decisión aparte de §6.
6. La presencia en la respuesta (b) usa **el mismo límite de palabra**.

### Frontera y casos multilingües (implementados y probados en la rama local)

| Caso | Antes | Con la regla |
|---|---|---|
| «Zara» ↔ «Zaragoza», «Apple» ↔ «Pineapple», «Seat» ↔ «Seattle» | casaba | **no casa** |
| «Mercadonas», «Mercadonalia» frente a «Mercadona» | casaba | **no casa** (se pierden los plurales/derivados pegados) |
| «Ørsted» ↔ «Orsted» | casaba (por accidente: ø partía la palabra) | **casa** (plegado) |
| «Straße» ↔ «Strasse» | no casaba | **casa** |
| «Łódź» ↔ «Lodz» | casaba por accidente (ł partía la palabra: «odz») | **casa** (plegado) |
| «Яндекс», «Ελλάδα Τράπεζα» | nunca casaba (clave vacía) | **casa** |
| «トヨタ» solo, en una frase japonesa | no casaba | **no casa** (igual; coherente en escaneo y cajón) |
| «Toyota トヨタ» (mixto) ↔ «Toyota»; «Toyotaは» | casaba | **casa** (igual: la parte latina cuenta) |
| «elcorteingles» ↔ «El Corte Inglés» | no casaba | no casa (sin cambio, a propósito) |
| «tu marca» reclamado para cualquier marca | no casaba | no casa |

## 4. Qué cambia respecto a lo que ya está persistido

- **Veredictos ya guardados (`brand_mentioned`, `extracted_json`):** **no cambian.** La verificación solo corre al extraer; no hay recálculo.
- **Lo que enseña el cajón** sobre filas antiguas: hoy re-deriva con la regla vigente, así que **con la regla nueva puede dejar de mostrar «coincidió con X»**
  (o mostrarlo donde antes no). Es una **reinterpretación en silencio de filas persistidas** y es lo que esta propuesta quiere evitar.
- **Efecto sobre escaneos futuros:** más estricto para subcadenas pegadas (plurales/derivados), más amplio para cirílico/griego/ß. Sin medir sobre datos reales.
- **También afecta al comprobador gratuito** (`/api/gratis/comprobar` usa `verifyExtractedMentions`).

## 5. Alternativas para no reinterpretar lo persistido (decisión pendiente)

| | Qué hace | Esquema | Pros | Contras |
|---|---|---|---|---|
| **A. Congelar** | El cajón sigue con la regla antigua siempre | No | Cero cambio visible | El cajón y el escaneo divergen para siempre en filas nuevas; dos reglas vivas |
| **B. Corte por fecha** | Constante de código: filas anteriores a un instante usan la regla antigua en el cajón | No | Sin migración | Frágil: depende de relojes y de que `created_at` sea fiable; deja una constante mágica; entornos distintos pueden desfasar |
| **C. Campo propio de versión** | Columna `matching_version` (las existentes = regla antigua; las nuevas = regla nueva); el cajón elige la regla por fila | **Sí** (aprobación) | Explícito, auditable, reversible | Migración + relleno; requiere aprobación |
| **D. Guardar lo decidido** | Persistir el nombre que casó (y si fue alias) al extraer; el cajón **muestra lo guardado y no re-deriva** | **Sí** (aprobación) | La mejor semántica: el cajón enseña lo que decidió el escaneo | Migración; las filas antiguas quedan sin dato (se muestran como «sin registrar», no inventado) |
| **E. Aceptar el cambio** | No hacer nada | No | Simple | Descartada por el Director |

**Recomendación:** C o D antes de integrar el matching; B solo como puente corto si hace falta publicar antes. **No** `EXTRACTION_VERSION` (§2).

## 5b. Comparación mínima C vs D (sin SQL aplicado; ilustrativo)

Ambas conservan intactos `raw_response_text` y el veredicto guardado (`brand_mentioned`, `extracted_json`): ninguna recalcula ni reescribe nada.

| | **C. `matching_version`** | **D. guardar lo decidido** |
|---|---|---|
| Campo | `scan_prompt_results.matching_version smallint` (nulo = «sin registrar»; 2 = regla nueva) | `scan_prompt_results.brand_match jsonb` p. ej. `{"name":"El Corte Inglés","kind":"alias","rule":2}`; nulo = «sin registrar» |
| Coste | Una columna pequeña; el escaneo escribe una constante | Una columna jsonb por fila (decenas de bytes); el escaneo ya tiene el nombre que casó en `verifyMention` |
| Relleno de lo existente | Ninguno obligatorio. **Hipótesis, no hecho:** que todo el histórico nulo se calculó con una única «regla 1». No está demostrado: antes de leer nulo como «regla antigua» hay que inventariar los hitos de cambio de la verificación (MENTION-VERIFY-1 y posteriores) con evidencia en el histórico y el código; si no existe, nulo sigue siendo «sin registrar» | Ninguno: lo anterior queda «sin registrar»; **no se inventa** un nombre retroactivo |
| Qué enseña el cajón en filas antiguas | Re-deriva, pero **con la regla de la fila** (necesita conservar las dos implementaciones) | Lo guardado; sin dato, «sin registrar» y **sin re-derivar**. **Ausencia de registro ≠ ausencia de mención:** `NULL` nunca se muestra como «sin mención»; el veredicto de mención sigue siendo `brand_mentioned` |
| Qué enseña en filas nuevas | Re-deriva con la regla 2 | Lo guardado |
| Riesgo | Hay que mantener la regla antigua en el código para siempre (o hasta purgar histórico) | El cajón deja de ser una explicación recalculable y pasa a ser un registro: más fiel, pero lo antiguo se ve más pobre |
| Cambia el veredicto histórico | No | No |

Ilustración (**no aplicada, no es una migración aprobada**): `alter table scan_prompt_results add column matching_version smallint;` para C; `... add column brand_match jsonb;` para D. Cualquiera de las dos exige aprobación de esquema y revisión de `data-guardian` (rutas de lectura/escritura y RLS: no cambian, pero hay que comprobarlo).
**Decisiones, SQL y comparación real siguen pendientes y no son ejecutables por esta revisión.** **Lo que no se asume:** que perder plurales/derivados pegados («Mercadonas») esté aceptado, ni que se adopte una segmentación nueva para escrituras sin espacios.

## 6. Escrituras sin espacios: alternativa para decidir más adelante

`Intl.Segmenter` (ICU) segmenta bien japonés, chino y tailandés en el Node de este entorno (ICU 77.1), por ejemplo «トヨタは新型車を発表した。» → «トヨタ / は / 新型 / 車 / を / 発表 / した». Pero **depende de la versión de ICU del entorno**: el mismo texto
podría dar veredictos distintos al escanear y al leer después, y entre despliegues. Si se adopta, **dejaría de ser paridad** y tiene que ir **versionado** (la versión de la regla y de ICU en el campo de C/D) y probado con un corpus fijo. Hasta entonces, §3.5 (paridad con lo anterior).

## 7. Herramienta de comparación (solo lectura, ya preparada en la rama local)

`scripts/compare-name-matching.ts` + `scripts/compare-name-matching-core.ts`: leen un fichero **local** `.jsonl` (`id`, `brand`, `aliases`, `claimed`, `raw` opcional), comparan viejo vs nuevo en memoria y
muestran un resumen. Sin red, sin base de datos, sin escribir, sin recalcular; por defecto no imprime el texto de las respuestas. **Para la comparación real hace falta acceso de solo lectura que no está concedido;
nada se exporta ni se sube sin esa decisión.**

Resultado sobre el corpus **sintético** de 24 filas (los números no son tasas): mención `same_true` 9 · `same_false` 5 · estrechado 7 · ampliado 3; causas: subcadena dentro de palabra 7, alfabeto no latino 2, plegado de letras 1;
cajón: igual 16 · pierde la coincidencia 5 · la gana 3 · cambia de objetivo 0. **Todo lo que se estrecha es subcadena dentro de una palabra; lo que se amplía es cirílico/griego y ß↔ss, nunca una subcadena nueva.**

### Formato mínimo de exportación redactada (para que lo obtenga quien tiene el acceso)

Un fichero **local**, nunca subido a GitHub ni al repo (nombrarlo `*.local.jsonl`; está pensado para no entrar en el control de versiones), una línea JSON por fila:

```json
{"id":"fila-0001","brand":"El Corte Inglés","aliases":["ECI"],"claimed":true,"raw":"…ventana de ±200 caracteres alrededor de cada candidato…"}
```

- `id`: identificador opaco y aleatorio, **no** el id de base de datos ni el de usuario.
- `brand`, `aliases`: los de `brand_snapshot` / `brand_aliases_snapshot` (nombres de marca, no personas).
- `claimed`: el `brand_mentioned` ya guardado (lo que decidió el escaneo).
- `raw` (opcional): solo la ventana de texto alrededor de cada aparición candidata, con cualquier dato personal sustituido por `[X]`. Sin `raw` la herramienta compara solo nombres, que es lo que más importa.
- **Fuera del fichero:** respuestas completas, URLs de usuario, correos, ids de proyecto/usuario, cualquier credencial. En GitHub solo se publican **recuentos agregados** (los de §7), nunca filas.
- Quién lo genera y con qué acceso es decisión del propietario; este documento no busca credenciales ni presupone acceso a la base de datos.

## 8. Decisiones abiertas

1. ¿Alternativa A, B, C o D para lo persistido? (C y D son esquema.)
2. ¿Se acepta perder los plurales/derivados pegados («Mercadonas»)?
3. ¿Quién hace la comparación real con acceso de solo lectura, y con qué formato de exportación local?
4. ¿Se acepta el límite de las escrituras sin espacios, o se versiona un segmentador?
5. ¿Se acepta que el comprobador gratuito use la misma regla?

Do you approve this plan? I will not implement until you confirm.
