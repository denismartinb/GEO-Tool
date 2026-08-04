# Publicación semanal autónoma del blog

> Cómo se escribe y publica un artículo cada semana sin que el fundador tenga
> que pedirlo. Este documento es **el encargo**: la rutina semanal despierta
> una sesión nueva que no recuerda nada de conversaciones anteriores, y lo
> único que tiene es este fichero.

Aprobado por el fundador el 2026-08-04. Modelo: **semiautónomo con Human Gate
semanal** — el agente lleva el artículo hasta "verde y listo", el fundador
decide si se publica.

---

## 1. Por qué esto NO es un scheduler del producto

`CLAUDE.md` prohíbe los schedulers en segundo plano sin aprobación explícita.
Esta fase **no añade ninguno**: no toca `vercel.json`, ni `app/api/cron/**`, ni
el runtime. El disparador vive fuera del producto, como una rutina que abre
una sesión de Claude Code igual que si el fundador la abriera a mano.

Consecuencia práctica: **si esto se apaga, el producto no se entera.** No hay
código nuevo que mantener en producción.

---

## 2. Qué hace la sesión semanal, en orden

1. **Lee el estado.** `docs/content-calendar.md` (el ledger),
   `docs/content-strategy.md` (las reglas de redacción) y
   `docs/brand/article-design-system.md` (cómo se compone). Sin leer los tres,
   no empieza.
2. **Elige el tema.** El siguiente hueco pendiente del calendario. Si no hay
   ninguno marcado, consulta al agente `seo-geo-research` para un brief nuevo
   y lo añade al calendario en el mismo PR.
3. **Redacta y compone** con el sistema de diseño. No es prosa plana: la
   receta mínima de su cluster es un test, y no pasa el build sin cumplirla.
4. **Valida**: `pnpm test && pnpm run validate`.
5. **Abre PR** desde una rama propia, con el ledger del calendario actualizado
   en el mismo PR.
6. **Pasa QA** (subagente `qa`) y **el `ux-pilot`**, y **arregla lo que
   encuentren** antes de avisar a nadie.
7. **Para en el Human Gate.** Avisa al fundador en castellano con la URL del
   preview y qué mirar. **No mergea nunca.**

---

## 3. Lo que no puede hacer, pase lo que pase

- **No mergea.** Ni aunque todo esté en verde. El Human Gate es manual.
- **No toca código de producto.** Su diff se limita a `app/blog/**`,
  `lib/blog/**`, `docs/content-calendar.md` y, si hace falta, componentes de
  artículo. Si necesita algo fuera de ahí, para y lo dice.
- **No inventa cifras.** `Stat` no compila sin `source`; una cifra sin fuente
  citable no se publica. Si no encuentra el dato, escribe que no lo hay — eso
  es una respuesta válida y publicable en este blog.
- **No atribuye palabras a nadie** sin la cita textual delante (`PullQuote`,
  `AnswerSample`). Ya se coló una vez, ver el sistema de diseño §1.
- **No presenta como verificado** lo que el pilot no haya visto.

---

## 4. Las portadas — la dependencia manual, dicha sin rodeos

**El agente no puede generar imágenes.** No hay herramienta de generación en
su entorno y el stock exige licencia (ver la enmienda de
`docs/adr/0026-article-imagery-policy.md`).

Y `lib/blog/covers.test.ts` **exige portada a todo artículo nuevo**: la lista
de exentos está congelada y no admite altas. Así que un artículo semanal sin
portada **deja el check en rojo a propósito**.

Esto es deliberado, no un descuido. El fundador señaló el 2026-08-04 que una
portada ausente "parece un icono de algo que no carga bien"; la alternativa
—dejar publicar sin portada— automatizaría exactamente ese defecto una vez por
semana. Un check rojo es una pregunta visible; un degradado con icono es un
defecto invisible.

**Qué hace el agente:** abre el PR igualmente, con el artículo terminado, y
dice en el cuerpo, arriba del todo, que falta la portada y dónde va el
fichero (`public/blog/<slug>/cover.png`). El fundador la deja, el agente la
declara en `lib/blog/posts.ts`, y el check pasa a verde.

**Si algún día hay banco de portadas** en `public/blog/_banco/`, el agente
coge la siguiente sin usar y esta dependencia desaparece.

---

## 5. Cadencia y coste

Una pieza por semana, lunes. `docs/content-strategy.md` §cadencia fija el
ritmo por capa; el Observatorio (capa E) **no entra aquí**: tiene coste real
de escaneos y su propia aprobación pendiente.

Coste de una semana: una sesión de agente. Sin coste de producto, sin
llamadas al pipeline de escaneos, sin tocar Gemini.

---

## 6. Cuándo parar y preguntar en vez de seguir

- Si el tema elegido exige tocar algo fuera de contenido.
- Si la investigación no encuentra evidencia y el artículo quedaría sostenido
  por afirmaciones sin fuente.
- Si el `ux-pilot` devuelve `INCONCLUSIVE` y no se puede verificar.
- Si el calendario está vacío y `seo-geo-research` no devuelve un brief con
  demanda real detrás.

En los cuatro casos: abrir el PR igualmente si hay trabajo aprovechable, pero
decirlo con claridad y **no presentarlo como listo**.
