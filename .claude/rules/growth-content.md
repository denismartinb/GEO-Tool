---
description: Invariantes del contenido de adquisición orgánica (blog, comparativas, docs, glosario).
paths:
  - "app/blog/**"
  - "app/comparativas/**"
  - "app/docs/**"
  - "app/glosario/**"
  - "lib/blog/**"
  - "lib/comparativas/**"
  - "lib/docs/**"
  - "lib/glosario/**"
---

# Contenido / GROWTH — invariantes

Arquitectura y reglas de redacción: `docs/content-strategy.md`.
Historia de decisiones visuales: `docs/brand/design-decisions-log.md` §12 y §13.

## Honestidad (la regla dura)

- **Toda afirmación sobre metodología, feature o capacidad del producto debe
  trazarse a un ADR o al código real.** Si no se puede trazar, no se publica
  (content-strategy §4.5).
- **Ninguna cifra de mercado de terceros se presenta como dato propio de
  Genscore.** Sólo el Observatorio (capa E, con aprobación aparte) genera dato
  propio real.
- **Un peso no es un valor medido** (log §13). No presentar un parámetro de
  configuración del score como si fuera un resultado observado.

## Imágenes

- **Ningún visual es decorativo: todos son evidencia** (ADR 0026
  `article-imagery-policy`). Cada imagen es una captura que prueba la
  afirmación, un ejemplo enmarcado del patrón que se enseña, o una tarjeta de
  dato con su fuente. Si una imagen no prueba nada, no va.

## Redacción

- La densidad de palabra clave es un **techo, no un objetivo** (§4.2).
- Copy de cara al usuario en castellano; código, identificadores, comentarios y
  commits en inglés.
- El nombre público es **Genscore**. "GEO Studio" es el nombre interno del repo
  y "Lumira" está retirado — no reintroducir ninguno en copy de usuario.

## Al cerrar una pieza

- Actualizar `docs/content-calendar.md` **en el mismo PR** que publica la pieza
  (una fila por pieza). El calendario es el libro mayor: una pieza publicada que
  no aparece ahí queda invisible para la siguiente sesión.
