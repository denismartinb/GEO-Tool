# Kit de autoridad off-site — SEO-POS-1 Fase A

Material listo para publicar. **Lo prepara el agente; publicar y conversar es
del fundador** (`docs/content-strategy.md` §3, `docs/seo-positioning-plan.md`
Fase A). Nada de este documento se ejecuta solo.

**Por qué esta fase existe.** Según la investigación citada en
content-strategy §3, la inmensa mayoría de las citas de los motores
generativos vienen de medios ganados que no son de primer nivel: listados,
fichas de software, foros y comunidades. Es una cifra de un tercero del propio
sector, orientación de dirección y no dato propio. Las otras capas del plan
—blog, docs, comparativas, entidad— rinden a medias sin ésta, porque casi todo
lo que hemos construido está **en nuestro dominio**, y un motor que sólo
encuentra a una marca hablando de sí misma tiene poco con lo que corroborarla.

---

## 1. Lo que este kit NO es

- **No es permiso para publicar cifras nuevas.** Todo número que salga de aquí
  tiene que estar en la tabla de §2 o venir con su fuente ajena, igual que en
  el blog (`.claude/rules/growth-content.md`, "Honestidad").
- **No es una campaña.** Son textos base. El tono lo pone el fundador en cada
  conversación real.
- **No sustituye al EUIPO.** Ver §7.

---

## 2. Los hechos verificables

Esta tabla es la única fuente para cualquier cifra que se publique fuera del
sitio. Sale de `app/pricing/plans-data.ts`, y **`tests/off-site-kit.test.ts`
comprueba que sigue coincidiendo**: si alguien cambia un plan y no actualiza
esto, el test se pone rojo. Sin ese lazo, este documento envejece en silencio y
el fundador acaba pegando precios viejos en una ficha de G2 que no se
revisa nunca.

| Plan | Precio | Dominios | Prompts | Motores | Frecuencia |
|---|---|---|---|---|---|
| Free / Scan | 0 € | 1 | 10 | 1 | Puntual |
| Starter | 45 € | 1 | 25 | 3 | Semanal |
| Pro | 179 € | 5 | 100 | 3 | Diario |
| Agencia | Plan a medida | A medida | 300 | 3 | Diario |

**Los tres motores son ChatGPT, Gemini y Claude** (`lib/brand/canonical-definition.ts`).

**La descripción de una línea, palabra por palabra** — es la misma cadena que
usan la home, `/que-es-genscore` y el schema, y usarla también fuera es
precisamente lo que ayuda a que "GenScore" resuelva a nuestra entidad
(Fase E, log §100):

> GenScore es una plataforma de Generative Engine Optimization (GEO) que mide
> y mejora la visibilidad de una marca en las respuestas de ChatGPT, Gemini y
> Claude.

---

## 3. Lo que hay que declarar, no esconder

Un comprador lo comprueba en dos clics, y delante de un competidor o de una
comunidad técnica ocultarlo se paga más caro que decirlo. Ya es obligatorio en
las comparativas (`alternativas-a-otterly.test.ts` lo exige por nombre):

- **No ejecutamos Perplexity ni Copilot.** Tres motores: ChatGPT, Gemini,
  Claude.
- **No hay desglose por país.**
- **El plan Free es un escaneo puntual**, no monitorización continua.

Se dicen **situados**, no en titular: en la respuesta donde vengan a cuento, no
como advertencia previa contra uno mismo (log §67).

---

## 4. Reddit

**El riesgo real no es que no funcione: es que salga caro.** Una cuenta que
entra a colocar producto en r/SEO se gana un baneo y, peor, deja el nombre
asociado a spam en un sitio que los motores citan mucho. Eso es peor que no
estar: la Fase E entera va de que "GenScore" resuelva a algo bueno.

**Reglas, en orden:**

1. **Responder sin enlazar es la norma; enlazar es la excepción.** Si la
   respuesta se sostiene sola, no lleva enlace.
2. **Declarar quién eres siempre que se nombre el producto.** Una línea:
   *"aviso: trabajo en GenScore"*. No cede autoridad — la advertencia previa
   contra uno mismo es lo que sí la cede (log §67); esto es sólo no engañar.
3. **Nunca recomendarnos en un hilo donde no encajamos.** Si alguien pide algo
   con desglose por país, la respuesta honesta es que no somos eso.
4. **Cero cuentas de apoyo.** Una cuenta, la del fundador.

### Plantillas

**a) "¿Cómo sé si ChatGPT menciona mi marca?"** — la pregunta más repetida, y
se responde entera sin producto:

> Lo que funciona es dejar de preguntárselo a ojo. Haz una lista de 10–20
> preguntas que haría un cliente tuyo de verdad —no tu nombre, sino el
> problema que resuelves— y lánzalas en sesión limpia (sin historial, sin
> cuenta). Anota tres cosas por respuesta: si te menciona, en qué posición
> respecto a los competidores, y si cita alguna página tuya como fuente.
> Repítelo cada pocas semanas: las respuestas cambian solas porque los modelos
> consultan la web en vivo, así que una sola medición no te dice nada.
>
> Eso a mano son un par de horas al mes. Automatizarlo es literalmente lo que
> hace la categoría de herramientas GEO (aviso: yo trabajo en una).

**b) "¿Merecen la pena las herramientas GEO o es humo?"**

> Parte es humo, y se distingue rápido: pregunta **qué motores ejecuta de
> verdad** y **qué hace cuando no puede medir algo**. Muchas prometen cinco o
> seis motores y por debajo consultan uno. Y si una métrica pone un cero
> cuando en realidad no ha podido medir, el número que te enseña no significa
> nada — "no lo sabemos" y "salió lo peor posible" no son lo mismo.
>
> Lo que sí es real es el problema: si el cliente resuelve su duda dentro de
> la respuesta y no hace clic, tu analítica no te lo cuenta. (Aviso: trabajo
> en GenScore, así que descuenta lo que quieras de esto.)

**c) Cuando alguien pide recomendación directa** — sólo si el hilo encaja:

> Nosotros hacemos exactamente eso (aviso: soy de GenScore). Ejecutamos
> ChatGPT, Gemini y Claude, en castellano y con el mercado español como foco.
> Lo que **no** tenemos: Perplexity, Copilot, ni desglose por país — si
> necesitas cualquiera de esas tres, mira otra. Hay un plan gratis con un
> escaneo real y sin tarjeta para que lo compruebes antes de creerme.

---

## 5. YouTube

AI Overviews se apoya mucho en vídeo, y no tenemos ninguno. Dos guiones
cortos, en el orden en que conviene grabarlos.

**Regla que no se negocia:** si el vídeo enseña el producto, enseña **datos
reales de un escaneo real**. Un pantallazo con números inventados es la misma
falta que un `ProductMock` incoherente, sólo que en un sitio donde no hay test
que lo pare y donde queda grabado.

### Vídeo 1 — "Cómo saber si ChatGPT menciona tu marca" (~3 min)

| Tiempo | Qué |
|---|---|
| 0:00–0:15 | La pregunta, sin intro: *"¿ChatGPT recomienda tu marca cuando alguien pregunta por lo que vendes? Vamos a comprobarlo en tres minutos."* Sin logo, sin música. |
| 0:15–1:00 | A mano: sesión limpia, 3 preguntas reales de cliente, y qué mirar — mención, posición, cita. |
| 1:00–2:00 | Por qué una medición no vale: se repite la misma pregunta y sale distinto. **Enseñar esto en vivo**, es el momento que convence. |
| 2:00–2:40 | Lo mismo automatizado, con un escaneo real. Declarar los tres motores. |
| 2:40–3:00 | Cierre: la lista de prompts es lo que decide el resultado; enlace a `/blog/como-elegir-prompts-monitorizar-marca-ia`. |

**Título:** `¿ChatGPT menciona tu marca? Cómo comprobarlo (y por qué cambia cada semana)`
**Descripción (primeras dos líneas, que es lo que se indexa):**

> Cómo comprobar si ChatGPT, Gemini y Claude mencionan tu marca al responder
> preguntas de tu sector, y por qué el resultado cambia entre mediciones.
> Método manual paso a paso y qué automatiza una herramienta GEO.

### Vídeo 2 — "Qué es el GEO y en qué se diferencia del SEO" (~4 min)

El ángulo que nos separa: **el SEO se mide en clics, el GEO en si te nombran**.
Enlaza a `/docs/metodologia/geo-score`, que es la URL canónica del término
(log §100) — no al glosario ni al artículo.

---

## 6. Directorios y perfiles

Los formularios son rígidos, así que aquí va el texto campo a campo. **Todo
sale de §2.**

### G2 / Capterra

- **Categoría:** SEO / Search Engine Optimization Software → subcategoría de
  monitorización de IA generativa si existe; si no, SEO.
- **Descripción corta (≤160 car.):**
  > GenScore mide si ChatGPT, Gemini y Claude mencionan y citan tu marca al
  > responder en tu mercado, y convierte cada hallazgo en acciones concretas.
- **Descripción larga:** la definición canónica de §2 + los dos párrafos de
  `/que-es-genscore`. No reescribirla: el objetivo de la Fase E es que sea
  **literalmente la misma cadena** en todas partes.
- **Precio de partida:** 0 € (plan gratuito permanente, sin tarjeta).
- **Idiomas:** castellano.
- **Limitaciones declaradas:** las tres de §3.

**Sin reseñas inventadas ni pedidas a cambio de nada.** El schema del sitio no
lleva `aggregateRating` justamente porque no hay reseñas reales (log §100);
fabricarlas fuera sería el mismo dato falso, y además G2 las retira.

### LinkedIn (página de empresa)

- **Tagline:** `La plataforma GEO que mide si las IA recomiendan tu marca`
  (la misma que el subtítulo de `/que-es-genscore`).
- **Sobre nosotros:** definición canónica de §2, entera.
- **Sitio web:** `https://www.genscore.es`

---

## 7. Lo que NO se puede preparar todavía

- **Nota de prensa de datos propios** ("qué marcas españolas cita ChatGPT
  en *sector*"). Es el arma que ninguna agencia española tiene, y **depende
  del Observatorio (capa E), que no está aprobado**. Escribir la plantilla
  ahora sería preparar un molde que invita a rellenarse con números que nadie
  ha medido — la definición exacta de métrica falsa. Cuando el Observatorio
  exista y produzca su primer estudio, la nota se escribe **desde ese dato**.

- **Difusión pagada del nombre.** La solicitud EUIPO (clases 42 + 35,
  ~850–900 €) sigue pendiente (`docs/launch-plan.md` Fase 0). No bloquea
  publicar nada de este kit —son medios ganados, reversibles— pero sí es
  recomendable **antes de meter dinero en anuncios con el nombre**: la
  búsqueda en TMview salió limpia, pero cubre marcas registradas, no marcas de
  uso no registradas.

---

## 8. El bucle que vuelve al código

Esto es lo que ata la Fase A con la Fase E, y conviene no perderlo de vista:

`components/seo/organization-schema.tsx` sólo declara en `sameAs` los perfiles
que existen de verdad — a propósito, porque inventar uno sería un dato falso
(log §100). **LinkedIn y G2 ya están dados de alta y en `sameAs` desde
log §121.** En cuanto exista también la ficha de Capterra o el canal de
YouTube, esas URLs son `sameAs` legítimos y añadirlas es el refuerzo de
entidad más barato que queda: le da al motor las corroboraciones externas que
hoy le faltan a esos dos.

**Cuando el fundador cree cada perfil, pasa la URL y se añade** — es un PR de
tres líneas. No al revés: no se declara un `sameAs` de un perfil que aún no
existe.

---

## Estado

| Acción | Estado |
|---|---|
| Reddit | Material listo. Publicar: fundador |
| YouTube (2 vídeos) | Guiones listos. Grabar: fundador |
| G2 / LinkedIn | **Dados de alta** (log §121) |
| Capterra | Copy listo. Alta: fundador |
| Nota de prensa | **Bloqueada** — depende del Observatorio (sin aprobar) |
| EUIPO | Pendiente del fundador; sólo bloquea difusión pagada |
| `sameAs` en el schema | LinkedIn y G2 añadidos (log §121). Capterra pendiente de que exista el perfil |
