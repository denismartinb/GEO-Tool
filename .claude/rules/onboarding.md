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
  se lee (fundador, 2026-08-07; log §33). Ampliarlo exige volver a medir si el
  subtítulo del último paso automático da tiempo a leerse.
- **En la landing no arranca hasta que el lienzo se ve ENTERO.** Con el umbral
  de asomo (`0.25`) quien bajaba hasta el hero se lo encontraba con el paso 1 ya
  empezado o terminado (fundador, 2026-08-07). La comprobación de «entero»
  tiene que seguir contemplando que el lienzo sea más alto que la ventana: con
  un `intersectionRatio >= 0.98` a secas, en una pantalla corta no se cumple
  nunca y el tour no arranca jamás.
- **La pista del botón «Siguiente» va en bucle hasta el clic.** Ni el ratón por
  encima ni el foco la apagan: existe para conseguir ese clic, así que mientras
  no llegue no ha terminado su trabajo (fundador, 2026-08-07; log §33). Es la
  única animación del tour que no se detiene sola, y la excepción es
  deliberada. Sólo sale tras la reproducción automática del paso 1.
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
- **El «ya visto» va en `localStorage`, no en el esquema.** Una migración está
  prohibida sin aprobación explícita del fundador (CLAUDE.md). El coste
  asumido y declarado: el popup reaparece en un navegador nuevo.
- **El popup no se abre en `/dashboard`.** Es una ruta puente: su página no
  pinta nada, sólo redirige al proyecto más reciente. Abrir ahí montaba el
  popup, escribía la marca de «visto» y la redirección se lo llevaba por
  delante — y como el primer login aterriza justo en `/dashboard`, el efecto
  era que **el tour no salía nunca** en el único momento para el que se hizo
  (log §33). La pasada del piloto entra por `/dashboard` a propósito: entrar
  por la pantalla final ocultaría este fallo.
- **La marca de «visto» se escribe AL MOSTRARLO, nunca al cerrarlo.** Escribirla
  al cerrar convierte «salta en el primer acceso» en «salta en cada carga hasta
  que lo cierres»: quien lo mira y navega o recarga se lo vuelve a encontrar
  encima, indefinidamente. Lo encontró el `ux-pilot` el 2026-08-07, que nunca
  cierra nada, con el popup tapando Páginas citadas y la campana en las tres
  anchuras (log §33).
- **El popup es un modal y tapa la consola entera, así que el piloto tiene que
  poder sortearlo.** `visitAsUser` lo cierra con su propia X y lo anota en
  `dismissedWelcomeTour`; `auth.setup` **filtra la marca de «visto» del
  `storageState` ya capturado**, porque si no el estado compartido diría «ya lo
  vio» y el piloto no podría verlo nunca. Que sea un filtro sobre el objeto y no
  un `removeItem` sobre la página no es estilo: `waitForURL` resuelve antes de
  que React hidrate, así que el borrado se adelanta al efecto que escribe la
  marca y el efecto la repone justo a tiempo de que la capture (2026-08-07, el
  popup no salió en ninguna anchura). Si tocas cualquiera de las dos cosas,
  `tests/pilot/journeys/onboarding-tour.spec.ts` es lo que impide que el tour
  vuelva a quedarse sin mirar (log §33).
