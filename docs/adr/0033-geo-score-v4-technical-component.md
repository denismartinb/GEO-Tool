# ADR 0033 — GeoScore v4: la nota técnica entra en el score, y la varianza baja por diseño

- **Estado:** **aceptado** — aprobado por el fundador el 2026-08-05
  (*"Desarrolla las 4 fases"*, sobre el plan por fases de ADR 0032 §4)
- **Fecha:** 2026-08-05
- **Fase:** GEO-SCORE-V4
- **Supersede:** los pesos de ADR 0015 (composite v2) tal como los dejó ADR 0026.
  No supersede su *significado*: los cuatro componentes existentes miden
  exactamente lo mismo que medían.

> `.claude/rules/scoring.md`: *"Ninguna fórmula se toca sin un ADR nuevo."*
> Este es ese ADR, y a diferencia de ADR 0031 **sí decide**.

---

## 1 · Qué se decide

1. El GeoScore incorpora un quinto componente, **`technical`**, con peso
   **0,20**: la nota de salud técnica del sitio
   (`web_audit_snapshots.readiness_score`).
2. Los cuatro componentes existentes **conservan sus proporciones v3 exactas**,
   escalados por `1 − 0,20`:

   | Componente | v3 | v4 | Comprobación |
   |---|---|---|---|
   | `presence` | .40 | **.32** | .32 / .80 = .40 |
   | `prominence` | .25 | **.20** | .20 / .80 = .25 |
   | `standing` | .20 | **.16** | .16 / .80 = .20 |
   | `authority` | .15 | **.12** | .12 / .80 = .15 |
   | `technical` | — | **.20** | nuevo |

3. `COMPOSITE_VERSION` pasa a `geo-score-v4`; `SCORING_VERSION` a
   `phase9-geo-score-v4`.
4. Las bandas (70 / 40) **no se tocan**.

## 2 · Por qué la nota técnica va dentro y no al lado

Decisión de producto del fundador, 2026-08-05: *"considero que una web esté
adaptada técnicamente al mundo de los motores de IA es crítico y fundamental
para que el resto de mejoras de GeoScore funcione"*.

El argumento es de dependencia causal, no de gusto: una web que los motores no
pueden leer limpiamente no puede beneficiarse de ninguna otra mejora GEO. Un
producto que puntúa alto el resultado observado mientras ignora la condición
que lo hace posible mide el síntoma y calla la causa.

**Y hay un segundo motivo, que es el que hace que sea seguro darle peso real:
`readiness_score` es determinista.** Se calcula con comprobaciones puras de
cadena y regex (`lib/web-audit/page-checks.ts`), sin LLM en ninguna parte del
cálculo. La misma web da el mismo número. Todos los demás componentes miden
respuestas vivas de LLM sobre recuperación no determinista.

Consecuencia mecánica, y es la razón por la que esta fase sirve a la prioridad
del fundador (*"que esa métrica sea lo menos variable posible"*): dar peso `w`
a un componente determinista escala la parte volátil del compuesto por
`1 − w`. Con `w = 0,20`, **la desviación típica que el ruido de los LLM
imprime en el score baja un 20 %**, encima de todo lo que hacen las Fases A y
B. No es un argumento: está aserido en
`lib/scoring/run-scoring.test.ts` ("damps run-to-run movement by exactly the
technical weight").

## 3 · Por qué estos pesos y no otros

**Esto no es una recalibración, y la distinción es la que sostiene el ADR.**

ADR 0031 dejó fijado que los cuatro pesos actuales no se han validado nunca
contra la distribución real de proyectos, que sólo los runs desde el
2026-08-05 sirven para hacerlo, y que a día de hoy ese conjunto es un puñado.
También fijó de antemano un criterio: **cambiar medición y pesos a la vez está
prohibido**, porque ningún efecto sería atribuible.

Escalar los cuatro por 0,80 respeta ese criterio al pie de la letra: sus pesos
**relativos** quedan intactos, así que cualquier movimiento del compuesto es
atribuible al componente nuevo y sólo a él. La recalibración de los cuatro
sigue pendiente y sigue bloqueada por datos, exactamente donde ADR 0031 la
dejó.

De esa construcción sale una propiedad que vale la pena declarar porque es la
garantía para el usuario existente:

> **Si `technical` no está, la renormalización devuelve exactamente
> .40/.25/.20/.15.** Un proyecto sin auditoría puntúa idéntico a v3. El cambio
> es **estrictamente aditivo**: a nadie se le mueve el número por un peso,
> sólo por una medición nueva y real de su propio sitio.

El 0,20 concreto: es el punto medio del envelope 0,15–0,25 que ADR 0032 razonó
("importante sin dominar"), y mantiene `presence` como el mayor peso
individual (.32). Que `presence` siga mandando es una salvaguarda de producto,
no estética: un GeoScore alto con la marca invisible en las respuestas de IA
sería exactamente el *fake product behavior* que `CLAUDE.md` prohíbe.

**Lo que este 0,20 no es: un número derivado de datos.** Es una decisión de
producto razonada, tomada a sabiendas de que la validación empírica no existe
todavía. Cuando ADR 0031 se pueda ejecutar, los cinco pesos entran juntos en
esa medición.

## 4 · El problema del momento, y cómo se resuelve

La auditoría corre **después** del escaneo (ADR 0027) y con reintentos su
ventana llega a ~12,5 h. Cuando un run se puntúa por primera vez, su propia
auditoría casi nunca existe. Tres opciones y la elegida:

- Bloquear la puntuación hasta que llegue la auditoría → el usuario mira un
  escaneo terminado sin score. Rechazada.
- Puntuar sin `technical` y re-puntuar al llegar → el número publicado **salta
  a la vista**. Es justo el fallo que esta fase existe para eliminar.
  Rechazada como ruta principal.
- **Elegida:** puntuar contra el snapshot más reciente del proyecto, y
  re-puntuar contra el snapshot propio del run cuando aterrice.

La salud técnica de un sitio no cambia en los minutos que van de un escaneo a
su auditoría salvo que el dueño despliegue, así que la re-puntuación es
normalmente un no-op; y cuando **no** lo es, el sitio cambió de verdad y el
movimiento es la señal que este componente existe para capturar.

Reglas duras del resolutor (`lib/scoring/geo-score-technical.ts`):

- Gana siempre el snapshot cuyo `scan_id` es este run.
- Si no, el más reciente **anterior** al run, dentro de 30 días.
- **Jamás un snapshot posterior perteneciente a otro run.** Aceptarlos haría
  que el score de un run histórico cambiara cada vez que un escaneo posterior
  audita el sitio: reescribir la historia en silencio, la misma objeción que
  ADR 0026 registra contra rellenar datos de posición hacia atrás.
- La ventana de 30 días es deliberadamente generosa. El fallo de una ventana
  **corta** es el que duele: el componente se cae, los pesos renormalizan y el
  score escalona por un motivo ajeno al sitio y a las respuestas — fabricando
  la discontinuidad V4/V5 de ADR 0032. El fallo de una ventana larga es
  puntuar contra una nota algo vieja: más raro y más leve.

El primer escaneo de un proyecto nuevo no tiene snapshot previo, así que
`technical` se cae y los otros cuatro renormalizan a sus pesos v3. No cuesta
estabilidad: en un primer escaneo no hay run anterior con el que comparar.

**Limitación heredada, declarada porque ahora pesa más que antes.** Los dos
núcleos de auditoría derivan su objetivo solos —"la última ejecución
completada de ESTE proyecto"— e ignoran el `run_id` del trabajo, que sólo es
clave de deduplicado (`.claude/rules/web-audit.md`). Si la auditoría del run A
se retrasa y el run B termina antes, el snapshot se persiste con
`scan_id = B`: **el run A no llega a tener snapshot propio nunca** y se queda
con el del vecino anterior, o sin componente. Antes esto sólo despistaba en la
pantalla de Auditoría web; ahora deja el score publicado de A ligeramente
desfasado respecto a lo que su propia auditoría habría dicho. No fabrica
ninguna discontinuidad visible —`compareRuns` rehúsa el delta si `inputs_used`
cambia—, pero es un desfase silencioso y conviene que la próxima sesión lo sepa
antes de tocar esta ruta.

## 5 · Fase B — cobertura de motores

Un job de prompt se da por bueno **si al menos un motor responde**, y un motor
caído no escribe fila. Así que una caída transitoria de proveedor no falla
nada: encoge la muestra en silencio. Reproducido contra el scorer real, misma
realidad de fondo: `gemini+openai+claude` → 71,67 (4 componentes);
`claude` sólo → 84,31 (3 componentes, `authority` caído). **Casi 13 puntos.**

`lib/scan/engine-coverage.ts` compara los motores que el plan prometía con los
que produjeron filas y persiste el veredicto en
`details_json.geo_score.engine_coverage`.

**No cambia el score.** Un run parcial puntúa sobre exactamente las filas que
tiene; fabricar las que faltan, o contar como "no mención" a un motor que
nunca contestó, sería inventar datos. Lo que cambia es que la medición deja de
presentarse como completa cuando no lo es.

## 6 · Coste asumido: la frontera de versión

Un cambio de `composite_version` significa que **`compareRuns` (ADR 0024)
rehúsa todo delta que cruce la frontera**. Ningún proyecto verá "vs. escaneo
anterior" en su primer escaneo v4. Es correcto —los dos números miden cosas
distintas— y es un coste real, decidido con los ojos abiertos, exactamente
como ADR 0031 anticipó para la recalibración.

## 7 · La objeción registrada, tratada de frente

El histórico decidió dos veces **no** mezclar técnica con resultado:

- log §17 decisión 4: las proyecciones de puntos van sobre `readiness_score`,
  *"nunca una cifra sobre el score global, que mezcla contenido (no
  controlable) con técnica"*.
- log §22 decisión 1: la nota técnica a una columna del GeoScore *"se lee como
  una segunda puntuación"*.

Este ADR va en contra de ese criterio **a sabiendas**, por decisión de producto
del fundador. El GeoScore pasa de medir *resultado observado* a medir
*resultado + preparación*. Ninguna de las dos decisiones anteriores se borra:
quedan superadas por ésta y así están marcadas.

El coste semántico se paga con transparencia, y esto es una obligación, no una
intención: **allí donde se muestre el GeoScore tiene que poder verse su
desglose por componentes**, para que "subió porque arreglaste la web" y "subió
porque las IAs te citan más" sean distinguibles. Un compuesto que mezcla dos
naturalezas sin desglose visible es un número que no se puede accionar.

**Qué cumple hoy esa obligación y qué no** —dicho aquí para que el ADR no
afirme de más—: la Visión general renderiza el desglose del escaneo más
reciente, con el valor de cada componente y el motivo de los que se caen.

**Los pesos no se muestran** (decisión del fundador, 2026-08-05). La
obligación es que se pueda ver *qué componente movió el score*, y para eso
basta el valor; publicar además cinco porcentajes convertía la tarjeta en una
lección de metodología en la pantalla principal. Los pesos siguen persistidos
en `details_json` y siguen siendo los renormalizados reales — la regla de ADR
0017 (no publicar el peso nominal) sigue vigente para cualquier superficie que
decida mostrarlos.
**La pantalla de Escaneos sigue publicando el GeoScore de cada run histórico
como número suelto, sin desglose ni enlace a uno.** Es el hueco declarado de
esta fase, no una excepción a la regla: la obligación sigue en pie y cerrarla
es trabajo pendiente (log §29, "Pendiente conocido").

## 8 · Lo que este ADR NO hace

- **No recalibra los cuatro componentes existentes.** Sigue siendo ADR 0031 y
  sigue bloqueado por datos.
- **No toca las bandas** 70/40.
- **No toca la capa de fiabilidad.** Margen de Wilson, suelo de muestra y
  `resolveDelta` siguen siendo obligatorios (ADR 0024, DELTA-GUARD-1).
- **No cambia qué planes tienen auditoría web.** La puerta Pro es una frontera
  comercial (`.claude/rules/web-audit.md`) y moverla es decisión del fundador,
  no un efecto colateral de esta fase. **Consecuencia que hay que mirar de
  frente: en los planes sin auditoría el componente se cae siempre, así que su
  GeoScore es el de cuatro componentes — v3 en la práctica.** Extender una
  auditoría *sólo técnica* (que no gasta LLM) a todos los planes es la
  recomendación de ADR 0032 §4 C.2 y queda pendiente de decisión explícita.
- **No repuntúa runs históricos.** Sin backfill, misma postura que ADR 0026.

## 9 · Fase D — el score de ventana

`lib/scoring/score-window.ts` calcula la **mediana** de los últimos K runs
comparables (K = 3). Existe porque queda una fuente de varianza que ninguna
fórmula elimina: los motores hacen recuperación viva, y `temperature: 0` no
controla lo que Google Search o `web_search` devuelven en cada llamada.

Mediana y no media: un run anómalo arrastra una media de 3 en un tercio de su
error, y la mediana lo ignora salvo que se sostenga. El coste, dicho: un
cambio real tarda `ceil(K/2)` escaneos en trasladarse del todo.

El módulo **rehúsa mezclar** runs que `compareRuns` no compararía (versión de
compuesto, componentes usados, tamaño de muestra). Una ventana que promediara
a través de esas fronteras blanquearía justo la incomparabilidad que ADR 0024
existe para exhibir, y lo haría dentro de un número presentado como *más*
fiable.

**Estado: el cálculo está implementado y probado; no se ha promovido todavía a
cifra principal de ninguna pantalla.** Cambiar el número que el usuario ve
como titular es una decisión de producto que merece su propia validación con
el fundador delante de la pantalla, no un efecto colateral de esta fase.

## Referencias

ADR 0015 (composite v2) · ADR 0024 (fiabilidad) · ADR 0026 (posición
condicionada) · ADR 0027 (auditoría post-escaneo) · ADR 0029 (extracción) ·
ADR 0030 (suelo de muestra) · ADR 0031 (calibración, propuesta) · ADR 0032
(análisis de varianza y plan por fases) ·
`docs/geo-score-variability-2026-08.md` · log §17, §22.
