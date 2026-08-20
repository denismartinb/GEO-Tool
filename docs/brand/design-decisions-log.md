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

## 32. Escaneos se parte en dos: «Dominios» y `/debug` (DOMAINS-REDESIGN-1 Fase A, 2026-08-05)

**Estado: implementada la Fase A.** Diseño explorado en tres iteraciones con el
fundador el mismo día y aprobado ("Apruebo el plan"). La referencia visual vive
en `docs/design-reference/domains-redesign-1/` — dos HTML a pantalla completa
más el artefacto de exploración y el Task Intake.

**El problema.** `/runs` mezclaba tres cosas de tres dueños: una rejilla de
dominios (del cliente), un historial con lanzamientos, duraciones, auditoría,
deltas y errores (nuestro), y un interruptor de escaneo diario (nuestro
mientras contenemos coste antes de producción). Petición del fundador: *"la
información que tiene a día de hoy no se debe presentar al usuario"*.

**Qué se decidió.**

1. **`/dashboard/domains` — «Dominios»**, opción B («Escenario») de las tres
   exploradas: portada del dominio activo (icono, identidad, puntuación GEO,
   frescura de escaneo y auditoría, botón «Visión general») y raíl inferior para
   cambiar. **A partir de cuatro dominios el raíl pasa a rejilla**, que es la
   opción A absorbida como estado de desbordamiento: un scroll horizontal
   esconde lo que no cabe, y el dominio que no se ve deja de existir para quien
   tiene que elegirlo.
2. **Cero controles en la pantalla de cliente.** Que escanee y audite cada día
   se cuenta con una línea informativa y con la frescura, nunca con un botón.
   Mismo criterio que AUDIT-NO-BUTTON-1 (§25).
3. **Sólo la puntuación GEO y su delta.** Ninguna segunda métrica, por regla y
   no por gusto: el día que esta pantalla y Visión general calculen lo mismo por
   caminos distintos, se contradicen.
4. **`/debug`** se queda el historial íntegro, los interruptores y el borrado de
   dominio, con una banda «Interno» arriba. Sin entrada en el menú.
5. **Estado en cabecera, agregado.** Dominios es la primera cabecera de cuenta
   del producto, así que `computeAccountScanState` (`lib/domains/`) decide:
   un dominio activo → «Escaneando movistar.es»; varios → «N dominios en
   curso» (no se mezclan etapas: cada tarjeta lleva la suya); el escaneo gana a
   la auditoría, porque la auditoría corre *después* (§18); en reposo, sin
   pastilla.
6. **«Auditando» entra en `ScanStatePill`** y deja de ser el chip
   `.scan-status`. Cierra el pendiente literal que dejó §26 — ese chip está
   oculto bajo el breakpoint móvil, o sea el mismo fallo que §26 arregló para el
   escaneo, sin arreglar para la auditoría.

**Lo que se encontró leyendo el código, y era lo más importante del PR.**

- **`AutoExecuteScan` estaba montado en un único sitio del producto**
  (`runs/page.tsx`), y `createProject` redirigía justo ahí. Vaciar esa pantalla
  sin mover el driver habría dejado el primer escaneo de cada cliente nuevo
  colgado hasta que lo rescatase el cron. Ahora vive en Visión general, que es
  donde aterriza el onboarding.
- **Visión general no exportaba `maxDuration`.** `autoExecutePendingScan` es una
  Server Action y hereda el de su página (ADR 0003), así que mover el driver sin
  añadir `export const maxDuration = 60` habría matado cada ventana de lotes al
  límite por defecto de Vercel — en producción, en silencio, y presentándose
  después como un timeout de escaneo.
- **El driver va también en `/debug`**, porque el botón «Repetir escaneo» vive
  ahí (el de Visión general sólo existe en su estado vacío). Sin driver, ese
  botón crearía un run que nada empuja. Dos montajes son seguros por
  construcción: cada lote se reclama con un UPDATE atómico (SCAN-CHAIN-1).
- **`getWorkspaceCounters` publicaba una resta cruda como delta.** Es
  exactamente lo que DELTA-GUARD-1 (§23) corrigió en el historial, un mes antes,
  en la función de al lado. Ahora pasa por `resolveDelta`.

**El interruptor de auditoría, y por qué hubo migración.** El intake proponía
dejarlo global y de sólo lectura para no gastar una migración en un control que
el cliente nunca verá. El fundador pidió lo contrario —*"necesito el interruptor
para ahorrar costes en esa fase de pruebas"*—, así que la 0030 añade
`projects.auto_web_audit_enabled`, por defecto **true** (por defecto false
habría apagado las auditorías de todos los proyectos existentes al aplicarla,
que es un cambio de comportamiento que nadie pidió y que se vería igual que la
tubería rota).

El gate vive en `enqueueWebAuditJob` y no en el ejecutor, y esa colocación es la
decisión, no un detalle: hay **dos** rutas de encolado —el ejecutor en línea y
`backfillMissingWebAuditJobs` en el cron diario—, así que un gate en el ejecutor
lo habría deshecho el backfill horas después, reencolando justo la auditoría que
el fundador acababa de apagar. Falla **abierto** a propósito: si la lectura del
flag falla, se audita. De los dos errores posibles, "auditamos algo apagado"
cuesta una campaña y "dejamos de auditar todo" es invisible.

**Riesgo asumido, dicho claro:** apagar el interruptor no cancela un trabajo ya
encolado — el flag se mira al encolar, no al ejecutar. La copia lo dice ("no se
auditarán los **próximos** escaneos") en vez de prometer lo que no hace.

**Lo que se movió de sitio y el cliente pierde:** el borrado duro de dominio
(DATA-MGMT-1) vivía en cada tarjeta de la rejilla de Escaneos. La rejilla es
ahora Dominios, que por diseño no lleva controles, así que el borrado se queda
en `/debug`. Deja de estar al alcance del cliente en la consola. Es reversible y
está aquí escrito para que se note si algún día molesta.

**El fallo que encontró el piloto, y por qué la suite no podía verlo.** La
primera versión añadió `auto_web_audit_enabled` al `select` de
`requireActiveProject`, que es el cargador de **seis** pantallas y hace
`notFound()` si la consulta no devuelve fila. Como las migraciones se aplican a
mano, en el preview la columna todavía no existía: PostgREST devolvió error y
Prompts, Competidores, Páginas citadas, Recomendaciones, Auditoría web y
`/debug` daban **404 a la vez**. `pnpm test` (1525) y `pnpm run validate`
estaban en verde, porque nada en este proyecto comprueba el esquema real — el
fallo era estructuralmente invisible hasta abrir un navegador contra una base
sin migrar.

Corregido leyendo el flag donde se usa (`/debug`, con su propia consulta que
degrada a "activado" si la columna falta) y con una guarda estática sobre ese
`select` (`lib/project-workspace.test.ts`): añadir una columna ahí obliga a
editar el test, y editarlo obliga a leer por qué.

Regla que queda: **un cargador compartido no puede depender de una columna que
una migración manual todavía no ha creado.** El repo ya escribía las migraciones
con `add column if not exists`; el lado de lectura no tenía la tolerancia
equivalente.

**Cuatro correcciones salidas de mirar las capturas del piloto, no de su
tabla.** El run dio `PILOT PASS` con las tres pantallas en verde; el juicio
visual encontró lo que ninguna aserción mide:

1. **«Añadir dominio» a ancho completo en escritorio** era un rectángulo
   punteado gigante bajo una última fila coja. En rejilla pasa a ser la última
   celda: cierra la serie y tapa el hueco. En raíl (1–3 dominios) sigue fuera y
   a ancho completo, que es lo que la hace visible en móvil.
2. **La pastilla de frescura era verde siempre**, incluso en un dominio
   escaneado once días antes: el color afirmaba «al día» mientras la fecha decía
   lo contrario. Verde sólo hoy/ayer; el resto, neutro.
3. **Un delta de 0 se pintaba como «0»** pegado a la puntuación («43  0») y se
   leía como un segundo número. Cero no es una noticia: no se pinta.
4. **El número del gauge y su etiqueta se separaban** en móvil y tablet
   (`space-between` los mandaba a bordes opuestos). Agrupados.

Ninguna de las cuatro habría fallado un test: son juicio, y por eso el pilot
termina con capturas y no con un veredicto.

**Un atajo que faltaba, encontrado por el fundador en el primer smoke.**
`/debug` no está enlazada desde ningún sitio a propósito, y el efecto
secundario era que la única forma de llegar consistía en teclear a mano una URL
con un UUID dentro. `/dashboard/debug` redirige al `/debug` del dominio más
reciente (mismo criterio de reserva que la barra lateral y la portada de
Dominios). Sigue sin aparecer en ningún menú: es una URL que se recuerda, no un
enlace que se ve. La lección, que es del mismo tipo que la del cargador
compartido: **ocultar una pantalla no puede significar dejarla inalcanzable
también para quien la necesita.**

**El atajo, y el interruptor que mentía sobre por qué fallaba.** Dos hallazgos
del primer smoke real del fundador, el mismo día:

- `/debug` no estaba enlazada desde ningún sitio y la única vía era teclear una
  URL con un UUID dentro. La URL que él tecleó de memoria fue `/debug`, así que
  ahí vive ahora el atajo: resuelve el dominio más reciente y redirige.
  Protegida por `requireUser` como cualquier pantalla de consola. **Ocultar una
  pantalla no puede significar dejarla inalcanzable para quien la necesita.**
- Con la migración 0030 sin aplicar, el interruptor de auditoría se pintaba
  encendido y al pulsarlo devolvía «No se ha podido actualizar… vuelve a
  intentarlo». Reintentar no crea una columna: era un consejo imposible de
  seguir, y un control que parece operable y no puede funcionar gasta un intento
  del operador y además le miente sobre la causa. Ahora la lectura distingue
  tres estados y, si la columna no está, la fila dice qué falta
  (`0030_project_auto_web_audit.sql`) y no ofrece interruptor. El server action
  distingue además `42703`/`PGRST204` por si alguien fuerza el envío.

**Rev. 2 de Dominios (2026-08-05, mismo día).** Tras ver la pantalla en el
preview el fundador la rechazó entera —*"no me gusta nada"*— y aportó un mockup
propio, que queda como diseño aprobado en
`docs/design-reference/domains-redesign-1/dominios-rev2-aprobado.png`. Qué
cambia respecto a la rev. 1:

- **Bloque de título propio** en vez de la cabecera de 15 px: *kicker* +
  «Dominios» a 27 px + contador, con la pastilla de estado agregado a la
  derecha. No contradice §3: aquello describe la cabecera de las pantallas de
  **proyecto**, y ésta es de cuenta.
- **Portada con borde azul y fondo teñido**, icono a 72 px, píldoras
  «Seleccionado» y «En progreso», gauge semicircular junto a una frase que dice
  **qué mide** el número — lo único de la pantalla que lo explicaba, y no
  estaba—, y botón «Ver visión general» a ancho completo con chevron.
- **Se acabó el raíl**: siempre rejilla, dos columnas en móvil y cuatro en
  escritorio, con «Añadir dominio» como una celda más. La distinción
  raíl/rejilla por número de dominios desaparece con ella.
- **Los colores son los de marca, no los del mockup**, por petición explícita
  del fundador. El mockup fija estructura y jerarquía; la paleta la fija
  `brand-guidelines.md` §2.
- **Fuera la entrada «Dominios» del menú.** Se vuelve al gesto anterior:
  pinchar el bloque de dominio de la barra lateral. Es exactamente lo que la
  decisión de 2026-07-18 había establecido para Escaneos y que esta fase había
  roto al añadir una entrada propia — *"que no se enlace con un enlace nuevo
  desde el menú, sino pinchando en el propio dominio como ocurría antes"*.

**Descartado de ese mockup, y por qué:** lleva una **barra de pestañas inferior**
en móvil (Dominios / Informes / Alertas / Ajustes). No se implementa: contradice
§3, que decidió el drawer lateral como mecanismo de navegación móvil tras
evaluar y descartar alternativas, y además introduce dos secciones que no
existen. Cambiar la navegación de toda la consola es su propia fase, no un
efecto colateral del rediseño de una pantalla.

**El día que borré 955 líneas de CSS sin enterarme (2026-08-05).** Al aplicar
la bajada de escala de Dominios usé sustitución de texto sobre
`app/globals.css` entero. El bloque móvil lo localicé buscando
`@media (max-width: 560px)` — y esa cadena aparece **antes** en el fichero, en
el sistema de artículos del blog. El corte se llevó por delante ~930 líneas
intermedias: el arreglo del auto-zoom de iOS, el sistema `.art-*` completo y
todo lo que había entre medias.

**Nada del pipeline local lo detectó.** `pnpm test` (1526) y
`pnpm run validate` —build, typecheck y lint— pasaron en verde con el fichero
mutilado, porque borrar CSS no rompe ninguna de las tres cosas. Lo cazó el
piloto, y no en la pantalla que yo estaba tocando: `web-audit @ mobile:
horizontal overflow — scrollWidth 438px > viewport 375px`. Una pantalla que
este PR no toca, rota por CSS que este PR borró.

Dos reglas que quedan:

1. **Ninguna sustitución ciega sobre un fichero de 6.700 líneas.** Se acota
   primero el bloque (por sus marcadores de inicio y fin), se opera dentro y se
   comprueba después que el diff no sale de ahí. Es lo que se hizo al rehacerlo.
2. **Verde en local no es verde.** Es la segunda vez el mismo día que el
   pipeline aprueba algo roto — la primera fueron las seis pantallas en 404 por
   una columna que no existía. Las dos las encontró el piloto sobre un
   despliegue real. Cuando el coste de equivocarse es "una pantalla que no
   estoy mirando", la única prueba que vale es la que mira todas.

**Las tarjetas de la rejilla pasan de navegar a seleccionar (2026-08-05,
mismo día).** Hasta aquí, tocar un dominio de la rejilla llevaba directo a su
Visión general — el mismo gesto que la portada. El fundador probó eso en el
preview y pidió lo contrario: *"pinchar en un dominio de abajo debe
seleccionarlo y por tanto retornar a la misma página con ese dominio en la
card principal"*. La portada deja de ser sólo un escaparate del dominio más
reciente y pasa a ser el resultado de una elección.

Implementado con un parámetro en la propia URL —
`/dashboard/domains?active=<id>`— en vez de estado de cliente o una cookie de
sesión: la pantalla sigue siendo un Server Component puro, la selección
sobrevive a recargar y compartir el enlace, y no hace falta inventar
persistencia nueva para algo que dura lo que dura la navegación. `active` se
valida contra `projects`, que ya viene acotado por RLS — un id ajeno o
inexistente simplemente no casa con nada y cae al criterio de reserva de
siempre (el más reciente), igual que cuando no hay parámetro.

**Deliberadamente no tocado:** el bloque de proyecto de la barra lateral
(`proj-switch`) sigue sin enterarse de esta selección — deriva el proyecto
activo de la URL de las rutas `/dashboard/projects/[id]/*`, y `/dashboard/
domains?active=…` no es una de ellas. Elegir un dominio en Dominios no cambia
qué dominio ve la barra lateral en el resto de la consola; sólo cambia qué
portada ves en Dominios. Unificar los dos sería una noción de "dominio
seleccionado" a nivel de cuenta, persistida más allá de una URL — alcance
mayor, pedido explícito propio si algún día hace falta.

**Por qué `/debug` sí conserva la columna GEO Score y su delta.** El mismo día, SCORE-WINDOW-1 (§31) retiró esa columna de la pantalla de cliente con una condición explícita del fundador: *"Yo veré la puntuación de los Escaneos en la página de debug"*. No es una omisión de esta fase — es la mitad complementaria de esa decisión. La regla de `resolveDelta` (DELTA-GUARD-1, §23) sigue vigente aquí tal cual: §31 sólo la da por superada en la pantalla que dejó de existir.

**Pendiente / roto conocido.**

- **`/debug` no está protegida.** El intake proponía `OPS_USER_EMAILS` + 404; el
  fundador lo descartó por ahora (*"no he publicado aún la web"*). Matiz que yo
  mismo había exagerado y conviene dejar recto: la página pasa por
  `requireActiveProject`, que ya filtra por dueño, así que nunca hubo riesgo
  entre cuentas — lo peor era que un cliente viese sus propios internos y
  pudiera encender su escaneo diario. **Hay que cerrarla antes de abrir la web
  al público.**
- **Fase B pendiente:** los bloques de `/debug` que necesitan consultas nuevas
  (motores, salud de extracción por categoría, alertas al operador, cola de
  trabajos, respuestas con coste/latencia). Están diseñados en
  `pantalla-debug.html`, sin implementar.
- `/runs` queda como redirección a `/debug`; `/runs/[runId]` (detalle de
  escaneo) sigue donde estaba.

## 33. GEO para SaaS B2B — el segundo artículo semanal, y el primero apilado (GROWTH-3, W2, 2026-08-05)

**Estado: implementada.** Segunda pieza de la cola semanal autónoma
(`docs/content-calendar.md`, W2), en el cluster `sectores` que W1 abrió el
mismo día. Slug `geo-para-saas-b2b`, keyword primaria "geo para saas b2b".

**Se apila sobre la rama de W1, no sobre `main`, y eso fue una decisión.** W1
(PR #342) no sólo publicó un artículo: le dio a `sectores` su `pillarIntro`,
metió el cluster en el sitemap, y reescribió tres aserciones que codificaban
"sectores está vacío" (`lib/blog/posts.test.ts` y
`tests/pilot/journeys/public-pages.spec.ts`). Desde `main`, un segundo
artículo del mismo cluster **vuelve a necesitar exactamente esos cambios**, así
que partir de `main` habría significado escribirlos dos veces y colisionar con
#342 en el merge. La rama de W2 mergea la de W1 y añade encima su artículo;
cuando #342 entre en `main`, este PR se queda sólo con lo suyo. La regla
general que deja: **un artículo que abre un cluster crea una dependencia
estructural, y el siguiente artículo de ese cluster se apila, no se rehace.**

**Verificación de fuentes, que es donde falló W1.** W1 atribuyó a Capital One
Shopping Research una cifra que era del *2026 Retail Report* de Alchemer, y lo
encontró el subagente `qa`. `Stat` exige `source`, pero el tipo protege contra
la **ausencia** de fuente, no contra la fuente **equivocada** — no hay test
posible para eso. Aquí las tres cifras se cruzaron contra varias búsquedas
independientes antes de escribirlas, y una candidata se descartó por eso mismo:
el "44,2% de las citas sale del primer 30% del contenido" circula atribuido al
*AI Search Insight Report* de G2 y en realidad es de Growth Memo (Kevin Indig).
No está en el artículo.

**Dos límites del entorno, dichos porque afectan a lo que se puede afirmar.**
La política de egress de la sesión bloquea `g2.com`, `6sense.com`,
`businesswire.com` y `prnewswire.com`, así que **las cifras se verificaron por
búsqueda cruzada, no abriendo el informe primario**. Y las dos son de estudios
distintos con muestras distintas: G2 (1.076 responsables de compra, marzo de
2026) y 6sense (más de 4.000 compradores, noviembre de 2025). El artículo lo
dice en prosa, debajo del `StatGrid`, en vez de dejar que tres tarjetas
seguidas parezcan un solo estudio.

**Lo que el artículo declara que no sabe**, además de lo habitual: que no hay
dato de compradores en castellano, que "publicar el precio aumenta las
menciones" es deducción y no medición, y que **los dos estudios los publican
empresas con interés comercial en que esos números sean altos**. Esa última
línea no la exige ninguna regla; está porque callarla sería el mismo tipo de
omisión que la atribución mal puesta de W1.

**Un matiz que se cuenta en contra de la tesis.** El 61% del recorrido
completado antes del primer contacto **había sido un 69%** el año anterior: los
compradores contactan algo antes que hace un año, no más tarde. Se dice en el
texto en vez de coger sólo la mitad que conviene.

**Sin portada, en rojo a propósito.** `lib/blog/covers.test.ts` deja dos tests
rojos (`declara coverImage` y `el fichero de portada existe`) hasta que el
fundador deje `public/blog/geo-para-saas-b2b/cover.png` y se declare
`coverImage` en `lib/blog/posts.ts`. Es el diseño de §14 y de
`docs/agentic-weekly-post.md` §4: un check rojo es una pregunta visible; un
degradado con icono es un defecto invisible.

**Roto conocido, heredado de W1 y no arreglado aquí:** la `Figure` de
`geo-para-ecommerce` no pasa `label`, que es obligatorio en el tipo, así que su
pie renderiza un `<b>` vacío. El MDX no se comprueba con TypeScript, por eso no
lo para nada. La `Figure` de W2 sí lo pasa. Arreglarlo toca el artículo de otro
PR abierto y se deja para #342.

---

## 34. GEO para agencias — el cluster `sectores` cerrado, y la primera prueba de la cadena autónoma (GROWTH-3, W3, 2026-08-05)

**Estado: implementada.** Tercera y última pieza de la cola semanal en el
cluster `sectores`. Slug `geo-para-agencias`, keyword primaria "geo para
agencias". Con ella el cluster deja de tener huecos: ecommerce y SaaS B2B miran
al comprador; este mira a **quien vende el servicio**, que es un lector
distinto y por eso el artículo tiene una sección de "lo que NO puedes vender"
que los otros dos no necesitan.

**El ángulo salió del dato, no al revés.** Conductor mide que el tráfico de
referencia desde chats de IA es el **1,08%** de las visitas de una web, y a la
vez que el **25,11%** de las búsquedas de Google ya devuelven un AI Overview.
Pocos clics y presencia en todas partes, simultáneamente. Eso hace inviable la
propuesta comercial obvia ("vas a recibir visitas desde ChatGPT") y obliga a
vender otra cosa: presencia medida en la respuesta. El artículo se construyó
sobre esa tensión en vez de esquivarla.

**Dos estudios que parecen contradecirse y no se contradicen.** Conductor dice
que ChatGPT es el 87,4% del tráfico de referencia de IA; Similarweb dice que
ChatGPT cayó del ~76% al ~53% de las **visitas** a plataformas de IA entre junio
de 2025 y mayo de 2026. Miden cosas distintas —clics que salen frente a gente
que entra— y el artículo lo explica en lugar de elegir la mitad que conviene.
Es el mismo criterio que W2 aplicó a G2 y 6sense.

**Verificación de fuentes: dos atribuciones corregidas, y una la cazó QA.** La
primera búsqueda devolvió el 1,08% atribuido a "Similarweb y Semrush"; una
búsqueda dirigida lo desmintió (es de **Conductor**, noviembre de 2025). Se
descartó además el peso de ChatGPT en el tráfico de referencia por
inconsistente entre fuentes secundarias (87,4% frente a 92,4%): se publica sólo
el que casa con la metodología descrita por Conductor.

**Y aun así se coló una tercera, que bloqueó QA.** El artículo publicó un
`Stat` de "25% — cuota que sigue llegando desde búsqueda orgánica clásica"
atribuido a Conductor. La cifra existe en ese informe, pero **mide otra cosa**:
es el **25,11% de las búsquedas de Google que devuelven un AI Overview** (21,9
millones de búsquedas en EE. UU., 15-sep a 12-oct de 2025). QA lo bloqueó tras
cinco búsquedas cruzadas, ninguna de las cuales sostenía la lectura publicada.

Es **exactamente** el fallo de W1 (Capital One / Alchemer): una cifra real, del
informe correcto, pegada a la métrica equivocada. La lección que deja, y que
conviene no olvidar porque ya van dos: **el resumen de un buscador funde con
frecuencia dos hechos en una sola frase**, y leerlo entero no basta — hay que
buscar cada cifra *por separado y por lo que mide*, no por el titular que la
acompaña. Ningún tipo puede comprobar esto: `Stat` exige que haya `source`, no
que la etiqueta describa lo que la fuente midió.

Al corregirlo, el hueco no se rellenó con otra cifra cómoda: el artículo
**declara en prosa que no pudo sostener** la comparación "1,08% frente a 25% de
orgánico" que circula por ahí, y que los desgloses de orgánico por sector van
del ~18% al ~42% sin media limpia que enseñar.

**Qué se declara no saber:** que no hay encuesta pública fiable de tarifas GEO
en el mercado español (las cifras que circulan son de agencias anunciándose, no
de un estudio), que no está medido el tiempo hasta ver efecto, y que nadie sabe
si el 1% seguirá siendo el 1%. Más el apunte de conflicto de interés que ya
estrenó W2: Conductor vende software de visibilidad en IA y Similarweb vende
datos de tráfico; a los dos les conviene que el canal parezca grande.

### Lo que esta pieza probó además del artículo

W3 se escribió como **prueba real de la cadena de publicación semanal**, a
petición del fundador. Resultado, sin adornos:

**Lo que quedó demostrado:** redactar → validar → empujar → `weekly-post-pr.yml`
abre el PR y pide revisión → aviso a GitHub y push al móvil. La cadena funciona
de punta a punta.

**Lo que NO quedó demostrado, y es lo que importaba:** esta pasada corrió
**dentro de una sesión ya abierta**, que ya tenía el repositorio. La duda de
`docs/agentic-weekly-post.md` §9 —si una sesión disparada arranca con el
repositorio clonado— **sigue abierta**. Se intentó resolverla con un trigger de
sesión nueva y la llamada fue rechazada dos veces con `requires approval`: el
mismo muro que el §9 documenta. El sustituto usado (`CronCreate`) es
**de sesión y muere con ella**, así que no sirve para los lunes.

**Consecuencia para quien retome esto:** la automatización semanal sigue sin
estar cerrada, y lo que falta no es código de este repositorio — es aprobar una
vez el permiso de creación de rutinas. No lo des por resuelto porque haya tres
artículos publicados.

**Tres PRs apilados a la vez.** W2 sobre W1 y W3 sobre W2. Funciona y evita
duplicar el trabajo estructural, pero el orden de merge deja de ser opcional:
#342 → #346 → #349. Con esto hay **6 PRs abiertos** y `CLAUDE.md` fija el
máximo en 3 — se hizo porque el fundador pidió la prueba explícitamente, y
queda dicho aquí para que conste que fue una excepción consciente y no un
descuido.

---

## 35. Las portadas dejan de ser una dependencia manual (GROWTH-3, 2026-08-05)

**Estado: implementada.** Los tres artículos del cluster `sectores` pasan a
tener portada propia, dibujada en SVG en este repositorio:
`public/blog/<slug>/cover.svg`. Con eso `lib/blog/covers.test.ts` queda **en
verde entero** y desaparece el aviso que §4 de `docs/agentic-weekly-post.md`
daba por inevitable en cada artículo semanal.

**No contradice ADR 0028, lo aplica.** Ese ADR eligió como fuente principal la
**opción 4 — maquetas construidas en SVG/CSS**, y rechazó la ilustración
generada por IA y el stock. Una portada dibujada a mano en SVG dentro del repo
es exactamente la opción adoptada: no es una imagen generada ni licenciada, es
un activo del proyecto, versionado, legible en el diff y editable.

**Y siguen siendo evidencia, no decoración**, que es la regla dura de ADR 0028.
Cada portada dibuja la tesis de su artículo:

- `geo-para-ecommerce`: una respuesta con tres huecos, dos ocupados y el
  tercero vacío y punteado — "o sales, o no existes", sin segunda página.
- `geo-para-saas-b2b`: cuatro preguntas anónimas encadenadas que desembocan en
  el botón de demo, con la línea de "aquí te enteras tú" al final del todo.
- `geo-para-agencias`: una capa de respuesta ancha frente a un hilo de clics
  mínimo que llega a la web del cliente.

**QA bloqueó la primera versión de `geo-para-agencias`, y tenía razón —
distinto ADR, mismo tipo de error que el de las cifras.** La primera versión
del SVG llevaba texto real incrustado: "1,08%" y "1 de cada 4 búsquedas ya se
responde antes del clic". La enmienda de 2026-08-04 a ADR 0028 dice, literal:
*"Una portada puede ser generada o de stock, pero no puede representar una
interfaz de producto, un gráfico, un panel ni una métrica. Si la portada
enseña algo que parece un dato de Genscore, ese dato tiene que existir — y
entonces ya no es una portada, es una figura, y le aplica la regla del
cuerpo."* Una cifra citable no basta: una portada no tiene pie de figura donde
colgar la fuente, así que una cifra ahí queda huérfana de cita aunque sea
verdadera. Corregido quitando las dos cifras y dejando sólo la forma —la
franja ancha frente al hilo fino— con dos frases sin números ("La respuesta
está en todas partes. La visita, casi en ninguna."). El número exacto sigue
viviendo donde tiene que vivir: en el `StatGrid` del cuerpo, con su fuente.

La rejilla de 21 bloques de opacidad variable no cuenta como "un gráfico" en el
sentido de la enmienda: no traza ningún valor medido a lo largo de un eje, es
textura decorativa del mismo tipo que las tarjetas de respuesta de los otros
dos SVG. La tarjeta "la web del cliente" tampoco cuenta como "un panel" de
producto: son barras grises genéricas sin texto real, el mismo lenguaje visual
que ya usan las otras dos portadas para "una respuesta genérica".

**Un detalle técnico que no es cosmético.** `next/image` **se niega a servir
SVG** salvo que se active `dangerouslyAllowSVG`, y ese flag es **global**:
afectaría a todas las imágenes del sitio, incluidas futuras remotas, y un SVG
puede llevar script dentro. En vez de eso, `components/blog/blog-cover.tsx`
marca `unoptimized` sólo cuando la ruta acaba en `.svg`. El permiso queda
acotado a ficheros estáticos escritos en este repo, y un SVG no gana nada
pasando por el optimizador porque ya es vectorial.

**Lo que queda pendiente y con dueño.** Los tres artículos de la deuda
congelada (`que-es-el-geo-score`, `llms-txt-guia-practica`,
`como-conseguir-que-chatgpt-te-cite`) siguen sin portada y siguen exentos por
`COVER_DEBT`. Ahora que existe una vía para producirlas, esa deuda **puede
encogerse hasta cero** en una fase propia — el test ya está construido para
eso: la lista sólo puede menguar. Y `docs/agentic-weekly-post.md` §4, que
describe la ausencia de portada como inevitable, **queda desactualizado**: hay
que reescribirlo cuando esta vía se dé por buena.

### Segundo hallazgo, del `ux-pilot`: el lienzo no cabía en su propio marco

La primera versión de las tres portadas usaba un `viewBox` de 1200×630 — un
lienzo casi cuadrado — dentro de un contenedor real que mide **1124×96px** en
la portada compacta del artículo en desktop (`.blog-cover-compact`, CSS línea
~4873). Con `object-fit: cover` centrado, el navegador escala hasta cubrir el
ancho y recorta el resto en vertical: en ese caso concreto sólo sobrevive el
**16% central** del lienzo (y≈264–366 de 630).

El `ux-pilot` lo detectó comparando el SVG fuente contra las capturas reales,
no a ojo: la fila 3 de `ecommerce` (el hueco vacío, la tesis explícita del
artículo), la etiqueta "Aquí te enteras tú" de `saas-b2b`, y el título y las
frases de `agencias` **no aparecían en ninguna captura de escritorio ni de
tablet** — sólo en móvil, donde el contenedor es proporcionalmente más
parecido al lienzo y por eso recorta menos. Verificado de forma independiente
con la propia matemática del CSS antes de aceptar el hallazgo: el número
coincide.

**Corregido cambiando la proporción del lienzo, no sólo su contenido.** Las
tres portadas pasan de `viewBox="0 0 1200 630"` a `viewBox="0 0 1200 300"`, con
todo el contenido con valor recolocado dentro de la franja y≈100–200 —la única
que sobrevive al recorte real del peor caso (escritorio)—, dejando el resto del
lienzo para el resplandor decorativo, que no pierde nada al recortarse. Se
verificó recortando programáticamente cada SVG a la ventana exacta que vería
un navegador en el peor caso (1124×96px) antes de dar el fix por bueno — las
tres muestran su contenido completo en esa ventana.

**La lección, para la próxima portada que se dibuje**: diseñar contra la
ventana de recorte real del contenedor CSS, no contra el lienzo completo. El
propio SVG lo deja escrito en un comentario a partir de ahora.

### Tercer hallazgo, del `ux-pilot` otra vez: había una CUARTA ventana, más agresiva que la probada

La verificación anterior sólo probó **una** ventana de recorte (la del
artículo en escritorio, 1124×96). Existen otras cuatro contenedores reales, y
el `ux-pilot` encontró que la más agresiva de todas — la **tarjeta de `/blog`
y `/blog/sectores` en móvil, 319×170px** — recorta mucho más que la probada:
sólo sobreviven **563px centrados** del lienzo de 1200, frente a los 1200px
completos que sobrevivían en el caso ya arreglado. El texto alineado a la
izquierda de las tres portadas —que empezaba en x≈90— perdía ahí su mitad
izquierda: "Aquí te enteras tú" se leía "rta ya está hecha".

**Verificado con las cinco ventanas reales, no una sola, antes de aceptar el
segundo fix:**

| Ventana | Contenedor | Recorte |
|---|---|---|
| Artículo, escritorio | 1124×96 | vertical, x completo |
| Artículo, tablet | 712×96 | vertical, x completo |
| Artículo, móvil | 319×96 | horizontal, ±102px |
| Tarjeta, escritorio | 1124×170 | vertical, x completo |
| Tarjeta, tablet | 712×170 | vertical, x completo |
| **Tarjeta, móvil** | **319×170** | **horizontal, ±318px — la que manda** |

**Corregido quitando el texto de las tres portadas, no ajustando su posición
otra vez.** El patrón de "recolocar el mismo contenido dentro de una franja
más pequeña" ya había fallado dos veces (fila 630→300, ahora la ventana
horizontal). En vez de perseguir una quinta ventana con texto cada vez más
frágil, las tres portadas pasan a ser **sólo forma**: el elemento con más
significado (el hueco vacío punteado en ámbar, el botón sólido, el hilo hacia
la tarjeta del cliente) va centrado en (600,150) — el único punto que
sobrevive a las seis combinaciones—, y los elementos decorativos se abren
hacia los bordes, donde pueden recortarse sin perder nada porque no llevan
información, sólo ambiente.

**Esto resuelve dos hallazgos a la vez.** Sin texto no hay palabra que cortar
a la mitad en ningún recorte futuro — el motivo de las dos rondas anteriores
desaparece por diseño, no por ajuste fino. Y de paso responde a la duda
abierta sobre la enmienda de ADR 0028 ("¿parece un panel de producto?"): un
botón sin la palabra "Demo" y unas cajas numeradas sin números leen como pura
forma abstracta, no como una maqueta de interfaz — el `ux-pilot` había
marcado el botón como "el elemento más próximo a un CTA real de producto"
precisamente por su etiqueta de texto, que ya no existe.

Verificado recortando programáticamente las tres portadas contra las **seis**
ventanas antes de empujar: el motivo central se ve completo en todas.

---

## 33. `/debug` sigue al dominio que la consola tiene abierto, no al más reciente (DEBUG-ACTIVE-PROJECT-1, 2026-08-06)

**El problema, reportado por el fundador.** El atajo `/debug` (§32) resolvía
"el proyecto" con el mismo criterio de reserva que la barra lateral fuera de
una ruta de proyecto: el más reciente por `created_at`. En la práctica eso
fijaba `/debug` al último dominio creado en la cuenta — que en beta suele ser
`mozilla.org`, el proyecto reservado del piloto de escritura (ver CLAUDE.md,
"Pilot write scope") — en vez de al dominio que el fundador tenía realmente
abierto en la consola.

**Por qué esto sí es el "pedido explícito propio" que §32 dejó pendiente.**
Esa misma fase documentó, deliberadamente, que la barra lateral NO se entera
de una selección hecha en Dominios porque unificar ambas cosas exigiría "una
noción de 'dominio seleccionado' a nivel de cuenta, persistida más allá de
una URL — alcance mayor, pedido explícito propio si algún día hace falta".
Esta fase es exactamente esa petición, y deliberadamente acotada a `/debug`:
el bloque de la barra lateral (`proj-switch`) y la portada de Dominios siguen
sin tocarse.

**Implementación.** `middleware.ts` ya corre en cada request (refresco de
sesión de Supabase); ahora además escribe un cookie httpOnly
(`geo_active_project`, `lib/active-project-cookie.ts`) con el `projectId`
cada vez que la ruta visitada es `/dashboard/projects/[projectId]/...` — la
misma señal que ya usa `components/sidebar.tsx` para decidir qué dominio está
"activo". `/debug` lo lee y redirige ahí si el proyecto sigue existiendo y no
está archivado; si no, cae al criterio anterior (el más reciente), igual que
si el cookie no existiera. El cookie nunca autoriza nada por sí mismo — sólo
decide a qué URL redirige un atajo; `requireActiveProject` vuelve a
comprobar propiedad vía RLS en la página de destino, como siempre.

**Pendiente / roto conocido.** Ninguno nuevo. Sigue pendiente lo ya anotado en
§32 (proteger `/debug` antes de publicar la web; Fase B de bloques nuevos).

---

## 36. La panorámica competitiva y la lista de Competidores dejan de contradecirse (PANORAMA-PARITY-1, 2026-08-06)

> Numeración: la entrada anterior está rotulada "33" por error de una fusión
> (hay dos §33 y dos §10 en la historia de este fichero). Esta fase toma **36**,
> el siguiente número realmente libre después de §35.

**El problema, reportado por el fundador con dos capturas del mismo proyecto y
el mismo escaneo.** «Panorámica competitiva» (Visión general) y «Puesto en el
último escaneo» (Competidores) describían lo mismo con cinco lógicas distintas:

| | Visión general | Competidores |
|---|---|---|
| Orden | índice de `normalizeRanking` (sólo posición) | posición → **mención** → nombre |
| Puesto | `i + 1`, dígito gris a la izquierda, sin etiqueta | 1..N, ordinal `5º`, a la derecha |
| Cifra % | **cuota de voz** | **tasa de mención** |
| Columna extra | media en crudo `1.50º` | ninguna |
| Población | ranking persistido, top 5 | marca + competidores **activos** |

Sobre Mozilla eso salía a la pantalla así: Proton VPN 1º en una y 2º en la otra
(empata con Amazon a 1,00 y sólo una de las dos desempataba), y Mozilla 37%
aquí contra 48% allí. `.claude/rules/competitors.md` ya llamaba a esto fallo,
no matiz: *"dos números con el mismo significado y distinto valor es un fallo"*
(ADR 0018). Y la media en crudo seguía publicada en la panorámica **catorce
días después** de que §15 la retirara de la otra pantalla por ilegible.

**Lo que se decidió.** Un solo cálculo, `lib/competitors/latest-positions.ts`,
que las dos pantallas llaman. No es lógica nueva: es exactamente el
ordenamiento que la lista de Competidores ya hacía, extraído del componente
para que un segundo lector no pueda derivar de él. La panorámica pasa a
`marca · mención % · puesto ordinal`, con una etiqueta por columna.

**Por qué mención y no cuota de voz.** Eran dos métricas distintas
presentadas como si fueran la misma pregunta ("¿cuánto salgo?"), y ninguna de
las dos estaba etiquetada en la panorámica. Al elegir, mención gana por tres
razones: es la cifra de la lista con la que se compara, es la que ya usa el
resto de la Visión general (`X de N respuestas`), y es la que desempata el
propio ranking — enseñarla hace visible el criterio de orden en vez de dejarlo
implícito. El fundador confirmó la lectura al aprobar: *"quise decir Mención en
lugar de Cuota de voz"*. **La cuota de voz no se retira del producto**: sigue
en el pódium de Competidores, etiquetada como lo que es y calculada sobre todos
los escaneos completados. Lo que desaparece es su cálculo en la Visión general,
que ya no alimentaba nada.

**Detalles que no son cosméticos.**

1. **Se pasan entidades, no filas del ranking.** Un competidor desactivado
   después del escaneo sigue dentro del ranking persistido; al pasar la lista
   de entidades activas, las dos pantallas lo dejan de mostrar en el mismo
   render en vez de que una conserve una fila que la otra ya no tiene.
2. **La marca se casa por `is_brand`, nunca por nombre.** El nombre guardado es
   el que hubiera al puntuar el run: una marca renombrada desde entonces
   dejaría de encontrarse a sí misma en silencio.
3. **`X / N` sale del mismo listado que las filas.** Antes el denominador se
   contaba sobre el ranking persistido y las filas sobre otra población, así
   que titular y lista podían discrepar sin que nada fallara.
4. **El respaldo sin datos de puesto también muestra mención**, no cuota de
   voz: un escaneo anterior a geo-score-v3 no tiene posición para nadie
   (ADR 0026, sin backfill) y la lista cae a mención sola — misma métrica,
   menos el puesto, en vez de cambiar de métrica al quedarse sin una.

**Lección transferible, y es la segunda vez que aparece.** §15 dejó escrito que
una etiqueta mal anclada empieza a mentir en cuanto cambia el dato que hay
debajo. Aquí el fallo fue el grado anterior: **una columna sin ninguna etiqueta
hereda el significado de la columna equivalente de otra pantalla**. El lector
—el fundador— asumió que un porcentaje sin nombre al lado de un ranking era el
mismo porcentaje que ve en Competidores, porque no había nada que dijera lo
contrario. Un número sin etiqueta no es neutro: toma prestado el significado
del vecino más parecido que el usuario haya visto.

**Pendiente / roto conocido, al cerrar PANORAMA-PARITY-1.** Ninguno nuevo.
Queda anotado, sin decidir, que la cuota de voz del pódium de Competidores es
**acumulada** mientras la mención de estas dos listas es **del último
escaneo** — es deliberado (regla de ruta, "Poblaciones de datos") y ahora está
etiquetado en las dos pantallas, pero es la próxima pregunta que hará alguien
que compare las dos cifras.

### Addendum — el bloque tenía un solo diseño para cuatro estados reales (PANORAMA-EMPTY-1, 2026-08-07)

Revisando el PR con el fundador, dos capturas más destaparon que
`PanoramaRow`/`posbarsData` sólo modelaban bien el estado feliz —marca dentro
del top 5 con datos de puesto— y trataban los otros tres como variaciones de
ese mismo caso en vez de estados propios:

1. **Pregunta del fundador, antes de ver el bug real:** *"imagina que
   estuviéramos en la posición 7. ¿Qué saldría?"* Trazado en el código: la
   tabla añadía tu fila al final (correcto), pero las barras se calculaban
   sólo sobre `topPanoramaRows.slice(0, 5)` — **sin tu fila**. La tarjeta
   titulada «Tu puesto cuando apareces», con un `7 / 7` encima, habría
   dibujado cinco barras y ninguna azul. Contradicción entre el titular y el
   propio bloque que lo ilustra.
2. **El caso real, con una captura del propio proyecto genscore.es del
   fundador (escaneado 2026-08-07):** ningún motor nombró a la marca ni a
   ninguno de sus 5 competidores. La panorámica dibujaba **seis filas de
   `0%`** sin columna de puesto y sin ningún gráfico — un muro de ceros sin
   explicación, en la primera pantalla que ve cualquier cliente nuevo cuyo
   dominio aún no aparece en respuestas de IA. Este es el estado normal de un
   primer escaneo, no un caso raro.

**Lo que se decidió: nombrar los cuatro estados y dejar que cada uno decida su
propio render**, en vez de un único fallback que a veces acierta. Extraído a
`lib/competitors/panorama-state.ts` (`computePanoramaState`, 8 tests), que
`app/dashboard/projects/[projectId]/page.tsx` consulta en vez de derivar el
estado inline:

- **`empty`** — nadie (ni la marca ni ningún competidor activo) fue
  mencionado en el escaneo. Se detecta por `mentionRate`, no por el ranking:
  tiene que dispararse tanto si hay datos de posición (extracción correcta,
  cero menciones — el caso genscore.es) como si no los hay (escaneo
  pre-geo-score-v3 con cero menciones), porque las dos son la misma pregunta
  del usuario. Sustituye la tabla entera por un bloque honesto —"Ninguna
  marca apareció en este escaneo", con el número real de competidores y de
  respuestas— y un enlace a revisar los prompts. Sin gráfico, sin tabla de
  ceros.
- **`unranked`** — sin cambios de comportamiento: escaneo anterior a
  geo-score-v3 con menciones reales. Sigue siendo la lista sólo-mención que
  ya existía; no confundir con `empty`, que es una pregunta distinta ("¿hay
  puesto?" contra "¿hubo alguien?").
- **`ranked`, dentro del top 5** — sin cambios de comportamiento; es el caso
  que ya validó el piloto.
- **`ranked`, fuera del top 5 o sin mención** — dos correcciones:
  - **Las barras dejan de fingir que incluyen tu marca.** `topRows` es
    siempre el top 5 real, nunca rellenado con tu fila para que "tus barras"
    lo sean de verdad. Etiquetadas **"Top 5 posiciones"** para que el titular
    grande (tu puesto) y las barras (quién es el top 5 real) no se lean como
    la misma afirmación — son dos preguntas distintas y ahora lo dicen.
  - **La tabla marca el salto en vez de dejar un hueco sin explicar.** Cuando
    tu fila se añade tras el top 5, un separador de tres puntos (`.ov2-cmp-gap`)
    se dibuja entre la 5ª fila y la tuya, para que el hueco en la numeración
    se lea como un salto deliberado y no como una fila que falta.
  - **Decisión explícita del fundador sobre el cuarto caso** (marca sin
    mención mientras otros competidores sí tienen puesto): el titular pasa de
    `— / N` —con la explicación escondida en un `title` que nadie abre en
    móvil— a la frase **"No apareciste en este escaneo"**, y **no se añade
    fila de la marca al final de la tabla**. Propuse mantener la fila con la
    posición en blanco; el fundador cortó explícitamente: *"En el D que lo
    diga el titular. No hace falta la fila al final"*. La lógica ya lo hacía
    así de forma natural —`rankLatestPositions` excluye del ranking a
    cualquier entidad sin puesto, así que la marca nunca entra en `rows`
    cuando no fue nombrada— así que el cambio real fue sólo el titular.

**Validación declarada, no inflada.** La cuenta piloto no tiene ningún
proyecto en los estados `empty` o `ranked`-fuera-de-top-5: los tres estados
nuevos están cubiertos por los 8 tests del helper (incluida la integración
completa con `rankLatestPositions`, un competidor desactivado que no debe
aparecer, y el empate marca-nunca-mencionada) pero **no por ninguna captura
del piloto**. La verificación visual del estado `empty` se hizo a mano contra
el propio proyecto genscore.es del fundador en el preview, por ser el único
proyecto real conocido en ese estado.

**Pendiente / roto conocido.** Ninguno nuevo.

---

## 39. Los favicons dejan de pedirse a ojo (FAVICON-QUALITY-1 Fases 1 y 3a, 2026-08-06)

**Estado: implementadas las Fases 1 y 3a. La 2 nunca existió y la 3b se
revirtió.**

- **Fase 1** — el tamaño pedido se deriva del tamaño CSS por la densidad de
  pantalla, más dos bugs que salieron de mirar el producto de verdad.
- **Fase 2** — **no se implementó y ya no existe**: era detectar el globo desde
  el cliente, y resultó imposible porque Google responde 200 con él. La 3a
  absorbió su objetivo.
- **Fase 3a** — proxy propio que mira los bytes y responde 204 cuando no hay
  icono, que es lo que hace posible la caída a iniciales.
- **Fase 3b** — pedir el icono al propio sitio. **Construida, medida y
  revertida el mismo día**; el apartado se conserva más abajo porque la
  medición es el valor que dejó.

Lo que sigue sin hacer, y necesita aprobación propia por ser rastrear de
verdad, es leer el `<link rel="apple-touch-icon">` del HTML.

Esta entrada se lee de arriba abajo como una cronología: la Fase 1 primero, los
dos fallos que aparecieron al mirar el producto, y luego 3a y 3b. **Los
apartados "Pendiente" de cada fase valen sólo para su momento**; el estado real
es este párrafo.

Task Intake aprobado por el
fundador el 2026-08-06 ("Sí, entero el plan con todas las fases"), a partir de
la observación de que los iconos de dominio *"salen pixelados la mayoría"*.

**El problema, que eran dos problemas.** `lib/domains/favicon.ts` pedía siempre
`sz=64` a Google S2, un número fijo escrito una vez y nunca revisado cuando las
pantallas que lo usan crecieron. Al comparar ese 64 con lo que de verdad se
pinta, la mitad de los sitios se quedaban cortos en cuanto la pantalla es
Retina:

| Sitio | Tamaño CSS | Píxeles reales @2x | ¿Cubría `sz=64`? |
|---|---|---|---|
| Portada del dominio activo (Dominios) | 56 px | 112 | no, upscale ×1,75 |
| Rejilla de dominios | 38 px | 76 | no |
| Panorama de Visión general (≥ breakpoint) | 30 px | 60 | justo, y a 3x no |
| Sidebar y ranking de Competidores | 26 px | 52 | sí |

Esa es la **causa A**, nuestra y gratuita. La **causa B** es que S2 devuelve un
lienzo del tamaño pedido relleno con la mejor fuente que Google tenga, que para
muchos dominios es un `favicon.ico` de 16 o 32 px: ahí el borroso viene de
origen y subir `sz` no arregla nada. Separarlas importa porque sólo la primera
se arregla sin tocar la fuente de los iconos.

**Qué se decidió (Fase 1 — sólo la causa A).**

1. **El tamaño se deriva del tamaño CSS por la densidad de pantalla, nunca es
   fijo.** `faviconImgProps(domain, cssSize)` devuelve `src` + `srcSet` con
   candidatos 1x/2x/3x. El navegador elige por `devicePixelRatio`, así que una
   pantalla no-Retina sigue descargando el icono pequeño: esto no cuesta bytes
   a quien no los necesita.
2. **Los tamaños se redondean a lo que el servicio sirve de verdad** (16/32/64/
   128/256) en vez de mandar cualquier número y dejar que S2 redondee por su
   cuenta. La URL dice lo que vuelve.
3. **Candidatos duplicados colapsados.** A 38 px, 2x y 3x caen los dos en 128;
   ofrecer el mismo fichero dos veces hace al navegador decidir sobre una
   distinción que no existe.
4. **`src` es el candidato 1x**, no el mayor, para que un navegador que ignore
   `srcSet` no se trague el de 256.

**Por qué no se tocó el `object-fit: cover`** de `.ov2-cmp-fav` y
`.cm2-rank-fav-img`, que sí es discutible en un icono no cuadrado: es un cambio
visual independiente de la nitidez y habría mezclado dos concernidos en un PR.
Queda anotado, no hecho.

**Pendiente / roto conocido.**

- **La causa B sigue entera.** Un dominio cuyo mejor icono conocido por Google
  sea de 16 px se seguirá viendo borroso en la portada de 56 px, y esta fase no
  lo puede evitar. Es lo que atacan las fases 2 y 3.
- **Fase 2 pendiente** *(escrito antes de saber que era imposible; la resolvió
  la 3a — ver abajo)*: detectar el icono degenerado (el globo genérico de S2)
  y caer al avatar de letra determinista que ya existe en `citations-client.tsx`
  en vez de enseñar un borrón.
- **Fase 3 pendiente** *(hecha después, 3a y 3b)*: proxy propio con caché de edge que prefiera el
  `apple-touch-icon` del sitio. Resuelve la causa B y de paso el problema de
  privacidad que `favicon.ts` lleva documentado desde 2026-07-23 — hoy mandamos
  el dominio de cada cliente a Google en cada carga de página.
- **No verificado con bytes reales.** El contenedor donde se implementó tiene
  `www.google.com` bloqueado por política de red, así que la tabla de arriba es
  aritmética sobre el código, no una medición de los PNG. Lo que lo cierra es
  el piloto mirando capturas a `deviceScaleFactor: 2` — **que el arnés no sabe
  hacer**: `playwright.config.ts` monta los viewports sin `deviceScaleFactor` y
  el valor por defecto de Playwright es 1. El fundador decidió no tocar el arnés
  (2026-08-06), así que la nitidez la verificó su ojo sobre el preview y no
  queda capturada como evidencia. **La próxima sesión que toque favicons
  arrancará igual de ciega**; si eso molesta, el arreglo es un `PILOT_DPR`
  opcional con valor por defecto 1, que no cambiaría el comportamiento de
  ningún PR existente.

**Addendum del mismo día: dos fallos que sólo aparecieron al mirar el producto
de verdad.** Ninguno de los dos lo habría encontrado la aritmética; los dos
salieron de una captura del fundador en un iPhone.

1. **La portada de Dominios se quedaba con el icono del dominio anterior.** El
   `<img>` de la portada no llevaba `key`, así que al cambiar de dominio React
   reutilizaba el mismo nodo y sólo le cambiaba el `src`: el navegador seguía
   pintando la imagen ya decodificada hasta que llegaba la nueva. En la captura,
   una farmacia con el logo de Mozilla. **El bug era anterior, pero la Fase 1 lo
   agravó**: al derivar el tamaño del tamaño CSS, la portada (56 px → 256 a
   densidad 3) y la rejilla (38 px → 128) dejaron de compartir URL, y la portada
   perdió el acierto de caché que antes la tapaba. Arreglado con `key={domain}`
   en la portada y en el conmutador de la barra lateral. Se acepta un hueco
   vacío durante la carga: **enseñar la marca equivocada es peor que no enseñar
   nada**, porque el hueco se lee como "cargando" y el logo ajeno se lee como un
   dato.
2. **genscore.es salía con el globo genérico en nuestro propio producto.** No
   servíamos nada en `/favicon.ico` ni en `/apple-touch-icon.png`: todos los
   iconos vivían bajo `/brand/`, descubribles sólo parseando las `<link>` del
   HTML. Los recolectores de terceros prueban primero las rutas convencionales,
   y por eso mahou.es y vodafone.es sí tenían icono y nosotros no. Añadidos
   `public/favicon.ico` y `public/apple-touch-icon.png`. **No arregla la consola
   al instante**: el índice de Google S2 se puebla por rastreo, así que hasta
   que vuelva a pasar por genscore.es seguirá devolviendo el globo. Es condición
   necesaria, no suficiente — y refuerza el caso de la Fase 3a, que al servir
   los iconos por proxy propio deja de depender de cuándo le apetezca a Google
   rastrearnos.
3. **Y por eso nuestro dominio dejó de preguntarle a Google.** Corolario del
   punto anterior: teníamos el icono auténtico en el repo y aun así
   enseñábamos un globo, porque preguntábamos por él a un tercero que no lo
   conocía. `faviconImgProps` devuelve `/brand/genscore-tile.svg` para
   `genscore.es`. Es vectorial, así que no necesita `srcSet` — de ahí que el
   campo pasara a opcional. Arregla uno de los dos globos **al instante**, sin
   esperar a ningún rastreo ni a la Fase 3a. Regla que deja: **del único
   dominio del que tenemos el icono de verdad, no se adivina.**

**Lo que el piloto midió y yo había estado estimando.** La captura de Dominios
del run sobre `c7aa69b` da la primera cifra real: **de 10 dominios, 8 traían
icono de marca y 2 salían con el globo genérico** (alberdiderma.es y
genscore.es). Ese 20% es el tamaño verdadero de la causa B en esta cuenta, y
sustituye a la mano alzada con la que abrí la fase.

**Tercer modo de fallo, que no había nombrado nadie.** farmaciamunozpereira.com
tiene icono real y de resolución suficiente, pero es un **logotipo con texto**:
a 38 px es una mancha ilegible. No lo arregla la Fase 1 (no es resolución) ni
la 3 (no es la fuente). Si algún día molesta, lo único que funciona es no
enseñar la marca a ese tamaño y usar el avatar de letra, y eso exige distinguir
un logotipo de un símbolo, que no es detectable de forma fiable. Queda anotado
como límite conocido, no como pendiente.

**Fase 3a, pedida por el fundador el mismo día** (*"siempre que una web no
devuelva favicon en lugar de mostrar icono mostramos las iniciales como
antes"*). Lo que suena a cambio de icono es un cambio de arquitectura, porque
**Google responde 200 con el globo, no un 404**: desde el navegador no hay forma
de distinguir "este es su icono" de "no tengo ni idea", y por eso la Fase 2 que
yo había planteado en cliente no era implementable. Hay que mirar los bytes en
servidor.

1. **`/api/favicon` (`app/api/favicon/route.ts`).** Trae el icono de S2 desde el
   servidor y devuelve **204 sin cuerpo cuando es el comodín**. Un `<img>` con
   cuerpo vacío no puede decodificar nada y dispara `onError`, que es lo único
   que el cliente necesita para pintar iniciales.

   **Se implementó con 404 y el piloto lo tumbó** (`PILOT FAIL` sobre `ffcbe51`,
   Dominios y p2-overview en los tres viewports). El 404 hacía exactamente lo
   que se le pedía —de hecho el detector acertó de pleno: las dos peticiones
   marcadas eran `alberdiderma.es` y `damm.com`, los dos únicos dominios sin
   icono— pero **un 4xx para un estado normal y esperado le miente a todo lo que
   mire el tráfico**. El piloto lo leyó como pantalla rota, y detrás habrían
   venido la consola del navegador y Sentry. Que un dominio no tenga favicon no
   es fallo de nadie. Hay un test de regresión que fija el 204
   (`app/api/favicon/route.test.ts`). **Regla que deja: el código de estado
   describe qué pasó, no qué quieres que haga el cliente.**
2. **La detección se autocalibra; no hay ningún hash incrustado.** Se pide el
   icono de `no-such-site.invalid` —`.invalid` está reservado por el RFC 2606 y
   no puede existir, así que lo que devuelva S2 para él *es* el comodín— y se
   compara por SHA-256. El día que Google redibuje el globo, sigue funcionando.
   Se calibra **por tamaño** (el globo no es el mismo dibujo a 32 que a 256) y se
   memoiza **por promesa**, para que un arranque en frío con veinte iconos en
   pantalla no dispare veinte calibraciones.
3. **Falla abierto, a propósito.** Sin calibración disponible se sirve el icono
   tal cual en vez de arriesgarse a esconder uno bueno: enseñar un globo de más
   es feo, ocultar la marca real de un competidor es información perdida. Mismo
   criterio que `scripts/vercel-should-build.sh`.
4. **Caché de edge escalonada por significado**, no un número al azar: una
   semana para un icono (no cambian), un día para un 204 de "no hay icono" (un
   dominio sin icono hoy puede tener uno mañana y no queremos que ese "no hay" se
   quede pegado), un minuto para un fallo transitorio.
5. **`components/ui/favicon-img.tsx`** centraliza el comportamiento y **no la
   apariencia**: recibe el avatar de iniciales ya renderizado como `fallback`.
   Cada pantalla conserva su clase y su color determinista — unificarlos habría
   sido un rediseño encubierto colado en un PR de infraestructura.
6. **Efecto colateral que era un problema declarado desde 2026-07-23:** el
   navegador del usuario deja de contarle a Google qué cuenta está mirando.

### Fase 3b — construida, medida y **revertida el mismo día**

> **Estado: revertida.** El código no está en el producto. Se conserva este
> apartado entero, y no se borra, porque el valor que dejó no es el código sino
> la medición: **es la prueba de que la causa B no se arregla por esta vía**, y
> sin ella la próxima sesión que vea a Mahou borroso volverá a proponer
> exactamente lo mismo. Lo implementado vive en el historial del PR #354
> (`1f80df8`, `a2bb385`).
>
> **Por qué se revirtió, con los números delante.** De los 10 dominios de la
> cuenta del fundador, la 3b cambió **uno**: movistar.es. Los otros nueve
> quedaron idénticos píxel a píxel — comparación de regiones sobre las capturas
> del piloto, no impresión visual. **Mahou, que era la razón entera de la fase,
> ni se inmutó**: no publica `/apple-touch-icon.png` en la ruta convencional.
> Y el único que sí cambió quedó **peor**: un `apple-touch-icon` está diseñado
> para un tile de pantalla de inicio, con márgenes generosos porque iOS aplica
> su propia máscara, así que a 38 px la marca se ve más pequeña y más débil que
> la versión recortada de Google. La fase cambiaba resolución por peso visual,
> y a tamaños pequeños perdía.
>
> **Lo que costaba mantener, a cambio de eso:** una ruta pública sin autenticar
> haciendo peticiones salientes a dominios que escribe el usuario, una guardia
> SSRF entera (`lib/domains/public-host.ts`) que había que entender y mantener
> para siempre, un hueco de DNS rebinding declarado y no cerrado, y hasta 3 s
> extra en la primera petición de cada dominio.
>
> **Lo que quedó sin resolver.** No pude distinguir dos explicaciones del 1 de
> 10: o esos sitios no publican el icono en la ruta convencional, o el
> presupuesto de 3 s era demasiado corto y sólo llegó el más rápido. Apple,
> Vodafone y Ryanair casi seguro que sí lo publican, lo que apunta a lo segundo.
> **Quien retome esto debe medir eso primero** — y aun resolviéndolo, seguiría
> teniendo encima el problema del margen, que es de diseño y no de red.

Lo que sigue es el diseño tal como se implementó, conservado como registro:

**Fase 3b, aprobada por el fundador el mismo día** (*"empieza con 3b"*, tras
haberla planteado por separado por tocar la lista de prohibidos). Pide
`https://<dominio>/apple-touch-icon.png` —180 px reales— antes de conformarse
con lo que tenga Google. Es lo único que arregla mahou.es.

1. **No es un crawler, y la distinción es la que autoriza la fase.** Se piden
   dos rutas fijas conocidas (`/apple-touch-icon.png` y su variante
   `-precomposed`). **No se parsea HTML, no se siguen enlaces, no se descubren
   URLs.** El día que alguien quiera leer el `<link rel="apple-touch-icon">`
   para cubrir a los sitios que no usan la ruta convencional, eso **sí** es
   rastrear y necesita su propia aprobación.
2. **La guardia SSRF es la pieza central, no un accesorio**
   (`lib/domains/public-host.ts`). El dominio lo escribe el usuario al dar de
   alta un proyecto o un competidor, así que sin ella `/api/favicon` convierte
   el servidor en un ariete contra la red interna y, como la respuesta vuelve al
   navegador, en un canal de exfiltración. Sólo https; se rechaza toda IP
   literal; se resuelve el host y **todas** sus direcciones deben ser públicas
   —no la primera, que un host con un registro público y otro privado pasaría el
   filtro y luego conectaría al segundo—; y se bloquean privadas, loopback,
   link-local (`169.254.169.254`, el objetivo clásico en la nube), CGNAT,
   multicast y sus equivalentes IPv6, mirando dentro de las IPv4 mapeadas.
3. **Las redirecciones se siguen a mano, revalidando cada salto.** Con
   `redirect: "follow"` se validaría el primer host y se confiaría en el resto —
   un dominio público que redirige a `169.254.169.254` entraría por la puerta.
   Prohibirlas del todo tampoco valía: casi todo dominio raíz redirige a `www`,
   así que la 3b no habría servido justo donde hacía falta.
4. **El tipo de imagen se deriva de los bytes, no de la cabecera.** El
   `Content-Type` y la extensión los controla el otro extremo. **SVG se rechaza
   a propósito** aunque sea el formato más nítido: puede llevar script y lo
   serviríamos desde nuestro propio origen. Nitidez no vale un XSS.
5. **Presupuesto total, no por llamada.** Dos rutas por hasta cuatro saltos con
   5 s cada uno son 40 s antes siquiera de preguntarle a Google. Se calcula un
   instante absoluto al entrar y se reparte; lo que no quepa no se intenta y S2
   sigue detrás. Mismo criterio que `.claude/rules/scan.md`.

**Revisión de seguridad dedicada (2026-08-06): cero hallazgos.** La QA había
corrido sobre el commit anterior y no llegó a ver la 3b, así que se pasó una
revisión aparte sobre la ruta. Confirmó lo que la fase pretendía: no hay control
del host ni del protocolo (`isPlausibleDomain` sólo admite etiquetas
`[a-z0-9-]`, así que la URL no puede crecer credenciales, puerto, otro host ni
ruta), las codificaciones alternativas de IP no burlan nada porque se juzga la
dirección **resuelta** y no el texto del host, cada salto de redirección se
revalida, y el `Content-Type` nunca sale del servidor remoto. Señaló dos formas
IPv6 obsoletas que el clasificador daba por públicas —«IPv4-compatible»
(`::7f00:1`) y 6to4 (`2002::/16`)— y las descartó por no enrutables hoy;
**se cerraron igual**, porque un clasificador que devuelve `true` por accidente
es el que falla el día que cambia el entorno.

**Lo que la 3b NO cubre, dicho antes de que alguien lo asuma.** **DNS
rebinding**: se valida la IP antes de cada petición, pero entre esa comprobación
y el socket real hay una ventana en la que el DNS puede cambiar de respuesta.
Cerrarla exige fijar la IP en el socket, que `fetch` no permite. El daño
residual queda acotado por lo demás —sólo https, sólo respuestas con firma de
imagen ráster, tope de tamaño—, pero **no está cerrado**, y quien toque esto
debe saberlo. Tampoco cubre a los sitios que publican su icono sólo en el HTML:
ésos siguen cayendo a Google.

**Límite de verificación, otra vez y peor.** El contenedor donde se implementó
tiene bloqueado todo dominio externo, así que `/api/favicon` **nunca ha hablado
con Google**. La lógica está cubierta con `fetch` simulado (10 casos: comodín,
icono real, fallo de calibración, cuerpo vacío, red caída, memoización por
promesa y por tamaño), pero el camino real sólo se ejercita en el preview. Si
algo va a fallar aquí, fallará ahí y no en los tests.
## 36. La portada de Dominios sigue al dominio abierto, no al más reciente (DOMAINS-ACTIVE-COOKIE-1, 2026-08-07)

**El problema, reportado por el fundador.** Seleccionar un dominio en Dominios
y navegar a Visión general, Prompts o cualquier otra pantalla de proyecto
funcionaba bien — la URL lleva el `projectId`. Pero volver a Dominios (por la
barra lateral, sin el parámetro `?active=<id>` de la rejilla) siempre volvía a
mostrar el mismo dominio en la card grande: el más reciente por `created_at`,
que en beta suele ser `mozilla.org`, el proyecto reservado del piloto de
escritura (ver CLAUDE.md, "Pilot write scope"). §32 ya documentó esta caída
como criterio de reserva deliberado, y §33 dejó dicho explícitamente que "el
bloque de la barra lateral (`proj-switch`) y la portada de Dominios siguen sin
tocarse" al resolver el mismo problema para `/debug`. Este reporte es
justamente el pedido explícito que ambas fases dejaron pendiente.

**La solución reutiliza, no inventa.** DEBUG-ACTIVE-PROJECT-1 (§33) ya
construyó la única pieza que faltaba: el cookie httpOnly `geo_active_project`
(`lib/active-project-cookie.ts`), que `middleware.ts` escribe en cada visita a
`/dashboard/projects/[projectId]/...`. `app/dashboard/domains/page.tsx` ahora
lo lee con `cookies()` y resuelve la card principal con la misma prioridad que
`/debug`: `?active=<id>` explícito (clic en una tarjeta de la rejilla) → el
cookie (el proyecto que la consola tenía realmente abierto) → el más reciente,
como último recurso si ninguno de los dos casa con un dominio de la cuenta. La
resolución se extrajo a una función pura y testeada,
`resolveSelectedProject` (mismo módulo, `lib/active-project-cookie.test.ts`),
en vez de quedar en línea dentro del Server Component. El cookie sigue sin
autorizar nada por sí mismo: `projects` ya viene acotado por RLS y filtrado de
archivados desde `getWorkspaceCounters`, así que un id obsoleto, borrado o
ajeno simplemente no aparece en la lista y cae al criterio siguiente — misma
propiedad de seguridad que ya tenía `/debug`.

**Deliberadamente fuera de esta fase.** Elegir un dominio en la rejilla de
Dominios (`?active=<id>`) sin llegar a entrar en el proyecto (sin pulsar "Ver
visión general") no actualiza el cookie — sólo se escribe al visitar
`/dashboard/projects/[projectId]/...`. Si en ese estado intermedio el usuario
sale por otro camino y vuelve a Dominios sin el parámetro, verá el dominio
recordado por el cookie, no el que acababa de tocar en la rejilla. No es el
caso reportado (el fundador describe navegar primero a Visión general/Prompts,
que sí escribe el cookie) y ampliar la escritura del cookie a la propia
pantalla de Dominios es un cambio de superficie distinto — se deja para si
algún día se reporta.

**Pendiente / roto conocido.** Ninguno nuevo.

---

## 37. La rama de evidencia del piloto deja de fingir ser un deploy (PILOT-EVIDENCE-IGNORE-1, 2026-08-07)

**El problema, reportado por el fundador:** correos de Vercel de *"Failed
preview deployment"* llegando de todas las sesiones a la vez, sin relación
aparente con ningún cambio de producto.

**Causa.** Cada pasada de `ux-pilot.yml` publica sus capturas force-pusheando
una rama `pilot-evidence/pr-<N>` (paso "Publish screenshots to an evidence
branch"). Esa rama contiene sólo `screens/`, `output/`, los `.jsonl` y un
`README.md` — nunca `package.json` ni `vercel.json`. Vercel construye *toda*
rama que se empuja al repo por defecto; sin manifiesto de Next.js que
construir, cada pasada del piloto de cualquier PR generaba un deploy
condenado a fallar, y un correo por pasada. Con 76 ramas `pilot-evidence/*`
vivas en el momento del reporte — una por cada PR que hubiera corrido el
piloto alguna vez — y varias sesiones trabajando en paralelo, el goteo se
leía como ruido de fondo permanente.

**Por qué importa más que el spam en sí.** Un canal de alerta que falla
constantemente por un motivo sin relación con el producto es un canal que
deja de mirarse — el mismo patrón que dejó cuatro días de 429 de OpenAI sin
que nadie los viera (`docs/adr/0029`, Fase B). El día que un deploy de
verdad falle, se leerá como uno más.

**Arreglo.** El paso que publica la evidencia escribe también un
`vercel.json` estático dentro de la rama:

```json
{ "ignoreCommand": "exit 0" }
```

Contrato de Vercel: salida 0 significa "no construyas". A diferencia de
`scripts/vercel-should-build.sh` (que decide caso por caso y falla abierto
hacia construir), aquí no hace falta ningún script — esta rama nunca es
otra cosa que evidencia, así que la respuesta es siempre la misma. El deploy
pasa a `Canceled by Ignored Build Step`, que Vercel cuenta como éxito: cero
build, cero correo, la evidencia se sigue publicando igual porque el `push`
ocurre antes de que Vercel decida si construye.

**Pendiente / roto conocido.** Las 76 ramas ya existentes no llevan el
`vercel.json` hasta que se les haga otra pasada de piloto encima; hasta
entonces pueden seguir generando un correo aislado si alguien reabre esos
PRs. No se ha hecho limpieza retroactiva de esas ramas — force-pushear
`vercel.json` a 76 ramas por separado es una operación aparte, y esta fase
sólo cierra la fuente del problema hacia delante.
---

## 38. Ajustes de cuenta: cuatro pantallas pasan a una (CONSOLE-REDESIGN-1 Fase A, 2026-08-06)

**Estado: implementado.** Diseño aprobado y navegable en
`docs/design-reference/console-redesign-1/`; Task Intake en esa misma carpeta.

**El problema no era que sobrase una pestaña.** Las cuatro pantallas —Perfil,
Organización, Notificaciones, Plan y facturación— estaban organizadas por
*tema*. Ordenadas por el trabajo que alguien viene a hacer salen tres: quién soy
y cómo entro, qué me llega al correo, y qué pago. Y la mitad de los controles no
estaban conectados a nada.

Se exploraron tres opciones estructurales (pestañas, página única, sacar el plan
de Ajustes) y el fundador eligió **la página única**. Las otras dos quedan
descartadas con motivo: las pestañas no arreglaban que lo más consultado
siguiera a dos clics; sacar el plan al menú contradice el §3 punto 5 y hoy son
dos barras de progreso — se deja anotado para cuando Plan gane peso.

Decisiones finales:

1. **Una sola ruta**, `/dashboard/settings`, con tres secciones en orden
   Cuenta → Avisos → Plan. La más pesada y la que más va a crecer va la última,
   para que al crecer no empuje nada.
2. **El índice lleva estado, no sólo enlaces** — nombre, avisos activos, plan.
   Con tres entradas, una columna de 186 px que sólo navegase no se ganaría su
   sitio; llevar estado es lo que hace que la página única gane a las pestañas.
3. **Las cuatro rutas viejas son redirects PERMANENTES**, no transitorios.
   Cuatro emails de `lib/email/transactional.ts` y los enlaces que genera
   `lib/notifications/render.ts` apuntan a ellas y están en bandejas que no
   podemos reescribir. Por eso esta fase no toca los emails.
4. **Móvil es un solo scroll.** La primera propuesta llevaba pastillas de
   sección pegajosas; el fundador las descartó (2026-08-06) porque contradicen
   el argumento entero de la opción elegida. Se corta en 899 px, el mismo
   breakpoint del shell.
5. **«Eliminar cuenta» cierra la página y no está en el índice**, tras una línea
   y 44 px de aire, en gris y con botón de contorno en vez del bloque rojo
   relleno. A una acción irreversible se llega bajando, no de un clic (fundador,
   2026-08-06). Copy suyo: «Esta acción es irreversible. Se borrará el historial
   y todos los datos asociados a tu cuenta.»
6. **Fuera cuatro controles muertos**: Idioma y Zona horaria (guardaban estado
   de React que se perdía al recargar), Cambiar foto (sin backend y **habilitado**,
   así que aparentaba funcionar) y Activar 2FA (sin backend). También la
   pastilla de rol «Administrador/Miembro»: sin equipos, toda cuenta es admin de
   sí misma. La foto se descartó explícitamente — el avatar se queda en
   iniciales (fundador, 2026-08-06).
7. **Organización no tiene pantalla: dos acordeones gemelos en Cuenta.**
   «Datos de empresa» (nombre, sitio web, sector) y, justo debajo y con la misma
   forma, «Datos de facturación» (razón social, NIF). La primera implementación
   mandó los fiscales a la sección Plan, junto a la factura, con el argumento de
   que un NIF se rellena cuando vas a pagar; **el fundador lo corrigió el
   2026-08-06** — los dos bloques son «datos que rellenas una vez» y se leen
   mejor emparejados. El botón de logo desaparece: un botón deshabilitado que
   promete «Próximamente» sigue siendo un control que no hace nada.
8. **Las cuatro filas «Próximamente» de Notificaciones** pasan a una línea de
   texto al pie. Seis filas con cuatro apagadas se leían como hoja de ruta.
9. **Repintado a marca v3 con `.set-scope`**, que comparte bloque de tokens con
   `.ov2-scope` (§2) en vez de inventar un mecanismo por zona. El import de
   Hanken Grotesk **no se retira**: sigue siendo el `body` de las zonas sin
   migrar. Ajustes era la última zona de consola pendiente.
10. **Regla de forma nueva**: redondo es una persona, squircle es un dominio.
    Ver `docs/brand/brand-guidelines.md` §2b.

**Tres correcciones tras la primera revisión del fundador (2026-08-06):** aire
en la caja de seguridad, que iba ahogada con una fila de una línea dentro del
padding por defecto; los datos de facturación a acordeón gemelo en Cuenta; y el
bloque de pago, que le decía «todavía no tienes ningún plan de pago activo»
**siendo una cuenta Agencia**. Ese último era un error de fondo, no de copy:
`hasStripeCustomer` significa «ha tenido alguna vez ficha de cliente en Stripe»,
y el texto lo confundía con «no tiene plan de pago». Agencia se vende fuera de
Stripe (no tiene precio self-serve, PRICING-TRUTH-1), así que la cuenta que más
paga era la que leía que no pagaba. Ahora hay cuatro estados y cada uno dice lo
que es cierto de él.

Al mirar las capturas del piloto en verde apareció **una tercera instancia del
mismo defecto**: la tarjeta «¿Gestionas varios clientes? El plan Agencia es para
ti» se le mostraba a una cuenta que ya está en Agencia. El patrón que deja esta
fase escrito: **un bloque que le dice algo al cliente sobre un plan tiene que
mirar antes en qué plan está**. Aparecía tres veces en la misma pantalla.

**Dos hallazgos arreglados de paso, ambos en facturación:**

- `plan-billing-section.tsx` pintaba sus dos avisos con cuatro hexes escritos a
  mano (`#f0c36d`, `#fdf6e8`, `#92600a`, `#6b4b09`) que se saltaban los tokens
  `--warn`/`--warn-soft`/`--warn-ink`. Era una **regresión de BRAND-4 hallazgo 2
  en el mismo fichero que BRAND-4 arregló**. Matiz importante para el futuro: lo
  prohibido no es el ámbar de aviso, que tiene familia de tokens legítima, sino
  `--brand-warm` (#FFB020), que es sólo el punto del logo.
- **Agencia era un callejón sin salida** en el modal de cambiar de plan: un
  radio seleccionable que apagaba «Continuar» y mostraba dos mensajes distintos
  para el mismo estado. Peor aún, el botón «Comparar planes» abría el modal
  **con Agencia ya preseleccionada**, así que el callejón se alcanzaba desde el
  camino por defecto. Ahora ocupa la misma celda pero sin radio, con enlace a
  ventas.

**Hueco de verificación que esta fase cierra.** No existía ninguna journey de
piloto para `/dashboard/settings`: la pasada del PR #357 barrió 44 pantallas en
tres viewports y Ajustes no estaba en ninguna fila. Sin `tests/pilot/journeys/
settings.spec.ts` esta pantalla se habría implementado sin que ningún piloto la
viera nunca — el mismo fallo que el incidente de Auditoría web del 2026-08-02,
por otra puerta.

**Lo que costó aprender, y la regla que deja.** El primer intento se desplegó y
el piloto lo tumbó en los tres viewports: *«An error occurred in the Server
Components render»*, la pantalla entera sustituida por «Algo ha ido mal». La
causa: `buildSettingsIndex` estaba exportada desde `settings-index.tsx`, que es
`"use client"`, y la llamaba el Server Component de la página. **Todo lo que
exporta un módulo de frontera de cliente se convierte en una referencia de
cliente**; invocarla durante el render del servidor lanza.

Ni el build ni el test podían cogerlo: `tsc` ve una función normal y Vitest no
respeta la directiva `"use client"`. La regla que queda es estructural, no de
cuidado: **una función que llama un Server Component nunca vive en un fichero
`"use client"`.** Vive en `lib/` (aquí, `lib/settings/index-entries.ts`) y el
componente de cliente importa de ahí. Lo único que lo detectó fue la journey de
piloto que esta misma fase tuvo que crear.

**Tres ajustes finales tras la segunda revisión (2026-08-06):**

- **Un solo «Guardar» en la tarjeta de Cuenta.** Los dos acordeones tenían el
  suyo, así que escribir en «Datos de empresa» y pulsar el botón de la tarjeta
  descartaba el cambio en silencio. Era una regresión introducida por esta misma
  fase: antes Organización era pantalla propia con un único guardado y no había
  ambigüedad. Ahora `saveAccount` escribe nombre, empresa y facturación en una
  sola llamada y los acordeones son presentacionales.
- **Fuera «Motores de IA» del uso del ciclo.** Todos los planes de pago llevan
  los tres motores que existen, así que la fila vivía en 3/3 y levantaba «Cerca
  del límite del plan» para un límite sin nada por encima a lo que subir.
- **El bloque final pasa a soporte genérico.** Describía el estado de pago de
  cuatro maneras distintas —de ahí que le dijera a una cuenta Agencia que no
  tenía plan— y ahora dice lo único que es cierto siempre: escríbenos si tienes
  una incidencia. **El acceso a facturas de Stripe no desapareció con él**: el
  botón sube junto a «Cambiar de plan», visible para cualquier cuenta con
  cliente de Stripe. Quitarlo sin más habría sido una regresión peor que la que
  se arreglaba.

**Pendiente / roto conocido:**

- **Fase B, sin aprobar:** los otros cuatro hallazgos del modal de plan — un
  camino avisa antes de salir a Stripe y el otro no; el bloque de archivar
  dominios duplicado en los pasos `confirm` y `overage`; el distintivo «Bajada
  de plan» fijo con un `.cp-confirm-badge.up` muerto en CSS; y el icono `grid`
  de la cabecera. Necesita su propio Task Intake: es un flujo de pago.
- **La sección Plan sólo está cubierta por test en su entrada de índice**
  (`buildSettingsIndex`), no en su renderizado: el repo no tiene infraestructura
  de test de componentes. Con equipos ocultos no hay no-admins reales, pero la
  cobertura es parcial y conviene saberlo.
- **`org_tax_info` sigue en `user_metadata`** de las cuentas que lo tuvieran, a
  propósito: es la fuente de reserva de Razón social hasta que su dueño guarde.
- **`updateProfileName` queda sin usar** en `profile/actions.ts` tras el guardado
  único. No se retira aquí para no ensanchar el PR; una server action huérfana
  sigue siendo un endpoint invocable, así que conviene borrarla en la fase
  siguiente.
- **La sesión del piloto se cae a mitad de pasada, y no es de esta zona.** En
  la pasada de `cfe77eb`, móvil completó las 44 pantallas —las cinco de Ajustes
  con contenido real y cero errores de consola— y a partir de
  `tablet notifications-bell` todo rebotó a `/login`. El `storageState` de
  `.pilot/auth.json` lo comparten los tres proyectos de viewport; cuando el
  token rota durante la primera pasada, las dos siguientes arrancan con una
  sesión ya inválida. Es intermitente (la pasada anterior, con las mismas
  pantallas, fue verde) y afecta a **todas** las journeys, no a Ajustes.
  Arreglarlo toca `tests/pilot/support/auth.setup.ts` —re-autenticar por
  proyecto en vez de reutilizar el fichero— y merece fase propia.
- **Replanteo pendiente de la sección Plan.** Las cuatro pegas de la revisión
  del fundador caían todas ahí, no en Cuenta ni en Avisos: jerarquía duplicada
  («Plan» → «Tu plan» → «Uso de este ciclo»), y «Facturación mensual» junto a un
  plan «a medida». Va con la Fase B del modal, que es su misma zona.

---

## 39. La alerta de escaneo incompleto deja de ser un email sin marca (EMAIL-OPS-ALERT-BRAND-1, 2026-08-07)

**El problema, reportado por el fundador con captura propia.** El aviso de
`sendScanHealthAlertEmail` (`lib/scan/scan-health-alert.ts` →
`lib/email/transactional.ts`) —el que llega a `OPS_ALERT_EMAIL` cuando un
escaneo se queda sin datos de un motor— se renderizaba como HTML suelto sin
cabecera, sin paleta v3 y sin el sistema `wrap()`/`eyebrow()`/`heading()` que
ya usan los otros ocho emails de Resend. Al lado del resto de la bandeja
parecía un email roto, no uno de GenScore.

**Por qué estaba así a propósito.** El comentario del código lo decía en dos
sitios: "Deliberately plain and dense rather than brand-wrapped: the reader
is debugging." La decisión original (EXTRACTION-RELIABILITY-1 Fase B,
`docs/adr/0029`) priorizaba densidad de datos sobre identidad — este email
nunca lo ve un cliente, solo el operador diagnosticando un fallo real.

**Lo que cambia.** Se repinta con el mismo sistema v3 (`docs/brand/
email-design-proposal.md`) que ya llevan los ocho emails de Resend: cabecera
de marca, eyebrow rojo `#D23B48` ("Alerta operativa · sólo equipo GenScore"),
titular y detalle con los componentes compartidos. **Ningún dato de
diagnóstico se pierde** — motor, causa, filas afectadas, dominio, proyecto,
escaneo y fecha de detección siguen todos presentes, ahora en una tabla de
filas con los valores en monoespaciada (`JetBrains Mono`, la fuente de datos
de la marca) en vez de la tabla suelta anterior. El pie deja claro que es un
aviso interno, no algo que vea un cliente.

**Qué no se toca.** `sendWebAuditFailedAlertEmail` (el aviso gemelo de
auditoría web fallida) mantiene el mismo patrón "deliberadamente plano" — el
fundador pidió rediseñar el email de la captura, que era este, no el otro.
Si se decide unificar también ese, es una fase propia de una línea: mismo
cambio, mismo archivo, otra función.

**Fuera de alcance original.** `docs/brand/email-design-proposal.md` (BRAND-5c)
catalogaba los diez emails de cliente/auth y marcaba "cualquier email nuevo"
como fuera de alcance; los dos avisos de operador ni siquiera estaban en su
tabla porque no son emails de cliente. Esta entrada es la que los trae al
mismo sistema de marca, no una ampliación de BRAND-5c.

---

## 40. El tour «Aprende cómo funciona» (ONBOARDING-TOUR-1, 2026-08-06)

**Estado: implementado y en las dos superficies.**

Una misma pieza —`components/product-tour.tsx`— en dos sitios:

- **Landing**: sustituye la captura estática del hero (`.lp-shot`), dentro del
  mismo `.browserframe` que §1 ya daba por aprobado. El marco no cambia; lo que
  cambia es que el producto se mueve.
- **Consola**: popup de bienvenida que salta solo en el primer acceso, y que
  después se reabre desde «¿Qué es el GEO?» del menú lateral.

Ocho pasos, 50 s: dominio y sugerencias → escaneo → GeoScore → evolución →
recomendaciones → generar la solución → auditoría web → el siguiente escaneo.
Los subtítulos son literalmente los del fundador.

### Decisiones y por qué

- **Tour filmado, no *coach marks*.** El patrón habitual —globitos sobre los
  elementos reales de la pantalla— no sirve aquí: en el instante en que el
  popup aparece, el escaneo está en `pending` y la Visión general no tiene
  datos, así que los globitos apuntarían a pantallas vacías. Un tour filmado
  funciona con independencia del estado de los datos y además enseña lo que
  está a punto de aparecer.
- **El montaje se lleva 8,3 s de 50.** Dominio, competidores, prompts y
  escaneo son lo que menos importa; el 83% del metraje va a la puntuación, la
  tendencia, generar una recomendación de principio a fin y la auditoría. El
  paso de generar es el más largo del tour a propósito: es el único que enseña
  que el producto no se limita a señalar el problema.
- **Cabecera fija, subtítulo variable.** Título «Aprende cómo funciona» y una
  única línea que cambia por paso explicando lo que se ve. Sustituye a la banda
  de rótulos bajo el lienzo que tenían las versiones previas del prototipo.
- **Todos los pasos miden lo mismo de alto.** Los ocho subtítulos se apilan en
  la misma celda de rejilla con sólo uno visible, así que el contenedor mide
  siempre lo que el más alto — sin medir nada en JS, correcto a cualquier
  ancho, tipografía o idioma. Sin esto la pieza pega un salto en cada paso.
- **`ProductShot` se retira.** Quedó sin uso al sustituir el hero, y con
  `prefers-reduced-motion` el tour se queda quieto en su último fotograma (la
  Visión general con su gauge y su curva), que es exactamente la captura que
  `ProductShot` daba. Se elimina en vez de dejarla muerta.
- **El marco del hero se acota a 860 px.** El tour tiene una densidad fija
  pensada para un lienzo de ~715 px; a los 1060 px del `.lp-shot` el
  mini-producto se veía diminuto y flotando. Se acota el marco en vez de
  reescalar cuarenta tamaños de letra.
- **«¿Qué es el GEO?» del menú lateral pasa de enlace a botón que abre el
  tour** (fundador: «luego estará en el menú, en qué es el GEO»). La página
  `/geo` no se pierde: el propio popup la enlaza en su pie, abajo a la
  izquierda, donde el fundador la marcó. El coste, dicho: llegar a `/geo`
  desde el menú pasa de un clic a dos.

### Lo que el tour afirma, y por qué se puede afirmar

Tres textos hacen afirmaciones sobre el producto y las tres se comprobaron
antes de escribirlas:

- «Se escanea continuamente» → `lib/scan/cron.ts` reescanea a diario en
  free/pro/agency y semanalmente en starter. **Si esa cadencia cambia, el
  texto cambia con ella.**
- La auditoría del paso 7 usa las comprobaciones y pesos reales del diseño
  aprobado en §17 (`docs/design-reference/web-audit-issues-1/`): datos
  estructurados 15 pt/página, metadatos 5, formato respuesta-primero 5.
- **El salto de 48 a 71 es ilustrativo, no una promesa.** Enseña el mecanismo
  —cada escaneo recalcula la puntuación—, y el subtítulo está escrito con esas
  palabras a propósito. Convertirlo en «+23 puntos garantizados» lo volvería
  una promesa que el producto no puede cumplir.

### El tour se lee, no se mira pasar (2026-08-07)

Corrección del fundador tras probarlo en el preview desde el móvil. Dos cambios,
los dos sobre **cuándo** corre el reloj, ninguno sobre lo que se ve:

1. **Sólo el primer paso se reproduce solo.** Los otros siete los trae
   «Siguiente». El motivo es el que el fundador dio y conviene no perder: *«en
   caso contrario, no hay tiempo suficiente para leer toda la información»*.
   Encadenados, los ocho pasos cambian de pantalla antes de que dé tiempo a
   leer el subtítulo — el tour se convierte en algo que se mira pasar. Un paso
   por clic lo convierte en algo que se lee. Sustituye a la reproducción
   continua de 50 s que describía este mismo §40: los 50 s siguen siendo la
   longitud del reloj, pero ya nadie los consume del tirón salvo que pulse
   siete veces. La mecánica no era nueva —Atrás/Siguiente ya reproducían un
   paso y paraban—, sólo se extiende al arranque.
2. **En la landing no arranca hasta que el lienzo se ve entero.** Antes bastaba
   con que asomara un 25 %, así que quien bajaba hasta el hero se lo encontraba
   con el paso 1 empezado o terminado. Ahora espera a verlo completo, con la
   salvedad de que si el lienzo es más alto que la ventana se conforma con que
   cubra el 90 % de ella: un `intersectionRatio >= 0.98` a secas no se cumple
   jamás en una pantalla corta y el tour no arrancaría nunca.

Efecto en la landing que conviene tener presente: **el hero ya no se
autodemuestra entero.** Un visitante que no pulse nada ve el paso 1 y ahí se
queda. Es exactamente lo pedido, y el intercambio está aceptado: se prefiere un
paso que se lee a ocho que se pierden.

`AUTOPLAY_THROUGH_STEP_INDEX` y `holdTimeFor()` viven en
`lib/onboarding/tour-steps.ts` con tests, no en el componente, por la misma
razón que el resto de la línea de tiempo.

Verificado con Playwright sobre el build de producción en local, en las dos
superficies y a 375/768/1280 px (52 comprobaciones): no arranca sin verse
entero, arranca al verse entero, se detiene al acabar el paso 1 y sigue quieto
trece segundos después, los ocho pasos se recorren uno por clic sin encadenarse,
altura constante, sin desbordamiento ni errores de consola, y
`prefers-reduced-motion` sigue aterrizando en el último fotograma.

### El popup salía en cada carga, no en el primer acceso (2026-08-07)

Lo encontró el `ux-pilot`, que es exactamente para lo que existe. Tumbó seis
pruebas —el tooltip de Páginas citadas y la campana de notificaciones, en las
tres anchuras— con `Timeout exceeded` contra elementos que estaban
perfectamente sanos. La captura del fallo lo explicó de un vistazo: el popup de
bienvenida abierto encima de Páginas citadas, tapándolo todo.

**El fallo real, y no era del piloto.** La marca de «ya visto» se escribía **al
cerrar** el popup, no al mostrarlo. Así que «salta solo en el primer acceso» era
en realidad «salta en cada carga hasta que lo cierres»: quien lo miraba y
pinchaba en el menú, o recargaba, se lo volvía a encontrar encima,
indefinidamente. El piloto no cierra nada, así que se comió el caso extremo de
ese comportamiento y lo dejó a la vista. Ahora la marca se escribe al mostrarlo.
Coste asumido: quien recargue en el primer segundo se lo pierde, y vuelve por
«¿Qué es el GEO?» del menú, que es justo la puerta que el fundador pidió.

**Y dos arreglos en el propio piloto**, porque un modal de bienvenida es algo
que el harness tiene que saber sortear:

- `visitAsUser` cierra el popup si está abierto, con su propia X, y lo anota en
  `dismissedWelcomeTour` en vez de silenciarlo. Un modal que tapa la pantalla
  bloquea cualquier hover o clic detrás; sortearlo es lo que hace una persona.
- `auth.setup` **quita la marca de «visto» del estado compartido**.
  `storageState()` de Playwright persiste el `localStorage`, y el login aterriza
  en /dashboard, donde el tour salta y se marca: sin quitarlo, ese estado habría
  llegado a todas las pasadas diciendo «este navegador ya lo vio» y el popup no
  habría vuelto a salir jamás. Es decir, el piloto no habría podido verlo nunca
  — la misma trampa del 2026-08-02, por otra puerta.

  El primer intento lo hizo con un `removeItem` sobre la página y **perdió la
  carrera**: `waitForURL` resuelve al navegar, antes de que React hidrate, así
  que el borrado se adelantó al efecto que escribe la marca y el efecto la
  repuso justo a tiempo de que `storageState()` la capturara. El piloto lo dijo
  en la misma tarde: el popup no salió en ninguna de las tres anchuras y la
  consola se veía impecable detrás. Ahora se filtra del objeto ya capturado,
  que no depende de ningún instante.

**Y una pasada que sí lo mira**: `tests/pilot/journeys/onboarding-tour.spec.ts`.
Comprueba que sale solo en el primer acceso, que trae contenido real y no un
lienzo en blanco, que se detiene al acabar el paso 1, que «Siguiente» avanza de
verdad, que conserva el enlace a `/geo`, que se cierra con su X, que **no vuelve
a saltar tras recargar** y que el menú lo reabre. Va todo en una sola prueba
porque Playwright estrena contexto por `test` y «ya no vuelve» sólo se puede
comprobar sin salir de la misma sesión.

Cierra el hueco que llevaba dos días declarado en este PR: el popup de la
consola nunca se había visto sobre el preview con sesión real.

### La pista del botón, el recorte de altura y la ruta puente (2026-08-07)

**Altura.** El fundador: *«sobra mucho espacio arriba y abajo... así también
damos más visibilidad a los botones»*. Medido antes de tocar nada, el grueso no
estaba en los márgenes sino en el lienzo: a 375 px se llevaba 466 de 690. Se
aprieta su proporción (2/1 → 2,3/1 en escritorio, 4/5 → 1/1 en móvil) y se
recortan subtítulo, pie y márgenes. Resultado medido: **690 → 594** a 375,
**568 → 511** a 768, **614 → 551** a 1280, sin recortar contenido en ninguno de
los ocho pasos. El límite lo puso el contenido, no una cifra elegida a ojo.

**La pista del botón.** El tour se detiene al acabar el paso 1 y ese silencio
dejaba una pregunta sin responder. Se propusieron seis animaciones en un
artefacto y el fundador eligió la sexta: **halo + flecha**. El razonamiento que
la sostiene, por si alguien la quiere cambiar: el problema no era que el botón
fuese poco visible —es azul, sólido y está solo en su esquina— sino que la
mirada está arriba, en el lienzo que acaba de pararse. El halo la baja; la
flecha dice hacia dónde. Descartadas: la flecha sola (demasiado callada para
tirar de la mirada desde otra zona), el barrido (es el gesto de «cargando», y
este producto carga cosas de verdad), y el latido y el rebote (mueven el
control, y un control que se mueve se lee como impaciencia).

Tres reglas van con ella y no son decorativas: **finita** (tres ciclos, 4,8 s, y
queda un anillo fino permanente), **se gasta al primer contacto** (ratón, foco o
clic; no vuelve en toda la sesión) y **sólo tras la reproducción automática**
(si el usuario ya ha navegado a mano, sabe cómo se avanza). Con
`prefers-reduced-motion` el tour entero está quieto, así que la pista no puede
depender del movimiento: el anillo estático dice lo mismo.

**Y un fallo que salió al hacerlo, éste grave.** El popup **no salía nunca en el
primer login**. `/dashboard` es una ruta puente —no pinta nada, sólo redirige al
proyecto más reciente— y el popup se montaba ahí, escribía la marca de «visto» y
la redirección se lo llevaba por delante. Como el primer login aterriza justo en
`/dashboard`, el único momento para el que se hizo el tour era precisamente el
único en el que no aparecía. Lo cazó el `ux-pilot`: veía el popup en Prompts,
Competidores o Páginas citadas, y jamás en Visión general — 27 pasadas con
popup, ninguna en esas dos. Ahora el provider no abre en `/dashboard` y espera
al destino real. La pasada del piloto entra por `/dashboard` a propósito:
entrar por la pantalla final habría ocultado el fallo.

Verificado con Playwright sobre el build de producción en local, en las dos
superficies y a 375/768/1280 px: la pista aparece al detenerse el paso 1,
altura constante en los ocho pasos, sin recortes dentro del lienzo, sin
desbordamiento y sin errores de consola.

**Dos ajustes del fundador el mismo día, ya sobre el preview:**

- **La pista va en bucle hasta el clic**, no tres ciclos. Yo había propuesto que
  se apagara al primer contacto —ratón, foco o clic— por no volverla un
  incordio; el fundador lo corrigió y tiene razón en el fondo: la pista existe
  para conseguir ese clic, así que mientras no llegue no ha cumplido. Ahora ni
  el hover ni el foco la cortan. Es la única animación del tour que no se
  detiene sola, y la excepción está declarada en la regla de ruta.
- **En móvil el marco se estrecha hasta alinearse con el párrafo del hero.**
  Iba a sangre (0→375) mientras `.lp-lead` respiraba 24 px a cada lado, así que
  el tour se leía «pegado» a los bordes. Alinearlo se lleva además otros 28 px
  de alto: **594 → 566 px** a 375.

### Y un tercero, un día después: la pista arranca con el paso 1 (2026-08-08)

La pista sólo se encendía al **detenerse** la reproducción automática, es
decir, cuatro segundos y medio después de que el paso 1 empezara. El fundador
lo corrigió: tiene que arrancar en el mismo instante que el paso 1, no después.
Ahora se enciende a la vez que el reloj empieza a correr —al montar el popup, o
al verse entero el lienzo en la landing— y sigue puesta durante toda la
reproducción del paso 1 y después, hasta el clic. La regla de «en bucle hasta
el clic» del ajuste anterior no cambia; sólo cambia el instante en que arranca
el bucle.

Verificado con Playwright sobre el build de producción en local, en las dos
superficies: la pista está puesta a los 0,5 s de arrancar el reloj —antes de
que el dominio del paso 1 empiece siquiera a teclearse—, sigue puesta cuando el
paso 1 se detiene, y el clic la apaga. Repetidas también las comprobaciones de
altura constante, sin recortes, sin desbordamiento y `prefers-reduced-motion`
en las tres anchuras: sin regresión.

### Pendiente / roto conocido

- **El «ya visto» vive en `localStorage`**, no en una columna de usuario: una
  migración de esquema está prohibida sin aprobación explícita. Consecuencia
  asumida: el popup reaparece en un navegador nuevo o tras limpiar el
  almacenamiento. Convertirlo en columna sería una fase con su propio Task
  Intake.
- **No se pudo ver la referencia de Semrush** que el fundador citó: el proxy
  del entorno devuelve 403 y su web bloquea peticiones automáticas. La versión
  de landing está construida sobre los componentes ya aprobados de este repo,
  no sobre un análisis de la suya.

---

## 41. Dominios recupera el borrado del dominio activo (DOMAINS-CLIENT-DELETE-1, 2026-08-09)

**Estado: implementada.** Task Intake aprobado por el fundador el mismo día
("Si").

**El problema.** §32 (DOMAINS-REDESIGN-1 Fase A) había retirado a propósito
todo control de la pantalla de cliente `/dashboard/domains`, incluido el
borrado duro del dominio (DATA-MGMT-1), dejándolo únicamente en `/debug` — con
una nota explícita: *"Es reversible y está aquí escrito para que se note si
algún día molesta"*. El fundador pidió el 2026-08-09 recuperar un botón de
papelera en la tarjeta del dominio activo: exactamente el caso que esa nota
anticipaba.

**Qué se decidió.**

1. **Sólo la portada (dominio activo), no la rejilla inferior.** La rejilla de
   los demás dominios sigue sin controles — la porción más pequeña que resuelve
   la petición.
2. **Reutiliza el componente y el server action ya existentes.**
   `DeleteDomainButton` (`app/dashboard/projects/[projectId]/debug/
   delete-domain-button.tsx`) y `deleteProject` (`app/dashboard/projects/
   actions.ts`) no cambian: la portada de Dominios sólo importa el mismo
   componente que ya usaba `/debug`, con `isCurrentProject={false}` porque
   aquí no estamos dentro de la ruta del proyecto — tras borrar basta
   `router.refresh()`, y `resolveSelectedProject` (DOMAINS-ACTIVE-COOKIE-1, §36)
   ya cae al siguiente dominio o al estado vacío cuando el id activo deja de
   existir, sin código nuevo para ese caso.
3. **Los otros dos invariantes de §32 no se tocan.** Sigue sin haber botón de
   escanear ni de auditar en esta pantalla — el borrado no es un control de
   automatización, es una acción de cuenta.
4. **Hueco reservado para que el botón no se pise con la píldora de estado.**
   `.dm2-hero` pasa a `position: relative` y `.dm2-flags` («En progreso» /
   «Auditando») gana `margin-right` para no quedar bajo el botón, que ocupa la
   esquina superior derecha de la tarjeta — colisión real sólo cuando hay un
   escaneo o auditoría en curso a la vez que se pulsa el botón, pero visible en
   ese estado si no se reserva el hueco.

**§32 queda superseded en este único punto** (cero controles en la pantalla de
cliente): el resto de esa decisión — «Escenario», raíl/rejilla de cambio,
sólo puntuación GEO y su delta, estado de cabecera agregado — sigue vigente
sin cambios.

---

## 42. Los tests dejan de ser opcionales (PRELAUNCH-HARDENING-1 Fase 0, 2026-08-09)

**Contexto.** El fundador pidió, antes de lanzar, un plan de refactorización y
revisión de arquitectura más una batería de pruebas E2E. El plan completo vive
en `docs/prelaunch-hardening-plan.md` (aprobado 2026-08-09). Esta es su Fase 0,
la única con urgencia absoluta.

**El hallazgo que la motiva.** Ningún workflow del repo ejecutaba `pnpm test`,
`pnpm run typecheck` ni `pnpm run lint`. Un grep de `vitest|typecheck|lint|
build` sobre `.github/workflows/**` daba cero resultados. Con 130 ficheros de
test y ~1.788 casos, **la suite entera era consultiva**: un PR que los rompiera
todos mostraba el mismo tick verde que uno que no rompiera ninguno, y podía
llegar al Human Gate sin que nadie lo supiera. Las dos únicas señales
automáticas por PR eran el build de Vercel (que no ejecuta un solo test
unitario) y el piloto agéntico (que mira pantallas, no invariantes).

**Arreglo.** `.github/workflows/ci.yml`, en cada PR y en cada push a `main`:
tests, typecheck y lint, como tres pasos separados para que el nombre del paso
rojo ya diga cuál de los tres se rompió sin abrir el log.

**Lo que deliberadamente NO hace: `next build`.** `pnpm run validate` es
`build && typecheck && lint`, pero Vercel ya construye un preview en cada push
que toca código de producto, así que un segundo `next build` en Actions
doblaría el paso más lento de CI sin señal nueva. Se comprobó que el hueco no
existe: las rutas que `scripts/vercel-should-build.sh` salta (`docs/`,
`.claude/`, `.github/`, `tests/` salvo `tests/pilot/`, `agents/`, prosa de
raíz) son todas incapaces de romper un build de Next. Y `tsc --noEmit` es
**más** amplio que la comprobación del build, porque tsconfig incluye los
ficheros de test que `next build` nunca compila.

**Self-check del piloto: primero en CI, luego fuera — y por qué.**
`pnpm pilot:selfcheck` (lo que demuestra que el arnés puede fallar además de
pasar) tampoco corría en ningún sitio. El primer intento fue meterlo en
`ci.yml` condicionado a que cambiara el arnés, con el propio `ci.yml` en la
lista de rutas para que editarlo ejercitase su mitad cara en vez de shipearla
a ciegas. **Ese diseño se probó y se descartó el mismo día:** en dos runs
consecutivos superó los 25 minutos sin completarse, y tampoco se pudo medir en
local (el sandbox de la sesión no tiene Chromium para esta versión de
Playwright). Una comprobación bloqueante de duración desconocida y
demostradamente >25 min o atasca cada PR del arnés o enseña a ignorarla; y
BUILD-BUDGET-1 cuenta los minutos de Actions como presupuesto real.

Vive ahora en `.github/workflows/pilot-selfcheck.yml`, con `workflow_dispatch`
y un `schedule` semanal (lunes 06:00 UTC), timeout de 60 minutos a propósito
—el objetivo de esas pasadas es averiguar cuánto tarda de verdad, y un timeout
que corta la respuesta las inutiliza— y subida de `.pilot/` como artefacto para
poder ver cuál de los cuatro modos rompió. **El coste asumido, dicho y no
disimulado:** una regresión del arnés puede pasar hasta una semana sin
detectarse, en vez de saltar en el PR que la causó. Volver a promoverlo a
puerta de PR es trabajo de la Fase Q5 y su condición previa es tener medido lo
que cuesta — que es justo lo que darán las pasadas semanales.

**Retirada del QA superseded.** `.github/workflows/claude-qa.yml` y
`scripts/run-claude-qa.py` se borran. CLAUDE.md los declaraba superseded desde
hacía meses ("should not be used") y seguían armados: `pull_request_target`
con `issues: write`/`pull-requests: write` y un paso que consumía
`ANTHROPIC_API_KEY`. Código muerto con permisos de escritura y una ruta a un
secreto no es deuda cosmética justo antes de exponerse a tráfico público.

**Corrección al plan aprobado, encontrada al ejecutarlo.** El plan proponía
borrar también `claude-qa-handoff.yml` y los dos `*-claude-qa-handoff.sh`.
**Es incorrecto y no se hizo**: CLAUDE.md sólo declara superseded el workflow
de ejecución y el script de Python, mientras el comentario
`<!-- agentic:claude-qa-handoff -->` sigue siendo obligatorio en todo PR — son
justo esos scripts los que lo publican. Además, la razón que el plan daba
("superficie de supply-chain viva") estaba sobredimensionada: ambos workflows
hacen checkout de la base de confianza y nunca ejecutan código del head. El
motivo real y suficiente para borrarlos es que estaban muertos y armados, no
que fueran explotables. `docs/agentic-claude-qa-readiness.md` queda marcado
como documento histórico.

**Qué queda pendiente / roto conocido.**

- El self-check del piloto **quedó sin verificar en este PR** y su primera
  pasada real llegó justo después de mergearlo: **14 minutos y FALLA**. Ver
  §44, que es donde vive el diagnóstico.
- **El piloto perdió la sesión en la última anchura, una vez, y no se
  reprodujo.** En la primera pasada de este PR (docs-only, imposible que el
  diff lo causara) dio `PILOT FAIL`: mobile 0 rebotes de 55 visitas, tablet 0
  de 53 y **desktop 7 de 44** — toda pantalla autenticada a partir de
  `recommendations` aterrizó en `/login`, mientras las públicas seguían bien,
  sin un solo error de red ni de consola (el redirect venía limpio del
  middleware). **Se relanzó sobre el mismo commit exacto y pasó; una tercera
  pasada sobre el commit siguiente también pasó.** Dos verdes contra un rojo
  sobre el mismo código: es un flake intermitente, **no** un fallo de producto
  ni un defecto sistemático del arnés, y la primera redacción de esta entrada
  —que lo daba por sistemático— quedó corregida al tener la segunda medición.
  La sospecha sigue siendo el `storageState` único que comparten las tres
  anchuras corriendo en secuencia (desktop la última), pero **es una hipótesis
  sin probar** y por eso no se ha tocado nada. Importa igualmente: con
  `retries: 0` deliberado ("un flake es un hallazgo"), un rojo espurio en la
  puerta enseña a ignorar los rojos. Anotado en la Fase Q5.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase 0; CLAUDE.md
§"GitHub / Agentic Reporting"; `docs/director-strategy.md` §QA execution model.

---

## 43. Los helpers duplicados dejan de ser tres (PRELAUNCH-HARDENING-1 Fase R, R1+R2, 2026-08-09)

Primeros dos slices de la Fase R del plan (`docs/prelaunch-hardening-plan.md`).
Refactor puro: **comportamiento idéntico**, con los tests existentes como red.

**`sanitizeField` existía tres veces, byte a byte.** En
`lib/web-audit/technical-audit.ts`, `lib/recommendations/domain-coverage.ts` y
`lib/recommendations/rewrite-recommendation.ts`. No es un helper cualquiera: es
el saneador de texto no confiable (salida de LLM y HTML traído de la web) que
las reglas de ruta de ambas zonas exigen **en singular** — «el patrón existente
(`sanitizeField`)». Una mejora futura del escapado habría aterrizado en una
copia y fallado en silencio en las otras dos. Ahora vive en
`lib/text/sanitize.ts` y esa regla es literalmente cierta.

**La autenticación de las cinco rutas internas estaba escrita a mano cinco
veces** (`weekly-scans`, `weekly-digest`, `sweep-continue`, `run-audit`,
`scan/continue`), comparando la cabecera contra `Bearer <secreto>` con `!==`.
Pasa a `lib/api/internal-auth.ts`, y de paso deja de ser una comparación que
filtra: una comparación de cadenas corta en el primer byte distinto, así que el
tiempo de respuesta revela cuántos caracteres del secreto son correctos, y
estos endpoints son públicos y sin límite de intentos. Se compara sobre el
SHA-256 de cada lado —`timingSafeEqual` exige búferes del mismo tamaño, y
comparar longitudes filtraría la longitud del secreto—. **Fail-closed
explícito**: sin variable de entorno no entra nadie. Verificado que ninguna
ruta declara `runtime = "edge"`, así que `node:crypto` está disponible.

**El transporte de los tres proveedores de LLM.** `fetchWithTimeout` y `delay`
estaban triplicadas, y las de OpenAI y Claude diferían **en una sola línea**:
la clase de error del timeout. Unificadas en `lib/llm/http.ts`, con la fábrica
de error como parámetro para que cada proveedor conserve su tipo propio — aguas
abajo se distinguen por tipo para categorizar el fallo. Importa de cara al
roadmap: Perplexity heredaría hoy la copia en vez del arreglo.

**Lo que deliberadamente NO se unificó.** Los mensajes de error por proveedor
(`getGeminiApiError` y compañía) parecen el mismo patrón, pero **Gemini no
tiene rama para 401** y los otros dos sí. Un builder común o le añade a Gemini
un mensaje que hoy no emite, o lleva un parámetro para fingir que no lo tiene.
Esos textos se persisten como el error categorizado de un escaneo
(`.claude/rules/scan.md`), así que cambiarlos no es refactor: es cambiar un
dato que el operador lee. Si algún día Gemini debe distinguir el 401, es una
decisión con su propia entrada, no un efecto colateral de una limpieza.

**Pendiente de la Fase R:** R3 (tipos generados de Supabase), R4 (`lib/env.ts`
validado), R5 (trocear `gemini.ts`), R6 (descargar `executor.ts` y mover el
vocabulario compartido fuera de `lib/scan`), R7 (páginas) y R8 (muertos).

---

## 44. El self-check del piloto corre por fin, y está rojo (2026-08-09)

**Primera ejecución real de `pnpm pilot:selfcheck` desde que existe.** No había
corrido nunca en ningún sitio; la Fase 0 lo sacó a un workflow propio
(`pilot-selfcheck.yml`) y se disparó a mano en cuanto el merge de #366 lo
registró en GitHub — un `schedule`/`workflow_dispatch` sólo existe para GitHub
desde la rama por defecto, así que antes del merge era literalmente imposible
ejecutarlo.

**Los dos datos que faltaban:**

- **Tarda 14 minutos** (13 min 47 s de reloj en el paso, más ~40 s de descarga
  de Chromium). Los ">25 minutos sin completarse" de §42 eran ejecuciones que
  se cancelaron o compitieron por recursos, no su coste real.
- **FALLA.**

**Qué falla exactamente, que no es lo que parece.** Los tres casos que
*deben* fallar los detecta correctamente —overflow, estado vacío y recorte
dentro de `.dash-content`, `expected exit 1, got 1` los tres—, y las dos
comprobaciones estructurales pasan (profundidad de captura: 54 páginas a altura
completa; bloqueo de escaneos: 0 journeys de escaneo en 105 páginas). **Lo que
falla es el caso sano**: el fixture "healthy" ya no está sano y devuelve
`PILOT FAIL` cuando se espera `PASS`.

Sus fallos, todos de la misma familia: `first-party requests failed` en las
cinco pantallas de Ajustes (las tres anchuras), en `landing-hero-tour`, y en
`blog-geo-para-ecommerce`; más «el popup de bienvenida no salió solo».

**Es deriva del fixture, no un fallo del producto.** Los journeys crecieron
—CONSOLE-REDESIGN-1 rehízo Ajustes, ONBOARDING-TOUR-1 añadió el tour, las
portadas del blog cambiaron— y `tests/pilot/fixtures/server.mjs` no se
mantuvo al día, así que hoy no sirve todo lo que esas pasadas piden. La
capacidad de detectar fallos del arnés está intacta; lo que está roto es su
línea base.

**Y es exactamente la deuda que la Fase 0 existía para destapar:** llevaba
roto quién sabe cuánto, y nadie podía saberlo porque no se ejecutaba en ningún
sitio. Un self-check que no corre no es una red de seguridad, es una creencia.

**Segundo hallazgo, más pequeño y también mío:** el paso «Upload self-check
output» del workflow no capturó nada (`No files were found with the provided
path: .pilot/`). El self-check limpia `.pilot/` entre casos, así que al
terminar no queda nada que subir. La evidencia que ese paso prometía no existe;
hay que hacer que cada caso conserve su salida antes de que el siguiente la
borre.

**Pendiente (Fase Q5 del plan):** poner al día el fixture hasta que el caso
sano vuelva a pasar, arreglar la captura de evidencia, y sólo entonces
plantear devolver el self-check a puerta de PR — con 14 minutos medidos, esa
conversación ya se puede tener con un número encima de la mesa.

---

## 45. Un fallo de LLM fuera del escaneo deja de ser invisible (LLM-RESILIENCE-1, 2026-08-09)

**Estado: implementada** (Fases A y B del plan; C y D siguen sin aprobar).
Task Intake aprobado por el fundador el mismo día ("Si"), con dos decisiones
explícitas suyas: opción **(i)** para el dedupe y **PR único** para las tres
mitades.

**El problema, con la evidencia que lo cerró.** El 2026-08-09 el fundador
añadió tres dominios (amazon.es, google.com, hostinger.com) y el asistente de
alta le devolvió cero competidores. En hostinger.com no vio ni un mensaje de
error. En paralelo llegó una alerta de `engine_no_response` de Gemini y se
descubrió que varios dominios con escaneo diario no se lanzaban desde el 2 de
agosto. La investigación (sin tocar código, a petición suya: *"Prefiero que lo
investigues bien para que estemos seguros"*) separó **cuatro** causas, no una:

1. **Pico real de 429 de Gemini** el 9-08 a las 06:00: 20 errores en
   `job_logs` en ~54 s, con Claude y OpenAI completando en la misma pasada.
2. **~70 errores más sin registro alguno.** Google AI Studio mostraba ~90
   errores 429 contra los 20 nuestros. La diferencia venía de rutas que no
   escriben en ningún sitio.
3. **Dominios sin escanear:** dos causas distintas — la mayoría nunca se dio
   de alta en `recurring_scans_enabled` (nace `false`, sólo lo activa el toggle
   manual de `/debug`), y un proyecto (`5255a45c`) está congelado por el
   cortacircuitos de 3 fallos seguidos, que no tiene salida en el código.
4. **RPM/TPM/RPD descartados como causa** con los propios paneles de Google:
   uso casi a cero contra el límite. La hipótesis viva es una cuota propia del
   *grounding* con Búsqueda de Google, sin confirmar.

Esta fase ataca (1) y (2). (3) sigue pendiente como fases C y D.

**Los tres hallazgos de código que cambiaron el diagnóstico.**

1. **No todas las llamadas a Gemini usan grounding.** Sólo tres: la generación
   del escaneo, la auditoría de contenido y `suggestCompetitors`. `suggestPrompts`
   y `inferBusinessProfile` no. Encaja con el síntoma: lo que se vaciaba era la
   lista de competidores (grounded) mientras los prompts (sin grounding)
   sobrevivían.
2. **Sólo la generación del escaneo reintentaba un 429** — y con una espera
   fija de 1500 ms. `auditDomainContent`, `generateGeminiJson` y
   `generateGroundedGeminiJson` no tenían reintento ninguno: el primer 429 era
   terminal. Es exactamente la asimetría que ADR 0029 encontró entre generación
   y extracción, una capa más arriba, y explica por qué el asistente caía a la
   primera mientras el escaneo de la misma minuto aguantaba.
3. **`ok: competitors.length > 0 || prompts.length > 0`.** Con los prompts
   funcionando y los competidores no, `ok` era `true`, el asistente avanzaba, y
   la pantalla de competidores salía vacía sin nada que leer. Y el único
   mensaje de error que existía (`suggestError`) **se pintaba sólo en el paso
   0**, mientras el camino de fallo hacía `setStep(1)` en la misma
   actualización — el aviso se escribía en una pantalla de la que al usuario se
   le estaba sacando en ese mismo instante.

**Qué se decidió.**

1. **Reintento acotado para toda llamada Gemini interactiva.** Reutiliza la
   máquina que ya existía para extracción (`fetchExtractionWithRetry`):
   intentos limitados, backoff exponencial con jitter total y `Retry-After`
   respetado pero acotado. Presupuesto más corto que el de extracción a
   propósito (3 intentos, 600 ms base, tope de 3 s) porque **hay una persona
   esperando**, no una pasada de fondo. Un 400/401/403 sigue fallando al primer
   intento: reintentar un id de modelo mal puesto da lo mismo tres veces.
2. **Los `catch {}` mudos pasan a reportar.** Los dos que se tragaban la causa
   entera (`inferBusinessProfile` → `null`, `suggestCompetitors` → `[]`)
   mantienen su contrato — siguen devolviendo lo mismo, nadie aguas abajo
   cambia — pero antes categorizan el fallo y avisan al operador.
3. **Alerta de operador para fallos LLM sin `run`** (`lib/llm/llm-incident.ts`).
   `scan-health-alert.ts` no podía cubrir esto: está construido sobre
   `scan_prompt_results` y `job_logs`, y ambos exigen un job y un run que el
   asistente de alta no tiene. Alerta sólo en `quota` y `config` — el mismo
   umbral que el aviso de escaneo, y por la misma razón: avisar del ruido del
   modelo es enseñar a ignorar el aviso.
4. **El dedupe es en memoria del proceso, y se dice.** `job_logs.job_id` es
   `not null` con FK compuesta a `jobs`, así que una ruta sin job no puede
   escribir ahí. Las opciones eran tabla nueva (migración: área prohibida sin
   aprobación propia) o memoria. El fundador eligió memoria. **El coste, escrito
   y no disimulado:** un apagón amplio puede mandar un email por instancia
   caliente y un arranque en frío olvida la ventana. Es tolerable *aquí* porque
   las superficies cubiertas las dispara una persona haciendo clic; si esto se
   conecta alguna vez a una ruta programada, ese razonamiento caduca y el
   dedupe necesita almacén de verdad. El propio email lo dice ("por instancia")
   en vez de copiar el "una vez cada 24 h" del aviso de escaneo, que sí es
   global.
5. **El asistente avisa en el paso que está vacío.** `ProjectSetupSuggestion`
   gana `failed: Array<"competitors" | "prompts">` y cada paso pinta su propio
   aviso cuando le toca. **El texto no inventa la causa**: desde el navegador no
   se distingue un apagón del proveedor de un dominio del que el modelo no sabe
   nada, así que dice lo que sí es cierto — no se pudo sugerir, añádelos a mano,
   el escaneo funciona igual. La causa real va al operador por email.
6. **El lote de prompts deja de salir todo en el mismo instante.** Un lote
   despachaba hasta `MAX_REAL_SCAN_PROMPTS` trabajos a la vez y cada uno llama a
   un motor por proveedor: hasta 10 peticiones simultáneas a Gemini desde parado,
   por dos proyectos en la pasada del cron. La auditoría ya se autolimitaba y
   `EXTRACTION_CONCURRENCY` existe justo por esto. Ahora se escalonan **los
   arranques** (las llamadas siguen solapándose), con dos topes que lo mantienen
   honesto frente a `.claude/rules/scan.md`: el reparto total está acotado a 2 s
   pase lo que pase, y por debajo de 20 s de presupuesto restante se desactiva
   entero. Acabar el lote dentro de `maxDuration` manda sobre el ritmo.

**Lo que esta fase NO arregla, dicho explícitamente.** No elimina el límite de
Gemini: lo aguanta. Si la causa es una cuota de grounding, los fallos bajan
mucho pero pueden reaparecer bajo carga — la diferencia es que ahora se sabe el
mismo día en vez de a los cuatro. Y no toca ninguna de las dos causas de los
dominios sin escanear.

**Pendiente (fases propuestas, sin aprobar).** **C — SCAN-STREAK-EXIT-1:** darle
salida al cortacircuitos de `FAILURE_STREAK_LIMIT` y descongelar `5255a45c`.
**D — ONBOARDING-RECURRING-1:** alta automática en escaneo recurrente; se dejó
la última a propósito, porque multiplica el volumen diario contra la misma
cuota que acaba de morder. Y sigue abierta la pista de la cuota de grounding en
la consola de Google, que no bloquea nada de lo anterior.

**Conocido y no resuelto:** los 400 de OpenAI del 5-08 (`Check OPENAI_MODEL`),
detectados durante esta investigación y sin tocar.

---

---

## 55. El primer escaneo tiene su propia pantalla, y deja de ocupar la ida completa (ONBOARDING-ROCKET-1, 2026-08-08)

**Estado: implementada la fase 1 (secuencia + traspaso).** Exploración de
diseño en `docs/design-reference/scan-states-1/` (tres opciones, rev.2 y
rev.3 — la última es la aprobada). Task Intake aprobado por el fundador en
sesión el mismo día.

**El problema.** `ScanInProgress`/`ScanInProgressLive` es el estado del
prototipo sin repintar a la identidad v3, y es el primer aterrizaje real de
un cliente nuevo. El fundador midió un escaneo propio de 30 preguntas en más
de 5 minutos contra una copia que promete "un par de minutos".

**Qué se decidió.**

1. **Sólo el primer escaneo de cada dominio** lleva la experiencia nueva
   (`ScanMissionRocket`) — la señal es `completedRunsCount === 0`, que ya
   existía en la página; no se añadió ninguna columna para distinguirlo. A
   partir del segundo escaneo, el proyecto vuelve al `ScanInProgressLive`
   compartido de siempre, sin cambios.
2. **La misión suelta la pantalla en cuanto hay datos que enseñar.**
   `ScanMissionRocket` sólo vive dentro de la rama `!hasData` (igual que el
   componente al que sustituye); en el instante en que `hasData` se vuelve
   cierto, la Visión general real se dibuja y una banda compacta
   (`ScanMissionBand`) sustituye al cohete a pantalla completa mientras la
   auditoría sigue en marcha. Nunca hay una ventana en la que la misión tape
   datos ya disponibles — es literalmente el mismo defecto que el log §26
   corrigió en Recomendaciones, y se decidió no reintroducirlo.
3. **Cinco momentos, no ocho.** La fase 1 implementa rampa / ignición /
   ascenso / órbita / entrega — los que se derivan de `computeScanStage`
   (sin cambios) sin ninguna lectura nueva. Los momentos de vuelta
   (reentrada / aproximación / aterrizaje) del guion explorado en la rev.3
   se simplifican a la banda de una sola línea: mostrar "12 de 30 temas" en
   tiempo real exige el mismo análisis de `generated_solutions` que ya hace
   la página de Auditoría web (`parseCoverageMap`), y traerlo aquí también
   habría sido una segunda lectura pesada — deliberadamente fuera de esta
   fase.
4. **Ninguna cifra que la fase no pudiera respaldar.** Dos ajustes respecto
   al guion explorado, los dos porque el dato real no sostenía la copia:
   - `total_prompts` cuenta lanzamientos (jobs), no respuestas
     (SAMPLING-1, ADR 0030) — el guion decía "90 respuestas" asumiendo
     `prompts × motores`; sostenerlo de verdad habría exigido el plan
     resuelto del proyecto (lectura nueva) o el env global
     `LLM_SCAN_PROVIDERS` (puede sobrecontar por debajo del cap del plan).
     El beat `ascenso` se quedó en la misma unidad sin nombrar que ya usa
     `ScanInProgress` hoy. El beat `órbita` sí dice "respuestas" porque
     `responses_total`/`responses_processed` cuentan filas reales de
     `scan_prompt_results` — una por motor, ya contadas, sin multiplicar
     nada.
   - El beat `entrega` (todas las respuestas con salida terminal de
     extracción) **no muestra ninguna puntuación**. Ese momento ocurre
     antes de que el finalize del run persista el score — mostrar un
     número ahí habría sido inventarlo. El score real sólo aparece cuando
     `ScanProgressPoller` (ya montado) detecta el run en estado terminal y
     refresca la página entera.
5. **Hallazgo suelto, corregido de paso.** La pastilla de Visión general
   (`ScanStatePill`) nunca recibía `auditing` — nunca decía "Auditando…" en
   la pantalla insignia, aunque Dominios y Auditoría web sí lo hacen. La
   única señal nueva de esta fase (¿hay un job `web_audit` vivo?, existencia
   por RLS de usuario, sin service-role) alimenta la pastilla y la banda a
   la vez, así que quedan alineadas sin coste extra.

**Pendiente / roto conocido.**

- **La banda no lleva contador real** ("12 de 30 temas") — dice "revisando
  tu web" sin cifra. Cuando se traiga ese dato, `scan-mission-band.tsx` es
  el único fichero que cambia.
- **No hay aviso por email.** La banda no promete ninguno porque no existe
  todavía backend para él (SCAN-STATES-1 rev.1, fase 2 — columna de
  preferencia, envío, plantilla; necesita su propia aprobación por llevar
  migración).
- **Sin desglose por motor.** El cohete no enciende sus toberas
  individualmente por Gemini/ChatGPT/Claude — necesitaría una lectura nueva
  agrupando `scan_prompt_results` por motor durante el run activo. Fase 3
  de SCAN-STATES-1.
- **La G reconstruida con arcos** (rev.2 de la exploración, 93% de solape
  medido contra el SVG calcado real de `public/brand/genscore-mark.svg`) no
  se usa en esta fase — el fundador eligió el cohete. El hallazgo de que el
  asset de marca está calcado (170 rectas, cero curvas) sigue sin
  resolverse en `public/brand/*.svg`; queda anotado como fase de marca
  propia (BRAND-6), fuera de este PR.
- **Sin verificación visual real.** Este repo no tiene arnés de DOM para
  componentes de servidor (mismo límite que documentó WEB-AUDIT-DRIVE-1);
  la lógica que decide qué mostrar sale entera a `lib/scan/mission-beats.ts`
  con 9 tests, pero el render en pantalla —incluida la sincronía real entre
  el traspaso y `hasActiveAuditJob`— no lo ha visto nadie en un navegador
  contra datos reales. Pendiente del piloto o de una prueba manual del
  fundador contra un proyecto nuevo de verdad.

---


**Addendum rev.4 (2026-08-10) — la animación, rehecha.** La primera pasada por
producción del fundador, en el móvil y sobre la fase de órbita, fue lapidaria:
*«queda muy cutre… el cohete está parado, da la sensación de que la página está
parada»*. El diagnóstico correcto no era el cohete: **un cohete en órbita se
mueve, lo que estaba congelada era la cámara**. rev.3 dibujaba una escena
correcta y quieta, y una pantalla que se queda abierta dos o cuatro minutos
durante el primer escaneo —la primera impresión del producto— leída como
colgada.

rev.4 (`docs/design-reference/scan-states-1/rev4-cohete-vivo.html`) no toca ni
los cinco beats, ni el copy, ni los datos. Cambia la puesta en escena: cada
beat tiene ahora movimiento ambiental continuo y el viaje entero recorre un
arco de día a noche, de modo que la escena, y no el vehículo, es lo que vende
el movimiento.

- **rampa** — vapor venteando en las toberas, dos capas de nubes cruzando a
  distinta velocidad, balizas de torre parpadeando desfasadas, chequeo de
  sistemas en la ventanilla. El cohete es lo único quieto, que es lo que lo
  hace leer como *retenido* y no como congelado.
- **ignición** — humo rodando por la plataforma hacia ambos lados, resplandor
  pulsante bajo las toberas, chispas y medio píxel de vibración del fuselaje.
- **ascenso** — la velocidad la venden dos capas de nubes cayendo en paralaje
  (la cercana pasa POR DELANTE del cohete, que es lo que hace legible el
  paralaje) más líneas de aire.
- **órbita** — el truco de cámara: el cohete sólo cabecea y suelta micro-impulsos
  de maniobra mientras se mueve **el entorno** — estrellas en paralaje, la Tierra
  girando debajo, una estrella fugaz cada 13 s — y los paquetes de datos fluyen
  de la bodega abierta al anillo.
- **entrega** — el anillo completo respira mientras chispas convergen al núcleo.

**La regla de datos no se movió ni un milímetro, y es lo que hace legítimo todo
lo anterior:** sólo la altitud del ascenso y la fracción del anillo codifican
información real. Estrellas, nubes, humo, vapor, chispas, paquetes y Tierra son
decorado y corren a ritmo constante, sin estado de inicio ni de fin,
precisamente para que ninguno pueda leerse como progreso. Sin total conocido el
anillo pasa a arco indeterminado girando en vez de inventar una posición — el
único sitio donde un spinner es honesto, porque el progreso de verdad se
desconoce.

Decisiones técnicas que conviene no deshacer: una escena por beat en vez de una
escena que muta (el cielo cambia de día a noche a lo largo de la misión y una
sola escena no puede expresarlo), con remontado por `key` y fundido de entrada;
sólo `transform`/`opacity` (composición en GPU, sin layout ni filtros animados)
porque esto vive minutos en un móvil; y bajo `prefers-reduced-motion` cada
escena descansa en un fotograma quieto **y completo** — lo que sólo existe en
vuelo (vapor, chispas, paquetes, impulsos) se oculta en vez de congelarse, que
es lo que evita que el fotograma parezca un fallo de renderizado.

Verificado con Chromium contra el componente real montado en una ruta temporal
de Next: las cinco escenas más la variante indeterminada a 375 y 1280 px, y
pares de fotogramas de la órbita separados 4 s que demuestran el desplazamiento
de estrellas, Tierra, cohete y paquetes. Sigue **sin verificar por el piloto**,
por la razón de siempre: el proyecto piloto tiene historial, así que
`isFirstScan` es `false` y el cohete no llega a montarse nunca.


## 56. La misión ocupa la pantalla entera, y el encendido deja de durar un minuto (SCAN-STATES-2, 2026-08-10)

**Estado: implementada.** Task Intake aprobado por el fundador el mismo día,
después de pedir ver una maqueta antes de aprobar (`rev5-pantalla-completa.html`,
PR #378). Tres decisiones suyas, todas explícitas.

**El problema.** El fundador probó rev.4 en producción, en el móvil, con un
dominio nuevo, y reportó tres cosas distintas: la animación era «un pequeño
marco, dejando mucho espacio a los lados»; el mensaje verde de «Dominio creado»
flotaba encima como si fuera de otra pantalla; y había tenido que **recargar
para ver la fase siguiente**.

**El tercer punto no era lo que parecía, y merece quedar escrito.** El sondeo
del cohete es byte a byte idéntico al de `ScanInProgressLive`, que sí funciona.
Lo que falla es el reparto de tiempos: `refreshRunProgressCounters` sólo escribe
los contadores **al cerrar un lote** de hasta `MAX_REAL_SCAN_PROMPTS` prompts,
y el compás `ignicion` es literalmente `stage.done === 0`. En un proyecto de 15
prompts eso significa que el compás con menos que enseñar se quedaba puesto
durante todo el primer lote —del orden de un minuto sin que cambiara un número—
y después `ascenso` pasaba en dos saltos (10/15, 15/15) en segundos. El fundador
nunca llegó a ver el ascenso.

**Qué se decidió.**

1. **Lienzo a sangre.** `.mrk-full` sale del contenedor con
   `margin-inline: calc(50% - 50vw)` y las escenas dejan de pintar su propio
   fondo redondeado: **el degradado de la página ES el cielo**, y viaja de día
   a noche con la misión. En ≥960 px la composición se parte —copy a la
   izquierda, escena ocupando todo el lienzo por detrás— porque lo que compra
   el ancho es más cielo, y la curvatura de la Tierra sólo funciona a esa
   escala.
2. **El aviso verde desaparece como bloque** y su contenido pasa a `.mrk-rail`,
   soldado a la costura entre el marco del producto y el cielo. El argumento:
   el dominio recién creado es cierto durante los cuatro compases mientras el
   compás cambia, así que va en la pieza que no se mueve.
3. **El encendido se temporiza** (`IGNITION_HOLD_MS`, 5,5 s) y `resolveDisplayBeat`
   pasa a la escena de vuelo. **Es una decisión de presentación y por eso se le
   permite un reloj:** cambia qué escena se ve y no toca un solo número. El
   ascenso que devuelve reporta `done: 0` y `climb: 0` —las dos cosas ciertas
   mientras corre el primer lote—, así que la pantalla dice «0 de 15» y el
   cohete sigue en el suelo exactamente mientras eso sea verdad. Lo que se gana
   es que la espera **se ve viva**, porque el movimiento ambiental no cuenta
   nada y puede correr antes de que se mueva el primer contador.
4. **Pantalla completa en todas las secciones** durante el primer escaneo
   (Visión general, Prompts, Competidores, Recomendaciones, Páginas citadas).
   La objeción que se planteó y quedó respondida por el propio código: Prompts
   y Competidores **sí** tienen contenido real en ese momento
   (`createProject` inserta `project_prompts` y `project_competitors` antes de
   arrancar el escaneo), pero **cada una de esas páginas ya sustituía su cuerpo
   entero por `ScanInProgress`** con exactamente esta condición. Así que esto
   cambia un takeover por otro mejor, no oculta nada que antes se pudiera leer.
5. **Las cifras del raíl son reales o no están.** El fundador propuso primero
   una cifra aproximada («no me importa que no sean datos reales», siendo un
   momento guau). Lo que zanjó el asunto no fue la regla sino la aritmética:
   dos compases después, en **esa misma pantalla**, órbita imprime el recuento
   verdadero leído de `scan_prompt_results`. Una cifra inventada en el raíl
   quedaría desmentida por el propio producto, en la misma sesión, delante del
   usuario al que pretendía impresionar. Se resuelve leyendo el plan
   (`resolveScanProvidersForPlan`), y `getPlanForUser` está envuelto en
   `cache()` de React, así que varias secciones pidiéndolo en una petición
   resuelven una sola consulta. Un contador nulo **borra su segmento** en vez de
   rellenarse.

**Verificado** con Chromium contra el componente real montado en una ruta
temporal de Next (retirada): los cinco compases a 375 y 1280 px, el relevo del
encendido comprobado antes y después del temporizador, y cero desbordamiento
horizontal en ambas anchuras.

**Conocido y sin cerrar:** en escritorio la Tierra no cruza el ancho completo
como en la maqueta — la escena conserva su proporción 400×280 y queda
enmarcada. Alcanzar la paridad exige separar el fondo ambiental (estirable) de
los objetos colocados (tamaño fijo), que es lo que hace `rev5`. Y sigue **sin
verificar por el piloto**, por la razón de siempre: el proyecto piloto tiene
historial, así que `isFirstScan` es `false` y esta pantalla no se monta nunca.


**Addendum (2026-08-10, misma tarde) — tres correcciones tras la primera prueba
real en producción.** El fundador escaneó `genscore.es` desde el móvil y
encontró tres cosas. Las tres eran ciertas.

1. **«Cuando el motor está parado, ahí se veían bordes.»** La plataforma eran
   dos `rect` dibujados DENTRO del SVG, que conserva su proporción 400×280 y
   queda centrado — así que el suelo se cortaba antes del borde de la pantalla
   y dejaba dos franjas grises. En ignición se notaba menos porque el humo tapa
   las esquinas. El suelo pasa a ser una banda CSS (`.mrk-ground`) fuera del
   SVG, y el `viewBox` de las escenas de rampa se acorta a 400×228 para acabar
   justo en la línea del suelo. **Lo verdaderamente malo de este fallo es que
   estaba en una captura que yo mismo tomé y no llegué a abrir**: verificar no
   es fotografiar, es mirar. El arreglo se comprobó midiendo el rectángulo en
   el DOM (`x: 0`, `width: 375`) además de a ojo, porque el primer intento
   *parecía* arreglado y no lo estaba — el centrado con `translateX(-50%)` se
   anulaba solo, ya que el envoltorio venía desplazado 16 px por el relleno de
   `.mrk-scene-slot`.
2. **El banner verde seguía apareciendo.** No era el raíl: es el mensaje
   `scan_started` de `lib/projects/feedback-messages.ts`, que se pinta desde un
   searchParam. Se suprime **sólo** cuando la misión ocupa la pantalla, porque
   su texto es lo que el raíl ya dice, apilado encima como segunda superficie.
   Los demás mensajes de feedback no se tocan.
3. **«Dice 24 prompts y yo puse 12.»** El número era correcto y la etiqueta
   mentía. Con 12 prompts y 3 motores salen 36 respuestas, por debajo del suelo
   de 50 de SAMPLING-1 (ADR 0030), así que el run **repite el set dos veces**:
   24 lanzamientos, 72 respuestas. `total_prompts` cuenta lanzamientos, no
   prompts. El raíl pasa a enseñar la multiplicación entera —
   `12 prompts · 2 pasadas · 3 motores · 72 respuestas` — leyendo el recuento
   real de `project_prompts`, y el compás de ascenso deja de decir «prompts
   lanzados» para decir «lanzamientos», que además es la palabra correcta para
   un cohete. Las «pasadas» desaparecen del raíl cuando el run hace una sola.

**Pendiente, planteado por el fundador y sin implementar:** que la misión
mencione la auditoría web —«es un coste relevante y una funcionalidad
importante del producto»— y que la misma animación se use en Auditoría web
mientras corre su proceso. La forma natural es un sexto compás de **reentrada**,
que ya estaba en el concepto original de rev.3 («reentrada en la atmósfera =
auditoría web») y que se descartó entonces por alcance. Necesita su propia
fase: la auditoría corre DESPUÉS del escaneo, así que la misión tendría que
continuar más allá de `entrega`, y eso cambia el contrato de
`computeMissionBeat`, no sólo el copy.


**Addendum (2026-08-11) — la banda de auditoría nunca se mostró.** El fundador
probó el cohete («ahora es perfecto») y añadió: *«pero no he visto la parte de
la auditoría»*. No era percepción suya: `ScanMissionBand` era **código muerto
desde el día que se implementó**, en ONBOARDING-ROCKET-1 Fase 1.

Vivía dentro de la rama `hasData` —que exige un escaneo completado— pidiendo
`isFirstScan`, que es `completedRunsCount === 0`. Mutuamente excluyentes: no
se ha renderizado ni una vez. Y el comentario escrito encima razonaba que
«nunca se solapa con el cohete, que sólo sale en la rama `!hasData`» — el
mismo hecho que la hacía inalcanzable, usado para argumentar que era segura.
Un razonamiento correcto sobre superposición que nunca comprobó la condición
contraria: que fuese alcanzable.

La condición correcta es el **después** del primer escaneo, no su ausencia:
exactamente un run completado. Ahora vive en `shouldShowMissionBand`, con
tests, porque una condición booleana enterrada en JSX es precisamente lo que
nadie revisa — ni el piloto, que tampoco puede llegar aquí.

**Lo que esto dice del proceso, y conviene no suavizarlo:** dos revisiones de
diseño, cuatro pasadas de piloto en verde y una sesión entera de trabajo sobre
esta pantalla no encontraron un elemento que no se dibujaba nunca. Lo encontró
un humano escaneando un dominio real. El piloto no podía verlo —proyecto con
historial, `isFirstScan` falso— y ningún test cubría la expresión porque
estaba en línea dentro del JSX.


## 57. La reentrada: la auditoría web entra en la misión (SCAN-STATES-3, 2026-08-11)

**Estado: implementada.** Maqueta `rev6-reentrada.html` aprobada por el fundador
el 2026-08-10 («Apruebo la maqueta de la auditoría técnica»), implementación
pedida el 11 («implementa también la maqueta de auditoría»).

**Qué resuelve.** Dos peticiones suyas: que la misión ponga en valor lo que hace
la auditoría web —«es un coste relevante y una funcionalidad importante del
producto»— y que la misma animación se use en Auditoría web mientras corre.
Cierra el viaje que rev.3 ya insinuaba y descartó por alcance: «reentrada en la
atmósfera = auditoría web».

**La cinta es lo importante, y su garantía es un test, no un comentario.** El
riesgo que venía gratis con «ponlo en valor, con jerga espacial» era inventar
capacidad: la voz de misión hace que cualquier cosa suene impresionante,
incluidas las que el producto no hace. Así que las dieciséis líneas llevan cada
una su `IssueCheckKey`, y `audit-ticker.test.ts` las valida **leyendo
`issues.ts` del propio fichero**, no contra una copia. Añadir una línea para una
comprobación inexistente pone la suite en rojo; borrar una comprobación del
producto también, hasta que se borre su línea. Sobrevive a un autor que no lea
los comentarios, que es más de lo que puede decir un comentario.

Las dos líneas de cobertura quedan fuera: son Pro, y un proyecto Free vería o
trabajo que no se está haciendo, o candados — que convierten una espera en un
anuncio.

**Dónde sale, y por qué más estrecho que la maqueta.** La maqueta pedía la
reentrada a pantalla completa en Auditoría web «mientras dure». Comprobado
contra el código: esa página **no se apodera hoy de la pantalla** — un proyecto
con auditoría previa sigue leyendo sus datos con una píldora «Auditando…». Así
que sale **sólo cuando no hay nada que tapar**: sin resumen de cobertura y sin
snapshot técnico, es decir la primera auditoría del dominio. Misma regla que el
cohete con `isFirstScan`, y mismo error evitado — esconder contenido real detrás
de una animación, que es justo lo que el fundador cazó esa misma tarde.

**Ningún elemento de la escena lleva datos.** Reutilizar el anillo de órbita
insinuaría una fracción de «la auditoría», y nada mide la auditoría entera: la
mitad técnica no publica progreso hasta terminar. La única cifra real que
existe (cobertura) no se lee aquí, así que este compás **no enseña ningún
número** en vez de enseñar uno plausible.

**Detalle deliberado:** `auditIsRunning` se lee de la fila de job que la página
ya consulta —sin consulta nueva— y **no** de `auditPillState`, que está
condicionado a `canAuditCoverage`. La mitad técnica corre en todos los planes,
así que la primera auditoría de un proyecto Free es trabajo real y merece el
compás igual que la de uno Pro.

**Conocido y sin cerrar:** el amerizaje (el cierre corto al terminar la
auditoría) está definido en la maqueta pero no implementado; la cinta es un
carrusel de alcance, no un registro en vivo, porque el progreso por
comprobación no se persiste; y esta pantalla **el piloto tampoco puede verla**,
por la misma razón que el cohete.

## 46. La home y `/pricing` recuperan su identidad en el buscador, y las cuatro capas de contenido dejan de estar huérfanas (SEO-POS-1 Fase T-a, 2026-08-09)

**Origen.** El fundador pidió un plan de posicionamiento SEO extremo a extremo
tras la salida a producción. La auditoría técnica que abrió ese trabajo
(`docs/seo-positioning-plan.md`, PR #370) encontró 16 huecos; esta entrada
cierra los tres P0. El plan completo, con la base de keywords y las fases
siguientes, vive en ese documento y no se repite aquí.

**Qué se decidió.**

1. **La home y `/pricing` tienen metadata propia.** Ambas eran componentes
   cliente enteros (`"use client"` en la primera línea), y en el App Router eso
   impide exportar `metadata`: las dos URLs comerciales más valiosas del sitio
   se servían con el título genérico «Genscore» heredado del layout raíz, sin
   descripción propia y **sin canonical**, mientras el sitemap las publicaba.
   Cada una pasa a ser una página de servidor de tres líneas que aporta la
   metadata y monta el mismo árbol de cliente de siempre, ahora en
   `components/landing/landing-page.tsx` y `components/pricing/pricing-page.tsx`.
   Cero cambios visuales: el piloto debe ver exactamente las mismas pantallas.
2. **Keyword primaria «posicionamiento GEO»** en el título de la home, decidida
   con la investigación de mercado del plan (§3.1): en castellano ese es el
   término que gana, «AEO» está capturado por HubSpot y «LLMO» es residual.
3. **Los motores que se nombran en metadata son los tres reales** (Gemini,
   Claude, ChatGPT). Nombrar Perplexity o AI Overviews en un `<title>` sería
   reintroducir por la puerta de atrás el reclamo falso que PRICING-TRUTH-1
   limpió del resto del producto — y un test lo impide ahora.
4. **Las cuatro superficies de contenido entran en todos los pies de página.**
   `/glosario` y `/comparativas` se publicaron en GROWTH-2 2.4 sin enlazarse
   desde ninguna navegación: 21 URLs alcanzables solo por sitemap y `llms.txt`,
   es decir sin un solo enlace entrante desde el propio sitio. `/docs` solo se
   enlazaba a sí misma. Ahora los cinco shells de marketing renderizan la misma
   lista compartida (`components/marketing-content-links.ts`).

**Por qué aditivo y no un rediseño del pie.** Se añaden enlaces; no se quita ni
se renombra ninguno de los que ya había (la landing conserva
«Recomendaciones», el shell legal conserva su orden). Un pie reordenado sin
diseño aprobado es `PILOT FAIL` por definición, y el objetivo aquí era el flujo
de enlazado interno, no el aspecto.

**Lo que queda pendiente, a propósito.** Los P1 de la auditoría (Open Graph por
página, `llms.txt` generado desde las SSOT, 404 propia, `noindex` en las
pantallas de acceso, `FAQPage` en `/pricing`, `dateUpdated` en los artículos,
RSS descubrible) son las fases T-b y T-c del plan, en PRs aparte: el fundador
aprobó el plan, no una fusión de todos sus huecos en una sola entrega. Los dos
hallazgos de rendimiento (middleware corriendo en rutas públicas de contenido,
landing enteramente cliente) están transferidos a la sesión de performance.

**Efecto colateral que conviene registrar:** tras el corte, `/` y `/pricing`
siguen prerenderizándose como estáticas en el build — el split no las volvió
dinámicas.

---

## 47. Cada página se comparte con su propia cara, y `llms.txt` deja de mentir por omisión (SEO-POS-1 Fase T-b, 2026-08-09)

**Qué se decidió.** Los P1 de la auditoría del plan SEO, en un solo barrido
porque todos son la misma clase de deuda: señales que el sitio ya podía emitir
y no emitía.

1. **Open Graph y Twitter por página** (T5), desde un constructor único
   (`lib/seo/metadata.ts`). Antes, los 10 artículos, las 4 comparativas, los 5
   docs y las 16 páginas de glosario se compartían todos con el título
   «Genscore» y la misma imagen genérica.
2. **`llms.txt` generado desde las SSOT** (T6). Era estático y había derivado
   hasta listar 5 de 10 artículos, 1 de 3 comparativas y ninguna de las 15
   páginas de glosario. Es el fichero sobre el que el producto publica una
   guía: que estuviera rancio era un problema de credibilidad, no solo de
   cobertura.
3. **404 propia** (T7), **`noindex` en las cuatro pantallas de acceso** (T10) y
   **RSS descubrible** (T11) — el feed existía desde 2.1 y nada lo enlazaba.

**Tres fallos reales encontrados durante la implementación, los tres del mismo
tipo: cambios que parecían mejoras y empeoraban la tarjeta.**

- **El `openGraph` de una página REEMPLAZA el del layout raíz en Next; no se
  fusiona campo a campo.** La Fase T-a había añadido `openGraph: { title,
  description, url }` a la home y a `/pricing`, y con eso les quitó
  `og:image`, `og:site_name`, `og:locale` y la tarjeta de Twitter enteras —
  sin ningún error, y dejando las dos páginas más compartidas peor que antes.
  Se descubrió leyendo el HTML del build, no el código. Por eso el constructor
  emite siempre el objeto completo: nadie debería tener que recordar esa regla.
- **Un `og:image` en SVG da una tarjeta en blanco.** Ninguna red social
  renderiza SVG, y tres portadas del blog lo son. Ahora una portada solo se usa
  si es rasterizada; si no, cae a la imagen de marca.
- **Las portadas PNG reales son cuadradas de 1254×1254**, no 1200×630. El
  constructor declaraba 1200×630 para toda imagen. Se declaran medidas solo
  para la imagen de marca, cuyo tamaño sí se conoce; para una portada se omiten
  y el rastreador la mide.

**Lo que queda.** T-c (`FAQPage` en `/pricing` y `/geo`, `dateUpdated` en los
artículos, las 3 portadas que faltan en `Article.image`, la fecha rancia del
pilar `sectores`) y la Fase C de contenido.

---

---

## 48. Los últimos P1 técnicos del plan SEO: preguntas reales marcadas, tres portadas que faltaban, y un pilar que dejó de mentir sobre su edad (SEO-POS-1 Fase T-c, 2026-08-10)

**Qué se decidió.** Cierra los tres P1 menores que quedaban abiertos del plan
(`docs/seo-positioning-plan.md`): T8, T9 y T15.

1. **`FAQPage` solo en `/pricing`, no en `/geo`.** `PLAN_FAQ` ya se renderiza
   de verdad en un acordeón (`components/pricing/pricing-page.tsx`), así que
   el schema reusa exactamente esas preguntas y respuestas. `/geo` se queda
   fuera **a propósito**: no tiene ningún bloque de preguntas y respuestas
   real, y `FaqPageSchema` existe para marcar contenido que ya está en la
   página, nunca para fabricarlo (`content-strategy.md` §4.3, y el propio
   comentario del componente: "nunca inventar o duplicar preguntas que el
   contenido visible no responde"). Añadir un FAQ real a `/geo` es trabajo de
   contenido, no una tarea técnica de esta fase.
2. **`dateUpdated` opcional en `BlogPost`**, propagado a `ArticleSchema.
   dateModified`, a `openGraph.modifiedTime` (`lib/seo/metadata.ts`) y a un
   componente nuevo, `PostMeta` (`components/blog/article/blocks.tsx`), que
   sustituye la fecha en prosa suelta que cada uno de los 10 MDX escribía a
   mano (`<p className="blog-post-meta">12 de julio de 2026</p>`). Derivarla
   de `post.datePublished`/`dateUpdated` en vez de teclearla es lo que impide
   que se desincronice del dato real que ya usan el schema y el sitemap.
   **Ningún post tiene `dateUpdated` todavía** — es la tubería, no un refresco
   inventado; un test (`lib/blog/posts.test.ts`) falla si alguien pone una
   fecha ahí sin que el cuerpo del artículo cambie de verdad, precisamente la
   regla de `content-strategy.md` §4.4 ("nunca solo la fecha").
3. **Las 3 portadas que faltaban.** `que-es-el-geo-score`,
   `llms-txt-guia-practica` y `como-conseguir-que-chatgpt-te-cite` no tenían
   `coverImage`, así que ni su `Article.image` ni su `og:image` tenían nada
   real que mostrar (caían al genérico de marca). Se diseñaron tres portadas
   nuevas siguiendo la convención visual ya establecida (fondo oscuro con dos
   manchas de brillo, composición centrada en (600,150) para sobrevivir a la
   tarjeta de `/blog` en móvil, sin texto) — y cada una es evidencia real del
   artículo, no decoración (ADR 0026): las cuatro barras de
   `que-es-el-geo-score` son los pesos reales del GEO Score (40/25/20/15 %,
   ADR-0015, el mismo dato del `StatGrid` del cuerpo); el fichero de
   `llms-txt-guia-practica` reproduce su estructura real de secciones, con
   `robots.txt`/`sitemap.xml` atenuados a los lados porque el artículo los
   compara explícitamente; los tres círculos crecientes de
   `como-conseguir-que-chatgpt-te-cite` son los tres puntos reales del
   "Checklist práctico" en su mismo orden de esfuerzo. Diseñadas en SVG y
   **rasterizadas a WebP** (vía `sharp`, ya presente como dependencia
   transitiva) — el SVG de origen no se conserva en el repo, igual que las
   cuatro portadas que ya habían pasado por esa conversión en
   PRELAUNCH-HARDENING-1 Fase V no dejan un `.png` huérfano detrás. La razón
   de rasterizar y no dejarlas en SVG: ninguna red social ni el validador de
   datos estructurados de Google aceptan SVG de forma fiable, así que un
   `Article.image`/`og:image` en SVG no cierra el hueco — simplemente cambia
   de forma de estar roto.
4. **`sectores` deja de compartir fecha con los otros tres pilares.**
   `PILLAR_LAST_MODIFIED` era una única constante aplicada a los cuatro
   `/blog/<cluster>`, pero `fundamentos`/`medicion`/`playbooks` ganaron su
   `pillarIntro` el 2026-08-03 y `sectores` no la tuvo hasta su primer
   artículo, dos días después. Eso dejaba a `sectores` rancio desde el mismo
   momento en que entró en el sitemap. Pasa a ser un mapa por cluster
   (`app/sitemap.ts`), con la fecha real de cada uno.

**Validación:** 1885/1885 tests (33 nuevos: `PLAN_FAQ` fijado al schema,
`dateModified`/`modifiedTime` con y sin `dateUpdated`, `PostMeta` con y sin
"Actualizado el…", `sectores` con su propia fecha de sitemap, presupuesto de
assets con las tres portadas nuevas dentro de tope). `pnpm run validate`
limpio. Verificado sobre el HTML del build, no solo sobre el código: las tres
portadas sirven a la vez en `Article.image` y `og:image`; `/pricing` emite
`FAQPage`; `sectores` y `fundamentos` llevan fechas distintas en el sitemap.

## 49. El self-check vuelve a verde, y la lección no es el fixture (PRELAUNCH-HARDENING-1 Fase Q5, 2026-08-10)

Cierra el rojo de §44. **El producto no se toca en toda esta entrada**: lo roto
era la línea base del arnés, no la aplicación.

**Lo que había que poner al día en `tests/pilot/fixtures/server.mjs`.** Tres
pantallas que los journeys ya pedían y el fixture aún no servía —Ajustes
rediseñada (CONSOLE-REDESIGN-1), el tour en `/dashboard` y en el hero de la
landing (ONBOARDING-TOUR-1), la campana y la pantalla de notificaciones— más
tres posts de blog nuevos. Nada de eso es interesante por sí mismo. Lo
interesante son las dos formas en que un fixture puede mentir, que aparecieron
las dos:

- **Colisión de selectores por orden del DOM.** El panel de la cabecera usaba
  `.notif-row`, que es justo el selector con el que la pantalla de
  notificaciones demuestra que trae contenido real. Como ese panel vive oculto
  en la cabecera de *todas* las páginas, la primera coincidencia del DOM era
  invisible y la pantalla se reportaba como estado vacío. Mismo patrón, otra
  vez, en la pestaña «No leídas»: las filas se **eliminan** al cambiar de
  pestaña en vez de ocultarse, porque el journey mira
  `.notif-row, .notif-page-empty` y toma la primera del DOM.
- **Ocultar no es cerrar.** El popup de bienvenida se ocultaba (`display:none`)
  al recargarse ya visto, y el journey comprueba `toHaveCount(0)` — porque la
  regresión real que persigue (2026-08-07) era un popup que reaparecía en cada
  carga. Pero eliminarlo sin más deja sin nada que abrir al botón «¿Qué es el
  GEO?» del menú. Se resuelve como lo resuelve el producto: se elimina, y
  reabrirlo es **reconstruirlo** desde su propio markup.

**La evidencia que no existía.** El paso «Upload self-check output» subía
`.pilot/`, y eso no podía funcionar por dos motivos a la vez: `pilot.mjs` borra
ese directorio al arrancar cada caso, así que sólo sobrevivía el último —y el
que hay que mirar es casi siempre el primero, el sano—; y empieza por punto, y
`actions/upload-artifact` ignora los ocultos salvo que se le diga. Ahora cada
caso se archiva en `pilot-selfcheck-output/<caso>/` según termina, en el
`finally`, pase lo que pase con él.

**Lo que de verdad costó dinero, dicho sin adornos.** El comentario de
`pilot-selfcheck.yml` afirmaba que el sandbox del agente no tenía un Chromium
funcional para esta versión de Playwright, y esa creencia justificaba medirlo
sólo en CI. **Era falsa**: Chromium está preinstalado y el self-check entero
corre en local. Cuatro iteraciones del fixture se hicieron a base de esperar
pasadas de CI de ~22 minutos cada una, con el diagnóstico llegando en trozos
por el `tail` del log, cuando las mismas dos pruebas tardan **47 segundos**
ejecutadas aquí. La corrección está escrita en el propio workflow, no sólo
aquí, porque es donde la leerá quien vuelva a caer.

**Qué queda de Q5**, sin empezar: `ContentExpectation` en
`second-project.spec.ts`, el `pr_number` de `ux-pilot-write.yml`, la pérdida
intermitente de sesión en la última anchura (§42 — instrumentar antes que
parchear), y plantear devolver el self-check a puerta de PR ahora que su coste
está medido.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase Q5; §44 (el rojo que
esto cierra); §42 (el flake de sesión, aún abierto).

---


---

## 50. Primera pieza de la Fase C, y una corrección al propio plan antes de escribirla (SEO-POS-1, S1, 2026-08-10)

**Origen.** Primera pieza de la cola de contenido priorizada por
`docs/seo-positioning-plan.md` §4 (Fase C) — el fundador aprobó seguir "en
modo loop" tras cerrar las tres fases técnicas (T-a/T-b/T-c, log §46-48).

**Hallazgo antes de escribir una sola línea: el propio título propuesto en el
plan mentía.** La fila S1/C1 del plan decía "Cómo saber si tu marca aparece
en ChatGPT (y en Gemini y Perplexity)" — pero Perplexity **no es un motor
soportado por Genscore hoy** (`docs/launch-plan.md` Fase 8/ENGINES-2: Gemini,
Claude y ChatGPT; Perplexity "sin fecha, fuera de alcance"). Publicar ese
título habría sido exactamente el mismo reclamo falso que PRICING-TRUTH-1
retiró del resto del producto — solo que en la primera pieza de contenido
nueva que produce este plan, y en la propia investigación de mercado que lo
sustenta. Corregido a "…en ChatGPT, Gemini y Claude" antes de escribir el
artículo. La lección para las 9 piezas que quedan en la cola: el título de
una fila del plan es una propuesta de la investigación, no un hecho verificado
contra el código — se re-verifica al escribir, no se copia.

**La pieza** (`/blog/como-saber-si-tu-marca-aparece-en-chatgpt`, cluster
`playbooks`): tres formas reales de comprobar si un motor menciona tu marca,
de menos a más fiable — preguntar tú mismo con varios prompts repetidos
(ilustrado con una `Figure`/`AnswerPair` mostrando cómo un prompt casi
idéntico da un resultado distinto), revisar la analítica propia por si
diferencia tráfico de asistentes de IA, y usar una herramienta sistemática
como Genscore. La comparativa por motor que describe (mención, citación,
sentimiento) se verificó contra el código real de la tarjeta de Overview
(`app/dashboard/projects/[projectId]/page.tsx`, ENGINES-VALUE-1) — la
primera redacción decía además "en qué posición", campo que esa tarjeta no
expone por motor, y se corrigió antes de publicar. Una cifra sin fuente
("80% de las veces… 10%…") que se había colado en el borrador del FAQ se
sustituyó por lenguaje cualitativo — no había ningún dato real detrás.
`FAQPage` con 3 preguntas reales, portada nueva (tres motores con veredicto
distinto: citado, mencionado sin cita, ausente — evidencia del hallazgo
central del artículo, no decoración).

**Fixture del piloto actualizado en el mismo PR** (`tests/pilot/fixtures/
server.mjs`): `fixture-drift.test.ts` (log §44) exige que cada post nuevo
entre en la lista, o su journey recibe un 404 y tumba el caso sano del
self-check — funcionó exactamente como debía, cazándolo antes de mergear.

**Validación:** 1892/1892 tests, `pnpm run validate` limpio. Verificado sobre
el HTML del build: título/canonical propios, `FAQPage` presente, entra en el
índice de `/blog`, en el pilar `playbooks` y en el sitemap.


---

## 51. Banco de pruebas offline para el modelo de extracción (EXTRACTION-COST-BENCH-1, 2026-08-09)

**Estado: herramienta construida y verificada; ejecución con datos reales
pendiente — este sesión no tenía credenciales de Supabase/Gemini/OpenAI.**

Nace de la conversación de desglose de coste de LLM: la extracción estructurada
(`lib/scan/extraction.ts`) usa siempre el mismo proveedor que generó la
respuesta, sin ninguna razón técnica — el input es `raw_response_text`, ya
persistido, así que cualquier extractor puede parsearlo venga de donde venga.
Es además ~50% de todas las llamadas LLM del pipeline y la que mete más input
(esquema completo + la respuesta cruda entera), y no registra tokens ni coste
en ningún sitio. `scripts/extraction-bench.ts` (`pnpm bench:extraction
--limit N`) reextrae filas históricas con modelos candidatos más baratos
(`gemini-2.5-flash-lite`, `gpt-4o-mini`, y `gemini-2.5-flash` como referencia
de control) y compara el resultado contra lo ya persistido, sin tocar una fila
de producción.

### Decisiones y por qué

- **Reutiliza las funciones reales de extracción y verificación**
  (`extractGeminiStructuredData`, `extractOpenAIStructuredData`,
  `verifyExtractedMentions`, `reconcileExtractedCompetitors`), no una copia. El
  modelo candidato se selecciona sobreescribiendo `GEMINI_MODEL`/`OPENAI_MODEL`
  justo antes de cada llamada y restaurando el valor previo después — la única
  forma de variar el modelo sin tocar `lib/llm/**` (prohibido en el Task
  Intake aprobado), porque esas funciones no aceptan un `model` explícito.
- **`citations_count`/`citation_found` quedan fuera de la comparación a
  propósito.** Se calculan desde `raw_response_json.grounding_chunks`, que es
  metadata congelada en el momento de GENERACIÓN — ningún modelo de extracción,
  barato o no, puede cambiarlos. Compararlos aquí mediría ruido, no señal.
- **El coste es estimado, no medido.** Ninguna de las tres funciones de
  extracción devuelve `usage` del proveedor — ese hueco es precisamente lo que
  esta herramienta sirve para detectar, no para resolver; resolverlo exigiría
  tocar `lib/llm/**`, fuera del alcance aprobado. La estimación usa una
  heurística caracteres/4 contra tarifas públicas por token — válida para una
  decisión de sí/no, no para fijar pricing con precisión.
- **`import "server-only"` no resuelve fuera de `next build`/`next dev`.**
  Todos los módulos de `lib/**` que este script reutiliza abren con ese
  import; el paquete `server-only` solo resuelve a un no-op bajo la condición
  de exports `react-server`, que el bundler de Next fija internamente. El
  script se invoca con `NODE_OPTIONS=--conditions=react-server` para
  reproducir esa misma condición fuera del bundler — mecanismo de Node de
  primera clase, sin loader personalizado ni tocar ningún fichero de `lib/`.
  Tuvo que añadirse `server-only` como devDependency real (antes solo lo
  resolvía el bundler de Next vía alias interno) y `tsx` para poder ejecutar
  TypeScript con imports de proyecto fuera de Next.
- **Guardado de solo lectura, verificado por test, no por convención.**
  `scripts/extraction-bench.test.ts` falla si el fichero contiene
  `.update(`/`.insert(`/`.upsert(`/`.delete(`. El propio `main()` solo se
  ejecuta cuando el fichero es el punto de entrada directo (`import.meta.url
  === file://${process.argv[1]}`) — sin ese guard, importar el módulo para sus
  funciones puras desde el test también disparaba una llamada real a Supabase.

### Pendiente / roto conocido

- **No hay resultados reales todavía.** Esta sesión no tenía
  `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`GEMINI_API_KEY`/
  `OPENAI_API_KEY` — se verificó que la herramienta compila, pasa sus tests
  (18, todos sobre las funciones puras) y falla limpiamente al llegar al
  punto que necesita credenciales. Ejecutar `pnpm bench:extraction --limit
  50` con credenciales reales, y decidir el cambio de modelo de extracción con
  esos resultados, es la fase siguiente — no esta.
- **El coste estimado seguirá siendo una aproximación** hasta que una fase
  posterior (fuera de este alcance) exponga `usage` desde
  `extractGeminiStructuredData`/`extractClaudeStructuredData`/
  `extractOpenAIStructuredData`.

---

## 52. La auditoría automática se parte en dos interruptores, ambos apagados (WEB-AUDIT-AUTO-SPLIT-1, 2026-08-09)

**Estado: implementada.** Task Intake aprobado por el fundador el mismo día
("Aprobado").

**El problema.** La 0030 dio un interruptor único por dominio para la auditoría
automática tras escaneo. Pero esa auditoría son dos mitades con coste opuesto
(ADR 0035): la **cobertura** son llamadas de grounding a Gemini, una por prompt
activo, sólo Pro/Agencia; la **técnica** no gasta LLM y su nota es un
componente del GeoScore (ADR 0033). Con un control único, apagar el gasto
obligaba a perder también la nota — dos decisiones distintas que nunca
debieron compartir interruptor. Salió al desglosar el coste real de LLM
(`docs/llm-cost-analysis-2026-08.md`), donde la auditoría automática apareció
como gasto de grounding que se dispara tras **cada** escaneo en Pro+ sin pasar
por el límite de 5/día que sí protege el botón manual.

### Decisiones y por qué

- **Por defecto apagadas las dos, invirtiendo la 0030.** La 0030 puso `default
  true` precisamente para que aplicarla no apagara auditorías en silencio; ese
  razonamiento era correcto entonces y no aplica ahora. El fundador pidió las
  dos apagadas por defecto y ese mismo día apagó los 44 proyectos existentes a
  mano por SQL. `false` no es un cambio de comportamiento aquí: es el estado en
  el que ya está producción, hecho duradero para los proyectos que se creen a
  partir de ahora. Con el `default true` anterior, **cada proyecto nuevo volvía
  a armar la auditoría en silencio** — que es exactamente el agujero que dejaba
  la barrida por SQL.
- **No se hereda el valor de la columna vieja.** Por lo mismo: el valor honesto
  de cada fila hoy es «apagado», que es lo que da el `default`. Heredar habría
  reactivado los proyectos que no se hubieran barrido.
- **Leer falla CERRADO**, al revés que la 0030. Con defecto `false`, «no pude
  leer los flags» y «los flags están apagados» significan lo mismo en la
  práctica, y el error caro pasa a ser el otro. Coste asumido y dicho: un fallo
  transitorio de lectura se salta una auditoría, que recuperan el siguiente
  escaneo o el backfill diario.
- **Los flags se releen al ejecutar el job, no se congelan al encolarlo.** Un
  job puede esperar un ciclo de backoff entero; un control que promete «detiene
  la próxima auditoría» tiene que cumplirlo. No cuesta consulta: viajan en la
  fila que `loadProjectContext` ya cargaba.
- **El interruptor técnico se comprueba antes del reserve de presupuesto.** Al
  revés, un job con la técnica apagada se aparcaría esperando hueco para algo
  que nunca va a correr, re-despachándose hasta el tope de continuaciones — la
  trampa que ADR 0035 ya documentó para la cobertura sin plan.
- **`deriveRunAuditStatus` pasa de una pregunta a dos.** `coverageIncludedInPlan`
  se renombra a `coverageExpected` y aparece `technicalExpected`: una mitad
  apagada a mano no deja la auditoría «Parcial», igual que no la dejaba una
  cobertura fuera de plan. El renombrado es deliberado —el nombre viejo había
  dejado de describir la pregunta— y el typecheck obligó a revisar cada
  llamador, que era el objetivo.
- **`setAutoWebAudit` se elimina, no se deja al lado.** Escribía la columna que
  esta fase retira; un control que sigue escribiendo algo que nadie lee es peor
  que ningún control. Lo sustituye `setAutoAuditHalf`, parametrizado por mitad.
- **Copy por mitad, no genérico.** Cada texto dice qué mitad y qué cuesta,
  porque el fundador las apaga por coste y las dos no cuestan lo mismo.

### Pendiente / roto conocido

- **La migración 0031 hay que aplicarla a mano** en Supabase, como todas las de
  este repo. Hasta entonces `/debug` pinta «Sin migrar» en vez de ofrecer un
  interruptor que no puede funcionar (lección de la 0030, reportada por el
  fundador desde el móvil el 2026-08-05), y el backend no audita nada.
- **`auto_web_audit_enabled` queda en el esquema sin lector.** Tirarla es un
  cambio destructivo con su propia aprobación; una fase futura puede hacerlo
  cuando ésta lleve tiempo en producción.
- **Sin piloto agéntico todavía**: los interruptores viven en `/debug` y esta
  fase no se ha visto en un preview. Antes del Human Gate hay que mirarlos en
  las tres anchuras.

---

## 53. Un tercer interruptor apaga el suelo de muestreo por proyecto (SAMPLING-DEBUG-TOGGLE-1, 2026-08-09)

**Estado: implementada.** Task Intake aprobado por el fundador el mismo día
("Si"), incluyendo dejar explícitamente pendiente la pregunta de qué hacer
cuando lleguen clientes reales de pago, en vez de resolverla ahora con un flag
por plan.

**El problema.** El suelo de respuestas (SAMPLING-1, ADR 0030) repite el set de
prompts de un proyecto hasta 5 veces para llegar a 50 respuestas por escaneo.
Correcto para un dominio real; carísimo para una prueba interna de 2-3
prompts, donde forzaba 15 llamadas de LLM por escaneo sin que hubiera nada que
medir con esa precisión. El fundador, tras confirmar los dos interruptores de
la fase anterior (WEB-AUDIT-AUTO-SPLIT-1, entrada 52), pidió uno más de la
misma familia.

### Decisiones y por qué

- **Interruptor tercero de la misma familia, mismo patrón que las dos mitades
  de la 52: por defecto apagado.** Migración 0032, columna
  `sampling_enabled boolean not null default false`. Mismo argumento que la
  52: no hay clientes de pago todavía cuya fiabilidad de score dependa de
  esto, así que el coste de apagarlo por defecto es cero hoy y la pregunta de
  qué pasa cuando los haya queda anotada como pendiente, no resuelta.
- **No es una cuarta capa de exención junto a plan/dominio en `sampling.ts`.**
  Esas dos son decisiones de producto permanentes; ésta es un override de
  depuración pensado para pruebas prelanzamiento. `computeSampleCount` le da
  su propio `SamplingReason` (`manually_disabled`), comprobado justo después
  de `no_work` y antes de dominio/plan, para que el diagnóstico distinga «se
  apagó a mano» de «no aplicaba por dominio o plan» — ambos producen
  `samples: 1`, y sin el motivo separado serían indistinguibles.
- **La lectura falla ABIERTO, al revés que las dos mitades de auditoría, y la
  asimetría es a propósito, no una inconsistencia.** Los flags de la 0031 se
  leen dentro de funciones cuyo único trabajo es decidir si gastar en una
  auditoría — fallar hacia «no gastar» no cuesta nada más. Esta columna se lee
  dentro de `createPendingScanRunCore`, que está en el camino crítico de todo
  escaneo del producto (H1, CLAUDE.md). Fallar CERRADO aquí (columna ausente →
  desactivado) convertiría una lectura lenta, o simplemente esta migración sin
  aplicar todavía, en una degradación silenciosa de la fiabilidad de score en
  todo el producto — el daño exacto que esta función existe para mantener
  opt-in. Por eso `run-creation.ts` lee esta columna en **su propia consulta**,
  separada del select del proyecto, y sólo un `sampling_enabled = false`
  explícito llega a `computeSampleCount` como `samplingEnabled: false`;
  cualquier otra cosa (columna ausente, lectura fallida, `true`) llega como
  `undefined`, que el propio default de la función mantiene en «muestreo
  activado» — el comportamiento ya desplegado.
- **Por qué una consulta aparte y no añadir la columna al select ya existente
  del proyecto.** Ese select comprado ya lleva la lección escrita en
  `/debug/page.tsx` para los flags de auditoría de la 0031: una columna que
  PostgREST no conoce hace fallar el select ENTERO, no sólo ese campo. Ese
  select en `requireActiveProject` alimenta seis pantallas; el de
  `createPendingScanRunCore` es el que crea cada `scan_runs` del producto.
  Fusionar la columna ahí habría hecho que la migración 0032 sin aplicar
  rompiera la creación de escaneos para todo el mundo, no sólo la fiabilidad
  del muestreo — la fase 52 evitó exactamente este error separando su propia
  consulta en `/debug`; aquí el riesgo era mayor porque el select comparte
  camino con el flujo núcleo (H1), no con una pantalla de operación.
- **Tercer switch en `/debug`, mismo patrón visual que los dos de la 52.**
  Consulta propia con su propio guardián de migración (`sampling_enabled`
  ausente → «Sin migrar», nunca un interruptor que parece operable y no puede
  funcionar — misma lección de la 0030 que ya evitó la 52).

### Pendiente / roto conocido

- **La migración 0032 hay que aplicarla a mano** en Supabase, después de la
  0031. Hasta entonces `/debug` pinta «Sin migrar» y el backend mantiene el
  suelo de muestreo activado en todos los dominios (comportamiento actual, sin
  cambio).
- **Qué hacer cuando lleguen clientes reales de pago queda sin resolver a
  propósito.** El fundador aprobó dejarlo así: hoy no hay ninguno cuya
  fiabilidad de score dependa de este interruptor, así que no hace falta un
  flag por plan todavía — pero antes de vender el producto, alguien tiene que
  decidir si este control sigue existiendo tal cual, se oculta del cliente, o
  se retira.
- **Sin piloto agéntico todavía**: mismo estado que la 52 — el interruptor
  vive en `/debug` y esta fase no se ha visto en un preview.
## 54. La landing deja de ser una aplicación y el CSS de consola deja de viajar a /blog (PRELAUNCH-HARDENING-1 Fase V, V4+V5, 2026-08-10)

Los dos únicos slices de la Fase V que cambian aspecto, y por eso iban aparte
con su propia pasada de piloto. Medido, no estimado.

### V4 — la landing y `/pricing` pasan a servidor

Las dos páginas comerciales eran `"use client"` **enteras** por muy poco: la
landing por un campo con estado y su marcador tecleado; `/pricing` por el
acordeón de preguntas. A cuenta de eso viajaban al navegador seis secciones de
markup que no cambian nunca, las tres tarjetas de plan y la matriz de
comparación.

Lo que sostenía el `"use client"` no era el estado, era `router.push`: nueve
botones que sólo navegaban. Ahora son `<Link>`. El aspecto no cambia —las
clases (`.lp-cta`, `.lp-nav-btn`, `.btn`) declaran su propio
`display: inline-flex`, `a { text-decoration: none }` es global, y `.lp-cta-soft`
ya se usaba sobre un `<a>` en ese mismo hero— y se gana lo que un botón no
daba: abrir en pestaña nueva, ver el destino al pasar por encima y, en el logo
de `/pricing`, existir para el teclado (era un `<div onClick>` con
`cursor: pointer`).

Queda de cliente lo que de verdad reacciona: `HeroDomainField`, `PricingFaq`,
el cajón de navegación en móvil y el tour.

**Hallazgo de propina:** la landing importaba `Gauge`, `Sparkline`, `Delta` e
`InfoTip` y **no usaba ninguno**. Dos de ellos son componentes de cliente, así
que se empaquetaban y se enviaban para nada. Sobraban desde que el tour
sustituyó a la captura estática del hero (§40) y el linter no los ve porque son
imports usados… en el sentido de que TypeScript los da por consumidos hasta que
no lo están.

**Medido:** el JS de cliente de toda la aplicación baja de **1.974.481 a
1.879.500 bytes (−93 KB, −4,8 %)**, y el texto de la landing —«Recomendaciones
que se convierten en trabajo hecho», la cita de Beltway, las preguntas de
precios— desaparece de los chunks de cliente: ahora sólo existe en el HTML que
sirve el servidor.

**Lo que NO se hizo, y por qué**, porque el slice aprobado decía «landing
server + tour diferido»: el tour **no** se difiere. Diferirlo de verdad exige
`ssr: false`, y eso cambia cuatro cosas a la vez: mete salto de layout donde
hoy no lo hay, retrasa el LCP en vez de adelantarlo (el lienzo del hero *es* el
elemento grande), deja al piloto sin su prueba de contenido
(`.ptour--hero .pt-stage` dejaría de existir en el HTML) y toca una zona con
invariantes propios (`.claude/rules/onboarding.md`: no arranca hasta verse
entero, la pista del botón, altura constante). Cambiar el aspecto para ganar
algo sin medir es justo lo contrario de esta fase. Queda propuesto como slice
propio.

### V5 — `app/console.css`

`globals.css` eran 303 KB servidos en toda página, la mayoría selectores que
sólo pinta la consola. Ahora hay una segunda hoja que importa
`app/dashboard/layout.tsx`.

**Se movieron 16 secciones, no las 25 que el análisis marcó como de consola.**
Las nueve que faltan no se quedaron por prudencia vaga sino por una razón
concreta: `console.css` se carga *después* de `globals.css`, y `globals.css` no
está por capas. Hay secciones posteriores que sobrescriben a propósito reglas
de consola anteriores —MOBILE-1, el layout de consola en móvil, es el caso
gordo—; traerse las de arriba las pondría por delante de quien debía ganarles.
Se detectaron **16 solapes** de ese tipo y sus secciones se quedaron donde
estaban.

**Dos veces se equivocó el clasificador, y las dos importan:**

1. Siguiendo el cierre de imports desde las rutas públicas dio por «sólo
   consola» el **sistema de artículos del blog** (`.art-*`) — sus clases se
   aplican desde `lib/` y desde imports relativos que no seguía. Un error hacia
   el lado peligroso: habría dejado el blog sin estilo.
2. Corregido con una regla tosca —«si la clase aparece en cualquier fichero
   fuera de `app/dashboard/**`, se queda»—, esa regla deja fuera cosas que sí
   son de consola: la pantalla de notificaciones y la campana, cuyas clases se
   escriben desde `components/`. Se aceptó perder esos ~4 KB. Un guardián que
   puede quitarle el estilo a una página pública no vale aunque acierte casi
   siempre, y la versión fina es exactamente la que ya falló.

La regla tosca vive ahora en `tests/console-css-scope.test.ts`, que además
comprueba que la consola siga importando la hoja. Sin eso, el ahorro se evapora
en el primer PR que escriba una clase compartida ahí y nadie se entera: no
falla nada, la página simplemente se ve mal.

**Medido:** el CSS de las páginas públicas baja de **211.298 a 198.514 bytes**
minificado. Los 12.784 bytes se mueven exactos a la hoja de consola, que carga
lo mismo que antes.

**Pendiente:** los ~33 KB restantes exigen ordenar la cascada primero
(`@layer`, o mover MOBILE-1 entero). Es un cambio de quién gana en cada empate
de especificidad, no una limpieza — su propia fase, con su propia pasada de
piloto.

### Y de camino, cuatro controles que mentían

Salieron de la propia revisión del PR y el fundador pidió arreglarlos. No son
rendimiento: son cosas que la interfaz decía y el producto no cumplía.

**El campo del hero tiraba lo que escribías.** La portada te invita a escribir
tu dominio, pulsabas «Analiza gratis», y llegabas al registro sin rastro de él;
después el asistente te lo volvía a pedir. Un campo que no sirve para nada es
teatro. Ahora se guarda en `localStorage` y el asistente lo recoge y lo
consume. `localStorage` y no la URL porque entre el hero y el asistente hay una
confirmación por correo: el dato tiene que sobrevivir a salir del navegador y
volver. Coste declarado: si escribes en el móvil y confirmas en el portátil, se
pierde — igual que antes.

Al hacerlo apareció **un tercer duplicado del mismo tipo que R1**: había dos
`isValidDomain`, una en `onboarding-wizard.tsx` y otra en
`lib/projects/project-form.ts`, **y no eran la misma función** — la del
asistente es un regex estricto, la del servidor es laxa a propósito
(«rechaza lo absurdo, deja pasar lo raro»). Si el hero hubiera usado la laxa,
guardaría dominios que el asistente rechaza acto seguido. Ahora la estricta
vive una sola vez como `isWellFormedDomain`, con la diferencia entre ambas
escrita al lado para que nadie las fusione por parecerse.

**Tres botones que no hacían nada:**

- «Generar solución», en la tarjeta de ejemplo de la landing: la recomendación
  que ilustra es inventada, así que no hay nada que generar. Pasa a `<span>`
  con `aria-hidden`: es el dibujo de un botón y ahora lo es también para un
  lector de pantalla.
- «Hablar con ventas» y el CTA del **plan Agencia** en `/pricing`: éstos sí
  debían llevar a algún sitio. El propio producto ya dice a dónde
  (`billing/actions.ts`: *«Este plan no se contrata online. Escríbenos a
  soporte@genscore.es»*), así que el único plan que **exige** hablar con
  alguien era el único sin forma de hacerlo. Ahora son `mailto:` con asunto.

La dirección de soporte estaba escrita a mano en cinco sitios, dos de ellos con
nombres distintos para la misma cadena (`SUPPORT_EMAIL` y `SALES_EMAIL`). No
son dos canales: es el mismo buzón. Pasa a `lib/support.ts`.

### Y un agujero en la puerta que montó la Fase 0

Al comprobar el estado del PR apareció que **`ci.yml` no corrió sobre la cabeza
de la rama**. Se disparó con el `opened` del PR (`f8b6148`) y **no** con los
`push` siguientes, mientras otras ramas la ejecutaban con normalidad esos mismos
minutos. Es decir: los commits que empujas a un PR ya abierto pueden llegar al
Human Gate **sin puerta y sin que nada lo diga** — justo la forma de fallo que
la Fase 0 existía para eliminar, sólo que un nivel más arriba.

**Corrección, unas horas después.** La primera versión de esta entrada decía que
los eventos `synchronize` de esta rama «sencillamente no aparecen». Es falso, y
la forma real es peor: **es intermitente**. En la misma rama y la misma tarde,
tres pushes (`3bdc8ae`, `47b2d39`, `1257700`) no dispararon nada y dos
(`bf95b9b`, `fda1a2b`) sí. Un fallo sistemático se nota y se arregla; uno
intermitente deja creer que la puerta está puesta cuando la mitad de las veces
no lo está.

La causa sigue sin diagnosticar. Lo que sí se ha hecho es que sea
**recuperable**: `ci.yml` acepta ahora `workflow_dispatch`, y con él se verificó
la cabeza real. Un evento perdido se puede reponer a mano; una puerta que sólo
puede dispararla ese evento perdido, no.

**Regalo de esa duplicidad**: `bf95b9b` corrió dos veces —una por
`pull_request`, otra por el dispatch— y salió **verde una y roja la otra**. El
mismo commit. Era el flake de `lib/llm/extraction-fetch.test.ts`: el backoff usa
*full jitter* (`Math.random() * 10.000`) y el caso del plazo afirma que la
espera no cabe en 50 ms, cosa que una de cada ~200 veces no se cumple. Se fija
el sorteo en ese test. Los casos vecinos de `computeRetryDelayMs` ya inyectaban
`random: () => 1`; ése se había quedado sin hacerlo porque llama al helper de
más arriba, que no expone ese punto de inyección. Un rojo espurio en la puerta
enseña a ignorar los rojos.

Queda anotado como pendiente de la Fase Q: entender por qué se pierden esos
eventos, y si hace falta, dejar de depender de ellos.

### Dos regresiones visibles que el piloto no podía ver (2026-08-11)

Las encontró el fundador mirando el preview en el móvil. Las dos son de V4 y
las dos son mías; ninguna la podía cazar el piloto, y eso es lo instructivo.

**Los botones del hero salían por duplicado.** Al mover «Analiza gratis» dentro
de `HeroDomainField` —tenía que guardar el dominio escrito antes de navegar, y
eso sólo puede hacerlo la isla de cliente— no borré el bloque
`.lp-hero-actions` que se había quedado en `landing-page.tsx`. Dos pares de
botones idénticos, uno debajo del otro. El piloto no lo vio porque su
`ContentExpectation` comprueba que el contenido esté, no que esté **una sola
vez**; y ningún aserto mide cuántos `.lp-cta` hay.

**Los CTA del cajón móvil perdieron su color.** «Prueba gratis» quedó con el
texto gris sobre su fondo azul. La causa es más interesante que el síntoma:
esos dos controles pasaron de `<button onClick={router.push}>` a `<Link>`, y
`.lp-mobnav a` —escrita cuando dentro del cajón sólo había enlaces de
navegación— tiene especificidad `(0,1,1)` y le gana a `.lp-cta` `(0,1,0)`. Le
imponía color, tamaño y relleno.

**La corrección que importa no es el CSS, es el razonamiento.** El cuerpo del
PR afirmaba que los nueve botones convertidos serían «visualmente idénticos por
construcción, porque todas las clases declaran su propio `display`». Eso cubría
los estilos **propios** del elemento y pasaba por alto los que **sólo se
activan al cambiar de etiqueta**: una regla `.ancestro a` no existía para ese
botón hasta que el botón se volvió un enlace. Queda como invariante en
`.claude/rules/styles.md`, con el barrido concreto que había que haber hecho.

Se revisaron de paso los otros ocho enlaces convertidos: sólo el cajón móvil
tiene una regla de ese tipo (`.lp-nav-links a` y `.lp-footer .links a` alcanzan
únicamente a enlaces que ya lo eran, y `/pricing` no tiene ninguna).

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase V; regla de ruta
nueva `.claude/rules/styles.md`; invariante nuevo en
`.claude/rules/onboarding.md`; §40 (el tour del hero y sus invariantes); §42
(la Fase 0, que montó esta puerta); §43 (los duplicados de la Fase R, de los
que éste es el tercero).

---

## 55. El piloto aprende a contar y a leer un color (PRELAUNCH-HARDENING-1 Fase Q5b, 2026-08-11)

El fundador abrió el despliegue de la Fase V y encontró dos fallos a simple
vista, **después** de que el piloto hubiera corrido y de que yo reportara que
había pasado:

1. **El CTA del hero salía dos veces.** Al mover el campo de dominio a una isla
   de cliente (`components/landing/hero-domain-field.tsx`) se llevó consigo los
   botones, y el bloque `.lp-hero-actions` original se quedó donde estaba.
2. **El CTA del cajón móvil salía gris sobre azul.** `.lp-mobnav a` (0,1,1) le
   gana a `.lp-cta` (0,1,0) y le impone su color. Eso ya está escrito como
   invariante en `.claude/rules/styles.md` desde el mismo día.

Lo que importa no es que se colaran, sino **por qué el piloto no los vio**, que
son tres causas distintas y sólo una es «mirar mejor».

### Causa 1 — la captura existía y nadie la abrió

La foto de `/` con los dos botones estaba en el artefacto. Yo leí la tabla de
✅ del workflow y la di por veredicto. El CLAUDE.md ya dice que no lo es —el
arnés sólo sabe de fallos mecánicos y el juicio es del agente—, así que esto no
era un hueco de herramienta sino de proceso.

Arreglado como proceso, que es gratis: `.claude/agents/ux-pilot.md` gana una
sección («The workflow's green tick is NOT the verdict») que obliga a enumerar
las pantallas que toca el PR, abrir todas sus capturas en las tres anchuras y
**decir cuántas y cuáles** en el informe, en una línea nueva y obligatoria del
formato («Capturas abiertas»). Sin esa línea el veredicto es INCONCLUSIVE. La
pregunta 5 del Human Gate la pide también. Una afirmación que nadie puede
comprobar —«miré las capturas»— se sustituye por una lista de ficheros.

### Causa 2 — de 560 capturas, ninguna tenía el cajón abierto

Esta no se arregla mirando más fuerte: el cajón sólo existe por debajo de
900 px y sólo después de un clic, así que **no había nada que mirar**. Un hueco
de cobertura, no de atención.

`tests/pilot/journeys/landing.spec.ts` (nuevo) cubre `/` y `/pricing` —que
tampoco se visitaba— y, en la anchura móvil, abre el cajón, comprueba que sus
enlaces se ven, lo juzga abierto y lo cierra por su propia X. En tablet y
escritorio se **salta ruidosamente** en vez de pasar en silencio: un test que no
comprueba nada y reporta verde es exactamente lo que produjo este incidente.

### Causa 3 — el arnés no contaba nada ni leía ningún color

Los dos fallos son mecánicos: una máquina sabe contar y sabe calcular un
contraste. `tests/pilot/support/page-audit.ts` (nuevo) añade dos chequeos a
cada captura:

- **Controles duplicados.** Dos controles idénticos —misma etiqueta, mismo
  nombre accesible, mismas clases, mismo destino— dentro de un mismo *landmark*.
  Se agrupa por el `section`/`nav`/`header` más cercano, **no por padre común**:
  las dos copias del hero vivían en contenedores hermanos, así que una regla de
  «mismo padre» habría pasado por encima del único fallo para el que existe.
  Quedan exentas las repeticiones dentro de listas y tablas, o de **dos o más
  hermanos con la misma forma**: eso es una lista, no un duplicado (el umbral
  empezó en tres y estaba mal — ver «Lo que encontró la primera pasada real»
  más abajo).
- **Contraste.** Texto de un control por debajo de AA (4.5:1, o 3:1 en texto
  grande) contra su propio fondo. Se **salta lo que no puede juzgar con
  honestidad** en vez de adivinar: un control desactivado (ahí el poco contraste
  es el mensaje), un degradado o una imagen de fondo, y cualquier
  semitransparencia. Un chequeo que adivina acaba silenciado por lista blanca en
  una semana.

Las dos listas blancas (`DUPLICATE_ALLOW_LIST`, `CONTRAST_ALLOW_LIST`) **nacen
vacías** a propósito: una lista blanca que empieza poblada es una lista que
nadie auditó nunca. Y siguen vacías: los dos chequeos se corrieron contra la
landing y `/pricing` **reales** —`next build` + `next start` en local, tres
anchuras, con el cajón abierto en móvil— antes de subir nada, y no hay ni un
solo hallazgo que silenciar.

Esa misma pasada encontró un **falso positivo** y lo corrigió antes de que
existiera: el punto de paso del tour (`button.pt-dot.is-on`, 8 px, sin texto
ninguno, con `aria-label="Paso 1 de 8"`) reportaba 3,46:1 de tinta oscura sobre
azul. Una ratio de contraste para un carácter que no se dibuja. El contraste
mide **texto**, así que un control sin texto renderizado queda fuera: los
iconos son territorio de WCAG 1.4.11, otra medición que este chequeo no hace y
no va a fingir que hace.

Y se comprobó que los dos chequeos **disparan contra el DOM real**, no sólo
contra el fixture: reproduciendo las dos regresiones sobre la landing servida
en local —clonando el bloque de acciones del hero, e inyectando el color que
`.lp-mobnav a` imponía— saltan los dos, el duplicado con las dos copias
localizadas y el contraste con **1,07:1**. Ese número corrige de paso lo que yo
había escrito de memoria (~2,5:1): el gris #6b7280 y el azul #2563eb tienen
casi la misma luminancia, así que el fallo era bastante peor de lo que parecía
al describirlo.

El reparto es el mismo que ya usa `pilot-selfcheck-checks.mjs`: **medir** en el
navegador (`journey.ts`, que necesita estilos calculados), **juzgar** en
funciones puras con 18 tests unitarios en los dos sentidos. Y `auditControls`
se exporta suelta para poder correr los dos chequeos contra un estado
*abierto*, que es donde vivía el segundo fallo.

Y, porque una puerta que no puede fallar no es una puerta, el self-check gana
dos casos rotos más (`PILOT_FIXTURE_BREAK=duplicate` y `=contrast`, con los
colores reales del incidente: #6b7280 sobre #2563eb, que medido da 1,07:1 — casi la misma luminancia, no los ~2,5 que sugiere el aspecto). Son seis casos
ahora, dos de ellos con esta forma exacta.

### Lo que encontró la primera pasada real, que es el punto

Los chequeos corrieron contra el despliegue de verdad y devolvieron doce
fallos. Ninguno era de la Fase V: eran deuda que llevaba ahí meses, invisible
porque nadie la medía. Uno de los cuatro era **mío**.

**El falso positivo (mío, arreglado).** El detector contó como duplicado las
dos tarjetas `.cm2-emg` de Competidores, cada una con su botón «Seguir». Es una
lista legítima que daba la casualidad de tener dos elementos, y mi exención
pedía **tres** hermanos iguales. Dos es la lectura honesta: lo que separa una
lista de una duplicación no es cuántas copias hay, sino si sus **contenedores
coinciden**. El coste, dicho en voz alta: una duplicación que deje dos
contenedores *idénticos* ya no se ve. El fallo del hero no tiene esa forma
(`.lp-hero-form` junto a `.lp-hero-actions`: mismos botones, envoltorios
distintos), y la alternativa —saltar en cada lista de dos tarjetas del
producto— es la que consigue que el chequeo acabe en una lista blanca en una
semana. Verificado midiendo: con el umbral en dos, la lista de dos tarjetas
calla y la regresión del hero **sigue saltando**. Y el fixture sano lleva ahora
una lista de dos tarjetas iguales cuyo único trabajo es no aparecer nunca en
los hallazgos, para que la exención no se pueda romper en silencio.

**Los tres defectos reales (arreglados).** Los tres eran un token demasiado
claro, y los tres siguen el precedente que ya estaba escrito en el propio
`globals.css` desde el PR #312 (donde el piloto encontró lo mismo en
`.blog-post-meta`):

| Dónde | Antes | Ratio | Ahora | Ratio |
|---|---|---|---|---|
| `.legal-updated` (enlace «Blog» de las pilares) | `--ink-4` | 2,63:1 | `--ink-3` | 4,76:1 |
| `.seg button` (filtros de Recomendaciones) | `--ink-3` | **4,44:1** | `--ink-2` | 7,50:1 |
| `.notif-tab` (pestaña inactiva de Notificaciones) | `--brand-ink-4` | 2,58:1 | `--brand-ink-3` | 5,43:1 |

**Y el cuarto, en la segunda pasada: la misma familia otra vez.** Con esos tres
arreglados, el piloto bajó de 12 fallos a 3, y los 3 eran un único control:
`<a class="btn btn-primary">Prueba gratis</a>` al final de
`/blog/como-elegir-competidores-analisis-geo`, en **1,58:1** — índigo oscuro
(`--accent-ink`) sobre índigo (`--accent`). El botón no se leía.

La causa es *literalmente* la de la regresión del cajón móvil que abre esta
sección: `.blog-body a` tiene especificidad (0,1,1) y `.btn-primary` (0,1,0),
así que la regla del ancestro le impone a un botón el color de un enlace de
prosa. La regla se escribió cuando dentro de un artículo sólo había enlaces —
igual que `.lp-mobnav a`. Dos instancias distintas de un mismo patrón, en dos
zonas que no se parecen en nada, encontradas con una semana de diferencia: eso
es lo que convierte el invariante de `.claude/rules/styles.md` en algo que hay
que barrer, no en la anécdota de un PR.

Arreglado excluyendo los botones —`.blog-body a:not(.btn)` y
`.legal-body a:not(.btn)`— en vez de parchear cada variante. Es lo que la regla
siempre quiso decir (va de enlaces de prosa) y deja cubiertas las variantes que
todavía no existen. La misma trampa estaba armada en
`/comparativas/mejores-herramientas-geo-en-espanol`, que tiene otro
`.btn.btn-primary` dentro de un `.legal-body`; el arreglo estructural la
desactiva de paso.

El de los filtros deja una lección propia: `--ink-3` pasa AA sobre blanco (4,76:1)
y **no** pasa sobre `--surface-sunk` (4,44:1). Un token que aprueba sobre un
fondo no aprueba sobre otro, y a ojo esos 6 centésimos no existen. Es
exactamente el tipo de fallo que una persona no encuentra mirando una captura.
En los dos casos de pestañas la jerarquía la sigue marcando el estado activo,
que además del color cambia fondo (y sombra, en `.seg`).

### Y un tercer aprendizaje que no venía en el plan: el techo de tiempo

La pasada de `16a07ea` salió **`cancelled` a los 20,1 minutos**, con
`timeout-minutes: 20`. No fue una anomalía de esta rama: mirando las pasadas de
esos días, todas iban en **16-17 minutos**, o sea tres minutos de margen para
cualquiera. El recorrido crece en cada fase, y ese día ganó de golpe `/` y
`/pricing` con el cajón móvil, un tercer proyecto, y todas las pantallas que
dejaron de estar vacías al sembrarse los datos de la cuenta piloto.

Lo peligroso no es el minuto de más: **GitHub etiqueta un timeout como
`cancelled`**, que se lee como «alguien lo paró a mano» y no como «la puerta no
llegó a correr». Es la misma trampa que el ✅ del workflow, con otra palabra. El
techo sube a 30 y queda escrito en el propio workflow y en los límites
conocidos de `docs/agentic-user-pilot.md`: un piloto que no termina es
INCONCLUSIVE, nunca un pase.

> **El techo de 30 queda superseded por §65** (PR #389, 2026-08-12), que llegó
> a `main` en paralelo con el mismo diagnóstico desde otro PR y va más lejos:
> sube a **35** con margen medido (el barrido de #388 tardó 19m04s, o sea 56
> segundos de margen) y, sobre todo, **añade un paso `cancelled()`** que publica
> un INCONCLUSIVE cuando el job muere antes de juzgar. Eso es lo que faltaba
> aquí: yo subí el techo pero dejé que una pasada cortada siguiera pareciendo un
> aprobado si el comentario de PASS ya se había publicado. Al resolver el
> conflicto se tomó su versión entera. Lo que sí sobrevive de esta sección es lo
> de abajo, que §65 no cubre: el commit que sube el techo **no construía**, así
> que ninguno de los dos arreglos podía ejercitarse.

Y subir ese techo destapó **el mismo bucle del 2026-08-05, en el escalón de al
lado**: el commit que lo subía sólo tocaba `.github/` y `docs/`, así que
`vercel-should-build.sh` lo saltó —correctamente, según su lista— y no hubo
build, ni preview, ni pasada. El arreglo del timeout no se podía ejercitar. La
excepción de `tests/pilot/**` existía exactamente por este argumento («el
piloto sólo corre contra un preview»), pero el **workflow** del piloto se lo
tragaba el `.github/*` genérico. Ahora `.github/workflows/ux-pilot.yml`
construye, y sólo ése: los demás workflows corren por `push`/`pull_request` y
no necesitan un preview. La prueba que afirmaba lo contrario está invertida a
propósito, con el motivo escrito dentro, porque era una suposición que costó
una pasada.

**Lo que esto NO arregla, dicho en voz alta.** Se cierran dos agujeros, no la
clase. El motivo de abrir las capturas sigue siendo todo lo que nadie ha
pensado en afirmar todavía; por eso la causa 1 se arregla en el proceso y no se
declara resuelta por las causas 2 y 3.

**Trazabilidad.** §54 (la fase donde entraron los dos fallos); §49 (el
self-check y por qué sus casos rotos son el contrato);
`.claude/rules/styles.md` (la regla de `<button>` → `<a>`, escrita el mismo
día); `docs/agentic-user-pilot.md`.

---

## 54. Un interruptor por motor, para escanear barato con uno solo (ENGINE-DEBUG-TOGGLE-1, 2026-08-10)

**Estado: implementada.** Task Intake aprobado por el fundador el mismo día
("Dale al task intake").

**El problema.** Un escaneo real reparte cada prompt entre los motores que el
plan permite (hasta 3: Gemini, Claude, OpenAI) — comparar la visibilidad de
una marca entre motores es el valor central del producto, no un extra. Pero
para una prueba interna de 2-3 prompts eso significa 3 llamadas de LLM por
prompt cuando bastaría con una, exactamente la misma clase de gasto evitable
que ya resolvieron WEB-AUDIT-AUTO-SPLIT-1 (52) y SAMPLING-DEBUG-TOGGLE-1 (53)
para la auditoría y el muestreo. El fundador pidió el mismo control para los
motores: *"si quiero hacer pruebas económicas, puedo escanear dos o tres
prompts, por ejemplo, solo en Gemini"*.

### Decisiones y por qué

- **Tres booleanos, por defecto `true` — al revés que la 52 y la 53, y a
  propósito.** Migración 0033: `engine_gemini_enabled`,
  `engine_claude_enabled`, `engine_openai_enabled`, todos `default true`. Las
  dos fases anteriores defaultearon `false` porque el error caro era «gastar
  una campaña no deseada» en un prelanzamiento sin clientes de pago. Aquí el
  error caro es el contrario: comparar motores es la propuesta de valor real
  del producto, así que un proyecto nuevo o existente que perdiera motores en
  silencio sería una regresión, no un ahorro. `true` reproduce exactamente el
  comportamiento ya desplegado — esta migración no cambia nada hasta que el
  dueño de un proyecto apaga algo a mano.
- **Filtrar antes de topar por plan, nunca al revés.** `resolveScanProvidersForPlan`
  ahora acepta un segundo argumento opcional (el subconjunto habilitado) y
  filtra la lista configurada por él ANTES de aplicar `plan.caps.engines`.
  Si el orden fuera el inverso, un proyecto Free (tope 1) que sólo hubiera
  habilitado Claude y OpenAI vería el tope quedarse con Gemini —el primero de
  la lista sin filtrar— y el filtro lo vaciaría después a `[]`, dejando
  habilitados dos motores que nunca se usan. `providers.test.ts` fija este
  orden con un caso explícito.
- **Las dos lecturas (creación y ejecución) van en consulta propia, fallan
  ABIERTO, y por la misma razón que la 53.** `run-creation.ts` (dimensiona el
  run) y `executor.ts` (lo ejecuta) leen las tres columnas cada uno en su
  propia consulta, nunca fusionada en el select crítico que ya hacían — la
  migración sin aplicar no puede romper la creación ni la ejecución de
  ningún escaneo. `undefined` (columna ausente, lectura fallida, o
  simplemente no leída) llega a `resolveScanProvidersForPlan` como «sin
  anulación de proyecto», que es el comportamiento ya desplegado.
- **`executor.ts` relee al ejecutar, no hereda lo que se leyó al crear** —
  mismo invariante que la 52 estableció para las mitades de auditoría: un
  run puede ejecutarse en un batch posterior a su creación, y tiene que ver
  lo que diga el interruptor AHORA, no lo que decía cuando se creó.
- **Aquí sí existe una combinación que rompe el producto, y es la novedad
  frente a las dos fases anteriores: los tres motores apagados a la vez.**
  Un escaneo sin ningún motor no es más barato, es un escaneo vacío —
  `total_prompts` en 0, ningún `scan_prompt` job, exactamente la forma de
  escaneo falso que `.claude/rules/scan.md` («no mute rows») y CLAUDE.md
  («no fake scans») prohíben. Dos guardas, no una:
  - **`setEngineEnabled` es la guarda primaria**: lee los otros dos flags
    antes de escribir y rechaza apagar el último motor encendido con un
    error específico (`engine_toggle_requires_one_active`), nunca «vuelve a
    intentarlo» — apagar el mismo motor no cambiaría el resultado.
  - **`run-creation.ts`/`executor.ts` son la defensa en profundidad**: si el
    conjunto resuelto queda vacío de todos modos (dos pestañas apagando
    motores distintos a la vez, o una migración aplicada sin este guardián),
    ambos rechazan con `no_engines_enabled` en vez de crear o ejecutar un
    run vacío. En `executor.ts` el rechazo ocurre DENTRO del `try` que ya
    marca el run `failed` con un `error_summary` real — nunca antes, donde
    el `catch` no lo vería y el run quedaría en `pending`/`running` hasta que
    `reconcileStuckScanRuns` lo notara por timeout.
  - El propio switch de `/debug` se deshabilita visualmente cuando es el
    último encendido, para no ofrecer una acción que el servidor va a
    rechazar igualmente — pero el guardián real es el servidor, no el
    disabled del botón.
- **Tres switches, no un array/jsonb.** `LLMScanProvider` es una unión cerrada
  de exactamente tres motores conocidos — misma forma que los dos booleanos
  de la 52. Un boolean por motor mantiene cada lectura en un `=== true`/
  `!== false` plano, sin parsear JSON en el camino que además tiene que
  fallar abierto.

### Pendiente / roto conocido

- **La migración 0033 hay que aplicarla a mano** en Supabase, después de la
  0032. Hasta entonces `/debug` pinta «Sin migrar» y el backend mantiene los
  tres motores activados en todos los dominios (comportamiento actual, sin
  cambio).
- **Sin piloto agéntico todavía**: mismo estado que la 52 y la 53 — los tres
  interruptores viven en `/debug` y esta fase no se ha visto en un preview.

---

---

## 58. Una comparativa cuyo dato más importante es que el competidor dejó de publicarlo (SEO-POS-1, S2, 2026-08-10)

**Origen.** Segunda pieza de la cola de contenido de la Fase C
(`docs/seo-positioning-plan.md` §4) — "alternativas a Profound en español".

**Por qué se investigó antes de escribir.** Comparar con un competidor real
es un riesgo distinto —y mayor— que una autoafirmación de producto: un dato
de precio o de features equivocado sobre Profound es verificable por
cualquier lector en dos clics, y "verificable" es justo la palabra que hace
daño si sale mal. Se lanzó una investigación web dedicada antes de escribir
una sola cifra.

**El hallazgo real: el precio de Profound ya no es un hecho verificable.** Su
página pública de precios ha pasado a exigir una demo — no publican ningún
importe. Fuentes de terceros citan cifras muy distintas según su fecha (499
$/mes "Lite" en su lanzamiento de 2025; 99 $/mes "Starter" en reseñas de
2026), lo que apunta a que su estructura de precios ha cambiado más de una
vez y no a que una fuente esté simplemente equivocada. La decisión: **la fila
de precio no afirma ninguna cifra concreta de Profound**, con un test
(`lib/comparativas/genscore-vs-profound.test.ts`) que lo impone en vez de
confiar en que nadie la añada después. Su financiación, en cambio —155 M$
levantados, valoración de 1.000 M$ en la Serie C de febrero de 2026— está
bien documentada por prensa independiente (Fortune, GlobeNewswire, la propia
Profound) y se cita tal cual.

**Segundo cuidado: la ausencia de presencia en español no es lo mismo que
"no lo soporta".** Profound anunció un selector de idioma para 30+ idiomas
sin que la investigación pudiera confirmar si el castellano está entre ellos.
La página dice "sin evidencia de enfoque en el mercado hispanohablante" —
ningún cliente, caso de estudio ni presencia comercial en español encontrada
— nunca "no soporta español", que sería una afirmación más fuerte que la
evidencia disponible.

**Tercer cuidado: no repetir el error que PRICING-TRUTH-1 ya corrigió, esta
vez sobre el propio Genscore.** El plan Agencia de Genscore no tiene
workspaces, roles ni paneles white-label — se retiraron esas features
inventadas en PRICING-TRUTH-1 (`docs/launch-plan.md` Fase 2). La fila de
"varios clientes bajo una cuenta" no reclama un panel de agencia que no
existe: dice, con precisión, que una cuenta de Agencia sigue varios dominios
sin credenciales separadas por cliente, y añade explícitamente que tampoco
hay paneles white-label ni permisos por rol todavía.

**Mismo formato que las dos comparativas anteriores** (tabla + "cuándo elegir
cada una" + metodología con fecha de consulta), con al menos una fila real
donde gana Profound (motores nominales, a quién se dirige, reputación en G2,
financiación) — una comparativa que no cede nunca una columna deja de ser
creíble.

**Validación:** tests nuevos para `genscore-vs-profound.ts` (incluida la
comprobación explícita de que ninguna fila afirma un precio concreto).
Añadida a las tres SSOT que la hacen descubrible: índice de `/comparativas`,
`lib/seo/llms-txt.ts` y `app/sitemap.ts`.

---

## 59. Comparativas deja de ser una página legal disfrazada (COMPARATIVAS-DESIGN-1, 2026-08-11)

**Origen.** El fundador, revisando el preview de S2 (log §58), preguntó por
qué `/comparativas/genscore-vs-profound` se veía "más plana" que el resto del
sitio. Task Intake completo antes de tocar código (el fundador lo aprobó "en
loop") porque tocaba 4 pantallas a la vez — criterio explícito de
`CLAUDE.md` para exigir informe previo aunque la clasificación fuera P2.

**La causa real: dos sistemas de diseño conviviendo sin que nadie lo hubiera
decidido así.** El blog ganó un sistema de bloques de composición completo
en GROWTH-3 Fase 3.1 (3 de agosto): `KeyTakeaway`, `Figure`, `StatGrid`,
`NumberedSection`, `Checklist`, `CompareTable`+`Pill`, `Verdict`, `ArticleCta`.
Las comparativas (`genscore-vs-otterly`, GROWTH-2 Fase 2.4) se construyeron
**antes** de que ese sistema existiera, con la misma clase `legal-body` que
usan `/privacidad`, `/terminos` y `/cookies` — y cada comparativa nueva desde
entonces (`genscore-vs-peec-ai`, `mejores-herramientas-geo-en-espanol`, y la
propia `genscore-vs-profound` de S2) copió fielmente esa plantilla antigua,
arrastrando el hueco sin que nadie lo notara hasta ahora.

**El hallazgo que redujo el riesgo de la migración a casi cero:** `CompareTable`
y `Pill` ya existían, construidos explícitamente para "comparación multi-eje
con veredicto codificado en color" (`docs/brand/article-design-system.md`) —
pero solo se usaban dentro de tablas sueltas de artículos del blog, nunca en
la propia superficie de comparativas, que es literalmente su caso de uso. No
hubo que diseñar nada nuevo, solo cablear lo que ya estaba aprobado y
probado.

**Qué se migró en las 4 páginas** (`genscore-vs-otterly`, `genscore-vs-peec-ai`,
`genscore-vs-profound`, `mejores-herramientas-geo-en-espanol`):
- `legal-body` → `blog-body` (mismo wrapper que usa cualquier artículo).
- El resumen "en dos/una frase(s)" pasa de párrafo con `<strong>` a
  `<KeyTakeaway label="...">`, conservando la etiqueta original de cada
  página en vez de adoptar el "Respuesta rápida" por defecto del blog.
- La tabla pasa de `<div className="cmp-table-wrap">` a `<CompareTable>`, y
  la celda donde gana el competidor pasa de `<strong>texto</strong>` a
  `<Pill tone="si">Gana aquí</Pill> texto` — mismo patrón exacto que ya usa
  `llms-txt-guia-practica.mdx` para marcar palancas confirmadas.
- **`Verdict` se usó solo donde encaja de verdad**: la sección "Cuándo elegir
  [competidor]" — es, literalmente, el caso para el que `Verdict` se diseñó
  ("respuesta honesta cuando no es un sí"), porque es la página admitiendo
  que el competidor gana en ese escenario. "Cuándo elegir Genscore" se dejó
  como `<h2>`+`<p>` normal a propósito: es el argumento de venta, no una
  admisión honesta, y forzar `Verdict` ahí habría sido usar el componente
  fuera de su semántica solo por rellenar.
- **`ArticleCta` real al final de las 4 páginas.** Las 3 comparativas 1:1 no
  tenían ningún CTA — terminaban en seco tras "Metodología", sin invitar a
  nada. `mejores-herramientas-geo-en-espanol` sí tenía un CTA, pero
  implementado a mano (`<div className="blog-cta">` + `<Link>`) duplicando lo
  que `ArticleCta` ya hace — sustituido por el componente real.

**Ningún dato cambia.** Es presentación pura: mismas filas de `COMPARISON_ROWS`,
misma fila donde gana cada competidor, misma nota de metodología con fecha.
Fechas de sitemap de las 4 páginas actualizadas a hoy porque el cambio es
sustancial aunque el dato comparativo sea idéntico.

**Limpieza:** `.cmp-table-wrap` (la clase CSS paralela que solo usaban estas
4 páginas) queda huérfana tras la migración y se retira de `app/globals.css`
— la pista de scroll horizontal en móvil que llevaba ya la cubre
`.art-tablewrap` (la clase de `CompareTable`), verificado que no se pierde
ninguna de las dos.

**Validación:** 1908/1908 tests, `pnpm run validate` limpio. Verificado sobre
el HTML del build: las 4 páginas renderizan `art-takeaway`/`art-tablewrap`/
`art-cta`, cero rastro de `legal-body`, y cada `Pill` aparece exactamente una
vez por fila `*Wins: true` en el DOM visible (el recuento doblado en un grep
ingenuo es el payload de hidratación de React que Next.js embebe en el HTML,
no una repetición real).

---

## 60. La comparativa dejaba a Genscore por debajo incluso donde no perdía (COMPARATIVAS-DESIGN-1, revisión, 2026-08-11)

**Origen.** El fundador, revisando el preview del rediseño (log §59): *"en
ocasiones quizás dejan demasiado por debajo a Genscore"*, citando el bloque
"Cuándo elegir Profound". Tenía razón, y las dos causas eran mías.

**Causa 1 — asimetría tipográfica que introdujo el propio §59.** El rediseño
puso `Verdict` (bloque destacado, con etiqueta) en "Cuándo elegir
[competidor]" y dejó "Cuándo elegir Genscore" como `<h2>` + `<p>` plano. La
regla que escribí para justificarlo decía que `Verdict` era para admisiones
honestas y no para argumentos de venta — razonamiento defendible en
abstracto, y equivocado en la página: las dos secciones son el mismo tipo de
afirmación ("para quién es esto la herramienta correcta"), así que darle
tratamiento destacado solo a una hace que el caso del competidor pese más
visualmente en todas las comparativas, incluidas las filas donde Genscore
gana. **Ahora ambas van en `Verdict`, con etiqueta propia.** La honestidad la
sostienen la tabla (con su "Gana aquí" en las filas reales) y el texto, no la
tipografía desigual.

**Causa 2 — una fila marcada como victoria del competidor que no era una
victoria.** `genscore-vs-profound` marcaba "Financiación" con `profoundWins:
true` (155 M$ levantados, valoración de 1.000 M$). Levantar más dinero **no
es un beneficio para quien compra la herramienta**: no mejora ningún
resultado suyo, y corta en las dos direcciones — respaldo y continuidad, pero
también más expectativa de retorno que atender. Y presentaba "autofinanciado"
como si fuera el lado perdedor, cuando para un comprador es al menos
ambivalente (sin inversores detrás no hay presión externa para subir precios
ni pivotar). La fila **se mantiene** —la viabilidad del proveedor es contexto
legítimo antes de firmar con nadie— pero renombrada a "Respaldo y modelo de
negocio", sin marca de victoria y con los dos lados enunciados.

**Causa 3 — el propio texto del veredicto de Profound.** Terminaba con dos
frases seguidas de elogio ("mucho más madura en volumen de financiación y
clientes enterprise" + "4,5/5 en G2 … por la profundidad de su analítica"),
sin contrapeso y cerrando en su nota más fuerte. Reescrito: mantiene los dos
hechos reales que un comprador sí usa (analítica más profunda, 4,5/5 en G2) y
retira la referencia al volumen de financiación, que no le sirve para decidir
nada. Se añade la contrapartida que ya estaba en la tabla — pasar por una
demo de ventas antes de ver un precio.

**Lo que NO cambia, y es deliberado:** las tres filas donde Profound gana de
verdad siguen marcadas (motores cubiertos, a quién se dirige, reseñas
públicas), igual que las de Otterly y Peec AI —que se revisaron en esta misma
pasada y resultaron ser todas beneficios reales para el comprador: cobertura
multi-país, usuarios ilimitados, número de motores—. El test que exige al
menos una fila donde gane el competidor sigue en verde en las tres
comparativas. Esto es un reequilibrio, no una retirada de la honestidad: se
quita el elogio que no ayuda a decidir y la asimetría visual, no las
concesiones ciertas.

**Cuarta cosa, del mismo mensaje del fundador: `/comparativas` no estaba en la
navegación superior.** Desde SEO-POS-1 T-a estaba en los cinco pies de página
(log §46), lo que resolvió el enlazado interno pero no la descubribilidad:
quien lee un artículo sobre GEO es exactamente quien querría comparar
herramientas, y la investigación del plan sitúa las páginas de comparación
como el contenido con más intención de compra del portfolio. Añadido a
`NAV_LINKS` del shell de contenido (`blog-page-shell.tsx`), que es el que
envuelve blog, glosario y las propias comparativas. La nav del hero de la
landing se deja intacta: es una superficie de conversión con su propio diseño
aprobado, y no es donde está el lector de contenido.

---

## 61. La tabla comparativa solo reconocía las victorias del competidor (COMPARATIVAS-DESIGN-1, segunda revisión, 2026-08-11)

**Origen.** El fundador, tras el reequilibrio de §60: *"yo veo que en la
comparativa siguen saliendo mejor parados los competidores"*. Tenía razón otra
vez, y §60 no había tocado la causa principal.

**La causa real, que §60 pasó por alto.** La insignia "Gana aquí" solo se
pintaba en la columna del competidor. Las filas donde gana Genscore —precio de
entrada, idioma del producto, bucle de acción, coste de añadir motores— no
llevaban ninguna marca. Al escanear la tabla, **las únicas insignias visibles
estaban todas en la columna del competidor**, así que la página se leía como
si perdiéramos en todo aunque el reparto real de filas estuviera equilibrado o
a nuestro favor:

| Comparativa | Filas que gana Genscore | Filas que gana el competidor |
|---|---|---|
| Otterly | 3 | 3 |
| Peec AI | 4 | 2 |
| Profound | 4 | 3 |

Es decir: el dato ya era favorable o parejo, y la presentación decía lo
contrario. §60 arregló la asimetría de los bloques de texto pero dejó intacta
la de la tabla, que es la parte que la gente escanea primero.

**Arreglo.** Campo `genscoreWins` en las tres fuentes de datos, y la insignia
se pinta en las dos columnas. Ninguna victoria nueva es inventada: las cuatro
marcadas ya estaban descritas en el texto de su propia celda. Dos tests nuevos
por comparativa lo fijan — que haya victorias marcadas **en los dos lados**, y
que ninguna fila esté marcada para ambos a la vez.

**Del mismo mensaje del fundador, dos cosas más en el índice de `/blog`:**

1. **Comparativas pasa a ser una sección visible del índice, no solo un enlace
   de navegación.** §60 la añadió a `NAV_LINKS`, pero en móvil la nav se
   pliega tras el menú de hamburguesa — así que quedaba invisible justo en la
   anchura donde más se lee, y el fundador seguía sin verla ("no puede ser una
   sección más normal?"). Ahora es una sección propia, arriba, antes de los
   clusters: es el contenido con más intención de compra del portfolio y no
   debería exigir bajar por toda la lista de artículos.
2. **Retirado el "N artículos publicados" del final del índice.** Petición
   directa del fundador. Era una cifra que sólo puede jugar en contra: con
   pocos artículos subraya lo pequeño que es el catálogo, y con muchos no
   aporta nada a quien está eligiendo qué leer.

**Lección para futuras comparativas, ya escrita en la regla de ruta:** una
tabla que solo marca un lado no es más honesta, es sesgada en la dirección
contraria a la que uno pretendía. Si se destacan las concesiones, hay que
destacar también las ventajas — con el mismo criterio de que sean beneficios
reales para quien compra.

---

## 62. El piloto llevaba dos PRs aprobando una página que no había abierto nunca (COMPARATIVAS-DESIGN-1, cierre, 2026-08-11)

**Cómo apareció.** Leyendo la tabla del `PILOT PASS` de este mismo PR antes de
mergearlo. 52 pantallas en verde a tres anchuras, y entre las comparativas
estaban `otterly`, `peec-ai`, el índice y `mejores-herramientas` — pero no
`genscore-vs-profound`. Es decir: la fase entera nació de que el fundador se
quejó de cómo se veía esa página, el rediseño la tocó, y el piloto dio PASS sin
haberla abierto.

**Desde cuándo.** Desde que se publicó, en SEO-POS-1 S2 (§58). Su PR (#382)
también salió con el piloto en verde. Dos PRs consecutivos con una pantalla
nueva que nadie miró.

**Por qué las comparativas y no el blog.** Los posts del blog se pilotan con un
bucle sobre una lista, y `fixture-drift.test.ts` ya obligaba a que esa lista
siguiera a `BLOG_POSTS`. Las comparativas son cuatro `page.tsx` a mano y cuatro
`test(...)` a mano, sin bucle y sin guardián: publicar la página y olvidar el
journey no rompe absolutamente nada visible. Peor todavía, el fixture del
self-check tampoco la servía, así que el journey que faltaba habría dado 404 de
haberse escrito sin tocar el fixture.

**Lo que no se hizo, y por qué.** No se convirtió el spec en un bucle sobre la
SSOT. El spec de Playwright **no importa código de la app a propósito** (está
escrito en su cabecera): si el journey se deriva de la misma lista que el
producto, una ruta que desaparece de la SSOT deja de pilotarse *y* deja de
fallar, que es exactamente el fallo silencioso que se estaba arreglando.

**Lo que se hizo.** El journey y la entrada de fixture que faltaban, y dos
tests en `fixture-drift.test.ts` que comprueban por texto que cada ruta de
`COMPARATIVAS` (`lib/seo/llms-txt.ts`, la SSOT que ya alimenta `llms.txt`)
aparezca tanto en el spec como en el fixture. Se verificó que fallan en la
dirección correcta borrando la ruta del spec y viendo el test nombrarla.

**La lección, que es más general que las comparativas:** un `PILOT PASS` es una
lista de lo que el piloto vio, no una afirmación sobre lo que el PR cambió.
Contrastar las dos listas es trabajo del Director y no lo hace nadie más — el
piloto no sabe qué prometía el PR. Antes de dar por verificada una fase, mirar
si cada pantalla que toca el diff aparece en la tabla.

---

## 63. Una sola cabecera pública, no cinco copias (GENSCORE-HEADER-1, 2026-08-11)

**Estado: implementada.** Pedido por el fundador tras notar que la cabecera del
blog «está desactualizada» frente a la de la home; aprobado ampliando el
alcance en el mismo turno: «hacemos que la única cabecera sea esta,
unificando todos los enlaces».

**El problema real no era estético, era que no existía un componente
compartido.** La cabecera (logo + nav + CTAs + menú móvil) estaba copiada a
mano en cinco sitios — `landing-page.tsx`, `pricing-page.tsx`, `app/geo/page.tsx`,
`blog-page-shell.tsx`, `docs-page-shell.tsx` — cada uno con su propio array de
enlaces. La divergencia concreta que se leía como «desactualizado»: solo la
home pasaba `ctas` a `MarketingMobileNav`, así que el resto de superficies
mostraba el menú móvil **sin** los botones de Iniciar sesión/Prueba gratis; y
el destino de «Prueba gratis» variaba entre `/signup` y `/signup?plan=free`
según la superficie.

**Decisiones finales:**
- `components/marketing/public-header.tsx` es ahora la única fuente de los
  seis enlaces del nav público (Producto, Cómo funciona, Recomendaciones, Qué
  es GEO, Precios, Blog) y del CTA `/signup`, usada por las seis superficies.
  Un `activeHref` opcional marca el enlace activo; los tres primeros son
  anclas de la home (`#producto`/`#como`/`#recomendaciones` en `/`, resueltas
  a `/#producto` etc. fuera de ella mirando `usePathname()`) — nunca un
  ancla rota fuera de la home.
- **La unificación es de contenido y de comportamiento del menú móvil, no del
  fondo del hero.** `hero` (solo `true` en home) controla el burger de dos
  líneas + drawer desde la derecha + nav transparente (`.lp-nav--hero`); el
  resto conserva su `.lp-nav-wrap` (barra blanca pegajosa) y burger estándar.
  Ese fondo transparente-sobre-degradado es un rediseño de hero deliberadamente
  acotado a la home (BRAND-5b, ver comentario en `app/globals.css` junto a
  `.lp-nav--hero`: "/geo (.gx-hero) y /pricing (.price-hero) keep the original
  .lp-hero look untouched") — extenderlo habría contradicho esa decisión ya
  documentada sin que el fundador lo pidiera explícitamente; lo que sí pidió
  (mismos enlaces, mismos CTAs en el drawer) queda resuelto sin tocarlo.
- **`/docs` pierde su enlace "Docs" propio del nav principal** (no está en el
  set unificado de seis) — sigue alcanzable por `MARKETING_CONTENT_LINKS` en
  el pie de cada shell y por el propio sidebar de `/docs`.
- **Las páginas legales (`/privacidad`, `/cookies`, `/terminos`) pierden su
  nav propio de tres enlaces en la cabecera**, sustituido por el mismo
  `PublicHeader` que el resto. Como `/cookies` no tenía (y sigue sin tener)
  enlace en ningún pie de página de esas tres superficies, se añadió un
  `.legal-subnav` ligero (clase `.link-mini` ya existente, sin CSS nueva de
  peso) justo bajo el título, para no dejar `/cookies` sin ruta de vuelta
  desde dentro de las páginas legales mismas.
- CTA "Prueba gratis" unificado a `/signup` (destino de la home) en las
  superficies que antes usaban `/signup?plan=free` (`docs`, `legal`,
  `pricing`) — mismo criterio de "un solo enlace, no cinco copias".

**Pendiente / roto conocido:**
- El pie de página de `blog-page-shell.tsx`, `docs-page-shell.tsx` y
  `app/geo/page.tsx` sigue sin enlazar `/cookies` (solo Privacidad/Términos) —
  preexistente a esta fase, fuera de alcance porque es el pie, no la
  cabecera; sigue alcanzable desde los pies de home/pricing y desde el
  `.legal-subnav` nuevo de las propias páginas legales.

**Addendum tras el piloto agéntico (mismo día).** El comentario automático de
CI en el PR es un barrido de interacción, no el juicio visual que exige
`docs/agentic-user-pilot.md` — y su tabla de journeys no incluye `/pricing`
en absoluto (`public-pages.spec.ts` la excluye a propósito: página cliente sin
`metadata` propia, `docs/launch-plan.md` Fase 7b — dato ya desactualizado, ver
abajo). El `ux-pilot` real, invocado aparte para mirar las capturas, encontró
dos cosas reales al comparar las seis superficies entre sí, corregidas en el
mismo PR antes del Human Gate:
- **`/comparativas` y `/glosario` marcaban «Blog» como enlace activo** —
  heredado de que `BlogPageShell` fijaba `activeHref="/blog"` a fuego para
  las tres superficies que comparte. Ahora acepta `activeHref` (por defecto
  `/blog`) y las seis páginas de comparativas/glosario pasan el suyo propio
  — ninguno coincide con los seis enlaces unificados, así que no marcan nada
  activo, que es lo correcto.
- **CTA duplicado en móvil en toda superficie salvo home:** el par
  Iniciar sesión/Prueba gratis quedaba visible en la barra superior colapsada
  *y* otra vez dentro del drawer — antes de esta fase el drawer no llevaba
  CTAs, así que no había duplicado; al añadirlos (el objetivo mismo de esta
  fase) apareció. `.lp-nav-right { display: none }` en el media query móvil
  ya no está condicionado a `.lp-nav--hero`: aplica a las seis superficies
  por igual, moviendo la hamburguesa al extremo derecho en todas — igualando
  el propio patrón de home, no inventando uno nuevo.
- **`/pricing` verificado manualmente, no por el piloto:** `app/pricing/page.tsx`
  ya exporta `metadata` propia desde SEO-POS-1 (§46) — el comentario de
  `public-pages.spec.ts` que dice lo contrario quedó desactualizado y no se
  tocó aquí (ampliar el piloto es su propia fase). Sin acceso a la preview
  desde este entorno, se arrancó `next start` en local con credenciales de
  Supabase de relleno y se capturaron `/pricing`, `/blog`, `/comparativas` y
  `/glosario` a 375/768/1280px, incluido el drawer abierto: cero errores de
  consola, los seis enlaces presentes y consistentes, cero CTA duplicado.
  Dar a `/pricing` (y a `/`) su propio journey de piloto queda recomendado
  como fase aparte — es la única manera de que este hueco no dependa de que
  alguien se acuerde de mirarlo a mano la próxima vez.

**Segundo addendum (fundador, 2026-08-12): «el menú tiene que salir siempre
desde la derecha».** Hasta este punto solo la home abría el drawer desde la
derecha (`fromRight` atado a `hero`); el resto abría desde la izquierda con
el hamburger estándar de tres líneas — visible en la captura que el fundador
mandó de `/pricing`. `PublicHeader` ahora pasa `fromRight` siempre, no solo
en `hero`; el icono de dos líneas (`twoLine`) sigue atado solo a la home,
porque no fue lo que pidió. Verificado con capturas locales del drawer
abierto en `/`, `/pricing` y `/blog`: las tres deslizan desde la derecha con
el mismo `lp-mobnav-close` arriba a la derecha. `.lp-mobnav` (variante
izquierda) queda sin ningún caller real en la app — se conserva como
comportamiento por defecto de `MarketingMobileNav` para no borrar capacidad
del componente genérico que nadie pidió borrar.

**Tercer addendum — conflicto real al mergear con `main` (2026-08-12).**
Esta fase se numeró originalmente §58; mientras el PR estaba abierto,
COMPARATIVAS-DESIGN-1 mergeó primero y ocupó §58–§62 (ver arriba), así que
esta entrada se renumeró a §63 al traer `main`. No fue solo un choque de
numeración: `BlogPageShell` en `main` había añadido un `NAV_LINKS` local con
"Comparativas" como cuarto enlace de cabecera (§59, decisión del fundador
del mismo 2026-08-11 — "Comparativas" pasa del pie a la navegación superior
porque quien lee un artículo de GEO es justo quien querría comparar
herramientas). Ese array local quedaba muerto frente al `PublicHeader`
unificado de esta fase, así que la resolución correcta no era descartarlo:
**"Comparativas" se añadió a `PUBLIC_NAV_ITEMS`**, el séptimo enlace del nav
unificado en las siete superficies. El pantallazo original del fundador (§63
arriba) mostraba seis; el séptimo no lo contradice, cierra una decisión suya
posterior que esta rama todavía no conocía cuando se escribió el resto de la
fase.

---

## 64. Consola de operador: aviso de alta y `/admin` de sólo lectura (ADMIN-CONSOLE-1 Fase 1, 2026-08-11)

**Estado: implementada, Fase 1 de 3.** Task Intake propuesto como artefacto
HTML, aprobado por el fundador el mismo día («Perfecto. Implementa en loop»).
El diseño aprobado vive en `docs/design-reference/admin-console-1/`.

**Qué pidió.** Un email cada vez que se registra un usuario, y una pantalla
`/admin` «muy securizada que solo pueda acceder yo», con gestión de usuarios.
Pidió explícitamente que se le recomendara la mejor autenticación.

**El email reutiliza los dos puntos de alta reales, no inventa uno propio.**
`sendWelcomeEmail()` ya se llama desde exactamente dos sitios —
`app/signup/actions.ts` (alta con sesión inmediata) y
`app/auth/callback/route.ts` (confirmación por enlace u OAuth de Google) — y
`sendNewSignupOpsAlertEmail()` se engancha en los mismos dos, vía el helper
compartido `lib/admin/signup-alert.ts`. Cero migraciones, cero detección de
alta propia que mantener sincronizada con la real. Límite conocido y
aceptado: quien nunca confirma el email nunca genera aviso (ver
`docs/environment-contract.md`).

**La autenticación: allow-list por UUID + AAL2 obligatorio, sin columna
nueva.** `ADMIN_USER_IDS` (env var, no tabla) más una sesión `aal2` real
(TOTP de Supabase Auth) — detalle completo y porqué de cada capa en
`.claude/rules/admin.md`. Se descartó una columna `profiles.is_admin` por
exigir migración sin aprobación previa y por mezclar el privilegio con la
misma base de datos que protege; se descartó allow-list por email por atarse
a un dato que el usuario puede cambiar él mismo desde Ajustes.

**El bootstrap de MFA obligó a construir lo que no existía.** No había ni una
línea de MFA en el repo — sin una pantalla de enrolamiento, «AAL2
obligatorio» habría dejado `/admin` inalcanzable para siempre, incluido para
el propio fundador. `/mfa/enroll` y `/mfa/challenge` se diseñaron
deliberadamente **fuera** de `/admin` (si vivieran dentro, el propio gate de
`requireOperator()` los bloquearía antes de poder usarlos) y gated con
`requireOperatorCandidate()` — sesión + allow-list, sin exigir `aal2` todavía,
porque exigirlo sería pedir la llave para entrar a por la llave.

**El secreto TOTP no se puede volver a mostrar — el flujo de reintento lo
respeta.** Supabase sólo devuelve el QR/secreto una vez, en `enroll()`. Un
código erróneo NO regenera el factor (perdería el secreto que la app del
fundador ya escaneó); reutiliza el mismo factor `unverified` pendiente. Sólo
un «generar uno nuevo» explícito (`regenerateEnrollment`) descarta el
pendiente y fuerza uno limpio.

**Login y signup normales no se tocan.** La elevación a `aal2` no vive en
`app/login/actions.ts` ni en el callback — viven donde ya viven, sin
condicionales nuevos. `requireOperator()` es quien redirige a
`/mfa/enroll`/`/mfa/challenge` cuando hace falta, sólo al intentar entrar en
`/admin`. Así el cambio de superficie real sobre el flujo de 130+ cuentas es
cero: unos 130 usuarios normales nunca ven MFA ni pagan su coste de
verificación en cada login.

**`/admin/users` es sólo lectura, con datos reales, no estimados donde
importa.** `lib/admin/users.ts` cruza `profiles` (plan real, `trial_ends_at`,
`stripe_subscription_id`) con `auth.admin.listUsers()` (único sitio que puede
leer `last_sign_in_at`) y con `projects`/`scan_runs` agregados en memoria
(escala de beta privada, no miles de filas). El «MRR estimado» se llama
así porque lo es — precio de catálogo × cuentas con `stripe_subscription_id`
real, nunca lo que Stripe ha cobrado de verdad — y no hay botón que finja
abrir Stripe o Supabase sin un enlace real que construir.

**`next` en `/mfa/challenge` se valida (`lib/admin/safe-next.ts`).** Es un
parámetro de query atacable por un enlace manipulado, no sólo el que genera
`requireOperator()`; sin la validación, un enlace a
`/mfa/challenge?next=https://evil.example` redirigiría una sesión recién
elevada a `aal2` fuera del sitio.

**Lo que costó la primera puesta en marcha, y qué se cambió por ello.** Con
`ADMIN_USER_IDS` ya configurada en Vercel, `/admin` siguió devolviendo 404 a
través de dos «Redeploy». La causa no era el UUID ni la variable: el
`ignoreCommand` de `vercel.json` (`scripts/vercel-should-build.sh`, BUILD-BUDGET-1)
salta cualquier deployment cuyo diff contra el último exitoso esté vacío — que
es exactamente un redeploy del mismo commit —, así que Vercel lo marcó
«Ignored» y siguió sirviendo el build viejo, sin la variable. El script hace lo
que se le pidió (matar los commits vacíos de retrigger); lo que nadie había
documentado es que también mata el caso «redespliega para recoger una variable
nueva». Ahora está escrito en `docs/environment-contract.md`, y aplica a
**todas** las variables de servidor, no sólo a ésta.

Lo segundo que falló fue de esta fase, no del script: la propuesta prometía que
«cada intento fallido queda registrado» y la primera implementación **no
registraba nada**. Un 404 mudo hace indistinguibles «variable sin configurar»,
«UUID equivocado» y «alguien fisgoneando», y el único que puede arreglar los dos
primeros es justo el que se queda mirando el 404. `logDeniedOperatorAccess()`
distingue ahora los dos casos en los logs del servidor —y el de configuración
nombra la trampa del rebuild— sin cambiar ni un byte de la respuesta HTTP, que
sigue siendo un 404 pelado. Misma regla que ya corría en el pipeline de escaneo:
«un fallo que el operador puede arreglar tiene que llegarle al operador».

**Lo que encontró la QA, y por qué la validación de `next` cambió de forma.**
El gate de QA previo al Human Gate devolvió **BLOCKED** con un open-redirect
real y explotable en `safeAdminNext()`, en el peor sitio posible: el
`redirect()` que corre justo después de verificar un código TOTP de verdad. La
primera implementación comparaba prefijos —`startsWith("/")` y no
`startsWith("//")`—, que parece hermético y no lo es: para el parser WHATWG que
implementan todos los navegadores **una barra invertida es una barra**, así que
`/mfa/challenge?next=/\evil.example/steal` pasaba el filtro y mandaba la sesión
recién elevada a `aal2` a un host externo.

Al reescribirlo resolviendo contra un origen centinela, el test exhaustivo
—«ningún payload puede resolver fuera de origen», en vez de «la función
devolvió `/admin`»— cazó **un segundo bypass de la misma familia**:
`/..//evil.example` sí resuelve dentro del centinela (pasaba la comprobación),
pero su `pathname` normalizado es `//evil.example`, protocol-relative, que
vuelve a escapar al resolverse contra el origen real. De ahí que ahora se
valide también el valor reconstruido, no sólo el recibido.

La lección no es «faltaba un caso»: es que **reimplementar a mano las reglas
que aplica el navegador es una carrera que se pierde**, y que un test que
afirma «devolvió `/admin`» no prueba lo que importa —prueba la implementación,
no la propiedad—. El test que encontró el segundo fallo es el que resuelve el
resultado como lo haría un navegador y comprueba el host. Invariante añadido a
`.claude/rules/admin.md`.

Anotado también, sin implementar y sin Task Intake: las dos peticiones del
fundador del 2026-08-12 para Fase 2 —selección múltiple con borrado permanente,
y ver/modificar por usuario los automatismos de escaneo y auditoría con su
coste— en `docs/design-reference/admin-console-1/README.md`, cada una con los
motivos por los que no es implementable tal como se enunció (FKs `on delete
restrict`, interruptores que son por proyecto y no por usuario, y el
`skipped_plan_ineligible` del cron en Free).

### Pendiente / roto conocido

- **Fase 2 (escritura acotada) y Fase 3 (salud de la plataforma) sin empezar**
  — ver `docs/design-reference/admin-console-1/README.md` para el alcance
  propuesto de cada una.
- **Sin piloto agéntico todavía**: el piloto sólo entra con la cuenta piloto
  de cliente, nunca con la del operador — `/admin` queda fuera de su alcance
  por diseño (nadie más que el fundador debe poder disparar ese login). La
  verificación de esta fase es manual.
- **`auth.admin.listUsers` se lee en una sola página de hasta 1000 cuentas**
  (`AUTH_USERS_FETCH_CAP` en `lib/admin/users.ts`). A escala de beta privada
  cubre la cuenta entera; si se supera, `authUsersTruncated` lo hace visible
  en la propia pantalla en vez de fallar en silencio.
- **Perder el dispositivo TOTP deja fuera de `/admin` sin más salida que el
  panel de Supabase** (retirar el factor a mano) — coste aceptado y
  documentado en `docs/environment-contract.md`.

---
## 65. Una pasada del piloto que publicó PASS sin llegar a juzgar nada (2026-08-12)

**Qué pasó.** El piloto de PR #388 publicó un `PILOT PASS` completo —53
pantallas, tres anchuras, todo verde— y el run terminó en `cancelled`. Los dos
hechos son ciertos a la vez, y esa combinación es peor que un fallo limpio.

**La secuencia, del API de Actions:**

| Paso | Resultado |
|---|---|
| 9. Run the pilot | éxito, **19 min 04 s** |
| 10. Upload screenshots | éxito |
| 11. Publish evidence branch | éxito |
| 12. Post the verdict on the PR | **cancelado** |
| 13. Fail the check unless the pilot passed | **saltado** |

`timeout-minutes` era 20. El job arrancó a las 01:20:04 y murió a las 01:40:07:
veinte minutos exactos. El barrido cabía por **56 segundos**.

**Por qué importa más de lo que parece.** El paso 13 es el único que convierte
un FAIL o un INCONCLUSIVE en check rojo, y GitHub lo salta en un job cancelado
—sólo ejecuta lo que lleva `cancelled()` o `always()`—. Es decir: si el barrido
llega a cruzar el tope, el resultado no es "el piloto falló", es **"el piloto no
juzgó"**, y sobre la superficie de checks eso no se distingue de un verde a
menos que alguien abra el run paso a paso. Aquí el comentario de PASS incluso
llegó a publicarse un segundo antes de morir, así que el hilo del PR quedó
diciendo que todo estaba bien.

**El tope estaba condenado a cruzarse.** El barrido crece con cada pieza de
contenido: cada comparativa, cada artículo y cada término de glosario añade una
pantalla × tres anchuras. Un tope pegado al tiempo real de la última pasada no
es un margen, es una cuenta atrás.

**Arreglo, en dos partes:**

1. `timeout-minutes` de 20 a 35. No es "por si acaso": el margen medido era de
   56 segundos sobre una pasada que crece sola.
2. Un paso nuevo con `if: cancelled()` que publica su propio comentario
   diciendo que la pasada no llegó a juzgar y que un PASS anterior de esa misma
   pasada no cuenta. Es la única forma de que la cancelación se vea desde el
   hilo del PR sin abrir el run.

**La regla, que ya estaba escrita para otra parte del sistema:** una garantía
que no se puede ver fallar no es una garantía (`.claude/rules/scan.md`, sobre
`fetch` sin comprobar `response.ok`). Valía igual para el propio piloto y
nadie lo había aplicado ahí.

**Lo que este incidente NO fue.** El barrido de #388 sí se ejecutó entero y sí
vio la pantalla nueva; su PASS es real en cuanto al contenido. Lo que no hubo
fue puerta. Se distingue porque los pasos 9 a 11 constan en éxito — pero eso
hay que ir a mirarlo, que es justo el trabajo que este arreglo elimina.
## 66. "Alternativas a X" escrito por X+1 (SEO-POS-1, S3, 2026-08-12)

**El problema del formato.** Buscar "alternativas a Otterly" devuelve una
página tras otra publicada por una herramienta rival: ZipTie, Nightwatch,
ZeroRank, GetCito y media docena más, todas explicando por qué deberías
irte de Otterly y quedarte con ellas. La nuestra es exactamente lo mismo. El
formato no tiene una versión neutral disponible — lo que sí tiene es una
versión que lo admite.

**Decisión 1: decirlo en el primer bloque, antes que nada.** El `KeyTakeaway`
de apertura dice que esta página la escribe un competidor, igual que las otras
diez, y que la única defensa del lector es exigir que cada afirmación sea
comprobable. Es contraintuitivo como copy de venta y es lo correcto: sin eso,
la página pide una confianza que no se ha ganado, y con eso puede pedir algo
mejor —que la juzguen por sus datos—.

**Decisión 2: `tradeoff` es un campo obligatorio del tipo, no un párrafo
opcional.** Cada alternativa declara qué NO resuelve. El de Genscore nombra
Perplexity, Copilot y la ausencia de desglose por país, que es precisamente lo
que Otterly sí hace, y un test lo exige **por nombre** — no "que tenga
contrapartida", sino que mencione esas dos cosas. Un listicle de competidor no
se sesga mintiendo, se sesga olvidando; un test de longitud mínima no habría
cogido un `tradeoff` que dijera "es una herramienta joven".

**Decisión 3: una sección "cuándo NO deberías cambiar".** Cambiar de
herramienta reinicia el histórico —las series no se migran entre proveedores— y
la comparación temporal es justo lo que hace útil a una herramienta GEO. Es la
recomendación que nadie que venda esto escribe, y es verdad.

**Decisión 4: la página empieza reconociendo en qué es mejor Otterly**, con
cuatro puntos concretos (usuarios ilimitados a 29 $, 50+ mercados, Perplexity y
Copilot, la entrada de pago más barata). Mismo criterio que §61: las victorias
del competidor se marcan. Aquí además es útil — si tu problema es meter a doce
personas por 29 $, la respuesta correcta es quedarte, y la página lo dice.

**Estructura: por límite, no por ranking.** Quien busca "alternativas a X" ya
conoce X y ha chocado con algo concreto. Un ranking obliga a declarar un ganador
global que no existe y empuja a pagar el triple por resolver un problema que no
se tenía. Los cuatro límites (tope de prompts, motores como add-on, diagnóstico
sin ejecución, idioma) son la espina dorsal de la página, y dos tests garantizan
que cada límite tenga al menos una alternativa y que ninguna alternativa apunte
a un límite inexistente.

**Precios: ninguno de Otterly es de fuente primaria.** `otterly.ai/pricing`
está bloqueado por el proxy de egress, la misma limitación que ya tuvo Peec AI.
Se publican porque dos agregadores independientes coinciden y porque cuadran
con lo investigado el 2026-08-02 para la comparativa 1:1 — y la página dice
exactamente eso, en vez de presentarlos como verificados. Semrush y Ahrefs se
describen por estructura de coste (módulo + suite) sin cifra cerrada, porque
las fuentes públicas se contradicen entre sí.

**Descubribilidad:** cinco SSOT actualizadas en el mismo PR — índice de
`/comparativas`, `llms.txt`, `sitemap`, journey del piloto y fixture del
self-check. Las dos últimas ya no son opcionales: las exige el guardián que
dejó §62.

---

## 67. El árbitro y el director de marketing (SEO-POS-1, S3, revisión, 2026-08-12)

**Origen.** El fundador, sobre la primera versión de `alternativas-a-otterly`:
*"El tono concede mucho. En general tienes que tener un rol de director de
marketing de Genscore. Por tanto no nos podemos permitir que dejes a la
competencia mejor en las comparativas. Di cosas buenas pero que en general
transmita que casi siempre Genscore es la mejor opción."*

**Tenía razón, y el diagnóstico es de rol, no de frases sueltas.** §61 corrigió
un sesgo *contra* Genscore en la tabla de una comparativa y la lección se
generalizó mal: pasé de "no esconder las victorias del competidor" a arbitrar
la categoría. Una página escrita desde el arbitraje no es neutral, es
neutral-a-nuestra-costa — el competidor no publica la suya con ese criterio, así
que la asimetría la pagamos enteros nosotros.

**Las cuatro cosas concretas que concedían, y qué se hizo:**

1. **El bloque de apertura decía "esto lo escribe un competidor, no te fíes del
   todo".** Era cierto y era un regalo: invita a descontar todo lo que viene
   después, incluido lo verificable. Sustituido por un `KeyTakeaway` que
   posiciona: cuáles son los cuatro límites de Otterly y cuántos resuelve
   Genscore.
2. **Cuatro ventajas de Otterly enumeradas a pelo, arriba del todo.** Se leía
   como "Otterly gana" aunque tres de las cuatro le sean irrelevantes a un
   lector español con un dominio. Ahora `OTTERLY_STRENGTHS` es
   `{claim, context}`: la ventaja entera, y al lado a quién le sirve. "Usuarios
   ilimitados por 29 $" seguido de "con quince prompts incluidos" es la misma
   verdad, situada.
3. **Un `Verdict` titulado "Cuándo NO deberías cambiar"**, con el mismo peso
   visual que el nuestro. Publicidad del competidor pagada por nosotros. La
   cautela real —cambiar reinicia el histórico— se mantiene, en párrafo normal
   y girada hacia lo que de verdad implica: empieza ya donde te vas a quedar, y
   el plan gratuito no caduca justamente para poder acumular en paralelo.
4. **Las FAQ preguntaban "¿Es Otterly una mala herramienta?"**, que nos ponía a
   defenderlo, y "¿por qué fiarte de un competidor?", que nos ponía a
   desacreditarnos. Sustituidas por las búsquedas reales —"¿cuál es la mejor
   alternativa?", "¿la más barata?", "¿puedo probar sin dejar Otterly?"— que
   admiten respuesta verdadera y favorable.

**Lo que NO se tocó, y por qué se dijo en voz alta antes de empezar.** Que hoy
no ejecutamos Perplexity ni Copilot, y que no hay desglose por país, siguen
escritos, con test que los exige **por nombre**. No es escrúpulo: es que un
comprador los verifica en dos clics, y que ese es exactamente el error que
PRICING-TRUTH-1 obligó a retirar del producto (`docs/launch-plan.md` Fase 2).
Delante de un competidor se paga más caro que en la propia web. Lo que cambia
es que se declaran situados —junto a los tres motores que sí cubrimos en todos
los planes de pago— y no como titular.

**La regla, ya en `.claude/rules/growth-content.md`:** el hecho comprobable no
se recorta nunca; el orden, el espacio y el contexto son decisión de marketing
y se toman a nuestro favor. Las dos mitades son la misma política, no un
equilibrio entre dos.

**Pendiente.** Las otras tres comparativas (`genscore-vs-otterly`,
`genscore-vs-peec-ai`, `genscore-vs-profound`) se escribieron con el criterio
anterior. No se tocan en este PR —son cuatro pantallas y su propio slice— pero
quedan marcadas para una pasada con este mismo encuadre.

---

## 68. Una exclusividad nuestra caducó sin que nada avisara (SEO-POS-1, S4, 2026-08-12)

**Encargo.** Refrescar el pilar `/comparativas/mejores-herramientas-geo-en-espanol`
añadiendo los tres rivales del mercado español que listaba el plan: CreceRank,
TrendSights y Mentio. La investigación previa dejó dos, no tres.

**CreceRank entra, y es la incorporación que importa.** Es la única competencia
directa que reclama explícitamente nuestra misma casilla: *"diseñada desde el
día uno para el mercado hispanohablante"*, prompts en español, competidores
regionales y fuentes en dominios locales (.es, .mx, .ar, .cl, .co), desde unos
29 $/mes. Cubre ChatGPT, Perplexity y AI Overviews — un conjunto de motores
**distinto**, no menor: nosotros ejecutamos Gemini y Claude, que ella no lista,
y no ejecutamos Perplexity ni AI Overviews.

**Y su existencia rompió una afirmación nuestra ya publicada.** La FAQ de esa
página decía, sobre el idioma, *"**solo Genscore**, de forma nativa"*. Era
cierto cuando se escribió y dejó de serlo el día que CreceRank entró en la
lista. Nadie lo habría notado: la afirmación vivía en una cadena de texto de
`page.tsx` y la lista de herramientas vive en `mejores-herramientas-geo.ts`.

**Por qué esto es peor que un dato desactualizado cualquiera.** Una
exclusividad es la afirmación que más rápido caduca de una comparativa y la que
más caro sale: el lector la desmiente en un clic, y al hacerlo se lleva por
delante la credibilidad de toda la página, incluidas las partes correctas. En
una comparativa —donde el lector ya sabe que la escribe una parte interesada—
es exactamente el error que no te puedes permitir.

**Arreglo:** la respuesta ahora dice "dos de las ocho" y diferencia por lo que
sigue siendo cierto (motores cubiertos, generación de la solución, escaneo
gratuito permanente). Y un test ata la afirmación a los datos: si más de una
herramienta de `TOOLS` declara español, la página no puede contener "solo
Genscore". Un segundo test comprueba que el recuento del titular coincida con
el número real de herramientas.

**El test estuvo roto primero, y eso también es la lección.** La primera
versión filtraba con `/^s[íi]\b/i`. En ASCII, "í" no es carácter de palabra, así
que `\b` no casa tras ella: el filtro salía vacío, el test se saltaba solo y
pasó en verde con "solo Genscore" reinsertado a propósito para comprobarlo.
Corregido a `/^s[íi](\W|$)/i`, más una aserción que falla si el filtro se
vuelve a quedar vacío. **Un guardián que no puede fallar es peor que ninguno**,
porque además da por cubierto el hueco — la misma regla que §64 aplicó al
piloto, encontrada aquí sólo porque se verificó el caso negativo.

**Mentio entra sin cifra de precio.** Las fuentes públicas dan importes
inverosímiles (24 €/año) y además confunden el producto con GetMentioned, que
es otra herramienta. Mismo criterio que Profound en §58: sin fuente fiable, no
se afirma un precio.

**TrendSights NO entra, aunque el plan la pedía.** No es una herramienta GEO:
es monitorización de medios —TV, radio, prensa, redes, podcasts, streaming— con
análisis de sentimiento e influencers. Mide notoriedad en medios, no
visibilidad en motores generativos. Incluirla habría sido un error de categoría
que además diluye la página justo para el lector que llega buscando eso. **Una
fila del plan no es una orden de publicar**: el plan se escribió con la
información de entonces, y comprobarla antes de ejecutar es parte del encargo.
## 69. Las seis dimensiones sí, los pesos no: dónde está la línea (SEO-POS-1, S5, 2026-08-13)

**Pieza.** `/blog/que-es-una-auditoria-geo`, cluster `playbooks`. Cubre el
cluster de keywords nº 5 del plan y enlaza la feature real de auditoría web.

**Primera versión, y por qué se corrigió.** El borrador inicial publicaba **los
pesos reales** de `lib/web-audit/page-checks.ts` — datos estructurados 15,
formato de respuesta 15, metadatos 15, frescura 15, indexabilidad 20,
citabilidad 20 — con el argumento de que una puntuación cuyo reparto no se
enseña es un número que hay que creerse. El fundador lo revisó y decidió lo
contrario: publicar las seis dimensiones y sus umbrales de comportamiento, pero
no el reparto de puntos exacto entre ellas — es metodología del producto, y
enseñarla entera se la regala a cualquier competidor en una tarde sin que el
lector gane nada que no tuviera ya con las seis dimensiones nombradas.

**Dónde queda la línea, en la práctica.** Se publican los **umbrales de
comportamiento** — título 15-70 caracteres, descripción 50-160, frescura
180/540 días, 300 palabras visibles, un solo `<h1>`, dos `<h2>` mínimo — porque
son buenas prácticas verificables por cualquiera con el código fuente delante,
no una ventaja competitiva. No se publica el **reparto de puntos** entre
dimensiones ni entre sub-comprobaciones, ni en el texto ni en la portada: la
primera versión de la imagen codificaba el peso real en la anchura de cada
barra, así que se rehízo con las seis barras iguales antes de publicar.

**Lo que separa esta pieza de un post de checklist cualquiera:** la sección
sobre la página sin fecha. Puntuar la frescura como cero cuando no se encuentra
ninguna fecha convierte una *ausencia de dato* en un *veredicto negativo*, así
que esa dimensión se excluye del cálculo y el resto se reescala a 100 — sin
citar el número de puntos que se excluyen. Es una decisión de método real del
producto, no una opinión, y explicarla demuestra criterio en vez de afirmarlo.
Se generaliza en el artículo a la regla que ya rige `global-score.ts`: un
componente sin valor se excluye de la media y se dice, nunca se sustituye por
cero.

**Declara dónde acaba, y eso es lo que la hace citable.** Una auditoría técnica
dice si tu página *puede* ser citada, no si *lo es*. Sin esa frase el artículo
vendería la auditoría como si fuera la medición entera — exactamente el reclamo
que PRICING-TRUTH-1 obligó a retirar del producto. Con ella, el CTA es honesto:
arregla lo técnico primero porque es lo barato y lo determinista, pero no
confundas haberlo arreglado con estar apareciendo.

**Encuadre de marketing aplicado (§67):** la comparación SEO vs GEO va en tabla
y la ventaja no se reparte — la tabla existe para mostrar que son disciplinas
distintas, no para conceder terreno. El único bloque que "concede" es el de
dónde acaba la auditoría, y concede sobre nuestro propio producto, no a favor
de un competidor.

**Portada.** SVG dibujado en el repo y rasterizado a WebP (§47: un `og:image`
en SVG deja la tarjeta social en blanco). Seis barras de igual anchura, cada
una con su propia marca de comprobación — deliberadamente sin variar tamaños
entre ellas, por el mismo motivo que el texto no reparte puntos.

**Descubribilidad:** SSOT del blog, fixture del self-check y journey del
piloto, los tres en este PR — lo exige el guardián de §62.

---

## 70. Una prop mal puesta en MDX no rompe nada: simplemente no pinta (SEO-POS-1, S5, 2026-08-13)

**Qué pasó.** El piloto de #395 dio `PILOT FAIL` en las tres anchuras sobre
`blog-que-es-una-auditoria-geo`. La pantalla cargaba bien —sale ✅ en la tabla—
pero fallaba la aserción de enlazado interno: `.blog-related a` no existía.

**La causa.** `RelatedPosts` recibe `cluster` y `currentSlug`. El artículo le
pasaba `slug`. Con `cluster` indefinido, `getPostsByCluster(undefined)` devuelve
lista vacía y el componente hace `return null`: sin bloque "Sigue leyendo", sin
enlaces internos, **y sin un solo error**.

**Por qué no lo cogió nada antes del piloto.** MDX no pasa por `tsc`, así que
una prop equivocada no rompe la build. Y `article-recipes.test.ts` cuenta
apariciones de componentes, no comprueba sus props — `<RelatedPosts />` contaba
como presente estuviera bien llamado o no. Es la misma forma que §62 (journey
que falta) y §66 (afirmación que caduca): un fallo de cableado que ninguna
comprobación miraba, y que sólo se ve en el despliegue real.

**El arreglo, y por qué no basta con comprobar que la llamada exista.** El
piloto exige que **haya** un enlace en `.blog-related`. Un artículo de
`playbooks` que pasara `cluster="medicion"` renderizaría enlaces al cluster
equivocado y pasaría el piloto igual — el enlazado interno estaría mal y
nadie se enteraría, porque la regla de `content-strategy.md` §4.3 es enlazar a
**hermanos del propio cluster**, no a cualquier sitio. Así que el test nuevo no
comprueba que la llamada esté: comprueba que **el cluster que declara coincida
con el del artículo en `BLOG_POSTS`**. Verificado en las dos direcciones
—prop ausente y cluster equivocado— antes de darlo por bueno.

**Lección general, ya vista tres veces esta semana:** en las superficies de
contenido, el compilador no cubre casi nada. Lo que no esté atado a la SSOT con
un test se desincroniza en silencio, y el síntoma no es un error sino una
ausencia — un bloque que no aparece, una página que nadie visita, una
afirmación que dejó de ser cierta.

## 71. Los automatismos y su coste, vistos por cuenta sin mentir sobre ninguno de los dos (ADMIN-CONSOLE-2a, 2026-08-12)

**Estado: implementada.** Task Intake de 12 puntos aprobado por el fundador
(«Sí»). Primera mitad de lo que pidió el 12-08: *ver* por usuario si tiene
escaneo y auditoría automáticos y cuánto cuesta. La otra mitad —*modificarlos*—
y el borrado permanente quedan fuera a propósito, cada uno con su fase.

**El problema de fondo: lo que pidió no existe con esa forma.** Los
interruptores (`recurring_scans_enabled` 0008, `auto_web_audit_enabled` 0030)
cuelgan de `projects`, no de la cuenta. Una casilla por usuario sería falsa en
cuanto dos de sus dominios discreparan, que es el caso normal en cuanto alguien
tiene más de uno. Así que la tabla muestra un **agregado declarado**
(`activos/total`) y el interruptor real se lee por proyecto en la ficha. No es
una traducción cosmética de la petición: es la única forma de que la columna
sea cierta.

**Tres cosas que la pantalla dice y que un agregado ingenuo se habría comido:**

1. **«Sin efecto (Free)».** `runRecurringScanSweep` descarta los proyectos de
   plan Free antes de escanearlos (`skipped_plan_ineligible`), así que un Free
   con el interruptor puesto **no se escanea nunca**. Contarlo como activo
   habría hecho creer que hay trabajo —y coste— donde no hay ninguno; se cuenta
   aparte y su coste mensual es 0.
2. **«Sin dato» en vez de cero.** Las migraciones de este repo se aplican a
   mano, y una columna que PostgREST no conoce hace fallar el `select`
   **entero**. Por eso los automatismos viven en `lib/admin/automation.ts` con
   su **propia consulta**: una migración pendiente deja una columna sin dato en
   vez de dejar `/admin` en blanco. Mismo remedio que ya usa `/debug` con las
   mitades de auditoría, y misma dirección de fallo que exige
   `.claude/rules/scan.md` — sólo que aquí falla hacia *desconocido*, nunca
   hacia un valor: en una pantalla de sólo lectura, un «desactivado» inventado
   es peor que un hueco, porque parece una respuesta.
3. **La procedencia viaja pegada a la cifra.** `lib/admin/cost-model.ts` copia
   las tarifas de `docs/llm-cost-analysis-2026-08.md` §7 **con su etiqueta**:
   la generación está medida, la extracción es una estimación de tarifas
   públicas, y la cobertura de auditoría no está medida en absoluto. El coste
   agregado no puede presentarse como más fiable que su parte más floja, así
   que incluir la auditoría lo degrada a «sin medir» — y hay un test que lo
   impone. Un número redondo sin etiqueta habría sido exactamente la métrica
   falsa que CLAUDE.md prohíbe, en la pantalla cuyo público se fía de todos los
   demás números que hay en ella.

**Cero escrituras, y es una decisión, no una limitación.** No hay ni un
formulario en esta fase. Ver el estado repartido entre proyectos es lo que
permite decidir qué cambiar; y separar el ver del tocar deja la parte sin riesgo
entregada mientras la arriesgada espera su propio Task Intake.

**Lo que encontró la QA, y por qué importa más que el arreglo.** El gate previo
al Human Gate devolvió **BLOCKED** con un fallo que contradecía exactamente lo
que esta fase decía defender: el código leía `auto_web_audit_enabled`, la
columna que la migración 0031 **retiró** con un comentario explícito («*do not
reintroduce reads of it*»). Sigue en la tabla porque borrarla es un cambio
destructivo con su propia aprobación, y sigue con el default `true` de la 0030,
pero ya no la escribe nadie. Resultado: la pantalla habría afirmado «auditoría
automática activada, con coste» en **casi todas las cuentas**, cuando la
realidad —tras el barrido manual del fundador del 2026-08-09— es que está
apagada en casi todas. Una métrica inventada, en la fase cuyo argumento entero
era no inventar ninguna.

Lo relevante no es el despiste, es qué tipo de error es: **una columna que
existe no es una columna que signifique algo**. El esquema no distingue viva de
retirada, y el `select` no falla — devuelve un `true` perfectamente plausible.
Sólo lo dice el comentario de la migración que la jubiló. De ahí el invariante
nuevo en `.claude/rules/admin.md` (leer la migración que tocó por última vez la
columna, y copiar la dirección de fallo del código vivo) y la guarda estática en
`automation.test.ts`, que lee el propio fuente y rompe si la columna retirada
vuelve al `select`. Los tests anteriores no lo cazaron porque sus *fixtures*
copiaban la misma columna equivocada: reproducían el error en vez de medirlo.

La segunda mitad del hallazgo fue más simple y del mismo signo: el coste salía
**desnudo** en la celda de la tabla y en el KPI, sin su etiqueta de procedencia,
contradiciendo la regla que esta misma fase acababa de escribir. La causa no era
la plantilla sino el modelo: `AccountAutomation` no tenía campo `provenance`, así
que no había de dónde sacar la etiqueta. Ahora lo tiene, y se degrada al peor
sumando de la cuenta.

Corregido también, por señalarlo la QA: la ficha de un usuario cargaba los
automatismos de **todos** los proyectos de la plataforma para enseñar los de uno;
ahora la consulta va acotada por dueño.

### Pendiente / roto conocido

- **2b (escribir los interruptores) sin empezar.** Hoy sólo los escribe el
  dueño (`setRecurringScans` usa `requireUser()` + `.eq("owner_user_id", …)`);
  desde `/admin` sería service-role saltándose ese scoping. Escalada real, con
  su Task Intake.
- **2c (borrado permanente con selección múltiple) sin empezar**, y sigue en la
  lista de prohibidos de CLAUDE.md. Motivos y restricciones en
  `docs/design-reference/admin-console-1/README.md`.
- **El coste de la auditoría de cobertura sigue sin medirse** (§7 lo marca «no
  medido», peor caso ~8 prompts). Mientras siga así, cualquier total que la
  incluya arrastra esa etiqueta.
- **Sin piloto agéntico**, igual que la Fase 1 y por la misma razón: el piloto
  no puede completar un desafío AAL2. Verificación manual.

---

## 72. El arranque de MFA buscaba el factor pendiente donde no puede estar (ADMIN-CONSOLE-1, corrección, 2026-08-13)

**Estado: corregido.** Encontrado por el fundador en producción, intentando
activar el doble factor por primera vez: `/mfa/enroll` respondía *«No se pudo
generar el código»* y no había forma de avanzar.

**El fallo.** `supabase.auth.mfa.listFactors()` devuelve
`{ all, totp, phone, webauthn }`, y `auth-js` **sólo copia a `totp` los
factores verificados** (`GoTrueClient._listFactors`:
`if (factor.status === 'verified') data[factor.factor_type].push(factor)`). Un
enrolamiento a medias existe únicamente en `all`.

La primera versión buscaba el factor pendiente en `.totp`, donde **no puede
estar nunca**. Consecuencias encadenadas:

1. No lo encontraba jamás, así que llamaba a `enroll()` en cada visita.
2. En cuanto quedaba un factor sin verificar, el servidor respondía
   `A factor with the friendly name "" for this user already exists`.
3. La salida de emergencia («generar uno nuevo») tampoco se pintaba, porque
   se renderizaba sólo si se había encontrado ese pendiente.

Resultado: **`/admin` inalcanzable de forma permanente** para cualquiera que
empezara un enrolamiento y no lo terminara — que es exactamente lo que pasa la
primera vez que alguien abre la pantalla y no completa el código a la primera.
La regla de ruta ya decía «un código erróneo debe volver a desafiar el MISMO
factor pendiente»; el código nunca lo hizo.

**Lo que más duele: el compilador lo había avisado.** Comparar
`status === "unverified"` sobre `data.totp` produce
*«types '"verified"' and '"unverified"' have no overlap»* — TypeScript decía
literalmente que ese `find` no podía encontrar nada, porque el tipo de `totp`
ya declara que sólo hay verificados. Se silenció con un cast a
`Array<{ id: string; status: string }>` para que compilara. **Un error de tipos
que se calla con una aserción es una hipótesis descartada sin mirarla.**

**El arreglo,** en `lib/admin/mfa-factors.ts` como función pura y con tests:
lee de `all` filtrando por `factor_type`, y trata cualquier estado que no sea
`verified` como pendiente (reutilizar siempre es más seguro que crear otro,
porque crear otro es lo que bloquea la cuenta). Los tests construyen la
respuesta con la MISMA regla que aplica `auth-js` — un fixture que metiera un
factor sin verificar en `totp` estaría inventando una respuesta imposible, y es
esa fantasía la que dejó pasar el bug. `requireOperator()` sigue leyendo
`.totp` a propósito, con su comentario: allí la pregunta es «¿hay uno
verificado?», que es justo lo que `totp` contiene.

**De paso,** el mensaje de error decía «recarga la página» en un caso donde
recargar no arreglaba nada. Ahora nombra lo accionable (retirar el factor
pendiente desde Supabase, o revisar que el TOTP esté habilitado) sin exponer el
mensaje crudo del proveedor.

### Lo que este incidente dice del proceso

Ni la QA ni el piloto lo habrían cazado: la QA revisó dos veces esta zona y no
lo vio porque el código *parecía* manejar el caso pendiente, y el piloto no
puede entrar en `/admin` por diseño. Sólo aparece con una cuenta real que
empieza a enrolar y no termina. Es el argumento más fuerte hasta ahora para que
la verificación manual del fundador sobre `/admin` incluya **el primer
enrolamiento desde cero**, no sólo el camino feliz de una cuenta ya configurada
— que es lo que se verificó en §64 (con otra cuenta, ya enrolada).

---

## 70. El contrato de entorno deja de ser sólo prosa (PRELAUNCH-HARDENING-1 Fase R4, 2026-08-13)

Primer slice del refactor desde R1/R2 (§43). `docs/environment-contract.md`
describe cada variable desde hace meses y es una **buena** especificación; lo
que no tenía es forma de fallar. Una variable ausente, mal escrita, o puesta a
medias no rompe nada visible: se degrada en silencio y reaparece semanas
después como «el escaneo recurrente hace menos de lo que debería».

### El fallo que justifica la fase entera

Buscando qué validar, apareció esto en `lib/scan/cron.ts`:

```
Number(process.env.MAX_SWEEP_CHAIN_INVOCATIONS ?? 20)
```

Con un valor no numérico eso da `NaN`. Cien líneas más abajo, la condición que
decide si el barrido recurrente encadena es
`chainIndex + 1 < maxChainInvocations`, y **toda comparación contra `NaN` es
`false`**. O sea: una errata en esa variable deja el barrido en **un solo
disparo en vez de veinte**, sin lanzar, sin loguear, y con toda la pinta de
estar funcionando. Lo mismo en `MAX_PROJECTS_PER_CRON_RUN` (`slice(0, NaN)` no
devuelve ningún proyecto) y en `MAX_PROJECTS_PER_DIGEST_RUN`.

Y la variable **no estaba en el contrato**, pese a multiplicar el gasto de LLM
por disparo (`MAX_SWEEP_CHAIN_INVOCATIONS × MAX_PROJECTS_PER_CRON_RUN`). Nadie
la echaba de menos porque nada la echaba de menos. `VERCEL_ENV` tampoco estaba.

### Lo que se ha hecho

- **`lib/env-schema.ts`** — las 34 variables que el producto lee, en zod. Es
  **puro**: no lee `process.env`, no tiene efectos y no importa `server-only`,
  para que lo puedan usar el accesor, un script de node suelto y los tests.
- **`lib/env.ts`** — el accesor de servidor, con `import "server-only"` en la
  primera línea. En Next, un `process.env.X` que no empiece por `NEXT_PUBLIC_`
  no se inyecta en el bundle de cliente: se queda en `undefined`. No filtra
  nada, pero **degrada en silencio**, que es el fallo que esta fase persigue.
  Con `server-only` ese import rompe el build con un mensaje que lo explica.
  Es perezoso a propósito: un `throw` al importar reventaría `next build`
  entero por una variable que sólo necesita una ruta de cron.
- **Las reglas condicionales**, que son el corazón. Casi nada aquí es
  obligatorio a secas y casi todo lo es *en función de otra cosa*:
  `OPENAI_MODEL` sólo si hay `OPENAI_API_KEY` (y sin default, a propósito),
  `CRON_SECRET` sólo con el cron encendido, la clave de cada motor declarado en
  `LLM_SCAN_PROVIDERS`, y Stripe entero o nada — a medias se puede abrir un
  checkout que ningún webhook confirma. Ese «en función de» no estaba escrito
  en ningún sitio ejecutable.
- **`pnpm run check:env`** — el informe. Es la mitad visible: lo que arregla
  algo no es el esquema, es que alguien pueda ver **antes de desplegar** que su
  `OPENAI_API_KEY` está puesta y su `OPENAI_MODEL` no. Nunca imprime un valor:
  puede correr en un log de CI.
- **`tests/env-drift.test.ts`** — el guardián. El esquema sólo vale como fuente
  de verdad si contiene TODAS las variables que se leen; una nueva sin declarar
  no la valida nadie, y encima ahora existe un módulo que aparenta cubrirlas
  todas. Es el mismo patrón que `fixture-drift.test.ts`.

### Dos cosas que aprendió el propio guardián, nada más nacer

1. **Cazó un `process.env.X` en un comentario mío.** Grepea texto a propósito
   —lo que importa es qué está escrito, no qué se ejecuta—, así que un nombre
   de variable inventado dentro de un comentario es indistinguible de uno real.
   Se reescribió el comentario, no el test.
2. **Su comprobación de huérfanas estaba mal planteada, y falló a la primera.**
   Adoptar el accesor **elimina** la lectura cruda de ese sitio, que es
   exactamente el objetivo de la fase — así que migrar una variable la
   convertía en «huérfana» y el test castigaba la migración que existe para
   acompañar. Ahora cuenta las dos vías, cruda y accesor.
3. **Estaba ciego a los ficheros sin trackear, que es justo cuando hace
   falta.** `git grep` sólo mira lo ya trackeado, así que un fichero NUEVO con
   una variable nueva era invisible para él hasta después de commitearlo. Lo
   pagó el primer push: el test pasó en local —`lib/env.ts` aún sin trackear,
   con otro nombre inventado en un comentario— y CI lo cazó al instante.
   Añadido `--untracked`, y verificado creando un fichero nuevo sin commitear
   con una variable sin declarar: ahora sí lo tumba.

La regla que sale de 1 y 3, y que hubo que aprender dos veces el mismo día:
**al documentar, se cita una variable que exista de verdad, nunca un `FOO` de
ejemplo.** Para un guardián que mira texto, un nombre inventado en un
comentario es indistinguible de uno real — y ésa es la propiedad que lo hace
útil, no un defecto que convenga quitarle.

### Alcance, dicho en voz alta

**Son 34 variables, no 55.** El diagnóstico del plan (riesgo 7) dijo 55 y esa
cifra sale de contar el contrato entero, que incluye las siete `PILOT_*` del
arnés, las cinco de Sentry y alguna que ya nadie lee. Las que **el producto**
lee en `app/`, `lib/`, `components/` y `middleware.ts` son 34, en 156 sitios.
Las del piloto quedan fuera a propósito: no son configuración de producto y su
sitio es `docs/agentic-user-pilot.md`.

**No se han migrado los 156 sitios de lectura.** Se han migrado tres: los del
`NaN`, que son donde había un fallo real. El resto sigue leyendo `process.env`
directamente y eso es correcto de momento — lo que impide que el módulo se
quede en decorado no es la adopción masiva sino el test de deriva, que es
barato y ya está puesto. Migrar el resto es trabajo de otro slice, y no urge.

**La única desviación de «comportamiento idéntico»** es el `NaN` → valor por
defecto. Va declarada en el código y tiene su test. Se cae al defecto en vez de
lanzar porque, en una ruta de cron, lanzar mata el barrido entero por una
errata; caer al defecto lo deja corriendo como estaba diseñado, y que no sea
silencioso es trabajo de `check:env`. Donde el contrato documenta una semántica
permisiva —`CRON_SCANS_ENABLED` es `"true"` o no-op— el esquema la respeta en
vez de «arreglarla»: volver estricto un flag apagaría cosas en producción.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R4);
`docs/environment-contract.md` (dos filas nuevas); §43 (R1 y R2);
`docs/adr/0016` (de dónde sale el encadenado del barrido).

---

## 65. La cabecera pública reconoce a quien ya entró (GENSCORE-HEADER-2, 2026-08-12)

**Estado: implementada.** Continuación directa de §63. El fundador, ya logado,
volvió a una página pública y se encontró «Iniciar sesión / Prueba gratis»:
*«no debería ver estos botones, debería ver un estado de logado»*. La primera
propuesta fue un botón único «Ir al panel»; la rechazó pidiendo *«algo más
currado, más personalizado»* y señalando el chip de cuenta del menú lateral de
consola (avatar con iniciales + email + insignia de plan).

**No es un parecido, es el mismo chip.** `PublicHeader` renderiza las mismas
clases que `components/sidebar.tsx` (`.user-chip`, `.avatar`,
`.sb-plan-badge`), y las dos partes derivadas —iniciales e «¿hay insignia?»—
salen de `lib/account-chip.ts`, que ahora usan **las dos** superficies.
Repetir `email.slice(0, 2)` en el segundo llamador es exactamente cómo «el
mismo chip» se convierte en dos chips distintos al cabo de unos meses. La
regla de que **Free no pinta insignia** (decisión del fundador, 2026-07-31) se
hereda de ahí en vez de volver a decidirse.

**La decisión de fondo: las páginas públicas siguen siendo estáticas.** Las
~45 superficies de marketing se pre-generan, y eso es el producto de SEO-POS-1
y GROWTH-2/3. Leer la sesión en el servidor dentro de la cabecera compartida
las habría sacado a todas del pre-renderizado —`lib/supabase/server.ts` usa
`cookies()`, que basta para volver dinámica cualquier ruta que lo toque—, así
que la cabecera lo pregunta **desde el cliente** a un endpoint nuevo y mínimo
(`app/api/me/route.ts`) y las páginas no se mueven. Verificado en el build:
`/`, `/pricing`, `/geo`, `/blog/*`, `/comparativas/*`, `/glosario/*`, `/docs/*`
y las legales siguen marcadas `○`.

**El coste, declarado en vez de escondido:** mientras la respuesta no llega, la
cabecera pinta los CTA de anónimo. Quien está logado los ve un instante antes
de que aparezca su chip. Es deliberado y va en la dirección correcta: el
visitante anónimo —prácticamente todo el tráfico de marketing, y la razón de
que el CTA exista— acierta sin parpadeo, y el parpadeo lo sufre el caso raro.
La alternativa (no pintar nada hasta saberlo) retrasa el CTA para todos por
proteger a la minoría.

**El endpoint no aplica la caducidad de la prueba, sólo la lee.** `getPlanForUser`
resuelve el plan pasando por `applyTrialExpiry`, que **escribe** (degrada a
Free con el cliente de servicio) y **manda el email de «prueba terminada»**.
Ese camino es correcto en la consola y ahí se queda. Colgarlo de `/api/me`
—alcanzable desde cada página estática de marketing, es decir mucho más
tráfico que la consola— habría hecho que una visita al blog mandara un email a
un cliente. Así que se extrajo el predicado puro `isTrialElapsed` de dentro de
`applyTrialExpiry` y ambos lo comparten: el endpoint resuelve el plan
**efectivo** (una prueba caducada se pinta como Free, la insignia no miente) sin
escribir ni enviar nada. Un test lo fija afirmando que ni el cliente de
servicio ni `sendTrialEndedEmail` se llaman. La extracción evita la otra
trampa: una segunda copia de «¿se acabó la prueba?» acabaría divergiendo de la
que de verdad cierra el grifo.

`isTrialElapsed` es un predicado booleano **a propósito, no un type guard**:
que devuelva `false` significa «la prueba sigue viva», nunca «no hay fila», y
declararlo `row is TrialFields` hacía que TypeScript estrechara la rama falsa a
`never`. Lo cazó `tsc`, no una revisión.

**Alcance del endpoint:** devuelve email, `planId` y `planName`, y nada más.
Lee tres columnas de `profiles` con el cliente del usuario (RLS, sin atajo de
servicio); un test fija esa lista exacta, porque ampliarla amplía lo que
pueden filtrar unas páginas públicas. Responde **200 con `user: null`** para
anónimo en vez de 401: es el caso esperado en una página de marketing y un 401
en cada carga sería ruido en la consola del navegador. Si la petición falla, la
cabecera se queda con los CTA de anónimo — nunca una cabecera rota.

**Addendum GENSCORE-HEADER-3 — la franja de la home (fundador, 2026-08-12).**
Se entregó en este mismo PR, no en uno posterior. Al ver el chip funcionando,
el agente dejó declarado que la franja `7 días de Pro · Sin tarjeta` de la home
le seguía saliendo a un cliente de Agencia — el mismo fallo que §65 corrige, en
otro elemento— y **no la tocó**, porque la regla correcta no era obvia y la
decisión es comercial. El fundador la fijó: *«tiene que salir a usuarios no
logados o plan free»*.

- **Por eso no valía «ocultar si hay sesión».** Es una oferta de alta: a quien
  paga le sobra, pero a un logado en **Free** le sigue sirviendo. El corte no
  es logado/anónimo, es de pago/no de pago.
- **`showsPromoStrip` vive junto a `showsPlanBadge`** en `lib/account-chip.ts`
  y un test fija que son **exactamente inversas** para todo plan resuelto: son
  la misma pregunta vista por los dos lados, y si un día discrepan es que una
  superficie considera de pago a una cuenta que la otra considera gratuita.
- **`undefined` (anónimo, o identidad aún sin resolver) muestra la franja**,
  misma optimismo que la cabecera: el visitante para el que está escrita la ve
  sin parpadeo, y el cliente de pago la ve el instante que tarda la respuesta.
- **Una sola petición para los dos consumidores.** La franja vive fuera de la
  cabecera, así que dos `useEffect` independientes habrían hecho dos viajes a
  `/api/me` en la página más visitada del sitio. El hook pasó a
  `lib/use-session-user.ts` con una promesa compartida a nivel de módulo;
  verificado en local que la home hace **una** llamada con los dos montados.
  El ámbito de módulo también evita servir una identidad rancia: toda
  transición de sesión (login, logout) es una carga completa de página.

**El banner del pie, y por qué su regla NO es la de la franja.** El `ux-pilot`,
juzgando las capturas de este PR, encontró el tercer sitio: el banner del pie de
la home («Descubre tu visibilidad en IA hoy», con «Prueba gratis» e «Iniciar
sesión») seguía igual para un logado. El fundador pidió meterlo en este mismo
PR. **Aquí el corte es logado/anónimo, no de pago/no de pago**, y la diferencia
es sustantiva: «Iniciar sesión» no le sirve a *ningún* logado, y «Prueba
gratis» a uno en Free tampoco —ya la tiene—, mientras que la franja sí le sigue
sirviendo a ese mismo usuario porque ofrece algo que no tiene (Pro, 7 días).
Dos elementos parecidos con dos reglas distintas, y colapsarlas habría dejado
un botón sin sentido en una de las dos.

**Cambia el texto, no sólo los botones.** «Introduce tu dominio y obtén tu
primer informe en minutos» le habla a quien no tiene ninguno; dejarlo con un
botón nuevo debajo habría sido media corrección. Para un logado: «Continúa
donde lo dejaste» + un único «Ir al panel». Sin cifras ni promesas nuevas
(CLAUDE.md, "no fake metrics").

**El chip pasa a tener nombre accesible y `data-testid`.** El avatar son dos
letras que leídas en voz alta no significan nada y la insignia era un glifo de
corona más una palabra suelta («Agencia») que no dice que sea un plan: ahora
las partes visuales van `aria-hidden` y el enlace lleva el nombre completo
(«Ir al panel. Cuenta: … , plan …»). El `data-testid` es lo que permite
afirmar sobre el chip sin recortar píxeles de una captura.

**Y el piloto pasa a abrir el cajón móvil de una página pública.** Su barrido
de interacción sólo abría menús de consola, así que el cajón de la cabecera
pública no se fotografiaba nunca — por eso GENSCORE-HEADER-2 se llevó un PASS
sin que nadie hubiera visto el chip en 375 ni en 768, y quien lo verificó fue
el fundador con su teléfono. Eso es precisamente lo que el piloto existe para
no delegar, y es además el sitio donde ya se coló un fallo real (el CTA
duplicado que corrigió §63). El test nuevo se salta solo por encima de 900px,
donde `.lp-burger` no existe, y afirma por `data-testid` en vez de por texto:
el email y el plan de la cuenta piloto pueden cambiar, la existencia del chip
no.

**Addendum — dos ajustes tras probarlo el fundador en su móvil (2026-08-13).**
El CTA de la sección "Recomendaciones" (`Empieza gratis`, a media home) también
pasa a `Ir al panel` en logado, mismo criterio que el banner del pie: es un
CTA de alta y a un logado no le sirve, esté en el plan que esté. No se tocaron
los otros dos CTA de la home que sí quedan igual a propósito — el campo de
dominio del hero (`Analiza gratis`, ligado a escribir un dominio y no a "darse
de alta" en sí) y el enlace "Ver cómo funciona" — porque decidir qué le pasa a
ese campo para un logado es una pregunta de producto más grande (¿crea un
proyecto? ¿redirige?) que no se ha hecho.

Y el chip del cajón móvil: el fundador señaló que la línea del email quedaba
pegada a la insignia de plan. `.lp-user-chip` gana algo de relleno propio y la
insignia un `margin-top` mayor, ambos con ámbito a esta cabecera — el chip del
sidebar de consola no se toca porque su espaciado ya estaba aprobado y el
problema no era suyo.

**Segundo addendum — más aire, sin cambiar el diseño (2026-08-13).** Antes de
este ajuste se le enseñaron tres alternativas de avatar en un artefacto
(círculo sólido, degradado, squircle con anillo); el fundador las vio y pidió
**quedarse con el actual** — solo con más espacio entre elementos.

**Ese primer intento no hizo nada, y el fundador lo pidió tres veces antes de
que se detectara por qué.** `.lp-user-chip { padding: 13px 14px; }` se subía
correctamente en el código, pero el elemento es un `<a>` dentro de
`.lp-mobnav`, y `.lp-mobnav a { padding: 0 10px; }` (clase + etiqueta,
especificidad 0,1,1) le ganaba en cascada a un `.lp-user-chip` a secas (una
sola clase, 0,1,0) — sin relación funcional entre ambas reglas, solo una
coincidencia de selector. El `padding` computado real era `0px` arriba/abajo
pese a que el fichero decía `13px`. Se encontró leyendo el **valor
computado** en un navegador real (`getComputedStyle`), no releyendo el CSS —
la fuente ya "decía" lo correcto, así que releerla no habría encontrado nada.
Arreglado subiendo la especificidad con `.user-chip.lp-user-chip` (las dos
clases reales que ya lleva el elemento, no un truco), que gana sin depender
del orden de aparición en el fichero. Sigue sin tocar el chip del sidebar de
consola.

**Tercer addendum — borde fuera, gris suave dentro (2026-08-13).** El
fundador pidió, ya con el espaciado correcto, quitar el borde de 1px y poner
en su lugar un fondo gris suave. `--surface-2` (el mismo token que ya usa
`.user-chip:hover` en el sidebar) en vez de un gris nuevo — así el estado
"activo"/hover del chip y su estado en reposo comparten familia de color en
vez de inventar un segundo gris que conviva mal con el primero.

**Cuarto addendum — un punto más oscuro, y merge directo (2026-08-13).**
`--surface-2` (#fbfbfd) quedaba casi invisible contra el blanco de la nav; se
sube un peldaño en la misma escala de neutros a `--canvas` (#f6f7f9) —
sigue siendo un token con nombre, no un valor suelto inventado para este
componente. El fundador pidió mergear directamente con este cambio, sin
otra vuelta de piloto: era un ajuste de un valor de color sobre un chip ya
verificado tres veces por el `ux-pilot` en su forma y contenido.

### Pendiente / roto conocido

- ~~**El chip no se ha visto con una sesión real de Supabase**~~ — **cerrado
  el 2026-08-12**. El entorno del agente no tiene credenciales, así que la
  lógica del endpoint la cubren tests unitarios y el pintado se verificó
  interceptando la respuesta de `/api/me` (agencia, free, email largo,
  anónimo, escritorio y cajón móvil). El extremo a extremo lo cerró **el
  propio fundador** sobre el preview del PR #393, con su sesión: el chip sale
  en el cajón móvil de `/blog` con sus iniciales, su email y la insignia
  «Agencia». Queda anotado porque es el único camino que ni los tests ni el
  piloto podían cubrir aquí: el piloto entra con la cuenta de piloto, cuyo
  plan no tiene por qué pintar insignia, así que **una insignia de pago sobre
  una sesión real sólo la podía ver alguien con una cuenta de pago**.

---

## 73. Publicar los números del producto obliga a atarlos al código (SEO-POS-1, S6, 2026-08-13)

**Pieza.** `/blog/metricas-geo-que-medir` — "Métricas GEO: qué medir y qué no",
cluster `medicion`. Cubre el cluster de keywords nº 6 del plan ("métricas GEO",
"share of voice en IA", "tasa de citación"), la última capa informacional donde
el mercado en castellano sigue teniendo hueco.

**El ángulo, y por qué no es otro post de definiciones.** La pieza se estructura
alrededor de una idea que casi nadie escribe: **la unidad de observación es la
respuesta, no el prompt**. Veinte prompts en tres motores son sesenta
observaciones, y casi todos los errores de medición del sector salen de
equivocar ese denominador. A partir de ahí, cinco métricas (tasa de mención,
cuota de voz, posición cuando apareces, tasa de citación de tu dominio,
preparación técnica) y las trampas de cada una.

**La sección que la hace citable** es la de la posición. Reproduce el hallazgo
de ADR 0026 con su tabla: un escaneo simulado en el que **las ocho entidades
aparecen siempre segundas**, y donde la "posición media" —la que promedia como
último puesto cada respuesta en la que no sales— las ordena de 5,50 a 8,65. Esa
métrica está midiendo frecuencia de aparición y llamándolo posición, y de ahí
salen las dos consecuencias que descolocan a cualquiera que mire un panel: la
marca seguida sale favorecida por construcción (el conjunto de prompts se elige
a su alrededor), y el mejor valor posible deja de ser 1. Es un error real que
este producto cometió, corrigió y documentó — publicarlo demuestra criterio en
vez de afirmarlo, igual que la página sin fecha en §69.

**Qué sí se publica y qué no, aplicando la línea de §69.** Los umbrales de
lectura sí: diez respuestas mínimo antes de una franja o un delta
(`MIN_RESPONSES_FOR_BAND`), ventana de tres escaneos para la mediana
(`DEFAULT_SCORE_WINDOW_SIZE`), el incidente real de los 44 puntos con tres
respuestas. Los pesos del compuesto **ya son públicos** en
`/docs/metodologia/geo-score` desde GEO-SCORE-V4, así que el artículo enlaza
allí en vez de reabrir la discusión.

**El test que sostiene todo esto** (`lib/blog/metricas-geo.test.ts`) es la parte
reutilizable. Un artículo que publica constantes del producto **caduca solo**:
si `MIN_RESPONSES_FOR_BAND` pasa a 15 o Claude gana grounding real, el texto
pasa a mentir sobre nuestra propia metodología y nada falla — es prosa en un
MDX. El test importa las constantes reales y las contrasta contra las cifras
publicadas y contra `ENGINE_META.claude.grounded`, así que el cambio de código
y el refresco del artículo caen en el mismo PR o no cae ninguno.

**Dos fallos de descubribilidad encontrados de camino, los dos del mismo
patrón que §62 y §70:**

1. **`como-saber-si-tu-marca-aparece-en-chatgpt` (S1) nunca lo abrió el
   piloto.** Se añadió al fixture del self-check y no al mapa del journey — son
   dos listas a mano en dos ficheros, y el guardián que existía sólo cubría la
   primera. Un post ausente del journey no da 404: simplemente no se mira. Tres
   días de `PILOT PASS` sobre un artículo que nadie había visto. Arreglado, y
   ahora `fixture-drift.test.ts` contrasta el mapa del spec contra `BLOG_POSTS`
   comparando **también el cluster**, no sólo el slug.
2. **Cuatro artículos declaraban portada y enseñaban el degradado.**
   `BlogCover` sólo pinta la imagen si recibe `image`, y cuatro MDX
   —`que-es-el-geo-score`, `como-conseguir-que-chatgpt-te-cite`,
   `como-saber-si-tu-marca-aparece-en-chatgpt`, `que-es-una-auditoria-geo`— no
   se la pasaban. Su portada salía bien en `/blog`, en la tarjeta social y en
   el schema, y en su propia cabecera salía el respaldo que existe para los
   artículos *sin* portada: justo "el icono de algo que no carga bien" que
   originó `covers.test.ts`. Los tests de portada miraban `BLOG_POSTS` y el
   disco, nunca el MDX. Corregidos los cuatro, con test nuevo.

**Portada.** SVG en el repo, rasterizado a WebP (§47). No es decorativa: a la
izquierda la muestra —puntos que son respuestas, unas con mención y otras
sin— y a la derecha las cinco métricas que salen de ella, **cuatro dibujadas
con su margen de error y la quinta sin él**, porque la preparación técnica es
la única determinista. La asimetría es la tesis del artículo.

---

## 74. El pilar del GEO Score llevaba ocho días publicando una fórmula retirada (SEO-POS-1, S6, 2026-08-13)

**Qué pasaba.** GEO-SCORE-V4 (ADR 0033, 2026-08-05) añadió el componente
técnico con peso .20 y reescaló los otros cuatro a .32/.20/.16/.12.
`/docs/metodologia/geo-score` se actualizó en aquel PR. El artículo pilar del
blog, `/blog/que-es-el-geo-score`, no: seguía publicando "cuatro señales" con
los pesos de v2 (.40/.25/.20/.15) citando ADR-0015 como fuente. **El sitio se
contradecía a sí mismo sobre su propia metodología**, en las dos páginas que
más tráfico informacional traen sobre ella.

No lo cazó nadie porque no había nada que lo cazara: el reparto de pesos vivía
escrito a mano en tres sitios (código, docs, MDX) y sólo dos se movieron.

**Por qué se arregla en el PR de S6 y no en uno aparte.** El artículo nuevo
nombra las cinco señales. Publicarlo dejando el pilar en cuatro no habría sido
"una fase de más": habría sido publicar a sabiendas dos versiones distintas de
la misma metodología a un enlace de distancia.

**Qué se cambió.** Las cinco señales en el resumen, la tabla y la maqueta
—cuyo gauge se recalculó, porque `article-recipes.test.ts` exige que el número
sea la media ponderada real de las filas que enseña—, los pesos vigentes en el
`StatGrid` citando ADR-0033, y un párrafo nuevo sobre por qué la señal técnica
va dentro del compuesto (es una condición: una web que los motores no pueden
leer no puede beneficiarse de ninguna otra mejora) y qué compra que sea
determinista (una quinta parte menos de varianza en el número de cabecera).

**Primer uso real de `dateUpdated`** (la tubería llegó en la Fase T-c y no la
había estrenado nadie): el artículo muestra "Actualizado el 13 de agosto de
2026", lo emite en `Article.dateModified` y en `og:modified_time`. El test que
exigía que *ningún* post tuviera `dateUpdated` se sustituye por una lista de
refrescos documentados — conserva lo que protegía de verdad (que nadie suba una
fecha sin tocar el artículo, `content-strategy.md` §4.4) y deja de bloquear el
caso para el que se construyó el campo.

**La regla que queda:** los pesos del GeoScore están publicados en tres sitios
y sólo uno es la verdad. `lib/blog/metricas-geo.test.ts` ata ahora el MDX al
`TECHNICAL_WEIGHT` real y comprueba que los otros cuatro conserven sus
proporciones v3 exactas al dividir por `1 − w`, que es la misma comprobación
que ADR 0033 §1 hace en su propia tabla.

---

## 75. Los pesos y los códigos ADR salen del contenido público (SEO-POS-1, S6, revisión del fundador, 2026-08-13)

**La decisión.** Fundador, revisando S6: *"En general no quiero exponer cosas
tan concretas del producto, como pesos reales para un cálculo o estos códigos
ADR-0024 · capa de fiabilidad. Revísalo y elimínalos de todos los artículos"*.

**Supersede en parte a §74**, que doce horas antes había hecho lo contrario:
refrescar el pilar del GEO Score para que publicara los pesos vigentes en vez
de los retirados. El problema que §74 resolvía era real —el artículo llevaba
ocho días publicando la fórmula v2— pero esta decisión lo resuelve mejor: **lo
que no se publica no se puede quedar rancio.**

**Son dos cosas distintas y conviene no confundirlas:**

- **Los pesos del compuesto** son configuración del producto. Quien los tiene
  puede reproducir la métrica sin haberla construido, y al lector no le dicen
  nada que no le diga ya el orden de importancia. Misma línea que §69 trazó
  para el reparto de puntos de la auditoría: dimensiones y umbrales de
  comportamiento sí, reparto exacto no.
- **Los códigos ADR** son peor que innecesarios: son la referencia interna de
  un documento que el lector no puede abrir, así que como "fuente" de una cifra
  no acreditan nada — sólo publican el índice de nuestras decisiones internas.
  Sustituidos por fuentes que sí significan algo fuera: "Metodología de
  GenScore", o la evidencia real (un incidente fechado, datos de ejemplo
  declarados como tales).

**Alcance real, que resultó ser mayor que un artículo.** El error se había
propagado copiando la cabecera de la pieza anterior:

| Superficie | Qué publicaba |
|---|---|
| `que-es-el-geo-score` | los cinco pesos v4 + 5 códigos ADR |
| `metricas-geo-que-medir` | 4 códigos ADR + el peso técnico como "−20 % de varianza" |
| `como-elegir-competidores-analisis-geo` | 25 % / 20 % / 45 % + 3 códigos ADR, **con la fórmula v2 ya retirada** |
| `como-elegir-prompts-monitorizar-marca-ia` | 40 % / 25 % y "suman el 65 % de tu GEO Score", **v2** |
| `llms-txt-guia-practica` | "la autoridad pesa un 15 % del GEO Score… los pesos reales de ADR-0015", **v2** |
| `/glosario/geo-score` | los cuatro pesos v2 en prosa, y "cuatro señales" |

Tres de las seis, además, llevaban meses publicando una fórmula que el producto
ya no usa. Retirar el dato arregla las dos cosas de una vez.

**Lo que se conserva, y por qué importa.** `ProductMock` deja de pintar
`peso N%`, pero **el peso sigue en el fuente del MDX**: es lo que hace
verificable el número del gauge (`article-recipes.test.ts` comprueba que sea la
media ponderada real de las filas que la figura enseña, un error que ya se
coló dos veces). El fuente de un artículo no es una superficie pública; la
página sí.

**Lo que sustituye a los pesos en el texto** no es un hueco: es el **orden de
importancia**, que es lo único que el lector podía accionar. "La presencia es
la que más manda, porque sin mención no hay nada que interpretar" le sirve para
decidir; un 32 % no.

**El guardián** (`article-honesty.test.ts`, "el contenido público no publica
configuración interna del producto") barre las cuatro superficies —artículos,
glosario, `/docs` y comparativas— buscando códigos ADR y porcentajes presentados como
peso. Exige vocabulario del compuesto alrededor del porcentaje: la primera
versión marcaba una afirmación legítima sobre un competidor ("aumenta el peso
de la página … hasta en un 98 %"), y un guardián con falsos positivos se
desactiva a la primera.

**La metodología publicada entró después, y por decisión expresa.**
`/docs/metodologia/geo-score` no es un artículo, así que no caía dentro de la
instrucción literal — pero era la página a la que los propios artículos
mandaban al lector a buscar el detalle, con la tabla de pesos entera. Se
preguntó al fundador con las dos alternativas y su coste, y eligió retirarlos
también: **si el reparto no se publica, no se publica en ninguna parte.**

Lo que esa página conserva: los cinco componentes, qué mide cada uno, el orden
de importancia, qué ocurre cuando falta un dato, la ventana de la mediana, las
etiquetas de confianza y las franjas. Lo que pierde: la columna de porcentajes.
Y con ella, la promesa de "metodología **completa**" en los enlaces que
apuntaban ahí — reescrita en el pilar y en el glosario, porque un enlace que
promete el cálculo entero y lleva a una página sin él es una decepción que se
paga en credibilidad.

**La fecha, en los tres sitios donde vive.** Cambiar el contenido obligó a
subir la fecha visible de la página, la del glosario (dos entradas tocadas) y
las dos del sitemap. El sitemap tenía **una sola fecha para las cinco docs**,
así que subirla habría dicho que cambiaron todas: ahora admite excepciones por
página, igual que `PILLAR_LAST_MODIFIED` hace por cluster desde T15. Y un test
obliga a que la fecha del glosario coincida en la página y en el sitemap: dos
fechas distintas para el mismo contenido son una señal de frescura que se
contradice a sí misma, peor que no dar ninguna.

---

## 76. Segunda pasada: fuera también la mecánica, no solo los pesos (SEO-POS-1, S6, revisión del fundador, 2026-08-13)

**Qué pasó.** §75 retiró los pesos y los códigos ADR. El fundador volvió a
revisar y encontró, viva en el pilar, la frase *"una media ponderada de cinco
señales"*:

> *"No digas cosas concretas de ninguna parte del producto. Por favor, ya lo
> dije en la última revisión. […] Además de desvelar cómo se calcula la métrica
> principal le resta valor, lo simplifica demasiado. Revisa de nuevo los
> artículos que digan cosas de Genscore y haz que las afirmaciones sean más
> etéreas, más genéricas."*

Tenía razón en las dos mitades, y la segunda es la que la primera pasada no vio.
Yo había leído "no publiques los parámetros" cuando lo que había que leer era
**"no publiques la máquina"**. Quitar los pesos y dejar "es una media ponderada
de cinco señales que se descartan y renormalizan" es quitar las cifras de la
receta y dejar la receta.

**El argumento de valor, que es el que me faltaba.** Una métrica que se explica
entera en una frase parece que se puede reproducir en una tarde. El trabajo real
—qué se mide, contra qué se compara, cuándo un dato no vale, cómo se estabiliza
entre ejecuciones— desaparece detrás de "es una media ponderada". Publicar la
mecánica no es solo regalar la ventaja: es **abaratar el producto delante del
comprador**.

**La línea que queda, y esta vez enunciada de forma que se pueda aplicar sin
preguntar:**

> **El contenido explica el problema y el criterio. No explica nuestra
> máquina.** Qué mira el producto, sí. Cuántas piezas tiene, cómo las combina,
> con qué umbrales decide y qué hace cuando falta una, no.

**Qué se reescribió, superficie a superficie:**

| Superficie | Qué decía | Qué dice |
|---|---|---|
| `que-es-el-geo-score` | "una media ponderada de cinco señales" | "la puntuación con la que GenScore resume cómo de bien te está yendo" |
| — su título | "…y cómo se calcula" | "…y qué mide" |
| `metricas-geo-que-medir` | "en Genscore ese umbral son diez respuestas", "la mediana de los últimos tres escaneos comparables", el incidente de los 44 puntos | la aritmética de la muestra, que es cierta para cualquiera, y "la tendencia sobre varias mediciones comparables" |
| — sus cifras destacadas | umbrales nuestros | cuánto mueve **una** respuesta según el tamaño de la muestra (33 / 10 / 1,7 puntos) |
| `/docs/metodologia/geo-score` | "combina cinco componentes", renormalización, "20 resultados", "entre 2 y 19", "umbrales 70 y 40" | qué mira, en qué orden importa, y que lo que no se puede medir se declara |
| `/glosario/geo-score` | "se calcula combinando cinco señales, cada una con…" | "resume varias señales que no significan lo mismo por separado" |
| `/geo` (landing) | **el desglose entero: `80×40% + 64×25% + … = 65 puntos`** | "Datos de ejemplo. Tu panel muestra tus cifras reales." |

**La landing era lo peor de todo y no la miraba nadie.** `/geo` es la página
comercial más vista del sitio y publicaba la fórmula completa con multiplicación
y suma a la vista — además con los pesos de v2, retirados hacía una semana, y
enseñando cuatro componentes cuando el producto tiene cinco. No es un artículo,
así que ni el guardián de §75 ni ninguna otra comprobación la cubrían. Corregida
y cubierta con test.

**El patrón que se repite, y es el que hay que recordar:** cuando una revisión
del fundador señala una superficie, el trabajo no es arreglar esa superficie —
es buscar la misma clase de error en todas las demás. Las dos veces que no lo
hice, la segunda pasada encontró más de lo que había arreglado la primera.

**Lo que conservan los tests:** `article-honesty.test.ts` añade un detector de
mecánica (media ponderada, recuento de señales, "se calcula combinando",
renormalización, "mediana de tus tres últimos") sobre las cuatro superficies, y
`metricas-geo.test.ts` —que en su v1 exigía justo lo contrario, atar el texto a
las constantes— pasa a exigir que esas constantes **no** aparezcan. El fichero
guarda las dos versiones en su cabecera a propósito: la v1 era un buen
mecanismo sobre una premisa equivocada, y eso es más útil de recordar que la
regla sola.

---

## 77. La metodología no se podía leer en un móvil (2026-08-13)

**El fallo.** El fundador abrió `/docs/metodologia/geo-score` en el móvil y
mandó la captura: **todos los párrafos cortados por la derecha**, sin scroll de
página con el que alcanzar el texto que faltaba.

**La causa, que no está donde parece.** En móvil `.docs-layout` es un flex en
columna con `align-items: flex-start`, así que la columna de contenido se
dimensiona por su hijo más ancho — y su hijo más ancho era la tabla, con
`min-width: 480px`. En una pantalla de 375 px eso hacía que **cada párrafo
midiera 480**, y lo que sobraba quedaba fuera de la ventana. El eje afectado es
el transversal, así que el `min-width: 0` que ya tenía la columna no servía de
nada: hacía falta `align-self: stretch`.

Con eso, la columna mide lo que la pantalla y la tabla hace su propio scroll
dentro de `.docs-table-wrap`, que es exactamente para lo que existe.

**Lo segundo, del mismo día:** `white-space: nowrap` en todas las celdas de las
tablas de `/docs`. Valía para la de planes —celdas de dos palabras— y dejaba
ilegible la de metodología en cuanto su segunda columna pasó a ser prosa: a
1280 px las frases se salían de la caja y el lector veía *"…y la que más m"*.
Ahora las celdas envuelven y sólo las cabeceras conservan el `nowrap`.

**Lo que esto dice del piloto, otra vez.** Las dos pasadas anteriores dieron
`PILOT PASS` con `docs-metodologia/geo-score` en ✅ a las tres anchuras, y las
dos veces era correcto: la página **cargaba** bien. Un texto cortado no es un
fallo de carga. Es el mismo límite que ya está escrito en el histórico —el
`PASS` es la lista de lo que el piloto vio, no un juicio sobre lo que se ve— y
la única defensa real sigue siendo mirar las capturas. Esta la encontró el
fundador antes que yo, mirando su propio móvil

## 78. El cliente de Gemini sale de las nueve funcionalidades que lo tapaban (PRELAUNCH-HARDENING-1 Fase R5, primera mitad, 2026-08-13)

`lib/llm/gemini.ts` tenía **1.278 líneas** y era dos cosas a la vez: el cliente
HTTP de un proveedor y **nueve funcionalidades de producto** —el escaneo, la
auditoría web, la extracción, el perfil de negocio, los alias de marca, los
competidores sugeridos, dos generadores de prompts y la reescritura de
recomendaciones—. Cada una de esas nueve tiene su módulo dueño en otro sitio.

Este slice mueve **sólo el transporte** a `lib/llm/gemini-client.ts` (231
líneas): la URL, el modelo fijado y su validación, los mensajes de error por
estado, el `fetch` con reintentos de LLM-RESILIENCE-1, el mapeo a error
categorizado, y las dos formas de pedir JSON (normal y con *grounding*).
`gemini.ts` baja a 1.084 y **no cambia ni un export público**: reexporta
`GeminiTimeoutError` y `GeminiConfigError`, así que ningún sitio de llamada se
entera. Repartir las nueve funcionalidades es el siguiente slice, y sale mucho
más pequeño ahora que cada una depende de un cliente limpio en vez del fichero
entero.

Lo que R2 ya unificó (`delay`, `fetchWithTimeout`, compartidos con OpenAI y
Claude) sigue donde estaba; esto es lo que es específico de Gemini.

### Lo que enseñó el intento de usar el accesor de R4

Aproveché el traslado para leer `GEMINI_MODEL` y `GEMINI_API_KEY` por
`serverEnv()`, el accesor tipado que acababa de entrar en R4. Parecía la
continuación natural de la fase anterior. **No lo es, y el test lo cazó al
instante**: `serverEnv()` cachea el entorno en el primer acceso, así que
enrutar por él una variable que hoy se lee fresca en cada llamada cambia
*cuándo* se observa un valor. `gemini.test.ts` cambia `GEMINI_MODEL` entre
casos y falló con un tipo de error que no era el esperado.

La regla de la fase es explícita —«si un slice necesita cambiar un test, es que
no era un refactor y se para»— así que se revirtió, no se tocó el test. Queda
como invariante para todos los sitios de adopción que faltan: **adoptar
`serverEnv()` es una decisión propia con su propio análisis, nunca un efecto
colateral de mover código de sitio.** El accesor cachea a propósito (una
función serverless tiene el entorno fijo), pero eso lo hace inadecuado
justamente donde algo espera releer.

### Una inconsistencia conservada, no arreglada

Ante la MISMA condición —falta `GEMINI_API_KEY`— `generateGeminiJson` lanza
`ExtractionError("config", …)` y `generateGroundedGeminiJson` lanza
`GeminiConfigError`. Dos tipos distintos para el mismo fallo, y quien los
captura los trata distinto. Se deja como está porque esto es un refactor y
unificarlo cambiaría qué error ve un caller en producción. Queda anotado en el
propio código y aquí, para decidirlo aparte.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R5); §70 (R4 y su
accesor); §43 (R1 y R2); log §56 y `.claude/rules/gemini.md` (de dónde sale el
`fetch` con reintentos que se mueve intacto).

---

## 79. Los tres motores compartían una forma de respuesta que vivía dentro de uno de ellos (PRELAUNCH-HARDENING-1 Fase R5, segunda mitad, primer trozo, 2026-08-14)

**Qué se decidió.** Los cuatro tipos que cruzan la capa de LLM
—`GeminiVisibilityResponse`, `GeminiStructuredExtractionResponse`,
`BusinessProfile`, `HomepageEvidenceInput`— y la función pura
`otherBrandsRelevanceHint` salen de `lib/llm/gemini.ts` a un módulo neutral,
`lib/llm/contracts.ts`. `lib/llm/openai.ts` y `lib/llm/claude.ts` dejan de
importar del cliente de Gemini.

**Por qué, y por qué antes de mover las nueve funciones.** La segunda mitad de
R5 —repartir las nueve funcionalidades de producto a sus módulos dueños— parecía
mecánica y no lo era. `BusinessProfile` lo usan nueve módulos, y dos de ellos
son **los otros dos motores**: `openai.ts` y `claude.ts` abrían con

```ts
import { otherBrandsRelevanceHint, type BusinessProfile, type GeminiVisibilityResponse, … } from "@/lib/llm/gemini";
```

Eso no es una casualidad de imports: los tres motores devuelven la misma forma
de respuesta —es exactamente lo que permite que `lib/scan/executor.ts` los trate
igual— y esa forma estaba definida dentro de uno de los tres. El cliente de un
proveedor era dependencia de sus dos competidores. Mientras eso siguiera así,
cualquier mudanza dentro de `gemini.ts` arrastraba a OpenAI y a Claude, y la
segunda mitad de R5 nacía con ciclos garantizados. Primero se le da casa neutral
a lo compartido; luego se reparte lo que no lo es.

**Lo que NO se hizo, y por qué.** `GeminiVisibilityResponse` describe la
respuesta de los tres motores, no la de Gemini: el nombre miente. Renombrarlo
toca ~15 ficheros por un motivo puramente cosmético, así que se conserva tal
cual y queda anotado aquí y en el propio módulo. Un refactor que además renombra
deja de poder demostrarse por los tests.

**Cómo se demuestra que es un refactor.** `gemini.ts` reexporta los cinco
símbolos, así que ningún sitio de llamada estaba obligado a cambiar —
`gemini.test.ts` importa `otherBrandsRelevanceHint` de ahí y no se ha tocado.
Los importadores que sí se movieron a `contracts.ts` (los dos motores, el
executor, extracción, competidores, perfil de negocio, prompts) son cambios de
ruta de import, no de código. 2.278 tests, los mismos que antes y sin editar
ninguno.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R5); §78 (la
primera mitad, el transporte); la regla de la fase —«si un slice necesita
cambiar un test, es que no era un refactor»— es la que impidió renombrar aquí.

**Pendiente.** El reparto de las nueve funcionalidades a sus módulos dueños
sigue siendo el siguiente trozo, y ahora sale sin ciclos.

---

## 80. Las nueve funcionalidades salen del cliente de Gemini, y la costura que las tapaba resulta ser la que mockean seis tests (PRELAUNCH-HARDENING-1 Fase R5, segunda mitad, 2026-08-14)

**Qué se decidió.** Las funcionalidades de producto que vivían dentro de
`lib/llm/gemini.ts` se van a sus módulos dueños:

| Función | De | A |
|---|---|---|
| `auditDomainContent` (+ sus dos tipos) | `lib/llm/gemini.ts` | `lib/web-audit/audit-domain-content.ts` |
| `inferBusinessProfile`, `inferBrandAliases` | idem | `lib/projects/infer-business-profile.ts` |
| `suggestCompetitors` (+ `SuggestedCompetitor`) | idem | `lib/competitors/competitor-suggestions-llm.ts` |
| `suggestPrompts`, `generateAddedPrompts` | idem | `lib/projects/prompt-suggestions-llm.ts` |
| `rewriteRecommendation` | idem | `lib/recommendations/recommendation-rewrite-llm.ts` |

Se quedan en `gemini.ts` las dos que sí son el motor Gemini —
`generateGeminiVisibilityAnswer` y `extractGeminiStructuredData`—, que es
exactamente lo que contienen `lib/llm/openai.ts` y `lib/llm/claude.ts`. El
fichero pasa de **1.278 líneas a 303**, y el mayor de los ocho módulos de la
capa se queda en 303.

**Por qué importa más de lo que parece.** No es sólo tamaño: cada una de esas
funciones tiene una regla de ruta que se inyecta sola al tocar su zona
(`.claude/rules/web-audit.md`, `competitors.md`, `recommendations.md`).
Mientras vivían en `lib/llm/gemini.ts`, la regla que se inyectaba era la de
Gemini y la de su zona no llegaba nunca. Estaban gobernadas por el fichero en
el que se escribieron, no por el dominio al que pertenecen.

### Lo que se descubrió por el camino: la ruta de import es infraestructura

`lib/llm/gemini.ts` reexporta todo lo que se ha ido, y **eso no es un apaño
transitorio**. Seis ficheros de test hacen `vi.mock("@/lib/llm/gemini", …)`:
`business-profile.test.ts`, `add-prompts.test.ts`, `extraction.test.ts`,
`executor.test.ts`, `domain-coverage.test.ts` y
`rewrite-recommendation.test.ts`. Esa ruta de import es la costura por la que
el suite entero sustituye al proveedor. Cambiar los sitios de llamada para que
apunten al módulo nuevo dejaría esos seis mocks apuntando a un módulo que ya no
provee nada, y el arreglo sería reescribir tests — que es justo lo que la regla
de la fase prohíbe («si un slice necesita cambiar un test, es que no era un
refactor»).

O sea que aquí el barril no es deuda: es el punto de inyección. Quitarlo es una
decisión de **estrategia de tests** (mockear el cliente HTTP en vez del módulo,
o inyectar la dependencia), no un efecto colateral de mover código de sitio.
Queda anotado en el propio `gemini.ts` para que una sesión futura no lo
«limpie» sin darse cuenta de lo que sostiene.

### Un hallazgo menor, no arreglado

`rewriteRecommendation` no llama a `reportLlmIncident` — es la única de las
cinco que degrada sin reportar. Se ha movido tal cual, con el hueco intacto: es
un cambio de comportamiento y no cabe en un refactor. Está en la línea de lo que
`.claude/rules/gemini.md` ya dice («un `catch` que descarta la causa es un bug»)
y merece su propio slice.

**Cómo se demuestra que es un refactor.** 2.278 tests, los mismos que antes de
empezar R5 y sin editar ninguno. Cero cambios en sitios de llamada. Ningún
export público desaparece.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R5); §78 (el
transporte); §79 (los tipos compartidos, el paso que hizo posible éste).

---

## 81. El ejecutor del escaneo mezclaba la campaña con el trabajo de un solo prompt (PRELAUNCH-HARDENING-1 Fase R6, primer trozo, 2026-08-14)

**Qué se decidió.** `processPromptJob` —con `callProvider` y sus dos tipos de
resultado— sale de `lib/scan/executor.ts` a `lib/scan/prompt-job.ts`. El
ejecutor pasa de **1.523 a 1.167 líneas**.

**Por qué.** El fichero operaba en dos niveles a la vez. Por un lado la
campaña: reclamar lotes de jobs, repartir el presupuesto de la invocación,
finalizar la ronda, puntuar, notificar. Por otro **el trabajo de un prompt**:
las transiciones de estado del job, una llamada por motor con sus rondas de
reintento compartidas, la inserción de un resultado por motor que responde, el
registro. Lo segundo es exactamente lo que se abre cuando hay que depurar por
qué un prompt concreto falló, y estaba enterrado en medio de lo primero.

**Lo que se conserva, dicho explícitamente**, porque `.claude/rules/scan.md`
aplica entera y esto es una mudanza: el reintento acotado por rondas, el
criterio de que un motor mal configurado no tumba a los que funcionan, y que el
job tiene éxito si al menos un motor produce resultado.

**Un duplicado que muere de paso.** `executor.ts` definía su propio `delay`,
idéntico carácter por carácter al de `lib/llm/http.ts` (que nació en R2
precisamente para dejar de tener tres copias de esto). Ahora los dos módulos
usan el de `http.ts`.

**Los mocks siguen funcionando sin tocarlos, y por qué.** `executor.test.ts`
mockea `@/lib/llm/gemini`, `@/lib/llm/claude` y `@/lib/llm/openai`. Esos mocks
son de registro de módulos, no del importador, así que siguen aplicando aunque
ahora quien importe a los tres motores sea `prompt-job.ts` y no el ejecutor.
Es la diferencia con el caso de §80 —allí lo mockeado era el módulo del que
salía el código, aquí lo que se mockea son sus dependencias— y merece quedar
escrito porque de fuera parecen el mismo problema.

**Cómo se demuestra que es un refactor.** 2.278 tests, los mismos, sin editar
ninguno. `executor.test.ts` tiene 45 casos y todos pasan sin cambios.

**Pendiente de R6.** Mover `lib/scan/types.ts` y `lib/scan/constants.ts` a
`lib/domain/`. Medido: **26 ficheros fuera de `lib/scan/` los importan**, nueve
de ellos tests, y entre ellos está `lib/llm/gemini-client.ts` — o sea que hoy
el transporte de un proveedor de LLM depende del módulo de escaneo. La
inversión es real y vale la pena, pero es un slice propio: un shim de
reexports en `lib/scan/` no rompería nada, porque la dependencia seguiría
existiendo a través del shim.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R6);
`.claude/rules/scan.md` (los invariantes que la mudanza conserva); §80 (el
caso de mocking que NO es éste).

---

## 82. La dependencia de medio repositorio sobre `lib/scan/` eran tres símbolos, no dos ficheros (PRELAUNCH-HARDENING-1 Fase R6, segunda mitad, 2026-08-14)

**Qué decía el plan.** «Mover `scan/types.ts` + `scan/constants.ts` a
`lib/domain/` (rompe las 6 dependencias mutuas sobre `lib/scan`)». Dos cifras
mal y, lo importante, **la solución equivocada**.

**Lo que había de verdad.** 26 ficheros fuera de `lib/scan/` importaban de esos
dos módulos. Al mirar *qué* importaba cada uno, toda la dependencia se reduce a:

| Símbolo | Importadores externos | Dónde vive ahora |
|---|---|---|
| `AuthenticatedContext` | 17 | `lib/auth.ts` |
| 8 constantes de llamada a LLM (`EXTRACTION_CALL_TIMEOUT_MS`, `EXTRACTION_MAX_ATTEMPTS`, `EXTRACTION_RETRY_BASE_DELAY_MS`, `EXTRACTION_RETRY_MAX_DELAY_MS`, `LLM_CALL_MAX_ATTEMPTS`, `LLM_CALL_RETRY_BASE_DELAY_MS`, `LLM_CALL_RETRY_MAX_DELAY_MS`, `LLM_INCIDENT_DEDUPE_MINUTES`) | 7 | `lib/llm/constants.ts` |
| `ProjectActionError` | 2 (ambos tests) | se queda en `lib/scan/types.ts` |

**Por qué mover los ficheros enteros habría sido peor que no hacer nada.**
`lib/scan/constants.ts` tiene 466 líneas y el 95% es ciclo de vida del escaneo:
leases, timeouts de reconciliación, resúmenes de error, topes de reintento
automático. Llevarlo a `lib/domain/` habría metido todo eso en un módulo
«neutral» por culpa de ocho vecinas — y no habría roto ninguna dependencia,
sólo cambiado su nombre. Y `AuthenticatedContext` no es un tipo de escaneo en
absoluto: es `Awaited<ReturnType<typeof requireUser>>`, o sea el tipo de
retorno de una función de `lib/auth.ts`. Estaba en el sitio equivocado desde el
principio; diecisiete módulos —facturación, competidores, alias de marca,
auditoría web, recomendaciones— importaban del escaneo por eso y sólo por eso.

**El resultado medido.** De 26 ficheros externos quedan 5, y los cinco son
dependencias legítimas de dominio, no de capas: `MAX_REAL_SCAN_PROMPTS` (un
tope de escaneo que lee el alta de prompts), `EXTRACTION_VERSION` (una versión
de escaneo que lee la puntuación) y `ProjectActionError` en dos tests. Y lo que
importa de verdad: **`lib/llm/**` ya no importa nada de `lib/scan`**. La capa
de LLM no tiene por qué saber que existe un escaneo; el escaneo sí sabe que
llama a LLMs.

**`lib/domain/` no hace falta.** Se descarta como destino: cada símbolo tenía
un dueño natural, y un módulo llamado «domain» habría sido el sitio donde
acaban las cosas que nadie quiso clasificar.

**Lo que se conserva a propósito.** `EXTRACTION_CONCURRENCY` acota cuántas filas
procesa una pasada del escaneo, no cómo se comporta una llamada: es del escaneo
y se queda. `ProjectActionError` tiene vocabulario de escaneo
(`active_run_exists`, `scan_failed`, `no_engines_enabled`) y diez de sus doce
usuarios están en `lib/scan/`: se queda. El barril `lib/scan/scan-runner.ts`
sigue reexportando los ocho símbolos movidos, para no cambiar su superficie
pública y no tocar `scan-runner.test.ts`.

**Sobre tocar ficheros de test.** Nueve de los 23 ficheros cambiados son tests,
y en todos el cambio es **la ruta de un import**: ni una aserción, ni un mock,
ni un caso. La regla de la fase —«si un slice necesita cambiar un test, es que
no era un refactor»— apunta a cambios de expectativa, y aquí no hay ninguno:
2.278 tests, los mismos de siempre. Dicho explícitamente porque la distinción
es fina y la próxima sesión merece saber dónde se puso la raya.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R6); §81 (el
primer trozo); §80 (el caso en el que el barril SÍ había que conservarlo, por
lo contrario: allí los tests mockeaban la ruta).

---

## 83. Auditoría web: catorce componentes salen de la página, y el compilador no era suficiente para demostrarlo (PRELAUNCH-HARDENING-1 Fase R7, primer trozo, 2026-08-14)

**Qué se decidió.** Los componentes de presentación de
`app/dashboard/projects/[projectId]/web-audit/page.tsx` se van a
`web-audit/_components/`, en seis módulos por tema:

| Módulo | Qué contiene |
|---|---|
| `format.tsx` | `formatDate` |
| `issue-rows.tsx` | `CHECK_META`, `SEVERITY_META`, `IssueRow`, `PassingRow`, `CheckDot` |
| `score-tiles.tsx` | `scoreColor`, `ScoreGauge`, `ScoreRing`, `MiniBar`, `SubScoreTile`, `LockedSubScoreTile` |
| `page-audit-row.tsx` | `PAGE_SKIP_LABELS`, `freshnessLabel`, `PageAuditRow` |
| `bot-access-card.tsx` | `BOT_ENGINE_LABELS`, `describeSitemap`, `BotAccessCard` |
| `trend-chart.tsx` | `TrendChartPoint`, `TrendPointMarker`, `TrendChart` |

La página pasa de **1.933 a 1.137 líneas**. Todos son componentes de servidor y
puros: reciben datos ya calculados y devuelven marcado.

### Lo que esta fase enseña, y no es la extracción

Las fases R anteriores se demostraban con los tests: 2.278 casos, ninguno
editado. **Aquí eso no demuestra nada** — la pantalla de Auditoría web no tiene
tests de render, así que el suite verde es compatible con haber roto el marcado
entero. Y `tsc` tampoco basta: compila igual de bien un componente al que le
falta una fila.

Así que la comprobación fue otra: **normalizar el fichero original y la suma de
los siete resultantes —quitando imports y comentarios— y comparar los
multiconjuntos de líneas**. Cero líneas sólo en el original, cero sólo en el
nuevo. Es lo más fuerte que se puede afirmar sin navegador, y deja al
`ux-pilot` la parte que sí necesita ojos.

**Esa comprobación encontró un fallo real que `tsc` y el lint dejaron pasar.**
Dos de los rangos que copié se solapaban, así que `TrendChartPoint` y
`TrendPointMarker` acabaron **duplicados** dentro de `bot-access-card.tsx`.
Compila —declaraciones sin usar en un módulo son legales—, pasa el lint, y
habría llegado a producción como código muerto en una zona que acabábamos de
tocar «para dejarla más limpia». La lección: en un refactor de UI, la prueba de
equivalencia es un paso propio, no un corolario de que el build pase.

**Lo que NO se ha tocado.** Ni una línea de marcado, ni una clase CSS, ni un
texto. El `WebAuditPage` sigue con ~1.070 líneas de orquestación de datos:
partirlo es otro trozo, y toca lógica, no presentación.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R7);
`.claude/rules/web-audit.md` (los invariantes de la zona, ninguno afectado:
esto no cambia qué se calcula ni qué se pinta).

---

## 84. Visión general dejaba de ser la excepción, y dos ficheros muertos se van (PRELAUNCH-HARDENING-1 Fases R7 y R8, 2026-08-14)

**Qué se decidió.**

1. **Visión general usa `requireActiveProject`** como las otras seis pantallas
   de proyecto, en vez de repetir a mano el `select` + `is_archived` +
   `notFound()`.
2. **`getLLMScanProviders` se importa de `lib/scan/providers.ts`**, que es donde
   vive, y el reexport de cortesía del ejecutor **se borra** porque ya no lo usa
   nadie.
3. **Se borran `lib/supabase/client.ts` (8 líneas) y `lib/types.ts` (29)**: cero
   importadores, comprobado por ruta de import y no por nombre.

**El detalle que importa del punto 1.** `requireActiveProject` **entra dentro
del `Promise.all` existente**, no delante. Es una promesa como las otras cuatro,
así que la Visión general sigue haciendo un solo viaje en paralelo — nada de
serializar una consulta más antes del lote, que sería deshacer parte de la Fase
V. De paso desaparece un `created_at` que la página seleccionaba y no leía
nadie.

**Por qué el punto 2 no es cosmético.** El único importador de
`getLLMScanProviders` fuera de `lib/scan/` era esa misma página, y lo cogía del
**ejecutor** — o sea que una pantalla arrastraba el grafo entero del ejecutor
(LLM, scoring, recomendaciones, notificaciones, auditoría) para pintar dos
nombres de motor en una línea. `providers.ts` existe desde SAMPLING-1
precisamente para eso, y su docblock decía «el ejecutor lo reexporta para no
tocar sitios de llamada»: era cierto y ya no hace falta.

### Dos cosas que el plan pedía y NO se han hecho, con motivo

- **«Unificar `setRecurringScans`/`setAutoWebAudit`»**: `setAutoWebAudit` **ya
  no existe** — lo retiró WEB-AUDIT-AUTO-SPLIT-1 cuando la migración 0031 jubiló
  su columna, y su sustituto es `setAutoAuditHalf`. Además, el comentario de
  `actions.ts` dice explícitamente que la forma de espejo entre las dos es
  **deliberada** («los interruptores viven uno al lado del otro en /debug y
  quien los lea no debería tener que aprender tres comportamientos»).
  Unificarlas sería contradecir una decisión escrita para cumplir una línea de
  un plan que se quedó vieja.
- **Partir `WebAuditPage`** (~1.070 líneas de orquestación de datos): toca
  lógica, no presentación, y no cabe en el mismo PR que la mudanza de §83.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R7, R8); §83 (la
mudanza de componentes); `lib/scan/providers.ts` (SAMPLING-1, por qué existe).

---

## 85. La analítica mide el efecto, no la causa (SEO-POS-1, S8, 2026-08-14)

**Qué se publica.** `/blog/como-medir-trafico-chatgpt-ga4`, cluster `medicion`.
Cubre el cluster de keywords nº 8 del plan ("medir tráfico desde ChatGPT en
GA4", canal «Asistente de IA»), el último hueco de la capa de medición.

**Por qué esta pieza es distinta de las siete anteriores de la cola.** Es la
primera cuyo contenido **no depende de nada nuestro**: todo lo que afirma es
sobre un producto de Google y sobre un estudio ajeno. En S5 y S6 el riesgo era
publicar de más —umbrales, pesos, mecánica— y las reglas que salieron de ahí
(§69, §75, §76) no aplican aquí. El riesgo cambia de sitio: **publicamos algo
que el lector va a ejecutar**, una expresión regular que le pedimos que pegue en
su propia propiedad de GA4. Prosa dentro de un MDX no la mira ningún
compilador, así que una expresión que no compile, o que no case con los
dominios que el propio artículo nombra dos párrafos más arriba, es un fallo que
se descubre en la cuenta del lector y no en la nuestra.
`lib/blog/ga4-chatgpt.test.ts` la **extrae del `CodeBlock`** —no la copia— y
comprueba que compila, que captura los seis asistentes que el texto nombra, que
**no** captura `google`/`bing` (recogerlos haría que el grupo personalizado se
comiera el canal orgánico entero: el consejo publicado sería activamente
dañino) y que todos los puntos van escapados.

**Lo que diferencia el artículo de las veinte guías de "cómo medir ChatGPT en
GA4" que ya existen.** Todas explican dónde está el canal nuevo. Ninguna dice
que el canal **se mueve sin que se mueva el tráfico**: la proporción de visitas
que trasladan el referente cambia sola con cada versión de una aplicación, así
que dos meses idénticos en tráfico real dan lecturas distintas. Es exactamente
la trampa de la «posición media» de §73 con otro disfraz —un número que varía
por motivos que no tienen que ver con lo que dice medir— y el artículo la
enseña con una figura de dos filas, declarada como aritmética de ejemplo, no
como medición.

**Y declara su techo, que es el argumento comercial honesto.** Una marca que
ChatGPT recomienda a diario ante gente que no hace clic, y una marca que no
sale nunca, producen el mismo informe de adquisición: cero. GA4 cuenta visitas;
no puede decir si saliste en la respuesta. Ese es el puente al producto y no
hace falta exagerarlo — es una limitación estructural, no un defecto de
configuración.

**Perplexity entra en el allow-list de `article-honesty.test.ts`, y es el
primero.** El test prohíbe nombrarlo en el cuerpo de un artículo desde S1,
cuando el borrador del plan estuvo a punto de titular una pieza con un motor
que no ejecutamos. Aquí el motivo es legítimo y estaba previsto por el propio
diseño del test: una de las tres conclusiones del artículo **es** que el canal
«Asistente de IA» no incluye Perplexity y sus visitas se quedan en Referencia.
Omitirlo sería esconderle al lector la mitad de la respuesta para proteger una
ambigüedad que el artículo no crea — la metadata no lo menciona (regla de
`.claude/rules/growth-content.md`) y el CTA nombra los tres motores que sí
ejecutamos, las dos cosas con test.

**Las cifras de terceros van con su denominador o no van.** Las tres del
`StatGrid` (28 % de visitas desde la web con referente, 6 % desde la aplicación
de escritorio, 71 % que acaban en Directo) son de un **único** estudio ajeno
sobre 41,2 millones de sesiones, y el artículo lo dice en el `source` de cada
`<Stat>`, en la prosa y en la nota de fuentes: lo utilizable es el orden de
magnitud, no el decimal. El mecanismo de debajo —el sistema operativo no
traslada el referente al abrir un enlace desde una aplicación nativa— no
depende del estudio y sí es verificable, y es lo que sostiene el argumento.

**Limitación del entorno, declarada.** El proxy de salida de los agentes
bloquea `support.google.com` y la mayoría de la cobertura del anuncio, así que
**ninguna de las afirmaciones sobre GA4 está verificada contra la fuente
primaria**: se triangularon con varias fuentes secundarias que coinciden entre
sí, consultadas el 2026-08-14, y el artículo publica esa fecha para que el
lector sepa de cuándo es. Misma limitación que ya se declaró con los precios de
Otterly (§66) y de Peec AI. Dos consecuencias asumidas: la lista de asistentes
que reconoce Google **no es pública** —lo dice el propio artículo, porque
cambia cómo hay que leer una caída del canal— y la fecha de despliegue amplio
(junio de 2026) se cuenta como "a lo largo de junio", no con un día concreto
que no se pudo confirmar.

**Lo que encontró el piloto, y que su propia tabla decía que estaba bien.** La
pasada dio `PILOT PASS` con `blog-como-medir-trafico-chatgpt-ga4` en ✅ a las
tres anchuras. Al abrir las capturas —que es lo que el Human Gate pide desde
§55 y lo que la tabla nunca sustituye— en 375 px **las dos figuras nuevas
estaban recortadas y les faltaba la última columna**: la de la Figura 1 es
"Dónde acaba", cuya última fila («Respuesta leída sin hacer clic» → *en ningún
sitio*) es literalmente la conclusión de la figura, y la de la Figura 2 es "Lo
que enseña el canal", que es todo el argumento. La **Figura 2 de
`metricas-geo-que-medir` llevaba dos días igual**, publicada en S6.

**La causa es una línea de CSS que hace lo correcto para otro contenido.**
`.art-frame` nace con `overflow: hidden`, que es lo que quieres para un
`ProductMock` o un SVG —recortar un degradado contra el radio del borde— y lo
peor posible para una tabla: lo que no cabe desaparece **sin dejar gesto que lo
recupere**. Es el fallo de `/docs/metodologia` del §77 otra vez, un nivel más
adentro, y el remedio ya existía a diez líneas de distancia: `.art-tablewrap`
resolvió exactamente esto para las tablas sueltas en la PR #306, deslizamiento
más pista *"Desliza para ver todas las columnas →"*. Lo que faltaba era que una
tabla **dentro de una figura** pudiera pedirlo: `<Figure wide>` (log §85).

**Por qué esto es un test y no una nota.** Se coló en dos PRs seguidos, y en
los dos el síntoma fue invisible: la página carga limpia, el piloto la marca ✅
porque no hay error que detectar, y la columna que falta suele ser justo la que
lleva la conclusión. `article-recipes.test.ts` recorre ahora todos los
artículos, detecta la fila separadora de una tabla de markdown dentro de un
`<Figure>` y exige `wide` — con su caso negativo, porque una guarda que no
puede fallar no es una guarda.

**Y lo que esto vuelve a decir del piloto**, tercera vez en el histórico
(§62, §77): **un `PILOT PASS` es la lista de lo que el piloto vio, no un juicio
sobre lo que se ve.** Una tabla recortada no es un fallo de carga. La única
defensa sigue siendo abrir las capturas — aquí las abrió el Director antes del
Human Gate, que es donde toca, en vez del fundador en su móvil.

**Segunda pasada de capturas, ahora en escritorio, dos cosas más.** El arreglo
de las figuras se verificó y de paso salieron los dos fallos que sólo se ven a
1280 px, los dos invisibles en móvil:

**1. La cadena que el lector tiene que copiar aparecía cortada, y en
escritorio sin nada que dijera que había más.** La expresión de fuente son ~200
caracteres sin espacios; `.art-code pre` desliza, pero la pista *"Desliza →"*
sólo existe bajo 640 px (PR #309, pensada para móvil). Así que en la anchura en
la que de verdad se configura un GA4, la cadena terminaba en
`…gemini.google.com|c` y nada indicaba que continuara. **No se puede copiar lo
que no se ve**, y esa cadena es el único entregable ejecutable del artículo.
`<CodeBlock wrap>` la ajusta en varias líneas visuales en vez de deslizarla —
para código de verdad partir una línea cambiaría lo que dice, pero esto es un
valor único, y **el salto blando no mete ningún `\n` en el portapapeles**, así
que se ve entera y se pega en una sola línea. Con la pista de deslizar apagada
cuando ajusta, porque ahí mentiría.

**2. La portada se leía como un bloque gris roto.** En el artículo la portada
va en una caja de **96 px de alto a todo el ancho** (`.blog-cover-compact`) con
`object-fit: cover`, o sea una tira de ~11,7:1 sobre una imagen de 4:1: se ve
la banda central, un tercio de la altura. La composición tenía las barras
apoyadas en una base a `y=244` con la más alta empezando en `y=76`, así que de
las tres barras la banda visible sólo cortaba **un rectángulo gris opaco sin
principio ni final** — y el gris pizarra, único color fuera de la familia
azul/cian del resto, remataba el efecto de "algo que no ha cargado" (§73, las
palabras del fundador). Recompuesta: rejilla y barras dentro de la banda
central (base a `y=202`, unidad de 12 px), y el gris a un azul apagado en
familia. La jerarquía —Directo mucho más alta que el canal de asistentes—
sobrevive al recorte, que era justo lo que la portada tenía que demostrar.

**La regla que sale de esto y que no estaba escrita en ninguna parte:** una
portada de artículo se juzga en la tira de 96 px, no en el lienzo de 1200×300
donde se dibuja. Las portadas de S5 y S6 sufren el mismo recorte —se comprobó
mirándolas— y sobreviven por suerte, porque toda su composición es del mismo
color y sin elementos que el corte convierta en un bloque plano.

**Y al verificar ese arreglo apareció el peor de todos: el test daba una
garantía falsa.** Al medir sobre el HTML del build qué texto se lleva el lector
al portapapeles, salió esto: **MDX se había comido todas las barras
invertidas**. El fichero decía `chatgpt\.com|claude\.ai|…` y lo que se
renderizaba era `chatgpt.com|claude.ai|…`, con **cada punto convertido en
comodín** — la expresión que el artículo le pide al lector que pegue en su
propiedad de GA4 marcaría también un `claudexai`. MDX trata el texto suelto de
un hijo JSX como texto con escapes; no hay aviso de ninguna clase.

Lo grave no es el fallo, que es un despiste de sintaxis. Lo grave es que
`ga4-chatgpt.test.ts` **lo aprobaba**, y con un test dedicado a exactamente
eso: tenía un caso llamado *"escapa los puntos, para que no actúen como
comodín"* que pasaba en verde mientras el lector recibía la versión sin
escapar. Leía el MDX del disco, o sea **el lado de antes de la transformación
que rompía el dato**. Un guardián que mira el lado equivocado de una
transformación no es un guardián: es una garantía falsa, y eso es peor que no
tener ninguna, porque apaga la sospecha.

El arreglo no es una comprobación más lista: **quita la transformación**. La
expresión vive en `lib/blog/ga4-source-regex.ts`, el MDX la renderiza como
expresión (`{GA4_AI_SOURCE_REGEX}`) y el test importa ese mismo valor, así que
ya no existen dos versiones que puedan diferir. Quedan tres casos nuevos: que
el artículo la renderice desde la constante y no vuelva a incrustar un literal
—la única forma de que el fallo vuelva—, que vaya en un bloque que ajusta, y el
caso negativo con el valor exacto que MDX producía, para probar que el detector
de escapado distingue de verdad.

**La lección, que es más general que este artículo:** cuando lo publicado pasa
por una transformación (MDX, un compilador, un serializador), el test tiene que
mirar **el lado de después**, o eliminar la transformación. Aquí se eligió lo
segundo, que es lo único que no depende de acordarse.

**Y un hallazgo del check-in previo al Human Gate: la numeración de este
documento estaba rota, siete veces.** Esta entrada nació como §78 mientras
PRELAUNCH-HARDENING-1 R5/R6 mergeaba §78 a §82 en `main`. Las dos ramas eran
correctas por separado —cada una calculó `max + 1` sobre su propia base, que
envejece en cuanto la otra mergea— y **git no para nada**: los dos bloques son
apéndices adyacentes al final del mismo fichero, así que se mezclan sin un solo
marcador de conflicto y el resultado tiene dos §78 sin que chille nadie. Se
cogió comprobando la mergeabilidad a mano; a mano no es un mecanismo.

Al escribir el guardián (`tests/log-numbering.test.ts`, calcado de
`adr-numbering.test.ts`, que resolvió esto mismo para `docs/adr/`) resultó que
**ya había siete colisiones en `main`**: §33, §36, §39, §54, §55, §65 y §70,
desde principios de agosto, una cada pocos días. Dos de ellas son visibles
desde el mapa de zonas de CLAUDE.md, que apunta a «log §54» desde dos filas
distintas y a dos secciones distintas — o sea que la referencia ya no resuelve
en el documento que la siguiente sesión lee primero.

Esta entrada pasa a **§85**, con todas sus referencias. Las siete heredadas
quedan **congeladas como deuda declarada**, no arregladas aquí: renumerar una
sección ya mergeada rompe las referencias publicadas que la apuntan —el coste
que `adr-numbering.test.ts` documenta haber pagado con `0026`— y siete
secciones merecen su propia pasada deliberada, no ir de propina en un PR de
contenido donde nadie las revisaría. La lista sólo puede encoger y su línea
base está fijada literalmente, como `COVER_DEBT`.

**Y volvió a pasar cuarenta minutos después, en este mismo PR.** Esta entrada
era §78, pasó a §83 al fusionar R5/R6 — y R7/R8 reclamó §83 y §84 antes de que
esta rama llegara al Human Gate, así que acabó en **§85**, con dos merges y dos
renumerados en dos horas. La segunda vez sí produjo conflicto de git, porque
los dos bloques cayeron exactamente en el mismo punto; la primera no, que es el
caso peligroso.

Eso deja claro el **límite del guardián, que su propio comentario ya declara**:
sólo ve una rama, así que no puede impedir que dos ramas corran a por el mismo
número libre — sólo garantiza que la que mergee segunda se entere. Con varias
sesiones agénticas mergeando el mismo día, un número al final del fichero es
estructuralmente una carrera, y la única solución que la ganaría de verdad es
no numerar al escribir: un identificador estable (fecha + slug) o asignar el
número al mergear. **No se hace aquí** — cambia el esquema de referencia de
todo el histórico y de las decenas de `log §NN` repartidas por el repositorio,
así que es su propia fase. Queda escrito para que la siguiente sesión que se
tropiece no vuelva a diagnosticarlo desde cero.

**Y un apunte de herramienta, porque me equivoqué tres veces con él.** Para
saber si una rama conflictúa con `main` usé
`git merge-tree $(git merge-base …) HEAD origin/main | grep -c "^<<<<<<<"`.
Devolvió **0 las tres veces, y las tres se equivocó**: el formato antiguo de
`merge-tree` no emite marcadores de conflicto, así que ese `grep` no puede
encontrarlos nunca — un cero ahí no significa "no hay conflicto", significa
"esta comprobación no mide lo que crees". Con ella se le dijo al fundador "sin
conflictos" dos veces sobre ramas que sí lo tenían. Lo fiable es **intentar el
merge** (`git merge --no-commit --no-ff`, y `git merge --abort` si no
interesaba) o mirar `mergeable_state` en la API de GitHub, que acertó las tres.
Es la misma forma del fallo que este PR persigue en el artículo y en el test de
la expresión regular: **un indicador que parece verificar algo y mira otra
cosa** — con la agravante de que aquí el falso negativo era silencioso y salía
en verde.

**Arreglo encontrado de camino.** La fecha del pilar `medicion` en el sitemap
seguía en el 2026-08-03: S6 publicó `metricas-geo-que-medir` sin tocarla,
aunque la página pilar lista los artículos de su cluster y por tanto cambió de
verdad ese día. Corregida al 2026-08-14. Es el mismo rancio que T15 vino a
arreglar, reaparecido por el sitio de siempre — una fecha manual que nadie
recuerda que existe hasta que alguien la mira.

---

## 86. La única pantalla de Genscore que no parecía de Genscore (NOT-FOUND-ROCKET-1, 2026-08-12)

**Qué pasaba.** La 404 pública (`app/not-found.tsx`, SEO-POS-1 T7) era correcta
y fea: un `<h1>` y tres listas de enlaces heredadas de `BlogPageShell`, sin
jerarquía, sin aire y con los títulos de los clusters pegados a sus
descripciones. Cumplía su trabajo técnico —devolvía 404, llevaba `noindex,
follow`, enlazaba a lo publicado— y ese es justo el motivo por el que llevaba
meses así: nada estaba roto. Lo reportó el fundador desde un móvil.

**Qué se decidió.** Se plantearon tres maquetas completas y navegables (no
bocetos), las tres en `docs/design-reference/not-found-rocket-1/concepts.html`:
«Fuera de trayectoria» (el cohete del primer escaneo, oscura), «Sin resultados
que citar» (la URL fallida como consulta y la navegación como lista de fuentes
citables) y «Falta un segmento» (el anillo del logo con un segmento apagado,
tipográfica). El fundador eligió la primera. Las otras dos se conservan en el
mismo fichero: son el registro de qué se consideró, igual que un ADR superado
no se borra.

**La cabecera es blanca.** Instrucción explícita del fundador: la cabecera del
sitio no cambia por estar en un 404. Eso obliga a un corte duro entre la nav
blanca y el cuerpo oscuro, y obliga a algo menos evidente — `.lp-nav-wrap` es
translúcida con `backdrop-filter`, así que sobre un cuerpo oscuro y con scroll
dejaba ver el oscuro a través. En esta ruta, y sólo en esta, es opaca.

**Por qué la escena no está centrada bajo el texto.** La primera versión puso
el copy centrado sobre una escena a sangre y el cohete le pasaba por detrás del
titular. No es un problema de capas: en una pantalla panorámica quedan ~170 px
libres por encima del bloque de texto, y no caben un titular y una nave en el
mismo eje. La composición final reparte por ejes — misión a la derecha y texto
a la izquierda en horizontal; misión arriba y texto abajo en vertical, donde
además se encoge, sube y pierde los dos tramos bajos de la estela, que cruzaban
el titular. La escena sigue ocupando toda la pantalla, que era la petición.

**Lo que se descubrió por el camino, y que no era el encargo.**
`app/not-found.tsx` es el `not-found` **raíz** y no había ningún otro en el
repo, así que recogía también los `notFound()` de la consola:
`lib/project-workspace.ts` (que convierte las seis pantallas de un proyecto
inexistente en un 404), la página de proyecto y la de un run. Ya antes de esta
fase eso le enseñaba la cabecera de marketing a alguien con la sesión abierta;
con el cohete a pantalla completa y un «Prueba gratis» pasaba de raro a
absurdo. De ahí `app/dashboard/not-found.tsx`, deliberadamente sobrio y
renderizado dentro del layout de la consola, con el menú lateral intacto.

**Lo que no se hizo, y por qué.** No se tocó `BlogPageShell`. Encierra su
contenido en `.lp-inner` (max-width 1180 px), que es exactamente lo que impide
una escena a sangre, y lo comparten blog, legales y pricing: ampliarlo por una
pantalla habría puesto tres superficies en riesgo. La 404 lleva su propio
shell, siguiendo el precedente ya escrito en el repo (`blog-page-shell.tsx` es
a su vez copia deliberada de `legal-page-shell.tsx`). **La deuda, declarada:
son tres copias de la misma barra de navegación. Si aparece una cuarta, toca
extraerla.** El nuevo shell se registró en `marketing-content-links.test.ts`,
que es lo que impide que una superficie con pie público se olvide de las cuatro
capas de contenido.

**El aviso de los dos cohetes.** A petición del fundador, `.claude/rules/
mission-rocket.md` cubre a la vez `components/scan-mission-rocket.tsx`,
`lib/scan/mission-beats.ts` y `components/not-found-mission.tsx`: toques el que
toques, la regla se inyecta sola y recuerda que hay otro. No comparten código a
propósito —el del escaneo está atado al estado de un run real y el de la 404 es
estático y sin datos—, y esa separación es exactamente lo que hace necesario el
aviso. El invariante duro: en el escaneo el movimiento codifica progreso real;
en la 404 no puede haber ni barra, ni anillo, ni contador, porque no habría
nada verdadero que contar.

**El pie era ilegible y lo vio el fundador antes que nadie.** `.nf-page`
pintaba de oscuro el contenedor entero para que el sobre-scroll no enseñara
blanco, y el pie de marketing vive dentro de ese contenedor sin fondo propio:
quedaba con su texto en tinta sobre fondo oscuro. Ahora sólo la ventana de la
misión es oscura y la página sigue siendo blanca, que es lo que deja el pie
exactamente igual que en el resto del sitio (fundador, 2026-08-12).

**El harness no podía pilotar una 404, y eso no era culpa de la pantalla.**
`visitAsUser` marca como fallo cualquier respuesta ≥400 de primera parte, así
que el piloto reportaba `first-party requests failed` por el único
comportamiento que una página de error está obligada a tener: responder 404.
Se añadió `VisitOptions.expectDocumentStatus`, deliberadamente estrecho —exime
**una** respuesta, la del documento de la ruta visitada, y sólo con el código
declarado. Un 500 en esa ruta, o un 404 de un subrecurso (un CSS que no carga,
una imagen rota) siguen tumbando la pasada. Tampoco debilita la garantía de que
la ruta responde 404: eso lo asevera su propio test con `page.request.get`,
aparte. Sin este cambio ninguna página de error del producto podría pilotarse
jamás, hoy ni en el futuro.

**Dos metas `robots`, y las dos legítimas.** La primera pasada del piloto falló
en las tres anchuras por una aserción propia: `meta[name="robots"]` resuelve a
**dos** elementos en esta página. Next añade la suya (`noindex`) a toda página
`not-found` y `app/not-found.tsx` declara la nuestra (`noindex, follow`) desde
SEO-POS-1 (T7). Es preexistente, no lo introdujo esta fase, y no se corrigió
retirando ninguna: no se contradicen —ninguna dice `nofollow`, así que el
resultado efectivo es `noindex, follow`—, quitar la nuestra sería un cambio de
SEO ajeno a este PR y la de Next no está en nuestra mano. Lo que sí cambió es
la aserción: en vez de mirar la primera meta, comprueba que **ninguna** de las
que haya deje la página indexable. Con `.first()` el test habría pasado aunque
una segunda dijera `index`.

**Y una lección de orden, no de contenido.** `public-pages.spec.ts` corre en
modo `serial`, así que aquel fallo de cabeceras se llevó por delante el test
que pinta la pantalla: la 404 no apareció en la tabla del piloto **en ninguna
anchura**. Un `PILOT FAIL` por una aserción trivial dejó la pantalla del PR sin
mirar. El test que produce las capturas va ahora primero, para que un fallo de
detalle no borre la evidencia visual.

**Dos mejoras plegadas después de mirar las capturas, no de leer la tabla.**
El piloto dio `PILOT PASS` con la 404 en verde en las tres anchuras, y aun así
la pantalla tenía dos defectos que ninguna checklist detecta porque ninguna
mide "se entiende": en horizontal la estela sólida terminaba *dentro* del
lienzo y su extremo se veía flotando a media pantalla, como si el rastro
empezara de la nada; en vertical, ocultar los dos tramos de abajo dejaba un
fragmento corto y desconectado bajo el cohete. Ahora el primer tramo arranca
fuera del lienzo (`y=796` con el lienzo a 760) y en vertical sólo desaparece el
de más abajo. Es el motivo por el que un PASS no cierra la fase: la tabla dice
que la página cargó, no que se lea.

**El 404 de la consola, segunda versión: sobrio no es descuidado.** La primera
reutilizaba `EmptyState` —borde discontinuo— con un botón suelto debajo y el
resto de la pantalla en blanco. El fundador la probó y fue directo: «parece un
botón mal maquetado» (2026-08-13). Tenía razón, y el fallo era de lenguaje: el
borde discontinuo de `EmptyState` significa *contenido que todavía no está*
(«aún no has escaneado», «no hay competidores»), y aquí no falta contenido —
la ruta no existe. Ahora es un bloque centrado en el área de contenido, con las
piezas de la propia consola (`.btn`, `Icon`, los tokens de tinta) y **sin
caja**: en una pantalla por lo demás vacía, una caja alrededor de un mensaje
corto es justamente lo que lo hacía parecer un widget a medio maquetar. De
paso se corrigió una incoherencia entre etiqueta y destino: el botón decía
«Volver a mis dominios» y apuntaba a `/dashboard`, que redirige al proyecto más
reciente, no a la lista. Ahora son dos salidas y cada una dice a dónde va.

**El 404 de la consola pasa a estar pilotado.** Se dijo que quedaba para una
fase futura, y duró lo que tardó el fundador en encontrar el defecto que el
piloto no podía ver. El journey vive en `core-flow.spec.ts` y no en
`public-pages.spec.ts` porque necesita sesión: sin ella `requireUser()` redirige
a /login y no se ve nada. Visita un id de proyecto inexistente y comprueba las
tres cosas que importan — que sale la pantalla sobria, que **no** sale la de
marketing (`.nf-scene` a cero, ningún «Prueba gratis») y que el menú lateral
sigue alrededor para poder salir. Sigue siendo de lectura pura: navega a una
URL y mira. Lo que un humano tuvo que cazar una vez, lo mira una máquina a
partir de ahora.

**El piloto pasó y aun así no publicó nada.** La pasada de `f1d5451` corrió los
172 tests, imprimió `Verdict: PILOT PASS` y el job murió en el minuto 20:
`timeout-minutes: 20` en `ux-pilot.yml` contra 19,3 min de tests. El check quedó
en `cancelled`, sin comentario y sin evidencia subida — y a efectos del Human
Gate **un piloto que no publica es un piloto que no ha corrido**, aunque el
veredicto exista dentro del log. El margen llevaba tiempo siendo mínimo y los
tres tests nuevos de esta fase (×3 anchuras, ~55 s) lo agotaron. Se sube a 30 en
el mismo PR que lo agotó, en vez de dejar la trampa armada para el siguiente que
añada un journey. Lo que **no** se arregló, y queda anotado: nada avisa cuando
la pasada se acerca al tope; el aviso es que un día no publique.

**«Ver mis dominios» apuntaba a la pantalla equivocada, y lo cazó el fundador
probando el preview, no el piloto.** El botón llevaba a `/dashboard/projects`
—la pantalla de archivar/restaurar de antes de DOMAINS-REDESIGN-1— en vez de a
`/dashboard/domains`, la puerta de entrada real de la consola desde esa fase.
El test del piloto sólo comprobaba que el primer enlace del bloque fuera
visible, nunca a dónde apuntaba, así que una etiqueta correcta con un destino
equivocado le pasó por delante sin que nada lo marcara. Corregido el enlace y
reforzado el test: ahora asevera el `href` de «Ver mis dominios» por su nombre
accesible, no por posición. La lección, otra vez: un checklist que sólo mira
"¿está ahí?" no ve "¿lleva a donde dice?".

**Lo que queda sin cubrir, dicho en voz alta.** El repo no tiene
testing-library ni un solo `.test.tsx`, así que esta pantalla **no tiene test
unitario y no puede tenerlo hoy**. *(La segunda mitad de esa frase queda
`superseded por §87`, del mismo día: sí se puede, con `renderToStaticMarkup` y
sin testing-library — `react-dom` ya estaba. Lo que sigue siendo cierto es que
esta pantalla en concreto no lo tiene.)* La verificación real es el `ux-pilot`
(`tests/pilot/journeys/public-pages.spec.ts`), que comprueba el 404 real, el
`noindex`, y que lo que se pinta es la escena y no un placeholder — anclado a
`.nf-scene` y al titular, no a "la página cargó". El 404 de dentro de la consola sí acabó
cubierto, en `core-flow.spec.ts` — ver arriba.

---

## 87. Auditoría web deja de ser una pantalla que nadie puede demostrar (PRELAUNCH-HARDENING-1, 2026-08-14)

**Qué se decidió.** Los seis módulos de
`web-audit/_components/` pasan a tener tests de render de verdad: **46 casos
nuevos**, de 2.278 a 2.324. Son los primeros tests de render del repositorio.

**Por qué justo aquí.** §83 movió catorce componentes de esa pantalla y los
2.278 tests pasaron en verde **sin que ni uno mirase el marcado**, porque no
existía ninguno que lo hiciera. Lo único que demostró la equivalencia fue una
comparación de líneas hecha a mano, que no se ejecuta en CI y no protege al
cambio siguiente. Una pantalla que sólo se puede verificar mirando capturas es
una pantalla que se rompe entre pasada y pasada del piloto.

### Cero dependencias nuevas, y por qué era posible

`renderToStaticMarkup` viene con `react-dom`, que ya estaba, y no toca el DOM —
así que `environment: "node"` sigue valiendo y no hacen falta jsdom ni una
biblioteca de testing. Lo único que cambia en la configuración es que
`vitest.config.ts` ahora incluye `**/*.test.tsx`.

Que esto sea posible es **consecuencia directa de §83**: los componentes son
puros y síncronos precisamente porque se extrajeron. Dentro de un `page.tsx`
asíncrono de 1.933 líneas no había forma de llamarlos.

### Qué aseguran y qué no

Aseguran **contenido**: que el número que sale es el que entra, que el alcance
se pluraliza, que un dato ausente se ve como ausente. **No aseguran aspecto** —
eso sigue siendo del `ux-pilot`, y los dos juntos son la cobertura. Un test que
fijara clases CSS convertiría cualquier retoque visual en un test rojo sin
proteger nada.

### Lo que cubren y no estaba cubierto

- **El fallo de producción del 2026-07-12.** `page-checks.ts` avisa en un
  comentario de que una fila anterior a WEB-AUDIT-R3 no tiene `indexability` y
  de que leerla sin comprobar «took the whole page down». Ese aviso vivía en
  prosa, que es el sitio exacto donde una advertencia no se ejecuta. Ahora hay
  un test que renderiza esa fila antigua, y quitando la guarda se pone rojo.
- **`TrendChart`, el componente que nadie ha visto nunca.** No aparece en
  ninguna de las 22 capturas del piloto de la PR #404: el gráfico necesita
  historial y la cuenta del piloto tiene una sola auditoría. Se movió de
  fichero sin que lo mirara ni un test ni un ojo. Estos tests son lo único que
  lo mira.
- **«No lo hemos podido comprobar» ≠ «no existe»** (`describeSitemap`), que es
  el invariante «ningún número de relleno» aplicado a una etiqueta.
- **`LockedSubScoreTile`**: que un plan sin cobertura no se lea como «todavía
  no auditado» — una afirmación falsa sobre la cuenta del cliente
  (WEB-AUDIT-TECH-ALL-PLANS-1).

### Los tests se probaron rotos antes de darlos por buenos

Un test que no puede fallar no es cobertura, es decoración. Tres mutaciones
deliberadas, cada una en rojo la que le tocaba: quitar la pluralización, quitar
la guarda de `indexability`, y una aserción mía mal escrita (`min-width:0`
contiene la subcadena `width:`) que el propio arnés destapó en la primera
pasada.

**Pendiente.** Los tests cubren los componentes, no `WebAuditPage` — que sigue
con ~1.070 líneas de orquestación de datos sin cubrir. Partirlo era lo que
quedaba de R7 y ahora tiene, por fin, algo debajo que lo sostenga.

**Trazabilidad.** §83 (la mudanza que dejó el hueco al descubierto); el informe
de Task Intake de R3 (2026-08-14), donde esto se recomendó en lugar de los
tipos generados de Supabase; `.claude/rules/web-audit.md`. Y **§86**, que el
mismo día afirmó que «el repo no tiene testing-library ni un solo `.test.tsx`,
así que esta pantalla no tiene test unitario **y no puede tenerlo hoy**»: la
segunda mitad de esa frase queda superseded aquí — sin testing-library también
se puede, porque `renderToStaticMarkup` no la necesita. Las dos ramas se
escribieron a la vez y se cruzaron al mergear; se deja anotado en ambas en vez
de reescribir la de allí.

---

## 88. Tres trabajos que el fundador descarta, escritos para que no resuciten (2026-08-15)

**Qué se decidió.** El fundador descarta tres cosas. Se registran aquí porque
**dos de ellas no vivían en ningún documento**: eran peticiones suyas en
conversación, y una petición que sólo existe en un chat vuelve a aparecer sola
en la siguiente sesión que lea el histórico.

1. **P1 · UX-PILOT-4, el journey de alta completa.** Necesitaba su propia
   aprobación de excepción de escritura del piloto y no la tendrá. Anotado
   también en `docs/prelaunch-hardening-plan.md` §Fase P.
2. **El rediseño de la arquitectura del blog.** El fundador lo pidió el
   2026-08-14 —*«hay que revisar la arquitectura y diseño del blog. Ahora mismo
   es demasiado plano y sin ningún tipo de jerarquía de info ni organización»*—
   y lo retira el 15.
3. **Los estados del gráfico de panorámica competitiva.** Pedido el mismo día
   —*«sí merece la pena revisar ese gráfico en sus diferentes estados en un
   artefacto»*— y retirado igual.

**La consecuencia del primero, dicha en voz alta.** Sin P1, **el flujo de alta
completo (registro → dominio nuevo → primer escaneo → Overview con datos) sigue
sin recorrerlo ningún test automatizado de principio a fin**. Es el riesgo #3
del diagnóstico de PRELAUNCH-HARDENING-1 y se queda abierto **a propósito**, no
por olvido. Lo que sí lo cubre en parte es Q1 (`createProjectCore` y sus tests):
la lógica de creación, no el recorrido por navegador.

**Lo que NO cambia.** Los invariantes de la panorámica siguen vigentes tal cual
en `.claude/rules/competitors.md` (§36, PANORAMA-EMPTY-1): descartar el
rediseño no descarta las reglas de sus cuatro estados. Y el blog sigue con su
estrategia de contenido intacta; lo retirado es sólo repensar su jerarquía
visual.

---

## 89. El alta de un dominio no tenía tests porque no podía tenerlos (PRELAUNCH-HARDENING-1 Fase Q1, 2026-08-15)

**Qué se decidió.** `createProject` se parte en `createProjectCore`
(`lib/projects/create-project.ts`) + una action que sólo traduce. **18 tests
nuevos**, de 2.383 a 2.401.

**Por qué importaba más que cualquier fichero largo.** Son ~210 líneas que
ejecutan el Core Target Flow entero —dominio → competidores sugeridos → prompts
sugeridos → primer escaneo— y no tenían **ni una sola aserción**. Es lo que hace
un cliente nuevo en su primer minuto. Deuda anotada en ADR 0022 y riesgo #8 del
plan.

### El hallazgo: no era descuido, era imposible

Todo el control de flujo de esa función eran `redirect()`, y en Next `redirect`
**lanza**. No había desenlace observable: no se podía comprobar «¿qué pasa si el
dominio ya existe archivado?» sin un navegador. Un test que sólo puede afirmar
«lanzó algo» no es un test.

Por eso lo que cambia **no es la lógica sino cómo se comunica el desenlace**: el
núcleo devuelve un resultado discriminado y la action lo traduce a
`revalidatePath` + `redirect`. La traducción es **una tabla** —una variante, una
redirección, en el mismo orden de comprobación que antes—, y eso es lo que hace
verificable que la extracción no cambió comportamiento: aquí no había tests
previos que lo demostraran, así que la correspondencia tenía que ser legible a
ojo.

### Lo que los tests fijan, y por qué esas cosas

No son tests de cobertura, son las decisiones que un cliente nota:

- **Una consulta de duplicados que falla no significa «no hay duplicado»** —
  tratarla así crearía el segundo proyecto del mismo dominio.
- **Un dominio archivado se distingue de uno activo**: son dos mensajes
  distintos porque son dos situaciones distintas.
- **Sin prompts no se pide un escaneo.** Pedirlo crearía una fila condenada, y
  decir «escaneo iniciado» sería un escaneo falso (CLAUDE.md).
- **Un 429 en la mitad de competidores no tumba el alta ni la otra mitad** — el
  fallo real del 2026-08-09, una llamada caída y la otra no.
- **Sin perfil de negocio no se sugiere nada**, nunca el modo ciego por dominio
  que ADR 0020 eliminó.
- **Un fallo al derivar alias de marca no bloquea el alta**
  (GEO-SCORE-BRAND-IDENTITY-1).

### Una dirección de fallo que estaba y ahora está fijada

Si el conteo de proyectos activos falla, **se deja pasar el alta**. Negarle el
alta a alguien por un error transitorio nuestro es peor que aceptar un proyecto
de más. Ya era el comportamiento del código; ahora hay un test que impide
invertirlo sin querer.

**Los tests se probaron rotos.** Tres mutaciones del núcleo —tratar el fallo de
búsqueda como «no hay duplicado», crear escaneo sin prompts, y confundir
archivado con activo—, cada una tumbó exactamente su test.

**`VERCEL_ENV` no entra en el núcleo.** Los defaults baratos de preview siguen
decidiéndose en la action y llegan como `extraProjectColumns`, así que el
núcleo escribe lo que le pasan y nada por su cuenta. Hay un test para eso: es
la variable que el fundador fue explícito en que no debe tocar producción
(2026-08-11).

**Lo que sigue sin cubrir.** Esto testea la **lógica** del alta, no el recorrido
por navegador. El flujo de principio a fin —registro incluido— sigue sin test
E2E, y con P1 descartado (§88) se queda así a propósito.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase Q (Q1); ADR 0022;
`.claude/rules/server-actions.md`; §88 (el descarte de P1 y su consecuencia).

---

## 90. Las cuatro rutas que sostienen el escaneo recurrente no tenían quién vigilara su cableado (PRELAUNCH-HARDENING-1 Fase Q3, 2026-08-15)

**Qué se decidió.** Tests de ruta para `cron/weekly-scans`,
`cron/weekly-digest`, `cron/sweep-continue` y `scan/continue`. **28 tests
nuevos**, de 2.401 a 2.429.

**Por qué el cableado y no la lógica.** La lógica de dentro —`runDailyCronScan`,
`runWeeklyDigest`, `executePendingScan`— ya estaba testeada, y
`isAuthorizedInternalRequest` también. Lo que no tenía detector era la costura:
**que la ruta llame de verdad a la comprobación, que lea SU variable y no otra,
y que el interruptor apague de verdad**. Una regresión ahí no falla
ruidosamente — apaga el escaneo recurrente y en producción no se nota hasta
días después, cuando alguien pregunta por qué su puntuación no se mueve.

### Lo que se fija, y por qué cada cosa

- **Fail-closed sin secreto configurado.** Sin `CRON_SECRET` no entra nadie, ni
  siquiera quien no manda cabecera. Una ruta que se abre sola cuando falta su
  variable es una ruta abierta el día que alguien despliega sin ella.
- **Cruce de secretos.** `SCAN_CONTINUE_SECRET` no abre los crons y `CRON_SECRET`
  no abre las continuaciones. Son dos variables distintas a propósito y
  confundirlas es una regresión silenciosa: seguiría funcionando en local, donde
  suelen estar las dos.
- **Un interruptor ausente cuenta como apagado.** La comparación es `=== "true"`,
  así que una variable sin definir o con `"TRUE"` cae en apagado — la dirección
  de fallo correcta para algo que gasta LLM.
- **El interruptor del resumen semanal es independiente del de los escaneos.**
  Ese endpoint **escribe a clientes**; encender los escaneos no puede encender
  los correos.
- **Apagar el cron detiene también una cadena ya en vuelo** — un apagado que no
  apaga lo que ya está corriendo no es un apagado.
- **El tope de la cadena se rechaza, no se recorta**, y sigue al cap configurado
  en vez de a un número fijo. Un `chainIndex` fuera de rango es un error de
  cableado o una petición manipulada; recortarlo lo escondería.
- **Ningún error crudo de Postgres llega a la respuesta**, en las cuatro.

### Una rareza que los tests ahora explican en vez de esconder

`scan/continue` responde **200 con `ok:false`** cuando el lote falla, no 500. Es
deliberado: el estado del fallo ya lo persiste `executePendingScan` sobre el
propio run, que es donde lo miran el usuario y el reconciliador. Un 500
invitaría a que quien despacha reintentara, y reintentar un lote que ya falló y
ya quedó registrado es gastar llamadas a LLM por nada. Estaba en un comentario;
ahora hay un test que lo sostiene.

**Los tests se probaron rotos.** Tres mutaciones: romper el interruptor de los
escaneos (2 rojos), quitar el tope de la cadena (2 rojos), y hacer que
`scan/continue` leyera `CRON_SECRET` en vez del suyo (4 rojos).

**Lo que sigue sin cubrir.** Esto prueba el cableado de cada ruta por separado,
no que Vercel las llame con la cadencia de `vercel.json`. Esa parte sigue siendo
configuración, no código, y ningún test de este repo puede verla.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase Q (Q3); ADR 0014
(cadena de lotes) y ADR 0016 (cadena del barrido); §89 (Q1).

---
---

## 91. Una marca escrita de dos formas es ruido que ponemos nosotros (SEO-POS-1 Fase E, E1, 2026-08-13)

**Origen.** El fundador pidió un plan de entidad tras ver que "GenScore" compite
en buscadores con varios homónimos públicos —un GenScore de bioinformática,
otro de salud mental, otro de trust scoring B2B, y Genscore Navarra—. El censo
previo destapó algo más barato de arreglar y más urgente que cualquier página
nueva: **el repositorio usaba las cuatro grafías a la vez.**

| | Grafía A | Grafía B |
|---|---|---|
| Marca | `Genscore` — 179 | `GenScore` — 114 |
| Métrica | `GEO Score` — 99 | `GeoScore` — 53 |

Ninguna de las dos inconsistencias rompía nada, y por eso llevaban meses ahí.
Peor: `.claude/rules/growth-content.md` decía *"el nombre público es
**Genscore**"* mientras `CLAUDE.md` decía `GenScore`, así que la regla que una
sesión futura leería antes de escribir apuntaba a la grafía que el fundador
acabó descartando.

**Decisiones (fundador, 2026-08-13).** Marca `GenScore`, métrica `GEO Score`,
disciplina `GEO`.

`GeoScore` se descartó por un motivo concreto y no por gusto: *geo* se lee como
geografía —el significado dominante de esa raíz— y mete a la métrica a competir
con geolocalización. En mayúsculas es un acrónimo, y refuerza la categoría que
el resto del plan intenta ganar.

**Lo que NO se tocó, y por qué.** URLs y slugs (`/glosario/geo-score`,
`/comparativas/genscore-vs-otterly`), el dominio `genscore.es`, y los
identificadores de código. Cambiar una URL ya indexada por coherencia
tipográfica es tirar a la basura el histórico de Search Console de esa página,
y renombrar identificadores no aporta nada a la resolución de la entidad.

**El error que costó la primera pasada, porque es la lección reutilizable.** El
censo se hizo con `\bGeoScore\b` —delimitadores de palabra— y confirmó que
sólo había prosa. El reemplazo se aplicó **sin** ellos. Resultado:
`availableGeoScoreComponents` se convirtió en `availableGEO ScoreComponents`,
la build dejó de compilar y 45 tests del ejecutor de escaneo cayeron de golpe
con un error de mocking que no se parecía en nada a la causa. Verificar con una
expresión y aplicar con otra es exactamente el tipo de discrepancia que no se
ve al leer el diff. Se revirtió entero y se rehizo con `\b`.

**Guardián: `lib/brand/naming.test.ts`.** Tres comprobaciones —ningún
`Genscore`, ningún `GeoScore`, ningún identificador partido por un reemplazo
sin `\b`— verificadas fallando en las tres direcciones antes de fiarse de
ellas. Dos detalles que costaron una iteración cada uno:

- **Se excluye a sí mismo.** El fichero cita las grafías retiradas en su propia
  explicación; sin la exclusión, la única forma de dejarlo verde sería borrar
  el motivo por el que existe.
- **Barre por directorios, no por globs.** La primera versión pasaba
  `app/**/*.ts` como pathspec de `git grep` y no cubría lo que parecía cubrir.
  Se descubrió porque el conteo del test no cuadraba con un `grep` a mano —
  un guardián que barre menos de lo que dice es peor que ninguno, porque
  además da el hueco por cubierto.

**Nota operativa:** `git grep` sólo ve ficheros versionados, así que este test
puede pasar en local sobre un fichero recién creado y fallar en cuanto se hace
`git add`. Es aceptable —nada llega a un PR sin versionar— pero conviene
saberlo antes de perseguir un falso verde.

## 93. El único módulo cuyo fallo no se puede deshacer ya tiene tests (PRELAUNCH-HARDENING-1 Fase Q2, 2026-08-15)

**Qué se decidió.** `lib/email/transactional.ts` —765 líneas, trece funciones de
envío, **cero tests**— pasa a tener 19. De 2.443 a 2.462.

**Por qué éste antes que los demás huecos.** Un despliegue malo se revierte; un
correo enviado, no. Es el único módulo del repositorio cuyo fallo **aterriza en
la bandeja de un cliente** y no hay forma de recogerlo.

### Qué se fija, y qué NO

Se fija **a quién va cada cosa**, **cuándo no se manda nada**, y que **nada de
esto pueda tumbar el flujo al que va enganchado**.

**No se fija el maquetado**, a propósito: el HTML de un correo se retoca a
menudo y clavarlo en un test sólo produce rojos que nadie lee — la variante
email del mismo razonamiento de §87 sobre no fijar clases CSS. Del cuerpo se
comprueba lo que sí sería un fallo: que el dato prometido esté, y que lo que
viene de fuera vaya escapado.

### El invariante caro

`.claude/rules/scan.md` ya lo decía —«las alertas de operador nunca van al
cliente»— y hasta hoy no lo comprobaba nadie. Las cuatro alertas de operador
tienen ahora su test de destinatario, y una de ellas merece mención aparte:
**`sendNewSignupOpsAlertEmail` RECIBE la dirección del cliente como dato del
cuerpo**. Confundir ese dato con el destinatario le mandaría al recién
registrado un aviso interno sobre sí mismo. Hay un test que separa las dos
cosas explícitamente.

Y sin `OPS_ALERT_EMAIL` **no se manda a nadie**: caer al cliente «para que no se
pierda» sería exactamente el fallo que la regla prohíbe.

### Una regresión de 2026-08-05, ahora cubierta

`isOpsAlertConfigured` comprobaba sólo la dirección. Estaba configurada,
devolvía `true`, y `sendEmail` no-opeaba después en `if (!resend) return` sin
decir nada — dos puertas silenciosas en serie, la forma de fallo que ADR 0029
existe para quitar. El arreglo ya estaba; lo que faltaba era el test que impide
volver atrás.

### Lo que se comprueba del contenido

- El aviso de bajada publica **las dos puntuaciones reales** y su diferencia.
- El error del proveedor va **escapado**: viene de fuera (Gemini, Supabase,
  fetch) y se interpola en HTML, así que sin escapar una alerta sobre un fallo
  se convierte en un vector de inyección hacia la bandeja del propio operador.
- Cada correo sale como **documento HTML completo**, no como fragmento — los
  clientes de webmail sólo aplican lo que encuentran en un `<head>` de verdad.
- Sale desde la **dirección verificada**, no desde una inventada.

**Los tests se probaron rotos.** Tres mutaciones: mandar una alerta de operador
al cliente (2 rojos), devolver `isOpsAlertConfigured` a mirar sólo el destino
(1), y dejar de escapar el `<` (1).

**Lo que sigue sin cubrir.** Que el correo **se vea bien** en Gmail, Outlook y
Apple Mail. Eso no lo puede ver ningún test de este repo y sigue siendo
comprobación manual.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase Q (Q2);
`.claude/rules/scan.md` («las alertas de operador nunca van al cliente»);
ADR 0029; §87 (por qué no se fija el maquetado).

---

## 92. La frontera de autenticación, y una guarda que cubre el fichero que nadie ha escrito todavía (PRELAUNCH-HARDENING-1 Fase Q4, 2026-08-15)

**Qué se decidió.** 22 tests para `middleware.ts`, `lib/auth.ts` y —lo más
importante— una **guarda estructural** sobre todo uso del rol de servicio en
`app/`. De 2.462 a 2.484.

### La guarda es lo que de verdad aporta

`createServiceClient()` **salta RLS**. El plan pedía tests de «los 7 sitios de
`app/` que lo usan»; medidos, son **12**, y los doce establecen identidad
correctamente. O sea que doce tests unitarios habrían salido verdes el primer
día y no habrían protegido de nada.

El riesgo no son esos doce: es **el decimotercero**, el que alguien añada dentro
de tres meses copiando el patrón a medias. Por eso
`tests/service-role-identity.test.ts` comprueba una propiedad de **todo el
directorio** —cada fichero de `app/` que use el rol de servicio tiene que
establecer identidad de una de cuatro formas conocidas (`requireUser`,
`requireActiveProject`, `isAuthorizedInternalRequest`, la firma de Stripe)— así
que un fichero nuevo entra en el alcance solo. Mismo patrón que
`env-drift.test.ts` y `console-css-scope.test.ts`.

Se verificó creando un fichero sin guarda en `app/`: rojo, con el mensaje que
explica qué falta. Usa `git grep --untracked` a propósito, para que un fichero
recién escrito y aún sin commitear también cuente — que es justo cuando hace
falta (misma lección que §70).

**Lo que la guarda NO demuestra, dicho claro:** que la comprobación sea
*correcta*. Ve que el fichero establece identidad, no que la aplique al dato que
toca. Eso sigue siendo revisión humana y `data-guardian`.

### Del middleware, lo importante es lo que NO hace

No es una puerta: su propio comentario lo dice, y aun así es exactamente el
sitio donde alguien metería un control de acceso creyendo que ayuda. Hay un test
que fija que **sin sesión responde igual** —`NextResponse.next()`, ni redirect
ni 401— junto al que fija que sí refresca la sesión. Y otro sobre el matcher:
sin las exclusiones, este middleware —que abre un cliente de Supabase y verifica
un JWT— correría en cada imagen y cada bundle.

### Dos veces en que el test estaba mal, no el código

1. **La memoización de `requireUser` no se puede testear**, y queda anotado en
   el propio fichero para que nadie lo reintente: `React.cache()` sólo memoiza
   dentro del ámbito de una petición de React, así que desde un test de node
   tres llamadas producen tres viajes y `toHaveBeenCalledTimes(1)` falla contra
   código correcto.
2. **El matcher del middleware hay que anclarlo.** Next lo hace por su cuenta;
   sin `^…$` el patrón casa en cualquier punto de la ruta y las exclusiones
   parecen no funcionar.

Las dos se descubrieron viendo el test en rojo antes de dar nada por bueno.

**Los tests se probaron rotos.** Un fichero sin guarda en `app/` (1 rojo), la
cookie dejando de validar el uuid (1), y el matcher dejando de excluir estáticos
(1).

**`lib/account-role.ts` se deja sin tests a propósito**: son diez líneas que
devuelven `"admin"` constante porque no hay equipos ni RBAC. Un test ahí
afirmaría que una constante es esa constante.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase Q (Q4);
`.claude/rules/supabase.md` («no service-role shortcuts en flujos de usuario»);
§70 (por qué `--untracked`); §93 (Q2).

---

## 94. La definición canónica vive en una constante, no en seis párrafos parecidos (SEO-POS-1 Fase E, E2, 2026-08-15)

**Qué se publica.** `/que-es-genscore`: qué es el producto, qué mide, cómo
funciona en cuatro pasos, en qué se diferencia del SEO, para quién es, y una
sección de desambiguación.

**La decisión de fondo: la definición es una constante compartida.** Vive en
`lib/brand/canonical-definition.ts` y la importan la metadata de la página, el
`KeyTakeaway` de apertura, la FAQ y el `SoftwareApplication` del schema. No es
una preferencia de estilo: el objetivo entero de la fase es que un motor
encuentre **la misma descripción estable** en varios sitios en vez de seis
redacciones que se parecen, y eso una cadena compartida lo garantiza mientras
que seis párrafos escritos a mano divergen al primer refresco.

**Corrección al consejo externo que originó la fase.** Proponía una definición
canónica que decía "ChatGPT, Gemini, Claude, **Perplexity y Google AI
Overviews**", y recomendaba repetirla *literalmente* en home, /about,
documentación y pie. Dos de esos cinco motores no los ejecutamos. Aplicarlo
habría sembrado el mismo reclamo falso que PRICING-TRUTH-1 retiró del producto,
multiplicado por las superficies más vistas del sitio y en la cadena que más se
repite. `canonical-definition.test.ts` lo impone: la definición debe nombrar
los tres que sí ejecutamos y ninguno de los seis que no.

**Un test que parece de estilo y no lo es:** la definición tiene que empezar
por *"GenScore es una plataforma de Generative Engine Optimization"*. Una
definición de entidad que abre por el beneficio ("Mide tu visibilidad en IA…")
no declara categoría, y la categoría es justo lo que desambigua frente a los
otros GenScore.

**Enlazado: una segunda lista compartida, no un `<Link>` a mano.**
`MARKETING_CONTENT_LINKS` está fijada por test a las cuatro capas de
`content-strategy.md` §2 por igualdad exacta, así que la página de entidad no
cabía ahí sin romper esa semántica. Pero añadirla a mano en los seis pies es
exactamente la desincronización de uno en uno que §46 documentó. Solución:
`MARKETING_ENTITY_LINKS`, misma mecánica y mismo test por shell. Una fuente
primaria sin enlaces entrantes del propio dominio es una declaración que nadie
respalda.

**La sección de desambiguación, y por qué se queda corta a propósito.** Nombra
las categorías de los otros GenScore —bioinformática, salud mental, riesgo
entre empresas, una entidad local— sin enlazarlos. Enlazarlos les daría señal;
no mencionarlos deja el trabajo de desambiguación entero a los motores. El
punto medio es afirmar con fuerza qué SÍ es esto, que es lo que de verdad
resuelve la entidad, y despachar el resto en un bloque corto.

**Schema sin `aggregateRating`.** No hay reseñas públicas acumuladas. Un rating
inventado en schema es dato falso con el agravante de que Google penaliza el
marcado inventado cuando lo detecta.

**Nota de numeración:** esta fase se llevó por delante un §91 duplicado. E1 y
la Fase Q2 de PRELAUNCH-HARDENING-1 mergearon con cuatro minutos de diferencia
y ambas reclamaron el mismo número; E1 cedió por haber llegado después y pasó
a §93. Lo cazó `tests/log-numbering.test.ts`, que ya existe precisamente por la
racha de colisiones de esta misma semana.

---

## 95. El bloque que pedía no ser confundido no construía marca (SEO-POS-1 Fase E, E2, revisión, 2026-08-15)

**Origen.** El fundador, sobre el preview de `/que-es-genscore`: *"Está muy
pegado el título a la card. Ese bloque de desambiguación no me gusta, no es
elegante para construir marca. Revísalo y enriquécelo en texto e imagen real de
producto como si fueras un experto en marketing digital."*

**Lo del bloque de desambiguación tenía razón, y el diagnóstico es de postura.**
La página dedicaba un `Verdict` destacado —recuadro naranja, etiqueta
"DESAMBIGUACIÓN"— a explicar que existen otros GenScore y que éste no es
aquéllos. Es información correcta y su efecto es el contrario del buscado: lo
primero que un bloque así comunica es *hay confusión sobre quiénes somos*, y lo
segundo es que nos preocupa. **Una marca no se construye pidiendo que no la
confundan.** El competidor no dedica un recuadro a explicar que no es otro.

**Qué se hizo con la función que ese bloque sí cumplía.** La desambiguación
para motores no se pierde: sigue en la FAQ —que alimenta el `FAQPage` schema—
reescrita para afirmar en vez de disculparse. Antes empezaba por *"Sí, el
nombre lo comparten…"*; ahora la pregunta es *"¿Dónde está GenScore y quién lo
hace?"* y la respuesta abre declarando qué somos y dónde, y despacha los
homónimos en una subordinada. Mismo trabajo de entidad, sin el bloque que
resta.

**Enriquecimiento: evidencia de producto, no más prosa.** La página explicaba
el producto sin enseñarlo. Ahora lleva tres figuras, todas maquetas del
lenguaje visual real:

1. **`AnswerPair`** con dos respuestas a la misma pregunta —una donde no
   apareces y otra donde apareces citado—. Es el "aha" de la categoría entera y
   estaba contado sólo con palabras.
2. **`PromptSet`** con cuatro prompts de intención distinta (categoría,
   competencia, precio, caso de uso), porque "cubre varias intenciones" es
   abstracto hasta que se ven cuatro seguidos.
3. **`ProductMock`** del panel de GEO Score con sus cinco componentes, y
   **`RecommendationSample`** con una recomendación real —prioridad, confianza y
   el porqué—, que es lo que separa a GenScore de las herramientas que se
   detienen en el diagnóstico.

**Espaciado.** El `h1` iba pegado a la tarjeta de la definición porque esta
página no tenía la línea que las comparativas sí llevan bajo el título. Se
añade, y de paso hace trabajo de posicionamiento: *"La plataforma GEO que mide
si las IA recomiendan tu marca — y qué hacer cuando no lo hacen."*

**Un guardián que faltaba, descubierto al añadir la maqueta.**
`article-recipes.test.ts` comprueba que el número del gauge sea la media
ponderada real de las barras dibujadas, pero **sólo sobre
`app/blog/<slug>/page.mdx`**. Esta página es un `.tsx` fuera del blog, así que
la maqueta más visible del sitio era justo la que nadie verificaba —y el
comentario de `MockRow` deja constancia de que una maqueta ya se contradijo a
sí misma dos veces. `product-mock.test.ts` cubre el hueco: cinco componentes,
pesos que suman 100, y gauge = media ponderada exacta (66). Verificado fallando
al declarar 82.

**Lo que no se tocó:** la definición canónica, que sigue siendo la misma cadena
compartida por metadata, página, FAQ y schema (§94).

---

## 96. Una insignia `nowrap` cortada a media palabra, y por qué el piloto la dio por buena (SEO-POS-1 Fase E, E2, 2026-08-15)

**Qué vio el fundador.** En `/que-es-genscore` a 375 px, la insignia azul que
anota la fila destacada del panel de GEO Score se salía de la tarjeta y quedaba
cortada: *"El componente más bajo es donde está el trabajo: te me…"*.

**Causa inmediata: mal uso del componente, no fallo del componente.**
`.art-anno-lbl` es `position: absolute` + `white-space: nowrap`, o sea una
**insignia**, no un párrafo. La única otra anotación del repositorio tiene 38
caracteres (`llms-txt-guia-practica`); la que se escribió aquí tenía ~90. La
frase se movió al pie de figura, que sí tiene sitio, y la insignia quedó en
"Aquí está el trabajo".

**Pero la causa de fondo es que nada lo impedía.** Un componente cuyo uso
correcto depende de que quien escribe acierte con la longitud del texto va a
fallar otra vez. Por debajo de 640 px la insignia deja de ser flotante y pasa a
ser una línea normal encima de la fila: cabe siempre, no tapa nada y no depende
del acierto de nadie. Se oculta además su chevron, que apunta a la fila cuando
flota y no significa nada cuando no.

**Lo importante: el piloto había dado PASS sobre esa misma pantalla, en esa
misma anchura.** No es un fallo del piloto, es su alcance real —
`assertPageIsHealthy` detecta **desbordamiento de página**, y aquí el recorte
ocurre DENTRO de la tarjeta, que sigue midiendo lo que debe. Es exactamente lo
que avisa el propio informe del piloto en cada pasada: *"esto no sustituye el
juicio visual"*. La captura existía y enseñaba el corte; nadie la abrió.

Es la tercera vez esta semana que un fallo visual real convive con un `PILOT
PASS` legítimo (§55 el CTA duplicado, §62 la pantalla nunca visitada, ésta). El
patrón común no es que el piloto falle, sino que **su verde responde a "ninguna
aserción saltó", no a "esto se ve bien"** — y las aserciones mecánicas no
cubren lo que pasa dentro de un contenedor con `overflow` recortado.

---

## 97. Q5: un test que podía mentir, una hipótesis sin datos y una puerta invisible (PRELAUNCH-HARDENING-1, 2026-08-15)

**Qué se decidió.** Se cierra lo que quedaba de Q5. Tres cosas distintas, y las
tres tenían la misma forma: **algo que parecía verificado y no lo estaba**.

### 1. `second-project.spec.ts` podía pasar en verde sobre proyectos vacíos

Ya no: sus dos pantallas declaran `ContentExpectation`. Sin ella, este journey
afirmaba «se ven bien en otro proyecto» cuando lo único comprobado era que la
ruta respondía 200 — el fallo del 2026-08-02 que hizo nacer
`ContentExpectation`, y que aquí era **peor que la media**: este journey existe
justamente para alcanzar formas de datos que el proyecto principal no puede
producir, así que un proyecto secundario sin datos es el caso que más fácil
pasaba desapercibido.

### 2. La pérdida de sesión se instrumenta, NO se parchea

El 2026-08-09 una pasada perdió la sesión en la última anchura y **no se ha
reproducido desde entonces** (§42). La hipótesis —el `storageState` único
compartido por las tres anchuras secuenciales— **sigue sin probarse**, y
parchear una hipótesis sin datos es cómo se arregla el síntoma equivocado.

Lo que había hasta hoy cuando saltaba era `session was rejected — landed on
<url>`, que no permite diagnosticar nada. Ahora el fallo dice **qué cookies de
sesión tenía el contexto en ese instante**, y eso separa dos fallos con dos
arreglos distintos: llegar **sin** cookies (el `storageState` no se aplicó) o
**con ellas caducadas** (la sesión expiró a mitad de pasada).

**Nombres, nunca valores.** Una cookie de sesión de Supabase *es* la sesión:
volcar su valor al log de un run sería regalar la cuenta del piloto. Para
diagnosticar hace falta saber si estaban, no qué contenían.

### 3. La ausencia de CI deja de ser invisible

`ci.yml` se dispara de forma intermitente en los push a un PR abierto (§54), y
el `workflow_dispatch` de rescate sólo sirve si alguien se da cuenta. Ahí está
el problema real: **un piloto verde se ve; un CI que no existe, no.** El
2026-08-15 estuvo a punto de mergearse un PR cuya única señal era el comentario
del piloto — se cazó mirando los checks uno a uno, que no es un método.

El comentario del piloto añade ahora un aviso cuando no existe ninguna ejecución
de CI para ese commit. Todo el bloque va con `|| true`: **este aviso jamás puede
tumbar la publicación del veredicto**, que es lo que de verdad importa de ese
paso.

**Lo que esto NO es, dicho claro: no es la puerta.** La puerta de verdad es una
*required status check* en la protección de rama — un ajuste del repositorio,
no código, y por tanto **del fundador**. Esto sólo hace que la ausencia se vea
donde él ya mira.

### Un punto del plan que ya estaba hecho

Q5 pedía tipar `pr_number` como string en `ux-pilot-write.yml` por el bug de
coerción 289 → `"289.0"`. **Ya estaba**, con su comentario explicando el
incidente. Es el sexto punto de este plan que al medirlo resulta estar
desactualizado; queda anotado por si a alguien le sirve el patrón: **este plan
se escribió de una vez y el código siguió moviéndose.**

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase Q (Q5); §42 (la
pérdida de sesión y el `retries: 0`); §54 (la intermitencia de CI); §55
(`ContentExpectation` y por qué existe).

---


---

---

## 98. Escribir sobre el proyecto de un cliente sin darle al operador un atajo que el dueño no tiene (ADMIN-CONSOLE-2b, 2026-08-13)

**Estado: implementada.** Task Intake de 12 puntos aprobado. Segunda mitad de
la petición del 12-08: además de *ver* los automatismos (2a, §71), `/admin`
puede ahora *cambiarlos* — el interruptor de escaneo recurrente y las dos
mitades de auditoría automática, por proyecto, desde la ficha de cada usuario.

**El invariante que ordenó todo el diseño: el operador nunca tiene un atajo
que el propio dueño no tiene.** Las precondiciones no se reescribieron para
`/admin` — se **extrajeron** de `setRecurringScans`/`setAutoAuditHalf`
(`app/dashboard/projects/[projectId]/actions.ts`) a
`lib/projects/automation-toggles.ts`, y las dos acciones (la del dueño, con
RLS, y la del operador, con service-role) llaman a la misma función. Activar
el recurrente sigue exigiendo un escaneo completado; escribir la mitad de
auditoría sigue distinguiendo columna-sin-migrar de fallo real. Un solo sitio
que mantener, dos llamadores.

**Un tercer caso de "on + coste, pero no hace nada", detectado antes de
escribir el código, no después.** 2a ya había aprendido con la QA bloqueada de
§71 que un interruptor activo que el backend ignora es una métrica inventada.
Al diseñar la escritura apareció una tercera instancia de la misma familia:
`lib/web-audit/audit-job-runner.ts` salta la mitad de **cobertura** con
`plan_required` por debajo de Pro (`docs/adr/0035`), exactamente como el
barrido salta el recurrente en Free. La acción de escritura rechaza activar
cobertura en un proyecto sin Pro **antes** de tocar la base de datos, con el
mismo criterio que ya aplicaba al recurrente en Free.

**Gap declarado, no arreglado aquí.** El descubrimiento anterior expone que la
vista de **sólo lectura** de 2a no comprueba esta condición: un proyecto Free
con `auto_coverage_audit_enabled=true` en la base (nadie ha podido escribirlo
hasta esta fase, pero pudo quedar así de antes) se mostraría como "auditoría
IA activa, con coste" en `/admin/users`, igual de falso que la columna
retirada de §71. No se corrige en este PR — tocar el agregado de lectura de
2a es un concern distinto y `lib/admin/automation.ts` no está en el alcance
aprobado de 2b. Queda anotado para una fase de un solo párrafo.

**El registro es el email, no una tabla nueva.** Cada escritura exige un
motivo (mínimo 5 caracteres, rechazado antes de tocar la base) y manda
`sendAdminAutomationChangeAlertEmail` a `OPS_ALERT_EMAIL` con quién, qué
cuenta, qué proyecto, qué cambió y el motivo íntegro. Es exactamente lo que
prometía `docs/design-reference/admin-console-1/README.md` desde el
12-08: sin migración aprobada, el email ES la auditoría de la acción.

**Lo que la extracción demostró sin querer:** `setRecurringScans`/
`setAutoAuditHalf` no tenían test propio — vivían sólo comprobadas a mano
desde `/debug`. Extraer su lógica a un módulo con test (`automation-toggles.
test.ts`) las deja cubiertas por primera vez, de rebote.

**Dos hallazgos de la QA de este mismo PR, corregidos antes del Human Gate.**
El email de aviso tenía el mismo defecto que ya se había corregido una vez en
el camino principal (UUID pasado como si fuera un email), pero escondido en la
rama de fallback: si `loadOwnerProfile` no encuentra fila en `profiles` (perfil
huérfano), `targetUserEmail` caía a `project.owner_user_id`, un UUID, en el
único registro que existe de la escritura. Ahora cae a un marcador de texto no
confundible con un email (`"(sin email — perfil no encontrado)"`), nunca al
UUID. Y los dos `.update()` finales no repetían `is_archived = false` que sí
lleva el camino del dueño (`app/dashboard/projects/[projectId]/actions.ts`) —
un archivado entre la lectura (`loadProjectForWrite`) y la escritura habría
pasado por el operador y nunca por el dueño, exactamente la asimetría que este
mismo diseño se propuso evitar. Añadido a ambos `.update()`.

### Pendiente / roto conocido

- **El gap de lectura de 2a con `auto_coverage_audit_enabled` por debajo de
  Pro**, descrito arriba — necesita su propio cambio, pequeño, en
  `lib/admin/automation.ts`.
- **2c (selección múltiple y borrado permanente) sigue sin empezar**, y sigue
  prohibido sin aprobación explícita (CLAUDE.md).
- **Sin piloto agéntico**, misma razón que Fase 1 y 2a: no puede completar un
  desafío AAL2. Verificación manual.

## 99. Quitar el motivo obligatorio, interruptores en columnas, ficha en acordeón (ADMIN-CONSOLE-UX-1, 2026-08-15)

**Estado: implementada.** Petición directa del fundador sobre lo que acababa
de mergearse en 2b, no un Task Intake de 12 puntos — pero uno de los tres
cambios contradecía un invariante que ese mismo PR había escrito, así que se
paró a preguntar antes de tocar código en vez de implementarlo en silencio.

**El campo de motivo se elimina, con la pérdida asumida explícitamente.**
§98 documentó "no hay tabla de auditoría; el email ES el registro" y
`.claude/rules/admin.md` lo convirtió en regla: "Every write from `/admin`
needs a required reason". Quitar la caja de texto no es sólo un cambio de
CSS — rompe ese invariante. Se preguntó directamente: compacto-pero-
obligatorio (un diálogo al pulsar) frente a eliminarlo del todo, explicando
que la segunda opción deja las escrituras de operador sin ningún rastro de
**por qué** se tocó el proyecto de un cliente. El fundador eligió eliminarlo
del todo, informado del coste. Lo que **no** se eliminó: el email a
`OPS_ALERT_EMAIL` sigue disparándose en cada escritura con operador, cuenta
afectada, dominio, proyecto, qué cambió y cuándo — el registro pierde el
**porqué**, no el **quién/qué/cuándo**. `sendAdminAutomationChangeAlertEmail`
ya no acepta `reason` en su firma; no quedó como parámetro opcional sin uso.

**Interruptores en columnas.** `.adm-proj-write` pasa de `flex-direction:
column` (tres formularios apilados, cada uno con su propia caja de motivo) a
un grid de tres columnas — ahora cabe porque cada formulario es sólo una
etiqueta y un botón, no una fila con un campo de texto de 160px mínimo. Se
apila a una columna por debajo de 480px para no comprimir el botón contra el
texto en un móvil estrecho.

**La ficha se abre en acordeón, no como tarjeta fija.** Antes,
`{params.u ? <div className="adm-drawer">…</div> : null}` se renderizaba
DESPUÉS de toda la tabla, sin importar qué fila se hubiera tocado — abrir la
fila 2 de una lista de 80 usuarios significaba bajar la distancia entera de
la tabla para verla, y volver a subir para comparar con la fila. Ahora el
detalle se inserta como una fila más (`<tr><td colSpan={9}>`) inmediatamente
después de la fila seleccionada, dentro del mismo `<tbody>` — se extrajo el
contenido a `UserDetailPanel` para no duplicarlo entre este caso y el de
abajo. **Caso borde declarado, no ignorado:** si la fila seleccionada no está
en la página filtrada actual (un buscador o un filtro de estado la deja
fuera, o no queda ninguna fila), no hay dónde anclar la fila-acordeón — para
ese caso, y sólo para ése, se mantiene el render de abajo
(`.adm-drawer-standalone`), condicionado a
`params.u && !filtered.some((row) => row.id === params.u)`.

**La celda del acordeón vive dentro del mismo contenedor con scroll
horizontal que la tabla** (`.adm-table` tiene `min-width: 760px`), en vez de
extraerla a un contenedor de ancho completo — habría exigido convertir la
tabla entera a un grid de `<div>` para que el detalle escapara esa anchura
mínima, mucho más alcance del que pedía esta iteración. La tabla ya obliga a
desplazamiento horizontal en 375px hoy; anidar el acordeón en el mismo
contenedor extiende ese trade-off ya aceptado, no introduce uno nuevo. Dentro
de la celda, `white-space: normal` deshace el `nowrap` general de
`.adm-table td`, y el grid de dos columnas del detalle (`.adm-drawer-cols`)
ya colapsaba a una por debajo de 760px de **viewport** — eso sigue
funcionando igual, porque `@media` responde al viewport real del navegador,
no al ancho del contenedor con scroll.

**Corrección de la propia QA de este PR, antes del Human Gate: el `@media`
de las columnas no podía funcionar donde más importaba.** `.adm-proj-write`
se colapsaba a una columna por debajo de 480px de **viewport** — pero
`UserDetailPanel` se renderiza en dos contextos de ancho muy distinto al
mismo viewport real: dentro de la celda de la tabla (ancha, porque
`.adm-table` fuerza `min-width: 760px`) y, en el caso de respaldo, suelto a
ancho de página. A 375px de viewport ambos casos colapsaban igual, aunque el
primero tenía ~700px reales disponibles — exactamente el caso normal
(acordeón en línea), y exactamente el móvil para el que se pidió el cambio.
Cambiado a `@container` sobre `.adm-proj-block` (`container-type:
inline-size`): ahora colapsa según el ancho real del contenedor que lo aloja,
no el del viewport, y las tres columnas sí aparecen en el caso normal en
móvil.

**Segunda corrección, el mismo día: la ficha en sí era ilegible en un móvil
real.** Capturas del fundador desde su teléfono lo mostraron directamente —
el piloto no lo pudo ver porque no tiene AAL2 para `/admin`. La celda del
acordeón es parte de una fila de `.adm-table` (min-width 760px): dejar su
contenido a `white-space: normal` arregló que el texto no se rompiera en una
sola línea eterna, pero no arregló que ese texto sólo se leyera desplazando
la tabla horizontalmente — la ficha entera quedaba a 760px+ de ancho, cortada
por ambos lados en cualquier pantalla de teléfono real. Los números cortos
del resto de la tabla toleran ese desplazamiento (siempre lo toleraron, es un
trade-off ya aceptado); una ficha pensada para leerse, no. Corregido sin
partir la tabla en dos: `.adm-table-wrap` ya lleva `container-type:
inline-size` (para el fix anterior), así que su ancho real y visible —el del
contenedor, no el de la fila que desborda dentro de él— se puede consultar
con la unidad `cqi`. El contenido de la celda vive ahora en
`.adm-detail-sticky`: `position: sticky; left: 0` lo fija al borde visible
según se desplaza la tabla, y `width: 100cqi` lo dimensiona al ancho real del
contenedor. Resultado: la ficha se ve entera y a ancho de pantalla sin que el
operador tenga que desplazar nada, aunque la fila que la contiene siga siendo
más ancha que la pantalla.

**Tercera corrección, el mismo día: seleccionar una cuenta ejecutaba toda la
página otra vez.** El fundador lo notó directamente: cada clic en una fila se
sentía como una recarga completa. La causa era real, no sólo percibida —
`AdminUsersPage` es un Server Component que lee `searchParams`, así que
navegar a `?u=<id>` volvía a ejecutar la función entera, incluida
`listOperatorUsers()` (la lista completa de cuentas, el KPI, el coste
agregado — nada de lo cual depende de qué cuenta esté seleccionada), sólo
para traer el detalle de una. Sin `loading.tsx` ni un límite de `<Suspense>`
alrededor, tampoco había ninguna señal visual mientras tanto: la página se
quedaba congelada y luego cambiaba de golpe, con scroll al inicio incluido
(comportamiento por defecto de la navegación de Next).

**La selección de cuenta deja de ser un `searchParam` que dispara
renderizado de servidor y pasa a ser estado de cliente.** Nuevos ficheros:
`lib/admin/user-detail-action.ts` (server action de sólo lectura,
`fetchOperatorUserDetail`, con la misma puerta `requireOperator()` de
siempre dentro de la propia acción — nunca delegada en quien la llama);
`app/admin/users/shared.tsx` (las piezas de presentación que antes vivían en
`page.tsx` — `UserDetailPanel`, `AutomationToggleForm`, `STATUS_LABEL`, los
formateadores — sin nada server-only, así que sirven tanto al Server
Component como al nuevo Client Component); `app/admin/users/users-table.tsx`
(`"use client"`, el nuevo dueño de la tabla y el acordeón). Al pulsar una
fila: `fetchOperatorUserDetail` corre dentro de una transición y sólo la
ficha cambia — la tabla ni se vuelve a pedir ni se vuelve a montar. La URL
se sincroniza con `window.history.replaceState` directamente, sin pasar por
el router de Next, para que la cuenta seleccionada siga siendo enlazable sin
que ese cambio de URL dispare por sí mismo una petición al servidor.
`page.tsx` conserva la carga inicial (deep link a `?u=...`, recarga real) y
sigue siendo el único que hace el fetch completo de la lista. Los filtros
(buscador, chips de estado) y el envío de un formulario de automatismo
siguen siendo navegación real de servidor — eso sí necesita datos nuevos —
y un `useEffect` en `UsersTable` resincroniza el estado local cuando esas
props cambian de identidad.

**Efecto colateral, no accidental: `formatUsd`/`provenanceLabel` se separan
de `lib/admin/cost-model.ts`.** Ese fichero lleva `import "server-only"`
porque calcula el coste a partir de tarifas internas; `shared.tsx` sólo
necesitaba las dos funciones de formato, sin las tarifas, pero importar
cualquier cosa de un módulo `server-only` desde un fichero que un Client
Component importa rompe el build (Next lo rechaza explícitamente, correcto).
Las dos funciones —sin nada sensible, sólo formato— pasan a
`lib/admin/cost-format.ts`, sin `server-only`; `cost-model.ts` las
re-exporta para no romper a `automation.ts` ni a `page.tsx`, que siguen
importándolas de donde siempre.

**Cuarta corrección, el mismo día: el arreglo de la ficha ilegible (la
"Segunda corrección" de arriba) nunca había llegado a aplicarse.** Nueva
captura del fundador desde su móvil mostró el mismo texto cortado que se
había dado por corregido, y además los tres interruptores por proyecto sin
verse uno bajo otro. Diagnosticado con un HTML mínimo cargado en Chromium
local (sin acceso a `/admin` real, que exige AAL2) reproduciendo la misma
estructura CSS: `.adm-table th, .adm-table td { white-space: nowrap }` —
regla que ya existía para las celdas normales de la tabla— tiene
especificidad elemento+clase (0,1,1); `.adm-detail-cell { white-space: normal
}` de una sola clase (0,1,0) nunca pudo ganarle, source order aparte. El
`white-space: normal` de la "Segunda corrección" jamás se aplicó. Con el
texto sin partir, la línea de coste (`.adm-cost-basis`) medía su ancho
íntegro sin saltos, y ESE ancho —no el ancho real disponible— es el que
`.adm-proj-block` (y por tanto `.adm-proj-write`) heredaba; con la
`@container` de la corrección anterior evaluando ese ancho inflado, nunca
veía menos de 420px y nunca colapsaba a una columna. Las dos cosas que el
fundador reportó como fallos distintos eran el mismo bug.

Dos arreglos, verificados con Chromium local en 375/768/1280px antes de
subir (no sólo razonados):

- **La especificidad**: `.adm-detail-cell` pasa a `.adm-table
  .adm-detail-cell` (0,2,0), que gana sin depender del orden de las reglas
  en el fichero.
- **La `@container` de las columnas se sustituye por `grid-template-columns:
  repeat(auto-fit, minmax(140px, 1fr))`.** Correcta en aislamiento la
  primera vez, pero dependía de un ancho de contenedor que otro bug (el de
  arriba) podía inflar; `auto-fit` resuelve el número de columnas de forma
  intrínseca contra el ancho real en cada reflow, sin una condición
  explícita que pueda quedar evaluando el número equivocado. Confirmado:
  1 columna a 375px, 2 a 768px, 3 a 1280px, sin desbordamiento horizontal en
  ninguno.

### Pendiente / roto conocido

- Sigue sin piloto agéntico, misma razón que toda la zona: AAL2 bloquea el
  arnés. Verificación manual de las tres capturas (375/768/1280) pendiente
  del fundador.
- El gap de lectura de 2a (`auto_coverage_audit_enabled` por debajo de Pro en
  `lib/admin/automation.ts`) sigue sin tocar, como en §98.

---

## 100. Tres URLs para el mismo GEO Score, y una home que no decía qué producto es (SEO-POS-1 Fase E, E3 + E4, 2026-08-15)

Cierra la Fase E. Las dos filas que quedaban del plan eran distintas de las dos
primeras: E1 (§91) y E2 (§94) escribían cosas —una grafía, una página—, y estas
dos sólo **declaran** lo que ya existía. Ninguna de las dos añade una línea de
copy visible salvo un bloque de enlaces, y aun así son las que más directamente
atacan el problema que abrió la fase: que "GenScore" y "GEO Score" resuelvan a
una entidad nuestra y no a un parecido.

### E3 — el producto estaba declarado en la página con menos autoridad del sitio

`/que-es-genscore` emitía un `SoftwareApplication` completo. La home no: sólo
heredaba el `Organization` del layout raíz, o sea "existe una empresa llamada
GenScore", sin decir en ningún formato legible por máquina **qué producto es**
ni de qué categoría. Justo al revés de como se acumula la autoridad: la home es
la que recibe los enlaces y las búsquedas de marca, y la página de entidad
nació hace dos días.

El arreglo obvio —copiar el bloque— era el equivocado, y por el motivo de
siempre en esta zona: dos declaraciones a mano del mismo producto divergen al
primer cambio de posicionamiento, y el síntoma sería el sitio describiéndose de
dos formas distintas exactamente donde un motor lo lee para decidir qué somos.
Así que el schema pasa a `components/seo/software-application-schema.tsx` y las
dos páginas montan **el mismo componente**. Es el argumento de E2 (la
definición en una constante) un nivel más arriba.

Al moverlo salió un fallo que llevaba dentro desde E2 y que nadie había mirado:
el `publisher` incrustaba su propio `{"@type":"Organization","name":"GenScore"}`.
Eso es un **segundo** nodo llamado igual que el del layout, sin nada que los
una — para un parser, dos entidades que casualmente comparten nombre. La página
que existe para desambiguar la marca estaba fabricando una ambigüedad más, en
formato legible por máquina. Ahora hay `@id` estables
(`…/#organization`, `…/#software`) y `publisher` es una **referencia**, no una
copia: montar el nodo en dos páginas crea dos menciones del mismo producto, no
dos productos.

### E4 — canonicalizar un concepto sin tirar dos URLs a la basura

El sitio explica el GEO Score en tres sitios publicados: la metodología en
`/docs`, la entrada del glosario y el artículo del blog. La tentación es
fusionarlas o cruzarles un `rel=canonical`; las dos cosas serían tirar señal,
porque sirven a intenciones distintas y las tres reciben tráfico. El problema
real era más pequeño: **ninguna decía ser la de referencia**, y cada una
definía el término con sus propias palabras.

Se arregla con dos piezas y ninguna página nueva. Una cadena compartida
(`GEO_SCORE_DEFINITION`), que ahora usan la entrada del glosario, la metadata
de la metodología y su schema — antes eran tres redacciones parecidas. Y un
`@id` común (`…/#geo-score`) que emiten el glosario y la metodología, con la
`url` del documento de referencia y las otras dos como `sameAs`: un solo nodo
con tres documentos en vez de tres conceptos que se parecen. Es el equivalente
semántico de un canonical sin desindexar nada.

**Canónica es la metodología, y no fue una elección de gusto:** ya lo era de
hecho. Seis artículos y `/docs/informes/overview` mandan ahí al lector cuando
quieren decir "el criterio completo está aquí", y es la única de las tres que
se mantiene al día con el algoritmo real. Declarar canónica a otra habría
contradicho el enlazado interno, que es la señal más fuerte que tenemos.

Lo que faltaba era la dirección contraria: la metodología no devolvía a
ninguna de las dos. Ahora cierra con un bloque que dice explícitamente cuál
manda si algo se contradice.

De paso salió podredumbre: la `description` de esa página —su meta description,
la del documento que esta fase declara canónico— prometía "los cuatro
componentes, sus pesos". Son **cinco** desde GEO-SCORE-V4 (ADR 0033) y los
pesos se retiraron de todas las superficies el 2026-08-13 (§75). Llevaba así
diez días, apuntando a contenido que la propia página ya no tiene.

### Por qué esto necesita tests y no basta con hacerlo bien

El JSON-LD es el caso extremo del fallo sin síntoma que esta zona lleva todo el
plan encontrando. Un `@id` mal escrito, un `publisher` colgando de un nodo
inexistente, una cuarta página sobre el GEO Score publicada sin declararse
parte del concepto: nada de eso rompe una página, ni sale en el piloto, ni lo
nota un lector. Simplemente el motor lee dos entidades donde hay una — el
problema que la fase entera venía a quitar, reintroducido en silencio.

`lib/brand/entity-graph.test.ts` cubre las dos mitades, y las dos guardas se
verificaron rompiéndolas a propósito antes de dar la fase por buena: reponer un
`Organization` incrustado en el `publisher` la pone roja, y crear una página
`/geo-score-nuevo` la pone roja nombrándola. El barrido de la cuarta URL busca
por **ruta**, no por menciones: un artículo que hable del GEO Score no compite
por el término, una URL dedicada sí.

### El guardián de E1 saltó, y tenía media razón

CI tumbó el primer commit: `naming.test.ts` marcó como identificador partido
el título de un test de esta misma fase, *"tres URLs, no tres GEO Scores"*. Es
castellano correcto —el plural de la métrica— y el barrido lo leía como daño
porque la `s` es una letra pegada a `GEO Score`. Segundo falso positivo del
mismo guardián en tres días, después de `QueEsGenScorePage` (§94), y la regla
sigue siendo la de entonces: **un guardián con falsos positivos se acaba
desactivando**, así que se afina en vez de reescribir la prosa que lo
molestaba. El `git grep` queda igual de amplio —POSIX ERE no tiene lookahead—
y la exención se aplica en JS: una `s` y sólo una, seguida de algo que no sea
letra. Verificado con tres sondas: `availableGEO ScoreComponents` sigue rojo,
`GEO Scoresx` sigue rojo, `tres GEO Scores.` pasa.

Lo interesante es **por qué no lo cogió el local**, porque el propio guardián lo
tenía documentado desde E1: `git grep` sólo ve ficheros versionados, y la línea
culpable estaba en un fichero recién creado sin `git add`. La suite pasó verde,
después se hizo `git add -A`, y el commit salió con el fallo dentro. No hace
falta arreglar nada de eso — hace falta invertir el orden: **`pnpm test`
después de `git add`, no antes**, siempre que la suite tenga guardas que se
apoyen en el índice de git.

### Y al abrir las capturas: `/docs` llevaba dos meses sin enlaces visibles

El piloto dio `PILOT PASS` en las 65 pantallas × 3 anchuras, dos veces. Abrir
las capturas de las pantallas que toca el diff —`docs-metodologia-geo-score` en
375, 768 y 1280, `docs-index`, `glosario-geo-score`, `blog-que-es-el-geo-score`
y `landing`— enseñó que el bloque de enlaces recién añadido renderizaba en gris
y sin subrayado, exactamente igual que la prosa de al lado.

No era del bloque. `globals.css` tiene `a { color: inherit; text-decoration:
none }` como base, y `.legal-body a` y `.blog-body a` lo compensan cada uno en
lo suyo — **`.docs-content` nunca tuvo regla de enlace**. Así que desde
GROWTH-2, *todos* los enlaces de la documentación son texto muerto a la vista:
"Metodología completa en GEO Score" y "ver Planes y límites" en
`/docs/informes/overview` llevaban dos meses siendo enlaces que nadie podía
saber que lo eran. La cuarta vez esta semana que un fallo visual real convive
con un verde legítimo (§55, §62, §96, ésta), y la primera en que el fallo era
**más viejo que el PR que lo destapa**.

Se arregla con la regla que faltaba, con el mismo token que las otras dos
superficies y con `:not(.btn)` desde el principio, que es la lección de §54/§55:
una regla de enlace por ancestro le gana en especificidad a la clase de un
botón. Hoy no hay botones en `/docs`; se escribe así para cubrir el que
aparezca.

Es además el arreglo que la propia E4 necesitaba: la fase se apoya en enlazado
interno explícito entre las tres URLs, y un enlace que no parece un enlace no
enlaza a nadie.

**Queda declarado como pendiente, no arreglado:** el layout raíz sigue con
`title: "GenScore"` y `description: "Espacio de visibilidad de marca en motores
de IA"`, que es una cuarta redacción de lo mismo y actúa de respaldo para
cualquier página sin metadata propia. La home ya no la usa —tiene la suya desde
T1— así que el impacto es menor que el que se ha arreglado aquí, pero tocarla
cambia el respaldo de todo el sitio a la vez y merece su propia pasada.

---

## 101. La cabecera pública adopta el chasis de la consola (HEADER-CONSISTENCY-1, 2026-08-15)

**Estado: implementada.** El fundador notó, comparando capturas de la zona
pública y de la consola, que el menú móvil de cada una se despliega de un lado
distinto y con medidas distintas — "que parecen dos productos". Pidió primero
un artefacto con alternativas (igualar sólo medidas / compartir chasis con
contenido propio / cabecera única con huecos); eligió la de chasis compartido,
pero **corrigió sobre la marcha una parte del análisis inicial**: la primera
propuesta reconstruía las dos direcciones posibles (`.lp-mobnav` a la derecha
por §63, `.sb` a la izquierda) como igual de legítimas y proponía conservarlas
por separado. El fundador señaló que dos lados en el mismo producto no es un
patrón — Material Design y las guías de Apple sitúan el cajón de navegación en
el borde de inicio, y lo que de verdad no tiene precedente es que la web y la
consola de un mismo producto abran cada una hacia un lado distinto.

**La decisión de fondo: se unifica a la izquierda, y manda la consola.** No es
un empate resuelto por convención — `.sb` **es** la barra lateral de
escritorio deslizándose, así que su lado no es una preferencia de móvil, es la
continuidad de una estructura que ya existe en escritorio. La pública sí podía
moverse sin romper nada propio, así que se movió ella.

**Esto SUPERSEDE la decisión de §63** ("el menú tiene que salir siempre desde
la derecha", GENSCORE-HEADER-1, 2026-08-11) para la zona pública. La regla
pasa a ser: **el cajón de navegación abre desde la izquierda en las dos
zonas**, con la hamburguesa a la izquierda y el logo centrado — la misma
anatomía que `WorkspaceTopbar` ya tenía aprobada desde el 24 de julio (§3).

**El proceso fue iterativo a propósito, con verificación real en cada paso —
no una maqueta dibujada:**
1. Un *spike* aislado (sólo lado del burger + logo centrado en `PublicHeader`,
   nada más) se probó primero en local con Playwright a 375px, se corrigió un
   bug de scoping encontrado en la propia prueba (un selector `.lp-logo` sin
   acotar capturaba también el logo decorativo del mockup del navegador en el
   hero), y se subió a un preview real de Vercel antes de pedirle opinión al
   fundador — nunca se le pidió juzgar un dibujo.
2. Confirmado el lado en real, se implementó el chasis compartido completo:
   tokens `--drawer-w` (288px) y `--drawer-anim` (.24s) en `:root`, compartidos
   por `.lp-mobnav` (antes 280px/.24s) y `.sb` (antes 290px/.26s); barra móvil
   pública 72px→52px (`--header-h`, que la consola ya usaba); burger
   44×44/radio 10 en las dos zonas; botón de cerrar 44×44 explícito en las dos
   (antes 38px pública / 34px consola, ambos con `min-*` disimulando la
   diferencia real); y una fila de marca nueva en el cajón público
   (`.lp-mobnav-brand`, logo + X) que antes no existía — sólo tenía la X
   suelta en su propia fila — igualando `.sb-brand` de la consola.
3. **Efecto colateral encontrado y corregido en el mismo PR:** `BrandLogo`
   nunca aplicó ninguna clase a su propio `<svg>`, así que la regla
   `.lp-logo .brand-logo-svg { height: 19px }` que llevaba meses en el CSS
   nunca hizo nada — la barra pública en móvil renderizaba siempre el logo de
   escritorio (22px) sin recortar. Se corrigió apuntando al elemento real
   (`.lp-nav > .lp-logo svg`, sin necesidad de clase, acotado a hijo directo
   por la misma razón que el spike) y fijando 20px, el valor real que ya
   usaba `WorkspaceTopbar` por prop. La misma clase muerta existe en
   `.sb-brand .brand-logo-svg` (consola) — no se tocó, porque el valor que
   pretendía fijar (19px) nunca se aplicó y el prop real (22px) ya coincide
   con el que ahora usa el cajón público, así que no hay nada roto que
   arreglar ahí.
4. **Regresión real encontrada por el fundador en el segundo preview, no por
   ningún test:** al partir `.lp-mobnav` en fila de marca + cuerpo scrollable,
   el padding lateral de 16px que antes llevaba el panel entero se quedó sólo
   en `.lp-mobnav-body`; `.lp-mobnav-ctas` (los botones de Iniciar
   sesión/Prueba gratis) es un hermano fuera de ese cuerpo y se quedó sin
   ningún margen lateral propio, pegado a los bordes del cajón. El padding
   inferior del panel también había pasado de un mínimo fijo de 16px a sólo
   `env(safe-area-inset-bottom)`, que en la mayoría de dispositivos vale 0.
   Corregido dándole a `.lp-mobnav-ctas` su propio `padding: 14px 16px 0` y
   devolviendo al panel un mínimo de `calc(16px + env(safe-area-inset-bottom))`
   — verificado de nuevo en local a 375×650 (una altura más ajustada que la
   ventana completa) antes de volver a subir.

**Qué queda igual a propósito:**
- **Escritorio no cambia en ninguna zona.** La consola no tiene logo en su
  topbar de escritorio (sólo en la barra lateral fija); la pública sí, en
  línea con los enlaces. Son anatomías de escritorio distintas por diseño —
  unificar eso no es lo que se pidió, y contradiría BRAND-5b sin motivo nuevo.
- **La tipografía de las filas del menú no se tocó** (`.nav-item`, consola,
  13.5px/550 · `.lp-mobnav a`, pública, 15px/600). `.nav-item` es compartido
  con la barra lateral de escritorio completa, no sólo con el cajón móvil —
  tocarlo ahí es un riesgo mucho mayor que el que justifica 1.5px de
  diferencia, y las filas de cada zona ya difieren en algo más real que el
  tamaño: la consola lleva icono + contador, la pública no.

**Pendiente, sin decidir — no es parte de esta fase:** el chip de cuenta
(`AccountChip`, compartido entre las dos zonas desde §65) sigue llevando a
sitios distintos según de dónde se abra — `/dashboard` desde la cabecera
pública, `/dashboard/settings` desde el pie del cajón de consola. Puede ser
intencional (entrar vs. gestionar la cuenta) o puede ser el mismo tipo de
accidente que esta fase corrigió en el lado del cajón. Señalado, no resuelto.

**Validación:** `pnpm test` (2539/2539) y `pnpm run validate` en verde tras
cada commit; verificación visual local con Playwright en cada paso antes de
subir (no sólo en CI); el barrido de interacción automático del piloto
(`ux-pilot-result`, CI) pasó las ~64 pantallas en los cuatro despliegues de
este PR — recordatorio propio: eso confirma que nada se rompió, no sustituye
el juicio visual que exige `docs/agentic-user-pilot.md`, que corre aparte
antes del Human Gate.

**Trazabilidad.** Supersede §63 (GENSCORE-HEADER-1) en cuanto al lado del
cajón público; conserva intacto el resto de esa fase (los siete enlaces
unificados, el `activeHref`, el CTA único a `/signup`). Construye sobre §3
(anatomía de `WorkspaceTopbar`, aprobada 2026-07-24) y §65 (`AccountChip`
compartido). `docs/agentic-user-pilot.md` sigue pendiente de correr como
juicio visual formal antes del Human Gate de este PR.

---

---

## 102. Dos trozos de código que la documentación juraba vivos (PRELAUNCH-HARDENING-1 Fase R8, 2026-08-15)

**Qué se decidió.** Se borran los dos huérfanos que quedaban de la Fase R.
Ninguno de los dos era código muerto por descuido, y ahí está lo interesante:
los dos **sobrevivieron porque un documento decía que estaban en uso**.

### 1. `updateProfileName` — superseded y no retirado

CONSOLE-REDESIGN-1 (2026-08-06) fusionó las cuatro pantallas de ajustes en una
sola, y con ellas los formularios: el nombre pasó a guardarse en `saveAccount`,
junto a los datos de la organización. La action vieja se quedó exportada, sin
llamadores y **sin un solo test** —sus dos vecinas del mismo fichero,
`changePassword` y `deleteAccount`, sí están vivas y sí tienen tests—, que es
exactamente la forma que tiene el código muerto de no parecerlo: rodeado de
código vivo, en un fichero que se abre a menudo.

### 2. `action-plan.ts` — retirado del producto, «✅ Implementada» en la spec

176 líneas y 17 tests, sin un solo importador desde el 2026-08-04. No se
desconectó por accidente: lo retiraste tú en el PR #289, con la frase escrita en
el propio commit —*«no tiene sentido aquí, debe estar en la página de
recomendaciones»*— y el `page.tsx` conservaba el comentario explicando qué se
había quitado.

Lo que nadie tocó fue la documentación. `docs/specs/web-audit/ROADMAP.md` siguió
once días diciendo **«fase 3 · ✅ Implementada»** de una pantalla que ya no
existía, y su `README.md` la listaba como entregada. Un módulo sin importadores
lo encuentra cualquiera; un módulo sin importadores **que la spec jura
entregado** se lee como «esto se usa desde algún sitio que no encuentro» y
sobrevive indefinidamente.

**La lección, que es de proceso y no de código:** retirar una funcionalidad
tiene el mismo requisito de cierre que entregarla. Si el PR que la quita de la
pantalla no toca su spec, la deuda no queda documentada — queda *contradicha*.

### Lo que este borrado deja peor, dicho en voz alta

`synthesizedGuidance` era lo único que ponía texto de «qué hacer» en las
clasificaciones `content_gap`, `open_opportunity` y `unverified_cited`, porque
el motor de recomendaciones no las cubre (corre al terminar el escaneo, antes de
que exista ninguna auditoría). Al retirar la tarjeta, ese texto dejó de verse el
2026-08-04; borrar el módulo hoy no quita nada más, pero **el hueco es real y
llevaba once días sin estar anotado en ninguna parte**. Queda escrito en el
ROADMAP como hueco abierto, ya no como fase entregada. Si se resuelve, el sitio
es Recomendaciones.

La spec `phase-action-plan.md` **no se borra**: se marca retirada en cabecera,
igual que `docs/adr/` marca lo superseded. El diseño de una tarjeta dentro de
Auditoría web es justo la decisión que se revirtió, y una sesión futura que la
leyera sin ese aviso la implementaría otra vez.

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R8); PR #289
(la retirada original); log §38 (CONSOLE-REDESIGN-1);
`docs/specs/web-audit/ROADMAP.md` fila 3 y «Fase A».

---


---

---


## 103. Dieciséis pantallas con la misma pestaña, y un pendiente que valía menos de lo que dije (ROOT-METADATA-1, 2026-08-15)

**De dónde viene.** Al cerrar la Fase E dejé apuntado que el `title` y el
`description` del layout raíz seguían siendo una redacción propia de qué es
GenScore, "que actúa de respaldo para toda página sin metadata propia". El
fundador pidió el Task Intake, y **investigarlo desmontó mi propio encuadre**.

**Lo que resultó ser falso.** Lo vendí como riesgo de posicionamiento. No lo
es. Las 26 rutas sin metadata propia son **todas privadas** —21 de
`/dashboard`, `/admin`, `/debug` y las dos de `/mfa`—, todas en el `disallow`
de `robots.ts`. Ninguna página pública hereda ese respaldo. El impacto en
buscadores de cambiarlo es cero. Lo que escribí era literalmente cierto y
engañoso a la vez, porque omitía cuáles eran esas páginas: la clase de frase
que suena a hallazgo y no lo es.

**Lo que sí existía.** Las pantallas de consola compartían literalmente la
misma pestaña, «GenScore». Quien trabaja con dos o tres dominios abiertos —el
caso normal de una agencia, que es un plan que vendemos— veía seis pestañas
idénticas. Es UX de consola, no SEO, y es el único coste que alguien pagaba.

**Segunda corrección, ya implementando.** De las 26, **diez sólo redirigen**:
`/dashboard`, los cinco `/dashboard/settings/*` que sobreviven por los enlaces
de correos antiguos, `/dashboard/billing`, `runs`, `/debug` y `/admin`. Una
redirección nunca llega a pintar una pestaña, así que darle título es código
muerto. Las pantallas reales eran **quince**, no 26 — y el guardián las
distingue en vez de obligar a escribir algo inútil, porque un test que exige
código muerto es un test que alguien acaba desactivando.

**La decisión que hace que esto sirva de algo.** Un título estático por
pantalla NO resuelve el problema declarado: con tres proyectos abiertos,
«Visión general — GenScore» sigue siendo tres pestañas iguales. Las ocho
pantallas de proyecto usan `generateMetadata` y meten el dominio: «Visión
general · acme.com». **Y va delante de la marca, no detrás**, porque una
pestaña estrecha recorta por la derecha — lo que distingue tiene que
sobrevivir al recorte.

Eso sale gratis por una decisión anterior: `requireActiveProject` está
memoizada con `React.cache()` por petición desde PRELAUNCH-HARDENING-1 Fase V
(§54), y Next ejecuta `generateMetadata` y la página en el mismo render. Sin
esa memoización habría sido una consulta extra por navegación y no habría
compensado.

**Lo que se dejó fuera, y por qué no es pereza.** `title: { default, template:
"%s — GenScore" }` en el layout raíz es la solución elegante y hoy es una
trampa: hay **33 títulos públicos que ya escriben «— GenScore» a mano**, así
que la plantilla los dejaría en «Blog — GenScore — GenScore». Hacerlo bien
exige quitar el sufijo de los 33, y eso toca el `<title>` de todas las páginas
indexadas — otra clase de riesgo por completo, y su propia fase si alguna vez
compensa. Queda escrito en `console-metadata.ts` para que la siguiente sesión
no lo descubra rompiéndolo.

Tampoco se añadió `robots: { index: false }`. La regla de
`.claude/rules/growth-content.md` que lo pide habla de pantallas **públicas**
sin valor de búsqueda —`/login`, `/signup`, el 404—, que un rastreador sí
alcanza. Estas están detrás de `requireUser`: añadirlo aparentaría una
protección que ya da la autenticación.

### El piloto no podía ver esto, así que se le enseñó a mirarlo

La primera pasada dio `PILOT PASS` en las 65 pantallas, y **ese verde no decía
absolutamente nada sobre este PR**: el piloto juzga capturas, y un `<title>` no
sale en una captura. Es el caso límite de la regla que esta zona lleva toda la
semana repitiendo —§55, §62, §96, §100— llevada al extremo: no es que el
piloto mirase y se le pasara, es que **el cambio era invisible para él por
construcción**. Aceptar ese verde habría sido reportar como verificado algo que
nadie comprobó.

Así que `visitAsUser` registra ahora el `<title>` y `assertPageIsHealthy` falla
cuando es exactamente «GenScore» —la marca a secas, o sea el respaldo del
layout raíz. Exactamente, no «empieza por»: «GenScore vs Otterly …» es un
título legítimo y frecuente.

Vale para las 65 pantallas de cada pasada, no sólo para las quince de este PR,
y es lo que impide que esto vuelva a pasar sin que nadie se entere. Que hicieran
falta meses y una fase entera para que alguien mirase el sitio donde se veía el
fallo es el argumento de por qué se añade al arnés y no se deja en un test
unitario: el unitario comprueba que la función devuelve la cadena, no que la
pantalla la sirva.

**Hallazgo suelto, no arreglado:** `/dashboard/projects` y `/dashboard/domains`
tienen las dos el mismo `<h1>`, «Dominios». La primera no está enlazada desde
la navegación desde DOMAINS-REDESIGN-1. Sus pestañas salen iguales porque el
producto las llama igual, no por un fallo de esta fase; renombrar una pantalla
es decisión de producto y necesita su propia pasada.

**El `description` raíz** pasa a `CANONICAL_DEFINITION`, la misma cadena de la
Fase E. Se unifica porque una descripción divergente envejece sola, no porque
nadie la lea — que es justo lo que no hace nadie.

## 104. Retirar los dominios archivados, y la promesa que llevaba meses siendo falsa (DOMAINS-ARCHIVE-RETIRE-1, 2026-08-15)

**Cómo se llegó aquí.** ROOT-METADATA-1 (§103) puso pestaña propia a cada
pantalla de consola, y al mirar los títulos reales del despliegue salió que
`/dashboard/projects` y `/dashboard/domains` devolvían la misma: «Dominios —
GenScore». No era un fallo de los títulos — es que **el producto llamaba igual
a dos pantallas**, y una llevaba fuera del menú desde DOMAINS-REDESIGN-1. El
fundador pidió retirar la vieja.

**Lo que apareció al ir a retirarla.** Esa pantalla tenía dos mitades. La de
arriba duplicaba `/dashboard/domains`. La de abajo, «Dominios archivados», era
el **único** sitio del producto donde se veían y se restauraban los archivados
— y los archivados no son un caso raro: **bajar de plan archiva dominios**
(`changePlan`). Retirarla a secas dejaba a un cliente que baja de plan sin sus
dominios y sin forma de recuperarlos.

Se le planteó al fundador con dos salidas, y eligió la de retirarlo todo
asumiendo la pérdida.

### La promesa falsa

Al redactar el aviso apareció lo importante. El modal de bajada de plan decía,
literalmente, en el momento en que el cliente elige qué dominios sacrificar:

> «Archivar es reversible: podrás restaurarlos cuando quieras desde
> "Dominios", sin perder su configuración ni sus escaneos.»

**Ya era falsa antes de esta fase.** Desde «Dominios» no se podía restaurar
nada: restaurar vivía en `/dashboard/projects`, fuera del menú. Alguien
escribió la promesa dando por hecho que la capacidad estaría en la rejilla
nueva, y nunca se construyó. Nadie lo notó porque una promesa falsa **no rompe
nada**: la pantalla carga, el piloto la marca ✅, y el cliente sólo lo descubre
el día que intenta recuperar su dominio. El mismo fallo sin síntoma de siempre,
con la diferencia de que éste se cobra en una pantalla de facturación — que es
justo lo que PRICING-TRUTH-1 obligó a limpiar del resto del producto.

### El callejón sin salida que la retirada creaba

Y aún había una vuelta más, encontrada leyendo `createProjectCore` antes de
tocar nada. Sin pantalla de archivados, el cliente que quisiera su dominio de
vuelta intentaría **volver a añadirlo** — y el alta lo rechazaba con
`already_archived`, cuyo mensaje era *«Restáuralo para continuar»*. Un bucle
cerrado: sin sitio donde restaurar, sin poder crear, y un mensaje que le manda
usar algo que ya no existe.

Por eso la retirada trae **reactivación al volver a añadir**: un dominio
archivado se desarchiva en vez de rechazar el alta, con sus prompts, sus
competidores y su histórico. No es alcance añadido, es lo que hace que la
retirada no sea una trampa — y lo que convierte «vuelve a añadirlo» en una
frase verdadera. Respeta el tope del plan porque la comprobación de cupo ya
corre antes: reactivar no es una puerta trasera para saltárselo.

### Lo que queda declarado y no arreglado

`changePlan` sigue archivando filas: es facturación y tocarlo necesita
aprobación aparte. O sea que las filas archivadas siguen existiendo,
invisibles. Recuperar una sigue siendo posible —volviendo a añadir el dominio—
pero si el cliente no lo intenta, nada del producto le dice que están ahí.

### Y el piloto se cayó, por lo que la retirada no arreglaba sola

`PILOT FAIL` en las tres anchuras del journey de segundo proyecto, con un error
que no se parece en nada a su causa: *"Execution context was destroyed, most
likely because of a navigation"*. Suena a fallo de red; era una ruta que había
cambiado de sitio.

`discoverProjectIds` entraba por `/dashboard/projects` con
`waitUntil: "domcontentloaded"`. Sobre una redirección, esa espera resuelve
sobre el documento intermedio, el navegador se lleva la página por delante, y
el `evaluateAll` de la línea siguiente revienta. **Es la lección general, no la
anécdota: apuntar el piloto a una redirección con `domcontentloaded` es un
fallo latente en cualquier ruta que un día se retire.**

Al reapuntarlo a `/dashboard/domains` apareció lo segundo: la rejilla usa **dos
formas de enlace** —el dominio activo va a su pantalla, los demás a un cambio
de activo (`?active=<id>`)— y quedarse con la primera devuelve un solo
proyecto. El journey se habría **saltado en silencio**, que es exactamente lo
que existe para impedir. Mismo arreglo en `write-guard`, donde el fallo habría
sido peor: concluir que el proyecto de escritura no existe y crear un segundo.

De paso, la prueba que visitaba esa ruta pasa de comprobar una lista a
comprobar **la redirección**, con su `finalUrl`. Era el único sitio de la suite
que la tocaba, y una redirección rota da 404 a quien tenga el marcador sin que
nada más lo note. El fixture del self-check la sirve también como redirección,
por el mismo motivo por el que existe el fixture.

**El guardián que sale de aquí no es de redacción, es de coherencia**
(`change-plan-copy.test.ts`): si el modal vuelve a nombrar restaurar, o si
`createProjectCore` deja de reactivar, salta. Lo segundo importa más que lo
primero — el día que alguien revierta esa rama por parecer rara, el modal pasa
a mentir y el cliente vuelve a quedarse encerrado, y ninguna de las dos cosas
tiene síntoma.

## 105. Un workflow que nunca funcionó ni un día, y 1.603 ejecuciones en rojo (CODEX-BUILD-FIX-1, 2026-08-16)

**El síntoma.** `codex-build.yml` fallaba en **cada push**, incluidos los de
`main`. Salió al revisar el estado de los PRs de esta semana y quedó apuntado
como "anterior a esto y ajeno al PR" tres veces seguidas, que es exactamente lo
que le pasa a un rojo permanente: se menciona y no se toca.

**La causa, y por qué el error no se parece a ella.** Los dos últimos pasos
tenían `if: … && secrets.CODEX_AGENT_TOKEN == ''`. **`secrets` no es un
contexto disponible en el `if:` de un paso** — sólo lo son `github`, `needs`,
`strategy`, `matrix`, `job`, `runner`, `env`, `vars`, `steps` e `inputs`.
GitHub rechaza el fichero **entero** y crea un run fallido con **cero jobs**,
cuyo `name` es la ruta del fichero en vez del `name:` declarado, y cuyo evento
es `push` aunque el workflow **no tenga trigger de push**. Nada de eso se lee
como "el YAML es inválido": se lee como un workflow raro que falla.

Las tres pistas juntas son el diagnóstico, y ninguna sirve sola:

- `jobs: 0` — no llegó a planificar nada;
- `name: .github/workflows/codex-build.yml` — no llegó a leer el `name:`;
- `event: push` — se está atribuyendo al push que lo hizo fallar, no a un
  disparador real.

**Cuánto llevaba así.** Desde el 2026-08-02, colado dentro de un PR de blog
(GROWTH-2 Fase 2.5). **1.603 ejecuciones, el 100% en rojo, ninguna con un solo
job.** No es que se rompiera: nunca funcionó.

**Por qué merecía arreglarse aunque el workflow no haga nada.** Es un
*placeholder* declarado —todos sus pasos escriben en `$GITHUB_STEP_SUMMARY` y
nada más (`docs/agentic-delivery-pipeline.md`: *"guardrails and placeholders,
not autonomous agent runners"*)— así que el arreglo no habilita ninguna
capacidad. Lo que arregla es otra cosa: **un rojo permanente en cada push
entrena a todo el mundo a ignorar la lista de checks**, y esa lista es donde
tiene que verse un fallo de verdad. Esta misma semana `ci.yml` no se disparó
solo dos veces y hubo que lanzarlo a mano — en una lista donde algo siempre
está rojo por defecto, eso se pasa por alto sin esfuerzo.

**El arreglo.** El secreto se expone en `env:` a nivel de job y los pasos
comprueban `env.CODEX_AGENT_TOKEN`. Cuatro líneas. Con el fichero válido, el
workflow deja de dispararse en push —no tiene ese trigger— y sólo corre donde
siempre quiso: `issues` y `workflow_dispatch`.

**Lo vigila `tests/workflow-contexts.test.ts`**, verificado en las dos
direcciones. Barre sólo `secrets` en `if:` a propósito: es el error real y el
que no avisa, y ampliarlo a otros contextos metería falsos positivos en un
guardián que entonces alguien acabaría desactivando (§94).

**Queda declarado y NO hecho: este workflow no hace nada.** Ni siquiera con el
secreto puesto — sus dos ramas escriben un resumen y terminan. Borrarlo entero
es defendible y hay precedente directo (`claude-qa.yml` y
`scripts/run-claude-qa.py`, borrados en PRELAUNCH-HARDENING-1 Fase 0 por
llevar meses declarados superseded). No se ha hecho aquí porque el encargo era
arreglarlo, y borrar una pieza del andamiaje agéntico documentado es una
decisión de producto, no una limpieza. Si se borra, se van con él la fila del
mapa de zonas y las menciones de `docs/agentic-delivery-pipeline.md`.

---

## 106. La orquestación de Auditoría web, fuera de su pantalla y por fin verificable (PRELAUNCH-HARDENING-1 Fase R7-b, 2026-08-16)

**Qué se decidió.** Las ~330 líneas que deciden qué enseña Auditoría web salen
de `page.tsx` a `lib/web-audit/page-data.ts`, con **26 tests** que son lo
primero que ha mirado nunca esa lógica. La pantalla se queda en 860 líneas y
`return (…)`.

### El diagnóstico del plan estaba mal, y medirlo cambió el corte

El plan decía «partir `WebAuditPage`, ~1.070 líneas de orquestación de datos».
Medido: de sus 1.156 líneas, **~330 son orquestación y ~740 son JSX**. Partir
por tamaño habría movido 740 líneas de maquetado a cambio de nada verificable,
con el riesgo de mudanza que R7 ya cobró una vez (§83, el bloque duplicado que
el compilador y el lint dejaron pasar).

**El tamaño nunca fue el problema; la testabilidad sí.** Ocho consultas,
cuarenta y dos valores derivados y un efecto secundario, soldados al JSX que los
pinta: la única forma de observar cualquiera de esas decisiones era abrir un
navegador. Mismo diagnóstico que Q1 hizo con `createProject` (§89) y misma cura.

### El punto delicado: un efecto secundario dentro de la lógica

En la línea 268 vivía `after(() => triggerWebAuditRun())` — abrir la pantalla
despierta al worker si hay una auditoría vencida (ADR 0038). Llevárselo al
módulo lo habría dejado tan poco testeable como estaba; dejarlo en la pantalla
sin más separaba la decisión de la acción sin criterio.

**El loader DEVUELVE `shouldDispatchAudit` y la pantalla actúa.** Es lo que
`.claude/rules/server-actions.md` ya exigía para las actions, por el mismo
motivo, y compra una garantía concreta que antes no existía: **un job en
`retrying` con el backoff aún corriendo no dispara nada.** Ese backoff llega a
10 horas y cada despacho de más son llamadas reales de Gemini.

### Lo que las mutaciones enseñaron

Se probaron cuatro cambios deliberados para ver si los tests mordían. Tres
murieron a la primera. **La cuarta —`heroScore` siempre el compuesto—
sobrevivió**, y el motivo no era un test flojo: en una cuenta free recién creada
el compuesto ES la nota técnica (media de un solo valor), exactamente lo que
dice el comentario de esa línea. Las dos ramas sólo se distinguen en **una
cuenta que bajó de plan**, con cobertura persistida de cuando era Pro. Ese caso
se añadió y la mutación murió.

Sin la pasada de mutación, esa aserción habría quedado como decorado: verde,
extensa, y sin discriminar nada.

### Dos cosas que se aprendieron equivocándose

- **`technicalScoreDelta` no sale de `readiness_score`.** Se escribió el test
  variando esa columna, dio 0, y el código tenía razón: el delta compara
  `actualReadinessScore`, recalculado desde los `pageScore` con los criterios de
  hoy. La columna guarda lo que valía con los de entonces, y compararlas
  resucitaría la regresión fantasma que WEB-AUDIT-R3 y
  `TECHNICAL_CRITERIA_EXPANDED_AT` existen para explicar. Queda fijado por test.
- **El barrido de variables consumidas por el JSX se dejó una.** El `grep` no
  cogía las desestructuradas, así que `latestRunRow` no apareció en la lista de
  22 y sí se usaba. Lo cazó el typecheck. Se expone como `hasCompletedScan`
  —booleano, no la fila— porque la pantalla sólo preguntaba `!latestRunRow`, y
  devolver la fila entera invitaría a leer campos que el módulo ya usó para
  derivar `auditedScanDate`: dos fuentes para el mismo hecho.

### La comprobación que de verdad prueba que esto fue un refactor

Comparación de multiconjunto de líneas del `return`: **743 líneas antes, 743
después, y una sola diferencia** — el renombrado de `latestRunRow` a
`hasCompletedScan`. Ni un test existente cambió. La única normalización es un
`?? null` en `auditedScanDate`, inobservable: sin escaneo la expresión original
devolvía `undefined` bajo un tipo que prometía `string | null`, y su único
consumidor lo usa como condición de verdad.

**Lo que esto NO cubre, dicho claro:** que el JSX pinte estos valores donde
debe. Eso es del `ux-pilot` y de los tests de render de `_components/` (§87).
Los tres juntos son la cobertura de esta pantalla; ninguno solo lo es.

**Con esto la Fase R queda cerrada entera.**

**Trazabilidad.** `docs/prelaunch-hardening-plan.md` §Fase R (R7);
`.claude/rules/web-audit.md`; §83 y §87 (R7, componentes y tests de render);
§89 (el mismo corte en `createProject`); ADR 0038 (el despacho desde el render);
ADR 0033/0035 (la puerta y la cifra principal).

---


---


---

---

## 107. El único documento pensado para copiarse fuera (SEO-POS-1 Fase A, 2026-08-16)

Fase A es la capa que el plan siempre asignó al fundador: Reddit, YouTube,
directorios, nota de prensa. Los agentes preparan el material; publicar y
conversar no es una fase de código. Esto es el material:
`docs/off-site-authority-kit.md`.

**Por qué hacía falta y no es "más contenido".** Todo lo construido en este
plan —blog, docs, comparativas, la entidad de la Fase E— vive **en nuestro
dominio**. Un motor que sólo encuentra a una marca hablando de sí misma tiene
poco con lo que corroborarla, y la investigación de content-strategy §3 dice
que la mayoría de las citas generativas vienen de medios ganados que no son de
primer nivel. Sin esta capa las otras rinden a medias.

### Lo que hace distinto a este documento

Es **lo único del repositorio pensado para copiarse y pegarse fuera**: en una
ficha de G2, en la descripción de un vídeo, en un hilo. Y lo de fuera no se
refresca solo. El día que cambie un precio, el sitio se actualiza en el mismo
PR y una ficha de G2 de hace ocho meses no — y nadie lo va a notar, porque ni
el piloto ni el compilador ni Search Console miran ahí.

Por eso el kit no es prosa suelta: `tests/off-site-kit.test.ts` contrasta su
tabla de planes contra `plans-data.ts` fila a fila, exige que la definición de
marca sea **literalmente** `CANONICAL_DEFINITION` —no una versión parecida, que
es justo lo que la Fase E existe para eliminar— y exige que sigan declarados
los tres límites que un comprador comprueba en dos clics. Verificado
rompiéndolo: subir Starter de 45 a 49 € pone el test rojo nombrando el plan.

Es la regla de "si una cifra del producto llega a publicarse, se ata al código
con un test" (§75) un escalón más lejos: aquí la cifra ni siquiera vive en
nuestro dominio.

### Las dos decisiones de criterio

**Reddit se plantea por el riesgo, no por la oportunidad.** El fallo caro no es
que no funcione: es un baneo y el nombre asociado a spam en un sitio que los
motores citan mucho — peor que no estar, porque toda la Fase E va de que
"GenScore" resuelva a algo bueno. De ahí las reglas: responder sin enlazar es
la norma, declarar quién eres al nombrar el producto, y no recomendarnos donde
no encajamos. La advertencia previa contra uno mismo sigue prohibida (§67);
declarar el conflicto de interés no es lo mismo que invitar a descontar todo lo
que viene después.

**La nota de prensa se declara bloqueada, no pendiente.** Depende del
Observatorio, que no está aprobado. Dejar preparada la plantilla habría sido
crear un molde que invita a rellenarse con números que nadie ha medido — la
definición exacta de métrica falsa, y en el formato donde más caro sale. Se
escribirá **desde** el primer estudio real.

### El bucle que vuelve al código

`organization-schema.tsx` no declara `sameAs` porque hoy no hay ningún perfil
real que citar (§100). En cuanto existan LinkedIn, YouTube y las fichas, esas
URLs son `sameAs` legítimos y añadirlas es el refuerzo de entidad más barato
que queda. **Nunca al revés**: no se declara el `sameAs` de un perfil que aún
no existe.

**Lo que esta fase NO cierra:** nada se ha publicado. El kit es material; las
cinco acciones siguen abiertas y son del fundador.

---

## 108. La puerta de CI deja de depender de un evento que se pierde (CI-REDUNDANCY-1, 2026-08-16)

**Qué se decidió.** `ci.yml` pasa a dispararse también por `push`, no sólo por
`pull_request`. Dos disparadores independientes para la misma puerta.

### El problema no era que CI fallase: era que no existía

`pull_request` se pierde. Está medido dos veces: el 2026-08-10, misma rama y
misma tarde, **tres pushes no dispararon la comprobación y dos sí** (§54); y el
2026-08-16, **dos veces seguidas en el PR #427** — y al reponerlo a mano
apareció un fallo real (la grafía `Genscore`, prohibida por `naming.test.ts`)
que llevaba una hora invisible.

**La ausencia de un check no se ve; un check rojo sí.** Ése es el fallo entero.
Un PR llegaba al Human Gate sin que se hubiera ejecutado un solo test, con la
lista de checks enseñando un piloto en verde, y nada decía que faltaba nada. El
aviso de Q5 (§97) hizo que se viera; esto hace que casi no ocurra.

### Por qué NO se colapsan los dos disparadores en uno

Un push a una rama con PR abierto dispara ahora `push` **y**
`pull_request:synchronize`: dos runs del mismo job. La tentación es unificar el
grupo de `concurrency` para que sólo sobreviva uno, y **es exactamente lo que no
se debe hacer**: con `cancel-in-progress`, uno cancelaría al otro, y un run
cancelado no cuenta como superado. La redundancia se convertiría en un fallo
intermitente — peor que el problema original.

Se paga un run duplicado por push (~90 s). Barato al lado de los ~20 minutos que
cuesta la pasada del piloto, que sí corre siempre.

### `pilot-evidence/**` queda fuera, y no es un detalle

Esas ramas no llevan `package.json`: `pnpm install --frozen-lockfile` falla ahí
**siempre**. Un check rojo por diseño es justo el mecanismo por el que 1.603
ejecuciones en rojo pasaron cuatro meses desapercibidas (§105) — entrena a todo
el mundo a no mirar la lista.

### Lo que esto NO es, y sigue pendiente del fundador

**No es la puerta.** Que el check exista no impide mergear con él en rojo. La
puerta es una *required status check* en la protección de rama de `main`, que es
un ajuste del repositorio y **no vive en este repositorio**: no se puede activar
desde el código ni desde las herramientas de un agente. Queda dicho por tercera
vez, ahora con el trabajo de código ya hecho al lado: lo único que falta es
marcar una casilla.

`tests/ci-triggers.test.ts` impide que la redundancia se borre «por limpieza»:
un futuro lector verá dos disparadores para lo mismo y el test le explicará, en
el mensaje del fallo, por qué están los dos.

**Trazabilidad.** §54 (la primera medición de la intermitencia); §97 (el aviso
de ausencia de CI, Fase Q5); §105 (el coste de un rojo permanente);
`.github/workflows/ci.yml`.

---

## 109. Una cabecera plana para cada zona (HEADER-FLAT-1, 2026-08-15)

**Estado: implementada.** Continuación directa de §101, pedida por el fundador
con dos capturas de móvil y una frase muy precisa: *«en la consola la cabecera
tiene como un degradado a oscuro en la izquierda y la hamburguesa es de tres
rayas. En la pública la cabecera es plana, fundiéndose más con la página y la
hamburguesa es más minimalista»*. Al concretar el alcance lo amplió él mismo:
*«hacemos una cabecera para toda la consola y la otra para toda la zona de
marketing»*.

**Lo primero que hubo que corregir fue mi propio análisis.** El informe inicial
daba por hecho que hablaba de escritorio y proponía subir la marca a una barra
de ancho completo. No era eso: hablaba de móvil, y de tratamiento, no de
estructura.

**Qué se ha hecho, en las dos zonas:**

- **La cabecera nace plana** —sin fondo ni borde— en vez de barra blanca sólida
  con borde `--line`. En la consola aparece un fondo de cristal translúcido al
  desplazar; en la pública no aparece nunca (ver abajo, no es un olvido).
- **Hamburguesa de dos rayas** (`menu2`) en todas partes. Ese glifo ya existía
  pero sólo lo usaba la portada; la consola y el resto de superficies públicas
  llevaban el de tres.
- **La campana pierde su caja.** Era un botón de 32&nbsp;px con borde de
  1,5&nbsp;px y fondo blanco propio: sobre una cabecera plana, lo único que
  seguía pareciendo un control pegado encima. Queda como icono suelto con la
  misma huella que la hamburguesa, para que los dos extremos pesen igual.
- **`PublicHeader` pone ahora su propio `.lp-nav-wrap`.** Antes lo envolvían a
  mano **cinco ficheros de shell** (`blog-page-shell`, `legal-page-shell`,
  `docs-page-shell`, `pricing-page`, `app/geo/page`) que entre ellos cubren las
  siete superficies públicas —comparativas y glosario comparten el shell del
  blog— y la
  portada no lo hacía en absoluto — de ahí salía exactamente la diferencia que
  el fundador veía. Es el mismo patrón que §63 aplicó a los enlaces: la
  duplicación se elimina moviendo la responsabilidad al componente.

**Dos hallazgos que cambiaron el diseño a mitad de camino, ambos medidos y no
supuestos:**

1. **La cabecera de consola no solapa nada.** Yo había avisado al fundador de
   que dejarla transparente arriesgaba que el contenido se leyera por debajo, y
   de que el logo quedaría sobre el aviso lila. **Las dos cosas eran falsas:**
   `.shell` es `overflow:hidden` a `100dvh` y quien scrollea es `.dash-content`,
   que es *hermana* de la cabecera. Nada pasa nunca por debajo. El detector de
   scroll se conserva, pero por otra razón — sin borde, el contenido que sube se
   recorta contra un canto invisible y parece cortado; el fondo al desplazar
   existe para darle ese canto, no para tapar.
2. **El `sticky` de la cabecera pública lleva roto desde antes de esta fase.**
   Se implementó el mismo estado de cristal para la zona pública y, al medirlo,
   no aparecía nunca. Comprobado con `git stash` **sobre `main` sin tocar**:
   tras desplazar 500&nbsp;px, `.lp-nav-wrap` está en `y: -500` tanto a 375
   como a 1280&nbsp;px. La causa es `html { overflow-x: hidden }`, puesto en
   GROWTH-2 Fase 2.1 para contener un desbordamiento de 3&nbsp;px: convierte el
   documento en contenedor de scroll y desactiva el pegado de sus
   descendientes. **No se ha arreglado aquí a propósito** — quitar esa guarda
   puede devolver el desbordamiento y es su propia fase, con su propia pasada
   de piloto. Lo que sí se hizo fue **retirar el código muerto**: un estado que
   no puede verse nunca es peor que no tenerlo, porque la siguiente sesión lo
   dará por funcionando. Queda escrito en el CSS dónde volver a añadirlo si esa
   guarda desaparece.

**Lo que NO cambia:**

- **El escritorio de la consola sigue sin marca en su cabecera** (vive en la
  barra lateral) y la pública sigue midiendo 101&nbsp;px con sesión iniciada por
  un chip que hereda el relleno del cajón móvil. Las dos cosas se midieron y se
  documentaron en el artefacto de esta fase, y las dos quedan **pendientes a
  propósito**: son estructura, no tratamiento, y el fundador acotó esto último.
- **La portada se comporta igual que siempre:** su cabecera vive dentro de
  `.lp-hero` (`overflow:hidden`), así que se marcha con el hero. Ahora las otras
  seis se marchan también, pero porque el `sticky` no funciona en ninguna, no
  porque se haya decidido.
- La 404 (`.nf-page`) mantiene su cabecera opaca: sobre su cuerpo oscuro ni el
  estado plano ni el de cristal sirven.

**Addendum (fundador, mismo día): fuera la sombra del cajón cerrado.** Al ver
el preview señaló *«la parte izquierda como un pequeño degradado más
oscuro»* y —esto es lo valioso— no pidió quitarlo: pidió entender por qué
estaba y si aportaba. Era la sombra del cajón lateral: cerrado vive fuera de
pantalla (`translateX(-100%)`) pero conservaba `box-shadow: 20px 0 60px` y,
con `z-index: 320` contra el 30 de la cabecera, la proyectaba sobre todo el
borde izquierdo. Medido muestreando píxeles a lo ancho de la cabecera: borde
en `rgb(218,220,223)` contra `rgb(246,247,249)` de lienzo, 28 niveles de
caída. **No lo trajo esta fase**: con la cabecera blanca la caída era de 29
niveles, idéntica; lo único que cambió es que el conjunto es ahora 9 niveles
más oscuro y deja de disimularla. La sombra existe para despegar el cajón
*cuando está abierto*, así que pasa a `.shell.mobnav-open .sb`. Verificado en
las dos direcciones: cerrado, el borde mide `246,247,249` de extremo a
extremo; abierto, la sombra reaparece en `rgb(222,223,225)` junto al panel.

**Diseño aprobado:** `docs/design-reference/header-flat-1/`. El fundador lo
aprobó sobre ese artefacto antes de escribir código, así que se commitea con
la fase — un enlace de chat no lo puede abrir ni CI ni una sesión futura, y la
mitad de fidelidad de diseño del piloto se quedaría sin referencia. Su README
deja anotados **los dos avisos del artefacto que la implementación demostró
falsos**, en vez de editarlos para que parezca que acerté.

**Trazabilidad.** Continúa §101 (que unificó el chasis del cajón) y §63 (que
unificó enlaces y CTAs). El bloqueo del `sticky` se remonta al comentario de
`html { overflow-x: hidden }` en `app/globals.css`, GROWTH-2 Fase 2.1 (PR #286).

---


---

## 111. Se retira la banda «Revisando tu web» de Visión general — dos avisos del mismo hecho en la misma pantalla (2026-08-16)

**El problema, señalado por el fundador con una captura.** Mientras la
auditoría técnica del primer escaneo corre, Visión general mostraba **dos**
señales simultáneas del mismo hecho: la pastilla «Auditando…» del
sticky-header (`ScanStatePill`) y, justo debajo, la tarjeta clicable «Revisando
tu web / La auditoría técnica sigue en marcha. No hace falta que esperes
aquí» (`ScanMissionBand`, ONBOARDING-ROCKET-1). Un tercer sitio —la pantalla
de Auditoría web— ya cuenta la misma historia con la escena completa del
cohete en reentrada (`ReentryMission`, SCAN-STATES-3). El fundador: *«tampoco
hace falta, la auditoría web tiene su propio estado de escaneando con el
cohete en reentrada»*.

**Por qué esto NO es el mismo bug que §112.** El banner de §112 era stale —
afirmaba algo falso tras terminar el escaneo. `ScanMissionBand` no mentía
nunca: su condición (`shouldShowMissionBand`, exactamente 1 escaneo completado
y una auditoría activa) era correcta y tenía tests. El problema no era
veracidad, era **redundancia entre dos superficies a la vez visibles en la
misma pantalla** — se preguntó explícitamente al fundador el alcance antes de
tocar nada, porque quitar un componente probado y diseñado a propósito no es
lo mismo que corregir un dato falso.

**Qué se decidió.** Se retira la banda entera de Visión general y se deja de
pasarle `auditing` a su `ScanStatePill` — la pastilla vuelve a mostrar solo
`Escaneando…`/`Analizando…`/`Escaneado <fecha>` ahí, igual que en Prompts,
Competidores, Citas y Recomendaciones (ninguna de esas pantallas pasó nunca
`auditing`; Visión general era la única excepción). La pastilla «Auditando…»
de Auditoría web (`app/dashboard/projects/[projectId]/web-audit/page.tsx`) NO
se toca — ahí es la propia pantalla afirmando su propio estado, no una segunda
voz sobre el mismo hecho.

**Lo que esto deja sin dueño, dicho en voz alta.** Con la banda fuera, Visión
general no vuelve a mencionar la auditoría mientras corre — ni pastilla ni
tarjeta. Quien quiera saber que está en marcha tiene que entrar a Auditoría
web y ver el cohete en reentrada o la pastilla propia de esa pantalla. Es la
elección explícita del fundador entre las opciones planteadas, no un olvido.

**Código muerto retirado en el mismo PR**, no dejado atrás para una sesión
futura que se pregunte si sigue en uso: `components/scan-mission-band.tsx`
entero, `shouldShowMissionBand` y sus 4 tests en
`lib/scan/mission-beats.ts`/`.test.ts`, la consulta a `jobs` que sólo existía
para alimentar la banda y la pastilla de Visión general
(`activeAuditJobCount`/`hasActiveAuditJob` en `page.tsx`), y el CSS `.mba-*`
de `app/globals.css`.

**Trazabilidad.** ONBOARDING-ROCKET-1 (`docs/design-reference/scan-states-1/rev3-cohete-secuencia.html`,
sección "La misión suelta la pantalla a mitad" — su diseño queda superseded
por esta retirada, no borrado del artefacto histórico); SCAN-STATES-3
(`ReentryMission`, `docs/design-reference/scan-states-1/rev6-reentrada.html`);
DOMAINS-REDESIGN-1 (`ScanStatePill`, log §26).

---

## 110. El autofix que arregla lo que llevaba una semana arreglándose a mano (LOG-NUMBERING-AUTOFIX-1, 2026-08-16)

**Qué se decidió.** `pnpm run fix:log-numbering` — un script que hace, sin
manos, los cinco pasos que este histórico llevaba repitiendo a mano desde que
`tests/log-numbering.test.ts` empezó a cazar colisiones: mergear, renumerar la
cabecera, mover la sección al final, y actualizar SUS referencias sin tocar las
de la otra sección.

### Lo que costaba de verdad no era detectar, era decidir sin equivocarse

El identificador es un ordinal en un fichero append-only: dos ramas calculan
`max + 1` sobre bases que envejecen, y git mezcla los dos apéndices sin un solo
marcador de conflicto. **Siete colisiones en dos días** (2026-08-15 y 16), la
mayoría entre esta misma rama y `main`, y una vez —§107, HEADER-FLAT-1 contra
SEO-POS-1 Fase A— **entre dos PRs ajenos, ninguno mío**, ya mergeados los dos
cuando colisionaron entre sí. El test siempre las cazó; el coste era el arreglo,
y recaía siempre en quien mergeaba segundo.

### El criterio que decide, y por qué es seguro dejarlo en manos de un script

De las dos secciones que comparten número, la que ya está publicada en
`origin/main` —mismo número, mismo título— se queda donde está; la que no está
en `main` se renumera al siguiente libre. Es el mismo criterio que el mensaje
del test ya recomendaba a mano, hecho determinista.

**Cuando no puede decidir, no adivina.** Si las dos secciones YA están en
`main` —el caso HEADER-FLAT-1/SEO-POS-1— ninguna es "la nueva", y el script
imprime el hallazgo y sale en rojo sin tocar nada. Esa vez se resolvió a mano,
dentro del PR #429, comprobando en `git log` cuál de los dos PRs mergeó
después.

### El alcance de las referencias, que es donde vivía el riesgo real

Sólo toca `§N` en líneas que el `git diff` contra `origin/main` marca como
AÑADIDAS por esta rama (o ficheros que no existen en `main`, donde se tocan
todas). Nunca una línea que ya estaba en `main` sin cambios — es lo que impide
corromper una referencia legítima a la sección que se queda. 26 tests cubren
las funciones puras y cuatro escenarios de punta a punta sobre un repo git de
verdad, siguiendo el mismo patrón que `vercel-should-build.test.ts`.

**Un bug real, cazado por los propios tests antes de mergear:** con dos
secciones compartiendo número, `applyRenumber` buscaba sólo por número y cogía
la primera que encontraba — a veces la que había que CONSERVAR, no la que había
que mover. Lo delató el test de integración del caso común, que hizo falta
depurar contra un repo temporal real para ver qué renumeraba de verdad. Ahora
busca por número Y título.

### Lo que NO arregla, dicho claro

Las siete colisiones heredadas (§33, §36, §39, §54, §55, §65, §70) siguen sin
tocar — congeladas a propósito porque renumerarlas rompería referencias ya
publicadas; merecen su propia pasada deliberada. Y la colisión "ya dentro de
main entre dos PRs ajenos" sigue necesitando una decisión humana: el script no
puede saber cuál mergeó después sin que se lo digan.

**Trazabilidad.** `scripts/fix-log-numbering-core.ts`;
`scripts/fix-log-numbering-core.test.ts`; `tests/log-numbering.test.ts`; §108
(CI-REDUNDANCY-1, la misma tarde); §109 (HEADER-FLAT-1, la sección renumerada
en el ejemplo).

---

---

## 112. El aviso verde de «tu primer escaneo se está ejecutando» reaparecía ya terminado el escaneo (2026-08-16)

**El problema, reportado por el fundador con una captura del móvil.** En
Visión general, el banner de éxito `scan_started` («Dominio creado. Tu primer
escaneo se está ejecutando — sigue el progreso aquí») aparecía **a la vez** que
la puntuación GEO ya calculada y la etiqueta «Escaneado 16 ago 2026» — es
decir, después de que el escaneo hubiera terminado. Nadie recargó nada a mano.

**La causa.** SCAN-STATES-2 (§56) ya había decidido ocultar este banner
mientras la misión del cohete ocupa la pantalla, con la condición
`isFirstScan && activeRun`. Pero `?success=scan_started` se queda en la URL
después del redirect inicial, y `ScanProgressPoller` dispara un
`router.refresh()` en cuanto el run pasa a estado terminal, sin acción del
usuario. En ese refresh `activeRun` ya no existe **y** `isFirstScan` ya ha
pasado a `false` (hay 1 escaneo completado), así que la condición de ocultado
deja de cumplirse y el texto stale —que sigue diciendo «se está ejecutando»—
vuelve a mostrarse, ahora contradiciendo los datos reales que tiene debajo.

**Primer intento, y por qué se quedó a medias.** Se cambió la condición de
ocultado a depender sólo de `activeRun` (`!activeRun` ⇒ ocultar), razonando
que `isFirstScan` era redundante en el momento del redirect. Es la mitad
correcta del argumento y la mitad equivocada del código: `!activeRun` oculta
el banner **después** de terminar, pero lo deja pasar **mientras** `activeRun`
es verdadero — es decir, mientras la misión del cohete está en pantalla, que es
el caso exacto que SCAN-STATES-2 prohibió en primer lugar. El fundador lo cazó
en el acto, con una captura del banner flotando sobre el cohete en plena
órbita: la condición había quedado invertida respecto a la intención.

**Qué se decidió, de verdad.** Esta clave sólo la dispara la creación de
proyecto (`app/dashboard/projects/actions.ts`), así que no existe ningún
momento en el que mostrarla sea correcto: mientras el escaneo corre, la misión
ya dice lo mismo; en cuanto termina, el texto es falso. Se suprime sin
condición (`feedback.success !== "scan_started"`), no se «gatea» contra
ningún estado del run.

**No se revisaron el resto de claves de `feedbackSuccessMessages`** porque
ninguna comparte el patrón: o describen un hecho estable que no caduca
(«Escaneo completado», los toggles de `/debug`), o no dependen de un estado
transitorio que el propio poller invalida en segundo plano. `scan_started` es
la única clave que nunca debía renderizarse como banner.

**Trazabilidad.** §56 (SCAN-STATES-2, decisión de ocultado original — la razón
de fondo no cambia, sólo la condición de código que la implementaba);
`components/scan-progress-poller.tsx` (el `router.refresh()` que dispara el
refresco silencioso que expuso el caso "ya terminado").

---

---

---

## 113. Una página que capta el dominio en vez de fingir que lo comprueba (FREE-CHECKER-1 Fase A, 2026-08-15)

**Qué se decidió.** `/gratis/aparece-mi-marca-en-chatgpt`, primera pieza de la
Fase P de `docs/seo-positioning-plan.md` (comprobador gratuito público).
Task Intake propio, aprobado por el fundador solo para esta fase — las otras
dos preguntas del Task Intake (autorización de esquema/RLS para una
comprobación real, y Gemini vs. ChatGPT como motor) siguen sin respuesta y
bloquean cualquier fase posterior.

**Por qué esta fase y no la comprobación real.** El coste real medido
(`docs/llm-cost-analysis-2026-08.md`) de una comprobación anónima de 3
prompts es ~0,016 $ — la mitad de un escaneo Free completo — y hoy no existe
en el repositorio ningún primitivo para limitar a un visitante sin cuenta:
sin rate-limit por IP, sin Redis, sin captcha. 1.000 consultas/día costarían
32× el gasto LLM actual del producto, y 500/día agotarían el tramo gratuito
de grounding de Gemini que comparten los clientes de pago. Cualquier versión
que llame a un LLM de verdad necesita una tabla nueva (migración), una
política RLS nueva o escritura por service-role en una ruta anónima — las
tres prohibidas sin aprobación explícita del fundador (CLAUDE.md), y esa
aprobación no se ha pedido todavía.

**Lo que sí se decidió: medir demanda antes de construir la máquina.** La
página capta el dominio con el mismo mecanismo que ya usa el hero de la
landing (`lib/onboarding/pending-domain.ts`, sin modificarlo — arrastre por
`localStorage`, se consume al leerlo) y lleva al registro real, donde el
asistente lo recoge y lanza el escaneo real del plan Free. Cero llamadas LLM,
cero escritura en base de datos, cero esquema nuevo.

**Honestidad del copy, no solo del backend.** La página dice explícitamente
que no es un resultado instantáneo — es el escaneo real del plan Free (10
prompts, 1 motor) — porque prometer una comprobación inmediata y entregar un
registro habría sido el mismo "fake scan" que CLAUDE.md prohíbe, solo que en
la página de captación en vez de en el producto.

**Reutiliza el shell de blog, no un layout nuevo.** `BlogPageShell`, el mismo
que usan `/glosario` y `/comparativas` — `growth-content.md` fija cinco
shells de marketing y ninguno añade un `<Link>` de pie a mano.
`.lp-cta:disabled` es el único CSS nuevo: el botón no existía deshabilitado
en ningún sitio del sistema y el criterio de aceptación exige que un dominio
inválido no habilite el envío.

### El CTA muerto que ninguna aserción podía cazar

La primera versión deshabilitaba el botón hasta tener un dominio válido. Suena
correcto y en pantalla era lo contrario: **el CTA principal —lo único que la
página existe para que pulses— recibía al visitante gris y apagado**, antes de
que hubiera hecho nada mal. Eso no se lee como «escribe algo primero», se lee
como «esto está roto», y estaba en la primera pantalla del embudo de captación.

**El piloto lo dio por PASS, y no es un fallo del piloto.**
`tests/pilot/support/page-audit.ts` salta los controles deshabilitados al medir
contraste (`if (control.disabled) continue;`) porque **WCAG los exime de AA**:
mecánicamente la página era impecable. Es el caso puro de lo que el cuarto
criterio del piloto existe para juzgar —«¿esto es bueno, no sólo correcto?»— y
de por qué el veredicto no es la tabla de ✅ sino la lista de capturas que
alguien abrió. Se encontró mirando la captura de móvil, donde el botón gris
ocupa el centro de la primera pantalla.

**El arreglo no fue pintar mejor el estado deshabilitado, fue quitarlo.** El
botón siempre invita; al pulsarlo sin un dominio válido devuelve el foco al
campo y enseña una pista concreta (`.fc-hint`, `--brand-neg` sobre fondo claro,
4,6:1). Es además la política que el hero de la landing ya tenía escrita y
justificada: bloquear el alta es peor que arrastrar un dato de menos.

`.lp-cta:disabled` se queda en `globals.css` aunque ninguna pantalla lo use, y
**en azul atenuado, nunca en gris**: el día que alguien lo necesite, sin esa
regla heredaría el azul a plena fuerza y parecería pulsable. Al estar exento de
AA, no lo vigila ningún test — sólo el ojo.

### El motor decide el titular, y el titular decidió el motor

La fase B se aprobó con **Gemini** por coste (0,002 $ contra 0,0117 $ por
llamada). Al ir a escribir el copy apareció la consecuencia que esa decisión
arrastraba y que no estaba sobre la mesa al tomarla: **si la comprobación
pregunta a Gemini, el titular no puede decir ChatGPT**, y la página entera
existe por la consulta "¿aparece mi marca en ChatGPT?".

La salida propuesta fue reencuadrar la página a "la IA" y quedarse con Gemini.
El fundador eligió la contraria (2026-08-15): **ChatGPT como motor**, pagando
la diferencia, *"maximiza el posicionamiento de ChatGPT en todo el artículo si
eso es lo que más visitas nos va a traer"*. Es la lectura correcta del
trade-off: los ~90 $/mes de diferencia recortaban la factura y tiraban la
palabra clave que justifica la página. El coste del techo pasa de ~1,80 $/día
a **~4,80 $/día** (~145 $/mes en el peor caso absoluto), escrito en el test del
límite para que subirlo no sea silencioso.

**El perfil y la derivación de la pregunta se quedan en Gemini**: son pasos
internos que el visitante no ve, así que ahí el motor barato no cuesta nada ni
en honestidad ni en posicionamiento.

### Por qué esto NO canibaliza al artículo S1

`/blog/como-saber-si-tu-marca-aparece-en-chatgpt` ya tiene
`primaryKeyword: "cómo saber si mi marca aparece en chatgpt"`. Dos URLs propias
peleando por una consulta es que Google elija una y ninguna rinda como habría
rendido una sola.

No ocurre porque **la intención es distinta**: S1 es informacional (una guía de
tres métodos, para quien quiere entenderlo) y el comprobador es transaccional
(para quien no quiere leer nada). Misma keyword raíz, SERP distinta, y se
enlazan entre sí en vez de competir. Por eso se descartó también la idea de
hacer tres páginas —una por motor—: habría canibalizado a S1, dos de las tres
habrían sido falsas mientras el motor no fuera el del titular, y "aparece mi
marca en Gemini" no tiene búsquedas.

**Los tres motores aparecen, cada uno donde es cierto**: ChatGPT manda porque
es lo que ejecuta la comprobación gratuita; Gemini y Claude viven en el escalón
de pago y en las FAQ, porque es ahí donde el producto los ejecuta de verdad.
Nombrarlos no es relleno de densidad —la regla de `growth-content.md` dice que
la densidad es un techo, no un objetivo—: es que una página sobre visibilidad
en IA que sólo nombrara uno describiría mal lo que se vende.

### Cuando hay resultado, la página ES el resultado

La primera versión metía el veredicto **dentro** de la página de venta: debajo
seguían "qué comprobamos exactamente", "por qué importa aparecer en ChatGPT" y
las cinco FAQ, y arriba el H1 seguía invitando a escribir el dominio. Todo ese
copy existe para convencerte de hacer una cosa que **acabas de hacer**, así que
dejarlo ahí convierte la respuesta en un anuncio con un dato encima.

El arreglo no fue CSS: el componente de cliente recibe la cabecera y el copy
como `props` y deja de pintarlos en cuanto hay algo que enseñar. Siguen
renderizándose en servidor —llegan como JSX, no se duplican en el cliente—; lo
único que decide el cliente es si se ven.

**Dos remates que sólo aparecen mirando la pantalla**, no en ninguna aserción:
la página se encogía de la portada larga a la espera corta y el pie subía
dejando un hueco gris, para volver a bajar al llegar el resultado —tres saltos
de maquetación en veinte segundos, justo donde el visitante está esperando y
mirando—, resuelto con `min-height` en los dos estados. Y `citedOwnDomain` se
recogía y no se pintaba: es la señal más fuerte que puede dar una consulta —que
el motor fuera a leer TU web en vez de nombrarte de memoria— y estaba tirándose.
Se enseña sólo cuando es verdad, nunca en negativo: "no te citó" con una sola
consulta sería el mismo veredicto prematuro que el aviso de variabilidad
desmonta.

### La guarda del rol de servicio tuvo que aprender un caso nuevo

`tests/service-role-identity.test.ts` (§92) exige que todo uso de
`createServiceClient()` en `app/` establezca identidad. La ruta del comprobador
la usa y **no tiene identidad que establecer**: su visitante no tiene cuenta,
que es el producto entero de esa página. Su propio mensaje de error avisaba de
la tentación — *"añádela a IDENTITY_GATES a conciencia, no para poner el test en
verde"*.

Añadir una quinta puerta de identidad habría sido mentir, porque no hay
ninguna. Lo que de verdad hace segura esa ruta no es una identidad sino **la
tabla que toca**: `public_checks` no tiene datos de cliente ni clave foránea a
nada que un cliente posea. Así que la excepción se comprueba **por tabla**, no
por nombre de fichero: si alguien añade mañana un `.from("projects")` ahí, el
test se pone rojo igual — que es exactamente lo que una excepción por nombre no
habría hecho. Verificado rompiéndolo.

### `/gratis` entra en el guardián de honestidad

`article-honesty.test.ts` cubría cuatro superficies y esta nació fuera. Es la
primera página pública dirigida a alguien **sin cuenta**, así que es donde más
caro sale publicar un peso del compuesto o un código ADR. Se añadió al crearla,
no cuando se le escapara algo, y se verificó metiendo un `ADR 0033` de mentira
para ver el test en rojo.

### Addendum (2026-08-15, misma tarde): la primera ejecución real falló, y lo grave no fue el fallo

El fundador probó el comprobador en su móvil nada más configurarse la variable
y la migración. Resultado: **"Hemos recibido la respuesta pero no hemos podido
interpretarla"** — `extraction_failed`. Lo que ese mensaje demuestra que SÍ
funcionaba: la sal, la tabla, los tres límites, la lectura de la portada, la
derivación de la pregunta y **la llamada real a ChatGPT**. Falló el último paso,
el que lee esa respuesta y devuelve JSON estructurado.

**Lo grave no fue el fallo, fue que no se podía diagnosticar.** El fichero tenía
cinco `catch {}` que tiraban la causa entera, así que `extraction_failed` podía
ser un 400 del proveedor, un JSON roto, un timeout, un fallo de esquema o una
respuesta vacía — cinco cosas que se arreglan de cinco maneras distintas, y
ninguna forma de saber cuál. Es literalmente la regla que ya estaba escrita:
*"un `catch` que descarta la causa es un fallo, no un estilo"*
(`.claude/rules/gemini.md`). Ahora cada paso guarda una etiqueta corta escrita
por este repositorio —la categoría del `ExtractionError` (`quota`, `timeout`,
`http`, `empty`, `invalid_json`, `schema`, `config`) o el nombre de la clase,
saneado a letras— que va al log de ejecución y a `error_category` de la fila.
**Nunca sale en la respuesta HTTP**: la lee un desconocido.

**Segundo fallo, encontrado leyendo y no ejecutando: el presupuesto no llegaba
al proveedor.** `extractOpenAIStructuredData` acepta un `deadlineAt` y la
comprobación no se lo pasaba, así que su bucle de reintentos (3 intentos de
hasta 20 s) arrancaba uno nuevo mientras quedara un milisegundo — hasta 60 s de
extracción dentro de una función con `maxDuration = 60`, o sea un 504 sin cuerpo
con el dinero ya gastado. Se le pasa el deadline de la invocación **menos un
presupuesto de paso entero**, porque el helper sólo promete "no EMPIEZO un
intento pasado el deadline" y hay que dejarle sitio para terminar el que sí
empiece (`.claude/rules/scan.md`; `docs/adr/0037`).

**Y un motor de reserva para la extracción, sólo para la extracción.** Tirar a
la basura una llamada con búsqueda ya pagada —cuya respuesta estaba entera y
correcta en memoria— porque el lector falló era perder el resultado teniéndolo
delante. Leer la respuesta es un paso interno que el visitante no ve, igual que
el perfil del negocio y la derivación de la pregunta, que ya iban por Gemini a
propósito; **lo que el visitante ve —la pregunta y la respuesta literal— lo
sigue produciendo ChatGPT**, así que el titular de la página sigue siendo
cierto. La reserva está acotada por el mismo presupuesto: si no cabe, no
arranca.

**Recuperarse no borra el incidente.** Cuando la reserva salva la comprobación,
la causa del primer fallo se guarda igual (`fallback:config`) en una fila con
`status = 'completed'`. Una degradación silenciosa es exactamente cómo los 429
de OpenAI corrieron cuatro días sin que nadie se enterara (`docs/adr/0029`).

**Lo que este addendum NO resuelve, dicho explícitamente.** La causa raíz del
fallo de OpenAI sigue **sin diagnosticar**: se ha hecho diagnosticable, no se ha
diagnosticado. Se sabrá con la primera ejecución después de este cambio,
mirando `error_category`. Y hay un antecedente que apunta ahí: §54 dejó anotado
"conocido y no resuelto: los 400 de OpenAI del 5-08 (`Check OPENAI_MODEL`)",
que es el mensaje exacto de `getOpenAIApiError(400)` y sigue sin tocarse. Si la
categoría que aparezca es `config`, el mismo fallo lleva diez días vivo también
en el escaneo, y ahí no hay reserva que lo tape — sería su propia fase.

### Fase C (2026-08-16): la primera comprobación que salió bien enseñaba tres datos que no existían

Task Intake aprobado por el fundador el mismo día, sobre una captura suya del
resultado real. El comprobador funcionó —el motor de reserva no llegó a hacer
falta— y lo que llegó a pantalla tenía **tres afirmaciones sin dato debajo**.
Vale la pena el detalle, porque las tres son la misma clase de error: convertir
la ausencia de un dato en la apariencia de uno.

1. **La lista numeraba el índice de un array.** El encabezado decía "Quién sí
   apareció, **en el orden en que ChatGPT los nombró**" y pintaba `1..10`. Pero
   `other_brands_mentioned` es `string[]`: el extractor no devuelve posición
   para esas marcas, y el prompt tampoco se la pide. El componente numeraba
   `i + 1`. Ahora son etiquetas sin número, con el orden desmentido en el
   propio bloque.

2. **"Movistar en el puesto 1" era un 1 estructural, no medido.** La
   comprobación pasa `competitors: []` a propósito (es lo que hace que todo
   salga por `other_brands_mentioned`), así que la marca es la **única entidad
   que el extractor rankea** y su `position` vale 1 siempre que aparezca. En la
   respuesta que lo destapó, ChatGPT nombraba a Orange antes que a Movistar.
   `brandPosition` **se ha eliminado de `PublicCheckResponse`**, no ocultado en
   la pantalla: un campo que llega al navegador y depende de que nadie lo pinte
   es un campo que vuelve.

3. **Netflix no compite con Movistar.** La lista mezclaba a Orange, Yoigo y
   MÁSMÓVIL con SkyShowtime, DAZN, Netflix, Prime Video, Disney+ y HBO Max —
   plataformas que van *dentro* de los paquetes. `otherBrandsRelevanceHint` no
   basta, y no hay dato hoy para separarlas, así que lo que se ha quitado es
   **nuestra interpretación**: ya no se llaman competidores ni "quién apareció
   en tu lugar", y el bloque dice explícitamente que alguna puede no ser
   competencia.

**Y la respuesta se lee.** Llegaba en markdown y se pintaba en crudo dentro de
un `<blockquote>` con `white-space: pre-wrap`: un muro con URLs enteras a la
vista. `lib/free-checker/answer-markdown.ts` es un parser propio y mínimo
—párrafos, listas, negritas, enlaces— que **devuelve datos, no HTML**. No
existe ninguna ruta a `dangerouslySetInnerHTML`, así que la inyección no es
algo que haya que acordarse de evitar: es imposible por construcción. Los
enlaces se validan por protocolo (`http`/`https`; cualquier otro degrada a
texto) y salen con `rel="nofollow noopener noreferrer"`. La URL se conserva tal
cual, `?utm_source=openai` incluido: es la respuesta literal, y limpiarla sería
enseñar algo distinto de lo que se recibió en la pantalla cuyo argumento entero
es que enseña lo que se recibió.

**Fase D, propuesta y sin aprobar.** Lo que la Fase C deja sobre la mesa, con
su coste medido: la generación cuesta $0,0117 (74% del total, y es el fee de
búsqueda) y **la extracción $0,00036 — el 2%**. Pedirle más a esa llamada es
prácticamente gratis. Cabrían ahí: posiciones reales para las demás marcas (lo
que devolvería un ranking honesto), el dominio de cada una (→ logo por favicon)
y un "¿es de tu categoría?" que arregla el fallo 3 de verdad. Y **sin coste
ninguno**: las fuentes que el motor consultó ya vienen en la respuesta como
`groundingChunks` y `runPublicCheck` las tira al quedarse sólo con
`generated.text`. Es el dato más accionable de la pantalla —de dónde saca
ChatGPT lo que dice de tu categoría— y está pagado. Lo que **no** cabe en
ningún caso es una puntuación: el producto exige diez respuestas antes de
llamar fiable a un número. Toca el esquema de extracción compartido con el
escaneo, así que necesita su propio Task Intake.

### Fase C-bis (2026-08-16): el segundo fallo real, y el agujero que dejó la primera instrumentación

Segunda ejecución del fundador: **"No hemos podido leer tu web"** —
`site_unreachable`, un paso antes que la vez anterior. Dos cosas mal, y la
primera es mía.

**El agujero.** `resolveBusinessContext` **nunca lanza**: colapsa tres motivos
distintos en un único `{status: "unidentified"}`. La instrumentación de la
mañana metió la causa en los `catch`, y este camino no pasa por ninguno — así
que `error_category` volvió a quedarse en `site_unreachable` a secas, sin causa,
que es exactamente el fallo que esa instrumentación existía para eliminar. Una
categorización que sólo cubre las excepciones no cubre el código que devuelve
sus errores en vez de lanzarlos.

**Y lo que se le decía al visitante era falso dos veces de cada tres.** Los tres
motivos son: la portada no se pudo leer, el modelo no devolvió perfil, o el
modelo devolvió uno que él mismo marca poco fiable. **Sólo el primero es su
web.** A los otros dos se les enseñaba *"comprueba que el dominio es correcto y
que la página carga"* sobre un sitio que carga perfectamente — una causa que el
código no puede saber (`.claude/rules/gemini.md`). `BusinessContextResult` gana
un `reason` **obligatorio, no opcional**: opcional habría dejado que un retorno
futuro se olvidara de decir por qué, y este fallo consiste precisamente en no
saber por qué. El comprobador ramifica sobre él y estrena `profile_unclear`, con
un mensaje que dice lo que es cierto y **no manda a nadie a revisar su web**.

**Tercera cosa, de la captura y no del código.** Al fallar, la pantalla retiraba
la página entera y dejaba un panel de error solo en medio de un blanco: se lee
como una web rota, no como un intento que no salió. La página se retira cuando
hay un resultado que la sustituya; un fallo no lo es. Se queda el contenido, se
va el titular —que invita a escribir un dominio donde ya no hay campo.

**Sigue sin diagnosticarse** la causa raíz del `extraction_failed` de la mañana:
esta segunda ejecución ni llegó al paso 4.

**Trazabilidad.** Task Intake FREE-CHECKER-1 (2026-08-15, sin PR propio —
generado en la conversación, no committeado como documento aparte); Task Intake
Fase C (2026-08-16, aprobado en sesión); `docs/seo-positioning-plan.md` Fase P;
`docs/llm-cost-analysis-2026-08.md` (los costes de arriba);
`tests/pilot/support/page-audit.ts` (la exención que hace este fallo
invisible); §55 (Q5b, cuando el chequeo de contraste entró en el piloto); §54
(los 400 de OpenAI, conocidos y sin resolver); `docs/adr/0029` (categorizar y
avisar); `docs/adr/0037` (presupuestar contra la invocación);
`.claude/rules/styles.md` (`a:not(.btn)` en la regla de ancestro).

### Fase D1 (2026-08-17): las fuentes reales, coste cero

Task Intake propio aprobado por el fundador en sesión, sobre el mismo dato ya
identificado en el cierre de Fase C-bis: `generateOpenAIVisibilityAnswer`
devuelve `groundingChunks` —las páginas reales que `web_search` consultó,
metadata del propio proveedor— y `runPublicCheck` se quedaba sólo con
`generated.text`, tirando el resto. El dato ya estaba pagado dentro del coste
de la llamada de generación ($0,0117); enseñarlo no añade ni una llamada.

**Deliberadamente un campo aparte de `citedDomains`/`citedOwnDomain`, no un
reemplazo.** Esos dos siguen viniendo de lo que el extractor CREE haber leído
en el texto de la respuesta (Fase B) — una segunda llamada de LLM sin acceso a
la metadata real, reconstruyendo desde markdown lo que la primera llamada ya
sabía con certeza. `sources` es la metadata real. Casi siempre van a coincidir;
fusionarlos en un único indicador habría escondido el caso en que no
coinciden, que es precisamente cuando más interesa saber cuál de los dos se
equivocó. La pantalla los enseña por separado: la lista completa bajo "De
dónde sacó ChatGPT esta respuesta", y el aviso "Además, citó tu web" se deja
intacto con su fuente original.

**Deduplicado por dominio, no por URL.** Varias citas al mismo sitio son una
sola fila; se conserva la primera URL y título con los que apareció, porque el
enlace tiene que llevar a algún sitio concreto y cualquiera de las citas del
mismo dominio sirve igual de bien. La extracción de dominio (`new URL(uri)
.hostname`, sin `www.`) duplica a propósito la de
`lib/scan/extraction.ts::extractDomain` en vez de importarla: esa función no
está exportada, y `lib/scan/**` es una feature del escaneo, no vocabulario
común (`.claude/rules/scan.md`) — este fichero ya declaraba en su cabecera que
no importa nada de ahí. A diferencia del escaneo con Gemini, no hace falta
resolver redirecciones: las `url_citation` de OpenAI ya son el destino final
(`lib/llm/openai.ts`), así que no hay una llamada de red extra por cita.

**Lo que NO se ha tocado, explícitamente.** `brandPosition` sigue fuera del
contrato HTTP (Fase C). La categoría de cada marca sigue sin decidirse (el
caso Netflix/Orange de Fase C). Ninguno de los dos entra en D1: ambos exigen
tocar `extractionOutputSchema`, compartido con los tres motores del escaneo, y
D1 se aprobó explícitamente sin tocarlo — quedan como Fase D2/D3, sin aprobar.

**Colisión de numeración heredada, no causada por esta fase.** Al preparar
este cierre, §111 estaba reclamado dos veces en `main`: por esta misma sección
(FREE-CHECKER-1, mergeada 2026-08-17T12:00:50+02:00) y por "Se retira la banda
«Revisando tu web»" (PR #428, mergeada 2026-08-17T11:53:08+02:00, ocho minutos
antes). Ninguna de las dos ramas vio a la otra: `pnpm run fix:log-numbering`
sólo compara la copia local contra `origin/main`, y las dos ya estaban en
`main` cuando esta sesión empezó a trabajar sobre él. El propio autofix se
niega a decidir en este caso —"ninguna de las dos ramas es claramente la
nueva"— y pide mirar `git log --format='%h %cI %s' origin/main` para ver cuál
mergeó después. Renumerada a mano la que llegó más tarde (ésta, FREE-CHECKER-1)
a **§113**, dejando §111 y §112 (ambas de "Visión general") como estaban.

**Trazabilidad.** Task Intake Fase D1 (2026-08-17, aprobado en sesión);
`lib/llm/contracts.ts` (`GeminiVisibilityResponse.groundingChunks`);
`lib/llm/openai.ts` (por qué las `url_citation` no necesitan resolución de
redirecciones); `lib/scan/extraction.ts` (`buildGroundedCitations`,
`extractDomain` — el patrón que se duplica a propósito);
`docs/llm-cost-analysis-2026-08.md`.

---

## 114. Páginas citadas: la tarjeta de Impacto se quedaba recortada cuando no había donut que ponerle al lado (2026-08-17)

**Origen.** El fundador reportó, con captura de un escaneo real de
vodafone.es en escritorio, que la pantalla de Páginas citadas "parece mal
maquetada": la tarjeta "Impacto de N citas" terminaba muy por debajo del
ancho de la tira de KPIs y de la lista de abajo, dejando un hueco en blanco
a su derecha, en vez de ocupar el ancho completo de la columna.

**Causa.** `.cit2-dist` (`app/globals.css`) reserva desde 900px una rejilla
de dos columnas fija (`1.35fr` para `ImpactBar`, `1fr` para `SourceDonut`) —
decisión de CITATIONS-REDESIGN-1 (§8) para que las dos tarjetas lean como
una sola sección en vez de dos apiladas. Pero `SourceDonut` devuelve `null`
en cuanto no hay ninguna fuente clasificada (`classifiedTotal === 0`), algo
nada raro: la mayoría de dominios reales caen en "Otras webs", ya
documentado en §8 como long tail sin reconocer. Sin el segundo hijo en el
DOM, la rejilla seguía reservando su segunda columna vacía, y `ImpactBar`
sólo ocupaba la primera — la tarjeta se veía recortada con espacio muerto al
lado, exactamente lo que enseñaba la captura.

**Arreglo.** `CitationsClient` calcula ahora si `SourceDonut` va a pintar
algo (`hasClassifiedSourceType`, mismo criterio que el early-return interno
del propio componente) y añade el modificador `.cit2-dist-solo` cuando no —
ese modificador colapsa la rejilla a una sola columna (`minmax(0, 1fr)`)
sólo para ese caso, así que `ImpactBar` ocupa el ancho completo en vez de
dejar un hueco donde iría el donut. El caso con donut clasificado no cambia.
Reproducido y verificado visualmente (Playwright, 1920/1440px, con y sin
datos de tipo de fuente) antes y después del fix — sin entorno de Supabase
real disponible en esta sesión, así que la verificación fue contra una ruta
de desarrollo desechable que montaba `CitationsClient` con props de mock
imitando el escaneo reportado; la ruta no se ha committeado.

**Pendiente / roto conocido, no tocado en este PR.** `.cit2-page` (topes
1200px/1280px, mismo mecanismo que `.ov2-scope`/`.pr2-scope`) vive dentro de
`.page` (`app/globals.css`, tope fijo de 1320px, sin las media queries de
escritorio de BRAND-5b) — la inconsistencia de ancho ya documentada en §4
("Pendiente/roto conocido") sigue sin corregir para esta zona; no formaba
parte del bug reportado y una sesión que la toque debe hacerlo aparte.

**Trazabilidad.** Captura del fundador (vodafone.es, 2026-08-17); §8
(CITATIONS-REDESIGN-1, origen de `.cit2-dist` y de la exclusión de "Otras
webs" del donut); §4 (la inconsistencia `.page`/`.ov2-scope` que esto no
corrige).

---

## 115. Rediseño de Recomendaciones — "copiloto GEO" (RECS-REDESIGN-1, fase 1, 2026-08-03)

**Contexto.** Investigación previa sobre tres guías de optimización para
motores generativos (Semrush, 2026) y un teardown completo de la pantalla
equivalente de Otterly.AI. Conclusión principal: el fallo del mercado no es
la falta de diagnósticos, es el exceso — listas de ~100 filas casi idénticas,
sin primer paso, sin decir cuánto vale cada acción. El fundador revisó cuatro
opciones de diseño y aprobó la D ("copiloto GEO"), en tres fases.

**Decidido en esta fase (fase 1).**

1. **Estructura de la página**, en una columna y de arriba abajo: bloqueador
   técnico → pilares del GEO Score → plan de acciones prioritarias → resto
   agrupado → filtros. Móvil primero; los breakpoints solo ensanchan la
   columna, nunca reordenan.
2. **Repintado v3** con el patrón de zonas (`.rec2-scope`), anchos del
   estándar de consola (460 / 640 ≥900 / 1200 ≥1200 / 1280 ≥1600) fijado en
   §5/§8 — deuda que este documento dejaba explícitamente pendiente "cuando le
   toque su propio rediseño".
3. **Densidad.** Fuera de la tarjeta plegada: el pill de rango, la etiqueta de
   tipo interno ("Perseguir fuentes de citación") y el trío de medidores
   impacto/esfuerzo/confianza. Los tres qualifiers siguen existiendo, dentro
   del detalle expandido. La tarjeta plegada queda en tres cosas: qué hacer,
   por qué y el primer paso.
4. **Cabecera.** Eliminada la fila de metadatos (prompts / competidores /
   escaneos / score): repetía el Overview y empujaba la primera acción real
   fuera de la pantalla. Queda título + fecha de escaneo.
5. **Puntos potenciales en la propia página.** Ya existían (ADR 0017) pero solo
   se renderizaban en Oportunidades del Overview. Con el fallback honesto
   intacto: sin número cuantificable o con confianza baja, se muestra impacto
   cualitativo, nunca una cifra inventada.
6. **Agrupación en presentación, no en el motor.** Las repeticiones del mismo
   tipo colapsan en una fila con contador. Deliberadamente NO se fusionan en
   el motor: eso cambiaría el `dedupe_key` de cada hueco y las claves por
   prompt son justamente lo que permite resolverlos de uno en uno (RECS-3).
7. **Prioridad unificada.** El filtro "Alta prioridad" pasa a usar el mismo
   criterio absoluto que la badge (impacto × confianza). Antes convivían dos
   definiciones: la badge absoluta y un `priority_rank <= 3` posicional, que
   se contradecían en la misma pantalla.
8. **"Exportar plan"** deja de ser un botón muerto: descarga el plan en
   Markdown, con el primer paso de cada acción.
9. **Bloqueador técnico.** Si la auditoría web detecta crawlers de IA
   bloqueados, se muestra por encima de todo lo demás: mientras siga así, el
   trabajo de contenido no puede rendir en ese motor.

**Pendiente (fases 2 y 3, aprobadas pero no implementadas).** Fase 2: estado
persistente "hecha / en curso" y veredicto post-escaneo con puntos realmente
recuperados — requiere migración de schema y por tanto aprobación explícita
propia. Fase 3: chip de pilar por acción (mapeo regla→pilar).

**Roto conocido, no tocado aquí.** Los tokens `--p-high/--p-med/--p-low` de
§4 siguen sin definirse en ningún `:root`; afectan a `.rec-card-preview` del
Overview antiguo, fuera del alcance de esta fase.

---

## 116. Accesibilidad del sitio público — landmark, contraste y áreas táctiles (A11Y-PSI-1, 2026-08-20)

**Contexto.** PageSpeed Insights móvil sobre `https://www.genscore.es/`
(17/8/26): Rendimiento 75, Accesibilidad 91, Prácticas recomendadas 100, SEO
100. Sin datos de campo (CrUX vacío) — el 75 es de laboratorio, sin ningún
usuario real medido. Las dos palancas más grandes de rendimiento (LCP del
tour del hero, JS de Sentry) están detrás de decisiones ya tomadas y
deliberadamente no revisadas aquí: diferir el tour empeora el LCP y choca con
`.claude/rules/onboarding.md`; diferir Sentry ya costó errores de producción
perdidos dos veces (`components/posthog-provider.tsx`). Esta fase ataca solo
los tres hallazgos de Accesibilidad, que sí eran baratos y seguros.

**Decidido.**

1. **Landmark `<main>` en las cinco superficies que cubren todo el sitemap
   público**: `components/landing/landing-page.tsx`,
   `components/pricing/pricing-page.tsx`, `components/blog/blog-page-shell.tsx`
   (blog, glosario, comparativas, `/gratis/aparece-mi-marca-en-chatgpt`,
   `/que-es-genscore`), `components/docs/docs-page-shell.tsx` y
   `components/legal-page-shell.tsx` (privacidad, cookies, términos). El
   `<header>`/hero y el `<footer>` quedan fuera de `<main>` a propósito — son
   landmarks propios. No hay combinadores de hijo directo sobre `.lp` en
   `app/globals.css`, así que envolver las secciones existentes en `<main>`
   no cambia ninguna cascada.
2. **Contraste — `.price-meter-scale span`** (`/pricing`, los pills "10 / 25
   / 100 / 300"): `color: var(--ink-3)` sobre `background: var(--surface-sunk)`
   daba 4,44:1, por debajo de AA — la misma trampa de token que
   `.claude/rules/styles.md` ya documentaba para Recomendaciones (log §55).
   Pasa a `--ink-2` (7,50:1 sobre ese fondo).
3. **Área táctil — `.lp-footer .links a`**, compartido por las cinco
   superficies de arriba: el enlace no tenía relleno propio, así que su caja
   pulsable era solo la línea de texto (~13px), muy por debajo de 24×24.
   Relleno `8px 6px` con margen negativo equivalente — el texto no se mueve,
   el hit-box crece, y el hueco entre enlaces (`gap: 22px`) sigue siendo
   positivo tras restar los márgenes.

**Deliberadamente NO tocado en esta fase, con el motivo por escrito para que
nadie lo redescubra desde cero:**

- **LCP (5,3s) y los 129 KiB de JS sin usar** — dominados por el tour del
  hero y por Sentry respectivamente; ambos vetados por decisiones ya
  documentadas (arriba).
- **`ink-4` como texto de cuerpo** — falla AA incluso sobre blanco (2,63:1),
  y aparece en 258 sitios de `app/globals.css`, la mayoría en zonas de
  consola. Es un problema real y más grande que el que reportó PSI (que solo
  vio la home, pública y anónima), pero corregirlo de raíz es un cambio de
  token de sistema de diseño que necesita su propia fase con su propia pasada
  de piloto — no cabe en un P2 barato.
- **`.lp-inner > .blog-cover-compact:first-child` y los ~33 KB de CSS de
  consola sin mover** — siguen exactamente como los dejó `.claude/rules/
  styles.md`; esta fase no reordena la cascada.

**Roto conocido, no tocado aquí.** `ink-4` como texto de cuerpo (ver arriba)
sigue fallando AA en el resto del producto, dentro y fuera de esta zona.

---

## 117. Cabecera pública: badge Pro desalineado bajo el email, y flicker de "Iniciar sesión" en cada recarga (pro-badge-alignment-flickering-v4brfv, 2026-08-17)

**Origen.** El fundador reportó dos cosas con una captura de la portada en
escritorio, ya logado: (1) en el chip de cuenta de la cabecera pública, el
badge "Pro" salía apilado debajo del email y alineado a la izquierda, muy
por debajo del ancho real del email, leyendo como desalineado; (2) al
recargar cualquier página pública, la cabecera muestra brevemente "Iniciar
sesión" / "Prueba gratis" antes de reemplazarlos por el chip de cuenta — un
flicker que ocurre en cada recarga, no sólo la primera vez.

**Causa (badge).** `AccountChip` (`components/marketing/public-header.tsx`)
metía el email y el badge como dos hijos de bloque sueltos dentro de un
`<div>` sin `display: flex`; el badge (`.sb-plan-badge`, `inline-flex`)
caía por tanto en una línea nueva bajo el email en vez de a su lado. Es la
misma clase que usa el chip de la barra lateral de consola
(`components/sidebar.tsx`, previo a GENSCORE-HEADER-2, §65), donde apilar sí
tiene sentido porque esa barra mide ~240px; la cabecera pública tiene todo
el ancho del nav para trabajar y no tenía motivo para heredar el apilado.

**Causa (flicker).** `useSessionUser` (`lib/use-session-user.ts`,
GENSCORE-HEADER-2, §65) arranca siempre en `null` ("anónimo o sin resolver
todavía") y pide `/api/me` en un `useEffect` — una decisión deliberada y
documentada para no retrasar el CTA de conversión al visitante anónimo, que
es la inmensa mayoría del tráfico. El coste declarado de esa decisión era
que un visitante ya logado ve el estado anónimo "por el momento que tarda en
responder" — pero ese momento se repetía en CADA recarga, y el fundador lo
señaló como molesto, no como breve.

**Arreglo (badge).** El contenedor de email+badge pasa a
`.lp-user-chip-identity` (`display: flex; align-items: center; gap: 8px;
min-width: 0`), con el email en `flex` normal (su propio `min-width: 0` deja
que el `text-overflow: ellipsis` existente gane) y el badge en `flex: 0 0
auto` para que nunca se comprima. `.sb-plan-badge` base sigue con
`margin-top: 3px` para el uso apilado del sidebar; el contexto
`.lp-user-chip .sb-plan-badge` lo pone a `0` porque en una fila centrada ese
margen ya no tiene sentido. El chip de la barra lateral no se toca — sigue
apilado, que es correcto para su ancho.

**Arreglo (flicker).** No se toca la decisión de GENSCORE-HEADER-2 de
arrancar optimista para el anónimo — seguiría siendo peor retrasar el CTA
para el 100% de los visitantes por evitar un flicker que sólo ve quien ya
tiene cuenta. En vez de eso, `useSessionUser` recuerda la última identidad
resuelta en `sessionStorage` (`gs_session_user_hint`) y la relee en un
`useLayoutEffect` — no en el inicializador de `useState`, que también
corre durante la hidratación y tiene que devolver exactamente el marcado
anónimo que sirvió el servidor o React marca un mismatch de hidratación (el
mismo flash que esto quiere quitar). Un `useLayoutEffect` compromete su
`setState` antes de que el navegador pinte, así que la identidad cacheada
sustituye al fotograma anónimo de forma invisible en vez de después de un
flash visible. `fetchSessionUser()` sigue siendo la única fuente de verdad:
corre siempre, y su resultado sobrescribe la caché (y el estado) aunque
diga `null` — una sesión caducada entre recargas se corrige, no se queda
pegada al último valor bueno.

**Pendiente / roto conocido, no tocado en este PR.** El primer login de la
sesión del navegador (sin nada aún en `sessionStorage`) sigue viendo el
flicker original — no hay forma de evitarlo sin una llamada síncrona antes
del primer pintado, que es justo lo que GENSCORE-HEADER-2 descartó por el
coste en TTFB de las ~45 páginas estáticas. Lo que cambia es que a partir de
la segunda recarga en la misma pestaña, no vuelve a pasar.

**Trazabilidad.** Captura del fundador (portada, escritorio, 2026-08-17);
§65 (GENSCORE-HEADER-2, `lib/use-session-user.ts`, el trade-off
anónimo-optimista que esto no revierte); `components/sidebar.tsx` (el chip
apilado que esto deja intacto).

---

## 118. Cabecera pública: skeleton antes de hidratar cierra el flicker residual (header-flicker-skeleton-prehydration, 2026-08-20)

**Origen.** El fundador confirmó que §117 (pro-badge-alignment-flickering-v4brfv)
mejoró el flicker de "Iniciar sesión" pero seguía viéndose "un pelín" en
cada recarga logado. Task Intake aprobado el mismo día para cerrarlo del
todo con un script de pre-hidratación, sin revertir la decisión de
GENSCORE-HEADER-2 de servir las páginas públicas en estático.

**Causa.** §117 corregía el estado en cuanto React hidrataba
(`useLayoutEffect`), pero el navegador pinta el HTML del servidor —siempre
"Iniciar sesión"— en cuanto lo parsea, **antes de que exista React**. Ese
hueco (el tiempo hasta que el JS carga y React hidrata) es estructural a
servir HTML estático con contenido dependiente de sesión; no se cierra
desde React solo.

**Arreglo.** Mismo patrón que usan los guardas de flash de tema
oscuro/claro: un `<script>` inline y síncrono, primer hijo de `<body>` en
`app/layout.tsx`, que lee la misma caché de `sessionStorage`
(`gs_session_user_hint`) y — si hay algo cacheado — pone
`data-session-hint="1"` en `<html>` antes de que el navegador pinte nada
más. `app/globals.css` usa ese atributo para ocultar los CTAs anónimos y
mostrar un **skeleton sin contenido** (círculo + barra grises,
`.lp-session-skeleton` en `components/marketing/public-header.tsx`) en su
lugar — nunca el email o el plan reales, porque el script no tiene forma
de verificar que esa caché siga siendo cierta. En cuanto React hidrata, el
mismo `useLayoutEffect` de `lib/use-session-user.ts` que ya leía la caché
ahora también quita el atributo, y el contenido real (chip o CTAs) que
React ya había decidido renderizar queda visible.

**Bug real encontrado y corregido antes de desplegar.** La primera versión
ponía la constante de la clave (`SESSION_CACHE_KEY`) en
`lib/use-session-user.ts`, un módulo `"use client"`, y la importaba desde
`app/layout.tsx` (Server Component). Compilaba limpio y pasaba
`tsc`/`eslint` sin avisar — pero Next.js sustituye las exportaciones de un
módulo `"use client"` por referencias opacas cuando las importa un Server
Component, así que el HTML construido enviaba literalmente
`sessionStorage.getItem(undefined)`, desactivando la función entera en
silencio. Sólo se detectó inspeccionando el HTML de verdad construido por
`next build` (`pnpm run validate` no lo habría cogido de otra forma). Se
movió la constante a `lib/session-hint.ts`, un módulo plano sin
`"use client"`, importado por los dos lados; `lib/session-hint.test.ts`
comprueba que ese fichero nunca vuelve a llevar la directiva.

**Segundo bug real, cogido por Claude QA antes del Human Gate.**
`components/not-found-mission.tsx` reutiliza la clase `.lp-nav-right` a
propósito (su propio comentario: "sin datos, sin sesión, sin JavaScript
propio") pero nunca renderiza el skeleton ni monta `useSessionUser`, así
que nada en esa página limpia `data-session-hint` — la regla original de
ocultar hermanos (`.lp-nav-right > *:not(.lp-session-skeleton)`) le habría
escondido los dos CTAs para siempre a cualquier visitante que aterrizara
ahí con una caché de `sessionStorage` viva. Arreglado cualificando el
selector con `:has(.lp-session-skeleton)` — ya usado en este mismo fichero
para `.art-stats` — que excluye estructuralmente cualquier
`.lp-nav-right`/`.lp-mobnav-ctas` que no renderice el propio skeleton, así
que protege igual ante cualquier reutilización futura de esas clases, no
sólo el caso de la 404. Verificado contra el HTML real de `next build`
antes y después.

**Pendiente / roto conocido, no tocado aquí.** El hueco en sí (unos ms
entre el pintado del HTML estático y que React hidrate) no desaparece —
eliminarlo del todo exigiría no servir HTML estático, que es justo lo que
GENSCORE-HEADER-2 descartó por SEO. Lo que cambia es que ese hueco ahora
muestra un skeleton neutro en vez de "Iniciar sesión", así que deja de
leerse como un fallo.

**Trazabilidad.** §117 (pro-badge-alignment-flickering-v4brfv, el fix que
dejó este hueco documentado como pendiente); §65 (GENSCORE-HEADER-2, la
decisión de estático que este PR no revierte); Task Intake aprobado por el
fundador, 2026-08-20.

---


---

## 119. Visión general en escritorio: cabecera de la puntuación GEO alineada, desglose y motores lado a lado (OV-DESKTOP-2, 2026-08-17)

**El problema, señalado por el fundador con una captura de escritorio.** En
la fila de cabecera de Visión general, la tarjeta de la puntuación GEO
llevaba su título («Puntuación GEO») dentro de la propia tarjeta, mientras
la columna de al lado («Indicadores clave») lo lleva fuera, como etiqueta de
sección — así que las dos tarjetas arrancaban a alturas distintas y leían
como desalineadas. Más abajo, «Desglose del GEO Score» ocupaba el ancho
completo de la pantalla y «Posicionamiento por motores de IA» quedaba
enterrado varias secciones después, dentro de la columna de análisis —
mucho protagonismo para una tabla de texto plano, y una sección relacionada
fuera de vista sin bajar la página. Las cinco filas del desglose eran
etiqueta + número suelto («88/100»), sin ninguna otra señal visual.

**Qué se decidió, con guardas explícitas en el tramo inferior.**

1. **Cabecera hermana, alineada arriba Y abajo.** `.ov2-gauge-block` envuelve
   la tarjeta con una segunda copia externa de «Puntuación GEO»
   (`.ov2-gauge-sec-lbl`), oculta por defecto. A partir de 760px se muestra
   la externa y se oculta la interna — nunca las dos a la vez — así que las
   dos columnas de la fila de cabecera comparten el mismo patrón de
   etiqueta y arrancan en la misma línea. `.ov2-hero` pasa de `align-items:
   start` a `stretch` (revirtiendo la decisión original de OV-DESKTOP-1,
   explícitamente a petición del fundador: quería la alineación arriba Y
   abajo, no sólo arriba) — la tarjeta de la puntuación crece para llenar la
   altura de la fila, y `justify-content: center` en su interior evita que
   eso lea como aire muerto en un escaneo sin sparkline. Por debajo de 760px
   el DOM y el CSS no cambian: la tarjeta sigue llevando su etiqueta interna
   exactamente como antes.

   **Primer intento, y por qué se corrigió en el mismo PR.** La primera
   versión lo aplicó a partir de 1200px; el fundador pidió expresamente
   extenderlo a tablet, y esta sesión preguntó "¿768–1199px?" asumiendo que
   coincidía con el paso de 900px que ya existía para `.ov2-scope`/
   `.ov2-kpi-car` — sin comprobar que 768 < 900. La segunda versión movió
   todo el bloque de la cabecera a ese mismo `@media (min-width: 900px)`, y
   la captura del piloto en 768px (la anchura real de "Tablet" en
   `docs/agentic-user-pilot.md`, la que de verdad se mira) salió idéntica a
   la de antes del PR: 768px nunca llega a activar una condición de 900px.
   La versión final vive en su **propio** `@media (min-width: 760px)`,
   separado del paso de 900px — reutilizando el mismo corte al que `.sb`
   deja de ser un cajón y pasa a columna estática (`.shell` le da entonces
   una columna fija de `--sidebar-w`), para que "la cabecera va a dos columnas"
   y "la barra lateral es una columna fija" empiecen a la misma anchura.
   `.ov2-scope` NO se ensancha en este paso — sigue en su tope móvil de
   460px hasta el paso de 900px, sin tocar — así que la columna de la
   puntuación es más estrecha aquí (`minmax(190px, 230px)`) que a partir de
   900px (`minmax(220px, 260px)`) y que en escritorio
   (`minmax(320px, 390px)` desde 1200px). `.ov2-kpi-car` tampoco cambia de
   comportamiento en este tramo — sigue siendo el carrusel horizontal móvil,
   con su propio cambio a rejilla de 2 columnas intacto en su sitio original
   (900px) — meterlo en rejilla dentro de una columna aún más estrecha
   arriesgaba envolver las etiquetas de los KPI sin que nadie lo comprobara.
2. **Desglose a 2/3, motores sube.** `.ov2-score-row` agrupa «Desglose del
   GEO Score» y «Posicionamiento por motores de IA» en una fila 2fr/1fr
   propia, independiente de `.ov2-cols` (que ahora arranca directamente en
   Panorámica competitiva). Por debajo de 1200px `.ov2-score-row` es
   `display: contents`: el orden en el DOM no cambia, porque Posicionamiento
   ya seguía inmediatamente a Desglose antes de este cambio — sólo el
   escritorio gana la disposición lado a lado.
3. **Filas con icono y medidor.** Cada fila del desglose suma un icono (del
   sistema compartido `components/ui/icon.tsx` — `eye`/`crown`/`resonance`/
   `shield`/`bolt`; nunca un SVG nuevo) y sustituye el número suelto por una
   barra horizontal junto a la cifra. El tono (verde/azul/ámbar) reutiliza
   `getBandTone`, el mismo umbral 70/40 que ya colorea la banda de la
   puntuación general — no se inventa una segunda escala de color para esta
   fila. «No disponible» dibuja una barra discontinua y vacía en vez de una
   barra sólida al 0%: una barra sólida vacía se confundiría con Presencia o
   Autoridad en 0, que es un valor medido real en esta misma tarjeta, no una
   ausencia de dato. Este punto no se limitó a escritorio — el icono y el
   medidor caben igual de bien a 375px y no dependen del ancho extra que
   trae la fila 2/3, así que aplica a todas las anchuras.

**Tercera vuelta: el carrusel de KPIs no cabía, y el `min-width: 0` no era la
causa.** Con la cabecera ya en dos columnas a 768px, la captura del piloto
mostró la tercera tarjeta de Indicadores clave cortada contra el borde de la
pantalla. Se diagnosticó como un *grid blowout* clásico —falta de
`min-width: 0` en los items— y se arregló así. **La siguiente pasada del
piloto devolvió capturas byte a byte idénticas**, lo que descartó ese
diagnóstico de raíz: el `min-width: 0` no cambiaba un solo píxel.

La causa real estaba a la vista en la propia captura y en el comentario que
esta misma fase había escrito para justificarse: `.ov2-kpi-car` seguía siendo
el **carrusel horizontal móvil** (tarjetas fijas de 158px con `overflow-x`),
y en este tramo la columna derecha mide ~205px — con el barrido lateral
estático eso son una tarjeta y el borde izquierdo de la siguiente. No
desbordaba nada: el carrusel recortaba correctamente, y *ese* recorte es lo
que se lee como pantalla rota.

Se dejó el carrusel intacto **a propósito**, y el comentario del CSS decía
por qué: *«esa combinación no se había probado nunca junta y arriesgaba
envolver etiquetas que nadie había comprobado»*. Era exactamente al revés —
**no probarlo era el riesgo**. En este tramo `.ov2-kpi-car` pasa a una
rejilla de una columna con las tarjetas a ancho completo, y a partir de
900px la de dos columnas vuelve a ganar. Ambas usan el selector desnudo
`.ov2-kpi-car`, así que decide el orden en el fichero y ninguna
sobre-especifica a la otra (`.claude/rules/styles.md`).

`min-width: 0` se queda: la convención es correcta y la comparten los otros
pares de columnas del fichero. Queda escrito en el CSS que **no** fue el
arreglo, para que nadie deduzca lo contrario de su presencia.

**Lo que costó y cómo se cortó.** Tres vueltas de piloto para un cambio de
CSS, dos de ellas por afirmar una causa sin comprobarla. La cuarta se
verificó **antes** de empujar, con un banco de pruebas estático
(`.ov2-*` reales de `globals.css` + `console.css` sobre el DOM de la
cabecera, medido y fotografiado con el Chromium local a 768/860/1000/1280 px),
que confirmó ausencia de desbordamiento y fondos alineados en las cuatro
anchuras. El piloto contra el preview sigue siendo la puerta; lo que no puede
ser es el bucle de depuración, que es la misma lección de BUILD-BUDGET-1
—«el build no es un bucle de feedback»— aplicada al piloto.

**Qué NO cambia.** Por debajo de 760px (móvil) la cabecera es pixel-idéntica
a la de antes de este PR; por debajo de 1200px, «Desglose del GEO Score» y
«Posicionamiento por motores de IA» siguen apilados en el mismo orden que ya
tenían. Sólo los puntos 1 y 2 llevan guarda de anchura explícita — distinta
entre ambos (760px la cabecera, 1200px el desglose+motores) porque cada uno
resuelve un problema visible en un rango distinto — y el punto 3 es un
cambio de contenido de fila, no de layout, así que no necesitaba ninguna.

**Aprobación.** Maqueta Antes/Después mostrada como Artifact y aprobada por
el fundador en la misma conversación antes de implementar, sustituyendo al
Task Intake Report formal para este cambio de un único PR y una sola
pantalla.

**Trazabilidad.** `app/dashboard/projects/[projectId]/page.tsx` (JSX);
`app/globals.css`, `app/console.css` (`.ov2-brow*`, `.ov2-gauge-block`,
`.ov2-gauge-sec-lbl`, `.ov2-score-row`/`.ov2-score-main`/`.ov2-score-side`);
`app/dashboard/projects/[projectId]/geo-score-breakdown.ts` (campo `icon` en
`GEO_SCORE_COMPONENT_META`); §4 (OV-DESKTOP-1, la fila de cabecera y la
columna de análisis original que este PR reordena, no sustituye en su
mecanismo `display: contents`).

---

## 120. El piloto se saltó a sí mismo y publicó el check en verde (2026-08-17)

**Qué pasó.** En el PR #433, el job `pilot` del commit `3c19aa4` terminó en
**8 segundos con conclusión `success`**. No ejecutó ningún test, no abrió
ningún navegador, no capturó ninguna pantalla. El log dice:

> `No open PR for 3c19aa453a0325c43421048703aebac7fcc153ec; nothing to report on.`
> `Skipping pilot — deployment is not attached to an open pull request.`

El PR estaba abierto. Llevaba abierto seis horas.

**Por qué importa más que el propio fallo.** El check salió **verde**. En la
lista de checks del PR, una pasada que no miró nada es indistinguible de una
que lo miró todo — y la fila «pilot ✅» es exactamente lo que el Human Gate
mira. Es el mismo fallo de §65 (un job cancelado que dejaba un PASS publicado
sin que la puerta llegara a ejecutarse) y de §55 (dar «piloto pasado» leyendo
la tabla de ✅), un escalón más arriba: allí fallaba el veredicto, aquí falla
la existencia misma de la pasada. La regla de `.claude/rules/scan.md` —«una
garantía que no se puede ver fallar no es una garantía»— se escribió para el
escaneo y aplica igual al arnés que vigila el escaneo.

**La causa, y lo que NO era.** El paso «Resolve the pull request for this
deployment» resolvía el PR con `commits/{sha}/pulls`. Ese endpoint devolvió
lista vacía. La primera hipótesis fue una carrera de indexación —el deployment
llegando antes de que GitHub asociara commit y PR— y **es falsa**: el push de
`3c19aa4` fue a las 13:57 y la consulta a las 14:27, **treinta minutos
después**. No es que el índice no hubiera llegado; es que no respondió. Se
comprobó a mano ese mismo día que `pulls?head=` **sí** devolvía el #433 con su
rama y su SHA en ese mismo momento.

**Qué se decidió.** Dos búsquedas en vez de una, y cinco intentos con espera
creciente:

1. **`pulls?head=owner:rama` primero.** Consulta la lista de PRs directamente
   en vez del índice commit→PR, así que no depende de la pieza que falló. Se
   salta cuando el `ref` del deployment es un SHA de 40 hex, que no es rama.
2. **`commits/{sha}/pulls` de reserva**, para deployments sin rama utilizable.
3. **`::warning::` cuando ninguna resuelve**, que sale en el resumen del run y
   no enterrado en el log de un paso.

**Lo que se dejó a propósito sin arreglar, y por qué.** El check **sigue
saliendo verde** cuando no hay PR. Un preview de una rama sin PR abierto es
legítimo y pintarlo en rojo llenaría el repositorio de fallos falsos. El
precio es que la distinción entre «no había nada que pilotar» y «el piloto se
averió» vive ahora en un aviso, no en el color del check. Es una mejora sobre
el silencio anterior, **no una puerta**: la puerta de verdad sería una
required status check en la protección de rama, que es configuración del
repositorio y no código — la misma frontera que ya anotó la Fase Q5 sobre la
ausencia de CI (§54).

**Contexto: por qué se arregló dentro del PR #433 y no en uno aparte.** Mezclar
concerns está desaconsejado (CLAUDE.md), pero el piloto es **puerta obligatoria
del Human Gate** y estaba impidiendo que ese mismo PR llegara a juzgarse; un PR
separado no lo desbloquearía hasta mergearse, y había diez PRs abiertos contra
el tope de tres de BUILD-BUDGET-1. Queda anotado como excepción consciente.

**Roto conocido, sin diagnosticar.** En paralelo, *Redeploy* manual desde
Vercel falló varias veces seguidas sobre este mismo commit con
`Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'`
—un interno de Turbopack para `next/font/google`, que ni este PR ni ninguno
reciente tocan— mientras que **los builds disparados por push del mismo commit
salieron bien**, igual que los de los PRs #435 y #437 esa misma tarde.
`next build` en local es limpio. No se ha reproducido ni diagnosticado: queda
escrito que el camino fiable es empujar un commit, no pulsar *Redeploy*.

**Trazabilidad.** `.github/workflows/ux-pilot.yml`; §65 (el job cancelado que
dejaba un PASS publicado); §55 (dar por pasado el piloto leyendo la tabla de
✅); §54 (Fase Q5, hacer visible la ausencia de CI, y por qué el aviso no es
la puerta); `.claude/rules/scan.md` («una garantía que no se puede ver fallar
no es una garantía»); `scripts/vercel-should-build.sh` (la regla que ya obliga
a construir cuando cambia este workflow, para que el arreglo pueda ejercitarse).

---


---

## 121. `sameAs` deja de estar vacío: LinkedIn y G2 son perfiles reales (2026-08-20)

**Qué pasó.** El fundador dio de alta la página de empresa de LinkedIn
(`https://www.linkedin.com/company/genscore/`) y la ficha de vendedor en G2
(`https://www.g2.com/sellers/genscore`) y pasó ambas URLs directamente. Es
justo el evento que §100 y `docs/off-site-authority-kit.md` §8 dejaron escrito
como el único que habilita esto: `organization-schema.tsx` llevaba desde
GROWTH-2 Fase 2.1 sin `sameAs` a propósito, porque declarar un perfil que no
existe es el mismo dato falso que una métrica inventada.

**Qué se decidió.** Añadir ambas URLs al `sameAs` de `OrganizationSchema`
(`components/seo/organization-schema.tsx`) y nada más — ni Capterra (copy
listo, ficha sin crear todavía) ni YouTube (guiones listos, sin grabar). El
kit off-site (`docs/off-site-authority-kit.md` §7-8, tabla de Estado) se
actualiza en el mismo PR para que la próxima sesión no vuelva a preguntar qué
falta: Capterra sigue "Alta: fundador", LinkedIn y G2 pasan a "Dados de alta".

**Por qué no hace falta re-verificar las URLs.** La regla que protege este
campo (§100, `docs/off-site-authority-kit.md` §8) es contra que el propio
agente **invente** un perfil, no contra recibir una URL real de quien es dueño
de la cuenta — el fundador pasando directamente las dos URLs es precisamente
el mecanismo que esos documentos describen como el que las desbloquea.

**Trazabilidad.** `components/seo/organization-schema.tsx`; log §100 (por qué
`sameAs` nació vacío); `docs/off-site-authority-kit.md` §7-8 y su tabla de
Estado (el mismo hueco, documentado desde el lado de contenido).

---

---

## 122. Dominios: seleccionar una tarjeta propaga a toda la consola, y el botón "Ver visión general" se reduce en desktop (DOMAINS-LIVE-SELECT-1, 2026-08-20)

**Origen.** Fundador, 2026-08-20: seleccionar otro dominio en la pantalla
"Dominios" (`/dashboard/domains`) tenía que reflejarse en toda la consola
sin pulsar "Ver visión general" primero; y ese botón, a ancho de escritorio,
se veía "enorme". Task Intake aprobado el mismo día (propagación P1 + botón
P2, mismo PR).

**Por qué el botón era la única vía real.** DOMAINS-REDESIGN-1 (2026-08-05)
decidió a propósito que pinchar una tarjeta de la rejilla no navega — sólo
cambia qué dominio aparece en la portada, vía `?active=<id>`, para volver a
la misma pantalla (comentario en `app/dashboard/domains/page.tsx`). Esa
decisión sigue en pie. Pero "cuál es el proyecto activo" fuera de esa
pantalla se resolvía en otros dos sitios de forma independiente y sólo a
partir del *pathname* — `components/sidebar.tsx` y
`components/workspace-topbar.tsx`, ambos con su propio `getProjectId(pathname)`
— y la cookie `geo_active_project` que los alimentaría en su ausencia
(DEBUG-ACTIVE-PROJECT-1) sólo la escribía `middleware.ts` al entrar de
verdad en `/dashboard/projects/[id]/...`. Elegir una tarjeta cambiaba la
portada pero no el pathname, así que el sidebar seguía señalando el
proyecto anterior hasta que se pulsaba "Ver visión general" — el único
gesto que de verdad cambiaba de ruta.

**Arreglo.** `lib/active-project-cookie.ts` gana
`getProjectIdFromDomainsQuery(pathname, searchParams)`, que valida el mismo
`?active=<uuid>` que ya lee `app/dashboard/domains/page.tsx`.
`middleware.ts` la usa como segunda fuente junto a la ya existente
`getProjectIdFromPathname`, así que la cookie también se escribe al
seleccionar una tarjeta, sin que la tarjeta navegue. `app/dashboard/layout.tsx`
lee esa cookie server-side y se la pasa a `Sidebar` como `preferredProjectId`;
`Sidebar` la usa como fallback entre el pathname y `projects[0]`. No se tocó
`workspace-topbar.tsx`: fuera de una ruta de proyecto ya no muestra nada, así
que no había fallback que corregir.

**El botón.** `.dm2-open` coincidía exactamente con el diseño aprobado en
`docs/design-reference/domains-redesign-1/pantalla-dominios.html`
(`width:100%`), que ahora queda desactualizado — se corrige en el mismo PR.
Por debajo de 561px se queda a ancho completo (sigue siendo la única forma
de entrar al proyecto ahí, y el objetivo táctil grande es lo que
corresponde). Desde 561px, ancho de contenido y alineado a la derecha
(`.dm2-hero` pasa a `flex column` sólo para que `align-self:flex-end` pueda
mover ese único hijo sin afectar la anchura de los demás, que se siguen
estirando igual que en bloque).

**Lo que NO cambia.** La cookie nunca es fuente de autorización — se
re-comprueba la propiedad con RLS en cada lectura, igual que ya documentaba
DEBUG-ACTIVE-PROJECT-1; un id ajeno o manipulado simplemente no aparece en
`projects` y cae al siguiente criterio. La tarjeta de la rejilla sigue sin
navegar (DOMAINS-REDESIGN-1 se mantiene intacta). Ningún control de
escaneo/auditoría nuevo en la pantalla.

**Trazabilidad.** DEBUG-ACTIVE-PROJECT-1 (la cookie); DOMAINS-REDESIGN-1,
2026-08-05 (por qué la tarjeta no navega); DOMAINS-ACTIVE-COOKIE-1,
2026-08-07 (la misma cookie ya usada como recuerdo de página); Task Intake
aprobado por el fundador, 2026-08-20.

**Addendum (2026-08-20, mismo PR): el pilote automático no vio la
propagación, y le faltaba un journey para poder verla.** La pasada
automática contra el preview del PR #443 devolvió `PILOT PASS` en las 65
pantallas — incluida `domains`, en las tres anchuras — pero el agente
`ux-pilot`, al revisar las capturas de verdad antes de dar la fase por
cerrada, encontró que ni una sola tocaba la propagación al sidebar: el
barrido genérico (`tests/pilot/support/explore.ts`) descarta cualquier
control con `href` real como "navega fuera", y cada `.dm2-card` de la
rejilla lleva uno (`?active=<id>`) aunque en la práctica se queda en la
misma pantalla. Sin un journey dedicado, cada pasada futura del piloto
seguiría reportando un ✅ vacío sobre el comportamiento que esta misma fase
introduce — el mismo patrón que ya forzó `recommendations-interactions.spec.ts`
para Recomendaciones. Se añadió
`tests/pilot/journeys/domains-selection.spec.ts`: selecciona una tarjeta
que no sea el dominio activo y comprueba que tanto la portada como
`.proj-switch .proj-name` del sidebar cambian al nuevo dominio sin pulsar
"Ver visión general", y que el enlace de Prompts del sidebar ya apunta al
proyecto seleccionado. Estrictamente de lectura, en `tests/pilot/journeys/`
(no `write/` ni `scan/`), así que entra en la pasada automática de cada
deploy sin necesitar su propia excepción.

**El journey encontró un bug real: la propagación no funcionaba.** La
primera pasada del pilote automático sobre el push que añade el journey
(commit `6535985`) devolvió `PILOT FAIL` en las tres anchuras: "el
conmutador del sidebar no se actualizó tras seleccionar la tarjeta" — la
propia funcionalidad que este PR dice introducir.

**Causa.** El arreglo original leía la cookie `geo_active_project` en
`app/dashboard/layout.tsx` (Server Component) y se la pasaba a `Sidebar`
como `preferredProjectId`. Pero seleccionar una tarjeta en
`/dashboard/domains` es una navegación del lado del cliente que **no
cambia de segmento de ruta** — sigue siendo `/dashboard/domains`, sólo
cambia `?active=`. Next.js App Router no vuelve a renderizar un layout
compartido en ese caso (sólo el `page.tsx` de la hoja, que es por qué la
portada sí cambiaba), así que la instancia de `Sidebar` seguía montada con
el `preferredProjectId` calculado en la carga de página anterior — la
cookie se escribía bien en cada petición (`middleware.ts` sí veía el nuevo
`?active=` y actualizaba la cookie), pero nada volvía a leerla en el
cliente.

**Arreglo real.** `components/sidebar.tsx` añade `useSearchParams()` junto
al `usePathname()` que ya tenía: ese hook SÍ es reactivo a cualquier
navegación del cliente, cambie o no el pathname, así que leer
`?active=` en vivo cuando `pathname === "/dashboard/domains"` refleja la
selección en el mismo instante en que React re-renderiza tras el clic —
sin depender de que el layout se vuelva a montar. La cookie
(`preferredProjectId`) se queda como lo que siempre debió ser: el
recuerdo para cuando ni el pathname ni la query llevan un id (Ajustes,
Facturación, la raíz del dashboard). Prioridad, vía la misma
`resolveSelectedProject` que ya usa la página de Dominios: pathname >
`?active=` en vivo > cookie > `projects[0]`.

**Lección para el mapa de zonas.** Un cambio que depende de que el layout
de consola lea algo server-side (cookie, header) para reflejarlo en el
sidebar necesita comprobar primero si la navegación que lo dispara cambia
de segmento de ruta — si no lo hace, el layout no se vuelve a renderizar y
el dato queda obsoleto hasta la siguiente carga completa de página, en
silencio, sin ningún error.

---

## 123. Onboarding: el asistente dejaba entrar 10 competidores y el servidor guardaba 5 en silencio (ONBOARDING-COMPETITORS-CAP-1, 2026-08-20)

**Qué pasó.** El fundador dio de alta 10 competidores en el asistente de
nuevo dominio; al terminar el primer escaneo, la pantalla de Competidores
("Cuota de voz en IA") solo mostraba 5.

**Causa.** `parseInitialCompetitors` (`lib/projects/project-form.ts`) cortaba
la lista en `MAX_INITIAL_COMPETITORS` (5) sin avisar, mientras el asistente
(`components/onboarding-wizard.tsx`) no tenía ningún tope propio: el botón
"Añadir competidor" seguía añadiendo filas y el contador decía "10
competidores listos". El servidor descartó los últimos 5 sin error ni aviso
en pantalla — pérdida de datos silenciosa, no un fallo de renderizado. La
misma constante hacía doble papel: cuántos competidores pide el sistema a
Gemini como sugerencia, y cuántos acepta del usuario. El primer uso ya tenía
un arreglo equivalente para prompts (`maxPrompts` pasado desde el cap del
plan); a competidores nunca se le aplicó.

**Impacto real.** No es solo visual: el set de competidores entra en
`competitors_snapshot` y alimenta `standing`, `brand_position` y
`prominence` (ADR 0018). Ese escaneo se puntuó contra 5 competidores en vez
de 10.

**Decisión (opción B, aprobada por el fundador).** Separar los dos usos:
`MAX_INITIAL_COMPETITORS` (5) queda solo para la petición de sugerencias a
Gemini; nace `MAX_USER_COMPETITORS` (10) como tope explícito y **visible**
de lo que el asistente acepta. El botón "Añadir competidor" se deshabilita
al llegar a 10 y el contador pasa a decir "N competidores listos (máximo
10)" — mismo patrón que ya usaba el paso de prompts con `promptCap`. Ningún
tope que la interfaz no enseña es aceptable: es exactamente esta pérdida de
datos silenciosa otra vez, con otro nombre.

**No incluido en esta fase.** Recalcular el escaneo que ya corrió con solo 5
competidores (los 5 que faltan se dan de alta ahora en "Gestionar", que no
tiene tope, y entran desde el siguiente escaneo). No se tocó `sampling`, el
pipeline de extracción, ni el cap de prompts.

**Trazabilidad.** `lib/projects/project-form.ts`,
`components/onboarding-wizard.tsx`,
`lib/projects/project-form.test.ts`; ADR 0018 (por qué el set de
competidores importa para el scoring, no solo para la pantalla).

---

## 124. El piloto abre por fin `/signup` y `/forgot-password` (PRELAUNCH-HARDENING-1 Fase P2, 2026-08-20)

**Qué se decidió.** `tests/pilot/journeys/auth-pages.spec.ts` — las dos
pantallas de autenticación que el piloto de lectura nunca había abierto. Parte
del set por defecto sin tocar configuración: sigue el mismo patrón
`**/journeys/*.spec.ts` que el resto.

**Por qué necesitaban su propio contexto, sin sesión.** Los proyectos
`mobile`/`tablet`/`desktop` montan siempre con `storageState:
.pilot/auth.json` — correcto para pantallas de consola, pero
`app/signup/page.tsx` hace `if (user) redirect("/dashboard")`: visitarla ya
autenticado enseña el dashboard con otro nombre, no el formulario de alta.
`test.use({ storageState: { cookies: [], origins: [] } })`, sólo en este
fichero, sustituye el `storageState` del proyecto — el resto del set sigue
entrando como la cuenta piloto. Es la corrección honesta, no un atajo: un
contexto de verdad sin sesión es exactamente el visitante que sirven estas dos
pantallas.

**Qué comprueba más allá de la salud genérica.** Los campos propios de cada
formulario (`#email`/`#password`/`#confirmPassword` en alta, `#reset-email` y
el botón de envío en recuperación) y que ambas declaran `<meta name="robots"
content="noindex, follow">` (SEO-POS-1 T10) — nunca lo había verificado el
piloto. Ningún test envía el formulario: sólo navegación GET, ni Supabase Auth
ni correo de por medio, la misma frontera que ya respeta el resto del set de
lectura.

**`tests/pilot/fixtures/server.mjs` se amplió a la vez**, con las mismas dos
rutas y la misma forma de contenido, para que `pnpm pilot:selfcheck` siga
demostrando que el arnés funciona de punta a punta en vez de recibir un 404 y
fallar en falso.

**Tres afirmaciones del plan original resultaron obsoletas al verificarlas
contra el código real**, encontradas durante el Task Intake de esta fase, no
implementadas aquí: A2 (`triggerWebAuditRun` ya comprueba `response.ok` y
registra el fallo — WEB-AUDIT-DRIVE-1 lo llevaba hecho), `/pricing` (ya
cubierto por `landing.spec.ts`) y el pliegue de facturación de ajustes (ya
cubierto por `settings.spec.ts`). Ninguna necesitaba trabajo nuevo; el plan en
`docs/prelaunch-hardening-plan.md` se marca cerrado en A2 en el mismo PR.

**No incluido en esta fase.** El paso de confirmación de `/forgot-password`
(necesita un token de reinicio válido, inalcanzable sin buzón — sigue siendo
un smoke manual del fundador, igual que la confirmación por email del alta).
P3 (matriz de documentación) y P4 (ronda de ejecución, necesita GitHub Actions
o la sesión local del fundador) quedan fuera, tal como recomendaba el propio
Task Intake.

**Trazabilidad.** `tests/pilot/journeys/auth-pages.spec.ts`;
`tests/pilot/fixtures/server.mjs`; `docs/agentic-user-pilot.md` (sección
"PRELAUNCH-HARDENING-1 Fase P2"); `docs/prelaunch-hardening-plan.md` (ledger
A2).

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

---
