# BRAND-5c — Diseño de los emails de Genscore

> **Estado: ✅ implementado** (aprobadas las 4 decisiones de §4 tal cual
> recomendado: cabecera blanca, ámbar fuera, emojis fuera, tagline incluido).
> `lib/email/transactional.ts` (los 8 emails de Resend) y las 2 plantillas de
> Supabase (`docs/email-templates/*.html`) están en la identidad v3. Este
> documento describe la propuesta original y sigue siendo la referencia de
> diseño; la maqueta de exploración previa a la implementación está en
> `docs/brand/email-preview/index.html`.
>
> **Dos hallazgos durante la implementación, no previstos en la propuesta:**
> 1. El activo de cabecera anterior (`genscore-logo-white-email.png`, v2) no
>    solo tenía la paleta antigua — sus píxeles ya venían recortados: 958×164
>    (ratio 5.84) no coincide con el ratio real del lockup (1111:254 = 4.41),
>    así que la captura original ya excluía parte del símbolo antes de
>    llegar a producción. El nuevo activo (`genscore-email-header.png`,
>    1200×240) se genera capturando exactamente su propio lienzo, sin ese
>    descuadre — ver §7 más abajo para el detalle técnico.
> 2. La cabecera nueva ocupa el ancho completo de la tarjeta (a diferencia
>    del logo v2, que era pequeño); con un `<img>` de ancho fijo
>    (`width:600px;height:120px`) eso bloqueaba el `@media (max-width:600px)`
>    que hace responsive el email — el email dejaba de encogerse en móvil de
>    forma silenciosa, sin ningún error visible. Corregido con la técnica de
>    imagen fluida estándar en email (`width:100%;max-width:600px;
>    height:auto`), documentado en `docs/email-templates/README.md`.

---

## 1. Qué hay hoy

Diez emails, dos caminos de render distintos:

| # | Email | Dónde vive | Disparo |
|---|---|---|---|
| 1 | Bienvenida (prueba Pro activa) | `lib/email/transactional.ts` · Resend | alta de cuenta |
| 2 | Plan confirmado | ídem | webhook Stripe `checkout.session.completed` |
| 3 | Pago fallido | ídem | webhook Stripe `invoice.payment_failed` |
| 4 | Prueba terminada | ídem | downgrade al expirar el trial |
| 5 | Cancelación programada | ídem | cancelación al final de periodo |
| 6 | Aviso de bajada de score | ídem | `lib/scan/score-alert.ts` |
| 7 | Resumen semanal | ídem | `lib/scan/weekly-digest.ts` |
| 8 | Cuenta eliminada | ídem | borrado de cuenta |
| 9 | Confirmar registro | `docs/email-templates/confirm-signup.html` · Supabase Auth | registro email/contraseña |
| 10 | Código de un solo uso / magic link | `docs/email-templates/magic-link-password-recovery.html` · Supabase Auth | recuperación de contraseña |

Los ocho primeros comparten los helpers `wrap()` / `eyebrow()` / `heading()` /
`button()`. Los dos últimos **duplican esos estilos a mano**, porque Supabase
no puede importar nuestro módulo TS: se pegan en su dashboard, no se despliegan
con un merge.

**Lo que está desalineado con la identidad v3:**

1. **Cabecera**: banda navy-índigo `#1e1b4e` con el PNG
   `genscore-logo-white-email.png` — el logo **v2**, con la G en degradado
   índigo. Es el activo que la propia guía marca como "todavía v2, pendiente
   de regenerar en 5c".
2. **Acento**: `#4f46e5` (índigo v2) en enlaces, botones, eyebrows y el bloque
   de recomendación. La v3 usa `#2563EB`.
3. **Ámbar como color de aviso**: el email de bajada de score y la píldora
   negativa del resumen semanal usan ámbar (`#b45309` sobre `#fef7ed`). La
   guía es explícita: el ámbar es **solo** el punto del logo, y ya se corrigió
   una vez en la UI (hallazgo #2 de la auditoría BRAND-4). En los emails sigue.
4. **Tipografía**: la pila de fuentes todavía nombra `'Hanken Grotesk'`, que la
   v3 retira.
5. **Tintas**: `#0f1729` / `#475067` / `#6b7385` / `#f6f7f9` — vecinos de los
   tokens v3, pero ninguno es el token v3 (`#0B1426` / `#3B4759` / `#5B6B82` /
   `#F7F8FB`).
6. **Emojis** (🎉, 📊) en titulares y asuntos, de la etapa v2.

---

## 2. El sistema propuesto

### 2.1 Cabecera — el cambio más visible

La hoja de estilo de la sesión de diseño especifica una **cabecera 600 × 120
PNG**, fondo blanco, colores email-safe `#0B1426 · #2563EB · #FFB020 ·
#FFFFFF`. La propuesta la adopta tal cual:

- lockup completo a la izquierda, con el tagline **GENERATIVE ENGINE
  OPTIMIZATION** debajo del wordmark. Ese tagline existe en el pack de marca
  fusionado en el mismo trazado que el wordmark, y en la app se recorta a
  propósito porque a 22 px es un borrón ilegible (`components/ui/brand-logo.tsx`).
  A 600 px de ancho sí tiene sitio: el email es el único sitio del producto
  donde el lockup se ve lo bastante grande para usarlo;
- **G fantasma** sangrando por el borde derecho, en azul pálido con el punto
  ámbar — el mismo recurso de la hoja de estilo;
- una **regla de 3 px en `#2563EB`** justo debajo de la banda. Es un añadido
  respecto a la hoja: una cabecera blanca sobre una tarjeta blanca se queda sin
  "tapa" y el email arranca flotando. La regla cierra la banda sin volver a un
  bloque navy pesado.

Se entrega como **PNG a 1200 × 240 servido a 600 × 120** (retina), fondo blanco
sólido —nunca transparente—, en `public/brand/`. El SVG inline no vale: Outlook
de escritorio no lo renderiza, que es exactamente por lo que hoy ya se usa un
PNG.

### 2.2 Paleta email-safe

Colores planos, sin degradados ni `rgba()` (no todos los clientes lo resuelven):

| Rol | Hex | Uso en el email |
|---|---|---|
| Tinta de marca | `#0B1426` | titulares, números héroe, negritas |
| Texto cuerpo | `#3B4759` | párrafos |
| Texto secundario | `#5B6B82` | pies, etiquetas, subtextos |
| Azul de marca | `#2563EB` | CTA, enlaces, eyebrow por defecto, regla de cabecera |
| Azul suave | `#E9EFFD` (borde `#DCE6FC`) | tarjeta de recomendación, bullets |
| Lienzo | `#F7F8FB` | fondo del mensaje y bloques de datos |
| Superficie | `#FFFFFF` | tarjeta |
| Línea | `#E7EAF0` / `#EEF1F6` | bordes y separador del pie |
| Positivo | `#15915A` sobre `#E7F6EE` | subidas de score |
| Negativo | `#D23B48` sobre `#FDECEE` | bajadas de score, pago fallido |
| Ámbar | `#FFB020` | **solo** el punto del logo, dentro del PNG |

Los `rgba()` de `--brand-blue-soft` se sustituyen por su equivalente sólido ya
compuesto sobre blanco (`#E9EFFD`, `#DCE6FC`).

### 2.3 Tipografía

Ningún cambio de fuente real, y conviene decirlo claro: **los clientes de
correo no cargan Bricolage ni Figtree de forma fiable**. La marca tipográfica
en el email la lleva el logo, que es imagen. Lo que sí cambia:

- se retira `'Hanken Grotesk'` de la pila (fuente retirada en v3) y se deja la
  pila de sistema: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
  Helvetica, Arial, sans-serif`;
- el **código OTP** del email 10 pasa a `'JetBrains Mono', ui-monospace, Menlo,
  Consolas, monospace` — JetBrains Mono es la fuente de datos de la marca, y
  aquí el fallback monoespaciado es igual de correcto que la fuente real;
- titulares a 25 px / 800 con `letter-spacing:-.022em`, cuerpo a 15 px / 1.64.

### 2.4 Componentes

Se mantiene el catálogo actual (eyebrow, heading, paragraph, button, subtext,
featureRow, sectionLabel, statCell/statRow) repintado a v3, con dos ajustes:

- **eyebrow con color semántico**, no siempre índigo: azul para informativo,
  verde para confirmación, rojo para acción necesaria, gris para neutro, tinta
  para cierre. Es la señal de tono más barata que tiene el email;
- **píldora de delta** (`▲ +5 pts` / `▼ -13 pts`) reutilizada tal cual del
  Overview, en verde/rojo. Hoy el email de bajada de score no tiene píldora y
  el resumen semanal la pinta en ámbar.

### 2.5 Copy y tono

Se conserva el copy — no es una reescritura — salvo:

- **fuera los emojis** de titulares (🎉, 📊) y de los asuntos. La v3 se definió
  como "azul/navy más seria y analítica" frente a una v2 que se sentía "poco
  profesional"; un 🎉 en el H1 tira en la dirección contraria.

**Corrección sobre el nombre:** una versión anterior de este documento
proponía cambiar "GenScore" por "Genscore" en el cuerpo de los emails,
citando la guía de marca §1 ("el wordmark 'Genscore', sin camelCase"). Es un
error — esa entrada describe el *logotipo* (el trazado vectorial del SVG),
no el nombre en texto corrido. `CLAUDE.md` fija explícitamente **"GenScore"**
como "la marca mostrada a los usuarios" en toda la superficie de producto, y
es lo que usan sin excepción la landing, `/pricing`, `/geo`, legal, y el
propio dashboard (`grep -rn "GenScore" app/`). Los emails mantienen
"GenScore" en el cuerpo — no se toca.

---

## 3. Email por email

| # | Email | Eyebrow | Qué cambia además del repintado |
|---|---|---|---|
| 1 | Bienvenida | `Tu prueba Pro · 7 días` (azul) | bullets ✓ en azul de marca; fuera el 🎉 del titular y del asunto |
| 2 | Plan confirmado | `Plan activo` (verde `#15915A`) | el verde marca que es una confirmación, no un aviso más; fuera el 🎉 |
| 3 | Pago fallido | `Acción necesaria` (rojo `#D23B48`) | el aviso pasa de párrafo suelto a bloque rojo `#FDECEE`, para que se lea antes que el CTA |
| 4 | Prueba terminada | `Tu prueba ha terminado` (gris) | eyebrow neutro: es informativo, no una alarma |
| 5 | Cancelación programada | `Cancelación registrada` (gris) | la fecha de fin en tinta de marca |
| 6 | Bajada de score | `Aviso de visibilidad` (rojo) | **cambio de criterio**: fuera el ámbar; una bajada es negativa y se pinta con el rojo de datos. Bloque en lienzo neutro + píldora de delta |
| 7 | Resumen semanal | `Resumen semanal` (azul) | píldora verde/roja (nunca ámbar); tarjeta de recomendación en azul suave `#E9EFFD`; fuera el 📊 |
| 8 | Cuenta eliminada | `Cuenta eliminada` (tinta) | cierre sobrio, sin CTA — como ya está |
| 9 | Confirmar registro | `Confirma tu correo` (azul) | mismos tokens exactos que los de Resend, para que las dos rutas de render dejen de divergir |
| 10 | Magic link / OTP | `Acceso seguro` (azul) | el código en JetBrains Mono; caja del código en lienzo v3 |

Los diez, renderizados, están en `docs/brand/email-preview/index.html`.

---

## 4. Decisiones que necesitan tu criterio

| | Decisión | Recomendación |
|---|---|---|
| **A** | **Cabecera blanca (hoja de estilo) o banda navy `#0B1426` con el logo blanco.** La blanca es la aprobada en la sesión de diseño y es más limpia; la navy es más reconocible en una bandeja llena y aguanta mejor los clientes que fuerzan modo oscuro | **Blanca**, fiel a la hoja de estilo, con las mitigaciones de §5 |
| **B** | **Retirar el ámbar de los avisos** (bajadas de score) y pasarlos a rojo `#D23B48` | **Sí** — es la misma corrección que ya se hizo en la UI en BRAND-4 |
| **C** | **Quitar los emojis** de titulares y asuntos | **Sí** en titulares. En asuntos también, pero es el punto más discutible: el emoji sube algo el open rate y aquí no tenemos datos propios para afirmarlo |
| **D** | **Incluir el tagline** "Generative Engine Optimization" en la cabecera | **Sí** — es el único sitio del producto donde el lockup se ve lo bastante grande |

---

## 5. Riesgos y límites técnicos

- **El PNG tiene que estar en producción antes de mergear las plantillas.** La
  cabecera es un `<img>` a `https://www.genscore.es/brand/...`; hasta que ese
  fichero esté desplegado, cualquier email enviado (incluidos los de un
  preview) muestra un icono de imagen rota. El plan lo separa en una fase
  propia por eso.
- **Imágenes bloqueadas.** Muchos clientes corporativos bloquean imágenes por
  defecto. Hoy, con banda navy, queda un rectángulo azul oscuro con el `alt`;
  con cabecera blanca queda un hueco en blanco. Mitigación: `alt="Genscore —
  Generative Engine Optimization"` con estilo (tinta de marca, 700, 16 px),
  para que el texto de reemplazo siga leyéndose como marca, y la regla azul de
  3 px, que es color de fondo y sí se pinta siempre.
- **Modo oscuro forzado** (iOS Mail, Outlook.com). Los `<meta name="color-scheme"
  content="light">` ya presentes fijan la paleta clara; el PNG va con fondo
  blanco sólido para que no aparezca una costura oscura si el cliente invierte
  el resto.
- **Outlook de escritorio** (motor Word): ignora `border-radius`. La tarjeta se
  verá con esquinas rectas — ya pasa hoy, no es una regresión.
- **Las dos plantillas de Supabase se despliegan a mano.** Mergear el PR no las
  cambia: hay que pegarlas en Authentication → Emails → Templates y mandar un
  test desde el dashboard.
- **No hay tests de los emails.** No existe `lib/email/transactional.test.ts`;
  los tests que tocan emails (`app/signup/actions.test.ts`,
  `lib/billing/stripe-webhook.test.ts`, `lib/scan/score-alert.test.ts`,
  `lib/scan/weekly-digest.test.ts`) mockean el envío, así que una plantilla rota
  pasaría el CI en verde. La fase 5c-1 incluye un test de guardia mínimo.

---

## 6. Plan de implementación

Tres fases pequeñas, en este orden. Cada una es un PR.

**5c-0 · El activo** — regenerar la cabecera desde el lockup v3
(`genscore-logo.svg`) a `public/brand/genscore-email-header.png`, 1200 × 240,
con la G fantasma y el tagline. Se mantiene el `genscore-logo-white-email.png`
antiguo hasta que ninguna plantilla lo referencie. Cero cambios de plantilla —
solo desplegar el fichero.

**5c-1 · Los ocho de Resend** — `lib/email/transactional.ts`: nueva cabecera,
tokens v3, eyebrows semánticos, ámbar fuera, emojis fuera, "Genscore".
Más un test de guardia (`lib/email/transactional.test.ts`) que renderice los
ocho y afirme lo comprobable sin ser frágil: que cada uno lleva la cabecera y su
CTA, y que no queda ni `#4f46e5`, ni `#1e1b4e`, ni `Hanken`, ni `#b45309`.

**5c-2 · Las dos de Supabase** — `docs/email-templates/*.html` a mano con los
mismos valores, README actualizado con el nuevo nombre del PNG, y envío de
prueba real desde el dashboard de Supabase.

**Criterios de aceptación**: los diez emails renderizan con la cabecera v3 en
Gmail web, Gmail Android/iOS, Apple Mail y Outlook.com; ningún hex v2
(`#4f46e5`, `#1e1b4e`, `#0f1729`, `#6b7385`, `#f6f7f9`, `#b45309`) sobrevive en
`transactional.ts` ni en las dos plantillas; el ámbar solo aparece dentro del
PNG del logo; `pnpm test && pnpm run validate` en verde.

**Fuera de alcance** (necesitan su propia aprobación): el recordatorio "3 días
antes de que acabe la prueba" (requiere schema + cron, ya marcado como
pendiente en la guía); cualquier email nuevo; cambios de asunto más allá de
quitar emojis; y el modo oscuro real del email (BRAND-5d va de la UI de
producto, no de esto).

---

## 7. Maqueta de exploración (previa a la implementación)

```bash
open docs/brand/email-preview/index.html     # macOS
```

Página autocontenida usada para decidir el diseño antes de tocar código de
producción: la paleta, la cabecera a tamaño real y los diez emails
maquetados con el sistema propuesto. Las cifras y dominios son de ejemplo.
La cabecera se muestra ahí como SVG inline para que se vea sin desplegar
nada — el activo real de producción es el PNG descrito en §8.

---

## 8. Cómo se generó `genscore-email-header.png`

El activo final (`public/brand/genscore-email-header.png`, 1200×240, ~8 KB)
no es un export manual — se genera programáticamente a partir de los SVG de
marca reales (`genscore-logo.svg`, `genscore-mark.svg`), para que quede
trazable y regenerable:

1. Se compone una página HTML con el lockup y la G fantasma posicionados
   sobre un lienzo de exactamente 1200×240 (2x del tamaño de cabecera final,
   600×120) — el mismo tamaño que se captura, sin ventana de recorte
   distinta al lienzo real. Esto es lo que evita el bug del logo cortado del
   activo v2: aquel PNG (958×164 px) tenía un ratio (5.84) que no coincide
   con el ratio real del lockup (1111:254 = 4.41) — ya venía capturado con
   un recorte que no correspondía al símbolo completo.
2. El tagline "Generative Engine Optimization" se hornea como texto raster
   (no como trazado SVG — el pack de marca no lo incluye como path) porque
   los clientes de correo no cargan tipografías propias de forma fiable; una
   vez es imagen, da igual.
3. La captura se recorta a los 1200×240 exactos y se cuantiza a paleta de 64
   colores con Pillow — el diseño es casi todo color plano, así que la
   cuantización no introduce banding visible y el archivo pesa una tercera
   parte de la versión sin optimizar.

El `<img>` que consume este PNG en `transactional.ts` y en las dos
plantillas de Supabase usa `width:100%;max-width:600px;height:auto` en el
estilo (nunca `width:600px;height:120px` fijo) — ver
`docs/email-templates/README.md` para por qué eso es obligatorio, no
cosmético: con un ancho fijo, la imagen de cabecera fuerza a la tarjeta a un
mínimo de 600px y el email deja de encogerse en móvil sin ningún error
visible, solo un mensaje que no reordena.

---

**Aprobado e implementado** (A: cabecera blanca, B: ámbar fuera, C: emojis
fuera, D: tagline incluido). Ver el PR de esta fase para el diff exacto.
