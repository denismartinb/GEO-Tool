# GenScore — Guía de identidad de marca (BRAND-1/BRAND-2)

> Estado: BRAND-1 (activos + favicon + guía) y BRAND-2 (adopción del logo en
> cabeceras + retirada de los logos ficticios de la landing) implementados.
> Fase 3 (Open Graph en metadata, cabecera con logo en emails) sigue
> pendiente de aprobación — ver "Plan de adopción".

---

## 1. Concepto del logo: la "G-gauge" integrada (v2)

El logo es un **lockup integrado**: la G-gauge — una G construida como un
arco de indicador (gauge) — actúa como la **letra inicial del propio
wordmark**, seguida de "enScore". Marca y nombre son una única pieza
coherente, no un icono junto a un texto.

- la **G** en **degradado índigo** (`#6d5ef0 → #4338ca`): el color de acción
  de la interfaz, con volumen para no leerse como texto plano;
- el **punto ámbar** (`#f59e0b`) en la apertura del arco: la posición del
  score, la firma visual de la marca — visible incluso a 18 px en móvil;
- el wordmark en **Bricolage Grotesque ExtraBold (800)** convertido a
  trazados: una grotesca con carácter, distinta de la tipografía de UI.

v1 (G monocolor tinta + punto índigo, wordmark Hanken) se descartó por
feedback del fundador: demasiado simple, en móvil el gauge apenas se
apreciaba y el conjunto leía como texto negro.

### Archivos (`public/brand/`)

| Archivo | Uso |
|---|---|
| `genscore-mark.svg` | G-gauge sola (degradado + punto ámbar), fondo claro |
| `genscore-mark-white.svg` | G-gauge sola (degradado claro + ámbar claro), fondo oscuro |
| `genscore-mark-mono.svg` | G-gauge monocroma en tinta (sellos, docs) |
| `genscore-tile.svg` | Tile: squircle degradado índigo + G blanca + punto ámbar (favicon / app icon / redes) |
| `genscore-logo.svg` | Lockup integrado (G-gauge + "enScore"), fondo claro |
| `genscore-logo-white.svg` | Lockup integrado, fondo oscuro |
| `genscore-wordmark.svg` | "GenScore" completo en Bricolage 800 tinta (contextos de solo texto) |
| `genscore-og.png` | Open Graph 1200×630 (pendiente de conectar en metadata) |

`app/icon.svg` es el favicon (Next.js lo sirve automáticamente) y usa el tile.

### Reglas de uso

- El wordmark es **Bricolage Grotesque ExtraBold (800)**, tracking −0.012 em,
  convertido a trazados en los SVG y en el componente (no depende de la
  fuente instalada; la UI sigue usando Hanken Grotesk).
- En cabeceras dentro de la app, usar `components/ui/brand-logo.tsx`
  (`BrandLogo` para el lockup íntegro, `BrandMark` para la G sola): mismos
  trazados que los SVG, nítido a cualquier tamaño. `size` = altura en px.
- Tamaño mínimo del lockup: 18 px de altura. Para el símbolo suelto por
  debajo de 16 px, usar el tile.
- El degradado índigo pertenece a la G; el texto va siempre en tinta plana
  (blanco sobre oscuro). El punto es siempre ámbar (`#f59e0b` claro /
  `#fbbf24` oscuro) — es la firma de la marca, no recolorear.
- Zona de respeto: la altura de la G de margen alrededor del lockup.

---

## 2. Paleta

**Veredicto: se mantiene la paleta actual, pero con roles de marca definidos
y menos degradado.** El problema no eran los colores sino que la marca no los
usaba con jerarquía (el logo era un cuadrado degradado CSS con un icono
genérico de "ondas").

| Rol | Token | Hex | Notas |
|---|---|---|---|
| Tinta de marca | `--ink` | `#0f1729` | Texto del wordmark y fondos oscuros de marketing |
| Índigo de marca (G) | — | `#6d5ef0 → #4338ca` | Degradado exclusivo de la G del logo y del tile. Sobre oscuro: `#a5b0fb → #7c74f2` |
| Ámbar de score (punto) | — | `#f59e0b` | **Solo** para el punto del score del logo (`#fbbf24` sobre oscuro). No usarlo como color de UI |
| Acento de UI | `--accent` | `#4f46e5` | Índigo de acción de la interfaz, sin cambios |
| Lienzo | `--canvas` | `#f6f7f9` | Sin cambios |
| Positivo / negativo | `--pos` / `--neg` | `#15915a` / `#d23b48` | Sin cambios, solo semántica de datos |

Recomendación asociada: retirar progresivamente los degradados decorativos de
marca en favor de tinta plana + acento. El degradado de `.brand-mark` se
retiró en BRAND-2; el de `.avatar` se retiró en BRAND-4 (tinta plana
`--accent-soft`/`--accent-ink`, igual que `.proj-favicon`). Los degradados
decorativos de marketing (testimonios) quedan pendientes de revisión — no es
un error, es una decisión de criterio de marca para una fase aparte. Los
degradados de fondo de héroe/OG se mantienen, esos sí son intencionados,
no para el símbolo.

---

## 3. Tipografía

**UI: se mantiene** Hanken Grotesk + JetBrains Mono (datos/dominios) —
combinación correcta para producto técnico serio.

**Marca: Bricolage Grotesque 800, solo en el wordmark.** El wordmark vive
como trazados vectoriales (SVG y componente), así que **no se carga ninguna
fuente nueva en la app** — cero coste de peso ni de FOUT. La distinción
marca/UI es deliberada: el logo tiene carácter propio y la interfaz sigue
neutra y legible.

---

## 4. Auditoría de marca

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | **No existía favicon ni app icon** (pestaña con globo por defecto) | P1 — daña confianza en cada pestaña | ✅ Resuelto en BRAND-1 (`app/icon.svg`) |
| 2 | **No existía ningún activo de logo** (`public/` sin marca); el "logo" era CSS (`.brand-mark`, degradado + icono genérico `resonance`) | P1 | ✅ Activos creados en BRAND-1; adoptados en BRAND-2 |
| 3 | Logo duplicado a mano en **10 sitios** (sidebar, landing, legal shell, blog shell, `geo`, `pricing` y las 4 pantallas de auth), con tamaños inconsistentes (16/17 px). En `signup` y `signup/confirm` el icono ni siquiera era el de marca: un SVG de ajustes (engranaje) copiado por error | P2 (P1 en signup/confirm por el icono incorrecto) | ✅ Resuelto en BRAND-2 — los 10 sitios usan `BrandLogo`/`BrandMark`; icono incorrecto corregido |
| 4 | **Sin Open Graph / Twitter image** — los enlaces compartidos salen sin imagen | P1 para marketing | Asset listo; conectar metadata = Fase 3 |
| 5 | La sección de confianza de la landing muestra **logos de empresas ficticias** ("Northwind", "Quantix", "Beltway"…) | **P1 — viola "no fake product behavior"** y es lo contrario de "marca contrastada" | ✅ Resuelto en BRAND-2 — sustituido por los motores de IA reales que analiza el producto (Gemini, ChatGPT, Claude) |
| 6 | Emails transaccionales: marca solo texto plano | P3 | Fase 3 (cabecera con logo) |
| 7 | Paleta y tipografía | Correctas | Se codifican roles en este doc |

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
- **Fase 3 — BRAND-3 (metadata + emails):** `openGraph`/`twitter` en
  `app/layout.tsx` apuntando a `genscore-og.png`; cabecera con logo en los
  emails de Resend. Pendiente de aprobación.
- **Fase 4 — BRAND-4 (✅ implementado):** armonización visual tras la
  auditoría UX/UI post-v2 — copy retirado "GEO Studio"→"GenScore"
  (`components/settings/notifications-tab.tsx`), el ámbar de marca dejó de
  usarse como color de UI (`plan-billing-section.tsx` usa `--warn`/
  `--warn-ink` en vez de `#f59e0b`), `.avatar` sin degradado (tinta plana,
  igual criterio que `.proj-favicon`), y el arranque del degradado de la
  gauge del Overview (`components/ui/gauge.tsx`) alineado al índigo exacto
  de la G (`#6d5ef0`). Pendiente para una fase aparte, con decisión de
  criterio del fundador: punto ámbar en la gauge del score, y revisión de
  los degradados de testimonios en marketing.

Cada fase pasa por Task Intake ligero + Human Gate como siempre.
