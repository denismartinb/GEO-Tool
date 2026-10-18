# AGENTIC-COMMERCE-1 — diseño aprobado

Prototipo navegable aprobado por el fundador el 2026-10-17 («Aprobado.
Implementa»), versión 4. `prototipo.html` es autocontenido (logos, iconos y
Motion incrustados): ábrelo en un navegador y usa la barra superior para pasar
entre Portada, Landing y Consola, y entre Escritorio y Móvil.

## Qué contiene

- **Portada**: la pastilla «Nuevo · Comercio agéntico: ¿los agentes pueden
  comprar en tu web?» sobre el titular y la entrada «Comercio agéntico» con
  etiqueta «Nuevo» en el menú. El resto de la portada no cambia.
- **Landing `/comercio-agentico`**: titular, comprobador, la escena animada
  (teclado abierto, conversación tipo WhatsApp y cinco escenas de la compra),
  «Qué es» con las tarjetas Navegador y Protocolo, los cinco agentes con sus
  logos, «Por qué ahora», «Cómo te ayuda GenScore» con los cinco componentes al
  estilo PageSpeed, preguntas y cierre.
- **Consola** (Fase 2; la 2a, «Auditoría agéntica», ya construida): tarjeta en Visión general y la
  sección «Comercio agéntico» con «Visibilidad en agentes» y «Auditoría
  agéntica».

## La puntuación

«Visibilidad agéntica», de 0 a 100: Descubrimiento 30, Comprensión 30,
Confianza 20, Compra 20. Interoperabilidad se enseña como «N de 4» protocolos
publicados y no entra en la nota (`docs/adr/0043-agentic-visibility-score.md`).
Nunca se escribe «sin puntos» ni «informativo» (fundador, 2026-10-17).

## Qué cambia en la Fase 1 respecto al prototipo, y por qué

La consola llega en la Fase 2, así que la landing no puede prometerla todavía:

- Se quita la línea del resultado gratuito que mandaba el resto a la prueba de
  Pro: Pro aún no tiene la auditoría agéntica.
- La tarjeta «Auditoría agéntica» lleva «Próximamente».
- El cierre invita a probar Pro por lo que Pro ya hace (si la IA te nombra).
- El resultado del comprobador es el real (`lib/agentic-audit/`), no el de
  ejemplo del prototipo. El bloque de los cinco componentes de «Cómo te ayuda»
  sigue siendo un ejemplo y lo dice.

## Fase 2a: la consola (aprobada 2026-10-17)

`fase-2a.html` es el plan de la Fase 2 que aprobó el fundador («Merge y
sigue con fase 2»), con la maqueta de la pantalla «Auditoría agéntica» en
móvil y escritorio. Sólo se construye la 2a; 2b–2d siguen sin aprobar.
Diferencias con el prototipo y por qué: `docs/brand/design-decisions-log.md`
§322.

`fase-2a-auto.html` es el plan v2 que lo sustituye antes del merge (aprobado
2026-10-17, «Si»): nadie pega una URL, GenScore busca sola una ficha de
producto y la auditoría aparece hecha, como la técnica. Decisiones y
diferencias: §323.

`fase-2a-lo-que-vendes.html` es el plan v3 (aprobado por el fundador el
2026-10-18, log §325): la auditoría detecta software, servicios, cursos,
reservas, entradas y suscripciones además de fichas de producto, y adapta
las comprobaciones a cada tipo. Sus datos son de ejemplo, no medidos.
