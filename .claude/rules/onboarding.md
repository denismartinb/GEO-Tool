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
- **No hay reproducción perpetua.** Arranca al verse entero y se para al salir
  de pantalla. Una animación fuera de pantalla es CPU y batería a cambio de
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
