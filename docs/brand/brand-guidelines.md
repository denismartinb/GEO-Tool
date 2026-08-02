# Genscore — Guía de identidad de marca (BRAND-1 → BRAND-5)

> Estado: BRAND-1/2/4 (activos v2, adopción, armonización) implementados y
> superseded por **BRAND-5: identidad v3** — nuevo logo (paleta azul/navy en
> vez de índigo/ámbar), nueva tipografía (Bricolage Grotesque + Figtree en
> vez de Hanken Grotesk). BRAND-5a (este PR) trae los activos, el favicon,
> las fuentes y los tokens; **la UI y los emails siguen sin repintar hasta
> BRAND-5b/5c** — ver "Plan de adopción".
>
> Este documento es el **sistema** (logo, paleta, tipografía, reglas de
> uso). El histórico de decisiones de layout/UX ya implementadas por
> pantalla (landing, consola, cabeceras/menú, Overview…) vive en
> `docs/brand/design-decisions-log.md` — consultarlo antes de reabrir o
> contradecir una decisión ya tomada.

---

## 1. Concepto del logo v3: la G con anillo de evidencia

El símbolo es una **G sólida** con un **anillo segmentado** alrededor (cada
segmento representa una señal: menciones, citas, competidores) y un **punto
ámbar** en la apertura marcando la posición del score. El wordmark
"Genscore" (una sola palabra, sin camelCase) usa la misma G como letra
inicial en los lockups integrados.

Iteración desde v2 (feedback del fundador, sesión de diseño): la v2 (G-gauge
en degradado índigo + "enScore" en Bricolage) se sentía "poco profesional,
poco elegante" y demasiado parecida al lenguaje visual genérico de SaaS de
IA. La v3 sustituye el índigo por una paleta **azul/navy más seria y
analítica** y separa con más disciplina símbolo y wordmark.

- la **G** en tinta (`#0B1426` sobre claro / `#F7F8FB` sobre oscuro);
- el **anillo** en azul de marca (`#2563EB`) — la señal/evidencia;
- el **punto** en ámbar (`#FFB020`) — la posición del score, firma de la
  marca, no reutilizable como color de UI;
- el wordmark en **Bricolage Grotesque** (títulos y el número héroe del
  score) — la UI de producto pasa a **Figtree** (cuerpo, datos pequeños),
  retirando Hanken Grotesk.

Colores **planos** (no degradados): la v2 usaba gradientes; los assets v3 se
entregan con relleno sólido para máxima fidelidad entre el diseño y el
render en pantalla.

### Archivos (`public/brand/`)

| Archivo | Uso |
|---|---|
| `genscore-mark.svg` | Símbolo solo (G + anillo + punto), fondo claro |
| `genscore-mark-white.svg` | Símbolo solo, fondo oscuro |
| `genscore-mark-mono.svg` | Símbolo monocromo en tinta (sellos, docs) |
| `genscore-tile.svg` | Tile: squircle navy + símbolo (favicon / app icon) |
| `genscore-tile-light.svg` | Tile sobre fondo claro |
| `genscore-logo.svg` | Lockup integrado (símbolo + "enscore"), fondo claro |
| `genscore-logo-white.svg` | Lockup integrado, fondo oscuro |
| `genscore-wordmark.svg` | "Genscore" completo, solo texto (sin símbolo) |
| `genscore-og.png` | Open Graph 1200×630 (conectado en `app/layout.tsx`, BRAND-5a) |
| `favicon-16.png` / `favicon-32.png` | Favicon raster (metadata `icons`) |
| `apple-touch-icon.png` | 180×180, iOS |
| `icon-512.png` | 512×512, PWA/app store |
| `genscore-logo-white-email.png` | Cabecera de los emails transaccionales — **todavía v2** (índigo), pendiente de regenerar en BRAND-5c |

`app/icon.svg` es el favicon que Next.js sirve automáticamente y usa el tile.

### Reglas de uso

- En cabeceras dentro de la app, usar `components/ui/brand-logo.tsx`
  (`BrandLogo` para el lockup íntegro, `BrandMark` para el símbolo solo):
  mismos trazados que los SVG (colores planos, sin degradados), nítido a
  cualquier tamaño. `size` = altura en px.
- El ámbar (`#FFB020`) es exclusivo del punto del logo — no usarlo como
  color de aviso/warning de la interfaz (ver hallazgo #2 de la auditoría
  BRAND-4, ya corregido una vez; no reintroducirlo con la v3).
- Zona de respeto: la altura de la G de margen alrededor del lockup.
- No recolorear, distorsionar, ni separar símbolo y wordmark.

---

## 2. Paleta v3

**Veredicto: se sustituye el índigo/ámbar de la v2 por una paleta azul/navy
más analítica.** Los tokens conviven en `app/globals.css` (`:root`) bajo el
prefijo `--brand-*`, sin pisar los tokens `--ink`/`--accent`/etc. actuales —
BRAND-5b hace el repintado real de la UI sobre estos valores.

| Rol | Token | Hex | Notas |
|---|---|---|---|
| Tinta de marca | `--brand-ink` | `#0B1426` | Texto de titulares, símbolo sobre claro |
| Tinta sobre oscuro | `--brand-ink-on-dark` | `#F7F8FB` | Texto/símbolo sobre fondo oscuro |
| Azul de marca | `--brand-blue` | `#2563EB` | Acento primario — anillo del símbolo, "score" del wordmark, CTAs |
| Azul secundario | `--brand-blue-2` | `#4F7BFF` | Highlight / estados secundarios |
| Cian | `--brand-cyan` | `#09C5D6` | Acento de señal (uso puntual) |
| Ámbar de score | `--brand-warm` | `#FFB020` | **Solo** el punto del logo — no color de UI |
| Lienzo | `--brand-canvas` | `#F7F8FB` | Fondo de página |
| Superficie | `--brand-surface` | `#FFFFFF` | Tarjetas |
| Lienzo oscuro | `--brand-canvas-dark` | `#081223` | Fondo (para cuando exista dark mode de producto — BRAND-5d) |
| Superficie oscura | `--brand-surface-dark` | `#0F1C33` | Tarjetas en oscuro |
| Texto secundario | `--brand-muted` | `#5B6B82` | Body/labels secundarios |
| Positivo / negativo | `--brand-pos` / `--brand-neg` | `#15915A` / `#D23B48` | Semántica de datos, sin cambio de valor respecto a v2 |

---

## 3. Tipografía v3

**Decisión (sesión de diseño, opción "C"):**

- **Titulares y el número héroe del score** → **Bricolage Grotesque**
  (700/800) — grotesca con carácter, la misma familia del logo v2, pero
  ahora también usada como tipografía viva de producto (antes solo vivía
  como trazados en el SVG).
- **Cuerpo, UI, etiquetas, tablas y números pequeños** → **Figtree**
  (400/500/600) — sans cálida y legible, sustituye a Hanken Grotesk.
- **Datos/dominios** → **JetBrains Mono**, sin cambios.

Ambas fuentes se cargan vía `next/font/google` en `app/layout.tsx`
(`--font-display` para Bricolage, `--font-body` para Figtree). **Hanken
Grotesk se mantiene cargada y en uso hasta BRAND-5b** — quitar su import
antes de que la UI deje de referenciarla causaría un salto de fuente sin
estilo; 5b hace el cambio y retira el import en el mismo commit.

**Nota sobre emails (BRAND-5c):** los clientes de correo no cargan fuentes
personalizadas de forma fiable — el email seguirá cayendo a una fuente de
sistema en el cuerpo del mensaje. La marca tipográfica en emails la lleva el
logo (imagen), no el texto.

---

## 4. Auditoría de marca

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | **No existía favicon ni app icon** (pestaña con globo por defecto) | P1 — daña confianza en cada pestaña | ✅ Resuelto en BRAND-1 (`app/icon.svg`) |
| 2 | **No existía ningún activo de logo** (`public/` sin marca); el "logo" era CSS (`.brand-mark`, degradado + icono genérico `resonance`) | P1 | ✅ Activos creados en BRAND-1; adoptados en BRAND-2 |
| 3 | Logo duplicado a mano en **10 sitios** (sidebar, landing, legal shell, blog shell, `geo`, `pricing` y las 4 pantallas de auth), con tamaños inconsistentes (16/17 px). En `signup` y `signup/confirm` el icono ni siquiera era el de marca: un SVG de ajustes (engranaje) copiado por error | P2 (P1 en signup/confirm por el icono incorrecto) | ✅ Resuelto en BRAND-2 — los 10 sitios usan `BrandLogo`/`BrandMark`; icono incorrecto corregido |
| 4 | **Sin Open Graph / Twitter image** — los enlaces compartidos salen sin imagen | P1 para marketing | ✅ Resuelto en BRAND-5a — `openGraph`/`twitter` en `app/layout.tsx` → `genscore-og.png` |
| 5 | La sección de confianza de la landing muestra **logos de empresas ficticias** ("Northwind", "Quantix", "Beltway"…) | **P1 — viola "no fake product behavior"** y es lo contrario de "marca contrastada" | ✅ Resuelto en BRAND-2 — sustituido por los motores de IA reales que analiza el producto (Gemini, ChatGPT, Claude) |
| 6 | Emails transaccionales: marca solo texto plano | P3 | ✅ Resuelto (PR #242) — cabecera con logo real en los 8 emails de Resend + 2 plantillas de Supabase Auth. ✅ Actualizados a v3 en BRAND-5c |
| 7 | Paleta y tipografía v2 | Correctas para su momento | Sustituidas por v3 (azul/navy + Bricolage/Figtree) tras feedback del fundador — ver §2/§3 |

---

## 5. Plan de adopción (requiere aprobación por fases)

- **Fase 1 — BRAND-1 (✅ implementado):** activos en `public/brand/`,
  favicon `app/icon.svg`, componente `BrandLogo`, esta guía. Cero cambios de
  pantallas.
- **Fase 2 — BRAND-2 (✅ implementado):** sustituidos los bloques
  `brand-mark` + `brand-name` por `BrandLogo`/`BrandMark` en los 10 sitios
  reales encontrados en el repo — `components/sidebar.tsx`,
  `components/blog/blog-page-shell.tsx`, `components/legal-page-shell.tsx`,
  `app/page.tsx`, `app/geo/page.tsx`, `app/pricing/page.tsx`,
  `app/login/page.tsx`, `app/forgot-password/page.tsx`,
  `app/signup/page.tsx`, `app/signup/confirm/page.tsx` — y retirados los
  logos ficticios de la landing (sustituidos por Gemini/ChatGPT/Claude, los
  motores reales que analiza el producto). Se eliminó la clase CSS
  `.brand-mark` (degradado) del sistema.
- **Fase 3 — BRAND-3 (✅ implementado, PR #242):** `openGraph`/`twitter`
  metadata y cabecera con logo en los emails de Resend + plantillas de
  Supabase Auth. Implementado contra la v2 (índigo) — BRAND-5c lo actualiza
  a v3.
- **Fase 4 — BRAND-4 (✅ implementado):** armonización visual tras la
  auditoría UX/UI post-v2 — copy retirado "GEO Studio"→"GenScore"
  (`components/settings/notifications-tab.tsx`), el ámbar de marca dejó de
  usarse como color de UI (`plan-billing-section.tsx` usa `--warn`/
  `--warn-ink` en vez de `#f59e0b`), `.avatar` sin degradado (tinta plana,
  igual criterio que `.proj-favicon`), y el arranque del degradado de la
  gauge del Overview (`components/ui/gauge.tsx`) alineado al índigo exacto
  de la G v2 (`#6d5ef0`) — superseded por el repintado v3 de BRAND-5b.

### BRAND-5 — identidad v3 (rediseño tras feedback del fundador)

- **Fase 5a — BRAND-5a (✅ implementado, este PR):** activos v3 en
  `public/brand/`, favicon (`app/icon.svg` + PNG en metadata `icons`),
  `BrandLogo`/`BrandMark` reconstruidos con los trazados v3, tipografía
  Bricolage Grotesque + Figtree cargada (sin repintar la UI aún — Hanken
  sigue activa), tokens `--brand-*` añadidos junto a los existentes,
  Open Graph/Twitter conectados. Cero cambio visual fuera de
  logo/favicon/OG.
- **Fase 5b — BRAND-5b (🔶 en curso, por zonas):** repintar la UI completa
  (paleta `--ink`/`--accent` → tokens `--brand-*`, tipografía Hanken →
  Figtree/Bricolage) por zonas: auth → shell/sidebar → Overview → tablas →
  billing → landing/legal. Retira el import de Hanken Grotesk cuando la
  última zona esté migrada. **Overview (✅) y cabeceras/menú de consola
  (✅, PR #257)** ya implementados — detalle decisión a decisión en
  `docs/brand/design-decisions-log.md` §2–4. Resto de zonas pendientes.
- **Fase 5c — BRAND-5c (✅ implementado):** los 8 emails de Resend
  (`lib/email/transactional.ts`) y las 2 plantillas de Supabase Auth
  (`docs/email-templates/`) están en v3 — cabecera nueva
  (`genscore-email-header.png`, 1200 × 240, generada desde el lockup v3 +
  tagline horneado como raster), colores email-safe `#0B1426 · #2563EB ·
  #FFB020 · #FFFFFF`, ámbar retirado de los avisos (bajada de score / píldora
  negativa del resumen semanal pasan a rojo `#D23B48`, mismo criterio que
  BRAND-4), emojis fuera de titulares y asuntos. Detalle completo en
  `docs/brand/email-design-proposal.md` (incluye dos hallazgos de
  implementación no previstos en la propuesta: el PNG v2 ya venía
  pre-recortado, y una cabecera a ancho fijo rompía el `@media` que hace
  responsive el email en móvil).
- **Fase 5d — dark mode de producto (opcional, fuera de esta serie):** los
  tokens `--brand-canvas-dark`/`--brand-surface-dark` ya están definidos,
  pero la app hoy es solo modo claro (`color-scheme: light`). Proyecto
  propio si se decide abordarlo.

Cada fase pasa por Task Intake ligero + Human Gate como siempre.
