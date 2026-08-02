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

## 9. Página de Auditoría web (WEB-AUDIT-ISSUES-1, 2026-08-02)

**Estado: fase 1 (derivador) implementada y mergeada (PR #288). Fase 2 (esta
entrada) implementada, pendiente de Human Gate.**

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
   `PILOT_PROJECT_ID` fijado) no tiene ninguna auditoría completada** —
   toda la sección nueva vive detrás de ese gate (`!summary`), así que ni
   el sweep de interacciones ni ninguna captura llegaron a ver Problemas/
   Correcto/Páginas, sólo el estado vacío. Sigue sin arreglar — necesita
   que el proyecto piloto tenga datos reales, algo que sólo el fundador
   puede sembrar (o una fase de journey de escritura scoped, como
   UX-PILOT-2a, con su propia aprobación).

Además, se añadió un check mecánico nuevo en `tests/pilot/support/
journey.ts` (`headerInteractiveControls`, parte de `assertPageIsHealthy`):
falla automáticamente si CUALQUIER página futura mete un control
interactivo dentro de `.ov-sticky-header`, sin depender de que un agente
o un humano lo note en una captura. `pnpm pilot:selfcheck` verificado en
verde tras el cambio.

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
