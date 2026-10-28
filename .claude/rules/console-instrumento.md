# Consola «Instrumento» — invariantes

Se inyectan solos al tocar `app/ins/**` y `lib/ins/**`. Cada regla es
trazable a `docs/brand/design-decisions-log.md` §349.

- **La fuente de verdad es `docs/design-reference/console-instrumento-1/`**
  (HTML v51, `i-src/` y los inventarios de copy). Una pantalla migrada se
  compara con la del prototipo en el mismo estado, en 375/390, 768 y 1280 px.
  El prototipo usa la marca ficticia Nubaria: se mantienen los datos reales.
- **Los estilos viven acotados.** `.ins` envuelve pantallas migradas y
  `.ins-shell` el marco. Nada de esto se importa en la web pública. Las
  animaciones llevan prefijo `ins-` para no pisar a `globals.css`.
- **Claro por defecto.** El oscuro solo con `data-theme="dark"` en `<html>`
  elegido por la persona; nunca `prefers-color-scheme` (decisión de Denis,
  2026-10-27). El selector de tema no se publica hasta que F8 cierre.
- **Solo cambia el aspecto.** Consultas, acciones de servidor, RLS, esquema y
  tests de cada pantalla se conservan; al migrar una pantalla se retiran sus
  hojas antiguas.
- **Sin rayas largas, motores solo por nombre** (ChatGPT, Gemini, Claude,
  Perplexity), copy del prototipo aprobado manda sobre el anterior.

## Marco (F1, log §350)

- **Los resets del marco usan `:where(...)`** para no ganar a ninguna regla de
  componente por especificidad. El scrim del cajón es `.ins-scrim`; no
  reutilices `.drawer-scrim` (lo usa Prompts en `globals.css`).
- **Lo que enseña el menú sale de `useShellData`/`lib/ins/nav.ts`**, nunca de
  cifras fijas: recuentos, puntuación, banda y límite del plan son datos del
  proyecto activo. Sin dato, no se pinta (no hay nombre de perfil hasta F8).
- **Una clase de `.ins` que también use una página pública vive en
  `globals.css`**, no en `console.css` (`tests/console-css-scope.test.ts`).

## Acceso «Bruma» (F2, log §351)

- **Las páginas de acceso no heredan el layout de la consola.** Importan
  tokens, componentes y `app/ins/auth.css` por su cuenta y se montan con
  `AuthPage` (`components/ins/auth/`).
- **El formulario de dos pasos envía la acción de servidor real** en el paso 2;
  el paso 1 solo valida en el cliente. Los errores llegan por `?error=`.
  Nunca se añade una acción de servidor nueva (p. ej. reenviar confirmación)
  sin aprobación.
- **La niebla (`fx.ts`) es ambiente**: no representa progreso ni datos, se
  detiene al desmontar y respeta `prefers-reduced-motion`.

## Visión general (F3a, log §352)

- **El plan replica a Recomendaciones** (`buildOverviewPlan`: `selectPlan` sobre
  palancas colapsadas, techo conjunto); con Google conectado su tarjeta ocupa
  el puesto 2. No se calcula otro plan por su cuenta.
- **Un solo sondeo por pantalla**: `LiveScanCard` es dueña del
  `router.refresh()`. No montes un segundo poller.
- **Las puertas de honestidad no se tocan** (muestra mínima, runs comparables,
  ventana de la puntuación, afirmación competitiva): lo retenido sigue retenido.
- **El anillo del kit usa la clase `tring`**, nunca `ring` (utilidad global).

## Misión del primer escaneo (F3b, log §355)

- **Un solo componente en las seis secciones**: `FirstScanMission`, montado por
  `FirstScanTakeover`. Es dueño del `router.refresh()` final (mismas tres
  condiciones de salida que en §168).
- **Cada cifra es un recuento de filas del run** (`missionCounter`); los
  péndulos son ambiente y no codifican progreso. Sin dato, la fila del motor
  queda vacía, nunca inventada.
- **El marco se aparta por CSS** (`.ins-shell .app:has(.sc-mission)`), no por
  una prop del layout. Otra pantalla a pantalla completa usa el mismo patrón.

## Alta de dominio (F3c, log §356)

- **El asistente envía las acciones reales.** `suggestProjectSetup`,
  `generateMorePrompts` y `createProject` no cambian; los campos ocultos del
  formulario del paso 4 son los de siempre. No se añade una acción nueva sin
  aprobación.
- **Ninguna cifra inventada en el resumen.** Sólo recuentos del propio estado
  (prompts marcados, competidores, motores del plan); nunca una estimación de
  respuestas.
- **El marco se aparta por CSS** (`.ins-shell .app:has(.sc-newdomain)`), igual
  que con la misión.

## Recomendaciones (F4, log §357)

- **Un solo modelo de tarjeta (`lib/ins/recs-cards.ts`)** para la baraja, las
  filas de «Más adelante» y la capa en foco. Es puro y no calcula cifras ni
  frases: lee `selectPlan`, `recommendationHeadline` y los puntos conjuntos.
- **El plan se fija por visita**; marcar como hecha no reordena la baraja. El
  deshacer durable sólo vive en «Resueltas».
- **Una sola cola**: sin pestañas por fuente ni bloque «Técnico» (§307).
  La tarjeta de Google es la placa 2 del plan.
- **Las acciones de servidor no cambian**; no se añade ninguna sin aprobación.
