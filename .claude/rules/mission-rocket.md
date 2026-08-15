# Mission Rocket Rules

Invariantes compartidos por **las dos animaciones del cohete**:
`components/scan-mission-rocket.tsx` (el primer escaneo), `lib/scan/mission-beats.ts`
(su línea de tiempo) y `components/not-found-mission.tsx` (la 404 pública).
Se inyectan solos al tocar cualquiera de esos ficheros. Cada regla es trazable
a un documento — una regla que nadie puede justificar es peor que ninguna,
porque una sesión futura la obedecerá igual.

- **Hay dos cohetes y son el mismo cohete.** El casco, las aletas, las tres
  toberas y la ventana son los mismos trazados en los dos componentes. Si tocas
  uno, **avisa al fundador y actualiza el otro en el mismo PR**, o deja escrito
  aquí por qué divergen a partir de ahora. Es una petición explícita del
  fundador (2026-08-12) al aprobar NOT-FOUND-ROCKET-1, y no es cosmética: el
  cohete es lo primero que ve alguien que crea un dominio, así que dos cohetes
  distintos leen como dos productos (`docs/brand/design-decisions-log.md` §86).
- **No comparten código a propósito, y por eso hace falta el aviso.** El del
  escaneo está atado al estado de un run real —`computeMissionBeat`, sondeo
  cada 3 s, cinco beats— y el de la 404 es estático, sin datos y sin sesión.
  Fusionarlos metería estado de escaneo en una página pública que hoy es
  estática, y ataría una pantalla de marketing al ciclo de vida del pipeline.
  El precio de mantenerlos separados es esta regla; el precio de unirlos sería
  mayor.
- **Lo que NO puede divergir:** la silueta, la paleta (`--brand-blue` en las
  aletas, `--brand-cyan` en la ventana y los propulsores, casco claro) y la
  dirección de vuelo — asciende hacia arriba-derecha en los dos.
  **Lo que sí puede:** las escenas, el ritmo, la escala y lo que el movimiento
  significa.
- **En el escaneo el movimiento significa datos; en la 404 no significa nada.**
  Allí sólo la altitud del ascenso y la fracción del anillo de órbita codifican
  progreso real, y todo lo demás es ambiente precisamente para que no pueda
  leerse como tal (`components/scan-mission-rocket.tsx`, `RocketScene`). En la
  404 no hay progreso que contar: no puede aparecer ni barra, ni anillo, ni
  contador, ni una estela que "avance" hacia un destino, porque nada de eso
  sería cierto (CLAUDE.md, "no fake progress"; `docs/adr/0029` Fase C).
- **Ninguno de los dos se reproduce perpetuamente sin motivo.** La 404 es
  animación CSS pura —sin `requestAnimationFrame`, sin timers, sin estado— para
  que el navegador la congele sola en una pestaña oculta. El del escaneo sí
  sondea, pero para cuando el run llega a un estado terminal. Una animación que
  nadie mira es CPU y batería a cambio de nada (`.claude/rules/onboarding.md`,
  "No hay reproducción perpetua en el tour").
- **`prefers-reduced-motion: reduce` deja a los dos quietos en un fotograma que
  siga contando la historia.** No es una degradación, es el contrato: en la 404
  el cohete en ruta, la estela cortada y el destino marcado se entienden sin
  moverse.
- **La escena de la 404 se recorta, no se deforma.** Usa
  `preserveAspectRatio="xMidYMid slice"`, así que **el cohete y su trayectoria
  tienen que vivir en la banda central del lienzo**: lo que salga de ahí
  desaparece en el recorte vertical de una pantalla panorámica o en el lateral
  de un móvil. Cualquier elemento nuevo se comprueba en 375, 768 y 1280 px
  antes de darlo por bueno (`docs/design-reference/not-found-rocket-1/`).
- **El mapeo de esta regla a sus ficheros vive en la tabla «Path-scoped rules»
  de `CLAUDE.md`, y en ningún otro sitio.** No hay frontmatter ni configuración
  que lo declare. Si mueves o renombras cualquiera de los tres ficheros sin
  actualizar esa fila, el aviso deja de dispararse **en silencio** — que es
  justo el fallo que esta regla existe para impedir.
