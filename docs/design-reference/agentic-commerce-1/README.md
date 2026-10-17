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
- **Consola** (Fase 2, todavía sin construir): tarjeta en Visión general y la
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
