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
  2026-10-27). Desde §398 el único selector es la fila «Modo oscuro» del menú
  de cuenta; nunca en la cabecera.
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
  filas de «Más adelante» (y antes la capa en foco, retirada en §396). Es puro y no calcula cifras ni
  frases: lee `selectPlan`, `recommendationHeadline` y los puntos conjuntos.
- **El plan se fija por visita**; marcar como hecha no reordena la baraja. El
  deshacer durable sólo vive en «Resueltas».
- **Una sola cola**: sin pestañas por fuente ni bloque «Técnico» (§307).
  La tarjeta de Google es la placa 2 del plan.
- **Las acciones de servidor no cambian**; no se añade ninguna sin aprobación.

## Prompts (F5a, log §373)

- **La hoja lateral es un componente del kit** (`Sheet`/`SheetHead`), con
  portal a `body`, Esc, trampa de foco y retorno de foco. Competidores y
  Páginas citadas la reutilizan; no se crea otra.
- **Todo número de la pantalla sale de filas del último escaneo**
  (`buildPromptsModel`, `buildPromptDetail`). Un prompt sin escanear es
  «pendiente», nunca «no te nombra».
- **Nada se guarda antes del paso de revisión** de «Añadir prompts»; el tope
  del plan cuenta lo marcado (PROMPTS-REVIEW-1, §305).

## Competidores (F5b, log §374)

- **El orden del ranking es por menciones**; el puesto medio sólo desempata y
  sólo si es fiable (§175, §353). Nunca se ordena por el número de fila.
- **El denominador, si se enseña, lo compone `answerCountLabel`** (§183); desde
  §396 el ranking ya no lo enseña, a petición de Denis.
- **Las clases `i` de una regla móvil se escriben con `>`**: el kit `Roll` usa
  `<i>` para los dígitos y una regla `.mt i` los rompe.
- **Las acciones de servidor de competidores y alias no cambian**; la hoja de
  gestión las llama y refresca.

## Páginas citadas (F5c, log §375)

- **«Te nombran» sigue siendo un hecho de la respuesta** (`.claude/rules/citations.md`):
  la nota bajo el anillo no se quita ni se reescribe como afirmación sobre la página.
- **Los porcentajes del anillo suman 100** (`percentShares`, mayor resto) y son
  cuota de páginas distintas, no de citas.
- **Una fuente alcanzable no exige competidor**; el competidor co-citado sólo
  sale como aviso «sin verificar en la página».

## Auditoría técnica (F6a, log §363)

- **Los bloques son enlaces `?bloque=`**, no estado de cliente: URL, menú y
  tarjeta resaltada coinciden. La línea «+N pt» enlaza a `#problemas` y las
  pestañas lo escuchan.
- **Cada cifra de la tarjeta sale de `buildAuditBlock`** (`lib/ins/audit-model.ts`
  sólo da forma). Sin ganancia real no hay línea verde.
- **Lo que no está en el prototipo pero es real se conserva** (cobertura,
  generadores de llms.txt y sitemap, filas por página) y lee los tokens de
  Instrumento desde `app/ins/audit.css`.

## Posición en Google (F6b, log §364)

- **Sólo el marco es nuevo.** Los bloques de Search Console y el seguimiento de
  palabras conservan marcado y reglas (`search-console.md`, `seo-tracking.md`) y
  leen los tokens de Instrumento desde `app/ins/google.css`.
- **No se reconstruye el Resumen sin datos de ejemplo en el arnés**: sin ellos
  no se puede comparar con el prototipo.

## Comercio agéntico (F7, log §365)

- **Sólo el marco es nuevo**; los bloques conservan marcado y las reglas de
  `agentic-audit.md`, y leen los tokens de Instrumento desde `app/ins/agentic.css`.
- **«Visibilidad en agentes» está rehecha sobre el prototipo (log §370).** El
  «Cuadro claro» sólo dibuja lo que la página le pasa; objetivo del dial =
  `fixbarLine`, nunca una cifra propia. Sin «Marcar como hecho» (Fase 2c sin
  aprobar). Sus estilos viven en `app/ins/agents.css`.

## 404 y error (F8a, log §366)

- **La referencia del error es el `digest` de Next o no hay referencia.** Nunca
  un código inventado.
- **Sin progreso**: el anillo de error es un instrumento vacío, decorativo.
- **La 404 lleva el cohete de la 404 pública** (CONSOLE-404-ROCKET-1, log §388,
  sustituye a «sin cohete» de §366). Silueta y paleta de `mission-rocket.md`;
  nada en la escena codifica progreso. Ancho, texto sobre la escena; por debajo
  de 1100 px, debajo. Sus clases no pueden llamarse `nf-scene`: el piloto la
  usa para asegurar que la consola no sirve la 404 de marketing.

## Prueba terminada (F8b, log §367)

- **Las piezas dependen de `planId === "free"` del marco**, no de una
  consulta propia. La franja (única pieza en todas las anchuras) y la tarjeta del menú no se pueden cerrar.
- **El precio fundador se cita sólo si Stripe lo confirma**
  (`getActivePromoPlanIds`); nunca un descuento fijo en el texto.
- **El aviso de primera entrada vive en `localStorage`**: sin migración no hay
  marca por cuenta.

## Ajustes (F8c, log §369)

- **Sólo el marco es nuevo.** Cabecera de perfil y pestañas Plan, Cuenta y
  Notificaciones; las secciones conservan marcado, textos y acciones.
- **Los anclajes `#plan`, `#cuenta`, `#avisos` y `?openPlan=` siguen
  aterrizando en su pestaña**: los enlazan correos ya enviados.
- **Los paneles se ocultan, no se desmontan.**
- **Sin dato, no se pinta**: foto, cargo, antigüedad de la contraseña y estado de
  la verificación en dos pasos no existen hoy y no se simulan.

## Cuenta y Notificaciones (F8d, log §371)

- **Los campos y filas de Ajustes usan las clases `pf-*` del prototipo**, acotadas
  a `.ins .sc-set`. No se reutilizan `SettingRow`/`Switch` antiguos aquí.
- **La tarjeta de Plan es la del prototipo** (`pf-plan`, log §371 adenda); sin pastilla «Activo» ni «Cerrar sesión» en la cabecera.
- **Un único «Guardar» en Cuenta** envía `saveAccount` con todos los campos; no se
  parte en dos acciones sin aprobación.

## Foto de perfil (F8e, log §372)

- **La foto vive en el bucket privado `avatars` y su camino en
  `profiles.avatar_path`** (migración 0046). Se lee sólo con URL firmada desde el
  servidor y con tolerancia a que falte la columna; nunca se pone en
  `user_metadata`.
- **La RLS del bucket exige la carpeta propia** (`<id>/…`); no se escribe con
  service role.

## Barra inferior móvil (MOBILE-TABBAR-1, log §380)

- **Solo ≤760 px.** Escritorio conserva el menú lateral; no se añaden pestañas
  a su cabecera. Móvil no tiene cajón: la navegación es `TabBar` + `TabSub`.
- **Las pestañas viven en `lib/ins/nav.ts` (`INS_TABS`)** y agrupan las mismas
  rutas de `INS_NAV`; una pantalla nueva del menú entra en una (y solo una)
  pestaña, lo vigila `nav.test.ts`.
- **Seis pestañas y botones fijos (log §393).** «Tu web» reúne las auditorías
  técnicas; las subpantallas son botones de ancho repartido con su `pin`, sin
  desplazamiento horizontal. Una pantalla nueva con nombre largo lleva `pin`.
- **Márgenes del sistema con `env(safe-area-inset-*)`** en la barra y en el
  padding inferior de `.page`. Un elemento fijo nuevo abajo cuenta con la barra.
- **Se oculta en pantallas completas** (`.sc-mission`, `.sc-newdomain`).

## App de Android (ANDROID-TWA-1, log §381)

- **Dentro de la app no se vende.** Con la cookie `gs_app` (`lib/app-mode.ts`)
  no puede aparecer un precio, «Cambiar de plan», un checkout ni texto que
  mande a pagar fuera: lo exige Google Play. Una pantalla nueva con una llamada a
  contratar la oculta con `ShellData.inApp` o `isInApp()` (servidor).
- **La lista de rutas permitidas dentro de la app es de permitidos**
  (`isAppModePathAllowed`): una página pública nueva no entra sola.
- **Ajustes > Plan dentro de la app es de solo lectura** (`InAppPlan`, log §381 adenda): plan, estado y días de prueba, sin precios ni enlace a pagar fuera.
- **Las acciones de pago se niegan en servidor**, no solo se esconden
  (`createCheckoutSession`, `createPortalSession`).
- **Las páginas legales se ven dentro de la app sin cabecera ni pie públicos**
  (`LegalPageShell`, APP-LEGAL-1, log §400): llevan la franja de precio,
  «Precios» y los logos de pago. Una página nueva de la lista de permitidos
  tampoco puede usar `PublicHeader`/`PublicFooter` dentro de la app.

## Splash de la app (APP-SPLASH-1, log §382)

- **Solo en `/login`, solo dentro de la app (`gs_app`), una vez por apertura**, y
  nunca la misma que la anterior. Con `prefers-reduced-motion` no sale.
  Desde APP-LAUNCH-1 (log §389) «apertura» es `?source=twa`: el `start_url`
  abre `/login?source=twa`, y una apertura que entra directa a la consola la
  desvía el middleware (`appLaunchRedirect`). Con sesión abierta, la splash
  aterriza en la marca y sigue a la consola (`continueTo`), sin formulario.
- **No bloquea el acceso**: un toque o Esc llevan (sin botón visible, a petición de Denis) al formulario, y si
  el JavaScript falla el formulario aparece a los 6 s.
- **La G geométrica (`splash/g-mark.ts`) es de la splash y del login de la app.**
  Sustituir `app/icon.svg` o las marcas del resto del producto no está aprobado.
- **El movimiento es ambiente**: ninguna cifra ni barra representa un dato.

## Apertura y caché de la app (APP-LAUNCH-1, log §389)

- **El service worker (`public/sw.js`) solo guarda lo estático**: `/_next/static/`
  sin query, `/icons/`, `/brand/`, `favicon.ico`, `apple-touch-icon.png` y la
  pantalla sin conexión. Nunca una navegación, `/api`, `_next/image` ni una
  carga RSC: los datos de un cliente no se quedan en el dispositivo. Lo vigila
  `tests/service-worker.test.ts`. Ampliar la lista necesita aprobación.
- **Solo se registra en producción**: en desarrollo `/_next/static/` no lleva
  hash y la caché serviría código viejo.
- **Registro y recuperar contraseña existen dentro de la app** (Denis,
  2026-10-31). `/signup`, `/forgot-password` y `/auth/*` siguen en la lista de
  permitidos; quitarlos no está aprobado.
- **Las pestañas se precargan enteras solo dentro de la app** (`AppTabPrefetch`,
  APP-TABS-INSTANT-1, log §390): la caché es la del enrutador, en memoria, nunca
  el service worker. `staleTimes.dynamic` es 60 s; subirlo enseña datos más
  viejos al volver a una pantalla y necesita aprobación.
- **En la web la precarga solo va donde está la barra inferior** (≤760 px) y
  nunca con ahorro de datos o conexión lenta (`shouldPrefetchTabs`,
  TABS-INSTANT-WEB-1, log §391). Extenderla a escritorio necesita aprobación:
  es coste de servidor por cada entrada.


## Modal «Cambiar de plan» (PLAN-MODAL-INSTRUMENTO-1, log §394)

- **Se monta por portal en `<body>` dentro de `.ins.pmx`**, por encima de la
  barra de pestañas. Dentro de la página quedaba debajo y ocultaba el botón.
- **Sin paso intermedio**: elegir plan y el botón va a Stripe (checkout o
  portal). Una opción que se aplique sin Stripe necesita su propia confirmación.
- **«Recomendado» sólo apunta hacia arriba** del plan actual, y el plan actual
  no se vuelve a elegir salvo en la prueba de Pro.
- **Agencia no se cambia aquí**: «Hablar con nosotros». Los flujos de pago y la
  puerta de exceso de dominios (`.cp-*`) no se tocan sin aprobación.

## Cabecera común (CONSOLE-PAGE-TEMPLATE-1, log §396)

- **Toda pantalla de proyecto abre con `PageHead`**: título, una acción en la
  misma fila y la frase con datos debajo. Sin línea «SECCIÓN · dominio» y sin
  recuento junto al título (lo vigila `tests/console-page-template.test.ts`).
- **En el móvil la acción se queda en la fila del título y sólo enseña el
  icono** (`.ph-lbl` se oculta), así que lleva siempre `aria-label`.
- **Sólo orden y compactación.** `app/ins/page-template.css` mueve, oculta o
  aprieta lo que ya existe; no cambia tarjetas, colores ni tipos (decisión de
  Denis). Lo secundario va debajo de lo principal (pilares tras el plan).
- **La frase con datos bajo el título se queda** (Denis, 2026-10-31).
- **Recomendaciones no tiene buscador ni capa en foco** (log §396): «Más adelante»
  se filtra sólo por palanca, y las tarjetas del plan comparten la altura de la
  más alta (`Deck equal`).
- **Competidores no enseña el denominador junto al ranking** (Denis, log §396,
  deja sin efecto aquí «El denominador no se quita» de F5b). Si vuelve, con
  `answerCountLabel`.

## Favicons y cabecera móvil (FAVICON-NO-FLICKER-1, log §397)

- **`FaviconImg` recuerda en la pestaña lo que ya pintó y lo que no existe.**
  Sólo memoria del módulo, nunca `localStorage` ni el service worker. La caché
  de los bytes sigue siendo la HTTP de `/api/favicon`.
- **El borde izquierdo de la cabecera móvil (19 px) está medido contra la «B» del
  título a 34 px.** Si cambia el tamaño del título o su tipo, se vuelve a medir.

## Modo oscuro (DARK-MODE-MENU-1, log §398)

- **Se elige solo en el menú de cuenta** (`ThemeSwitchItem`), nunca en la
  cabecera ni en Ajustes (Denis, 2026-10-31). Se guarda por dispositivo
  (`gs-theme`), sin migración.
- **Un color nuevo se escribe con tokens.** Si un bloque heredado necesita un
  tinte fijo, su versión oscura va en `app/ins/dark.css`, acotada a
  `:root[data-theme="dark"] .ins`. Una línea o punto de un gráfico SVG lleva
  clase para que el CSS lo recolore.

## Esqueletos de carga (CONSOLE-SKELETONS-1, log §399)

- **Todo `loading.tsx` de `app/dashboard` se monta con `SkPage`** y las piezas de
  `components/ins/skeleton.tsx`; nunca con clases o colores antiguos, o en
  oscuro sale claro (lo vigila `tests/console-skeletons.test.ts`).
- **La forma sigue a la pantalla**: si una pantalla cambia de orden o de
  cabecera, su esqueleto cambia en el mismo PR.
- **El pulso es ambiente**: ninguna barra del esqueleto representa progreso.
