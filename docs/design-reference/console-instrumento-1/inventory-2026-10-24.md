# Inventario delta · 2026-10-24 (frente a `inventory.md` del 2026-10-11)

Fuente: repo `GEO-Tool`, rama `redesign-ref` = origin/main (último commit 1f97980, SEO-TRACK-1 fase 1, #661). Sólo lo nuevo o cambiado. Etiquetas literales del producto entre «».

## Menú (`components/sidebar.tsx`)
- Cinco bloques: «Posicionamiento en la IA» (Visión general, Prompts, Competidores, Páginas citadas) · «Posicionamiento global» (Auditoría técnica, Posición en Google) · **«Comercio agéntico» con «Nuevo»** (Visibilidad en agentes, Auditoría agéntica) · «Actuar» (Recomendaciones) · «Aprender» (Manuales y estudios ↗).
- Cajón móvil: filas de 36 px para que todo quepa a 390×664 (log §332).

## Posición en Google (`search-console/**`, `lib/seo-tracking/**`, log §284–§346)
- Tres pestañas (SEO-TRACK-1, diseño v6): «Resumen» · «Temas» · «Descubrir palabras». El detalle de Search Console ya existente queda debajo del Resumen.
- Seguimiento del Top 20 de Google con DataForSEO (no necesita Search Console). Tope por plan: 15 / 50 / 150 palabras (Starter / Pro / Agencia). Una foto por semana; el cliente nunca ve qué día («la última foto», «la foto anterior»). Primera foto al guardar: «Guardado. Estamos tomando la primera foto de Google.»; si tarda: «La primera foto de Google está tardando más de lo normal.»
- Resumen: «Tus palabras esta semana» (en la página 1 / «Ya casi» / fuera del Top 20 · han subido / han bajado), «Lo que más se ha movido», «Lo que más te frena», «Qué hacer esta semana», «Tus rivales en Google» («Elegir rivales», «Cambiar rivales»), «Google · últimos 28 días» (clics, impresiones, búsquedas en la página 2).
- Temas: cada tema abre panel lateral con «Puesto medio, 8 semanas», «Palabras del tema» (Palabra · Puesto · Tu página; «No sale», «Sin foto todavía»), «Qué hacer» (reglas, sin LLM, con «Marcar como hecho»), «Preguntas que Google enseña», «Mapa de Google», «Top 10 de Google» («pulsa una para ver su Top 10»).
- Pasos «Qué hacer» reales: «Lleva «X» del puesto N a la página 1», «Añade «término» al título de /página», «Responde lo que la gente pregunta en Google», «Consigue enlaces hacia /página», «Varias páginas tuyas se reparten el tema», «Completa tu ficha de Google», «Mejora el título y la descripción de /página».
- Descubrir palabras: «A partir de una palabra» («Buscar ideas»), «Las de tus rivales» («Buscar en tus rivales»), «Search Console» (puestos 4–20 que no vigilas, «No gastan búsquedas»). Límite: «Has usado las 5 búsquedas de hoy. Mañana tendrás otras 5.» Botón «Vigilar N palabras».
- Search Console (log §284–§329): KPIs clics/impresiones/puesto medio con tramos y evolución; tabla de búsquedas ordenable (Búsqueda · Puesto · Clics · Impresiones), móvil con todas las columnas y scroll horizontal; páginas cruzadas con la Auditoría SEO («Sin auditar»); «Te ven, pero no entran»; preguntas con «Vigilar prompt» → «Prompt vigilado»; móvil/ordenador; canibalización; pantalla de carga ambiente.
- Invitación a conectar (GSC-CONNECT-CTA-1): «Añade lo que ve Google» + «Conectar con Google»; reconectar: «Se ha perdido la conexión con Google» / «Volver a conectar». Sin cifras de ejemplo.

## Comercio agéntico (`agentic-visibility/**`, `agentic-audit/**`, `lib/agentic-audit/**`, ADR 0043, log §317–§340)
- Nota «Visibilidad agéntica» 0–100 = Descubrimiento 30 + Comprensión 30 + Confianza 20 + Compra 20. «Interoperabilidad» se enseña como «N de 4» (Feed de producto, Catálogo por MCP, Perfil UCP, Tarjeta de agente A2A) y no entra en la nota. Nunca «sin puntos» ni «informativo». No entra en la Puntuación GEO.
- Sólo Pro, Agencia y prueba. Starter: «Visibilidad en agentes está en Pro y Agencia» + «Pasar a Pro».
- Detecta lo que vendes: producto físico, software, servicio, curso, reserva, entradas, suscripción. Para software: «Stock, identificadores y envío no aplican a un software, así que no cuentan.» Página elegida sola («Elegida automáticamente de …»), «Elegir otra ficha/página» (5 al día). Sin venta: «No hemos encontrado qué vendes en tu web.»
- **Visibilidad en agentes**: anillo «de 100», titular «Lo que más frena a un agente es …», barra «Si arreglas X de «Qué hacer primero», subes de N a M.» + «Ver la auditoría»; «El camino de un agente por tu web» (Te encuentra · Entra · Entiende · Se fía · Compra); «Componentes · Pulsa uno para ver sus comprobaciones» (4 + Interoperabilidad); «Preguntas de compra» (por motor: Te nombra · Cita tu web · Manda a un marketplace; suelo de muestra); «Qué hacer primero» → «Ver todas las comprobaciones →».
- **Auditoría agéntica**: «Página revisada», comprobaciones por componente con su arreglo, «Asistentes según tu robots.txt» (Permitido / Bloqueado), «Visitas automáticas» (Sin reto / Reto anti-bots), «Protocolos publicados», «Lo primero». Estados: «Buscando qué vendes en tu web», «No hemos podido abrir tu web», «Has usado las revisiones de hoy…».
- **Visión general**: tarjeta «Comercio agéntico» bajo Auditoría SEO (nota, frase, cuatro componentes con puntos, «Lo primero», botón a Visibilidad en agentes); en Starter invitación a Pro; oculta si no vende.

## Recomendaciones (log §326–§339)
- Una sola cola con etiqueta «IA» o «Google» por tarjeta; la mejor de Google en el puesto 2 del plan; «Más adelante» empieza con «Con tus datos de Google» (o invitación a conectar).
- Tarjetas por tema de tus prompts («Aparece en…»), con sus preguntas dentro, una cifra conjunta y «Marcar como hecho» para todas.
- «Añadir X a competidores» como botón (pasa a «Resueltas»).
- «Ya lo tienes» en «Resueltas» con enlace a la página existente (tachada). «sin cifra calculable», «Plan listo», «Impacto alto/medio/bajo», «Prioridad alta».
- Google: «Marcar como hecho» y «Ahora no».

## Prompts (PROMPTS-REVIEW-1, log §305)
- «Añadir prompts» → método → «Configura y genera tus nuevos prompts» → revisión: «Desmarca los que no quieras y edita el texto si hace falta.», «Editar prompt», «Quitar prompt», «Volver a generar», «Añadir N prompts»; «Has llegado al tope de tu plan».
- Cajón: una fila por motor («Te nombra en N de M respuestas», «Cita tu web en X de M respuestas»), Respuestas de una en una.

## Motores
- Perplexity cuarto motor sólo en Pro y Agencia (`caps.engines >= 4`), etiqueta «Nuevo»; Starter 3. Misión: «Los cuatro a la vez» en Pro.

## Fuera de la consola hoy
- `/demo` (videollamada de 20 min, L–V 18:00–21:00, solicitud por correo) y `/afiliados` (30 % sobre Pro pagado durante 12 meses): ningún enlace desde la consola.
