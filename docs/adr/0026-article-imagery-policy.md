# ADR 0026 — Política de imágenes e ilustración en artículos

- **Estado:** aceptado
- **Fecha:** 2026-08-03
- **Fase:** GROWTH-3 Fase 3.1
- **Decide:** de dónde salen los activos visuales de un artículo del blog, y
  de dónde no.

## Contexto

Hasta esta fase, los 7 artículos del blog tenían **cero imágenes en el
cuerpo**. Cuatro tenían una `cover.png` de portada; tres ni eso. El único uso
de un componente visual en todo el blog eran 3 apariciones sueltas
(`ProcessFlow` ×2, `GeoScoreBreakdown` ×1). Todo lo demás era texto, listas y
alguna tabla markdown.

El diagnóstico del fundador (2026-08-03): un blog de texto plano puede traer
tráfico, pero la tasa de rebote será alta y no habrá engagement. La referencia
aportada fueron tres PDFs de la Knowledge Base y el blog de Semrush.

Al analizar esos PDFs aparece el hallazgo que gobierna esta decisión:

> **Ningún visual de Semrush es decorativo. Todos son evidencia.** Cada imagen
> es o una captura que prueba la afirmación, o un ejemplo enmarcado del patrón
> que se está enseñando, o una tarjeta de datos con la cifra destacada y su
> fuente.

Eso convierte la pregunta "¿qué imágenes ponemos?" en una pregunta de
honestidad, no de estética — que es terreno donde este proyecto ya tiene
reglas duras (`CLAUDE.md`: nada de métricas falsas, recomendaciones falsas ni
comportamiento de producto falso).

## Opciones consideradas

1. **Ilustración generada por IA.** Rápida y barata de producir en volumen.
2. **Banco de imágenes de stock.** Inmediata, sin coste de producción.
3. **Capturas reales del producto**, cosechadas del harness del `ux-pilot`,
   que ya captura las pantallas reales en 3 anchos en cada despliegue.
4. **Maquetas del producto construidas en SVG/CSS**, con datos de ejemplo,
   igual que ya hace la landing `/geo` (`GaugeMock`, tarjetas de métricas).

## Decisión

**Se adoptan (4) las maquetas SVG/CSS como fuente principal, y (3) las
capturas reales solo en documentación de producto (`/docs`).**

**Se rechazan (1) la ilustración generada por IA y (2) el stock, para todo el
contenido del sitio.**

### Por qué se rechaza la ilustración generada por IA

- **Puede mentir.** Una ilustración generada puede representar una interfaz
  que no existe, una métrica que no calculamos o un resultado que no hemos
  medido. La regla de `CLAUDE.md` contra el producto falso no distingue entre
  mentir con texto y mentir con un dibujo.
- **No es determinista.** Un agente que regenera el artículo produce otra
  imagen distinta. Un componente SVG produce el mismo píxel siempre, y su
  diff es legible en la PR.
- **Se sale de la identidad.** La marca tiene paleta y tipografía definidas
  (`docs/brand/brand-guidelines.md`); un generador no las respeta de forma
  fiable.
- **Coste marginal.** Cada imagen cuesta dinero y tiempo de revisión; un
  componente se escribe una vez y se reutiliza.

### Por qué las maquetas y no las capturas reales, para el blog

Las capturas del `ux-pilot` son de la cuenta piloto, que vive en el **mismo
proyecto de Supabase que producción** y contiene datos reales. Publicarlas en
un artículo de marketing supone exponer datos de un proyecto real sin una
decisión explícita al respecto. Las maquetas dan control total del dato
mostrado y riesgo cero de filtración.

En `/docs`, donde el objetivo es enseñar a usar el producto y la captura
anotada es el recurso correcto (es el patrón de la KB de Semrush), sí se
permiten capturas reales — **con datos de una cuenta de demostración, nunca
de un cliente**.

## Consecuencias

### Obligatorio

- Toda maqueta de producto en un artículo lleva **datos de ejemplo**, y el pie
  de figura lo dice explícitamente.
- Toda cifra real que aparezca en una maqueta o en un `Stat` **cita su
  fuente** (ADR, fichero de código o fuente externa con fecha). Un `Stat` sin
  `source` no compila: la prop es obligatoria en el tipo.
- Los pesos, umbrales y etiquetas que aparezcan en una maqueta deben coincidir
  con los reales del producto. Si ADR-0015 dice 40/25/20/15, la maqueta dice
  40/25/20/15.

### Prohibido

- Ilustración generada por IA **dentro del cuerpo** de una página pública.
  (Enmienda de 2026-08-04: las **portadas** quedan excluidas de esta
  prohibición — ver §Enmienda al final.)
- Imágenes de stock **dentro del cuerpo** de una página pública.
- Capturas de la cuenta piloto o de cualquier proyecto de cliente en
  contenido de marketing.
- Maquetas que muestren una función que el producto no tiene.

### Coste

Cero coste marginal por artículo. El coste es de una sola vez: la librería de
componentes (`components/blog/article/`), construida en esta fase.

## Referencias

- `docs/brand/article-design-system.md` — la librería y sus reglas de uso.
- `docs/brand/brand-guidelines.md` — paleta y tipografía de las que salen las
  maquetas.
- `docs/adr/0015-geo-score-v2.md` — los pesos reales que las maquetas deben
  respetar.
- `docs/agentic-user-pilot.md` — el harness cuyas capturas se descartan para
  marketing y se permiten en `/docs`.

---

## Enmienda (2026-08-04) — las portadas quedan fuera de la prohibición

**Decisión del fundador**, tras revisar el blog en móvil: las portadas
generadas por el sistema de respaldo (degradado + icono) **no valen**. Sus
palabras: *"parece un icono de algo que no carga bien"*, y *"hay que currarse
bien las imágenes principales de todos los artículos, porque es lo que le da
al blog una sensación de que es coherente y de que aporta valor"*.

### Qué cambia

Se permite **imagen generada o de stock en la portada** de un artículo.

### Qué NO cambia, y por qué

La prohibición sigue en pie **dentro del cuerpo del artículo**. La razón
original no era estética, era de honestidad: una imagen generada puede
representar una interfaz que no existe o una métrica que no calculamos, y eso
es mentir con un dibujo. Dentro del artículo, donde el visual va junto a una
afirmación concreta, ese riesgo es real.

En una portada el riesgo desaparece **si la portada no afirma nada**. De ahí
la regla que acompaña a la enmienda:

> Una portada puede ser generada o de stock, pero **no puede representar una
> interfaz de producto, un gráfico, un panel ni una métrica**. Si la portada
> enseña algo que parece un dato de Genscore, ese dato tiene que existir — y
> entonces ya no es una portada, es una figura, y le aplica la regla del
> cuerpo.

Es decir: portadas conceptuales o abstractas, sí. Portadas que simulen
nuestro producto, no.

### Lo que esto implica en la práctica

- Las 4 portadas actuales (aportadas por el fundador) **se mantienen**.
- Faltan 3: `que-es-el-geo-score`, `llms-txt-guia-practica` y
  `como-conseguir-que-chatgpt-te-cite`. Hasta que existan, esos artículos
  caen en el degradado con icono, que es justo lo que se ha rechazado.
- El agente que redacta **no puede generar imágenes**: no hay herramienta de
  generación en el entorno de trabajo, y el stock exige una licencia. La
  producción de la portada es, hoy, un paso humano. Mientras siga siéndolo,
  la publicación semanal autónoma tiene aquí una dependencia manual — hay que
  tenerlo en cuenta al planificar esa fase.
- `lib/blog/covers.test.ts` impide que la deuda de portadas crezca: un
  artículo nuevo nace con portada.
