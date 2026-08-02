# Estrategia de contenido — GROWTH-2

> Fuente de verdad de la arquitectura, las reglas de redacción y el ritmo de
> publicación del motor de posicionamiento orgánico de Genscore (SEO + GEO).
> Continuación de GROWTH-1 (`docs/launch-plan.md`, Fase 7). El ledger de
> ejecución fase a fase vive en `docs/content-calendar.md`; este documento es
> el "por qué" y el "cómo", no el estado.
>
> Aprobado por el fundador 2026-08-02 ("modo YOLO" con Human Gate manual en
> cada PR — ver Fase 7b del launch plan). Consultar antes de escribir
> cualquier pieza nueva: agentes `seo-geo-research` y `growth-content`.

---

## 1. Por qué esta arquitectura

Genscore parte de cinco artículos sueltos en una lista cronológica. Eso no es
un problema de volumen — es un problema de arquitectura: sin páginas pilar,
sin enlazado interno, sin capa de documentación de producto, sin comparativas
y sin ningún dato original propio, publicar más posts multiplica el problema
en vez de resolverlo.

El modelo se inspira en las cuatro capas de contenido de Semrush (blog ·
knowledge base · academy · estudios propios), adaptado a un producto de un
fundador solo, más una quinta capa que solo Genscore puede producir: sus
propios datos de escaneo.

**Doble objetivo, no solo GEO.** La gente sigue buscando mayoritariamente en
Google, así que cada pieza se escribe para rendir en **motores de búsqueda
clásicos y en motores generativos a la vez** — ver la Sección 4. GEO sin SEO
deja tráfico gratis sobre la mesa; SEO sin GEO ignora hacia dónde se mueve la
categoría.

---

## 2. Las cinco capas

| Capa | Ruta | Responde a | Coste | Impacto |
|---|---|---|---|---|
| **A — Documentación pública** | `/docs` | Preguntas sobre el producto ("¿qué mide Genscore y cuánto cuesta?") | Bajo | Alto |
| **B — Hubs temáticos** | `/blog/<cluster>` | Preguntas de categoría ("¿qué es GEO?") | Medio | Medio-alto |
| **C — Páginas de decisión** | `/comparativas`, `/alternativas` | Preguntas de compra ("¿qué herramienta GEO uso?") | Medio | Alto, más rápido |
| **D — Glosario** | `/glosario` | Preguntas de definición ("¿qué es llms.txt?") | Bajo | Medio |
| **E — Observatorio** | `/observatorio` | Genera la cita, no la responde | Alto (escaneos reales) | Alto, pero requiere aprobación propia |

Detalle de cada capa, orden de ejecución y wireframes: ver el Task Intake
Report de GROWTH-2 (histórico de la conversación con el fundador,
2026-08-02) y el artefacto visual publicado en esa sesión. Este documento
fija las reglas operativas; no repite el diagnóstico completo.

**Capa A primero.** Es la más barata (deriva de ADRs y código ya existentes,
cero riesgo de inventar nada) y cubre el hueco más grande: hoy no existe
ninguna página que documente qué hace el producto, con qué límites, a qué
precio — exactamente lo que el Knowledge Base de Semrush hace por cada
informe.

**Capa E requiere su propio Task Intake.** Toca coste real de escaneos
(dinero contra Gemini/Claude/ChatGPT) y debe publicar su metodología. No se
ejecuta como parte del "modo YOLO" de las capas A-D; necesita aprobación
explícita y evaluación de coste antes de escribir una línea.

---

## 3. Fuera del dominio (no es código, pero es parte del plan)

El ~97% de las citas en motores generativos vienen de medios ganados que no
son de primer nivel (listados, fichas de software, foros, comunidades). Esto
no lo ejecuta ningún agente — es trabajo del fundador:

- Entrar en los rankings/listicles de herramientas GEO que ya se publican.
- Fichas en G2/Capterra.
- Presencia en comunidades (Reddit, foros SEO en castellano).
- LinkedIn / vídeo corto (AI Overviews de Google se apoya fuertemente en
  YouTube).

Sin esta capa, las otras cinco rinden a medias. `growth-content` y
`seo-geo-research` pueden preparar el material (texto para un listing, ficha
de producto, guion corto), pero la distribución en sí no es una fase de
código.

---

## 4. Reglas de redacción — SEO y GEO a la vez

Google y los motores generativos no premian exactamente lo mismo. La regla
del agente redactor (`growth-content`) para resolver el conflicto:
**respuesta directa arriba, profundidad debajo.** Las primeras ~100 palabras
responden la pregunta de forma autocontenida (sirve a las citas de IA y a
los fragmentos destacados de Google); el resto de la pieza aporta ejemplos
reales, capturas del producto, datos propios y matices — lo que un modelo no
puede resumir sin perder valor, y lo que hace que valga la pena hacer clic.

### 4.1 On-page

- **Keyword primaria** en `<title>`, H1, URL y las primeras 100 palabras.
  Una sola por URL — sin canibalización entre piezas del mismo cluster.
  Entre 3 y 5 keywords secundarias semánticas repartidas de forma natural.
- **Jerarquía de encabezados**: un solo H1. H2/H3 sin saltar de nivel. Los
  H2 se formulan como la pregunta real del usuario ("¿Cómo elijo mis
  competidores?", no "Selección de competidores") — sirve a los fragmentos
  destacados y a las citas de IA por igual.
- **Longitud por tipo de pieza** (orientativa, la intención manda sobre el
  recuento):

  | Tipo | Palabras |
  |---|---|
  | Doc de producto (`/docs`) | 600–900 |
  | Artículo de cluster (`/blog`) | 1.200–1.800 |
  | Página pilar | 2.500–3.500 |
  | Entrada de glosario | 150–300 |
  | Comparativa/alternativa | 1.500–2.200 |

### 4.2 Densidad de palabra clave — techo, no objetivo

**La densidad de keyword es un límite de seguridad, no una meta.** Rango de
trabajo: **0,5%–1,5%**. Perseguir un porcentaje objetivo produce texto
repetitivo que Google clasifica como sobreoptimizado desde hace años y que
los modelos generativos directamente no citan.

Lo que sí se mide y se exige es la **cobertura semántica**: que aparezcan
las entidades, sinónimos y términos relacionados que de verdad definen el
tema (ej. para "GEO Score": presencia, prominencia, posición competitiva,
autoridad, share of voice — no solo repetir "GEO Score" veinte veces).
`growth-content` informa de ambas cifras (densidad real y cobertura
semántica) en cada pieza entregada, y avisa explícitamente si se pasa del
techo del 1,5%.

### 4.3 Estructura y datos

- **Enlazado interno**: mínimo 3 enlaces internos contextuales por pieza,
  con anchor descriptivo (nunca "aquí"/"este artículo"). Todo satélite
  enlaza a su página pilar; el pilar enlaza a todos sus satélites.
- **Datos estructurados**: `Article` (ya existe desde GROWTH-1) +
  `FAQPage` donde haya preguntas frecuentes reales, `BreadcrumbList` (ya
  añadido en Fase 2.1), `DefinedTerm` en el glosario, `ItemList` en
  comparativas.
- **Fecha de actualización visible** en cada pieza, además de la fecha de
  publicación.

### 4.4 Refresco — tan importante como publicar

Cada pieza lleva su fecha de revisión. Un refresco cambia un dato, un
ejemplo o una sección entera — **nunca solo la fecha**. La frescura pesa
mucho en consultas sensibles al tiempo, tanto en Google como (más aún) en
motores generativos. Cadencia: ver Sección 5.

### 4.5 Honestidad (no es una regla nueva, es la de siempre)

Toda afirmación de metodología, feature o capacidad del producto debe
trazarse a un ADR o al código real (mismo principio que ya rige
`growth-content` desde GROWTH-1). Ninguna cifra de mercado de terceros se
presenta como dato propio de Genscore — solo el Observatorio (capa E,
aprobación aparte) genera dato propio real.

---

## 5. Cadencia

| Ritmo | Qué |
|---|---|
| 3 piezas/semana | 1 de cluster o comparativa + 1 corta (doc o glosario) + 1 refresco de pieza existente |
| 1/mes | 1 comparativa o página de alternativa nueva |
| 1/trimestre | 1 pieza del Observatorio (cuando esa fase esté aprobada) |

≈ 10–12 URLs nuevas al mes + 4 refrescos. Sostenible para un fundador solo;
por encima del umbral en el que un cluster empieza a rankear como conjunto.

---

## 6. Sistema de agentes

### `seo-geo-research` (nuevo, read-only / plan mode)

Investiga qué escribir, no escribe. Ver `.claude/agents/seo-geo-research.md`.
Devuelve briefs priorizados (URL objetivo, cluster, keyword primaria,
formato, intención, ángulo, qué debe demostrar la pieza) — nunca prosa
final.

### `growth-content` (ampliado)

De brief a pieza publicada. Ver `.claude/agents/growth-content.md`. Aplica
las reglas de la Sección 4 y el protocolo de refresco de la Sección 5.

### Operativa

Cada PR de contenido actualiza `docs/content-calendar.md` (mismo protocolo
que `docs/launch-plan.md`: una fila por pieza, estado, PR, fecha). Human
Gate manual en cada PR, igual que el resto del producto — el "modo YOLO" de
GROWTH-2 significa que el Director no se detiene a pedir permiso entre
sub-fases, no que se salte el Human Gate de ninguna PR individual.
