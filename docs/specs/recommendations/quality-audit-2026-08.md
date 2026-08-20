# Auditoría de utilidad de las recomendaciones — agosto 2026

**Origen.** El 2026-08-20 el fundador ejecutó las recomendaciones que GenScore
emite para el propio `genscore.es` con una pregunta concreta: *«imagina que
pagas porque la herramienta te dé esto para pegar e implementar
directamente»*. Dos recomendaciones bastaron para encontrar siete fallos, y el
primero es objetivo: **el bloque que la pantalla ofrecía con un botón «Copiar»
no era JSON válido**.

Este documento es el inventario. **La Fase A está implementada** (F1); las
demás siguen abiertas y esta es su especificación.

---

## Las dos recomendaciones que originaron la auditoría

1. **Añadir schema `FAQPage`** con dos preguntas: *«¿Cómo optimizo la web para
   aparecer en ChatGPT y Gemini?»* y *«¿Cómo sé si mi web está optimizada para
   posicionar en la IA?»*.
2. **Crear contenido** para *«¿Existen plataformas que ofrezcan análisis
   competitivo de la visibilidad en IA?»* — una consulta que hoy no ocupa
   nadie.

El diagnóstico de la segunda es correcto: el hueco existe. El de la primera es
falso, y el motivo está en F2.

---

## F1 · El artefacto pegable llegaba cortado a media palabra — **corregido**

El bloque entregado tenía **1.182 caracteres** y terminaba en
`...bien organizadas con HTML se`. El segundo ejemplo, en `...frente a la c`.

Dos cortadores, ninguno consciente de que aquello era código:

- el prompt le pedía al modelo `max 1200 chars` por artefacto;
- `sanitizeExampleContent()` remataba con un `.slice(0, EXAMPLE_CONTENT_MAX)`
  con `EXAMPLE_CONTENT_MAX = 1200`.

Y nada lo detenía: `validateRewriteAgainstEvidence` sólo mira evidencia
(competidores y dominios inventados) y longitud. **No había un solo
`JSON.parse` en toda la ruta.** Un objeto sin cerrar se persistía en
`generated_solutions.sanitized_content` y se pintaba junto a un botón
«Copiar» (`recommendations-client.tsx`).

Causa de fondo: **1.200 caracteres es incompatible con lo que le pedimos al
modelo**. El playbook de `create_faq_section` exige «2-4 pares
pregunta/respuesta más un bloque JSON-LD». Eso no cabe. Le pedíamos algo que no
entraba y luego lo cortábamos.

### Lo implementado (Fase A)

`lib/recommendations/pasteable-artifact.ts`, con dos reglas deliberadamente
distintas:

- **Un artefacto de código no se trunca jamás.** Medio JSON-LD es peor que
  ninguno: no falla al pegarlo, falla después, en la web del cliente. Si no
  cabe, se descarta entero.
- **La prosa se recorta, pero por límite de palabra.** Un párrafo citable que
  se pasa por poco sigue siendo útil.

Además: tope de código subido a 3.000 (medido sobre el artefacto real),
`JSON.parse` obligatorio sobre todo lo que pretenda ser JSON —incluido un
`<script type="application/ld+json">` sin su cierre—, detección de marcado que
acaba dentro de una etiqueta abierta, y descarte **por artefacto, no por
solución**: el plan sobrevive aunque uno de los tres ejemplos venga roto, para
no gastarle al usuario una generación de su cupo a cambio de nada.

Los descartes se registran (`artifact_dropped`, con el motivo y el tipo de
recomendación). Sin esa traza, la Fase B se diseñaría a ciegas.

**Límite honesto de lo implementado:** el usuario ve un plan con un ejemplo
menos y **no se le dice que ha faltado uno**. Avisar en pantalla es trabajo de
UI y pasada de piloto; queda pendiente.

---

## F2 · El generador no sabe nada de la web del cliente, y nosotros sí — **abierto**

`rewriteRecommendationCore` lee del proyecto exactamente esto:

```
.select("id, brand, domain, language, is_archived")
```

Marca, dominio, idioma. Nada más. Por eso recomienda implementar `FAQPage` a un
sitio que **ya lo emite en 12 superficies** (`/que-es-genscore`, `/pricing`,
`/gratis/aparece-mi-marca-en-chatgpt`, dos comparativas y los 8 artículos del
blog que tienen FAQ visible — comprobado uno a uno, no hay ni uno sin marcar).

Y el dato existe. `lib/web-audit/page-checks.ts` ya rastrea la web del cliente y
parsea su JSON-LD:

```
let hasAnswerFirstIntro = structuredData.matchedTypes.includes("FAQPage");
```

**El producto ya sabía la respuesta y no la usaba.** Es la diferencia entre un
consultor y una plantilla: un consultor abre tu web antes de decirte qué te
falta.

Coste añadido, y es el peor: cuando una recomendación te manda hacer algo que
ya hiciste, **dejas de fiarte de las otras nueve**.

### Qué haría falta

Pasar a `RecommendationRewriteInput` un resumen del sitio tomado de la última
auditoría: URLs rastreadas, `@type` presentes por URL, y si existe ya una
página que responda el prompt afectado. Y una regla nueva en el prompt:
**primero di qué ya tiene, luego qué le falta** — «en esta URL ya tienes X,
añade Y», nunca «crea una página».

Riesgo a resolver en su Task Intake: qué pasa cuando el proyecto no tiene
auditoría todavía (el plan debe degradar a lo de hoy, nunca afirmar que no
existe algo que no ha mirado).

---

## F3 · El schema propuesto marcaría contenido que no existe — **abierto**

Las dos preguntas del bloque JSON-LD no están respondidas visiblemente en
ninguna página. Nuestro propio componente lo tiene escrito en su cabecera:

> `items` must be the exact question/answer pairs actually rendered on the page
> — never invent or duplicate questions the visible content doesn't answer.

Al modelo **nunca se le dice esto**. Google exige que el contenido marcado como
`FAQPage` esté visible; marcarlo sin él es motivo de acción manual. Estamos
entregando un asset que puede penalizar la web del cliente, y la regla que lo
impide ya está escrita en nuestro repositorio, en otro fichero.

---

## F4 · El relleno de marketing pasa todos los filtros — **abierto**

El prompt es bueno impidiendo inventar **hechos**: lista blanca de competidores,
lista blanca de dominios, `[tu dato aquí]` obligatorio para cualquier cifra. Ese
trabajo está bien hecho y no se toca.

Pero «soluciones avanzadas», «mantenerse a la vanguardia», «cruciales para
identificar oportunidades» no inventan nada, así que pasan limpias. Y son
**peores que un placeholder**: un `[tu dato aquí]` se ve inacabado; el relleno
parece terminado.

Y se contradice con nuestra propia metodología. El motor de reglas dice, en
`add_citation_block`:

> «Añade un dato concreto con fecha y fuente (precio, cifra, plazo).»

El asset generado hace lo contrario. **Le decimos al cliente por qué no le citan
y acto seguido le damos para pegar justo el texto que no se cita.**

Lo más sangrante: ya existe un detector de esto, `article-honesty.test.ts`,
aplicado a nuestro blog, glosario, `/docs` y comparativas. **Le exigimos a
nuestro contenido un listón que no le exigimos al que vendemos.**

---

## F5 · Le enseñamos al cliente a auto-promocionarse en su propia FAQ — **abierto**

Del texto generado: *«mencionando a Genscore como una solución»*, *«Genscore
proporciona soluciones avanzadas para este tipo de análisis»*.

Una marca alabándose en su propia FAQ no mueve un motor generativo: los motores
corroboran entre fuentes, que es justo lo que los playbooks de `pursue_*`
entienden bien. Los de `create_faq_section` e `increase_brand_visibility` no lo
dicen. La respuesta debe responder la pregunta, y nombrar la marca una vez y
sólo donde aporte un hecho verificable.

---

## F6 · La marca se escribe como esté escrita en la ficha del proyecto — **abierto**

`input.brand` entra literal al artefacto. De ahí los seis «Genscore» del texto
generado — grafía que `lib/brand/naming.test.ts` pone en rojo en este mismo
repositorio.

La auditoría web ya tiene el `<title>`, el H1 y el `name` del `Organization` del
cliente: se podría usar **la grafía de su propia web**, que es la que él quiere
ver. (Aparte: revisar el campo `brand` del proyecto `genscore.es`, que contamina
todo lo que genere.)

---

## F7 · Nada cierra el bucle — **abierto**

La pregunta de quien paga no es «¿qué hago?», es **«¿sirvió lo que hice?»**. Hoy
la recomendación se genera, se descarta o se reescribe, y nada la ata al
resultado del siguiente escaneo sobre esa misma consulta.

`affected_prompt_ids` está persistido, así que la frase *«esta consulta pasó de
no mencionarte a mencionarte en el escaneo del 3 de septiembre»* es calculable hoy
mismo. Es además la forma honesta de demostrar que el producto funciona.

Ojo al diseñarlo: el GeoScore publicado es la mediana de 3 escaneos comparables
(ADR 0036) y los motores hacen recuperación viva
(`docs/geo-score-variability-2026-08.md`), así que la atribución por prompt es
más honesta que la atribución por puntuación global.

---

## Orden propuesto

| Fase | Qué | Estado |
|---|---|---|
| **A** | Integridad del artefacto pegable (F1) | **implementada** (log §125) — no repara las filas ya persistidas: la ruta de idempotencia sigue sirviendo un artefacto viejo cortado |
| **B** | Contexto real del sitio en el generador (F2, F3) | abierta — necesita Task Intake |
| **C** | Anti-relleno, no-autopromoción, grafía de marca (F4, F5, F6) | abierta |
| **D** | Bucle de cierre por prompt afectado (F7) | abierta |

B es la que convierte una plantilla en un consultor. C es barata y quita la
contradicción con nuestra propia metodología. D es el argumento de renovación.
