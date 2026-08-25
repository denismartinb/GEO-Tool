# Onboarding Tour Rules

Invariantes del tour «Aprende cómo funciona» (`components/product-tour.tsx`,
`components/tour-provider.tsx`, `lib/onboarding/**`). Se inyectan solos al
tocar esos ficheros. Cada regla es trazable a un documento — una regla que
nadie puede justificar es peor que ninguna, porque una sesión futura la
obedecerá igual.

- **Un solo reloj.** Toda la animación se deriva de `t` en milisegundos. Ni un
  `animation-delay`, ni un `setTimeout` encadenado. Es lo que permite que
  Atrás/Siguiente salten a cualquier paso y que el tour se congele en un paso
  concreto; sin eso el `ux-pilot` fotografía un fotograma al azar y su
  veredicto no vale nada (`docs/design-reference/onboarding-tour-1/README.md`).
- **La línea de tiempo vive en `lib/onboarding/tour-steps.ts`, no en el
  componente.** Es la única parte verificable sin navegador y tiene tests. Si
  añades o mueves un paso, se toca ahí y `tour-steps.test.ts` lo cubre.
- **Todos los pasos miden lo mismo de alto.** El lienzo tiene proporción fija;
  lo que variaba era el subtítulo, resuelto apilando los ocho textos en la
  misma celda de rejilla con sólo uno visible. Cualquier elemento nuevo cuyo
  tamaño dependa del paso rompe esto (fundador, 2026-08-06: «que no haya
  movimientos de altura de la imagen»).
- **`prefers-reduced-motion: reduce` deja el tour quieto en su último
  fotograma.** No es una degradación, es el contrato: nada se anima nunca. En
  la landing ese fotograma final ES la captura del hero, así que no hay
  alternativa estática que mantener.
- **Sólo el primer paso se reproduce solo; los otros siete los pide el
  usuario.** `AUTOPLAY_THROUGH_STEP_INDEX` es 0 y no es un ajuste cosmético:
  encadenados, los ocho pasos cambian de pantalla antes de que dé tiempo a leer
  el subtítulo, y el tour pasa a ser algo que se mira pasar en vez de algo que
  se lee (fundador, 2026-08-07; log §40). Ampliarlo exige volver a medir si el
  subtítulo del último paso automático da tiempo a leerse.
- **En la landing no arranca hasta que el lienzo se ve ENTERO.** Con el umbral
  de asomo (`0.25`) quien bajaba hasta el hero se lo encontraba con el paso 1 ya
  empezado o terminado (fundador, 2026-08-07). La comprobación de «entero»
  tiene que seguir contemplando que el lienzo sea más alto que la ventana: con
  un `intersectionRatio >= 0.98` a secas, en una pantalla corta no se cumple
  nunca y el tour no arranca jamás.
- **La pista del botón «Siguiente» va en bucle hasta el clic.** Ni el ratón por
  encima ni el foco la apagan: existe para conseguir ese clic, así que mientras
  no llegue no ha terminado su trabajo (fundador, 2026-08-07; log §40). Es la
  única animación del tour que no se detiene sola, y la excepción es
  deliberada.
- **La pista arranca en el mismo instante que el paso 1, no cuando éste se
  detiene.** Corregido el 2026-08-08: al principio sólo se encendía al pausarse
  la reproducción automática, así que invitaba al clic cuatro segundos y medio
  tarde. Ahora se enciende a la vez que el reloj empieza a correr —al montar el
  popup, o al verse entero el lienzo en la landing— y se mantiene puesta
  mientras el paso 1 se reproduce solo y después, hasta el clic.
- **No hay reproducción perpetua en el tour.** Arranca al verse entero y se para
  al salir de pantalla. Una animación fuera de pantalla es CPU y batería a cambio de
  nada. Al volver a entrar retoma donde estaba: la parada por scroll conserva
  el destino del paso en curso en vez de descartarlo.
- **El cursor apunta a elementos, no a coordenadas.** Cada waypoint resuelve el
  centro real del elemento en cada fotograma. Los que señalan el mini-menú
  llevan alternativa (`mob`) porque bajo 560 px ese menú no existe y un
  elemento con `display:none` mide 0×0.
- **Todo el CSS va prefijado `pt-` y anidado bajo `.ptour`.** El diseño usa
  nombres genéricos (`card`, `badge`, `nav`, `dot`, `chip`, `field`) que ya
  existen en `app/globals.css` y se pisarían en ambos sentidos.
- **Las cifras son ilustrativas y el copy no puede convertirlas en promesa.**
  El salto de 48 a 71 del último paso enseña el mecanismo —cada escaneo
  recalcula la puntuación—, no garantiza puntos. Reescribirlo como «+23 puntos
  garantizados» convierte el tour en una promesa que el producto no puede
  cumplir (CLAUDE.md, "no fake metrics").
- **Lo que el tour afirma del producto tiene que ser cierto hoy.** «Se escanea
  continuamente» se sostiene en `lib/scan/cron.ts` (diario en free/pro/agency,
  semanal en starter) y la auditoría usa los pesos reales de
  `docs/design-reference/web-audit-issues-1/`. Si esa cadencia o esos pesos
  cambian, el texto del tour cambia con ellos.
- **El dominio del hero llega al asistente, y se consume al leerlo.** La
  portada invitaba a escribir un dominio y lo tiraba: te registrabas y el
  asistente te lo volvía a pedir. Va por `localStorage`
  (`lib/onboarding/pending-domain.ts`) porque entre medias hay una
  confirmación por correo y el dato tiene que sobrevivir a salir del navegador
  y volver. Se borra al leerlo: si se quedara, el segundo dominio de la cuenta
  nacería relleno con el primero. Y sólo se guarda lo que el asistente
  aceptaría —`isWellFormedDomain`, la misma función que habilita su botón, no
  una copia— porque arrastrar basura es peor que no arrastrar nada (log §54).
- **El «ya visto» vive en `profiles.onboarding_tour_seen_at`, no en
  `localStorage`.** Migró ahí en ONBOARDING-TOUR-PERSIST-1 (2026-08-25, log
  §153), founder-approved vía Task Intake, precisamente porque vivir en
  `localStorage` (decisión original de ONBOARDING-TOUR-1) hacía que el popup
  reapareciera en cualquier navegador nuevo — la queja que motivó el cambio.
  Se lee en `app/dashboard/layout.tsx` con su propia consulta (mismo patrón
  que los flags de debug: la migración se aplica a mano, nunca en el select
  compartido de `getWorkspaceCounters`) y falla cerrado hacia «ya visto» —
  un error de lectura NO muestra el popup, para no repetirlo en cada carga
  mientras la migración no esté aplicada. Se escribe con la server action
  `markTourSeen` (`app/dashboard/actions.ts`), llamada desde `TourProvider`
  con `startTransition`, nunca con un `window.localStorage.setItem`.
- **El popup no se abre en `/dashboard`.** Es una ruta puente: su página no
  pinta nada, sólo redirige al proyecto más reciente. Abrir ahí montaba el
  popup, escribía la marca de «visto» y la redirección se lo llevaba por
  delante — y como el primer login aterriza justo en `/dashboard`, el efecto
  era que **el tour no salía nunca** en el único momento para el que se hizo
  (log §40). La pasada del piloto entra por `/dashboard` a propósito: entrar
  por la pantalla final ocultaría este fallo.
- **La marca de «visto» se escribe AL MOSTRARLO, nunca al cerrarlo.** Escribirla
  al cerrar convierte «salta en el primer acceso» en «salta en cada carga hasta
  que lo cierres»: quien lo mira y navega o recarga se lo vuelve a encontrar
  encima, indefinidamente. Lo encontró el `ux-pilot` el 2026-08-07, que nunca
  cierra nada, con el popup tapando Páginas citadas y la campana en las tres
  anchuras (log §40).
- **El popup es un modal y tapa la consola entera, así que el piloto tiene que
  poder sortearlo.** `visitAsUser` lo cierra con su propia X y lo anota en
  `dismissedWelcomeTour`.
- **La marca de «ya visto» es por CUENTA, no por navegador — el piloto no
  puede forzar «no visto» desde el set de lectura.** Hasta ONBOARDING-TOUR-
  PERSIST-1 (2026-08-25, log §153) la marca vivía en `localStorage`, así que
  `auth.setup` podía filtrarla del `storageState` ya capturado sin escribir
  nada real, y cada test de Playwright partía "no visto" por tener un
  contexto de navegador aislado. Ahora vive en `profiles`, una fila real
  compartida por todas las pasadas de la misma cuenta piloto: forzarla a «no
  visto» es una escritura de producto, y el piloto siempre-on es
  estrictamente de lectura por convención de código (CLAUDE.md, "Pilot write
  scope"). La escena de «sale solo en el primer acceso y no vuelve tras
  recargar» vive en `tests/pilot/journeys/write/onboarding-tour-first-run.spec.ts`,
  sólo bajo `--journeys write`, con su propio reset owner-scoped
  (`POST /api/account/onboarding-tour/reset`). `tests/pilot/journeys/
  onboarding-tour.spec.ts` (set por defecto, cada preview deploy) se queda
  con lo único que es determinista sin escribir nada: reabrir el tour desde
  «¿Qué es el GEO?» funciona pase lo que pase con la marca de origen.
