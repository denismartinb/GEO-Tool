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
| `PullQuote` | Cita textual de una fuente identificable. | Para frases propias que quieres destacar — eso es negrita. |
| `Stat` / `StatGrid` | Cifra concreta con su fuente. | Si no puedes citar de dónde sale la cifra. |
| `CodeBlock` | Fichero o fragmento reproducible por el lector. | Para pseudocódigo ilustrativo. |

### Datos

| Componente | Para qué sirve | Cuándo NO usarlo |
|---|---|---|
| `ProductMock` | Maqueta del panel de GEO Score con datos de ejemplo. | Para mostrar una función que no existe. |
| `CompareTable` + `Pill` | Comparación multi-eje con veredicto codificado en color. | Para dos filas — eso es un párrafo. |
| `Checklist` | Cosas que el lector debe comprobar una a una. | Para enumerar conceptos — eso es `<ul>`. |

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

## 7. Nomenclatura CSS

Todas las clases van con prefijo `art-`. No es cosmético: la PR #292 costó una
colisión de clases entre ramas sin mergear, y este sistema introduce ~15
clases de golpe. Cualquier clase nueva de artículo empieza por `art-`.
