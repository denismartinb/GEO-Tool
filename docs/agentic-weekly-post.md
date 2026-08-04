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
5. **Empuja la rama** `claude/weekly-post/<slug>`, con el ledger del
   calendario actualizado en el mismo commit. **El nombre de la rama importa**
   — ver §7.
6. **Abre el PR.** Si tiene herramientas de GitHub, lo abre él. Si no las
   tiene, no pasa nada: el workflow de §7 lo abre solo. En los dos casos
   **comprueba que el PR existe** antes de dar nada por hecho.
7. **Pasa QA** (subagente `qa`) y **el `ux-pilot`**, y **arregla lo que
   encuentren** antes de avisar a nadie.
8. **Para en el Human Gate y avisa** (§8). **No mergea nunca.**

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
`docs/adr/0028-article-imagery-policy.md`).

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

**Caso aparte, y más frecuente de lo que parece: el preview no despliega.** La
cuenta de Vercel es gratuita y tiene un tope de 100 deploys al día; el 2026-08-04
la propia PR de la Fase A1 se quedó sin preview por eso. Sin preview no hay
pilot, y sin pilot no hay verificación visual. Eso es un `INCONCLUSIVE`, no un
contratiempo menor: el aviso al fundador debe decir **"el artículo está escrito
y validado, pero nadie lo ha visto renderizado"**, y decir por qué. Presentarlo
como listo sería exactamente el fallo del 2026-08-02 que el pilot existe para
impedir.

---

## 7. Cómo se abre el PR — y por qué la rama se llama así

La Fase A1 dejó un riesgo sin cerrar: al crear la rutina, el sistema avisó de
que las sesiones disparadas podrían correr **sin las herramientas MCP de
GitHub**. Se intentó comprobar el 2026-08-04 y no se pudo — las herramientas de
rutinas exigen una aprobación interactiva que una sesión remota no puede dar.
Eso no resolvió la duda, pero sí la reforzó: **lo que necesita una aprobación
interactiva no está garantizado en una sesión headless.**

La Fase A2 deja de apostar. `.github/workflows/weekly-post-pr.yml` se dispara
al empujar cualquier rama `claude/weekly-post/**` y **garantiza que exista un
PR abierto**, lo haya abierto el agente o no. Es idempotente: si el agente sí
tenía herramientas y ya lo abrió, el workflow lo encuentra y no crea nada.

De ahí dos obligaciones para el agente, que no son cosméticas:

- **La rama se llama `claude/weekly-post/<slug>`.** Fuera de ese prefijo el
  workflow no dispara y no hay red de seguridad.
- **El mensaje del último commit es el PR.** El asunto es el título; el cuerpo
  del mensaje es el cuerpo del PR. Es el único canal por el que el agente
  controla qué dirá el PR si lo abre el workflow. Un commit con asunto y sin
  cuerpo produce un PR mudo — y ahí es donde tiene que ir, arriba del todo,
  que **falta la portada** (§4).
- **Nada de `<...>` sin comillas invertidas en el mensaje del commit.** El
  cuerpo se renderiza como markdown al llegar al PR, así que GitHub se come
  cualquier cosa entre ángulos tomándola por una etiqueta HTML. El smoke del
  2026-08-04 lo demostró: `public/blog/<slug>/cover.png` llegó al PR como
  `public/blog//cover.png`, justo en la línea que avisa de dónde va la
  portada. Escríbelo entre backticks y sobrevive.

---

## 8. El aviso al fundador — tres capas, porque una sola falla en silencio

El fundador pidió enterarse en cuanto haya artículo. El problema de un único
canal es que, cuando el que falla es el propio agente, el aviso muere con él.
Por eso hay tres capas, de más a menos frágil:

1. **Email nativo de GitHub (la que siempre funciona).** El workflow de §7
   asigna el PR al fundador y le pide revisión. Ese email lo manda GitHub, no
   nosotros: no depende de que el agente siga vivo, ni de claves, ni de
   servicios de terceros. Si la sesión semanal se muere justo después de
   empujar la rama, **este aviso llega igual**.
2. **Push a la app de Claude (la del móvil).** Último paso del agente:
   `PushNotification` con una línea —qué artículo, y si hay algo en rojo—.
   Requiere que el Control Remoto esté conectado; si no lo está, no llega y no
   pasa nada, porque la capa 1 ya llegó.
3. **Aviso de fin de rutina (push + email).** Se configura en la propia rutina
   (`notifications: {push: true, email: true}`) y sólo funciona si la rutina
   crea sesión nueva en cada disparo. **Está pendiente de activar** — ver §9.

**Qué tiene que decir el mensaje final del agente**, porque es literalmente lo
que se lee en el móvil y en el email, y un "he terminado" no sirve de nada:

- la **URL del PR** y la **URL del preview de Vercel** (o que no hay preview y
  por qué);
- **qué mirar**, en castellano y en términos de comportamiento, no del diff;
- **qué queda en rojo** — la portada casi siempre (§4);
- **qué no se pudo verificar**, si el pilot no vio algo.

Esto es la misma exigencia que `CLAUDE.md` pone a cualquier Human Gate. Aquí se
repite porque la sesión semanal no recuerda haberla leído.

---

## 9. Lo que sabemos de la sesión disparada, por haberlo mirado

El 2026-08-04 se disparó la rutina a mano y se leyó su configuración real. Esto
no son suposiciones:

**La sesión semanal NO tiene herramientas de GitHub.** Su lista de permisos es
exactamente: `Task, Bash, Glob, Grep, Read, Edit, MultiEdit, Write,
NotebookEdit, WebFetch, TodoWrite, WebSearch, BashOutput, KillBash, Skill,
Tmux, Monitor, SendUserFile, REPL`. Ni un solo `mcp__github__*`. Por eso el
workflow de §7 no es una precaución: **es la única vía por la que el artículo
del lunes puede llegar a ser un PR.**

**Tiene `Bash`**, así que empujar la rama sí está a su alcance. La entrega
depende de eso y del workflow, de nada más.

**Las notificaciones de la rutina están en `{push: true, email: false}`.** La
capa 2 de §8 ya está activa. El email de la rutina está apagado y es
redundante: la capa 1 ya manda uno.

### Por qué existe `.claude/settings.json`

Una sesión disparada un lunes a las 07:00 **no tiene a nadie delante**. Si se
para a pedir permiso para `git push`, se queda ahí hasta que alguien lo vea —
y ese alguien está durmiendo. No es hipotético: el 2026-08-04, una sesión
remota intentó cuatro veces leer la configuración de las rutinas y las cuatro
recibió "requiere aprobación", una aprobación que nadie podía conceder.

`.claude/settings.json` preaprueba lo que la sesión semanal necesita —
`git` de lectura y de entrega, `pnpm install/test/run validate` — para que el
trabajo no dependa de que el fundador esté despierto.

La lista `deny` añade un recordatorio contra el force-push y el push directo a
`main`. **No la trates como una barrera**, y esta redacción es deliberadamente
más dura que la original porque QA (PR #318) demostró que la anterior
prometía de más.

Los patrones casan por **prefijo literal del texto del comando**, no por
sentido de los argumentos. Se escapan, entre otras:

| Comando | ¿Bloqueado? |
|---|---|
| `git push` a secas, estando en `main` | **No** — y es el accidente más probable de todos |
| `git push origin` sin refspec | **No** |
| `git push -u origin main` | **No** — el flag va antes de lo que casa el patrón |
| `git push origin rama --force` | **No** — el flag va al final |
| `git push --force-with-lease` | **No** |

**La barrera real es otra, y está fuera de este fichero:** la rama `main`
está protegida en GitHub (`protected: true`, verificado). Eso es lo que
impide de verdad un push directo; el `deny` sólo evita que la sesión pida
aprobación en los casos más obvios. Quien confíe en esta lista como
protección se llevará una sorpresa.

Y un efecto que conviene saber: `.claude/settings.json` está en la raíz del
repo, así que aplica a **cualquier** sesión contra este repositorio, no sólo
a la de los lunes. Es coherente con el modelo de trabajo (empujar ramas
propias ya es un paso normal), pero no es "sólo para los lunes".

### Lo único que queda fuera del repo

**Settings → Actions → General → Workflow permissions → "Allow GitHub Actions
to create and approve pull requests".** Sin eso, el workflow de §7 falla con
403 y no hay red de seguridad. El propio workflow falla con ese mensaje
escrito, para que no haya que adivinarlo. Activado por el fundador el
2026-08-04.
