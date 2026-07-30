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

**Estado: v3 implementado (PR #260); capa de escritorio añadida en
PROMPTS-DESKTOP-1.**

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
- ≥1200px: columna a 900px — cada fila de prompt cabe en una línea sin
  envolver, las etiquetas dejan de apilarse debajo del texto. El buscador
  (`.pr2-search`) se topa a 360px en vez de estirarse sin límite junto al
  botón — mismo patrón ya usado en `.pr-search` (toolbar de Citations).
- ≥1600px: tope 1000px, no crece sin límite en monitores ultra-anchos.
- Mecanismo: solo CSS, sin wrappers nuevos en JSX — a diferencia de
  Overview, esta pantalla es una sola lista (acordeón de topics o lista
  plana), no varios widgets distintos, así que no hace falta ninguna
  reestructuración de grid.

Pendiente / roto conocido:
- El drawer de detalle de prompt (`.prompt-drawer`, `prompt-drawer.tsx`)
  sigue siendo un full-screen takeover (`position: fixed; inset: 0`)
  también en escritorio — decisión explícita del fundador del
  2026-07-24 (comentario en `app/globals.css` junto a `.prompt-drawer`):
  se probó y se descartó un panel lateral de 520px/95vw por dejar una
  franja gris del fondo atenuado. No se ha reabierto esa decisión aquí;
  en escritorio el drawer sigue ocupando toda la pantalla, lo cual puede
  sentirse pesado en monitores grandes — vale la pena que el fundador lo
  sepa, pero no se ha tocado sin su aprobación explícita.

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
