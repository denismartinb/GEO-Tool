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
