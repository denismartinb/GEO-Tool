# Task Intake Report · Extensión de Chrome de GenScore (CHROME-EXT-1)

Fecha: 2026-10-25 · Revisión 2 · Estado: **propuesta, sin implementar** · Pide: Denis

Wireframes de las tres opciones: [`ux-options.html`](./ux-options.html)
(se abre en el navegador; es la misma página que el artifact del hilo).

> **Qué cambia en la revisión 2.** Denis (2026-10-25): *"me gustaría que tuviera
> toda la potencia de GenScore: los 4 motores, la parte de SEO con Search Console y
> DataForSEO, e incluso el comercio agéntico"*. La extensión deja de ser una
> auditoría con salida a ChatGPT y pasa a ser **GenScore entero en un panel**, al
> lado de la web que estás viendo. El cambio de fondo que lo hace posible sin
> disparar el coste: la extensión **lee los datos que tu proyecto ya tiene**, no
> lanza escaneos nuevos por cada página.

---

## 0. Resumen

1. La extensión es un canal de captación de genscore.es. Se posiciona en "SEO"
   (donde está la demanda) y enseña lo que nadie más tiene en español: qué dicen
   ChatGPT, Gemini, Claude y Perplexity de tu marca, y si un agente de IA puede
   comprar en tu web.
2. **Tres capas.** Sin cuenta: auditoría SEO, preparación para IA y comercio
   agéntico de la página abierta, calculadas en el navegador. Con cuenta (7 días de
   Pro): todo tu proyecto de GenScore en el panel, con los cuatro motores, Search
   Console, palabras clave de DataForSEO y la Auditoría agéntica. Con plan: lo
   mismo de forma continua, más el análisis de páginas de la competencia.
3. **Recomiendo el panel lateral con la alternativa A, "Estudio".** Una nota,
   tres arreglos y tres carriles plegados (IA, Google y Agentes) que se abren al
   pedirlo, con los cuatro motores dibujados dentro del carril IA. Es la consola
   en pequeño y no abruma (sección 9).
4. **El MVP sigue sin tocar el servidor** y sale en dos fines de semana: las tres
   auditorías locales y un botón que lleva a crear el proyecto con el dominio ya
   escrito. La vista de tu proyecto con los cuatro motores es la fase 2, y es la
   que convierte.
5. Corrijo cuatro premisas del encargo (sección 2).

---

## 1. Qué hace, por capas

| Capa | Qué ve el usuario sobre la página abierta | De dónde sale | Coste por uso |
|---|---|---|---|
| **Sin cuenta** | Nota SEO + IA de 0 a 100, tres correcciones, bots de IA, llms.txt, contenido visible sin JavaScript. En fichas y páginas de precios, la comprobación rápida de comercio agéntico (descubrimiento, comprensión, confianza, compra) | Navegador | 0 |
| **Con cuenta, su dominio** (prueba de Pro y planes) | Pestaña **Tu proyecto**: Puntuación GEO, qué dice cada motor (ChatGPT, Gemini, Claude y Perplexity), competidores que te adelantan, prompts donde no apareces y las tres primeras recomendaciones. Pestaña **Google**: clics, impresiones y búsquedas de esa URL en Search Console, y las palabras que vigilas con su puesto en el Top 20. Pestaña **Agentes**: la Auditoría agéntica del proyecto | El último escaneo y las tablas que ya existen | Lecturas, sin LLM |
| **Con cuenta, otro dominio** | Si no es suyo: "Añadir a GenScore" (crea el proyecto y lanza el primer escaneo, con los motores de su plan). Si es de un competidor que ya sigue: cómo le va a ese rival en cada motor frente a ti | Flujo de alta existente y datos de competidores del escaneo | El del escaneo normal |
| **Pro y Agencia** | "¿Por qué palabras posiciona esta página?" sobre la página de un competidor, con DataForSEO | `lib/seo-tracking/discover.ts` | ~0,012 $ por consulta, dentro de las 5 diarias que ya existen |

Los motores que se ven son los del plan del usuario: cuatro en Pro, Agencia y la
prueba, y tres en Starter (Perplexity se vende con Pro y Agencia, log §283). En
Starter el carril IA enseña Perplexity con la invitación a Pro, nunca con datos
inventados.

Objetivo a 30 días desde la publicación: **200 o más instalaciones y al menos un
cliente de pago atribuido a la extensión**.

Clasificación: **P1 de crecimiento**. No hay ningún P0 abierto que deba ir antes.

---

## 2. Lo que cuestiono del encargo

1. **Los cuatro motores no se consultan en directo por cada página.** Una consulta
   en directo de los cuatro motores por página costaría unas cuatro veces lo que
   cuesta hoy el comprobador (~0,06 $ en vez de ~0,016 $). Además tardaría entre 30
   y 60 segundos y mediría una sola pregunta, que según nuestro propio artículo
   sobre la variabilidad de las listas es poco fiable. La potencia real de GenScore
   está en el escaneo: muchas preguntas, varias veces, en los cuatro motores. Así
   que la extensión **enseña ese escaneo**. El usuario que aún no tiene proyecto lo
   crea en un clic desde el panel. Así la extensión no gasta nada nuevo y lo que
   enseña es la misma cifra que la consola.

2. **No existe la cuenta gratuita** (TRIAL-ONLY-1, log §243). Toda alta empieza con
   7 días de Pro sin tarjeta, que es exactamente la llave de los cuatro motores, de
   Search Console y de la Auditoría agéntica. Es mejor gancho que una cuenta
   gratuita. Al terminar la prueba, la cuenta pasa a solo lectura: el panel sigue
   enseñando el último escaneo y pide plan para actualizarlo.

3. **La nota de la página no es la Puntuación GEO.** TRUST-METRICS-1 (log §183)
   deja una sola Puntuación GEO en todo el producto, y mide respuestas reales de
   los motores. La nota de la página se llama **"Nota SEO + IA de esta página"** y
   usa los pesos de la Auditoría técnica (IA 55, SEO 45, log §275). Con cuenta y en
   tu web, la Puntuación GEO es la de la consola, leída de su único dueño
   (`lib/metrics/run-metrics.ts`).

4. **"ChatGPT" en el título de la ficha puede hacer que la tienda la rechace.**
   Propongo el nombre "GenScore: Auditoría SEO e IA" y nombrar los cuatro motores
   en la descripción (sección 7).

Y una nota de expectativas: **200 instalaciones en 30 días no vienen solas de la
búsqueda de la tienda.** Hay que empujarlas desde el blog, LinkedIn, X y el informe
gratuito (sección 10).

---

## 3. Qué se reutiliza del repo

| Pieza | Fichero | Uso en la extensión | Dónde corre |
|---|---|---|---|
| Comprobaciones on-page | `lib/web-audit/page-checks.ts` | Nota SEO + IA de la página | Navegador (funciones puras) |
| Bloques y pesos | `lib/web-audit/audit-blocks.ts` | Reparto IA 55 / SEO 45 | Navegador, si sus imports son puros |
| Bots de IA | `lib/web-audit/robots.ts` | GPTBot, OAI-SearchBot, Google-Extended, PerplexityBot, ClaudeBot, anthropic-ai, Bingbot | Navegador; **hay que separar** el analizador puro, porque el fichero lleva `server-only` |
| llms.txt | `lib/web-audit/llms-txt.ts` | Borrador si no existe | Navegador |
| Comercio agéntico, página | `lib/agentic-audit/html-signals.ts`, `score.ts`, `interop.ts` | Comprobación rápida en la página abierta | Navegador, revisando que `score.ts` no tenga I/O |
| Puntuación GEO y métricas | `lib/metrics/run-metrics.ts` | Pestaña Tu proyecto | Servidor, solo lectura |
| Recomendaciones | `selectPlan` (el mismo que usa el informe, `report.md`) | Tres primeras acciones | Servidor, solo lectura |
| Competidores | datos del último escaneo | Rivales que te adelantan, por motor | Servidor, solo lectura |
| Search Console | `lib/search-console/load.ts`, `insights.ts` | Pestaña Google, filtrada a la URL abierta | Servidor; caché de 30 min, nada se guarda |
| Seguimiento de palabras | `lib/seo-tracking/view-model.ts` | Palabras vigiladas y su puesto | Servidor; las fotos las paga ya el cron semanal |
| Descubrir palabras | `lib/seo-tracking/discover.ts` | Página de competidor, Pro y Agencia | Servidor, dentro de las 5 diarias |
| Auditoría agéntica | `lib/agentic-audit/console-model.ts` | Pestaña Agentes | Servidor, solo lectura |
| Alta de dominio | `lib/onboarding/pending-domain.ts`, `createProjectCore` | "Añadir a GenScore" con el dominio ya escrito | Web |
| Eventos de embudo | `lib/analytics/funnel-events.ts` | Alta y pago atribuidos | Servidor |
| Atribución | patrón `gs_ref` → `user_metadata` (log §277) | `acquisition_source = extension` | Servidor |

---

## 4. Arquitectura

```
extension/                     carpeta nueva en el repo, fuera de Next
  manifest.json                MV3
  src/background.ts            clic en el icono: abre el panel e inyecta el análisis
  src/analyze.ts               se inyecta en la pestaña (scripting.executeScript)
  src/panel/                   HTML + TS del panel: Página, Tu proyecto, Google, Agentes
  src/score.ts                 nota SEO + IA y comercio agéntico (importa lib/* puros)
  src/api.ts                   llamadas a genscore.es/api/ext/* con el token
  src/telemetry.ts             PostHog por HTTP, sin URLs
```

**La página, sin permisos amplios.** El clic en el icono concede `activeTab` sobre
esa pestaña. El script inyectado:

- lee el DOM pintado (encabezados, `alt`, enlaces, `hreflang`);
- pide `location.href`, `/robots.txt` y `/llms.txt` al mismo origen;
- compara el HTML crudo con el DOM pintado, que es lo que ve un bot de IA que no
  ejecuta JavaScript.

`page-checks.ts` y `html-signals.ts` reciben el HTML crudo, igual que en el
servidor, así que los resultados coinciden con la Auditoría técnica y con el
comprobador agéntico.

**El proyecto, con un único endpoint.** `GET /api/ext/summary?domain=…` resuelve el
proyecto del usuario que cubre ese dominio (`isSameOrSubdomain`). Devuelve la
Puntuación GEO, cada motor, los rivales, los prompts sin mención, las tres
recomendaciones y el estado de la Auditoría agéntica. Todo sale de los cargadores
que ya usa la consola, con el cliente del propio usuario (RLS) y sin service role.
`GET /api/ext/google?url=…` hace lo mismo con Search Console y con las palabras
vigiladas.

**Permisos:** `activeTab`, `scripting`, `sidePanel`, `storage`. Ninguno muestra el
aviso "Leer y cambiar todos tus datos en todos los sitios web". El análisis
automático de cada página se pide después, como `optional_host_permissions`, solo
si el usuario lo activa.

**Riesgo técnico a validar en la primera hora:** que `chrome.action.onClicked`
conceda `activeTab` y abra el panel con `chrome.sidePanel.open({ tabId })` en el
mismo gesto (Chrome 116 o superior). Plan B: un popup que analiza y ofrece "Abrir
en panel".

---

## 5. Cambios de backend por fase

| Cambio | Fase | Migración | Riesgo |
|---|---|---|---|
| Página `genscore.es/extension` (bienvenida, desinstalación, privacidad) | 1 | No | Bajo |
| `extension/` no construye en Vercel (`scripts/vercel-should-build.sh` y sus tests) | 1 | No | Bajo |
| Cookie `gs_src=extension` → `user_metadata.acquisition_source` → Stripe y `payment_completed` | 1 | No | Bajo |
| Entrega de sesión: `/extension/conectar` envía el token de Supabase a la extensión por `externally_connectable` (solo desde genscore.es) | 2 | No | **Medio**: autenticación. Revisión de data-guardian antes |
| CORS en `/api/ext/*` solo para `chrome-extension://<id fijo>` | 2 | No | Medio |
| `/api/ext/summary` (proyecto, motores, rivales, recomendaciones, agéntica), solo lectura | 2 | No | Medio: tiene que dar las mismas cifras que la consola |
| `/api/ext/google` (Search Console de la URL, palabras vigiladas), solo lectura | 3 | No | Medio, hereda `search-console.md` y `seo-tracking.md` |
| `/api/ext/discover` (palabras de una página de competidor), Pro y Agencia | 3 | No (reutiliza `seo_discovery_runs`) | Medio, cuesta dinero |

Ninguna ruta lanza un LLM. Lo único que gasta es lo que ya gastaba: el escaneo del
proyecto (que dispara el alta normal) y "Descubrir", con su tope.

---

## 6. Coste por usuario y Vercel Hobby

| Acción | Coste LLM / API | Carga en Vercel |
|---|---|---|
| Auditoría de la página (SEO, IA, agentes) | 0 | 0, no llama al servidor |
| Tu proyecto, Agentes | 0 nuevo: lee el último escaneo | 1 invocación corta, lectura de base de datos |
| Google | 0 (API gratuita); las fotos del Top 20 ya las paga el cron | 1 invocación; caché de 30 min |
| Descubrir palabras de un competidor | ~0,012 $ por consulta, como mucho 5 al día por cuenta | 1 invocación |
| Añadir a GenScore | El primer escaneo de la prueba, el mismo que hoy | El del escaneo |

**El gasto nuevo de la extensión es casi cero.** Lo que cuesta dinero es que lleguen
más altas, y cada alta escanea igual que si llegara por la web. Ese es el coste que
queremos.

**Hobby:** las lecturas del panel son invocaciones de milisegundos de CPU, y la
parte gratuita no invoca nada. Hay que mirar el panel de Uso de Vercel tras la
primera semana, igual que se hizo con el piloto (log §199). Sigue pendiente lo que
ya anota `docs/environment-contract.md`: Hobby no permite uso comercial, una decisión
tuya anterior a esto.

**Coste fijo:** cuenta de desarrollador de la Chrome Web Store, 5 $ una vez.

---

## 7. Ficha de la tienda

| Campo | Propuesta | Por qué |
|---|---|---|
| Nombre (máx. 75) | **GenScore: Auditoría SEO e IA** | "SEO", "auditoría" e "IA", sin marcas ajenas |
| Alternativa | GenScore: SEO e IA · Auditoría SEO y visibilidad en ChatGPT | La tuya. Más búsquedas por "ChatGPT", más riesgo de rechazo |
| Resumen (máx. 132) | Audita el SEO de cualquier web y mira qué dicen de ella ChatGPT, Gemini, Claude y Perplexity. Nota de 0 a 100 y qué arreglar. | Las tres búsquedas que pediste, con los cuatro motores |
| Categoría | Productividad / Herramientas | Donde está Detailed SEO Extension |
| Capturas | 5, 1280×800: nota de la página, los cuatro motores, Google, comercio agéntico, comparación con un rival | La segunda captura es la que nadie más tiene |
| Idioma | Español; inglés en la misma ficha con `_locales/en` | No hace falta otra extensión |

Primer párrafo de la descripción larga (borrador):

> Abre cualquier web y pulsa GenScore. Ves su nota SEO + IA de 0 a 100, las tres
> correcciones que más la suben, si los bots de ChatGPT, Gemini, Claude y
> Perplexity pueden leerla y si un agente de IA podría comprar en ella. Gratis y sin
> cuenta. Con tu cuenta de GenScore, el panel añade lo que responden los cuatro
> motores sobre tu marca, tus rivales, tus búsquedas en Google y qué hacer primero.

---

## 8. Embudo, registro y bucles

**Valor en el primer clic:** la nota de la página, tres arreglos y los tres
carriles (IA, Google y Agentes) con lo que se lee de la página, incluido qué
motores pueden leerla. Nada que rellenar.

**Momento del registro:** la invitación está visible desde el primer clic (en la
alternativa A, bajo los carriles). Enseña los cuatro logotipos de los
motores y la pregunta *"¿Qué dicen ChatGPT, Gemini, Claude y Perplexity cuando
preguntan por lo que vendes?"*. No enseña cifras de ejemplo. El botón dice *"Mídelo
gratis"* y la promesa es *"7 días de Pro gratis, sin tarjeta"*.

- En el MVP, el botón abre el alta de la web con el dominio ya escrito (el mismo
  arrastre que usa la portada, `pending-domain.ts`) y `utm_source=chrome-extension`.
- Desde la fase 2, al volver a la web con el proyecto creado, el panel se rellena
  solo.

**Momento del pago:** al acabar la prueba el panel sigue enseñando el último
escaneo, con la fecha. "Actualizar" y los datos nuevos de Google piden plan. Es el mismo
muro de solo lectura que la consola.

**Bucles de difusión:**

1. **Compartir la nota** como imagen generada en el navegador. No hay URL pública con
   la nota, así que nadie puede publicar una falsa bajo genscore.es.
2. **Comparar con un competidor.** Abres la web de tu rival y el panel pone su nota
   de página junto a la tuya. Si ya lo sigues en GenScore, añade cómo le va en cada
   motor frente a ti.
3. **Exportar** (fase 4): el informe de GenScore (`/informe/<proyecto>`) ya existe; el
   panel enlaza a él.

**Medición en PostHog** (API de captura por HTTP, porque MV3 no permite código
remoto):

| Evento | Cuándo | Propiedades |
|---|---|---|
| `ext_installed` | `runtime.onInstalled` | versión |
| `ext_analysis_completed` | nota calculada | tramo de nota, si se detectó tienda |
| `ext_lane_opened` | abre un carril | carril (IA, Google, Agentes) |
| `ext_signup_clicked` | botón del registro | sitio desde el que se pulsa |
| `ext_project_viewed` | "Tu proyecto" con datos | plan |
| `ext_share_clicked` / `ext_compare_opened` | bucles | ninguna |
| `signup_completed`, `search_console_connected`, `payment_completed` | ya existen | `acquisition_source = extension` |

**Nunca se envía la URL ni el dominio analizado.** El `distinct_id` es un id
aleatorio de instalación hasta el registro, y después se une al id de usuario. Se
cuenta en `/privacidad` y en las prácticas de privacidad de la tienda.

---

## 9. Opciones de UX (maquetas en `ux-options.html`)

**Contenedor decidido: panel lateral** (`chrome.sidePanel`). Se comparó con un
popup (se cierra solo y no cabe todo GenScore) y con una capa sobre la página
(pide permiso sobre todas las webs). El panel se queda abierto mientras navegas y
mientras te registras, con cuatro permisos. De la capa se rescata "Señalar en la
página" para la fase 4, con el mismo `activeTab`.

Sobre ese panel, tres formas de enseñar los cuatro motores, Google y el comercio
agéntico sin abrumar. Cada una sale de una línea de la consola profesional, y las
tres siguen la misma regla: una respuesta por pantalla y el detalle al pedirlo, con
los tres carriles de la consola (IA azul, Google verde azulado, Agentes ámbar).

| | A. Estudio: una nota y tu plan | B. Mapa: tres carriles, un dibujo cada uno | C. Instrumento: una cosa cada vez |
|---|---|---|---|
| Primera pantalla | Nota, tres arreglos y los tres carriles plegados en una línea | Selector IA · Google · Agentes; en IA, la página en el centro y los cuatro motores alrededor | Una cifra grande y una sola tarjeta con lo siguiente que hacer |
| Cuatro motores sin cuenta | Una línea ("pueden leerla 3 de 4") | Protagonistas: qué rastreador puede leer la página | En la tarjeta que toque |
| Con cuenta | Puntuación GEO, plan de la semana mezclando carriles, motores al abrir IA | Tú en el centro, rivales por cuota de voz, motores en órbita | La baraja es tu plan de la semana; deslizar para marcar como hecho |
| Momento de registro | Hoja con lo que ganas en cada carril | "Ponte en el mapa": el centro vacío | La última carta de la baraja gratuita |
| Esfuerzo MVP / completo | 2 / 6 fines de semana | 2,5 / 7,5 | 2 / 6 |

**Recomendación: A, con el dibujo de los cuatro motores de B dentro del carril
IA y "Comprobar otra vez" de C.** A enseña todo en una pantalla sin abrumar y es
la consola en pequeño (el hilo de la consola profesional recomienda Estudio como
base). El dibujo de B responde a "quiero ver los cuatro motores" desde el primer
clic sin coste, porque cada motor tiene su rastreador y robots.txt dice si puede
leer la página. "Comprobar otra vez" de C hace que la nota suba delante del usuario
al arreglar algo.

Encaje con `UX_BRIEF.md` ("de la visibilidad a la implementación"): cada fallo es
una acción con su efecto en la nota, y el plan de la semana del proyecto es el
mismo de la consola (`selectPlan`), con su enlace.

---

## 10. Fases y MVP

| Fase | Qué entra | Backend | Esfuerzo |
|---|---|---|---|
| **1. MVP** | Panel con la nota, tres arreglos y los carriles IA, Google y Agentes (auditoría local, con qué motores pueden leer la página); invitación con el alta prerrellenada; compartir; comparar notas de página; PostHog; página `/extension`; ficha | Ninguno en rutas existentes | 2 fines de semana |
| **2. Tu proyecto** | Iniciar sesión en el panel; Puntuación GEO, los cuatro motores, rivales, prompts sin mención, tres recomendaciones y Auditoría agéntica del proyecto; "Añadir a GenScore" | `/api/ext/summary`, sesión, CORS | 1,5 fines de semana |
| **3. Google** | Search Console de la URL abierta, palabras vigiladas con su puesto, descubrir palabras de un competidor (Pro y Agencia) | `/api/ext/google`, `/api/ext/discover` | 1,5 fines de semana |
| **4. Pulido** | Señalar en la página, análisis automático opcional, ficha en inglés | Ninguno | 1 fin de semana |

**Calendario del MVP:**

| Cuándo | Qué |
|---|---|
| Fin de semana 1, sábado | Prueba del `activeTab` con el panel; separar el analizador puro de `robots.ts`; paquete `extension/` con esbuild; nota SEO + IA |
| Fin de semana 1, domingo | Pestaña Agentes con las comprobaciones del comprobador agéntico; diseño del panel |
| Fin de semana 2, sábado | Pestaña Tu proyecto (invitación), compartir, comparar, PostHog, `/extension`, atribución |
| Fin de semana 2, domingo | Capturas, ficha, envío a revisión (de 1 a 3 días) |

**Por qué el MVP no incluye todavía los cuatro motores.** La fase 2 toca
autenticación y necesita revisión de data-guardian. Publicar antes la parte que no
toca el servidor nos da instalaciones y datos de embudo mientras se construye.
Mientras tanto, el botón lleva a crear el proyecto, que es donde ya están hoy los
cuatro motores. Si prefieres esperar a lanzar con la fase 2 incluida, son cuatro
fines de semana en total en vez de dos.

**Lanzamiento** (tras la aprobación de la tienda): artículo en el blog, LinkedIn y X,
enlace en todos los artículos que hablan de auditoría y una línea en el informe
gratuito. Todo enlace con `utm_source`.

**Cómo sabremos si funciona a 30 días:** instalaciones, análisis por instalación,
clics en "Mídelo gratis", altas con `acquisition_source = extension` y pagos con la
misma marca. Con supuestos que habrá que medir (la mitad analiza, 1 de cada 10 que
analizan se registra, 1 de cada 10 pruebas paga), 200 instalaciones dan un pago:
alcanzable pero justo.

---

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El clic en el icono no concede `activeTab` con el panel | Prueba en la primera hora; plan B con popup |
| Rechazo por marcas ajenas en el título | Nombre sin marcas ajenas |
| El panel da cifras distintas a la consola | El endpoint usa los cargadores de la consola, nunca recálculos propios; test que compara las dos salidas |
| Starter ve tres motores y espera cuatro | El carril IA enseña Perplexity con invitación a Pro, sin datos inventados |
| Entregar la sesión a la extensión (fase 2) | Solo por `externally_connectable` desde genscore.es, `storage.local`, cerrar sesión, revisión de data-guardian |
| Search Console fuera de nuestra base de datos | El endpoint usa la misma caché de 30 min; la extensión no guarda filas de Google |
| Privacidad | Ninguna URL sale del navegador salvo la que el usuario consulta contra su propio proyecto; política publicada |
| Hobby: uso comercial | Ya anotado; decisión tuya |

---

## 12. Áreas tocadas y prohibidas

- **No toca** escaneo, puntuación, esquema, RLS, Stripe, Gemini ni crons.
- **Fase 2** toca autenticación y CORS, y necesita su propio visto bueno y revisión
  de data-guardian (`CLAUDE.md`).
- **Fase 3** gasta en DataForSEO dentro del tope que ya existe.
- Ningún cron nuevo. Nada sub-diario en `vercel.json`.
- Este PR solo añade documentación en `docs/chrome-extension/`.

---

## 13. Lo que necesito de ti

1. Que elijas una alternativa de UX. Recomiendo la A (Estudio) con los detalles
   de B y C de la sección 9.
2. Que elijas entre lanzar el MVP en dos fines de semana o esperar a la fase 2
   (cuatro en total). Recomiendo lanzar el MVP.
3. El nombre de la ficha. Recomiendo "GenScore: Auditoría SEO e IA".
4. Que abras la cuenta de desarrollador de la Chrome Web Store (5 $) con el correo
   de GenScore. La publicación la confirmas tú.

## 14. Revisión 3: la alternativa A, página a página

Denis se inclina por A y pregunta qué aporta de verdad la extensión. La respuesta,
detallada en [`prototipo-navegable.html`](./prototipo-navegable.html):

- **El valor es por URL, no por proyecto.** La consola dice cómo va tu marca; el
  panel dice qué pasa con la página que tienes delante: para qué preguntas la cita
  la IA, qué búsquedas trae de Google, si un agente puede comprar en ella y qué
  paso del plan le toca.
- **Lo que sólo la extensión puede hacer:** leer la página que el usuario está
  viendo. En la web de un rival o de una revista que cita la IA, comprueba si
  nombra a tus rivales y no a ti. No es un rastreador: lee sólo la pestaña abierta
  y cuando el usuario lo pide. Páginas citadas sigue sin afirmar nada del
  contenido de una URL (`.claude/rules/citations.md`).
- **Cinco tipos de página:** tu web con datos, tu web sin datos («nada que hacer
  aquí»), portada (resumen del proyecto), competidor (cuota de voz y su página
  frente a la tuya por la misma búsqueda), fuente citada (preguntas y si te
  nombra) y cualquier otra web (nota y «Añadir como competidor o proyecto»).
- **Asociación:** sin cuenta, «Sí, es mía» abre el alta con el dominio escrito.
  Al conectar, la extensión baja sólo dominios (proyectos, competidores, fuentes) y
  reconoce cada página por su dominio; una agencia cambia de proyecto sola.
- **«Sigue mis webs» es opcional:** `optional_host_permissions` sólo para tus
  dominios y los de tus rivales. Sin él, el panel se pausa al cambiar de página y
  se lee al pulsar el icono, porque `activeTab` caduca al navegar.
- **Panel o consola:** el panel lee, copia arreglos deterministas, comprueba otra
  vez, marca como hecho, vigila un prompt y añade competidores o proyectos. Todo
  lo que usa un modelo, abarca varias páginas o tiene historial vive en la
  consola. El panel nunca genera texto con IA.
- **Backend nuevo (fase 2):** `GET /api/ext/context` (sólo dominios) y
  `GET /api/ext/page?url=` (citas del último escaneo para esa URL, pasos del plan
  que apuntan a ella, Search Console en vivo con la caché de 30 minutos y filas
  del seguimiento de palabras). Sin migración y sin llamadas a modelos.

## 15. Revisión 4: el mismo flujo que la consola

Denis (2026-10-26) no entendía el flujo de la revisión 3: la pantalla de
«Conectado» parecía añadir webs y rivales por otro camino, «Volver a revisar»
parecía un escaneo nuevo y la llamada a registrarse no estaba clara. Se rehace
así (prototipo en [`prototipo-navegable.html`](./prototipo-navegable.html)), y
**esto sustituye a la sección 14 donde se contradigan**:

- **Sin cuenta:** el panel sólo revisa la página cuando el usuario pulsa el icono.
  Corre en su navegador (lee la página y su robots.txt), no pasa por nuestro
  servidor y no usa IA: coste cero, por mucho que navegue. Navegar sin pulsar no
  hace nada. La llamada dice «¿Quieres saber si ChatGPT, Gemini, Claude y
  Perplexity recomiendan **esta web** y a sus competidores?» con el botón
  «Analizar dominio».
- **Analizar dominio = el alta de la consola.** Registro o entrada como en
  genscore.es, sin distracciones y con la oferta destacada (7 días de Pro sin
  tarjeta y precio fundador). Después, el mismo asistente de nuevo dominio
  (competidores y prompts sugeridos, revisión, primer escaneo), con las mismas
  server actions y los mismos topes.
- **Con cuenta:** el panel es la consola en pequeño. Mismo selector de dominios con
  el mismo tope (1 en Starter, 5 en Pro); al abrir otro dominio tuyo cambia a él.
  En tu dominio, dos pestañas: «Tu dominio» (Visión general: Puntuación GEO, plan
  de la semana, motores del plan, Google, Agentes) y «Esta página» (lo que el
  último escaneo y Search Console dicen de esa URL, más la revisión gratis).
- **Desaparece la pantalla de «Conectado» con la lista de webs.** Competidores y
  fuentes son los que ya tiene el dominio en la consola. En una web ajena, «Analizar
  como dominio» (o, sin hueco, «Mejorar a Pro») y «Añadir como competidor», que
  cuenta contra el mismo tope.
- **No hay escaneos desde la extensión.** Los datos dicen «Datos del escaneo de hoy
  · se actualizan solos cada día» (cada semana en Starter). «Volver a revisar la
  página» sólo vuelve a leer la página en el navegador, y lo dice.
- **Search Console se conecta desde el panel** con la misma conexión de la consola.
- **«Actualizar el panel solo en mis dominios»** queda como opción al pie, con el
  permiso de Chrome limitado a tus dominios de GenScore.

## 16. Revisión 5: diseño de la consola nueva y prueba casi en real (2026-10-27)

Denis pidió usar los elementos y principios de la consola rediseñada
(«Instrumento», versión final del 2026-10-27), dar más información sin gastar
IA y proponer cómo probarla casi en real antes de implementarla. El prototipo
(`prototipo-navegable.html`) se reconstruye con los tokens, los componentes y
los ayudantes de esa consola. El flujo y los límites de la revisión 4 no cambian.

**Orden en cuatro capas**, como la consola:

1. Estado: una cifra con su escala y una frase.
2. Lo que frena: un único aviso naranja (p. ej. «Perplexity no puede leer tu web»).
3. Haz esto: una tarjeta cada vez, con puntos, la acción a mano y deslizar para
   confirmar. En una mejora de la página, deslizar vuelve a leer la página en el
   navegador y la nota sube. En un paso del plan, se marca como hecho y se verá
   en el próximo escaneo. Un objetivo de Google no se marca: se sigue solo.
4. Detalle: IA, Google y Agentes, plegados, de uno en uno.

**Dos formas para la capa 1**, a elegir:

- **Cuadro** (recomendada): dial de 270° con la nota y tres indicadores
  pequeños (IA, Google, Agentes) que abren su detalle. Es el lenguaje del
  «Cuadro claro» que Denis eligió para Agentes.
- **Pila**: número grande con barra de franjas, y los tres carriles como filas
  bajo la tarjeta. Más calmada y más corta.

**Información nueva sin IA.** Desde el navegador: qué motores pueden leer la
página, si responde en las primeras líneas, fecha visible, datos estructurados,
producto, precio y stock, y qué marcas nombra la página abierta. Desde la
cuenta: en qué prompts citan esa URL, sus búsquedas de Search Console, quién va
delante en Google para su palabra (foto semanal de DataForSEO), Puntuación GEO
por motor frente a rivales y Visibilidad agéntica por componente.

**Probarla casi en real.** Recomendación, por pasos:

1. Extensión de prueba instalable desde un .zip en modo desarrollador, con este
   diseño. La revisión de la página es real en cualquier web. La cuenta usa
   datos de ejemplo. No toca producción.
2. La misma, conectada a la cuenta de Denis en la vista previa del PR, sólo
   lectura (dos rutas `GET /api/ext/*`, su propio PR).
3. Publicación oculta en la tienda de Chrome para cinco contactos durante una
   semana.

El paso 1 es implementación (código nuevo en una carpeta propia, sin tocar la
app), así que espera la aprobación de Denis.

> Do you approve this plan? I will not implement until you confirm.
