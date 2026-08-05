# Histórico de decisiones de diseño — GenScore

> Complementa `docs/brand/brand-guidelines.md` (sistema de identidad: logo,
> paleta, tipografía). Este documento es un **log cronológico por zona** de
> decisiones de layout/UX ya implementadas y aprobadas por el fundador —
> "qué se decidió y por qué", para que futuras sesiones no las
> reabran ni las contradigan sin darse cuenta. Se amplía por fase; no se
> reescribe retroactivamente salvo para marcar una decisión como
> **superseded** por una posterior.
>
> Formato por entrada: Zona → Estado → Decisiones finales → Pendiente/roto
> conocido → Referencias.

---

## 1. Landing de marketing (`app/page.tsx`, `/pricing`, `/geo`, `/blog`, legal)

**Estado: parcialmente migrado a identidad v3.**

Decisiones finales:
- Logo real (`BrandLogo`/`BrandMark`, v3) en los 10 puntos de la landing/auth
  que antes usaban CSS `.brand-mark` + `.brand-name` a mano (BRAND-2).
- Sección de confianza: logos de empresas ficticias sustituidos por los
  motores de IA reales que analiza el producto (Gemini, ChatGPT, Claude) —
  no se readmite ningún logo de cliente/empresa inventado aquí.
- El nav mobile de la landing (`.lp-mobnav`) comparte deliberadamente el
  mismo lenguaje visual que el drawer del sidebar de consola (`.sb`,
  `.mob-scrim`) — mismo patrón de apertura/cierre, incluso siendo
  superficies de código distintas.
- El hero de producto (`.lp-shot`) reutiliza componentes reales de consola
  (Gauge, KPI cards) como "captura", no una maqueta estática — coherente con
  "no fake product behavior".

Pendiente / roto conocido:
- `.lp-h1 .grad` (acento degradado del titular hero) **sigue en la paleta
  v2** (`#4f46e5 → #7c3aed → #0d9488`, índigo/violeta/teal), mientras que
  `.lp-h1-accent` ya usa `var(--brand-blue)` (v3) — la landing tiene hoy una
  mezcla v2/v3 en su titular principal. No tocar sin Task Intake: es
  visible, de alto tráfico, y el criterio final (¿retirar el degradado o
  llevarlo a azul/navy v3?) no se ha decidido todavía.
- Decisión explícita (2026-07-24, ver §3 abajo): el estilo "hero" de la
  landing (tipografía Bricolage a gran escala, aurora de fondo,
  composición centrada) **no se lleva a las pantallas operativas de
  consola** (Overview, Prompts, Competidores…) — esas deben seguir densas y
  funcionales. Sí es candidato razonable para onboarding/estados vacíos de
  primer uso (no implementado todavía, solo evaluado).

---

## 2. Consola general — repintado por zonas (BRAND-5b)

**Estado: en curso, zona por zona (no es un repintado global de una vez).**

Decisiones finales:
- Mecanismo de rollout elegido: wrapper de **remapeo de variables CSS**
  (patrón `.ov2-scope`, `app/globals.css`) — una clase que redefine
  `--ink`/`--accent`/`--line`/etc. localmente para que los componentes
  compartidos (`.card`, `.wide-stat`, `Gauge`, `Delta`) repinten solo dentro
  de esa zona sin tocar sus estilos globales ni afectar a otras pantallas.
  Es el patrón a reutilizar cuando se aborde el repintado de Prompts,
  Competidores, etc. — no reinventar otro mecanismo por zona.
- Tipografía: Bricolage Grotesque para titulares/números héroe, Figtree
  para cuerpo/UI, ya cargadas globalmente vía `next/font/google`
  (`app/layout.tsx`), pero el **fallback base sigue siendo Hanken Grotesk**
  (`body { font-family: "Hanken Grotesk", ... }`, `app/globals.css`) hasta
  que la última zona pendiente esté migrada — no retirar el import de
  Hanken antes de eso (saltaría a fuente sin estilo en las zonas aún no
  migradas).
- Zona completada en esta sesión: **Overview** (ver §4). Resto de zonas
  (Prompts, Competidores, Recomendaciones, Escaneos, Ajustes, Auditoría
  web) siguen pendientes de repintado — tarea `#7` en el tracker de la
  sesión, estado `in_progress`.

---

## 3. Menú y cabeceras de consola (BRAND-5b-mobile-header, 2026-07-24)

**Estado: implementado y mergeado (PR #257).**

Decisiones finales (sustituyen cualquier propuesta anterior en los
artifacts de exploración — ver "Contexto de descarte" abajo):

1. **Cabecera de app (nivel `WorkspaceTopbar`) en móvil: puramente
   navegacional.** Hamburguesa (izq.) · logo GenScore centrado (SVG real,
   `BrandLogo size=20`, overlay `pointer-events:none` para no bloquear los
   controles) · campana (der.). No lleva título de sección, ni marca, ni
   dominio, ni fecha de escaneo — evita duplicar lo que ya muestra el
   sticky-header de cada página.
2. **El contexto vive entero en el sticky-header de cada página**
   (`.ov-sticky-header` y equivalentes): título de sección + pill de fecha
   de escaneo en la MISMA fila (no una fila propia a ancho completo — eso
   se corrigió explícitamente tras feedback de que "la pill queda
   innecesariamente abajo"), segunda línea con marca · dominio · país/idioma.
3. **Formato de menú: drawer lateral (V1)**, el mecanismo que ya existía en
   producción (`useMobileShell`, `.sb` slide-out) — se evaluaron y
   descartaron pantalla completa (V2) y bottom-sheet (V3) en los mockups de
   exploración; no se llevó ninguna de las dos a producción.
4. **Acceso a la cuenta: un único punto de entrada, enlace directo, sin
   desplegable.** `.user-chip` en el pie del sidebar (avatar-iniciales +
   email, `<Link>` a `/dashboard/settings/profile`) — ya cumplía esto antes
   de esta fase, así que no se reconstruyó, solo se confirmó como el
   patrón definitivo.
5. Se **eliminó `accountLinks`** ("Ajustes de cuenta" / "Plan y
   facturación") de la lista de navegación principal del drawer — quedaban
   duplicados con el punto 4. El plan de facturación vive dentro de
   Ajustes de cuenta, no necesita entrada propia.
6. Se eliminó el botón "globo" (popover de meta-info) que solo existía en
   móvil — quedó redundante en cuanto el sticky-header de cada página pasó
   a llevar esa misma info (punto 2).

Contexto de descarte (para que no se reproponga sin motivo nuevo):
- Se exploraron y descartaron: cabecera móvil con título+fecha+marca/dominio
  incrustados en la barra de app (primera versión de esta misma fase,
  revertida tras feedback "el header y la cabecera del body es redundante");
  un desplegable de cuenta con "Ajustes" + "Plan y facturación" como filas
  separadas (innecesario, el plan ya está dentro de ajustes).

Pendiente / roto conocido:
- Ninguno abierto de esta fase. `pnpm test` 710/710 y `pnpm run validate`
  en verde en el momento del merge.

---

## 4. Página de Overview (Visión general)

**Estado: implementado y mergeado (PR #255 + fixes posteriores).**

Decisiones finales:
- Icono de ChatGPT: rosetón de seis círculos en el verde real de ChatGPT
  (no una copia literal del logotipo) — mismo criterio que el resto de
  `EngineGlyph`: "glifos no literales, reconocibles, no un pixel-copy de
  ninguna marca de proveedor".
- Espaciado: aumentado el "aire" entre elementos en los bloques `ov2-*` tras
  feedback directo del fundador contra mockup.
- Bloque "Oportunidades": conecta la metodología real de puntos
  potenciales (RECS-POTENTIAL-1, `docs/adr/0017`) al layout — número héroe
  "+N Puntos potenciales" (con fallback al recuento de recomendaciones
  reales cuando el cálculo no es cuantificable o la confianza es baja, i.e.
  el bloque nunca oculta que hay recomendaciones activas, solo el número si
  no es fiable); cada ítem muestra el valor partido en número grande
  (Bricolage) + unidad "pt" pequeña; punto de color `var(--pos)` (verde)
  para ítems de bajo esfuerzo/"rápida" vs `var(--brand-neg)` (rojo) para el
  resto; badge "rápida" en verde para ítems de bajo esfuerzo.
- Panorámica competitiva: barras y lista ranked unificadas para leer del
  mismo array de filas (`panoramaRows`) — antes podían mostrar conjuntos de
  entidades distintos (bug real, no decisión de marca, pero afecta
  directamente a la fiabilidad visual del bloque).
- **Emparejamiento de nombres tolerante a acentos/puntuación**
  (`normalizeEntityName`, PR #258) entre `brand_position.ranking` y
  `project_competitors.name` — la igualdad exacta previa perdía el
  `domain` real de la fila ante cualquier variación de formato.
- **Dominio de competidores históricos** (PR #258): el panorama resuelve
  favicon a partir de una lectura adicional sin filtro `is_active` cuando
  el match activo falla — un dominio real no desaparece porque se
  desactive el tracking. `sov` se mantiene en 0 para ese caso (no hay
  cifra de cuota de voz vigente para una entidad ya no trackeada); la
  query activa que alimenta SOV/menciones/"Ver todo" no se toca. Correcto
  en diseño, pero no ayuda si el competidor fue directamente borrado (sin
  desactivar) — ver nota en "Pendiente/roto conocido".
- **Aviso de "competidor no trackeado visible"** (PR #258, corregido tras
  ver datos reales — ver `docs/director-strategy.md` para el detalle
  completo): primer intento comparaba el conjunto completo de nombres
  activos contra el ranking, gateado a solapamiento cero — umbral
  equivocado para una lista que se REDUCE (no se sustituye), así que
  nunca disparaba pese al síntoma visible. Sustituido por
  `panoramaHasUntrackedEntity`: comprueba directamente si alguna fila
  no-marca ya renderizada en el panorama se queda sin dominio resoluble.
  Señal exacta sobre lo que se ve en pantalla, no una heurística sobre
  todo el conjunto. Incluye CTA real "Volver a escanear"
  (`ScanTriggerButton`).

Pendiente / roto conocido:
- **Bug de tokens CSS sin definir**: `--p-high` / `--p-med` / `--p-low` se
  usan en `.ie-dot.on-h/.on-m` (componente `DotMeter`) y en
  `.rec-rank.high/.med/.low` (tarjetas de la página de Recomendaciones)
  pero **no están definidos en ningún `:root`** de `app/globals.css`. Se
  corrigió solo dentro del bloque Oportunidades (que ya no usa esos
  tokens, ver arriba) — el mismo bug sigue vivo en `DotMeter` y en
  `.rec-card-preview` de Recomendaciones. No agendado todavía.
- El mismo patrón de igualdad exacta (pre-`normalizeEntityName`) sigue
  vivo en `competitorMentionCounts` (tasa de mención/SOV agregado de la
  tabla de competidores) — deliberadamente fuera de alcance de PR #258
  porque tocar esos números requiere validar el impacto en scoring por
  separado, no solo en presentación.
- **No hay gestión de competidores post-creación en la app**: descubierto
  al diagnosticar el caso Ikea. `createCompetitor`/`updateCompetitor`/
  `deactivateCompetitor` existen en `actions.ts` pero no están conectadas
  a ninguna UI real — la página de Competidores es de solo lectura. Los
  cambios a la lista de un proyecto ya creado solo se pueden hacer editando
  Supabase directamente, lo que además borra el rastro histórico (no queda
  ninguna fila desactivada que recuperar). No es una decisión de marca,
  pero es un gap de producto real que vale la pena que el fundador conozca.

**OV-DESKTOP-1 (2026-07-30, Task Intake aprobado el mismo día):** BRAND-5b
(entrada anterior) implementó `.ov2-scope` como una columna fija de 460px
(`max-width: 460px; margin: 0 auto`) sin ninguna media query de escritorio
— el fundador reportó con captura real que en ~1512px de ancho la columna
usaba solo un 38% del espacio, con la 4.ª tarjeta del carrusel de KPIs
(`.ov2-kpi-car`) recortada visualmente y ~1,8 pantallas de scroll vertical
para datos que caben en una. Decisiones finales:
- Todas las reglas nuevas viven dentro de `@media (min-width: 900px|1200px|
  1600px)` — por debajo de 900px el CSS aplicado es **byte-idéntico** al de
  BRAND-5b (verificado renderizando la página con y sin este bloque a
  390px y diffeando el output). El diseño mobile aprobado no se reabre.
- ≥900px: la columna sube a 640px y `.ov2-kpi-car` pasa de carrusel con
  scroll a rejilla 2×2 (arregla el recorte reportado).
- ≥1200px: layout de consola en dos partes — banda superior (panel de
  score a la izquierda + los 4 KPIs como bloque 2×2 a la derecha, en vez
  de apilados bajo el gauge) y dos columnas debajo (motores + panorámica
  a la izquierda, "Oportunidades" como raíl fijo `position: sticky` a la
  derecha, seasoned como el patrón "acción a la vista mientras analizas").
  Techo de columna en 1200px, y 1280px en pantallas ≥1600px — no crece sin
  límite en monitores ultra-anchos.
- Mecanismo: 4 wrappers nuevos en JSX (`.ov2-hero`, `.ov2-hero-kpis`,
  `.ov2-cols`, `.ov2-main`/`.ov2-rail`), todos `display: contents` por
  defecto — cero efecto en el flujo mobile, se convierten en grid solo
  dentro de las media queries de escritorio. Mismo principio de
  "remapeo/wrapper sin tocar el componente" que `.ov2-scope` (§2).
- Verificado el caso sin recomendaciones activas: `.ov2-rail` queda vacío
  pero la rejilla de 2 columnas no se rompe ni la columna de análisis se
  estira a ocupar el hueco (columnas de grid con ancho fijo, no `auto`).

Pendiente / roto conocido:
- Prompts (`.pr2-page`, PROMPTS-REDESIGN-1) tenía el mismo bug de columna
  fija a 460px sin desktop — corregido en `PROMPTS-DESKTOP-1`, ver §5. El
  resto de zonas (Competidores, Páginas citadas, Recomendaciones, Auditoría
  web, Escaneos) siguen en el layout pre-BRAND-5b (`.page`, 1320px) y no
  tienen este bug, pero por eso la consola hoy mezcla dos comportamientos
  de ancho — inconsistencia conocida, no corregida en este PR.

---

## 5. Página de Prompts

**Estado: v3 implementado (PR #260); capa de escritorio en
PROMPTS-DESKTOP-1 + PROMPTS-DESKTOP-2.**

**PROMPTS-DESKTOP-1 (2026-07-30, Task Intake aprobado el mismo día):**
mismo bug que OV-DESKTOP-1 (§4) — `.pr2-page` fija a 460px sin ninguna
media query de escritorio. A diferencia de Overview, Prompts no tiene
ningún elemento recortado (no hay carrusel): el único problema es una
columna estrecha y cada fila de prompt envolviéndose en 2 líneas cuando
sobra ancho. Decisiones finales:
- Todas las reglas nuevas viven dentro de `@media (min-width: 900px|
  1200px|1600px)` — byte-idéntico por debajo de 900px (mismo método de
  verificación que §4: render con y sin el bloque, diff de la captura).
- ≥900px: columna a 640px (mismo tramo tablet que Overview, para que la
  consola lea como un solo sistema de anchos).
- ≥1200px: cada fila de prompt cabe en una línea sin envolver, las
  etiquetas dejan de apilarse debajo del texto. El buscador
  (`.pr2-search`) se topa a 360px en vez de estirarse sin límite junto al
  botón — mismo patrón ya usado en `.pr-search` (toolbar de Citations).
- Mecanismo: solo CSS, sin wrappers nuevos en JSX — a diferencia de
  Overview, esta pantalla es una sola lista (acordeón de topics o lista
  plana), no varios widgets distintos, así que no hace falta ninguna
  reestructuración de grid.
- **Superseded por PROMPTS-DESKTOP-2** (abajo): los topes ≥1200px/≥1600px
  de esta fase eran 900px/1000px, ajustados de forma independiente para
  esta pantalla.

**PROMPTS-DESKTOP-2 (2026-07-30, Task Intake aprobado el mismo día,
founder con captura real de la pantalla estirada):**
- **Ancho de columna igualado al de Overview.** El fundador pidió
  explícitamente que Prompts use "el mismo ancho que la pantalla
  principal... para tener consistencia" — los topes ≥1200px/≥1600px de
  PROMPTS-DESKTOP-1 (900px/1000px) se sustituyen por los mismos valores
  exactos de `.ov2-scope` (1200px/1280px), en vez de un ajuste
  independiente por pantalla. **Pendiente explícito, no asumido aquí:**
  el resto de la consola (Competidores, Páginas citadas, Recomendaciones,
  Auditoría web, Escaneos) sigue en el sistema `.page` a 1320px — igualar
  de verdad *toda* la consola exige decidir hacia qué ancho converge el
  sistema entero y tocar esas 5 pantallas; no se ha hecho sin que el
  fundador lo confirme primero.
- **El drawer de detalle de prompt pasa a panel lateral en escritorio**
  (`min-width: 900px`): ancla a la derecha, `width: min(880px, 64vw)` con
  mínimo 560px (~58% a 1512px, dentro del 50-75% pedido), fondo atenuado
  visible a la izquierda. **Supersede parcialmente**, solo para
  escritorio, la decisión del 2026-07-24 (mismo comentario en
  `app/globals.css`) que descartó un panel lateral de 520px/95vw por
  dejar una franja gris — aquella prueba mezclaba un ancho fijo con un
  tope de viewport sin diferenciar por tamaño de pantalla; esta vez es
  un ancho real en porcentaje, con `min-width` explícito, y **solo
  aplica a partir de 900px** — en móvil el drawer sigue siendo
  full-screen exactamente como se decidió entonces (verificado
  byte-idéntico). Motivo del cambio: el fundador reportó con una
  captura real que el contenido (filas de ranking, tabla por motor),
  diseñado para una columna de ~460-900px, quedaba "muy estirado y
  demasiado poco contenido" al ocupar el 100% del ancho en una pantalla
  grande.

Pendiente / roto conocido:
- Unificar el ancho de todas las páginas de consola (`.page`/1320px) con
  el sistema `.ov2-scope`/`.pr2-page` (1200/1280px) — señalado en
  PROMPTS-DESKTOP-2 arriba. **Decidido en CITATIONS-REDESIGN-1 (ver §8):
  640/1200/1280px (los valores exactos de `.ov2-scope`/`.pr2-page`) es
  ahora el ancho estándar oficial para toda pantalla de consola nueva o
  rediseñada** — deja de ser una elección por pantalla. Migrar las
  pantallas que aún no lo usan (Competidores, Recomendaciones, Auditoría
  web, Escaneos) no se hace retroactivamente en este PR; cada una migra
  cuando le toque su propio rediseño.

---

## 6. Banda de madurez de datos (DATA-MATURITY-1, 2026-07-31)

**Origen:** el fundador señaló que hasta acumular varios escaneos no hay
tendencias/comparativas estadísticamente fiables, y el producto no lo
comunicaba — la KPI de tendencia en Overview salía vacía sin explicación,
leyendo como fallo en vez de progreso.

Decisiones:
- **Banda a sangre bajo la cabecera** (`.dmb-band`, 42px, una línea),
  renderizada una sola vez en `app/dashboard/layout.tsx` — no una tarjeta
  dentro del contenido, ni un `layout.tsx` nuevo a nivel de proyecto. Misma
  gramática visual que la banda pública "prueba 7 días Pro gratis": se lee
  como chrome de consola, no compite con el H1 de cada pantalla. Reutiliza
  el `usePathname()` + regex de projectId que ya usa `WorkspaceTopbar` para
  saber en qué proyecto está el usuario.
- **Umbral: 5 escaneos completados**, no días — la cadencia real depende del
  plan (diaria en Pro/Agencia/trial, semanal en Starter, `lib/scan/cron.ts`),
  así que contar escaneos es lo único que no miente entre planes. El
  contador ("Escaneo N de 5") y el medidor de segmentos vienen de
  `completedRunCountByProject`, ya calculado en `getWorkspaceCounters`; el
  "~N días"/"~N semanas" es la única estimación, derivada de la cadencia del
  plan, nunca una constante fija.
- **Copy no promete análisis en curso.** Se descartó "tu dominio se está
  analizando" (la propuesta inicial del fundador): con un GEO Score real ya
  en pantalla, esa frase se contradice con lo que el usuario está viendo. El
  copy final es "Tu histórico se está construyendo — las tendencias y la
  comparativa con tus competidores ganan fiabilidad con cada escaneo",
  válido tanto para cadencia diaria como semanal sin repetir la cadencia en
  dos sitios (el chip de ETA ya la dice).
- **Cuatro estados + dos silencios**, ver `lib/project-workspace.ts`
  (`computeDataMaturity`, función pura y testeada): acumulando (Pro/Agencia/
  Starter con seguimiento activo), sin seguimiento (CTA para activarlo —
  ver bloqueante abajo), Free (sin promesa de serie, único estado
  descartable), y oculta permanentemente al llegar a 5 escaneos o mientras
  hay un escaneo en curso (`firstscan-banner` ya cubre ese caso; duplicar
  mensajes de estado se descartó explícitamente).
- **Alternativa descartada:** tarjeta dentro del contenido
  (`.dmb-card`, reutilizando el lenguaje visual de `.firstscan-banner`) —
  cabe más copy pero ocupa 74px permanentes en cada pantalla y compite con
  el H1; no es la banda de consola que se pidió.

**Bloqueante conocido, fuera de esta fase:** el estado "sin seguimiento"
existe porque `recurring_scans_enabled` nace en `false`
(`0008_recurring_scans.sql`) — un proyecto nuevo no acumula historial por sí
solo hasta que el usuario activa el toggle (o la banda lo activa por él vía
el CTA, que reutiliza la server action `setRecurringScans` ya existente).
Activar el seguimiento por defecto en proyectos nuevos es una fase aparte
(`SCAN-DEFAULT-ON-1`): migración de schema + cambio de comportamiento del
scheduler, gates de CLAUDE.md, necesita su propia aprobación. Esta banda
funciona igual antes y después de ese cambio — el día que se apruebe, el
estado "sin seguimiento" simplemente deja de aparecer, sin tocar código.

---

## 7. Verificación visual de las pantallas (UX-PILOT-1, 2026-07-31)

**Estado: gate agéntico activo, ejecución local.**

Decisiones finales:
- Toda pantalla que cambie en un PR se verifica **en el preview real de
  Vercel, con sesión iniciada**, por el agente `ux-pilot`, antes de pedirle
  nada al fundador. La comparación visual deja de ser trabajo manual del
  fundador y pasa a ser un paso obligatorio del pipeline.
- Los tres viewports de referencia del producto quedan fijados como
  contrato de verificación: **375 / 768 / 1280 px**. Son los mismos que ya
  documentaba `qa.md`; ahora existen como configuración ejecutable
  (`playwright.config.ts`) y no sólo como prosa.
- Anclas de regresión fijas en cada pasada: Visión general, Prompts,
  Competidores, Recomendaciones y Escaneos — aunque el PR no las toque.
- El agente **mira las capturas** (visión) además de comprobar overflow
  horizontal, errores de consola y respuestas HTTP ≥400. La decisión
  explícita es que las aserciones cubren lo que una máquina puede saber con
  certeza, y el juicio de "esto se ve mal / esto no es lo que se pidió" lo
  mantiene el agente.
- Se retira el "frontend visual check" de `qa.md`: apuntaba a `localhost`,
  hacía `require('playwright')` con Playwright sin instalar, y no tenía
  sesión de Supabase. Era un gate que no podía fallar nunca — **superseded
  por esta entrada**.

Pendiente / roto conocido:
- El entorno remoto de Claude Code no puede alcanzar `*.vercel.app` (bloqueo
  de egress, `403` en CONNECT), así que la pasada del piloto se ejecuta hoy
  desde la sesión local del fundador. El harness devuelve
  `PILOT INCONCLUSIVE`, nunca un falso verde.
- Fase read-only: el piloto no lanza escaneos ni crea/borra proyectos. Las
  pantallas que sólo se pueden verificar escribiendo (crear proyecto, editar
  prompts, lanzar escaneo) siguen sin cobertura hasta UX-PILOT-2.
- El alta con confirmación por email no es verificable por el piloto (no
  tiene buzón); sigue siendo smoke manual del fundador.

Referencias: `docs/agentic-user-pilot.md`, `.claude/agents/ux-pilot.md`.

---

## 8. Página de Páginas citadas (CITATIONS-REDESIGN-1, 2026-08-01)

**Estado: implementado, Fase A (Task Intake aprobado el mismo día).**

**Origen:** auditoría de código encontró que la pantalla calculaba
`citationRows` (el ranking real de páginas citadas, con motor/categoría/
prompts) y `opportunityRows` (fuentes de terceros que citan a un rival y no
a la marca) enteros en el servidor y **nunca los pasaba al cliente** — la
UI solo mostraba una tabla agrupada por prompt, y del banner de
oportunidades únicamente se usaba `.length`. El fundador aportó además el
artículo de Semrush *"What Are AI Citations & How Do I Get Them?"* (30 jul
2025), cuya distinción **primera parte vs. terceros** (y si esos terceros
mencionan la marca favorablemente o a un rival en su lugar — su informe
"Source Impact Analysis") se adoptó como el marco de la sección de
"impacto", en vez de un esquema propio.

Decisiones finales:

- **Ancho de consola: adopta `.cit2-scope`/`.cit2-page`, los mismos valores
  exactos que `.ov2-scope`/`.pr2-page`** (460px base, 640px ≥900px, 1200px
  ≥1200px, 1280px ≥1600px) — mismo mecanismo de wrapper con remapeo de
  variables CSS. Por decisión explícita del fundador, **este ancho pasa a
  ser el estándar de toda pantalla de consola futura**, no una elección por
  pantalla (ver nota en §5 "Pendiente/roto conocido").
- **Tira de KPIs compacta**, una sola fila de seis celdas sin tarjeta
  individual por métrica (descartado un primer borrador con tarjetas
  grandes tipo `.ov2-kpi`, por pedir del fundador "más compacta"):
  Respuestas con cita, Citas totales, Citas propias, Páginas tuyas citadas,
  Dominios únicos, Puntuación de citas. "Respuestas con cita" rescata
  `citation_score_any_domain` (`run_scores.details_json`), que ya se
  calculaba y no se mostraba en ninguna pantalla.
- **Barra de "Impacto"**: tuyas / terceros a favor / terceros en contra /
  competidores / neutras, sobre el total de citas (no de páginas) —
  implementación pura y testeada en `aggregateCitations` (`impactBreakdown`,
  `lib/citations/aggregate-citations.ts`). "A favor"/"en contra" se derivan
  del `brandMentioned`/`competitors[]` que la fila ya tenía; es una
  clasificación a nivel de página (todas las citas de esa página caen en un
  único cubo), no por cada cita individual — documentado así en el propio
  tipo `ImpactBreakdown` para no reclamar más precisión de la que hay.
- **Donut de tipo de fuente**: clasificador determinista y acotado
  (`lib/citations/source-type.ts`, `classifySourceType`) — lista curada de
  dominios conocidos (Reddit/Quora/StackOverflow → comunidad; Wikipedia →
  enciclopedia; Trustpilot/G2/Rastreator/Kelisto… → comparador; Xataka/
  El País/ABC… → medio). Todo lo no reconocido cae en **"Sin clasificar"**,
  visible como su propio porcentaje — nunca repartido a ojo entre las
  demás categorías ni adivinado. Deliberadamente no exhaustivo: se amplía
  con datos reales, no se intenta cubrir todo de entrada.
- **Bloque de Oportunidades rescatado**: rescata `opportunityRows`
  (fuentes de terceros que citan a un rival y no a la marca), antes
  descartado tras calcularse. Enlaza a Auditoría web (`/web-audit`) al
  final — primer puente real entre las dos pantallas de diagnóstico, sin
  cruzar datos entre ellas todavía (eso sería su propia fase).
- **Fix de datos**: `resolveCitation` vaciaba la URL de *toda* cita
  `source: "grounding"` — una regla escrita para el redirect de Vertex de
  Gemini que también se llevaba por delante las URLs reales de ChatGPT
  (`url_citation`, ya la página final, nunca un redirect). Ahora se
  distingue por host: si la URL de la cita pertenece de verdad al dominio
  resuelto, se conserva y se usa como clave de deduplicación por página
  (como ya hacían las citas inline); si no (el redirect de Gemini), sigue
  vaciándose y deduplicando por dominio, sin cambio de comportamiento ahí.
- **Estado vacío reescrito** ("Este escaneo respondió sin citar fuentes"):
  el copy anterior ("Sin citas detectadas") leía como fallo del producto.
  Que un LLM responda desde su conocimiento preentrenado sin consultar la
  web es comportamiento normal, no un error — el artículo de Semrush lo
  documenta explícitamente. El copy ahora lo dice así.
- **Fila de página expandible**: al tocar una fila se listan los prompts
  (deduplicados) que la citaron — sustituye a la tabla agrupada por prompt
  que era la vista principal antes de este PR.
- **Avatar de dominio**: inicial sobre color determinista por hash del
  dominio (mismo criterio que el fallback de favicon del grid de dominios
  en Escaneos), no un fetch en vivo de favicon — evita el estado roto de
  una imagen que no carga para un dominio arbitrario citado por la IA.

Descartado explícitamente (para no reabrirlo sin motivo nuevo):
- **Gráfico de tendencia de cuota de citas** — estaba en el primer borrador
  (alternativa "C" del artifact de exploración) pero necesita histórico
  multi-escaneo y sus propios estados vacíos (no fiable con &lt;5 escaneos,
  mismo umbral que la banda de madurez de datos, DATA-MATURITY-1). Movido a
  **CITATIONS-TREND-1**, fase separada, todavía no implementada.
- **Persistir la página exacta de Gemini** (hoy solo se resuelve y guarda
  el dominio, aunque el pipeline sí resuelve la URL final antes de
  descartarla) — cambio en `lib/scan/extraction.ts`, fuera de esta fase
  por tocar el pipeline de escaneo; solo aplicaría a escaneos futuros.

**Revisión del fundador sobre datos reales (2026-08-01, movistar.es).** Tras
ver la pantalla con un escaneo real, correcciones aplicadas en el mismo PR:

- **Tira de KPIs: de 6 métricas a 3.** El mockup aprobado tenía 3; la
  implementación había subido a 6 (más una línea de totales por motor) sin
  pedirlo — deriva de alcance, señalada explícitamente por el fundador. Se
  quedan **Respuestas con cita · Citas totales · Citas propias**. Retiradas:
  *Puntuación de citas* (ya vive en Visión general, duplicarla aquí confunde),
  *Páginas tuyas citadas* (numéricamente casi idéntica a "Citas propias" en
  todos los escaneos reales) y *Dominios únicos* (los contadores de las
  pestañas de la lista ya responden eso mejor).
- **Retirada la línea "Gemini citó N fuentes · ChatGPT citó M"** — no estaba
  en el diseño aprobado.
- **Bucket "neutras" partido en dos, usando `other_brands_mentioned`**
  (campo que ya existía en `lib/extraction/schema.ts`, poblado por la
  extracción y hasta ahora sin usar en esta pantalla): "Terceros que
  mencionan otras marcas" (la respuesta nombró alguna marca, solo que no
  trackeada) vs. "Terceros que no mencionan ninguna marca". El fundador pidió
  renombrar el bucket a "otros competidores"; se implementó como "otras
  marcas" porque es lo que el dato afirma de verdad — un competidor no
  trackeado no está verificado como competidor. Un competidor **trackeado**
  siempre gana sobre este bucket (test 13), así que nunca hay doble conteo.
- **"Sin clasificar" → "Otras webs"** y lista curada de dominios ampliada de
  ~30 a ~90 entradas (medios españoles e internacionales, comparadores,
  redes/comunidades). El fundador reportó un 55% "Sin clasificar" que "da muy
  mala imagen": el problema era mitad cobertura, mitad etiqueta — la etiqueta
  sugería fallo del producto cuando describe un grupo real de long tail. La
  lista sigue siendo deliberadamente no exhaustiva y lo no reconocido nunca se
  adivina.
- **Eyebrow en las dos listas** (`.cit2-blk-eyebrow`): "Oportunidades ·
  subconjunto" y "Todas las fuentes · lista completa". El fundador no
  distinguía qué era cada tabla porque tenían formatos distintos y ningún
  rótulo que dijera qué subconjunto mostraban.

**Decisión final sobre el donut (2026-08-01):** el fundador zanjó la pregunta
abierta ("Otras webs 88%" hacía el donut casi inútil) — **"Otras webs" se
retira del donut por completo**, no se oculta el bloque cuando la cobertura
es baja. Los porcentajes restantes se recalculan como cuota del subconjunto
**clasificado**, no del total de citas, así que las porciones siempre suman
100% y el gráfico se mantiene legible aunque la mayoría de dominios reales
sea long tail sin reconocer. Framing explícito del fundador: "se trata de
dar un insight al usuario, no pasa nada porque no sea un dato exacto" — una
simplificación deliberada y aprobada por producto, no una imprecisión
colada. `sourceTypeBreakdown` (la agregación pura, con "unknown" incluido)
no cambia — el recorte es solo de presentación en `SourceDonut`. Si no queda
nada clasificado (0 fuentes reconocidas), el bloque entero se oculta en vez
de mostrar un donut vacío.

**Segunda revisión del fundador (2026-08-01, captura adicional).** Dos
cambios más, mismo PR:

- **Copy**: "N páginas citadas en el último escaneo" → "N páginas citadas en
  los prompts escaneados" — más preciso sobre qué agrega el número.
- **Las dos tablas ahora se comportan igual**: hasta esta revisión, solo la
  lista completa era expandible (mostraba los prompts que citaron esa
  página al hacer click); el bloque de Oportunidades era estático. Ahora
  ambas filas son botones que expanden el mismo panel de detalle
  (`PromptEvidenceList`, componente compartido). Además, el panel pasa de
  listar solo el texto del prompt a mostrar **la evidencia real**: la
  respuesta completa del modelo (`scan_prompt_results.raw_response_text`,
  seleccionada ahora en `citations/page.tsx` y propagada a través de
  `aggregateCitations` en `CitationRow.prompts[].rawResponseText`), no un
  fragmento inventado. Deduplicado por (motor, texto del prompt) — el mismo
  prompt respondido por dos motores distintos son dos evidencias reales
  distintas, no una sola.

**Gate reforzado a raíz de esta revisión:** `.claude/agents/ux-pilot.md` gana
una **checklist de fidelidad de diseño** de 6 puntos (¿se añadió algo no
aprobado? ¿falta algo? ¿hay etiquetas que un usuario nuevo no sabría definir?
¿métricas casi duplicadas? ¿algún valor real que se lea como producto roto?
¿la jerarquía es la aprobada?) y la regla explícita de que **una pantalla que
renderiza perfecta pero se ha desviado del diseño aprobado es `PILOT FAIL`,
no `PILOT PASS`**. El piloto había dado PASS a esta pantalla sin detectar que
tenía el doble de métricas que el mockup firmado.

**Tercera revisión del fundador (2026-08-01, captura de movistar.es).**

- **Tooltips en los 3 KPIs** (`InfoTip`, mismo componente ya usado en la
  columna "Marca mencionada" de Prompts) explicando qué mide cada uno —
  "Respuestas con cita" (% de respuestas de motores con búsqueda real que
  citaron algo), "Citas totales" (suma sobre todas las páginas), "Citas
  propias" (cuántas de esas citas son de `${brandLabel}`).
- **Reetiquetado + tooltips en la leyenda de "Impacto"**: "Terceros que
  mencionan a un rival y no a ti" y "Terceros que mencionan otras marcas"
  se reportaron como indistinguibles a simple vista. Renombrados a
  "Terceros que mencionan a un competidor tuyo" (marca trackeada) vs.
  "Terceros que mencionan otra marca" (marca no trackeada — puede ser un
  competidor real que aún no sigues), cada uno con su tooltip explicando la
  diferencia. Aplicado el mismo tratamiento a las 6 etiquetas del bucket,
  no solo a las dos confusas, por consistencia.
- **Atribución por prompt en el panel de evidencia**: el fundador expandió
  una fila con la etiqueta "Cita a un competidor" y la evidencia mostrada
  (la respuesta real del modelo) no mencionaba ningún rival — un caso
  reproducible de reclamo sin sustento visible. Causa: `row.competitors`
  se calculaba como unión de TODOS los prompts que citaron esa página; una
  fila con 5 prompts podía llevar la etiqueta "cita a un competidor" por
  uno solo de ellos, mientras el panel enseñaba evidencia de cualquiera de
  los 5 sin decir cuál. Arreglado: `CitationRow.prompts[]` ahora lleva
  `competitors`/`otherBrands` por entrada (scoped a ese `(prompt, provider)`
  concreto, no la unión de la fila), y el panel muestra una etiqueta
  "Menciona a X" / "Menciona X (marca no trackeada)" justo encima de la
  respuesta que la respalda — o ninguna etiqueta si esa respuesta en
  concreto no mencionó ninguna marca.
- **Hallazgo NO corregido en este PR, señalado al fundador explícitamente**:
  con la atribución por prompt ya visible, si el chip "Menciona a X" sigue
  apareciendo en una entrada cuya respuesta visiblemente no nombra a X, el
  problema ya no es de esta pantalla — es que `verifyMention`
  (`lib/scan/extraction.ts`, MENTION-VERIFY-1, ADR-0021) no está
  descartando esa mención pese a exigir un substring match contra el texto
  crudo. Investigarlo requiere tocar el pipeline de extracción/scoring,
  fuera del alcance de un rediseño de UI y de las áreas que este documento
  puede aprobar por su cuenta — necesita su propia fase con Task Intake.

Pendiente / roto conocido:
- El nombre "Páginas citadas" es, para las citas de Gemini, técnicamente
  "Dominios citados" hasta que se implemente la persistencia de URL exacta
  de arriba — se mantiene el nombre existente por ahora.
- Unificar el resto de la consola (Competidores, Recomendaciones, Auditoría
  web, Escaneos) al nuevo ancho estándar: no se hace en este PR, cada
  pantalla migra en su propio rediseño (ver nota en §5).
- **Posible fuga de `verifyMention`** (ver arriba) — la atribución por
  prompt ahora hace este tipo de caso visible y reproducible; si vuelve a
  aparecer, es una pista real para investigar el pipeline, no un fallo de
  esta pantalla.

**Harness del pilot ampliado para probar interacción, no solo render
(2026-08-02).** El fundador pidió pruebas de que el clic en el tooltip y en
las filas expandibles funcionaba de verdad, no solo que el icono/chevron
renderizaba — una captura de la pantalla cerrada nunca puede demostrar eso.
Nuevo test `tests/pilot/journeys/core-flow.spec.ts` ("citations KPI tooltip
and row expand actually work"): hace hover real sobre un `.info-tip` y
afirma que la burbuja se hace visible, hace clic real en una fila de cada
tabla y afirma que `.cit2-detail` aparece — con `expect(...).toBeVisible()`,
no solo una captura. Si la interacción no funciona, el test falla de verdad,
no queda como una captura silenciosa del estado cerrado. Nuevo helper
`captureInteraction` en `tests/pilot/support/journey.ts` para las capturas
mid-interacción. `tests/pilot/fixtures/server.mjs` gana el marcado y JS
mínimos (`.info-tip`/`.cit2-row`/`.cit2-opp-item` con toggle real) para que
`pnpm pilot:selfcheck` siga probando este camino también sin depender de
un preview real.

**Explorador genérico de interacciones + criterio UX (UX-PILOT-1c,
2026-08-02).** El fundador pidió que el piloto pudiera "hacer clicks en
cualquier sitio" y que tuviera criterio: "no solo pruebe que sale, sino que
sale bien y que la UX es la óptima". Escribir un test a medida por feature no
escala y solo cubre lo que alguien se acordó de escribir.

- Nuevo `tests/pilot/support/explore.ts`: **descubre** los controles seguros
  de cada pantalla, los ejercita y captura el estado resultante. Produce tres
  hallazgos que una máquina sí puede afirmar con certeza: `dead` (se pulsó y
  no cambió nada en el DOM), `introducedOverflow` (la interacción rompió el
  layout) y errores de consola por interacción. Conectado a las 9 pantallas
  del journey, en los 3 viewports.
- **Seguridad primero**: el explorador es allow-list (solo patrones que son
  estado local de UI), y además rechaza todo lo que esté dentro de un
  `<form>`, sea `submit`, navegue fuera, o cuyo nombre accesible parezca
  destructivo. Lo rechazado se registra como `skipped` con motivo — nunca se
  descarta en silencio, para que "no cubierto" no se lea como "verificado".
- **Bug de seguridad encontrado por la propia fixture**: la primera versión
  de la deny-list usaba `\belimina\b`, que **no** casa con "Eliminar" (la `r`
  rompe el word boundary), así que el decoy "Eliminar proyecto" fue pulsado
  en vez de rechazado. Contra el Supabase real eso es exactamente el
  accidente que la lista existe para evitar. Corregido a stems anclados solo
  al inicio de palabra; sobre-rechazar es la dirección correcta de fallo.
- **Nueva aserción `assertFullyVisible`** (`tests/pilot/support/journey.ts`):
  un elemento revelado no basta con que sea "visible" para el DOM — se afirma
  que no está recortado por un ancestro con `overflow: hidden` ni se sale del
  viewport. Nace de un caso real: el tooltip de los KPIs pasaba
  `toBeVisible()` mientras se renderizaba cortado por su propia tarjeta.
- **Bug de producto encontrado por esa captura**: `.cit2-kpis` tenía
  `overflow: hidden`, que partía la burbuja del tooltip por la mitad (peor en
  móvil, donde solo se leía la última línea). Además la burbuja medía 220px
  fijos anclada al icono, así que la del último KPI se habría salido por la
  derecha en 375px al abrirla. Ambos corregidos: el tooltip se ancla ahora a
  la tira completa y abre hacia abajo.
- `.claude/agents/ux-pilot.md` gana una **checklist de interacción** (6
  puntos) y un **listón de calidad UX** (8 puntos de juicio, no de
  aserción) — incluido "¿lo enviarías a un cliente de pago?" — más una
  sección que fija que **toda comprobación y toda evidencia van siempre a
  375/768/1280**, y que una comprobación hecha en un solo ancho está
  *no verificada* en los otros dos.

**Historial de fallos del propio piloto (para que no se repitan).** Cada uno
costó una iteración y dejó una regla o un test detrás:

| # | Fallo | Por qué pasó | Qué lo impide ahora |
|---|---|---|---|
| 1 | `PILOT PASS` sobre una pantalla que el harness nunca visitó | No existía journey para `/citations`; el verde era real para lo que probó, y se leyó como cobertura de lo que no | Journey de citations añadido; el doc del agente obliga a decir qué NO se cubrió |
| 2 | Barra de impacto con leyenda incompleta (2 de 5 buckets) | Las etiquetas estaban escritas a mano y no seguían a los datos | Leyenda derivada de los buckets con datos |
| 3 | Porcentajes sumando 267% | Se añadió un sexto bucket y el divisor del total, escrito a mano, se quedó obsoleto | Total derivado de `Object.values`; test del invariante buckets = citas totales |
| 4 | KPIs partidos 2+1 en móvil | `flex-basis: 140px` desbordaba a 375px | `flex-basis: 0`; checklist punto 6 (densidad/jerarquía) |
| 5 | "Verificado" sin haber probado el clic | Una captura del estado cerrado no puede demostrar una interacción | Test real de hover/clic con `expect().toBeVisible()`; helper `captureInteraction` |
| 6 | Tooltip recortado que pasaba `toBeVisible()` | Un elemento cortado sigue siendo "visible" para el DOM | `assertFullyVisible`: afirma no-recortado y dentro del viewport |
| 7 | Deny-list que no rechazaba "Eliminar proyecto" | `\belimina\b` no casa con "Eliminar" | Stems anclados al inicio; decoy permanente en la fixture |
| 8 | Timeout de 60s en el primer barrido real | 32 filas × capturas de página completa en móvil | Tope de 4 interacciones, presupuesto de 25s, capturas de viewport |
| 9 | Fila fantasma `undefined` en la tabla del PR | Los registros de interacción no tienen `label` y contaminaban `findings.jsonl` | Fichero propio `interactions.jsonl` |

**Primera aplicación del listón de UX a la propia pantalla (2026-08-02).**
Aplicando la checklist nueva a Páginas citadas salieron cinco mejoras; el
fundador pidió implementar las cinco:

1. **Pestañas con contador 0 deshabilitadas** en vez de ocultas — el 0 es
   información (es justo el punto de la pantalla), pero pulsarlas solo
   llevaba a una lista vacía: un callejón sin salida disfrazado de filtro.
2. **Orden de la lista explícito** ("De más a menos citada"). Siempre estuvo
   ordenada por número de citas y nada lo decía; la cabecera propia de la
   tabla es `display: none`, así que va bajo el título del bloque.
3. **"Citas propias: 0" deja de ser un callejón sin salida.** Es el número
   más importante de la pantalla y no ofrecía ningún siguiente paso. Ahora,
   solo cuando es realmente 0, aparece una línea que enlaza el hecho con la
   acción: las fuentes de «Oportunidades» si las hay, o Auditoría web si no.
   No afirma nada que el dato no sostenga.
4. **La barra de impacto y el donut dejan de competir.** Ambos responden a
   "cómo se reparten las citas", y apilados a ancho completo se leían como
   dos bloques rivales. Desde 900px van lado a lado como una sola sección
   (`.cit2-dist`); en móvil siguen apilados —no cabe otra cosa— pero el
   donut se reduce para que el par no cueste dos pantallas enteras.
5. **Tipografía del dominio unificada** entre la lista y el raíl de
   oportunidades. El mismo tipo de dato se renderizaba de dos formas (mono
   azul con ruta en la lista, mono tinta sin ruta en el raíl), obligando a
   reaprender qué es un dominio al pasar de una tabla a otra.

**Propuestas de mejora obligatorias (2026-08-02).** A petición explícita del
fundador ("que sugiera cambios antes de entregarme algo SIEMPRE"), todo
informe del piloto termina con una sección **"Mejoras propuestas"**: mínimo
tres, concretas y accionables, ordenadas por valor, marcando `[barato]` las
que son solo copy o CSS. Nunca vacía, tampoco en un PASS — una sección vacía
significa que el piloto pasó las checklists sin aplicar criterio, y el
Director la devuelve. El Director **incorpora las baratas antes del Human
Gate** y sube el resto con recomendación; queda escrito en
`.claude/agents/director.md`, `CLAUDE.md` (§Agentic User Pilot y §Human Gate,
que gana la pregunta 6) y `docs/agentic-user-pilot.md`.

**Tres mejoras baratas más (2026-08-02).** Segunda vuelta sobre la misma
propuesta, ya con las 5 anteriores en producción; el fundador pidió
implementar las tres:

1. **[barato] Contador de resultados filtrados.** El buscador acortaba la
   lista sin decir cuántas quedaban de las 32. Ahora, solo cuando un filtro
   (búsqueda o pestaña) reduce el resultado, aparece "X de Y páginas" junto
   a la barra de herramientas; en reposo no se repite el total que ya dice
   el título del bloque.
2. **[barato] "Otras webs" dejó de repetirse en cada fila.** Es el cajón por
   defecto de `classifySourceType` y en datos reales cubre casi todas las
   filas de terceros — como etiqueta por fila no aportaba nada que el donut
   de arriba no contara ya mejor en conjunto. Se suprime solo esa etiqueta
   (`ty-unk`) fila a fila; "Tuya", "Competidor" y los tipos SÍ clasificados
   (comunidad, comparador, medio, enciclopedia) se siguen mostrando, porque
   esos sí son información real por fila.
3. **Variante compacta de fila en escritorio.** Cada fila costaba ~65px
   (relleno 12px × 2 + favicon de 26px + dos líneas de texto), así que a
   1280px solo cabían ~3 filas antes de que la página necesitara scroll.
   Desde 1200px (el mismo punto de corte donde entra la columna de
   oportunidades) el relleno baja a 8px, el favicon a 22px y el texto se
   reduce un punto — sin quitar ningún dato de la fila, solo el aire
   sobrante que sí sobraba en una pantalla ancha.

**Bug real encontrado por el propio piloto, no propuesto por él (2026-08-02).**
El nuevo paso de búsqueda del piloto (evidencia real de la mejora #1) dejó
por accidente el panel de una fila de Oportunidades abierto de una
interacción anterior, y esa captura mostró un chip de atribución cortado
literalmente en el borde del viewport en el raíl estrecho (320px en
escritorio). Causa: `Menciona a {competitors.join(", ")}` metía TODOS los
nombres en una sola pastilla `white-space: nowrap` — con varios nombres
("Amazon, El Corte Inglés, Carrefour, AliExpress, Miravia") la pastilla era
más ancha que su contenedor y no podía envolver internamente. El contenedor
(`.cit2-detail-mentions`) ya tenía `flex-wrap: wrap` — estaba pensado para
varias pastillas pequeñas, no para una gigante. Arreglado: una pastilla por
nombre en vez de una pastilla por lista; el ancho de la columna no cambió,
pero ahora cada pastilla es corta y el `flex-wrap` existente las reparte en
líneas. Sirve tanto a la lista completa como al raíl de oportunidades, que
comparten el mismo componente (`PromptEvidenceList`).

**Tercera vuelta: paginación, filtro de oportunidades y formateo de
evidencia (2026-08-02).** Feedback directo del fundador sobre datos reales
de producción (movistar.es), no una propuesta del piloto:

1. **Paginación real en vez de expandir todo en el sitio.** El botón
   "Ver las N" metía las N filas en el DOM de golpe, sin límite de alto —
   con proyectos grandes el raíl podía crecer indefinidamente. Ahora son
   páginas de 5 con "Anterior/Siguiente" y "Página X de Y": el raíl mide lo
   mismo tenga el proyecto 8 oportunidades o 80.
2. **Oportunidades solo si citan a un competidor TRACKEADO.** El filtro de
   `opportunityRows` (`page.tsx`) comprobaba `category === "third_party" &&
   brandMentioned === "no"` pero no `competitors.length > 0` — colaba filas
   donde solo se mencionaba una "otra marca" no trackeada, o ninguna marca
   en absoluto, y la fila recurría al texto genérico "Cita a un competidor"
   para disimular que no había ningún competidor real que nombrar (visible
   en capturas reales: `highspeedinternet.com` mencionaba "WiFi Analyzer,
   NetSpot..." — herramientas, no competidores — y aun así aparecía como
   oportunidad). Con `competitors.length > 0` añadido al filtro, la tabla
   solo lista fuentes que de verdad citan a un competidor trackeado, y el
   fallback "un competidor" se elimina por inalcanzable.
3. **Formateo de evidencia como en Prompts.** El texto crudo del modelo se
   volcaba como texto plano — `**negrita**`, listas con `*`, etc. aparecían
   literalmente. El renderer markdown-lite que ya existía para el drawer de
   Prompts (`parseMarkdownBlocks`/`tokenizeInline` de
   `lib/markdown/inline-markdown.ts`, antes vivía inline en
   `prompt-drawer.tsx`) se extrajo a un componente compartido
   (`components/ui/formatted-response.tsx`, `<FormattedResponse text brand
   />`) y ambas pantallas lo usan ahora — misma lógica de parseo, mismas
   reglas de qué se resalta en negrita/listas/enlaces, un único sitio si
   hay que arreglar algo del parseo en el futuro.

**Cuarta vuelta: fuera badge de motor y botón de Auditoría web
(2026-08-02).** Dos recortes directos del fundador:

1. **Badge de motor (Gemini/ChatGPT) eliminado en toda la pantalla.**
   Vivía en dos sitios — `EngineChips` en cada fila de la lista completa, y
   una pastilla por prompt en el panel de evidencia — ambos removidos junto
   con el componente `EngineChips` y las clases CSS `.cit2-echip`/
   `.cit2-engs`, ya muertas tras el cambio. El contador "· N motor(es)" del
   raíl de Oportunidades no es un badge de motor concreto y se queda igual.
2. **Botón "Abrir Auditoría web" eliminado** del final del bloque de
   Oportunidades. La mención en prosa a "Auditoría web" dentro del aviso de
   "0 citas propias" se queda — no es un botón, es solo el nombre de la
   pantalla a la que ir por el menú. Al perder su único consumidor, la prop
   `projectId` se retiró en cascada de `OpportunitiesBlock`, `CitationsClient`
   y de la llamada en `page.tsx` en vez de dejarla sin usar.

---

## 8b. Overview — cómo se muestra la incertidumbre del score (GEO-SCORE-RELIABILITY-1, 2026-08-02)

**Estado: implementado.** Detalle técnico en `docs/adr/0024-score-reliability-layer.md`
y `docs/geo-score-variability-2026-08.md`.

Decisiones de presentación (no de cálculo — el score no cambia):

- **El score siempre se muestra; lo que se retira es la interpretación.**
  Por debajo de 10 respuestas de IA desaparecen la franja cualitativa
  («competitivo»/«emergente»/«inicial») y el delta, no el número. Ocultar el
  número escondería evidencia real que el usuario ha pagado; mantener la
  franja afirmaría una posición que la muestra no sostiene.
- **La franja se sustituye por un badge `warn` "Muestra insuficiente"** con
  tooltip que dice cuántas respuestas hay, por qué no basta y qué hacer
  (añadir prompts o motores). Es un estado accionable, no un error.
- **Un delta retirado no se etiqueta: se oculta.** *(Decisión del fundador,
  2026-08-03 — supersede la primera versión de esta misma fase, que lo
  renderizaba como "— sin comparación".)* Rotular cada hueco funcionaba como
  argumento de honestidad y fallaba como pantalla: cuatro avisos de
  "sin comparación" / "muestra insuficiente" a la vez hacen que el producto
  parezca roto, no cuidadoso. Sigue vigente lo que motivó aquella versión:
  **nunca "— sin cambio"**, que declara una estabilidad medida que no
  tenemos. La regla final es ausencia, no afirmación falsa ni cartel.
- **La ausencia se explica UNA vez, bajo el gauge, y en positivo.** *"Con N
  respuestas de IA más verás franja y evolución. Añade prompts o motores."* —
  redactado como lo que se desbloquea, no como lo que falta, porque el usuario
  puede actuar sobre "añade prompts" y no sobre "muestra insuficiente". Un par
  de escaneos no comparables **no** lleva línea: no es accionable (el
  siguiente escaneo lo resuelve solo) y nombrarlo reintroduciría el ruido que
  esta decisión elimina.
- **Unidad: "respuestas de IA", no "prompts".** El contador es
  `prompts × motores`; llamarlo "prompts" hacía que un proyecto de 1 prompt
  en 3 motores leyera "3 de 3 prompts". Supersede la copy del banner de
  insight de §4.
- **El margen se muestra donde el dato es una proporción** (tasa de mención:
  `±N pt`, Wilson 95%), no sobre el compuesto — no existe un intervalo
  honesto del compuesto sin metodología nueva, y fabricarlo sería el mismo
  error de precisión falsa que esta fase elimina.

- **Una card KPI que no puede sostener su afirmación se oculta entera**, no se
  queda con un valor vacío. Aplica a "Sentimiento de marca", cuyo veredicto
  ("Positivo") se calcula solo sobre las respuestas que mencionan la marca —
  2 en el escaneo que destapó esto. Dejarla habría sido la única card de la
  pantalla afirmando algo con seguridad mientras sus tres hermanas se callan.
- **La card del gauge deja de estirarse hasta la altura del bloque de KPIs**
  (`align-items: start` en `.ov2-hero`, ≥1200px). Antes la rellenaba la
  sparkline; al retirarla en escaneos de muestra baja quedaba un gauge con
  mucho aire debajo. Ajustarla al contenido funciona en los dos estados, no
  solo en el que tiene tendencia.

Pendiente conocido: con muestra suficiente pero identidad de marca mal
resuelta, la pantalla sigue publicando con confianza un número equivocado.
Eso es la Fase −1 (alias de marca), en la PR #300.

## 9. Emails transaccionales — repintado a v3 (BRAND-5c, 2026-08-02)

**Estado: implementado.**

**Origen:** BRAND-5c estaba pendiente desde BRAND-5a — los 8 emails de Resend
y las 2 plantillas de Supabase Auth seguían en la paleta índigo v2
(`#4f46e5`/`#1e1b4e`) mientras el resto del producto ya había migrado. El
fundador aportó una hoja de estilo de sesión de diseño externa con la
cabecera objetivo (600×120, lockup + tagline + colores email-safe) y aprobó
las cuatro decisiones abiertas de la propuesta (`docs/brand/
email-design-proposal.md` §4) tal cual recomendado.

Decisiones finales:
- **Cabecera blanca**, no banda navy — lockup completo (símbolo + wordmark)
  más el tagline "GENERATIVE ENGINE OPTIMIZATION" horneado como texto raster
  bajo el wordmark (el pack de marca no lo trae como trazado vectorial), más
  la "G fantasma" sangrando por el borde derecho, y una regla de 3px en
  `#2563EB` cerrando la banda para que la tarjeta no arranque flotando sobre
  fondo blanco.
- **Ámbar retirado como color de aviso.** El email de bajada de score y la
  píldora negativa del resumen semanal usaban ámbar/naranja
  (`#b45309`/`#fef7ed`) para una caída — mismo error de criterio que ya se
  corrigió una vez en la UI en BRAND-4 ("el ámbar es solo el punto del
  logo"). Pasan a rojo de datos `#D23B48`/`#FDECEE`, con píldora de delta
  (▼ N pts) igual que en Overview.
- **Emojis fuera** de titulares y asuntos (🎉, 📊) — la v3 se definió como
  "azul/navy más seria y analítica" tras el feedback de que la v2 se sentía
  "poco profesional"; el emoji tiraba en la dirección contraria.
- **"GenScore" se mantiene** en el cuerpo de los emails — la propuesta
  original planteaba cambiarlo a "Genscore" citando la guía de marca §1, pero
  esa entrada describe el logotipo (trazado SVG), no el nombre en texto
  corrido; `CLAUDE.md` fija "GenScore" como la marca de cara al usuario en
  toda la superficie de producto (landing, legal, dashboard). Corregido antes
  de implementar.
- **Código OTP del magic-link a JetBrains Mono** (con fallback monoespaciado
  de sistema) — es la tipografía de datos de la marca, y aquí un dígito mal
  leído bloquea el login.

**Dos bugs reales encontrados y corregidos durante la implementación** (no
estaban en el alcance original, pero afectaban directamente el motivo por el
que se pidió esta fase — "el logo se cargaba cortado"):

1. **El PNG de cabecera v2 (`genscore-logo-white-email.png`) ya venía
   pre-recortado.** Sus píxeles reales eran 958×164 (ratio 5.84), que no
   coincide con el ratio del lockup completo (1111:254 = 4.41) — la captura
   original que generó ese asset ya excluía parte del símbolo antes de
   llegar a producción; no era un problema de cómo el `<img>` lo mostraba.
   El activo nuevo (`genscore-email-header.png`, 1200×240) se genera
   renderizando los SVG de marca reales sobre un lienzo cuyo tamaño de
   captura coincide exactamente con el lienzo diseñado, así que no hay
   ventana de recorte distinta al contenido.
2. **Una cabecera a ancho de imagen fijo rompía el email responsive.** Al
   sustituir el logo pequeño (140×24, nunca competía con nada) por un banner
   a todo el ancho de la tarjeta con `width:600px;height:120px` fijos en el
   `style`, la imagen se convertía en el contenido más ancho de la tabla y
   anulaba silenciosamente el `@media (max-width:600px){.em-card{width:100%
   !important}}` que hace responsive el email — sin ningún error visible,
   el email simplemente dejaba de encogerse en móvil. Corregido con la
   técnica de imagen fluida estándar en email
   (`width:100%;max-width:600px;height:auto`). Verificado renderizando el
   HTML real (no la maqueta) a ~375px de viewport con Playwright, no solo a
   ancho de escritorio — el flag `--window-size` de Chromium headless en
   modo CLI resultó ser poco fiable para esta verificación en este entorno
   y dio falsos negativos/positivos intermitentes; `page.setViewportSize`
   vía Playwright fue el método fiable.

Referencias: `docs/brand/email-design-proposal.md` (propuesta completa,
incluye §7-8 con el detalle de generación del PNG),
`docs/email-templates/README.md` (por qué el `<img>` no puede llevar ancho
fijo).

---

## 10. Página de Competidores (COMP-REDESIGN-1)

**Estado: implementado (Fase A+B en un único PR, aprobado explícitamente por
el fundador el 2026-08-02 — ver Task Intake en el hilo del PR).**

**Origen:** el fundador pidió rediseñar Competidores a partir de dos
documentos de referencia de Semrush (el blog "Why Are My Competitors Showing
Up in AI Search and Not Us?" y la documentación del Competitor Research
Report), pidiendo estudiar si la sección se podía "vitaminar" con información
de valor nueva usando datos que ya tenemos.

Decisiones finales:
- **Repintado a v3** (`.cm2-scope`/`.cm2-page`), mismo mecanismo de remapeo
  de variables que `.ov2-scope`/`.pr2-scope` (§2) y mismos anchos por
  breakpoint que Overview/Prompts (460/640/1200/1280px) — Competidores
  estaba en el sistema `.page`/1320px pre-BRAND-5b, la única pantalla de la
  consola con scroll horizontal obligatorio en móvil (tabla de 5 columnas).
  Se sustituye por un podio (fila-tarjeta) con revelación progresiva de
  columnas por breakpoint, mismo componente en todos los tamaños.
- **Taxonomía "Brecha de prompts"**: adapta el Missing/Weak/Strong/Shared/
  Unique de Semrush a 5 categorías mutuamente excluyentes —
  Ausente/Por detrás/Por delante/En exclusiva/Sin nadie —, derivadas
  íntegramente de `extracted_json` ya persistido (sin llamada nueva a
  Gemini, sin migración). Ámbito: **el último escaneo completado
  únicamente** (no acumulado), porque "Ausente" está definido para coincidir
  exactamente con la fórmula de `competitor_gap_score`
  (`displacedPromptsCount`, ADR 0011/`lib/scoring/run-scoring.ts`) — mismo
  criterio que ADR 0018 de no mostrar dos números con el mismo significado y
  distinto valor en la misma pantalla. Test unitario (`lib/competitors/
  prompt-gap.test.ts`, caso 11) verifica la paridad de fórmula.
- **Delta escaneo-sobre-escaneo** junto a la cuota de voz acumulada de cada
  fila: deliberadamente una métrica separada (compara solo el último escaneo
  contra el anterior, `lib/competitors/sov-delta.ts`), nunca mezclada con el
  número acumulado principal — incluso con precedente distinto, mismo
  criterio de honestidad que ADR 0018.
- **Matriz motor × marca** (tasa de mención por motor) sustituye el texto de
  11px "Gemini 38% · ChatGPT 52%" bajo cada barra — reutiliza
  `computeEntityEngineBreakdown` (ENGINES-VALUE-3) ya existente, solo cambia
  la presentación.
- **Terreno por tema**: compara tasa de mención propia vs. mejor competidor
  activo por `project_prompts.category`, acumulado (mismo criterio que la
  matriz), en el raíl de escritorio junto al gráfico de posición.
- **Marcas emergentes**: primera vez que `other_brands_mentioned` (ya
  extraído por los tres motores, usado hoy solo por recomendaciones/
  auditoría web) se muestra en Competidores. Cierra el caso Ikea de ADR 0018
  (Sklum/Brico Depôt/BANNI aparecían en el ranking sin que el usuario
  pudiera hacer nada). Se muestra **fuera** del raíl de dos columnas (como
  bloque independiente a ancho completo) cuando el proyecto todavía no tiene
  ningún competidor activo — es precisamente el caso donde más ayuda a
  arrancar, y quedaba oculto en la primera versión de esta fase por un gate
  demasiado estricto (corregido antes de abrir el PR).
- **Gestión de competidores** (alta/edición/baja): `createCompetitor`/
  `updateCompetitor`/`deactivateCompetitor` llevaban meses en `actions.ts`
  sin ninguna UI conectada (gap ya documentado en §4 de este log). Se
  sustituyen por `createCompetitorAction`/`updateCompetitorAction`/
  `deactivateCompetitorAction` (`lib/competitors/manage-competitors.ts`),
  mismo patrón typed-input + `useTransition` que `addPrompts`/
  `rewriteRecommendationAction` (sin FormData, sin redirect, error inline en
  el modal). Añadir un dominio ya desactivado **reactiva** la fila existente
  en vez de violar `competitors_project_domain_uniq`
  (`0001_v0_schema.sql`) — flujo probado en `lib/competitors/
  manage-competitors.test.ts`. Solo baja lógica (`is_active=false`), nunca
  borrado duro.
- **Decisión explícita de alcance (2026-08-02):** la gestión de
  competidores entra en el **mismo PR** que el rediseño visual, por petición
  directa del fundador — desviación del Task Intake original, que proponía
  separarlas en Fase A (solo lectura) y Fase B (escritura).

Pendiente / roto conocido:
- **El piloto agéntico no puede verificar los flujos de escritura** de esta
  fase (alta/edición/baja de competidores): sigue siendo de solo lectura
  salvo la excepción UX-PILOT-2a (un único prompt manual). Esos flujos
  vuelven `PILOT INCONCLUSIVE` y necesitan smoke manual del fundador.
- **Página de Páginas citadas sin tocar.** El documento de Semrush describe
  "Sources → Missing" (dominios que citan a un rival y nunca a ti) —
  `aggregate-citations.ts` ya resuelve categoría `"competitor"` por dominio
  pero descarta qué competidor hizo match. Analizado y documentado como
  candidato (`CIT-GAP-1`) pero confirmado **fuera de alcance** por el
  fundador (el pedido original de "vitaminar páginas citadas" era un
  lapsus — el trabajo era solo Competidores).
- **Emparejamiento de nombres sin normalizar acentos** (`COMP-MATCH-1`,
  pendiente desde §4): esta fase no lo toca — sigue siendo `normKey()`
  simple (trim + lowercase) en toda la página, sin `normalizeEntityName`
  (PR #258). Mueve scoring real, necesita su propia validación.
- Sin sentimiento por competidor: el esquema de extracción solo puntúa
  `sentiment` de la marca propia, no de cada competidor — necesitaría
  cambiar la extracción y re-escanear, fuera de alcance de un PR de
  presentación.

**Revisión del fundador sobre el preview (2026-08-02).** Cinco correcciones
en el mismo PR, todas sobre datos reales:

1. **"Gestionar" sale del sticky-header.** Se había colgado de
   `.ov-sticky-right`, rompiendo el contrato de §3.2 de este mismo documento:
   la cabecera de página es **idéntica en todas las pantallas de consola**
   (título + pill de fecha + marca/dominio) y no admite acciones específicas
   de una pantalla. Pasa a la etiqueta de sección "Cuota de voz en IA"
   (`.cm2-manage-btn`). Anotado aquí porque fue una decisión ya tomada que
   esta fase contradijo sin darse cuenta — exactamente lo que este log existe
   para evitar.
2. **Columnas de motor a cero se eliminan de la matriz.** Si ningún actor
   (ni la marca ni ningún competidor) fue mencionado en un motor, esa columna
   es espacio muerto, no una comparación. Filtro de presentación
   (`matrixEngines`): las tasas por entidad no cambian y el 0% sigue siendo
   real, simplemente no se pinta una columna que no informa. La matriz exige
   ≥2 columnas supervivientes para seguir siendo comparativa.
3. **"+ Seguir" en una línea.** El botón envolvía a dos líneas con el "+"
   descentrado; ahora es `inline-flex` con `white-space: nowrap`.
4. **El sistema resuelve el dominio, no el usuario.** "+ Seguir" pedía al
   usuario teclear el dominio a mano, incoherente con el onboarding, que ya
   los descubre solo. Nueva `resolveBrandDomain` (`lib/llm/gemini.ts`) —
   búsqueda grounded del dominio oficial de una marca **ya nombrada** por la
   IA, distinta de `suggestCompetitors` (que descubre *qué* marcas compiten;
   ésta solo busca la dirección de una conocida). Mismo guardarraíl
   BRAND-DOMAIN-1 (nunca resuelve al dominio propio) y misma convención
   fail-soft. Si no se puede resolver, se dice claramente y se remite a
   "Gestionar" — **nunca se inventa un dominio plausible**.
   `followBrandCore` reutiliza `createCompetitorCore` tal cual, así que la
   reactivación de una fila desactivada y el guardarraíl de duplicados se
   comportan igual que en un alta manual.
5. **Gráfico de posición media subido**, de la cola del raíl derecho a justo
   debajo del podio de cuota de voz, y acompañado de una **lista ordenada con
   la posición media del último escaneo** por marca — el fundador pidió
   valorar "una tabla de la posición media de los competidores": leer quién
   va delante ahora mismo no debería exigir seguir la línea de un gráfico.

**Segunda revisión del fundador sobre el preview (2026-08-02).** Tres puntos
más, con capturas reales de dispositivo:

1. **"Tarjeta superpuesta con la card"** en la captura del proyecto Movistar:
   el círculo oscuro que tapa la fila "Alternativas" de Terreno por tema
   **no es de GenScore** — no existe ningún botón flotante en el código de
   esta pantalla (ni en ningún `.cm2-*`), y se confirmó comparando la
   evidencia real del pilot (`pilot-evidence/pr-285` en el commit de este
   fix) contra las capturas del fundador: el círculo aparece en el mismo
   sitio en el pilot headless, sin que el código lo pinte. Es el widget de
   feedback/toolbar que Vercel inyecta sobre los preview deployments para
   revisores autenticados — no está en producción y no es responsabilidad de
   este repo. No se ha tocado CSS para "arreglarlo" porque no hay nada que
   arreglar en el producto.
2. **Leyenda en "Terreno por tema".** Las dos barras por fila (marca propia
   vs. líder del tema) no se entendían sin leer el código de color de
   memoria. Añadida una leyenda fija al pie de la card —"Tu marca" /
   "Competidor"— reutilizando el patrón `.cm2-gaplegend` ya existente en
   Brecha de prompts (punto + etiqueta), en vez de inventar un componente
   nuevo.
3. **Competidores sugeridos sin relación con el negocio real
   (EMERGING-BRANDS-GROUNDING-1).** "Marcas que aparecen y no sigues"
   recomendaba AliExpress/Carrefour/eBay/El Corte Inglés/Decathlon para
   Mozilla (un navegador) porque `other_brands_mentioned` (extracción de
   cada respuesta IA, `lib/llm/gemini.ts` + `claude.ts` + `openai.ts`) solo
   comprobaba "¿este nombre aparece en el texto y no es la marca ni un
   competidor?", sin ninguna noción de categoría de negocio. Corregido
   reutilizando **el mismo mecanismo que ya usa la sugerencia de prompts**
   (COMPETITOR-GROUNDING-2, ADR 0022): el `business_profile` (jsonb) que ya
   se cachea en `projects` en el onboarding se lee — nunca se recalcula
   durante un escaneo, para no añadir una llamada a Gemini a la ruta crítica
   de escaneo — y, si existe, añade una frase de contexto de sector
   (`otherBrandsRelevanceHint`, `lib/llm/gemini.ts`) a la instrucción de
   extracción de las tres integraciones, pidiendo excluir marcas de una
   categoría claramente distinta aunque aparezcan literalmente en el texto.
   Parámetro puramente aditivo (`profile?: BusinessProfile`): un proyecto sin
   perfil cacheado se comporta exactamente igual que antes. Solo afecta a
   escaneos nuevos — los resultados ya guardados no se reprocesan
   retroactivamente, igual que el resto del histórico de escaneos.

**Tercera revisión del fundador sobre el preview (2026-08-02).**

1. **Enlaces de pie de página eliminados.** La pantalla tenía un bloque
   "Visión general / Historial de escaneos / Prompts" al final, heredado del
   layout previo al rediseño — redundante con la navegación lateral y
   ausente en el resto de pantallas v2 (Citas, Prompts). Eliminado.
2. **"Sigue saliendo lo mismo tras volver a escanear" (EMERGING-BRANDS-WINDOW-1)
   — corregido, opción (a).** Causa raíz: `computeEmergingBrands` contaba,
   por marca, el número de **prompts distintos** en los que aparece — pero
   sobre **todo el histórico de escaneos completados del proyecto**, igual
   que la cuota de voz y "Terreno por tema" (`page.tsx`: "cumulative, same
   population as the podium/matrix"). Ese conteo era acumulativo y no podía
   bajar: si un prompt ya había llevado a AliExpress a "6 de 7" antes del
   fix de EMERGING-BRANDS-GROUNDING-1, ese "6" quedaba fijado para siempre
   — un escaneo nuevo solo podía añadir prompts a la cuenta, nunca
   quitarlos. El fundador eligió la opción (a): acotar "marcas emergentes"
   al **último escaneo completado**, no a todo el histórico — encaja mejor
   con la semántica de "emergente" (algo que la IA dice ahora, no algo que
   dijo hace meses) y ya es el patrón que usa "Brecha de prompts" en esta
   misma pantalla. Implementado filtrando `results` por
   `run_id === latestCompletedRun.id` antes de pasarlo tanto a
   `computeEmergingBrands` como al denominador "en N de M prompts", para que
   ambos números sigan viniendo de la misma población. No toca
   `lib/competitors/emerging-brands.ts` (la función ya era agnóstica a qué
   filas recibe) ni la cuota de voz / Terreno por tema / matriz, que siguen
   siendo acumulativas por diseño.


## 11. Competidores sugeridos (COMPETITOR-SUGGESTIONS-1, 2026-08-03)

**Qué se decidió.** La caja de sugerencias de la pantalla de Competidores deja
de alimentarse de lo que la IA menciona en las respuestas y pasa a calcularse
**a partir de lo que la marca realmente es**. Decisión del fundador
(2026-08-03): *"yo sí quiero que aparezcan otros competidores sugeridos para
seguir siempre. Lo que pasa es que se deben calcular en base a lo que es la
marca real, no lo que sale en los prompts"*.

**Por qué.** El bloque anterior ("Marcas que aparecen y no sigues") derivaba de
`other_brands_mentioned`, es decir, de cualquier marca citada en una respuesta.
Para un navegador como Mozilla eso producía AliExpress, Carrefour, eBay o El
Corte Inglés: nombres reales presentes en el texto, pero que no compiten con
nada. Dos intentos de arreglarlo por filtrado (EMERGING-BRANDS-GROUNDING-1, que
añadió contexto de sector a la extracción, y EMERGING-BRANDS-WINDOW-1, que
acotó el conteo al último escaneo) mejoraron el ruido pero no el problema de
fondo: la fuente era la equivocada. Además el bloque aparecía y desaparecía
según lo que hubiera extraído el último escaneo.

**Cómo.** Se reutiliza el mecanismo del onboarding, sin inventar uno nuevo: el
`business_profile` cacheado (ADR 0022) alimenta `suggestCompetitors`
(`lib/llm/gemini.ts`), la búsqueda grounded con Google Search que ya se usa al
crear un proyecto. Puntos de diseño:

- **Caché en `projects.suggested_competitors`** (jsonb nullable, migración
  0023, aprobada por el fundador). La llamada grounded tarda segundos y cuesta
  una petición: no puede ejecutarse en cada render.
- **Se cachea la lista en crudo y se filtra en lectura**, no al escribir. Así
  seguir a un sugerido lo quita de la lista sin invalidar nada, y dejar de
  seguirlo lo devuelve.
- **Nunca se sugiere** el propio dominio ni un competidor ya dado de alta,
  **activo o inactivo** — uno que desactivaste a propósito no vuelve como
  "sugerencia".
- **Carga desde cliente tras el primer pintado**, con esqueleto: la página
  nunca se bloquea esperando la búsqueda, y el bloque está siempre presente.
- **Sin perfil no se inventa nada**: si no se puede identificar el negocio se
  dice honestamente, en vez de caer al modo ciego por dominio que ADR 0020
  eliminó justamente por producir competidores absurdos.
- `resolveAndCacheBusinessProfile` se extrae de `lib/projects/add-prompts.ts` a
  `lib/projects/business-profile.ts` para que sugerencia de prompts y de
  competidores compartan la misma caché en vez de recalcularla cada una.

**Qué se retira (superseded).** El bloque "Marcas que aparecen y no sigues" y
toda la fontanería que existía sólo para él: `lib/competitors/emerging-brands.ts`
(+ tests), `emerging-brands-section.tsx`, `followBrandAction`/`followBrandCore`
(alta por nombre) y `resolveBrandDomain` en `lib/llm/gemini.ts` — este último ya
no hace falta porque la sugerencia trae el dominio consigo, así que "+ Seguir"
ya no necesita una segunda llamada a Gemini. Queda en el historial de git por si
se quiere recuperar como funcionalidad propia; la señal "a quién nombra la IA"
sigue siendo interesante (caso Ikea de ADR 0018), pero es otra pregunta y
merecería su propio diseño, no reutilizar esta caja.

---

## 12. Artículos del blog — sistema de composición visual (GROWTH-3 Fase 3.1, 2026-08-03)

**Estado: librería construida, 1 de 7 artículos convertido.**

Diagnóstico de partida (verificado, no impresión): los 7 artículos del blog
tenían **cero imágenes en el cuerpo** y solo 3 apariciones sueltas de un
componente visual en total. Texto plano puede traer tráfico, pero la tasa de
rebote es alta y no genera engagement.

Decisiones finales:

- **Ningún visual es decorativo; todos son evidencia.** Es el hallazgo al
  analizar los PDFs de referencia de Semrush aportados por el fundador: cada
  imagen suya es o una captura que prueba la afirmación, o un ejemplo
  enmarcado del patrón que enseñan, o una cifra con su fuente. Convierte la
  pregunta visual en una pregunta de honestidad, que es terreno donde este
  proyecto ya tiene reglas duras.
- **Librería de 15 bloques** en `components/blog/article/`, importados
  siempre desde el barril. Detalle y criterio de uso de cada uno en
  `docs/brand/article-design-system.md`.
- **Tres reglas imposibles de saltarse por diseño de tipos**: `Stat` no
  compila sin `source`, `PullQuote` no compila sin `cite`, y toda maqueta
  declara en su pie que los datos son de ejemplo.
- **Recetas obligatorias por cluster**, con mínimo de bloques por tipo de
  artículo, validadas en `lib/blog/article-recipes.test.ts`. Una regla que no
  es un test no existe — mismo criterio que los tests de enlazado interno del
  glosario o de "al menos una fila donde gana el competidor" de las
  comparativas.
- **Imágenes: maquetas SVG/CSS, nunca ilustración generada por IA ni stock.**
  Decisión completa y motivos en `docs/adr/0028-article-imagery-policy.md`.
  Las capturas reales del producto quedan permitidas solo en `/docs`, nunca
  en marketing, porque la cuenta piloto vive en el mismo proyecto de Supabase
  que producción.
- **La anotación sobre una maqueta se ancla a la fila que resalta**, no se
  posiciona en absoluto con offsets. El artefacto de aprobación usaba
  posicionamiento absoluto; se descartó al implementar porque se descuadra en
  anchos intermedios. Se pierde la flecha curva de Semrush, se gana que no se
  rompa nunca.
- **Prefijo `art-` en todas las clases CSS.** No es cosmético: PR #292 costó
  una colisión de clases entre ramas sin mergear, y este sistema introduce
  ~15 clases de golpe.
- **Tema claro únicamente**, como el resto del sitio. Se comprobó que
  `globals.css` no declara `prefers-color-scheme` ni `data-theme` en ninguna
  parte y que los tokens `-dark` definidos no los consume nadie.
- **Enlaces: se prueban siempre, en dos niveles.** Estático en
  `lib/blog/article-links.test.ts` (rompe el build si un href apunta a una
  ruta inexistente) y en navegador dentro del journey del `ux-pilot` (cada
  enlace interno debe responder 200 contra el despliegue real). Regla
  explícita del fundador.
- **Orden de entrega de un artículo**: redactar → componer → tests → pilot →
  arreglar lo que el pilot encuentre → *entonces* Human Gate. Un artículo no
  llega al fundador con un hallazgo de pilot abierto.

Pendiente / roto conocido:

- **6 de 7 artículos siguen en texto plano.** Están listados explícitamente
  en `PENDING_CONVERSION` dentro de `article-recipes.test.ts`, con un test
  que impide que esa lista crezca: un artículo nuevo nace cumpliendo la
  receta. La conversión del resto es la Fase 3.2.
- El pipeline semanal autónomo (Fase A1) **no** entra aquí: requiere
  aprobación propia del fundador por el scheduler en background, que está en
  la lista de prohibidos de `CLAUDE.md`.
- `globals.css` usa `var(--mono)` en 11 sitios preexistentes, pero esa
  variable no está definida en ninguna parte (la real es `--font-mono`).
  Fuera del alcance de esta fase; los bloques `art-*` nuevos usan la
  correcta.

Referencias: `docs/brand/article-design-system.md`,
`docs/adr/0028-article-imagery-policy.md`, `components/blog/article/`.

---

## 13. Artículos del blog — un peso no es un valor medido (GROWTH-3 Fase 3.2a, 2026-08-03)

**Qué se decidió.** Todo `StatGrid` que muestre pesos del GEO Score va **bajo
su propio H2 que los enmarca como pesos**, nunca colgando de un encabezado
que promete otra cosa. Y sus tarjetas se redactan "**Peso de** la cuota de
voz…", no "Cuota de voz…".

**Por qué.** El `ux-pilot` encontró (PR #310) que en
`como-elegir-competidores-analisis-geo` una tarjeta decía *"Cuota de voz —
cuántas menciones son tuyas: 20%"* mientras la figura dos secciones antes
mostraba *"Tu marca: 21%"*. Dos cifras casi idénticas etiquetadas igual: una
es **la regla** (cuánto pesa esa señal en la fórmula) y la otra **el
resultado** (la cuota real de una marca de ejemplo). Nada las distinguía.

Ningún control automático puede detectar esto: no hay desbordamiento, ni
error de consola, ni petición fallida. Solo aparece leyendo el artículo como
lo leería alguien que llega por primera vez. Por eso se registra como regla
en vez de confiar en que el pilot lo cace cada vez.

`que-es-el-geo-score` ya lo hacía bien —su `StatGrid` vive bajo "Cuánto pesa
cada señal"— y es el patrón de referencia.

**Relacionado.** `StatGrid` exige ahora `label` (etiqueta accesible del
grupo), por la misma lógica que `Stat` exige `source`: obliga a quien escribe
a decir de qué son esas cifras. Ver `docs/brand/article-design-system.md`.

**Pendiente.** Quedan 3 artículos por convertir al sistema (cluster
`fundamentos` ×2 y `playbooks` ×1), en la Fase 3.2b.

---

## 14. Blog — la cabecera de artículo y las portadas (2026-08-04)

**Cómo salió.** El fundador abrió el blog en su móvil y señaló dos cosas:
*"la parte inicial del artículo con la fecha, el bloque inicial, la imagen,
queda todo muy pegado… no tiene la estructura típica y limpia de un blog"*, y
sobre las portadas de respaldo: *"parece un icono de algo que no carga bien"*.

**Qué se decidió — ritmo de cabecera.** La secuencia de una cabecera de
artículo es: hueco superior → portada → título → fecha → primer bloque, con
el metadato **agrupado con el título** y **separado del cuerpo**. El error
anterior era tener el ritmo al revés: 84px muertos arriba (el `padding` de
`.lp-section`) y cero separación abajo.

Medido por el `ux-pilot` sobre el render real: 48px de nav a portada en los
tres anchos, ~21px de título a fecha, ~44px de fecha a cuerpo.

**Precaución que hay que mantener.** `.blog-post-meta` **se comparte** con las
tarjetas del índice de `/blog` y de los hubs. Toda regla de cabecera va
acotada con `h1 +`, porque esas tarjetas titulan con `h2`. Sin eso, arreglar
el artículo rompe el índice.

**Qué se decidió — portadas.** Se permite imagen generada o de stock **en
portada**, manteniendo la prohibición dentro del cuerpo (enmienda a
`docs/adr/0028-article-imagery-policy.md`, decisión del fundador). Con una
regla: una portada no puede representar una interfaz, un panel, un gráfico ni
una métrica. Si enseña algo que parece un dato de Genscore, ese dato tiene que
existir — y entonces ya no es portada, es figura.

**Contraste.** La fecha pasa de `--ink-4` (2.63:1 sobre blanco, por debajo de
AA) a `--ink-3` (4.76:1). Aplica también a las tarjetas del índice.

**Pendiente / roto conocido.** Faltan 3 portadas
(`que-es-el-geo-score`, `llms-txt-guia-practica`,
`como-conseguir-que-chatgpt-te-cite`). Hasta que existan, esos artículos caen
en el degradado con icono, que es exactamente lo que se ha rechazado.
`lib/blog/covers.test.ts` impide que esa deuda crezca.

**Consecuencia de planificación.** La producción de portadas es hoy un paso
humano: no hay herramienta de generación en el entorno del agente y el stock
exige licencia. Mientras siga así, la publicación semanal autónoma (Fase A1)
tiene aquí una dependencia manual.


## 15. Gráfico de evolución del puesto — ventana y huecos (TREND-WINDOW-1, 2026-08-04)

> **Nota de coordinación.** Mientras se escribía esto, otra sesión ya había
> mergeado una §14 (cabecera de artículos) y el PR #315 tenía escrita *otra*
> §14 — colisión real, del mismo tipo que la de los dos ADR 0026, y en el
> propio documento que existe para evitarla. Resuelto renumerando: §14 es la
> del blog (ya en `main`), §15 es esta, §16 la de #315.

**Dos defectos, reportados por el fundador sobre el proyecto Movistar (21
escaneos completados).**

**1. Banda vertical en blanco en mitad del gráfico.** *"Eso no puede suceder en
ningún caso."* Tenía razón. Todos los escaneos completados recibían un hueco en
el eje X, incluidos aquellos sin ranking persistido (sin fila en `run_scores`, o
con un `details_json` sin `brand_position.ranking`). Para esos, el valor de
**todas** las series es null, así que **todas** las líneas se cortan en la misma
x y aparece un agujero.

La distinción que gobierna el arreglo: **una serie suelta en null es
información** —"esa marca no salió en ese escaneo"— y debe seguir cortando su
propia línea; **una columna donde nadie tiene valor no informa de nada** y
renderizarla como hueco sólo comunica "esto está roto".

**2. Demasiados puntos.** Con escaneos acumulándose a diario la línea se
convierte en ruido. Ventana de los **últimos 15** (`MAX_TREND_POINTS`).

**Orden de las dos operaciones, que no es indiferente:** se filtran primero las
columnas vacías y se recorta después. Al revés, la ventana gastaría huecos en
columnas que no pintan nada — justo el defecto que se venía a arreglar. Hay un
test que fija ese orden.

**Lo que deliberadamente NO cambia.** La lista "puesto medio · último escaneo"
sigue anclada al último escaneo **real**, no al último punto que sobreviva a la
ventana. Si se hubiera reusado el punto filtrado, la lista mostraría datos de un
escaneo anterior bajo un encabezado que dice "último escaneo" — una mentira
sutil. El contador "X de 2" sí pasa a contarse **dentro de la ventana visible**,
para que el mensaje y el gráfico no puedan contradecirse.

Lógica extraída a `lib/competitors/trend-window.ts` con tests, siguiendo el
patrón del resto de la zona (`filterComparableEngines`, `computeTopicComparison`):
la página es un componente de servidor y la lógica inline ahí no se puede probar.

**Cuarta ronda, ya con el gráfico dibujándose de verdad (2026-08-04).** El
fundador lanzó un escaneo, Mozilla llegó a 4 puntos y por fin se pudo ver la
línea recta funcionando. Cuatro ajustes sobre eso:

1. **Sin gráfico no se pinta nada** *(matizado horas después, ver abajo)*. Se
   quitan tanto el estado vacío como la nota bajo el gráfico. Es una **rectificación de lo que se había hecho dos
   rondas antes**: se había invertido esfuerzo en explicar honestamente por qué
   faltaba el dato, y el fundador lo tachó literalmente sobre la captura. La
   lección que queda escrita: un bloque que sólo sabe decir "todavía no" es
   ruido en cada visita, y redactarlo mejor no cambia eso. El mensaje honesto
   resolvió un problema real ("0 de 2" mentía), pero la solución correcta no
   era mejor copy, era no ocupar sitio.
2. **El título "puesto medio · último escaneo" se alinea a la derecha**, sobre
   los números que etiqueta. Había dos lecturas posibles de la petición y se
   preguntó en vez de adivinar, para no gastar un despliegue en la equivocada
   (el cupo de Vercel estaba al límite ese día).
3. **Fuera el InfoTip del encabezado.** Consecuencia directa de alinear el
   título a la derecha: el icono queda pegado al borde y la burbuja se abre
   fuera de pantalla, cortada. El fundador lo vio en el mismo despliegue y pidió
   quitarlo. Un tooltip ilegible estorba más de lo que explica.
4. **Las marcas apagadas de la leyenda no son marcas rotas.** Sólo las 4
   primeras series arrancan encendidas (`DEFAULT_VISIBLE`); el resto se activan
   pulsando. El fundador preguntó "¿por qué brave, protón, etc salen
   deshabilitados?" — señal de que el atenuado al 0.5 comunicaba "no
   disponible". Subido a 0.8 y añadida una pista explícita.

**Tercer hallazgo: el gráfico era una escalera.** Con los proyectos reducidos a
2 puntos se hizo visible lo que antes se perdía entre 20: la línea no unía
punto con punto, sino que trazaba un tramo horizontal y luego caía en vertical.
Estaba hecho a propósito, con este razonamiento en el código: *"a rank changes
from one scan to the next, it does not slide through the values in between"*.
El fundador lo rechazó —*"la línea tiene que unir un punto con otro; es un
gráfico en escalera que no tiene sentido"*— y tenía razón: **un escalón afirma
que el valor se mantuvo plano hasta el instante del escaneo siguiente**, que es
una afirmación sin medir *más* fuerte que la de una diagonal, además de leerse
como un fallo. Los puntos ya marcan dónde hay medición real; la línea sólo
conecta. Cambiado a segmentos rectos (`buildSeriesPaths`, con test que prohíbe
explícitamente `H`/`V` en el trazo).

**Y el umbral sube de 2 a 4 escaneos** (`MIN_TREND_POINTS`). Dos es el mínimo
matemático de una recta y el número equivocado de producto: son dos rayas planas
de lado a lado. Decisión del fundador tras ver tres proyectos distintos en ese
estado.

**Segundo hallazgo, al verlo desplegado: el estado vacío mentía sobre el motivo.**
El fundador probó el preview y vio dos cosas raras: Movistar decía *"0 de 2
escaneos"* teniendo **21**, y Mozilla dibujaba dos puntos planos de lado a lado.
Investigado: **no lo causa la ventana de 15**. Lo causa la decisión 4 de ADR 0026
(geo-score-v3, sin backfill): un escaneo anterior a v3 no tiene
`avg_position_when_mentioned` **para ninguna entidad**, así que toda la historia
previa es una columna vacía. El propio ADR lo advierte: *"Every existing project
was in that state until its next scan, so this was the default, not an edge
case."*

O sea: el filtro de columnas vacías funcionaba: lo que hizo fue **destapar** que
casi todo el histórico no tiene el dato nuevo. Antes esas columnas se dibujaban
como huecos y disimulaban el problema.

Lo que sí era un fallo nuestro es **el mensaje**. "0 de 2 escaneos" se lee como
"escanea más", y eso sólo es cierto en un proyecto nuevo; en uno con 21 escaneos
la verdad es "tus escaneos son anteriores a esta métrica". Dos estados
distintos llevaban la misma frase. Ahora se distinguen: cuando hay escaneos
completados sin dato de posición, tanto el estado vacío como una nota bajo el
gráfico dicen cuántos de cuántos lo traen y por qué, en vez de dejar que el
usuario concluya que la pantalla está rota.

**Última ronda: la tabla se quedó sin columna de puesto.** Al sustituir la media
en crudo por el ranking 1..N se eliminó la columna de valor y quedó una sola
cifra visible por fila —el porcentaje de mención— bajo un encabezado alineado a
la derecha que decía "ranking · último escaneo". Resultado: **el encabezado
nombraba los porcentajes**, y el puesto —un dígito gris pequeño a la izquierda—
se leía como viñeta de lista. El fundador lo cazó en el preview: *"¿no ves que
no sale la posición en la tabla?"*.

El error de fondo no fue la maqueta, fue la regla que me apunté: había anotado
"el encabezado va a la derecha" cuando lo que el fundador pidió fue *"que se
relacione con el dato"*. En el momento en que el dato de la derecha dejó de ser
el puesto, la regla siguió obedeciéndose y pasó a mentir. La regla correcta es
**una etiqueta por columna, encima del dato que nombra**: "Puesto · último
escaneo" a la izquierda, "Mención" a la derecha. Y el puesto se escribe como
ordinal (`3º`), porque "3" es una viñeta y "3º" es una posición. Corregido
también el gris del dígito (`--ink-4` → `--ink-3`).

Segundo aviso, para quien lea esto: **una revisión de capturas que sólo verifica
la lista de criterios del PR no es una revisión**. El ranking 1..N era correcto
en las tres capturas y aun así la tabla no comunicaba el dato principal. Mirar
sirve para lo que no estaba en la lista.

**Y aun etiquetado, el puesto seguía sin verse: estaba en el sitio equivocado.**
Con "1º" a la izquierda y su etiqueta encima, el fundador volvió a decir que no
salía la posición —incluso sobre una captura donde sí salía—. La explicación,
en sus palabras: *"me gusta más que la columna de puesto [vaya] a la derecha, no
la había visto"*. Un ordinal pequeño y gris al principio de la fila se lee como
viñeta de lista y el ojo lo salta; el peso visual estaba en el porcentaje, que
no es el dato del bloque. La lista pasa a **tres columnas —marca · mención ·
puesto—**, con el puesto el último y la cifra más pesada de la fila
(`--ink-2`, 750). Lección transferible: **el dato principal va donde termina la
lectura de la fila, no donde empieza**; si la posición estuviera primero tendría
que competir con el nombre por la atención, y pierde.

**Cierre de fase completo.** El invariante vive en `.claude/rules/competitors.md`
(secciones "Métricas" y "Gráfico de evolución del puesto") y la celda de
Competidores del mapa de zonas de `CLAUDE.md` apunta a esta fase — primera fase
cerrada bajo el protocolo que estrenó §16.

## 16. Gobernanza del contexto entre sesiones (CONTEXT-GOVERNANCE-1, 2026-08-03)

> Numerada **16** tras una colisión real: esta entrada nació como §14, pero
> mientras el PR estaba abierto otra sesión mergeó su propia §14 (cabecera de
> artículos) y una tercera rama reclamó §15 (TREND-WINDOW-1). Tres ramas
> peleando por un número en el documento que existe precisamente para
> coordinarlas — el mejor argumento posible a favor de esta fase.

**El problema.** El fundador lo planteó así: *"quiero que la plataforma agéntica
no pierda el contexto y tenga todo en cuenta cada vez que hago una mejora"*. El
síntoma concreto: cada zona (competidores, recomendaciones, auditoría web, blog,
metodología GEO) acumula decisiones que sólo viven en este documento, y este
documento sólo se lee si al agente se le ocurre leerlo. Además hay deriva entre
sesiones paralelas — el mismo día en que se escribió esta entrada había **dos
ADRs numerados 0026** (`article-imagery-policy` y `position-when-mentioned`),
escritos por ramas distintas que no se veían.

**La pregunta que había que responder bien.** El fundador propuso guardarlo todo
en `CLAUDE.md`. Se descartó y se explicó por qué: `CLAUDE.md` se carga **en cada
turno**, así que un registro de decisiones (que crece con cada PR) lo convertiría
en cientos de líneas mayormente irrelevantes para la tarea del momento. El
agente leería peor, no mejor.

**La decisión: tres capas, separando índice de contenido.**

| Capa | Dónde | Cuándo se lee | Crece |
|---|---|---|---|
| Constitución | `CLAUDE.md` | Siempre | Casi nunca |
| **Mapa de zonas** | `CLAUDE.md` | Siempre | **Acotado** — una fila por zona |
| Invariantes por zona | `.claude/rules/*.md` | **Automático** al tocar la ruta | Acotado por zona |
| Histórico | este log, `docs/adr/` | Cuando se consulta | Ilimitado |

La clave es que `CLAUDE.md` guarda el **índice**, no el **contenido**. Un índice
tiene una fila por zona y seguirá teniendo ~8 dentro de un año; un registro de
decisiones no tiene techo. Al cerrar una fase se edita **una celda** (la de
"última fase"), que es el reflejo permanente que el fundador pedía.

El mecanismo que de verdad garantiza que no se pierda contexto no es un
documento que se espera que alguien lea, sino el frontmatter `paths:` de
`.claude/rules/*.md`, que **se inyecta solo** cuando se toca un fichero de esa
ruta. Ese es el único punto del sistema que no depende de que el agente se
acuerde de nada.

**Qué se creó.** Cinco reglas nuevas para las zonas que el fundador nombró:
`competitors.md`, `recommendations.md`, `web-audit.md`, `scoring.md` y
`growth-content.md`. Cada invariante es **trazable** a una sección de este log o
a un ADR concreto — regla explícita del diseño: *un invariante que nadie puede
justificar es peor que ninguno, porque una sesión futura lo obedecerá igual*.
Por eso Visión general, Prompts y Páginas citadas se quedaron **sin regla
propia** en esta fase en vez de rellenarlas a medias; aparecen en el mapa
marcadas como pendientes.

**Cómo se hace obligatorio.** "Cierre de fase" en `CLAUDE.md` (histórico + regla
de ruta + celda del mapa, **en el mismo PR**), pregunta 8 del Human Gate, y la
barra de calidad del `director.md`. Lo hace el agente, no el fundador — decisión
explícita del fundador: *"el mapa que se actualice de forma automática por el
agente del mismo PR"*. Documentación que depende de que un humano se acuerde es
documentación que se pudre.

**Pendiente conocido.** La colisión de ADR 0026 sigue sin resolver (renumerar
uno de los dos toca enlaces cruzados y merece su propia decisión). Las tres
zonas sin regla de ruta siguen dependiendo de que se lea su histórico.

---

---

---

## 17. Página de Auditoría web (WEB-AUDIT-ISSUES-1, 2026-08-02/03)

**Estado: fase 1 (derivador) implementada y mergeada (PR #288). Fase 2 (esta
entrada) implementada, PR #289, en Human Gate.**

**Origen:** tres rondas de artefactos de diseño con el fundador. La primera
propuso tres direcciones (A/B/C); el fundador eligió **B — la auditoría como
registro de problemas** porque "una auditoría web es para encontrar
problemas técnicos". La segunda ronda, a petición explícita del fundador,
resolvió el solapamiento real con Recomendaciones que ya existía en
producción (la misma tarjeta de recomendación se embebía en las dos
pantallas — WEB-AUDIT-R5 — sin que el usuario pudiera saber si era la misma
acción o dos). La tercera, tras el comentario del fundador "creo que resumen
y problemas pueden ser la misma", fusionó las pestañas.

**El reparto (decisión central de toda la fase):**
> La Auditoría **arregla tu web** (problemas técnicos, se resuelven en la
> propia página). Recomendaciones **consigue que te citen** (trabajo de
> contenido, con su propio ciclo de vida).

Decisiones finales:

1. **Tres pestañas, no tres+**: `problemas` (portada por defecto, fusiona lo
   que antes eran "Resumen" y "Salud técnica"), `correcto` (nueva, petición
   directa del fundador), `paginas` (renombrada desde "tecnica", contenido
   sin cambios). "Evolución" deja de ser pestaña propia y pasa a bloque al
   pie de Problemas — mismo contenido, sin cambios de UI.
2. **`RecCard` retirado de esta página.** La fila de Plan de acción que antes
   embebía la tarjeta interactiva completa de Recomendaciones (WEB-AUDIT-R5)
   ahora muestra un badge plano "✓ En tu plan" + enlace — misma información
   (rationale, competidores citados), una sola tarjeta real en todo el
   producto. Esto simplificó bastante la carga de datos: desaparece el join
   con `generated_solutions` que solo servía para el estado "Propuesta
   generada" de `RecCard`.
3. **Nueva pestaña Correcto**: espejo de la lista de problemas, pero de
   comprobaciones que YA pasan (`lib/web-audit/issues.ts`'s `passing`).
   Cero backend nuevo — son datos que el derivador ya calculaba y la UI
   tiraba. Tachado + check verde, con el alcance real ("10 de 10 páginas
   indexables"), nunca un "bien" genérico.
4. **Puntos potenciales sólo sobre lo técnico.** "Si arreglas los N
   problemas técnicos: X → Y (calculado)" usa el `pointDelta`/
   `projectedReadinessScore` exactos de `issues.ts` — nunca una cifra sobre
   el score global, que mezcla contenido (no controlable) con técnica.
5. **Sistema de anchura de consola** (`.wa2-scope`/`.wa2-page`): mismo
   mecanismo y mismos valores que `.ov2-scope`/`.cit2-scope`
   (460px→640px≥900px→1200px≥1200px→1280px≥1600px) — el estándar oficial
   desde CITATIONS-REDESIGN-1 (§8), no una elección nueva por pantalla.
   Envuelve todo el contenido bajo la cabecera sticky, que se queda en el
   sistema de tokens compartido sin repintar (misma anidación que
   `citations-client.tsx`).
6. **Históricos de auditoría técnica ampliados de 1 a 8 filas** — antes esta
   página sólo cargaba el último snapshot técnico; la mini-tendencia de
   críticos/avisos y el delta de score en "Problemas" necesitaban más.

Pendiente / roto conocido:

- **"Lo que ya funciona" (temas de contenido citados) sigue en Problemas**,
  no se fusionó con la pestaña Correcto en esta fase — decisión de alcance
  explícita para no mezclar el derivador técnico con el de contenido en el
  mismo PR. Candidato a fase futura si se quiere una sola pantalla de "todo
  lo que va bien".
- **No hay journey de pilot dedicado** para las pestañas nuevas — el
  journey genérico de `core-flow.spec.ts` ("web audit screen renders") ya
  visita `/web-audit` y ejercita sus controles vía `exploreInteractions`,
  pero no verifica interacciones específicas (como sí hace el de Citations
  para tooltips/expansión de fila). Se añadirá si el pilot señala algo
  concreto que verificar.
- Fases 3 (arreglos copiables, generador de `llms.txt`) y 4 (verificación
  automática, detección de regresión) del plan original de 4 fases siguen
  sin empezar — cada una necesita su propio Human Gate antes de continuar.

**Revisión del fundador tras el Human Gate (2026-08-02):** el preview real
(proyecto Movistar) no se parecía al artefacto aprobado en varios puntos
concretos — gauge del héroe distinto, botón "Auditar ahora" en la cabecera
compartida, dos botones de auditoría distintos, matriz de oportunidad que
nunca estuvo en el mockup, Plan de acción que no debía vivir aquí, Evolución
asomando con una sola auditoría. Todo corregido en el mismo PR. Detalle:

- **Gauge del héroe**: sustituido el SVG a medida por el componente
  `Gauge` compartido (`components/ui/gauge.tsx`, degradado + numeral
  Bricolage) — el mismo que usa Overview. Añadida `.wa2-scope .gauge-num`
  en `globals.css`, mismo patrón que `.ov2-scope`/`.cit2-scope`.
- **Cabecera**: el botón se retira de `.ov-sticky-header` — confirmado
  contra el código real de Citations/Prompts que ninguna cabecera v3 lleva
  controles interactivos, sólo badges/pills pasivos (§3). El botón único
  se mueve al cuerpo.
- **Un solo botón de auditoría**: retirado "Auditar salud técnica" de
  Páginas — "Auditar ahora" ya dispara la auditoría técnica en el mismo
  clic desde WEB-AUDIT-R2 (piggyback en `web-audit-context.tsx`), así que
  el segundo botón nunca fue una función distinta.
- **Matriz de oportunidad y Plan de acción retirados por completo** de
  Auditoría web. Efecto secundario real, documentado en el código: los
  temas `content_gap`/`open_opportunity`/`capture` no tienen hoy ninguna
  recomendación real que los cubra en el motor de reglas — su guía
  sintetizada se queda sin sitio en el producto hasta que se decida si
  migra a Recomendaciones. Gap conocido, no resuelto especulativamente.
- **Evolución** (gráfico + historial) oculta por completo con menos de dos
  auditorías — antes sólo el gráfico se ocultaba.

**Por qué el pilot automático no lo detectó — diagnóstico y arreglo
(mismo día):** dos causas raíz confirmadas leyendo `.claude/agents/
ux-pilot.md`, `.github/workflows/ux-pilot.yml` y `tests/pilot/support/*`,
no supuestas:

1. **El artefacto de diseño aprobado sólo existía como enlace efímero de
   claude.ai** — ni el harness automático de CI ni una sesión de agente
   futura podían abrirlo, así que el checklist de fidelidad de diseño de
   `ux-pilot.md` (6 puntos: añadidos, desaparecidos, claridad, duplicados,
   valores que parecen rotos, jerarquía) nunca llegó a ejecutarse contra
   nada — no es que fallara, es que no tenía con qué comparar. **Arreglo**:
   el artefacto rev. 4 aprobado se copió a
   `docs/design-reference/web-audit-issues-1/` en este mismo PR, y
   `ux-pilot.md` ahora exige explícitamente una ruta del repo, nunca un
   enlace de chat, como input de "diseño aprobado".
2. **El proyecto que usa la cuenta piloto (Mozilla, sin
   `PILOT_PROJECT_ID` fijado) no tenía ninguna auditoría completada** —
   toda la sección nueva vivía detrás de ese gate (`!summary`), así que ni
   el sweep de interacciones ni ninguna captura llegaban a ver Problemas/
   Correcto/Páginas, sólo el estado vacío. **Arreglado (2026-08-03):** el
   fundador lanzó el workflow "Agentic User Pilot (write)" (UX-PILOT-2a/2b),
   que sembró una auditoría real en el proyecto piloto.

Además, se añadió un check mecánico nuevo en `tests/pilot/support/
journey.ts` (`headerInteractiveControls`, parte de `assertPageIsHealthy`):
falla automáticamente si CUALQUIER página futura mete un control
interactivo dentro de `.ov-sticky-header`, sin depender de que un agente
o un humano lo note en una captura. `pnpm pilot:selfcheck` verificado en
verde tras el cambio.

**Segunda ronda — el pilot seguía ciego a la mitad de cada pantalla
(2026-08-03), diagnóstico y arreglo:** con datos ya sembrados, el pilot
seguía sin poder certificar nada con confianza porque `journey.ts` medía
`document.documentElement` para overflow horizontal y para el recorte de la
captura `fullPage`, cuando el elemento que de verdad recorta y scrollea en
toda pantalla de consola es `.dash-content` (`.shell { height:100vh;
overflow:hidden }` > `.dash-main` > `.dash-content { flex:1;
overflow-y:auto }`, `app/globals.css` + `app/dashboard/layout.tsx`). Efecto
real: 0 de 27 capturas históricas habían mostrado nunca nada bajo el primer
pliegue, y el check de overflow horizontal era estructuralmente incapaz de
saltar. Arreglado en `journey.ts` (expande temporalmente esa cadena de
clases antes de capturar, mide `.dash-content.scrollWidth` en vez del
documento), verificado con un caso de fixture dedicado que reproduce la
cadena CSS exacta y con inspección visual directa de la captura resultante
(no solo con el test).

Con el detector arreglado, salieron a la luz **tres casos reales,
preexistentes, del mismo bug de tooltip** — invisibles hasta ahora porque
`visibility:hidden` no saca un elemento del layout, así que una burbuja de
`.info-tip-bubble` (220px, `position:absolute; left:0`) anclada cerca del
borde derecho de un viewport de 375px desbordaba de forma real y permanente,
solo que nadie podía medirlo:

- Leyenda de "Impacto de citas" en Páginas citadas (`.cit2-split-key`,
  40px de overflow) — defecto de PR #284 (CITATIONS-REDESIGN-1), no de esta
  fase.
- "Diagnóstico general" en el hero de Auditoría web (17px de overflow) —
  introducido en esta misma fase.

Apareció un cuarto caso al mergear `main` (`.cm2-pos-list-hd`, Competidores,
preexistente de COMP-REDESIGN-1/PR #285). Cuatro clases a medida repitiendo
las mismas tres líneas es justamente cómo la cuarta llegó a producción sin
parchear, así que se consolidaron en **una sola clase reutilizable
`.info-tip-anchor`** (documentada en `app/globals.css` y en el propio
`components/ui/info-tip.tsx`, para que el siguiente sitio de uso la
encuentre antes de reinventarla). Auditados los **8** usos de `InfoTip` del
producto, no solo los 4 conocidos: los dos que nunca se habían revisado
(`app/page.tsx` y `runs/[runId]/page.tsx`) quedan cubiertos también.
Descartado a propósito hacer `.card` global `position:relative` como
arreglo "automático": cambiaría el bloque contenedor de las 26 reglas
`position:absolute` que ya viven en `globals.css`, ninguna auditada aquí.

**Tercera ronda — revisión del fundador sobre datos reales (2026-08-03,
proyecto Movistar).** Con la pantalla ya funcionando, el juicio pasó de
"¿está roto?" a "¿se entiende?":

1. **El gauge no tenía título.** El número grande salía desnudo y competía
   con el tile "Salud técnica" en vez de resumirlo. "Diagnóstico general"
   sube de encima de los tiles a encima del propio gauge, como el
   "Salud del sitio" de la maqueta.
2. **58 arriba y 81 abajo confundían** ("ya veo que es salud técnica, pero
   me ha costado identificarlo"). Son medidas distintas —media global vs
   sólo técnica— así que el arreglo es etiquetar, no unificar: la caja de
   potencial ahora dice **Salud técnica** bajo sus dos números.
3. **La frase de esa caja, más corta y más pequeña** (11.5px → 10.5px,
   `--ink-2` → `--ink-3`), y apuntando a Recomendaciones por su nombre.
4. **Sparklines de los tiles sólo a partir de la 4ª auditoría** — con dos o
   tres puntos se dibuja un codo que se lee como tendencia sin serlo.
5. **Sparklines de Críticos/Avisos eliminadas** (tachadas a mano en la
   captura de la revisión): sólo el conteo. La misma serie sigue disponible
   en Evolución/Historial, donde sí tiene ejes.
6. **Badge "Rindiendo" eliminado** de "Lo que ya funciona" — el titular ya
   dice que funcionan.
7. **El gráfico de Evolución sube** al nivel de página, justo bajo el hero y
   por encima de las pestañas: dónde estás → hacia dónde vas → qué hacer. El
   Historial en tabla se queda en Problemas (es detalle de consulta).
8. **Gauge semicircular.** Segunda vez sobre el mismo punto: adoptar el
   componente compartido (2026-08-02) arregló la consistencia pero no la
   forma. Se añade `variant="semi"` al **único** componente `Gauge` en vez de
   un segundo SVG a medida, así las dos formas no pueden divergir en
   degradado, numeral ni colores de banda. **Pendiente de decisión del
   fundador:** Overview, Prompts y la landing siguen con el anillo de 270°;
   si la media luna les sienta mejor, es un `variant="semi"` por pantalla.

**Pendiente, fuera de alcance de esta fase:** en la pestaña Páginas el
fundador echa en falta "una solución para mejorar la puntuación de cada
página". Hoy hay guía en prosa por página, pero no el **arreglo copiable**
(bloque JSON-LD, meta description, etc.) — que es exactamente la fase 3b del
Task Intake ya aprobado, no un retoque de esta ronda.

**Cuarta ronda (2026-08-04).** Validados en preview el título del gauge, la
media luna, la desambiguación 43-vs-45, la frase corta y la regla de las
sparklines. Cambios nuevos:

1. **Evolución sube su umbral de 2 a 4 auditorías.** Propuesto tras mirar el
   preview y aceptado por el fundador: con dos puntos el gráfico dibuja una
   recta que se lee como tendencia sin serlo — mismo criterio que las
   sparklines, y pesa más aquí porque el bloque acababa de pasar a la
   posición más visible. El **Historial** en tabla se queda en 2: es una
   tabla, no una línea, y es justo lo que da contexto mientras el gráfico no
   aparece.
2. **Tooltip del gauge reescrito**: explicaba la aritmética ("media simple de
   tus señales disponibles… no cuenta como 0"), que es lo que el usuario no
   necesita para decidir qué hacer, y ocupaba once líneas que tapaban el
   propio gauge. Ahora dice qué aporta y por qué importa para GEO. El
   desglose sigue visible al lado, en los tres tiles.
3. **Las pistas de los tiles empiezan por mayúscula.** De paso se corrigió
   una que había quedado obsoleta ("lánzala desde la pestaña Salud técnica"
   — esa pestaña ya no existe; ahora dice que se audita con «Auditar ahora»).
4. **UX del botón «Auditar ahora» rehecha** (rediseño pedido explícitamente).
   El problema no era sólo estético: el botón flotaba solo, sin anclaje, y
   todo lo que tenía que decir lo decía DESPUÉS del clic, como párrafo
   alineado a la derecha; el caso "ya estaba fresca" ocupaba dos frases en
   tres líneas y su icono de check se rompía a su propia línea. Es decir, la
   única información que te habría ahorrado el clic sólo se alcanzaba
   haciendo clic.

   Modelo nuevo: **la frescura es un estado que se ve antes de actuar, no un
   recibo que se imprime después.** Barra de dos huecos: estado a la
   izquierda, acción a la derecha.

**Quinta ronda — simplificación del mismo botón (2026-08-04).** La primera
versión de esa barra introdujo variaciones que el fundador cortó de raíz:

- **El botón ya no cambia de color.** Alternaba `outline`/`default` según la
  frescura, y eso se lee como que el botón cambia de color porque sí
  ("primero blanco, luego azul, no tiene sentido"). Ahora es siempre el botón
  primario; lo único que se mueve es habilitado/deshabilitado. Por lo mismo
  desaparece la etiqueta alternativa "Volver a auditar": **un control, un
  nombre**.
- **Dos estados, no cuatro.** *Auditoría actualizada* → pastilla verde que lo
  dice + **botón deshabilitado** (pulsar sería un no-op servidor, así que el
  control dice que no de antemano en vez de aceptar el clic y explicarlo
  después). *Escaneo sin auditar* → sin pastilla, botón activo. Nada más.
  "Al día" se descartó por informal; la etiqueta es "Auditoría actualizada".
- **Sin banner mientras audita.** El bloque "Auditoría en curso" (título +
  tres líneas + pastilla "Auditando") repetía lo que el propio botón ya dice
  con su spinner y su conteo en vivo. Se retira **sólo** la variante con
  `canAudit`: la de plan pausado a mitad de campaña se queda, porque ahí el
  botón desaparece bajo el gate y ese banner es lo único que explica por qué
  la página parece atascada.
- **Sin toast de confirmación.** `router.refresh()` ya re-renderiza el botón
  con la pastilla puesta, así que la pastilla *es* la confirmación; un aviso
  al lado decía lo mismo dos veces. Se retira también el estado `notice` del
  contexto, que dejaba de leerlo nadie.

### Fase 3a — el generador de `llms.txt` (2026-08-04)

Se amplía esta entrada en lugar de abrir una §18: es la misma zona y la misma
familia de fases, y este documento ya acumula tres colisiones de numeración en
un solo día.

**El problema que había que decidir antes de escribir código.** Un `llms.txt`
es una guía de lectura curada: secciones, enlaces y **una descripción por
enlace**. Teníamos dos de las tres cosas de verdad — los temas son los prompts
activos del propio usuario, y cada URL existe sólo porque su cita de grounding
resolvió, fail-closed, contra el dominio propio. La tercera era la trampa.

**Lo que se rechazó.** `DomainCoveragePage.title` parece un título de página y
está saneado, pero **lo escribió Gemini**, no se leyó de la página —
`domain-coverage.ts` es explícito en que lo único verificado es la URL.
Meterlo en un fichero que el usuario publica en la raíz de su propio dominio,
como descripción oficial de sus propias páginas, habría sido convertir la
conjetura de un modelo en un hecho publicado. Es barato y es deshonesto; se
descartó por principio, no por coste.

**Lo que se decidió.** Estructura real, descripciones como marcador declarado
(`DESCRIBE ESTA PÁGINA EN 1 FRASE`), mismo contrato que fase 3b usa para
`<title>` y meta description. El texto visible de cada enlace es **la ruta**,
no el título del modelo: una ruta es algo que el sitio tiene de verdad y que
el usuario reconoce de un vistazo para escribir su frase al lado.

**Generar las descripciones con Gemini queda fuera**, y no por olvido:
introduce runtime de IA, coste y saneado en una fase que deliberadamente no
tiene ninguno. Si al usarlo el relleno manual estorba, es una fase propia con
su Task Intake.

**Devuelve `null` antes que un fichero vacío.** Un proyecto sin auditoría de
cobertura no tiene ninguna URL verificada, y un `llms.txt` hecho sólo de
marcadores parece un artefacto que funciona y no le enseña nada al modelo —
peor que no ofrecerlo. En ese caso la incidencia sigue mostrando su guía en
prosa y nada más.

**Instrucciones de publicación, por petición del fundador.** Generar el
fichero era la mitad fácil. "Publica un fichero llms.txt en la raíz de tu
dominio" es donde se para un responsable de marketing en una tienda Shopify:
asume que sabe qué es la raíz de un sitio, en qué plataforma está y cómo
comprobar que funcionó. Los cinco pasos terminan en **una URL que el usuario
abre él mismo**, así que el éxito es algo que *ve*, no algo que supone. No se
detalla más por plataforma a propósito: la auditoría conoce el dominio, no el
CMS, e inventar un paso "tu plataforma es WordPress" sería una conjetura
disfrazada de instrucción.

**Descarga además de copiar.** Esto es un fichero, no un fragmento: copiarlo a
un editor y guardarlo es justo donde el nombre se estropea (`llms.TXT`,
`llms.txt.txt`) y la comprobación distingue mayúsculas.

### Sitemap parseado y distintivo «Solución disponible» (2026-08-04)

Dos preguntas del fundador tras usar la fase 3a, y las dos respuestas útiles
fueron distintas de las que pedía literalmente.

**«Si el llms.txt es tan importante, ¿le damos más presencia?»** No. Está al
fondo de la lista porque `pointDelta` es `null`: nuestro propio scoring dice
que vale cero, y ese cero está bien puesto — `llms.txt` es un estándar
**propuesto**, sin adopción confirmada por ningún motor. Subirlo a crítico
sería afirmar un impacto que no podemos sostener; comportamiento de producto
falso en forma de priorización en vez de en forma de dato. Lo que sí era real
es que la fila cerrada no delataba que ahora trae solución dentro, así que
nadie tenía motivo para abrirla: de ahí el distintivo **«Solución disponible»**,
que informa sin tocar severidad ni orden.

**«¿No deberíamos generar también el sitemap.xml?»** Tampoco, y aquí la
diferencia no es de esfuerzo sino de qué es cada artefacto. Un `llms.txt` es
una **guía curada**: que la mantenga una persona es lo normal. Un sitemap es un
**índice generado por máquina** que debe seguir al sitio: uno estático nuestro
estaría obsoleto en cuanto publiquen algo, y lo habríamos construido con las
~15 URLs que conocemos de sus varios cientos. Además, en 2026 un sitio sin
sitemap casi nunca necesita escribirlo — necesita activarlo. Los pasos apuntan
al interruptor por plataforma.

**Lo que sí faltaba era parsearlo.** La comprobación vieja era sólo de
alcanzabilidad, y el fallo más común del mundo real la burla: un **404 blando**
—página HTML de error servida con 200— contaba como «Encontrado». Ahora se
distingue `urlset` / `index` / `invalid`. Coste: **cero peticiones nuevas**,
porque `robots.ts` ya descargaba esos bytes y los tiraba. Ese detalle es la
frontera de alcance, no una nota de rendimiento: parsear lo que ya tenemos no
amplía la superficie de fetch, pero **seguir un índice hasta sus sitemaps hijo
sí** —es seguir enlaces, o sea rastrear— y por eso no se hace; «índice» se
reporta como estado propio.

**Y mirar la captura destapó el defecto gemelo.** El pilot mostró
«sitemap.xml — No encontrado» para **mozilla.org**, un sitio que evidentemente
tiene sitemap. La causa estaba en `fetchTextCapped`: devolvía `null` ante 404,
403, timeout y error de red por igual, y los cuatro salían como «No
encontrado». Es el mismo error que el 404 blando pero en el otro sentido — una
comprobación que colapsa estados distintos en una sola respuesta.

Era tolerable mientras la auditoría sólo **informaba**. Dejó de serlo al añadir
pasos de arreglo: a un cliente detrás de un WAF corriente le estaríamos
diciendo que le falta un fichero que ya tiene, con instrucciones para crearlo.
Decirle a alguien que arregle un problema que no tiene es peor que no decir
nada.

Ahora hay tres estados (`found` / `absent` / `unknown`) y **un probe sin
resolver no es incidencia ni «correcto»: es no medido**, y no aparece en
ninguna de las dos listas. Es la misma regla que `PageCheckDefinition.isMeasured`
ya aplicaba página a página, aplicada por primera vez a los hechos de
proyecto. La alcanzabilidad se informa aparte, en la tarjeta de acceso de bots
(«Sin comprobar»), que es donde vive ese tipo de hecho.

Dos honestidades que el código sostiene con tests: el recuento se muestra como
«más de N» cuando el fichero vino truncado por el tope de 128 KB, porque un
prefijo no es un total; y el campo nuevo es **opcional**, de forma que un
snapshot anterior conserva su lectura de antes en vez de reinterpretarse — dar
por medido lo que aquella auditoría nunca midió sería inventar una medición
retroactiva.

---

**Los epígrafes son los prompts, y eso tiene un coste que no es estético.**
Al mirar la captura real del pilot sobre mozilla.org se vio que las secciones
salen en forma de pregunta (`## ¿Qué navegador web ofrece la mejor protección
de privacidad…?`), porque el único dato disponible para nombrar una sección es
el prompt del usuario. Como calidad de lectura es aceptable — para un motor
generativo, pregunta seguida de la página que la responde no es peor que un
tema genérico. Lo que sí importa es otra cosa: **esos prompts son la
estrategia de monitorización del cliente, y el fichero se publica en abierto
en la raíz de su dominio**, así que tal cual sale le dice a su competencia qué
consultas está vigilando en IA.

El generador no puede reescribirlos sin la llamada a IA aplazada, así que se
añade un paso de publicación que lo advierte explícitamente, colocado **antes**
del paso que sube el fichero. El fundador aceptó la v1 con esta limitación
(2026-08-04) sabiendo que reescribir los epígrafes queda de su parte.

---

## 18. La auditoría web deja de depender de un clic (AUDIT-AFTER-SCAN-1, 2026-08-04)

**Estado: implementada, PR #322 (sustituye a #314, cerrada). Migración 0027
aplicada a mano en Supabase el 2026-08-04 y verificada** (`jobs_type_chk` ya
admite `web_audit`). Detalle técnico en `docs/adr/0027-post-scan-web-audit-queue.md`;
invariantes de la zona en `.claude/rules/web-audit.md`.

**Qué cambia para el usuario.** Al terminar un escaneo —automático o manual—
se encola y se ejecuta sola la auditoría completa: primero la campaña de
cobertura, después la salud técnica. El usuario no tiene que hacer nada, y
sobre todo no tiene que *estar delante*. Ese era el fallo real: el producto se
mueve a escaneos diarios automáticos, y la auditoría vivía en un bucle en
primer plano conducido por la pestaña del navegador, así que la pantalla
insignia nunca se habría refrescado justo en las cuentas que más importan.

**Por qué una fila en `jobs` y no una llamada al vuelo.** Un despacho perdido
no puede significar una auditoría perdida. La fila es el contrato; el
`after()` que la arranca en caliente es sólo una optimización. Si se pierde,
la fila sigue vencida y el cron diario de las 07:00 la recoge.

**Lo que se decidió a nivel de producto, no de código:**

- **Los límites de 5/día no se aplican a la ruta automática.** Existen para
  acotar lo que una persona puede disparar a clics; la ruta automática ya está
  acotada por algo más estricto —como mucho una auditoría por escaneo
  completado—. Dejarlos puestos habría significado que el 6.º escaneo del día
  se publica sin auditoría, que es exactamente el fallo que la fase elimina.
- **El gate de plan Pro sí se mantiene.** Es una frontera comercial, no un
  límite de uso.
- **El email de fallo va al operador, nunca al cliente.** El cliente no pidió
  esta auditoría y no puede actuar sobre un fallo de backend.

**Roto conocido, a propósito, hasta el PR siguiente.** La pantalla sigue
contando la versión manual del mundo: el botón «Auditar ahora» de §17 sigue
ahí y dos textos siguen diciendo que la salud técnica "se audita al pulsar
«Auditar ahora»" (el *hint* del tile "Salud técnica" y el vacío del bloque
técnico). Con la auditoría automática eso ya no es cierto. El fundador fijó
explícitamente la secuencia —"una vez que lo tengamos listo, quitaremos el
botón manual"—, así que **la copia no se toca en este PR**: se retira junto
con el botón, en su propio PR, para que la decisión de qué queda en su lugar
(¿pastilla de "se audita sola tras cada escaneo"? ¿nada?) se tome de una vez
y no a trozos. Mientras tanto el botón sigue funcionando como disparo manual,
que es comportamiento razonable y no falso.

---

## 19. Publicación semanal del blog — de encargo escrito a cadena que arranca sola (GROWTH-3 Fase A2, 2026-08-04)

**Contexto.** La Fase A1 (§ PR #318) dejó escrito *el encargo* de la
publicación semanal y creó un disparador fuera del repo. Lo que no hizo fue
ejecutarse nunca: una automatización que no se ha disparado ni una vez no está
terminada, está redactada. A1 misma dejó anotado el riesgo — las sesiones
disparadas podrían correr **sin herramientas MCP de GitHub**, y entonces el
agente escribiría el artículo, empujaría la rama y ahí se quedaría, sin PR y
sin que nadie se entere.

**Qué se intentó primero y por qué se descartó.** El plan aprobado era
dispararla a mano una vez y ver hasta dónde llegaba. No se pudo: las
herramientas de rutinas exigen una aprobación interactiva que una sesión remota
no puede conceder. Eso no confirmó el riesgo, pero lo reforzó — **lo que
necesita una aprobación interactiva no está garantizado en una sesión
headless**. Se dejó de intentar averiguar si haría falta la red de seguridad y
se construyó.

**Lo decidido.**

- **`.github/workflows/weekly-post-pr.yml`** garantiza que exista un PR abierto
  para toda rama `claude/weekly-post/**`. **Es idempotente a propósito**: si la
  sesión semanal sí tenía herramientas y abrió el PR, el workflow lo encuentra y
  no crea nada. Los dos caminos convergen en el mismo estado final, que es lo
  que permite no tener que saber de antemano cuál se tomó.
- **El mensaje del último commit es el PR** (asunto → título, cuerpo → cuerpo).
  Se eligió frente a un fichero de plantilla en la rama porque un fichero
  temporal en la rama del artículo acaba colándose en el diff que revisa el
  fundador.
- **El aviso son tres capas, no una** (`docs/agentic-weekly-post.md` §8). La
  que sostiene el sistema es la más aburrida: el workflow pide revisión al
  fundador y **GitHub manda su email nativo**. No depende de que el agente siga
  vivo, ni de claves, ni de terceros — que es justo lo que se necesita cuando el
  modo de fallo probable *es* que el agente se muera a mitad. Encima van el push
  a la app de Claude (`PushNotification`, se pierde si no hay Control Remoto) y
  las notificaciones de fin de rutina (pendientes de activar).
- **Sin preview es `INCONCLUSIVE`, y se dice.** La cuenta de Vercel es gratuita
  y tiene tope diario de deploys; la propia PR de A1 se quedó sin preview por
  eso. Queda escrito que el aviso debe decir "escrito y validado, pero nadie lo
  ha visto renderizado" en vez de presentarlo como listo — el mismo fallo del
  2026-08-02 (§7) que el pilot existe para impedir.

**Lo que se mantiene de A1, sin tocar.** No hay scheduler de producto: nada en
`vercel.json`, ni `app/api/cron/**`, ni runtime. El agente **no mergea nunca**.
Y el check de portada **sigue en rojo a propósito** (§14, ADR 0026): el agente
no puede generar imágenes, y automatizar la publicación sin portada
automatizaría una vez por semana el defecto que el fundador rechazó
("parece un icono de algo que no carga bien").

**Lo que se comprobó mirando, no suponiendo.** Se leyó la configuración real de
la rutina y se la disparó a mano dos veces el 2026-08-04:

- **La sesión semanal no tiene ninguna herramienta de GitHub.** Su lista de
  permisos es `Task, Bash, Glob, Grep, Read, Edit, MultiEdit, Write,
  NotebookEdit, WebFetch, TodoWrite, WebSearch, BashOutput, KillBash, Skill,
  Tmux, Monitor, SendUserFile, REPL`. El riesgo que A1 anotó como hipótesis
  queda **confirmado**, y el workflow deja de ser una precaución para ser la
  única vía de entrega.
- **Sí tiene `Bash`**, así que el push está a su alcance.
- **Las notificaciones de la rutina ya estaban en `{push: true, email: false}`**
  — la capa 2 del aviso llevaba activa desde A1 sin que constara en ningún
  sitio.

**Y el hallazgo que obligó a añadir `.claude/settings.json`.** El primer
disparo manual (15:48 UTC) **no produjo nada**: dos horas después no había ni
rama ni PR. Ese mismo día, una sesión remota pidió cuatro veces leer la
configuración de rutinas y las cuatro recibió "requiere aprobación" — una
aprobación que nadie podía dar. Una sesión disparada a las 07:00 de un lunes
está en esa situación con el fundador dormido. El fichero preaprueba lo que la
sesión necesita para entregar (`git`, `pnpm test`, `pnpm run validate`), y de
paso convierte en regla ejecutable dos prohibiciones que hasta ahora sólo eran
texto en `CLAUDE.md`: `deny` sobre force-push y sobre push directo a `main`.
**No es hermética** (`--force-with-lease` y otras variantes no están cubiertas):
atrapa las formas comunes, no sustituye a la constitución.

**Pendiente / roto conocido.**

- **Una activación manual fuera del repo**, ya hecha por el fundador el
  2026-08-04: *"Allow GitHub Actions to create and approve pull requests"*. Sin
  ella el workflow devuelve 403 y no hay red de seguridad.
- **La causa del disparo mudo de las 15:48 no está confirmada.** La hipótesis
  del permiso encaja con todo lo observado, pero no se pudo leer el transcript
  de aquella sesión. Si el 10 de agosto vuelve a no producir nada, esa
  hipótesis queda descartada y hay que buscar en otro sitio.
- **La cadena completa sigue sin haberse ejecutado de punta a punta.** Lo que
  la Fase A2 cambia no es que no pueda fallar, sino que **si falla, se ve**:
  sin PR abierto el lunes, el fallo es visible en vez de silencioso. Falta
  todavía un detector para el caso "no se produjo absolutamente nada", que el
  workflow no cubre porque se dispara con un push que en ese escenario nunca
  ocurre.

---

## 20. Un escaneo dice cuántos lanzamientos hizo, no cuántos prompts tiene (SAMPLING-1, 2026-08-04)

Decisión técnica completa en **ADR 0030**; aquí sólo lo que cambia en pantalla
y por qué, que es lo que le toca a este documento.

Desde SAMPLING-1 un escaneo puede **repetir su set de prompts** para alcanzar
el suelo de 50 respuestas que el score necesita para ser publicable. Eso rompe
una equivalencia que el producto daba por hecha en su copy: `total_prompts`
cuenta *jobs*, y en cuanto hay repeticiones un job deja de ser un prompt.

- **Barra de progreso (`components/scan-in-progress.tsx`): se retira el
  sustantivo.** Pasa de «X de Y prompts» a «X de Y». Nombrar la unidad ahí
  sería falso en los escaneos que repiten, y llevar `sample_count` hasta ese
  componente exige tocar 4 páginas más `/api/.../scan-status` — trabajo de la
  fase de superficie, no de ésta. Precedente que ya existía: la tabla de
  escaneos (`live-run-status-cells.tsx`) ya mostraba `ok/total` sin sustantivo.
- **Detalle del escaneo: se nombra la unidad real sólo cuando hace falta.** Con
  `sample_count = 1` sigue diciendo «Prompts analizados: X de Y». Con
  repeticiones dice «Lanzamientos analizados: X de Y · N prompts × R
  repeticiones», que además enseña de dónde sale el número en vez de
  esconderlo.
- **Chips de motor en Prompts: agregados, no la última fila.** Construían un
  `Map` por proveedor, así que con varias muestras el chip «Gemini: marca
  mencionada» lo decidía la fila que llegara última — una moneda al aire. Ahora
  el chip significa «este motor nombró la marca en al menos una de sus
  respuestas», que es la misma regla que la fila ya usaba entre motores.

- **Historial de escaneos: la columna «Prompts» pasa a «Lanzamientos».** Con 6
  prompts y 3 repeticiones la celda decía `18/18` bajo un encabezado que ponía
  «Prompts», que en un proyecto de 6 prompts es literalmente falso. Se renombra
  la columna y, sólo cuando hubo repeticiones, se añade el desglose debajo
  (*«6 prompts × 3 repeticiones»*) en vez de esconder de dónde sale el número.
- **Las filas del historial se vuelven clicables.** Hallazgo colateral al
  verificar lo anterior: `/runs/[runId]` estaba enlazada desde exactamente dos
  sitios, **ambos dentro de estados vacíos** («no hay citas», «no se generaron
  recomendaciones»). Un proyecto con datos reales no podía abrir el detalle de
  ningún escaneo — la página llevaba huérfana quién sabe cuánto. La fecha de
  cada fila es ahora el enlace; un `<tr>` entero no se puede envolver en un
  ancla sin producir marcado inválido.

**Roto conocido, aceptado y pendiente de la fase de superficie:** el cajón de
evidencias muestra R filas por motor sin etiquetar a qué muestra pertenece cada
una, y el total de citas por prompt suma las R respuestas (por tanto no es
comparable entre escaneos con distinto R). No se toca aquí para no adelantar a
medias un diseño que tiene su propia fase.

**Sigue abierto, y no es de esta fase:** la columna **Δ Score** de ese mismo
historial resta los dos scores en crudo (`curr - prev`), sin pasar por la
guarda de comparabilidad de ADR 0024 que la Visión general sí aplica. Publica
`+34 pt` sobre escaneos de 3 respuestas — exactamente el problema de
credibilidad que motivó SAMPLING-1, en la pantalla de al lado.

---

## 21. Presupuesto de builds del flujo agéntico (BUILD-BUDGET-1 Fase 1, 2026-08-04)

**El problema, medido.** El fundador reportó que se estaba tocando a diario el
tope de 100 deploys/día del plan Hobby. Censo real vía los eventos
`deployment_status` del repo (cada uno es un deploy de Vercel):

| Día | Deploys | Ramas activas |
|---|---|---|
| 2026-08-03 | 50 | 15 |
| 2026-08-04 (hasta 17:52) | 40 | 11 |

De los 90 deploys de esos dos días, **43 (48%) salieron de sólo tres ramas** —
`recommendations-page-redesign` (15), `web-audits-redesign` (14),
`geo-score-variability` (14) — y 12 fueron de producción (uno por merge). Había
10 PRs abiertos a la vez. 5 de los 41 commits mergeados desde el 01-08 no tocan
nada que Next construya (docs, `.claude/`, tests) y aun así costaron un build
cada uno más su pasada de piloto.

**Segundo techo, no pedido pero encontrado.** El `ux-pilot` consumió 344 min de
GitHub Actions el 03-08 y 381 min el 04-08. A ese ritmo el plan gratuito de
Actions para repos privados (2.000 min/mes) se agota en unos 6 días. Misma
causa raíz, factura distinta.

**El diagnóstico.** No eran "demasiados PRs". El build se había convertido en el
bucle de feedback: push → build → piloto → falla → arreglo → push. Un PR grande
pagaba 14-15 builds por lo que debería costar 2 o 3.

**Lo que se decidió (Fase 1 — sólo lo que no cambia ninguna garantía):**

1. `ignoreCommand` en `vercel.json` → `scripts/vercel-should-build.sh`. Salta el
   build cuando el diff contra el **último deploy con éxito de esa rama**
   (`VERCEL_GIT_PREVIOUS_SHA`, no `HEAD^`: un push de tres commits es un solo
   deploy) sólo toca `docs/`, `.claude/`, `.github/`, `tests/` o `*.md` de raíz.
   Producción nunca se salta. `scripts/` tampoco entra en la lista segura, por
   contener este mismo script.
2. Reglas de push en `CLAUDE.md` §"Presupuesto de builds": un push por iteración
   pilotable; prohibidos los commits vacíos de *retrigger*; no mergear `main` en
   la rama sin conflicto real; máximo 3 PRs abiertos.

**Fail-open, y por qué importa más que la cuota.** El script construye ante
cualquier duda (sin SHA previo, SHA inalcanzable en el clon shallow, `git diff`
que falla). Un build saltado de más dejaría el preview apuntando a código viejo
y el piloto juzgaría una pantalla que no es la del commit — exactamente el fallo
del 2026-08-02 (§7 y la nota de Auditoría web) que el piloto existe para
impedir. `scripts/vercel-should-build.test.ts` fija las dos direcciones del
contrato invertido de Vercel (0 = saltar, ≠0 = construir), que es justo lo que
se voltea en silencio en un refactor.

**Ahorro estimado, corregido tras una medición ajena.** El análisis original
atribuía al `ignoreCommand` un 10-15% de los *deploys*. Es falso, y lo demostró
PR #323 probándolo en vivo: un commit sólo de `docs/` que la regla debía saltar
fue rechazado con el mismo error de cuota que el resto, porque **el tope se
aplica al crear el deployment, aguas arriba del paso de build donde corre el
`ignoreCommand`**. Lo que ahorra son minutos de build y la pasada de `ux-pilot`
que habría disparado ese preview — no deployments. La reducción del *número* de
deploys viene entera de la disciplina de push (reglas 1-4), que era ya el grueso
de la estimación: de ~50-60/día a ~20-25.

**Colisión con otra sesión, y cómo se resolvió.** Mientras este PR estaba
bloqueado por la cuota, otra sesión implementó lo mismo por su cuenta y lo
mergeó: PR #323 metió un `ignoreCommand` en línea
(`git diff --quiet HEAD^ HEAD -- ':(exclude)…'`). Su propio mensaje de commit
declara la limitación: *"HEAD^ compara solo el último commit, no el push
entero… Estrecharlo al rango del push completo es un cambio de una línea y
merece su propio PR"*. Este PR es ese follow-up, así que se reconcilió en vez de
competir:

- Se conserva el mecanismo, se sustituye la implementación por el script, que
  compara contra el último deploy con éxito, nunca salta producción y cubre
  también `.github/` y `tests/`.
- Se conserva `agents/` en la lista segura, que venía de su versión.
- `vercel-ignore-command.test.ts` (raíz) se elimina: verificaba la *forma* de un
  comando que ya no existe. Su garantía real —que nadie meta un patrón `*.md`
  que se trague `app/blog/<slug>/page.mdx`— se traslada a
  `scripts/vercel-should-build.test.ts` como aserción de **comportamiento**, que
  sobrevive a una reescritura.
- La consecuencia que documentó PR #326 ("un commit sólo de docs en la rama de
  producción no redespliega producción") deja de aplicar: producción nunca se
  salta. La otra causa de producción congelada que ese PR documenta —Production
  Branch apuntando fuera de `main`— sigue vigente.

**Vercel Pro contratado el 2026-08-04.** El tope de 100/día deja de existir, que
era el detonante de esta fase. No la invalida: las cuatro reglas siguen
ahorrando minutos de build, pasadas de piloto y los ~350-380 min/día de GitHub
Actions, y el bucle "push para ver qué dice el piloto" seguía siendo un mal
hábito con o sin tope. Lo que sí cambia es la urgencia de las dos fases que
quedaron fuera.

**Deliberadamente fuera de esta fase, y por qué:**

- **Que el piloto deje de correr en cada deploy** y pase a etiqueta
  (`status:ready-for-pilot`). Ahorraría otro 10-15% y aliviaría los minutos de
  Actions, pero **cambia un invariante ya documentado** de `CLAUDE.md` y de
  `docs/agentic-user-pilot.md`. Necesita su propia aprobación.
- **Desactivar los deploys automáticos por rama** (`git.deploymentEnabled`) y
  crear el preview bajo demanda con la CLI de Vercel. Es la única opción que
  *garantiza* no volver a tocar el techo (~1-2 builds por PR), y también la más
  invasiva: necesita Task Intake propio con plan de rollback.

**Lo que sigue abierto.** Con Pro contratado, el riesgo legal de operar un SaaS
comercial en Hobby queda cerrado (era bloqueante de la Fase 5 de
`docs/launch-plan.md`, ver su ledger). Queda vivo el segundo techo: los minutos
de GitHub Actions que consume el piloto en cada deploy, que ninguna de las
cuatro reglas de esta fase toca de raíz — eso es la fase del piloto por
etiqueta.

---

## 22. La auditoría, visible en Escaneos (AUDIT-IN-RUNS-1, 2026-08-05)

**Estado: implementada.** Task Intake aprobado por el fundador el 2026-08-05
("quiero que ahora las auditorías completadas se muestren también en el
listado de Escaneos completados para verlo de un vistazo").

Columna **«Auditoría»** en la tabla de Escaneos, entre *Lanzamientos* y *GEO
Score*. Sin esquema nuevo: los dos lados ya estaban persistidos por escaneo.

**Por qué ahora y no antes.** La columna depende de que exista una relación
1:1 fiable entre un escaneo y una auditoría, y esa relación **nació anoche**
con AUDIT-AFTER-SCAN-1 (§18). Antes la auditoría era un acto manual y
esporádico: una columna así habría estado vacía casi siempre y no habría
significado nada.

**Las cuatro decisiones, con su porqué:**

1. **Estado + nota técnica**, no sólo estado. El número (`40/100`) es lo que
   de verdad se compara entre escaneos, y tenerlo al lado del GEO Score es
   justamente el vistazo que se pedía. Va etiquetado por `title`, porque sin
   etiqueta y a una columna del GEO Score se lee como una segunda puntuación.
2. **«Auditada» exige las dos mitades.** Cobertura y salud técnica se
   persisten por separado y pueden aterrizar por separado —es normal, no un
   fallo: la técnica se aparca a la invocación siguiente cuando no cabe—. Con
   una sola, la celda dice **«Parcial»**. Llamar completa a media auditoría
   sería exactamente la clase de progreso fingido que prohíbe el CLAUDE.md.
3. **Los escaneos sin auditoría muestran `—`, nunca «Pendiente».** Tres
   pasados distintos caen ahí y ninguno es accionable por el cliente: escaneos
   anteriores a §18, proyectos por debajo del gate Pro, y auditorías que
   agotaron sus reintentos. Una raya honesta en vez de tres etiquetas que
   invitan a tres preguntas. **«En curso» queda reservado a trabajo realmente
   en cola**, que sí se resolverá solo.
4. **La celda no es un enlace, y es deliberado.** Esta tabla tiene una fila
   por escaneo, pero la pantalla de Auditoría web muestra **la última**
   auditoría, no la de un escaneo concreto. Enlazar la fila del martes
   llevaría a la auditoría del jueves haciéndola pasar por la del martes. Una
   vista de auditoría por escaneo es otra fase; hasta entonces la celda
   informa y no finge navegar.

**Quinto estado, añadido tras verlo en producción (2026-08-05):**
**«Reintentando»**, separado de «En curso». El backoff de la cola es
`[1, 5, 25, 120, 600]` minutos, así que un trabajo en su quinto intento se
queda quieto **diez horas**. Pintarlo «En curso» promete un movimiento que no
va a llegar en todo el día, y se lee como una tabla congelada en vez de como
una auditoría con problemas — que es exactamente cómo se leyó: filas inmóviles
en «En curso» durante cuatro horas y media. «En curso» queda para `pending` y
`running`, que sí se mueven pronto.

**Pendiente conocido:** una auditoría que falló definitivamente es
indistinguible de una que nunca existió. Es una decisión, no un olvido —el
cliente no puede actuar sobre un fallo de backend y el operador ya recibe un
email—, pero si algún día el fallo pasa a ser accionable, aquí falta un
estado.
## 23. El historial de escaneos deja de publicar deltas que la Visión general oculta (DELTA-GUARD-1, 2026-08-05)

**El hallazgo, encontrado mirando capturas del piloto, no auditando código.** La
Visión general lleva desde GEO-SCORE-RELIABILITY-1 (ADR 0024) negándose a
publicar un «vs. escaneo anterior» que la muestra no sostiene. La tabla de
Escaneos, en la pantalla de al lado, seguía restando los dos scores en crudo
(`curr - prev`) y publicando **`+34 pt`, `-50 pt`, `+67 pt` sobre escaneos de 3
respuestas**. Es exactamente la falsa precisión que motivó el ADR, viva en la
pantalla donde el fundador mira su histórico.

Que sobreviviera un año de trabajo sobre el score tiene una explicación
incómoda: ADR 0024 se implementó *en una pantalla*, no *en el producto*. La
capa de fiabilidad existía y era correcta; simplemente había un consumidor que
no la llamaba.

**La decisión.** Un delta sólo se publica si `resolveDelta` lo autoriza —
mismo punto de decisión, mismos criterios, cero lógica duplicada. Los tres
casos se renderizan así:

| Veredicto | Render |
|---|---|
| `publish` | El valor, como siempre |
| `insufficient_sample` | Guion, con el tamaño de muestra y el mínimo en el tooltip |
| `not_comparable` | Guion, con la causa concreta en el tooltip |

**Se retiene deliberadamente el guion, no un aviso.** El 2026-08-03 el fundador
decidió para la Visión general que una comparación retenida se renderiza como
nada, porque varios «sin comparación» en una pantalla se leen como un producto
roto y no como uno cuidadoso. Aquí pesa más: son *filas*, así que un aviso por
fila sería una columna entera de disculpas. La razón vive en el `title`, para
quien la busque.

**Consecuencia visible y buscada:** proyectos como Mozilla (1 prompt × 3
motores) pasan a tener la columna Δ Score casi vacía. No es una regresión —
es el producto dejando de afirmar lo que nunca pudo medir. Con SAMPLING-1
(§20) esos mismos proyectos vuelven a llenarla en cuanto alcanzan el suelo de
respuestas.

**Invariante nuevo, en `.claude/rules/scoring.md`:** ninguna superficie
publica una comparación entre escaneos sin pasar por `resolveDelta`. La
lección no es "arreglada la tabla" sino que una capa de honestidad que hay que
acordarse de llamar acaba sin llamarse.

---
## 24. El cajón de evidencias dice a qué repetición pertenece cada respuesta (SAMPLING-SURFACE-1, 2026-08-05)

Deuda declarada al cerrar SAMPLING-1 (§20) y saldada aquí. Desde que un escaneo
puede repetir su set de prompts, `scan_prompt_results` guarda R filas por
(prompt, motor) en vez de una, y la superficie no se había enterado.

**El cajón mostraba «Gemini / Gemini / Gemini / Claude / Claude / Claude»** sin
decir por qué. Eso se lee como un fallo de renderizado, cuando en realidad son
tres respuestas distintas a la misma pregunta — y **su desacuerdo es justamente
el motivo de muestrear**. Ahora cada fila lleva «· muestra 2 de 3», y las
repeticiones de un mismo motor van juntas, para que "este motor dijo cosas
distintas en intentos distintos" se vea de un vistazo.

**«N citas» por prompt sumaba todas las muestras**, así que el mismo prompt con
el mismo comportamiento de citas reportaba 21 con tres repeticiones y 7 con
una: dos números describiendo una sola realidad, y no comparables entre
escaneos. Se añade el denominador («21 citas en 9 respuestas») en vez de
cambiar la cifra que el usuario ya leía.

**Las dos etiquetas desaparecen cuando no hay repeticiones**, que es la
inmensa mayoría de escaneos (todo proyecto de 17 prompts para arriba). Poner
«muestra 1 de 1» en cada fila de cada proyecto para servir a la minoría que
repite sería ruido puro.

La lógica vive en `lib/scan/sample-display.ts`, pura y testeada, porque el
recuento y la etiqueta **tienen que coincidir**: si la lista dedujera "3
muestras" de una forma y el cajón de otra, el producto se contradiría sobre
cuántas veces preguntó. Cuenta índices distintos y no filas partido motores, a
propósito: un escaneo donde un motor falló en una repetición tiene un número
desigual de filas, y dividir daría una cifra falsa justo cuando algo salió mal.

---

## 25. Fuera el botón «Auditar ahora» (AUDIT-NO-BUTTON-1, 2026-08-05)

**Estado: implementada.** Petición directa del fundador: *"quita el botón
auditar ahora y pon la fecha en auditoría actualizada"*. Cierra la secuencia
que él mismo fijó el 2026-08-04 al aprobar §18 — primero que la auditoría
funcione sola, después retirar el disparo manual.

**Qué desaparece.** El botón, y con él la última pieza de la pantalla que
sostenía que la auditoría espera a que alguien la pida. Desde §18 corre sola
tras cada escaneo, así que el botón ofrecía trabajo que el producto ya no
necesita — y, peor, insinuaba que sin pulsarlo no pasaría nada.

**Qué queda en su sitio: nada.** La primera versión puso ahí una pastilla de
estado con la fecha dentro (`Auditoría actualizada · 5 ago 2026`). Al verla en
el preview el fundador cortó también eso: *"quitamos lo de auditoría
actualizada, dejamos solo la info de la cabecera"*. Y tenía razón — la
cabecera pegajosa ya dice **la fecha de la auditoría**, **si cubre el último
escaneo** (`· sobre el escaneo del …`, que sólo aparece cuando está al día) y
**«Auditando»** mientras una campaña corre. La pastilla repetía las tres cosas
un centímetro más abajo.

Lección, porque se repitió dentro del mismo PR: al quitar un control, la
tentación es sustituirlo por algo. A veces el hueco es la respuesta.

**La copia que mentía, corregida.** Tres textos seguían describiendo el mundo
manual: el *hint* de Salud técnica y el vacío del bloque técnico decían "al
pulsar «Auditar ahora»" (ahora "sola tras cada escaneo"), y el aviso de
conexión interrumpida pedía pulsar un botón que ya no existe (ahora "la
auditoría continuará sola"). También "Todavía **no has auditado**" pasa a "no
**se ha** auditado": ya no lo hace el usuario.

**Lo que NO se quita, y es deliberado.** `WebAuditProvider` sigue reanudando
sola una campaña a medias al abrir la página. No es un resto del botón: es lo
que hizo que la pantalla se curara sola el 2026-08-04 mientras la cola drenaba
despacio. No cuesta Gemini extra —es el mismo trabajo que haría el backend— y
el usuario ni lo pide ni lo ve. Sin control visible, deja de ser una ruta
manual y pasa a ser lo que siempre debió ser: un atajo invisible.

**Riesgo asumido, dicho claro:** ya no hay escotilla manual. Si la auditoría
automática falla, el usuario no puede forzarla. Es aceptable porque el fallo
definitivo avisa al operador por email y el cron diario reintenta, pero es un
grado menos de control del que había ayer.

**Lo que se pierde al quitar también la pastilla, y se acepta:** el mensaje de
error del reanudado en cliente ya no tiene dónde renderizarse. No es
silenciar un fallo accionable — el reanudado es invisible para el usuario, el
siguiente render lo reintenta y la cola del backend también—, pero conviene
que conste: hoy un fallo de esa ruta no se ve en pantalla. El banner de "plan
pausado a mitad de auditoría" sigue cubriendo el único caso que de verdad deja
al usuario atascado sin explicación.

---

## 26. El estado del escaneo, visible en móvil (EXTRACTION-RELIABILITY-1 Fase C, 2026-08-05)

**El problema.** En un móvil, en un proyecto con historial, durante un
escaneo no había **ninguna** señal en pantalla. Tres cosas se sumaban: el chip
`.scan-status` está oculto bajo el breakpoint móvil (`app/globals.css`), el
overlay a pantalla completa sólo se monta cuando todavía no hay datos que
enseñar, y la pastilla del sticky-header seguía diciendo "Escaneado 5 ago".
Reportado por el fundador desde su propio móvil: *"no veo ningún chip en
ninguna cabecera móvil que indique el estado de escaneando o actualizando"*.

Y la pastilla no es que faltara: es que **mentía justo cuando importaba**.
"Escaneado 5 ago" afirma que lo que ves es lo último que hay, mientras se
están cociendo datos nuevos.

**Qué se decidió.**

1. **El estado vive en la pastilla del sticky-header**, no en la barra de app.
   Esto es continuación de §3 (BRAND-5b-mobile-header), no una excepción a
   ella: aquella decisión estableció que la barra móvil no lleva contexto y
   que *"el contexto vive entero en el sticky-header de cada página"*, y ya
   descartó explícitamente una versión con esa info incrustada en la barra
   ("el header y la cabecera del body es redundante"). Esta fase usa el hueco
   que aquella designó.
2. **Tres estados en la misma pastilla**: `Escaneando…` mientras se consulta a
   los motores, `Analizando…` durante la extracción, y `Escaneado <fecha>` en
   reposo. La etiqueta de escaneo activo sale de `computeScanStage`, el mismo
   cálculo que la pantalla completa, para que las dos superficies no puedan
   discrepar.
3. **`ScanStatePill` es un componente compartido.** Antes la pastilla estaba
   duplicada en seis pantallas con cinco formateos de fecha distintos y tres
   condiciones distintas para el chip de al lado.
4. **Recomendaciones se alinea con las demás pantallas de datos.** Era la
   única que escondía su contenido entero detrás del overlay durante un
   escaneo; ahora el overlay sólo sustituye a la pantalla cuando no hay nada
   que enseñar, igual que en Prompts, Competidores y Páginas citadas.

**Por qué el punto 4 importa más de lo que parece.** Ese comportamiento era la
causa del `PILOT FAIL` repetido de "recommendations: estado vacío" (2026-08-04
y 05). Se explicó dos veces como una carrera con los datos del escaneo; no lo
era. El piloto estaba señalando una inconsistencia real de diseño y la
explicación cómoda la tapó dos veces.

**Pendiente / roto conocido.** El reparto 50/50 entre las dos etapas de la
barra a pantalla completa es una convención de presentación, no una medida —
ajustable con datos reales de duración. Y la Auditoría web mantiene su propio
chip "Auditando", que es otro concepto y no se ha tocado.

---

## 27. La auditoría te busca a ti cuando algo empeora (WEB-AUDIT-ALERTS-1, 2026-08-05)

**Estado: implementada. Migración `0029_notification_audit_regression_types.sql`
aplicada a mano en Supabase por el fundador el 2026-08-05**, en el mismo PR.
Antes de aplicarla el `CHECK` de `notifications.type` rechazaba los cinco tipos
nuevos y `emitNotification` se limitaba a registrar el fallo — fail-soft por
contrato, así que no rompía ninguna auditoría, simplemente no avisaba.
Invariantes de la zona en `.claude/rules/web-audit.md`.

**El problema.** Desde §18 la auditoría se refresca sola tras cada escaneo,
pero nadie te decía que el resultado de hoy es peor que el de ayer: tenías que
entrar a mirar. Esta fase invierte eso. Era la otra mitad de WEB-AUDIT-3
(`docs/specs/web-audit/phase-3-daily-audit.md`), aplazada con razón: dos
auditorías manuales separadas por semanas no son una regresión, son dos fotos
sueltas. Con datos que se refrescan solos, la comparación por fin significa
algo.

**Los seis avisos, y por qué en ese orden.** Se emiten a `notifications` (la
campana), enlazan a Auditoría web y reutilizan tal cual el leído/no leído que
ya existe:

| Aviso | Salta cuando | Severidad |
|---|---|---|
| `ai_bot_blocked` | un bot de IA pasa de poder leer tu web a estar bloqueado | crítica |
| `llms_txt_lost` | tenías `llms.txt` y ha desaparecido | crítica |
| `sitemap_lost` | tenías `sitemap.xml` y ha desaparecido | aviso |
| `page_unreachable` | una página que se analizó bien ayer hoy no responde | aviso |
| `surfacing_dropped` | un tema pasa de `performing` a `invisible` | aviso |
| `coverage_dropped` | un tema pierde cobertura de contenido propio | aviso |

Los cuatro primeros van delante a propósito: son fallos técnicos que ocurren
sin que nadie los toque a propósito —un cambio en `robots.txt`, un despliegue
que se lleva un fichero— y que te dejan invisible para la IA sin ningún
síntoma visible. Hoy te enterabas semanas después, si acaso.

**Los dos que no pedía el diseño, y por qué se añaden.** `sitemap_lost` sale
gratis (`sitemapFound` ya vivía en el snapshot desde WEB-AUDIT-R3) y es
exactamente la misma clase de fallo silencioso que `llms_txt_lost`.
`page_unreachable` es el caso clásico de "un despliegue se llevó una sección":
se compara sólo contra páginas que **la auditoría anterior analizó con éxito**,
y sólo cuentan `skipped_timeout` y `skipped_error` — un `skipped_not_html` o
un `skipped_offsite` son decisiones nuestras sobre una URL, y reportarlas como
caída sería una falsa alarma en el aviso cuya única virtud es que se le crea.

**La regla que hace que esto no sea ruido: todo es transición, nada es
estado.** Ningún aviso salta porque algo *esté* mal, sino porque *ha pasado* a
estarlo desde la auditoría anterior. Un `llms.txt` que sigue sin aparecer
mañana produce silencio, porque el "anterior" de mañana ya lo tenía perdido.
De ahí se derivan tres decisiones que parecen detalles y no lo son:

- **Sin lado anterior no hay aviso.** Una primera auditoría no tiene ayer.
  Tampoco lo tiene un campo que no existía en la fila antigua (`sitemapFound`
  en snapshots previos a WEB-AUDIT-R3): `undefined → false` es "antes no
  mirábamos", no "ha desaparecido".
- **Inconcluso no es regresión.** Un tema que pasa a `inconclusive` (un fallo
  transitorio de Gemini, un corte por presupuesto) mueve el porcentaje de
  cobertura sin que nada haya empeorado, y por eso la comparación es **por
  tema**, nunca entre los dos porcentajes.
- **Un bot que aparece bloqueado la primera vez que lo vigilamos no es una
  regresión**, es un descubrimiento sobre un `robots.txt` que no ha cambiado.
  El diseño decía "de permitido *o inexistente*"; se implementa sólo
  "permitido", porque disparar una alerta crítica el día que se añade un bot a
  `TRACKED_BOT_AGENTS` enseña al fundador a desconfiar justo del aviso que más
  falta hace que se crea.

**No se capa el número de bots bloqueados.** Un `Disallow: /` bajo
`User-agent: *` bloquea de verdad a los siete a la vez; recortar a tres
contaría un apagón total como si fuera parcial.

**Qué se ha decidido sobre el esquema, en contra de lo que decía la spec.** El
diseño de WEB-AUDIT-3 prometía "sin esquema nuevo", y era cierto cuando la
campana derivaba sus items al vuelo. NOTIF-SERVER-1a lo cambió: hoy `type`
tiene un `CHECK`, así que un tipo nuevo **es** una migración — una sola línea,
aditiva, sin tabla ni columna ni datos que migrar (`0029`). `ai_bot_blocked`
no se añade porque ya estaba permitido desde `0021` y ya tenía copy y clave;
el "bot_blocked" del diseño es ese mismo tipo, emitido por fin.

**Dónde se emite, y por qué también en la ruta manual.** En
`lib/web-audit/technical-audit.ts`, justo **después** del insert del snapshot
(un aviso sobre una auditoría que no llegó a persistir apunta a nada). También
en la ruta manual, no sólo en la automática: la comparación la hace valiosa el
refresco diario, pero quien pulsa «Auditar ahora» y se queda en la pestaña de
Cobertura tampoco se enteraría de que un bot acaba de quedar bloqueado — y la
regla de transición garantiza que sigue siendo un aviso por cambio real, no
uno por auditoría.

**Coste y presupuesto.** La mitad técnica no cuesta ninguna consulta: los dos
snapshots ya están en memoria. La mitad de cobertura cuesta dos lecturas
acotadas y es la que se sacrifica bajo presión —si fallan o tardan, se emiten
igualmente los avisos técnicos—. Lee **cuatro** mapas de cobertura, no dos,
porque `performing`/`invisible` se deciden por mayoría sobre una ventana de
tres escaneos: con menos, la campana clasificaría distinto que la pantalla a
la que enlaza. `TECHNICAL_RESERVE_MS` sube en `REGRESSION_ALERTS_BUDGET_MS`
(4 s) por la regla de la zona: quien añade trabajo por trabajo reajusta la
reserva, no sólo el límite del lote.

**Lo que queda fuera, a propósito.** `audit_completed` (fase 2 de
`notifications-v1.md`) sigue sin emitirse: avisar de cada auditoría diaria
correcta es exactamente el ruido contra el que se diseñaron estos avisos. Los
toggles de `/dashboard/settings/notifications` siguen en "Próximamente" — son
la fase 3 de esa spec y son una decisión de producto propia (¿el toggle
silencia el email, la campana, o ambos?).

---

## 28. Verlas es leerlas (NOTIF-AUTOREAD-1, 2026-08-05)

**Estado: implementada.** Petición directa del fundador: *"quiero que las
notificaciones, una vez que el cliente abre la campana o las ve directamente,
se marquen como leídas. Si no es un coñazo darle al botón de leída siempre y
siempre aparece que hay algo pendiente de leer."* Segundo control manual que
cae en dos días, por la misma razón que el de §25: pedía trabajo para
confirmar algo que el producto ya sabía.

**El fallo real no era el clic, era el punto azul.** Un badge que nunca se
apaga solo deja de ser información en la segunda semana. Como marcar leído
requería un botón aparte, el estado por defecto de la campana era "hay algo
pendiente" — siempre, incluso justo después de mirarlo. La señal medía la
memoria del usuario, no si había novedades.

**Qué desaparece.** «Marcar leídas» del panel de la campana y «Marcar como
leídas» de la cabecera de `/dashboard/notifications`, con sus estilos
(`.notif-mark-read`, `.notif-page-mark-read`). Abrir el panel marca; abrir la
página marca. No queda nada en su sitio — la lección de §25 aplica igual.

**Se marca lo que se ha visto, no "todo lo no leído".** `markAllNotificationsRead()`
(sin argumentos) pasa a `markNotificationsRead(ids)`. Es la diferencia entre
un cambio correcto y uno que borra datos en silencio: la campana carga como
mucho 15 filas, así que "marca todo lo no leído del usuario" al abrirla habría
enterrado notificaciones que nunca llegaron a una pantalla. Con la lista
explícita, si hay 40 sin leer y la campana enseña 15, quedan 25 esperando en
la página (que carga 50) — el badge sigue encendido y **con razón**.

**El punto de cada fila no se apaga al abrir, y es deliberado.** Marcar leído
al abrir tiene un fallo obvio: la lista se blanquea bajo los ojos de quien la
está leyendo, y la pestaña «No leídas» se vacía sola. Así que hay dos
preguntas distintas (`lib/notifications/seen.ts`), no una:

- *¿queda algo por ver?* → el punto de la campana y su contador. Se apaga al
  abrir, sin esperar al round-trip del servidor.
- *¿esta fila conserva su punto?* → sí, durante el resto de la sesión, aunque
  el servidor ya haya escrito `read_at`. Desaparece en la siguiente carga
  completa, cuando ya ha cumplido su función.

La pestaña «No leídas» y su contador se rigen por la segunda, para que
describan la lista que se está mirando y no el badge que ya se apagó.

**Si la escritura falla**, se olvida el envío y el siguiente abrir lo
reintenta; los puntos se quedan como estaban. Lo que no hace es fingir
éxito: sin `revalidatePath`, la próxima navegación vuelve a traer el estado
real del servidor.

**Riesgo asumido:** ya no hay forma manual de marcar leído ni de marcar **no**
leído. Lo segundo nunca existió, así que no se pierde nada; lo primero deja de
tener sentido cuando mirar basta. Lo que sí queda pendiente y conviene que
conste: **no hay descarte individual** de una notificación (D1 de la spec lo
contemplaba), y sigue sin haberlo.

**El vacío deja de ser un agujero, porque pasa a ser el estado normal.** Con
auto-read, la pestaña «No leídas» se queda en cero en cuanto alguien abre la
pantalla una vez: el estado que antes era el raro es ahora el que más se va a
ver. Y era una línea gris centrada bajo una tarjeta de 150px con 700px de
lienzo en blanco debajo — el piloto lo leyó como *"¿esto ha terminado de
cargar?"* en vez de *"no tienes pendientes"*. Ahora lleva icono en círculo
tenue (misma pareja `--brand-blue-soft` que ya usan las filas, no un color
nuevo), titular —**«Estás al día»**, que responde a la pregunta en vez de
describir la ausencia— y una línea que dice dónde aparecerán las nuevas.

**Efecto colateral sobre el piloto, dicho antes de que lo descubra alguien.**
El barrido de interacciones del piloto ya casaba con la campana
(`[aria-expanded]` está en su allow-list), así que **cada pasada del piloto
escribe ahora `read_at`** en las notificaciones de su cuenta. El piloto
siempre-activo se anunciaba como "estrictamente de sólo lectura"; desde esta
fase es "sin escrituras salvo ésta, nombrada"
(`docs/agentic-user-pilot.md`, Scope guard). Se acepta sin aprobación aparte
porque está acotado en las cuatro dimensiones que importan —idempotente, sólo
filas de la propia cuenta del piloto, sin coste de LLM, sin consumir cupo de
plan— y porque impedirlo obligaría a sacar la campana del barrido, que es
justo el control que hay que mirar.

**El piloto se comía el estado que venía a medir.** Segundo intento, segundo
hueco, y éste era estructural: el barrido genérico de interacciones abre la
campana en ~14 pantallas × 3 viewports *antes* de que el journey dedicado
llegue a su primera aserción (`core-flow.spec.ts` va antes por orden de
fichero, con `workers: 1`). Y abrir la campana **es** la escritura que se
quería observar, así que el journey encontraba siempre cero sin leer y se
anotaba a sí mismo como no verificable — cada pasada, no sólo aquella. No se
arregla sembrando datos una vez. Se arregla en la raíz: **el barrido ya no
toca la campana** (`explore.ts`, `refuseReason`). No cuesta cobertura —el
journey dedicado la ejercita mucho mejor que un clic a ciegas— y de paso
devuelve la escritura de ~42 por pasada a una sola.

**La captura mentía, y el juicio sobre ella también.** El agente leyó el panel
a 375px como "descentrado y solapando el título". Mirando la PNG, ni una cosa
ni la otra: el panel está anclado a la derecha bajo la campana y ocupa casi
todo el ancho porque 320px en 375 es casi todo el ancho. Lo que sí se veía era
**medio transparente, con la página traspasándolo**, y eso tampoco era un
defecto del producto: `menuIn` anima la opacidad 0→1 en 140 ms y la captura se
tomaba a mitad del fundido. `captureInteraction` no pasaba
`animations: "disabled"`, así que **toda** la suite llevaba fotografiando
popovers, menús y cajones a medio aparecer. Arreglado ahí, no en el CSS del
panel: el defecto estaba en el instrumento, y "arreglar" el componente habría
sido cambiar código bueno por una foto mala.

**El primer PASS del piloto no probaba nada de esta fase.** El run mecánico
del commit inicial dio ✅ en 41 pantallas a tres viewports y ni una era
notificaciones: el barrido genérico agota su presupuesto (4 candidatos por
pantalla) en nav/campana/InfoTip antes de poder afirmar nada sobre *qué hizo*
el clic. Mismo patrón que dejó sin ver las pestañas de auditoría en el PR #289
(§17). De ahí `tests/pilot/journeys/notifications.spec.ts`: fija con
aserciones lo que ninguna captura demuestra —que el punto de la cabecera se
apaga, que los de fila **no**, que no vuelve ningún botón de marcar leídas, y
que al navegar y volver la escritura persistió— y **anota en voz alta** cuando
la cuenta no tiene nada sin leer, en vez de pasar en silencio.

---

## 29. El GeoScore incorpora la salud técnica, y el número se explica (GEO-SCORE-V4, 2026-08-05)

Petición del fundador: *"quiero que tu prioridad sea que esa métrica sea lo
menos variable posible, escaneo a escaneo, porque a veces, de uno a otro, han
cambiado treinta puntos"*, y *"que tenga en cuenta la nota de auditoría técnica
dentro de la puntuación de GeoScore de manera importante"*.

La decisión técnica completa —pesos, resolución del snapshot, coste de la
frontera de versión— vive en **ADR 0033**. Aquí quedan sólo las decisiones de
producto y de pantalla.

**Decisión 1 — el GeoScore cambia de significado, y se dice.** Pasa de medir
*resultado observado* a medir *resultado + preparación*. Es un cambio de
naturaleza, no un ajuste: hasta hoy el número respondía "¿te nombran las IAs?"
y a partir de ahora responde "¿te nombran, y está tu web en condiciones de que
te nombren?".

**Decisión 2 — el desglose por componentes deja de ser opcional.** Un compuesto
que mezcla dos naturalezas sin desglose visible es un número que no se puede
accionar: el usuario no puede distinguir "subió porque arreglaste la web" de
"subió porque las IAs te citan más". El desglose estaba *tipado* en la Visión
general desde v2 y no se renderizaba nunca. Con v4 se renderiza, con el valor
de cada componente y el motivo persistido cuando uno se cae. Un componente
caído se pinta como caído, jamás como cero.

**Sin pesos** (fundador, 2026-08-05): la primera versión mostraba el peso
aplicado bajo cada valor y sobraba — para saber qué movió el score basta el
valor, y cinco porcentajes convertían la tarjeta principal en una explicación
de metodología. Los pesos siguen en `details_json`; si alguna superficie
futura los muestra, tienen que ser los renormalizados (ADR 0017).

**La fila técnica nunca desaparece.** Un escaneo anterior a v4 no tiene el
componente persistido, y la primera versión simplemente no pintaba la fila: el
desglose tenía cuatro filas en unos proyectos y cinco en otros, sin decir por
qué — el fundador lo detectó en el preview antes del Human Gate. Ahora la fila
aparece siempre y, cuando el escaneo es anterior, dice que lo es y que el
próximo escaneo la incluirá. Es la misma regla que `.claude/rules/scan.md`
aplica a las filas mudas: un hueco sin explicar es peor que un dato ausente.

Esto **supersede parcialmente §17 decisión 4 y §22 decisión 1**, que decidieron
no mezclar técnica con resultado. No se borran: aquella lectura era correcta
mientras el GeoScore midiera sólo resultado. El aviso de §22 —que la nota
técnica a una columna del GeoScore se lee como una segunda puntuación— sigue
vivo y es justo lo que el desglose etiquetado resuelve.

**Decisión 3 — un escaneo medido sobre menos motores lo dice en la cara.**
Hasta hoy, si un proveedor tenía un mal minuto, el escaneo no fallaba: perdía
filas en silencio y el score se recalculaba sobre otra escala (13 puntos en la
reproducción de `docs/geo-score-variability-2026-08.md` §1). Ahora se persiste
el veredicto de cobertura y la pantalla lo dice, nombrando el motor que faltó.
El número no se toca: se toca lo que se afirma sobre él.

**Decisión 4 — los alias de marca salen del SQL.** `projects.brand_aliases`
decide desde ADR 0025 si una respuesta cuenta como mención —es decir, mueve el
score— y sólo se podían inspeccionar por consulta directa. Era el riesgo que
ADR 0025 aceptó sin mitigar y la causa raíz del salto de 44 puntos del
fundador ("Firefox" no casaba con "Mozilla"). Ahora se ven, se añaden y se
quitan desde el producto.

**Pendiente conocido, escrito para que nadie lo lea como cerrado:**

- **La pantalla de Escaneos aún no cumple la decisión 2.** Publica el GeoScore
  de cada run histórico como número suelto, sin desglose ni enlace a uno, así
  que desde ahí no se puede saber que el número incluye ahora un componente
  técnico que vale hasta un 20 %. La obligación del ADR 0033 §7 sigue en pie:
  esto es un hueco, no una excepción.

- En los planes sin auditoría web (todo lo que no es Pro) el componente
  técnico se cae siempre, así que su GeoScore es el de cuatro componentes —v3
  en la práctica—. Extender una auditoría *sólo técnica* (que no gasta LLM) a
  todos los planes es una decisión comercial del fundador, no un efecto
  colateral de esta fase.
- El score de ventana (mediana de los últimos 3 escaneos comparables) está
  calculado y probado, pero **no se ha promovido a cifra principal de ninguna
  pantalla**. Cambiar el número que el usuario ve como titular merece su propia
  validación con el fundador delante.
- El pin del modelo de Gemini sigue pendiente: `gemini-2.5-flash` es un alias
  flotante que ADR 0002 prohíbe, y re-pinearlo exige observar un `modelVersion`
  real en producción. Inventar un id versionado rompería todos los escaneos.

---

## 30. La salud técnica deja de ser de pago (WEB-AUDIT-TECH-ALL-PLANS-1, 2026-08-05)

Decisión del fundador el mismo día que se cerró GEO-SCORE-V4: *"Auditoría en no
pro: la extendemos"*. El razonamiento técnico completo está en **ADR 0035**;
aquí quedan las consecuencias de pantalla.

**Por qué había que decidirlo ya.** El GeoScore acababa de incorporar la nota
técnica con peso 0,20 (§29). Con la auditoría cerrada por plan, ese componente
se caía siempre por debajo de Pro y el score renormalizaba a cuatro
componentes: el número principal del producto **medía cosas distintas según lo
que pagaras**. La asimetría duró horas.

**Decisión 1 — la mitad técnica se abre, la de cobertura no.** La cobertura son
llamadas a Gemini por lotes y ahí sí hay gasto; la técnica es fetch y regex.
Lo que sigue siendo Pro es la parte cara y la que interpreta contenido.

**Decisión 2 — «no está en tu plan» nunca se pinta como «sin auditar».** Son
hechos distintos: uno se arregla escaneando, el otro cambiando de plan.
Confundirlos le dice al usuario algo falso sobre sus propios datos, y es la
misma familia de error que §22 ya señaló con la nota técnica junto al GeoScore.

**Decisión 3 — un plan sin cobertura no está «Parcial».** En la columna
Auditoría de Escaneos, «Parcial» significa *el trabajo se quedó a medias*, e
invita a esperar algo que no va a llegar nunca. Un plan que sólo tiene la
mitad técnica tiene su auditoría **completa** para lo que incluye, y así se
etiqueta.

**Coste comercial, dicho de frente:** la auditoría técnica era parte de lo que
distinguía a Pro, y abrirla resta un motivo para subir de plan. A cambio, el
número principal significa lo mismo para todo el mundo. Fue una decisión
consciente, no un efecto colateral.

---

## 31. El número grande deja de ser un escaneo (SCORE-WINDOW-1, 2026-08-05)

Fundador: *"Implementa el score de ventana en real"*. La decisión técnica está
en **ADR 0036**; aquí, lo de pantalla.

**Decisión 1 — el titular es la mediana de los 3 últimos escaneos
comparables.** Es la última palanca contra la varianza que quedaba: los motores
hacen recuperación viva y ninguna fórmula la quita. Se decidió el mismo día en
que se midió que tampoco se puede pinear el modelo de Gemini —no existe id
versionado—, así que esta fuente de ruido no tenía otra salida.

**Decisión 2 — dónde se explica que es una mediana.** La primera versión lo
decía bajo el gauge: *"Mediana de tus N últimos escaneos comparables · este
escaneo: X"*. **El fundador la retiró el mismo día, tras verla funcionando**:
sobraba en la pantalla principal.

La obligación de fondo no se retira con la línea —el usuario tiene que poder
saber qué cantidad está mirando—, así que la explicación se movió a la página
pública de metodología, que además estaba desactualizada (seguía describiendo
cuatro componentes cuando v4 tiene cinco). El riesgo que se asume, dicho:
alguien que escanee y vea el número apenas moverse no tiene en pantalla nada
que se lo explique. El número de su escaneo concreto sigue visible en la frase
de arriba ("aparece en X de Y respuestas… con una puntuación GEO de Z").

**Decisión 3 — todo lo que cuelga del titular mide lo mismo que él.** La banda
se calcula sobre la ventana; el delta es ventana contra ventana (restarle a la
mediana de hoy el score crudo de ayer compararía dos cantidades distintas); y
la evolución dibuja la serie de ventanas, no los runs. Un gauge con mediana
sobre una línea de scores por escaneo son dos métricas en la misma tarjeta.

**Decisión 4 — la frase narrativa sigue con el score del escaneo.** Dice
"aparece en X de Y respuestas… con una puntuación GEO de Z": describe *ese*
escaneo, y emparejar esos datos con la mediana atribuiría una cifra a unos
datos que no la produjeron.

**El coste, dicho:** una mejora real tarda dos escaneos en llegar del todo al
titular. Se gana que deje de saltar treinta puntos por ruido.

**Decisión 5 — fuera el GEO Score de la tabla de Escaneos** (fundador,
2026-08-05: *"Yo veré la puntuación de los Escaneos en la página de debug"*).
Con el titular convertido en mediana, una columna de scores por escaneo al lado
enseñaba **dos números distintos del mismo proyecto** sin decir cuál manda. El
score por escaneo pasa a ser dato de inspección, no de producto.

Se van con ella la columna «Δ Score» y su línea explicativa al pie: existían
para hacer honesta una comparación que ya no se publica. Esto **supera a
DELTA-GUARD-1 (§23) en esta pantalla** — no porque aquella decisión fuera
errónea, sino porque la superficie que arreglaba ha dejado de existir. La
regla de `resolveDelta` sigue viva y vinculante en todas las demás.

**Hueco declarado, más estrecho que antes:** las tarjetas de dominio (arriba de
esa misma pantalla) y el resumen semanal siguen mostrando el score del último
escaneo, no la mediana. Ahí sí puede haber discrepancia con Visión general.
Está pendiente de decidir si pasan a la ventana o se quedan como están.

---

## Cómo mantener este documento

Cuando una sesión futura cierre una fase de diseño (nueva zona repintada,
cambio de header/menú, rediseño de una pantalla) que toque layout, paleta,
tipografía o patrones de navegación:

1. Añadir una entrada nueva a la zona correspondiente (o crear una zona
   nueva si no existe) con: qué se decidió, por qué, y qué queda pendiente
   o roto conocido.
2. Si una decisión previa queda **sustituida**, no borrarla — marcarla como
   `superseded por §X` y explicar el porqué del cambio, igual que hace
   `docs/adr/` con las decisiones técnicas.
3. Enlazar el PR/ADR real cuando exista, en vez de reexplicar el detalle
   técnico aquí (este documento es "qué se decidió", no "cómo se
   implementó").
