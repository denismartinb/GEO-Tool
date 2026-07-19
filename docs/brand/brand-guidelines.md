# GenScore — Guía de identidad de marca (BRAND-1)

> Estado: propuesta aprobable. Este documento acompaña al PR de BRAND-1, que
> solo añade activos, el favicon y este documento. La adopción del logo en las
> pantallas existentes es una fase posterior (ver "Plan de adopción").

---

## 1. Concepto del logo: la "G-gauge"

El símbolo es una **G construida como un arco de indicador (gauge)** con un
**punto de acento** que marca la posición del score. Une las dos ideas del
producto en una sola forma:

- la **G** de GenScore;
- el **gauge/score**, el elemento héroe del Overview (el GEO Score).

Es geométrico, monocolor + un acento, sin degradados: serio, profesional y
legible desde 96 px hasta el favicon de 16 px.

### Archivos (`public/brand/`)

| Archivo | Uso |
|---|---|
| `genscore-mark.svg` | Símbolo solo, sobre fondo claro |
| `genscore-mark-white.svg` | Símbolo solo, sobre fondo oscuro |
| `genscore-mark-mono.svg` | Símbolo monocromo (tinta única: sellos, docs) |
| `genscore-tile.svg` | Tile cuadrado redondeado (app icon / favicon / redes) |
| `genscore-logo.svg` | Lockup horizontal (símbolo + wordmark), fondo claro |
| `genscore-logo-white.svg` | Lockup horizontal, fondo oscuro |
| `genscore-wordmark.svg` | Solo wordmark (trazados vectoriales reales) |
| `genscore-og.png` | Open Graph 1200×630 (pendiente de conectar en metadata) |

`app/icon.svg` es el favicon (Next.js lo sirve automáticamente) y usa el tile.

### Reglas de uso

- El wordmark es **Hanken Grotesk ExtraBold (800)**, tracking −0.015 em,
  convertido a trazados en los SVG (no depende de la fuente instalada).
- En cabeceras dentro de la app, usar `components/ui/brand-logo.tsx`
  (`BrandLogo` / `BrandMark`) en lugar de los SVG: renderiza nítido a
  cualquier tamaño y en un solo color + acento.
- Tamaño mínimo del símbolo: 16 px. Por debajo, usar el tile.
- No aplicar degradados al símbolo ni al wordmark. No recolorear el punto de
  acento fuera de la paleta (índigo sobre claro, índigo suave sobre oscuro).
- Zona de respeto: medio símbolo de margen alrededor del lockup.

---

## 2. Paleta

**Veredicto: se mantiene la paleta actual, pero con roles de marca definidos
y menos degradado.** El problema no eran los colores sino que la marca no los
usaba con jerarquía (el logo era un cuadrado degradado CSS con un icono
genérico de "ondas").

| Rol | Token | Hex | Notas |
|---|---|---|---|
| Tinta de marca (primario) | `--ink` | `#0f1729` | El color que transmite "serio y contrastado". Domina el logo, el tile y los fondos oscuros de marketing |
| Acento | `--accent` | `#4f46e5` | Índigo de acción. En la marca aparece **solo** en el punto del score |
| Acento sobre oscuro | — | `#818cf8` | Punto de score y enlaces sobre `--ink` |
| Lienzo | `--canvas` | `#f6f7f9` | Sin cambios |
| Positivo / negativo | `--pos` / `--neg` | `#15915a` / `#d23b48` | Sin cambios, solo semántica de datos |

Recomendación asociada: retirar progresivamente los degradados decorativos de
marca (`.brand-mark`, `.avatar`) en favor de tinta plana + acento. Los
degradados quedan para fondos de marketing (hero, OG), no para el símbolo.

---

## 3. Tipografía

**Veredicto: se mantiene.** Hanken Grotesk (UI y marca) + JetBrains Mono
(datos/dominios) es una combinación correcta y ya transmite producto técnico
serio. No se añade ninguna fuente display: el wordmark usa la misma Hanken
Grotesk en 800, lo que refuerza coherencia entre marca y producto.

Único ajuste recomendado: cargar también el peso 800 donde se use el wordmark
como texto (ya está incluido en `app/layout.tsx`).

---

## 4. Auditoría de marca (estado previo a BRAND-1)

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | **No existía favicon ni app icon** (pestaña con globo por defecto) | P1 — daña confianza en cada pestaña | ✅ Resuelto en este PR (`app/icon.svg`) |
| 2 | **No existía ningún activo de logo** (`public/` sin marca); el "logo" era CSS (`.brand-mark`, degradado + icono genérico `resonance`) | P1 | ✅ Activos creados; adopción en pantallas = Fase 2 |
| 3 | Logo duplicado a mano en 4 sitios (sidebar, landing, legal shell, blog shell) con tamaños inconsistentes (16/17 px) | P2 | Fase 2 (sustituir por `BrandLogo`) |
| 4 | **Sin Open Graph / Twitter image** — los enlaces compartidos salen sin imagen | P1 para marketing | Asset listo; conectar metadata = Fase 3 |
| 5 | La sección de confianza de la landing muestra **logos de empresas ficticias** ("Northwind", "Quantix", "Beltway"…) | **P1 — viola "no fake product behavior"** y es lo contrario de "marca contrastada" | Propuesto: retirar o sustituir por claim honesto (Fase 2) |
| 6 | Emails transaccionales: marca solo texto plano | P3 | Fase 3 (cabecera con logo) |
| 7 | Paleta y tipografía | Correctas | Se codifican roles en este doc |

---

## 5. Plan de adopción (requiere aprobación por fases)

- **Fase 1 — este PR (BRAND-1):** activos en `public/brand/`, favicon
  `app/icon.svg`, componente `BrandLogo` (sin usos), esta guía. Cero cambios
  de comportamiento o de pantallas.
- **Fase 2 — BRAND-2 (UI):** sustituir los cuatro bloques `brand-mark` +
  `brand-name` por `BrandLogo` (sidebar, landing, legal, blog, auth) y
  retirar los logos ficticios de la sección de confianza de la landing.
- **Fase 3 — BRAND-3 (metadata + emails):** `openGraph`/`twitter` en
  `app/layout.tsx` apuntando a `genscore-og.png`; cabecera con logo en los
  emails de Resend.
- **Fase 4 — polish (P3):** avatar sin degradado, revisión de estados vacíos
  y microcopy de marca.

Cada fase pasa por Task Intake ligero + Human Gate como siempre.
