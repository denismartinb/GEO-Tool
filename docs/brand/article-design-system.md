# Sistema de diseño de artículos — GenScore

> Cómo se compone un artículo del blog. Este documento es **normativo**: el
> agente que redacta lee de aquí, y las reglas que se pueden comprobar por
> máquina están implementadas como tests, no como recomendaciones.
>
> Política de imágenes: `docs/adr/0026-article-imagery-policy.md`.
> Identidad (paleta, tipografía, logo): `docs/brand/brand-guidelines.md`.
> Reglas de redacción SEO/GEO: `docs/content-strategy.md` §4.

---

## 1. El principio

**Ningún bloque visual es decorativo. Todos son evidencia.**

Un bloque de esta librería aparece en un artículo porque codifica algo
verdadero de su contenido — una respuesta directa, un veredicto honesto, un
paso de una secuencia real, una cifra con su fuente. Un bloque usado porque
"queda bien" es un bug, igual que lo sería una métrica inventada.

De ahí se derivan las tres reglas duras:

1. Una cifra destacada **siempre** lleva fuente citable (`Stat` no compila sin
   `source`).
2. Una cita **siempre** lleva atribución (`PullQuote` no compila sin `cite`).
3. Una maqueta de producto **siempre** declara en su pie que los datos son de
   ejemplo, y sus pesos/etiquetas coinciden con los reales del producto.
4. El número del gauge de un `ProductMock` **siempre** es la media ponderada
   real de las filas que ese mismo artículo enseña. Se comprueba en
   `lib/blog/article-recipes.test.ts`, no a ojo: ya se coló dos veces.

### No enseñes la misma cifra dos veces seguidas

Si la `Figure` ya muestra los pesos, el `StatGrid` de debajo no los repite —
es información duplicada disfrazada de dos bloques (hallazgo del `ux-pilot`,
PR #309). El patrón que funciona: la figura enseña **valores de un escaneo**
(`weight` es opcional en `MockRow`, así que se puede omitir) y el `StatGrid`
enseña **los pesos**. Cada bloque aporta algo que el otro no.

### Aviso sobre `PullQuote` — el tipo no te salva de esto

`cite` es obligatorio, pero el compilador **no puede comprobar que lo citado
sea textual**. En la primera conversión de esta fase se coló una paráfrasis
("Google ha confirmado públicamente que…", en tercera persona) atribuida a una
persona concreta como si fueran sus palabras. Se retiró antes de publicar.

La regla, que ninguna herramienta puede imponer por ti:

- `PullQuote` es solo para **palabras literales de una fuente que puedes
  enlazar**. Si no tienes la cita textual delante, no la uses.
- Si lo que tienes es la posición de una organización, escríbelo en prosa con
  su atribución ("Google ha confirmado, a través de X, que…"). Eso es honesto
  y no necesita un bloque destacado.
- Una cita en tercera persona sobre la propia organización del citado es la
  señal más fácil de detectar: nadie habla así de sí mismo.

---

## 2. La librería

Se importa siempre del barril, nunca de los ficheros sueltos:

```tsx
import { KeyTakeaway, NumberedSection, QuickAction } from "@/components/blog/article";
```

### Estructura

| Componente | Para qué sirve | Cuándo NO usarlo |
|---|---|---|
| `KeyTakeaway` | La respuesta directa al titular, antes de desarrollar nada. Regla "answer first". | Si el artículo no plantea una pregunta concreta. |
| `NumberedSection` | Paso de una secuencia real. El número codifica orden que el lector necesita. | Para secciones temáticas sin orden. Usa `##` normal. |
| `QuickAction` | Una tarea concreta al cierre de una sección numerada. | Si la "acción" es vaga ("piensa en tu estrategia"). |
| `AuthorBio` | Señal E-E-A-T visible al cierre. | Nunca se omite. |
| `ArticleCta` | Cierre del artículo. | Más de uno por artículo. |

### Evidencia

| Componente | Para qué sirve | Cuándo NO usarlo |
|---|---|---|
| `Verdict` | Cuando la respuesta honesta a "¿esto funciona?" **no** es un sí limpio. | Para dar una opinión sin evidencia detrás. |
| `Figure` | Contenedor de todo lo visual: marco, pie, fuente. | Nunca metas un visual sin `Figure`. |
| `PullQuote` | Cita **textual y verificable** de una fuente identificable. | Para una paráfrasis. Ver el aviso de abajo. |
| `Stat` / `StatGrid` | Cifra concreta con su fuente. | Si no puedes citar de dónde sale la cifra. |
| `CodeBlock` | Fichero o fragmento reproducible por el lector. | Para pseudocódigo ilustrativo. |

### Datos

| Componente | Para qué sirve | Cuándo NO usarlo |
|---|---|---|
| `ProductMock` | Maqueta del panel de GEO Score con datos de ejemplo. | Para mostrar una función que no existe. |
| `ShareOfVoice` | Reparto de menciones entre marcas, con la tuya marcada. | Sin decir sobre cuántos prompts se calcula (`total` es obligatorio). |
| `PromptSet` | Conjunto de prompts de ejemplo con su intención. | Para un solo prompt — eso va en prosa, en cursiva. |
| `CompareTable` + `Pill` | Comparación multi-eje con veredicto codificado en color. | Para dos filas — eso es un párrafo. |
| `Checklist` | Cosas que el lector debe comprobar una a una. | Para enumerar conceptos — eso es `<ul>`. |

#### `Checklist` — el icono tiene que decir lo mismo que el texto

`tone="hacer"` (por defecto) marca cada punto con un check verde; `tone="evitar"`
lo marca con un aspa roja. **No es una preferencia estética.** El icono es lo
primero que lee quien escanea la página, antes que la frase: un apartado de
"errores comunes" — es decir, cosas que NO hay que hacer — marcado con checks
verdes le da al lector la señal contraria a la que dice el texto. El `ux-pilot`
lo encontró así en la primera conversión de esta fase (PR #309).

Regla: si los puntos están redactados en negativo ("No copies…", "Nunca…"),
lleva `tone="evitar"`. Lo comprueba `lib/blog/article-recipes.test.ts`.

---

## 3. Recetas obligatorias por cluster

Cada artículo debe cumplir el mínimo de su cluster. Se valida en
`lib/blog/article-recipes.test.ts`; un artículo que no cumpla **no pasa el
build de tests**.

| Cluster | Mínimo obligatorio |
|---|---|
| `fundamentos` | `KeyTakeaway` · ≥1 `Figure` · `AuthorBio` · `ArticleCta` |
| `medicion` | `KeyTakeaway` · ≥1 `Figure` · ≥1 `StatGrid` · `AuthorBio` · `ArticleCta` |
| `playbooks` | `KeyTakeaway` · ≥2 `NumberedSection` · ≥2 `QuickAction` · ≥1 `Figure` · `AuthorBio` · `ArticleCta` |
| `sectores` | `KeyTakeaway` · ≥1 `Figure` · ≥1 `StatGrid` · `AuthorBio` · `ArticleCta` |

El mínimo es un suelo, no un objetivo. Un playbook con 6 pasos lleva 6
`NumberedSection`, no 2.

---

## 4. Enlaces

Regla del fundador (2026-08-03): **se prueban siempre todos los enlaces.**
Implementado en dos niveles, ambos automáticos:

1. **Estático** — `lib/blog/article-links.test.ts` extrae todo `href` interno
   de cada artículo y comprueba que resuelve a una ruta real del sitio (post,
   término del glosario, página de docs, comparativa o ruta estática
   conocida). Un enlace a una ruta inexistente rompe el build.
2. **En el navegador** — el journey del `ux-pilot`
   (`tests/pilot/journeys/public-pages.spec.ts`) recoge todos los enlaces
   internos de cada página publicada y comprueba que cada uno responde 200
   contra el despliegue real.

El primero coge los errores de tipeo antes de desplegar; el segundo coge las
rutas que existen en el código pero fallan en producción.

---

## 5. Antes de enseñárselo al fundador

Regla del fundador (2026-08-03), no negociable:

> Siempre antes de pasarme un artículo a revisar tiene que pasar el `ux-pilot`
> y arreglar lo que no se vea bien. También probar siempre todos los enlaces.

Es decir, el orden es: redactar → componer → tests → **pilot** → *arreglar lo
que el pilot encuentre* → y solo entonces Human Gate. Un artículo no llega al
fundador con un hallazgo del pilot abierto.

---

## 6. Tema

Claro únicamente. El sitio real no implementa modo oscuro (`app/globals.css`
no declara `prefers-color-scheme` ni `data-theme`), así que los componentes
tampoco lo hacen. Si algún día se añade modo oscuro, se añade en un solo
sitio: los tokens `--brand-*`.

---

## 7. Contenido que se desborda en móvil

Todo bloque con scroll horizontal propio (`CompareTable`, `CodeBlock`) lleva
una pista visible por debajo de 640px. Sin ella el contenido se lee como
**cortado**, no como deslizable — es un `PILOT FAIL` real de la PR #306, y el
pilot volvió a señalarlo en la PR #309 para el bloque de código.

Es también la razón por la que el barrido automático no basta como única
verificación: el `scrollWidth` de la página está bien porque el desbordamiento
ocurre *dentro* de un contenedor con scroll propio. Solo mirando la captura se
ve. Cualquier bloque nuevo que desborde en horizontal necesita su pista.

---

## 8. Nomenclatura CSS

Todas las clases van con prefijo `art-`. No es cosmético: la PR #292 costó una
colisión de clases entre ramas sin mergear, y este sistema introduce ~15
clases de golpe. Cualquier clase nueva de artículo empieza por `art-`.
