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

## 4. Las portadas — el agente las dibuja él, en SVG

**Esta sección decía lo contrario hasta el 2026-08-06.** Decía que el agente no
podía generar imágenes y que un artículo semanal debía dejar el test de portada
en rojo a propósito. Eso ya no es verdad, y dejarlo escrito habría hecho que
cada lunes se entregara un artículo sin portada **pudiendo tenerla**. Si vienes
buscando la versión antigua: está en el histórico, `design-decisions-log.md`
§35.

**Lo que sí es verdad:** el agente no puede generar imágenes de mapa de bits ni
usar stock con licencia. Pero **sí puede escribir un SVG**, que es texto. Y ADR
0028 ya adoptó como fuente principal la **opción 4 — maquetas construidas en
SVG/CSS**: una portada dibujada a mano en el repo no es una excepción a esa
política, es exactamente lo que eligió.

### Cómo se dibuja una portada que no se rompe

Tres portadas se rehicieron dos veces el 2026-08-05 antes de dar con esto. Las
reglas son consecuencia de fallos reales, no preferencias estéticas:

- **`viewBox="0 0 1200 300"`.** No 1200×630. El contenedor real del artículo
  mide 1124×96px en escritorio, y con `object-fit: cover` un lienzo casi
  cuadrado pierde el 84% de su alto.
- **Todo lo que signifique algo va centrado en (600,150).** Es el único punto
  común a las **seis** ventanas de recorte que existen (artículo y tarjeta de
  índice, cada una en escritorio/tablet/móvil). La más agresiva es la tarjeta
  en móvil: 319×170px, que sólo deja ver **563px centrados** de los 1200.
- **Sin texto dentro del SVG.** Es la regla que resuelve el problema de raíz:
  un texto alineado a la izquierda pierde su primera palabra en el recorte
  horizontal, y perseguir la posición correcta falló dos veces seguidas. Sólo
  forma. Lo decorativo (resplandores, elementos de relleno) se abre hacia los
  bordes, donde puede recortarse sin perder nada.
- **Ninguna cifra, ningún gráfico, ninguna maqueta de interfaz.** La enmienda
  de ADR 0028 lo prohíbe explícitamente, y con razón: una portada no tiene pie
  de figura donde citar la fuente, así que un dato ahí queda huérfano aunque
  sea cierto. Los números viven en el `StatGrid` del cuerpo.
- **La portada sigue siendo evidencia, no adorno.** Debe dibujar la tesis del
  artículo. Los tres ejemplos ya publicados están en
  `public/blog/geo-para-{ecommerce,saas-b2b,agencias}/cover.svg`; cópialos como
  punto de partida antes que empezar de cero.

### Cómo se conecta

1. El fichero va en `public/blog/<slug>/cover.svg`.
2. Se declara `coverImage: "/blog/<slug>/cover.svg"` en `lib/blog/posts.ts`.
3. `components/blog/blog-cover.tsx` ya marca `unoptimized` cuando la ruta acaba
   en `.svg` — `next/image` se niega a servir SVG de otro modo, y el flag
   global `dangerouslyAllowSVG` no se activa a propósito.

Con eso `lib/blog/covers.test.ts` queda **en verde**. Un artículo semanal ya no
deja tests rojos, y la lista `COVER_DEBT` sigue congelada: no se añade nada a
ella nunca.

### Verifícalo antes de darlo por bueno

No basta con que el SVG sea válido. Recórtalo a las ventanas reales y **mira el
resultado** — es lo que atrapó los dos fallos anteriores, y ninguna de las dos
veces se habría visto revisando el fichero a ojo:

```python
# cairosvg + PIL, contra las seis ventanas
for w, h in [(1124,96), (712,96), (319,96), (1124,170), (712,170), (319,170)]:
    escala = max(w/1200, h/300)
    # recortar centrado y comprobar que el motivo central sobrevive
```

**Si el `ux-pilot` dice que una portada se ve recortada, créele y mídelo**: dos
veces tuvo razón y dos veces el fallo era invisible desde el código fuente.

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
- **qué queda en rojo**, si es que queda algo — la portada ya no cuenta: el
  agente la dibuja (§4);
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

---

## 10. El recordatorio de GitHub — y por qué no escribe el artículo

**La causa raíz, encontrada el 2026-08-05.** La rutina de claude.ai se disparó
tres veces el 04-08 y no produjo nada. Una rutina de diagnóstico con la tarea
más corta posible (crear rama, un commit, empujar) reveló el motivo: **las
sesiones disparadas arrancan sin el repositorio clonado** — `/home/user` vacío.
No era el encargo, ni los permisos, ni las herramientas de GitHub: no tenían
dónde trabajar. Adjuntar el repo a una rutina **no se puede hacer por API**,
sólo desde la interfaz de claude.ai.

El fundador eligió, ese mismo día, una solución que viviera en GitHub antes que
depender de esa interfaz. De ahí `.github/workflows/weekly-post-reminder.yml`.

**Lo que hace y lo que no**, dicho sin suavizar porque es fácil confundirlo:

- **No escribe el artículo.** GitHub Actions no puede: `CLAUDE.md` declara
  superseded la vía de llamar a la API de Anthropic desde CI, y no se
  reintroduce por la puerta de atrás. Escribir sigue necesitando una sesión.
- **Recuerda.** Cada lunes abre una incidencia con el siguiente tema pendiente
  ya leído del calendario, para que quien se ponga no tenga que decidir nada.
- **Detecta el silencio.** Si esa semana ya existe una rama
  `claude/weekly-post/**`, se calla. Ese es el punto: el fallo del 04-08 no fue
  ruidoso, fue que no pasó nada y nadie se enteró en 16 horas.
- **No se duplica.** Con una incidencia ya abierta, no abre otra. Un
  recordatorio semanal repetido se convierte en ruido, y el ruido se ignora —
  justo lo que esto viene a evitar.

**El coste de esta elección, explícito:** el lunes ya no aparece un artículo
solo. Aparece un aviso de que toca escribirlo. Es un recordatorio fiable en vez
de una automatización rota, y esa es toda la mejora — que no es poca, pero no es
lo que A1 prometía.

**Lo que sí funciona y conviene no olvidar:** una rutina **vinculada a una
sesión existente** (las de check-in de este mismo día) sí ejecuta, porque hereda
el repo de esa sesión. Sólo fallan las de sesión nueva. Si algún día se quiere
volver a intentar la automatización completa, ese es el hilo del que tirar.

## 11. Quién firma un aviso decide si llega — medido el 2026-08-06

Este apartado existe porque se perdieron varias horas persiguiendo un fallo
que no era un fallo, y la conclusión no es deducible sin medirla.

**GitHub no notifica a nadie de su propia actividad.** Las herramientas MCP de
GitHub comentan autenticadas **con la cuenta del fundador**, así que un
comentario escrito por el agente lo firma él mismo — y por tanto **no genera
ningún email**. No es un problema de configuración, ni de spam, ni del
contenido del mensaje: es el emisor.

Medido sobre el PR #351, once comentarios:

| Emisor | Comentarios | ¿Email? |
|---|---|---|
| `denismartinb` (el agente vía MCP) | 5 | **Ninguno** |
| `github-actions[bot]` | 6 | **Todos** |

**Lo que esto significa para la publicación semanal, y es tranquilizador: el
aviso del lunes no está afectado.** El email que importa lo dispara la
*creación del PR* por `weekly-post-pr.yml`, que corre como
`github-actions[bot]`. Ese canal está verificado en vivo — el 2026-08-05 el
correo llegó al minuto exacto de crearse el PR.

**Lo que sí estaba roto** era avisar sobre un PR que **ya existe** (un
recordatorio, un "ya está listo", una corrección). Para eso está
`.github/workflows/notify-founder.yml`: se dispara a mano
(`workflow_dispatch`), recibe el número de PR y el mensaje, y comenta como el
bot. Sin él, la única forma de mandar un email era abrir un PR nuevo.

### La URL de preview no cabe en el cuerpo del PR, y no es culpa de nadie

El cuerpo del PR es el mensaje del último commit, y ese mensaje se escribe
**antes** del push. La URL de Vercel no existe hasta después. Así que el email
del lunes puede llevar, como mucho, una ruta relativa (`/blog/<slug>`) que no
se puede abrir desde el correo.

Pasó el 2026-08-06 con el artículo W4 (PR #359): el fundador recibió el aviso y
no pudo revisarlo. **No intentes resolverlo escribiendo la URL en el commit** —
es imposible, no un descuido.

Lo resuelve `.github/workflows/weekly-post-preview-url.yml`: se dispara con
`deployment_status` (el único evento que trae la URL ya resuelta), comprueba
que la rama es `claude/weekly-post/**`, y comenta el enlace **una sola vez por
PR**. Al firmarlo el bot, genera email.

Lo que tú tienes que hacer al respecto: **nada**. Ya funciona solo. Sólo no te
extrañes de que el enlace llegue en un correo aparte del primero.

**Regla práctica para cualquier sesión futura:** si necesitas que al fundador
le llegue un email, tiene que escribirlo un workflow. Un comentario tuyo por
MCP sólo lo verá si entra a mirar. El `PushNotification` al móvil sí funciona
y es independiente de todo esto.

### Un aviso sobre el diagnóstico equivocado que se llegó a escribir

Ese mismo día se afirmó —aquí y en un PR— que la capa 1 del §8 no podía
funcionar **en absoluto**, razonando que los workflows corren con
`actor: denismartinb`. Es media verdad, y la mitad falsa hizo perder tiempo:

- El **actor del workflow** es el fundador (el push va con sus credenciales),
  pero eso **no** determina la notificación.
- Lo que la determina es **el autor del comentario o del PR**. Un PR creado por
  `GITHUB_TOKEN` lo firma `github-actions[bot]`, y por eso sí notifica.

Si una sesión futura vuelve a ver `actor: denismartinb` en los logs y deduce
que por eso no llegan los emails: la deducción es incorrecta, y la tabla de
arriba es la medición que lo desmiente.
