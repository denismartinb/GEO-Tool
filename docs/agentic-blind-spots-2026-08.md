# Por qué la auditoría externa vio lo que nuestro sistema agéntico no

**Fecha:** 2026-08-27 · **Origen:** `Informe_auditoria_GenScore_20260826.docx` (auditoría
externa encargada a ChatGPT, 26-08-2026) · **Plan de corrección:**
`docs/external-audit-2026-08.md`

Este documento no es sobre los fallos. Es sobre **por qué nuestro sistema de
agentes, con quince especialistas, un piloto agéntico obligatorio, reglas de
ruta inyectadas y un histórico de 168 secciones, no encontró ninguno de ellos**
— y qué cambiamos para que la próxima auditoría externa no nos vuelva a ganar.

Los nueve P0 del informe no son fallos difíciles. Son fallos **evidentes para
cualquiera que use el producto entero de seguido sin conocerlo**. Que no
salieran no es mala suerte: es la consecuencia directa de cómo está construido
el sistema. Ocho causas estructurales, cada una con su corrección.

---

## Causa 1 — Todo se valida por zona, y ningún fallo importante vive dentro de una zona

El `Mapa de zonas` de `CLAUDE.md` es el eje del método: una regla de ruta por
zona, un histórico por zona, una celda de "última fase cerrada" por zona. El
piloto se ejecuta sobre "las pantallas afectadas por el PR". La `qa` revisa un
diff. `ux-alignment` compara una pantalla contra su artboard.

**Ni un solo mecanismo del sistema sostiene un `scan_id` en la mano y pregunta
si el mismo número sale igual en las cinco pantallas que lo enseñan.**

Y eso es exactamente P0-01 (GEO Score 6 en Visión general, 2 en Dominios, 2 en
la notificación) y P0-02 (45 "prompts" en Competidores contra 15 en Prompts).
Verificado en código: Visión general lee el compuesto
(`details_json.geo_score.score`, `app/dashboard/projects/[projectId]/page.tsx:404`)
y Dominios lee la componente cruda (`run_scores.visibility_score`,
`lib/project-workspace.ts:332`). Las dos pantallas son correctas por separado.
La contradicción sólo existe **entre** ellas, que es el único sitio donde nadie
mira.

El mismo método que hace que cada zona esté bien cuidada es el que garantiza
que nadie sea dueño del espacio entre zonas.

> **Corrección A — Contrato de métricas con test de coherencia.** Un módulo
> único dueño de toda cifra publicable de un run, y un test a nivel de fuente
> que falla si una pantalla calcula un porcentaje por su cuenta. El precedente
> existe y funciona: `tests/mission-parity.test.ts` hace justo esto para las
> propiedades visuales del cohete en seis pantallas (§168). Lo que faltaba era
> aplicar la misma idea a los números. Detalle en la Fase 1 del plan.

---

## Causa 2 — El piloto comprueba que la pantalla se pinta, no que lo que dice sea cierto

`docs/agentic-user-pilot.md` endureció el piloto tras el incidente del
2026-08-02 (una pantalla aprobada con capturas de un estado vacío) añadiendo
`ContentExpectation`: una pantalla no cuenta como vista si enseña un
placeholder.

Fue la corrección correcta al fallo anterior y **no cubre éste en absoluto**.
`ContentExpectation` demuestra que hay contenido real. No dice nada sobre si el
contenido es *verdad*. "45 prompts en total" pasa cualquier expectativa de
contenido que sepamos escribir: es una cifra real, calculada de filas reales,
renderizada nítidamente en las tres anchuras. Está mal por el **denominador**, y
un denominador equivocado no tiene aspecto de nada.

Construimos un piloto de renderizado y lo llamamos piloto de usuario.

> **Corrección B — Aserciones semánticas, no sólo de presencia.** El piloto
> pasa a llevar un set de aserciones cruzadas sobre el mismo proyecto: el score
> de Dominios == el de Visión general; el denominador de Competidores == el de
> Prompts × motores; la suma de la cabecera de Recomendaciones == la suma de sus
> tarjetas. Es barato: son comparaciones entre textos que el piloto ya visita.

---

## Causa 3 — Nadie recorre el producto entero, nunca

El piloto está deliberadamente acotado al alcance del PR — por presupuesto de
builds (`BUILD-BUDGET-1`) y por tiempo de Actions. Es una decisión razonable
por PR y **catastrófica en agregado**: cada PR pasa su rebanada, y el producto
completo no lo recorre nadie jamás.

La auditoría externa no fue más lista que nuestros agentes. Fue **más larga**:
un solo recorrido, dominio → competidores → prompts → escaneo → seis pantallas →
acciones → ajustes → precios, con la memoria de todo lo anterior puesta. Casi
todos los P0 son fallos de continuidad, y la continuidad es lo único que nuestra
cadencia por PR no puede producir.

> **Corrección C — Pasada de cliente nuevo, semanal, sobre producción.** Un
> `--journeys full` que recorre el producto entero de un tirón, con las
> aserciones cruzadas de la Corrección B, en `schedule` semanal + antes de cada
> fase de lanzamiento. No sustituye al piloto por PR: mide otra cosa.

---

## Causa 4 — El piloto tiene prohibido pulsar exactamente los botones que fallaban

Ésta es la más incómoda, y la más importante.

El piloto siempre activo es **estrictamente de lectura**, por *allow-list en
código*, no por convención (CLAUDE.md, "Pilot write scope"). Fue una decisión
correcta: evita que cada deploy de preview lance escaneos reales y queme cuota.

Su consecuencia no escrita en ninguna parte: **la mitad del producto que
convierte diagnóstico en acción — generar FAQ, generar brief, generar
comparativa, exportar plan, marcar como hecho, activar seguimiento — es, por
diseño, invisible para nuestra única garantía automática de calidad.**

P0-04 no se nos escapó. **Estaba fuera del alcance por construcción**, y el
alcance nunca se revisó al crecer el producto por dentro de él. Escribimos la
regla cuando esa mitad no existía.

La lectura del código dice que esos flujos *no están muertos*:
`handleRewrite`, `handleDismiss` y `handleExport` existen, tienen estado de
carga y de error (`recommendations-client.tsx:388-422, 1070`). Lo que la
auditoría vio ("ni spinner, ni modal, ni documento, ni toast, ni error") admite
al menos tres lecturas — un `router.refresh()` lento sin acuse, un resultado que
aparece dentro de un panel plegado, o una descarga que el navegador agéntico
bloquea en silencio. **Y no sabemos cuál es porque nunca lo hemos ejercitado.**
Esa ignorancia es el hallazgo, no el bug.

> **Corrección D — `--journeys actions`, con efecto observable obligatorio.**
> Set de escritura nuevo sobre el proyecto reservado (`PILOT_WRITE_DOMAIN`,
> mismas tres cerraduras estructurales que ya rigen la escritura: objetivo
> dedicado, coste acotado, idempotente). Cada acción tiene que terminar en un
> **efecto observable en el DOM** — no basta con que no reviente. Y la regla
> nueva, en `CLAUDE.md`: *toda superficie interactiva que el piloto no puede
> alcanzar se declara explícitamente como no cubierta, en el propio informe de
> piloto*. Un hueco declarado es un riesgo; un hueco invisible es esto.

---

## Causa 5 — Registramos decisiones, no las premisas de las que dependen

`AUDIT-NO-BUTTON-1` (fundador, 2026-08-05) retiró el botón "Auditar ahora" de
Auditoría web. El razonamiento, literal en el código
(`web-audit/page.tsx:232-243`): *"la auditoría corre sola después de cada
escaneo desde AUDIT-AFTER-SCAN-1, así que el botón pedía trabajo ya hecho"*.

Era cierto. Y es cierto **sólo mientras el camino automático funcione siempre**.
El día que no funciona — que es el día de la auditoría, con el componente
técnico en N/A — la pantalla no tiene salida: ni botón, ni error, ni explicación.
El informe lo llama "callejón sin salida" y tiene razón, pero la causa no es
que se quitara el botón: es que **al quitar un camino de recuperación nadie
anotó de qué premisa quedaba colgando el producto, ni quién la revisa.**

Idéntica forma en P0-08: `/pricing` promete "Diario" en Pro, y
`recurring_scans_enabled` nace en `false` por proyecto (`lib/scan/cron.ts:255`),
así que la consola dice "Tu análisis de hoy no se repetirá" a alguien que paga
por que se repita. Cada mitad es defendible. Nadie era dueño de la unión.

> **Corrección E — Regla de premisa en el "Cierre de fase".** Toda fase que
> **retire un camino de recuperación** (un botón, un reintento manual, una
> salida de error) anota en el histórico, obligatoriamente: la premisa que la
> sostiene, qué la verifica hoy, y qué pantalla se queda sin salida si la
> premisa falla. Sin eso, la fase no está cerrada. Es una línea más en un
> apartado que ya existe y ya es obligatorio.

---

## Causa 6 — Ningún mecanismo compara lo que prometemos con lo que hay

Precios, portada, FAQ, documentación y producto son zonas distintas, con reglas
distintas y agentes distintos (`growth-content` escribe la promesa; `frontend`
implementa la capacidad). **Nada cruza las dos.**

Verificado: el precio de Pro está escrito a mano en `app/pricing/plans-data.ts`,
otra vez en el `metadata` de `app/pricing/page.tsx:34`, otra vez en
`components/landing/session-ctas.tsx:74`, otra vez en dos comparativas y otra vez
en los tests de ajustes. Cinco fuentes, ningún contrato. P0-06 no es un
despiste: es la consecuencia inevitable de esa forma.

P0-05 (la home promete auditoría ejecutable) y P0-08 (pricing promete diario)
son el mismo agujero visto desde otro ángulo.

> **Corrección F — `lib/plans/catalog.ts` como fuente única, con test de
> paridad de promesas.** Precio, promo, días de prueba, tope de prompts, tope de
> dominios, motores y cadencia se declaran una vez y se leen desde la portada,
> `/pricing`, la FAQ, los docs, Ajustes y el checkout. `tests/promise-parity.test.ts`
> falla si alguien vuelve a escribir "179" a mano. Detalle en la Fase 2 del plan.

---

## Causa 7 — Quince agentes colaboradores y ningún adversario

`director`, `qa`, `ux-alignment`, `ux-pilot`, `core-flow`… todos parten de
**nuestro** contexto, **nuestro** vocabulario y **nuestra** intención. Internamente
decimos "prompts" para hablar de respuestas desde hace meses, así que "45
prompts" en Competidores nos parece bien escrito a todos. Un auditor sin contexto
lee la etiqueta literalmente, porque es lo único que tiene.

`qa` busca regresiones contra lo que el PR prometía. `ux-pilot` busca
infidelidad contra el diseño aprobado. **Nadie busca que el producto sea falso**,
y para eso hace falta no compartir nuestras suposiciones.

> **Corrección G — Agente `product-auditor` (red team), con contexto negado.**
> Se ejecuta contra el preview o producción **sin leer el repo**: sin CLAUDE.md,
> sin histórico, sin las acceptance criteria del PR. Su mandato es el del informe
> externo: leer cada etiqueta al pie de la letra, perseguir cada CTA hasta un
> efecto observable, cruzar cada promesa pública contra el producto, y no aceptar
> ninguna cifra sin denominador. Cadencia: mensual y antes de cada fase de
> lanzamiento. Su valor depende por completo de que no le demos contexto — si lo
> incorporamos al flujo normal de PR, se convierte en otro colaborador y deja de
> servir.

---

## Causa 8 — Aprendemos de cada incidente arreglando su forma exacta, nunca su clase

Es el patrón visible en todo el histórico. El piloto pasó en verde sobre
capturas vacías (2026-08-02) → añadimos `ContentExpectation`. El piloto se
saltaba a sí mismo (§120) → arreglamos el lookup del PR. El cajón móvil se
pulsaba sin hidratar (§136) → esperamos hidratación. El piloto elegía proyecto
por un enlace retirado (§138) → cambiamos el selector.

Cada corrección es buena y **ninguna sube un nivel de abstracción**. La clase
compartida de todas ellas es *"el piloto reportó verde sobre algo que no había
visto de verdad"*, y la respuesta de clase — que el piloto declare
explícitamente **qué no ha podido ver**, y que eso sea parte del veredicto — sólo
existe hoy como prosa en el Human Gate, no como salida del arnés.

> **Corrección H — La cobertura no vista es una salida del piloto, no una
> promesa.** Cada pasada emite la lista de controles que existían en la página y
> **no** ha ejercitado, y de pantallas alcanzables que no ha visitado. Un
> `PILOT PASS` con esa lista vacía es raro y sospechoso; con la lista llena es
> honesto y accionable. Es la generalización que llevamos cinco incidentes sin
> escribir.

---

## Resumen de correcciones

| # | Corrección | Tipo | Dónde vive | Fase |
|---|---|---|---|---|
| A | Contrato de métricas + test de coherencia cruzada | Código | `lib/metrics/`, `tests/metric-contract.test.ts` | Fase 1 |
| B | Aserciones semánticas cruzadas en el piloto | Arnés | `tests/pilot/journeys/` | Fase 1 |
| C | Pasada de cliente nuevo, semanal, extremo a extremo | Arnés | `--journeys full` + `schedule` | Fase 3 |
| D | `--journeys actions` con efecto observable obligatorio | Arnés | `tests/pilot/journeys/write/` | Fase 0 |
| E | Regla de premisa al retirar un camino de recuperación | Proceso | `CLAUDE.md`, "Cierre de fase" | Fase 0 |
| F | Fuente única de plan/precio + test de paridad | Código | `lib/plans/catalog.ts` | Fase 2 |
| G | Agente `product-auditor` sin contexto del repo | Agente | `.claude/agents/product-auditor.md` | Fase 2 |
| H | La cobertura no vista es salida del piloto | Arnés | `docs/agentic-user-pilot.md` | Fase 3 |

Las tres que más devuelven por lo que cuestan son **D**, **A** y **G**: D cierra
un agujero que hoy cubre la mitad del producto, A convierte el fallo más caro en
imposible por construcción, y G es lo único de esta lista que puede encontrar la
*próxima* clase de fallo en lugar de ésta.

---

## Lo que este documento NO propone

- **No proponemos más agentes especialistas.** El problema no fue falta de
  criterio por zona: fue que nadie miraba entre zonas. Un agente más reparte el
  mismo hueco entre más gente.
- **No proponemos quitar el alcance por PR del piloto.** Es correcto y barato.
  Lo que faltaba era algo *además*, con otra cadencia.
- **No proponemos abrir el piloto siempre-activo a escritura.** Las tres
  cerraduras estructurales del set de escritura siguen siendo la respuesta
  correcta; lo que cambia es que ese set ahora cubre las acciones.
