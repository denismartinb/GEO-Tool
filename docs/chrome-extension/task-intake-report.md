# Task Intake Report · Extensión de Chrome SEO + GEO (CHROME-EXT-1)

Fecha: 2026-10-25 · Estado: **propuesta, sin implementar** · Pide: Denis

Wireframes de las tres opciones: [`ux-options.html`](./ux-options.html)
(se abre en el navegador; es la misma página que el artifact del hilo).

---

## 0. Resumen en cinco líneas

1. La extensión es un canal de captación de genscore.es, no un producto aparte.
   Se posiciona en "SEO" (donde está la demanda) y vende el GEO como lo que nadie
   más tiene en español.
2. Todo lo gratuito se calcula **en el navegador**, sobre la página que el usuario
   está viendo: coste de servidor cero y ningún permiso amplio.
3. Recomiendo la **opción B, panel lateral**, que se abre con un clic en el icono y
   sólo pide `activeTab`, `scripting`, `sidePanel` y `storage`.
4. El MVP (dos fines de semana) **no toca el backend**: auditoría local, nota, tres
   correcciones, tarjeta para compartir y salida al comprobador gratuito que ya
   existe en la web. Cuenta, Search Console y DataForSEO van en fases posteriores.
5. Hay cinco premisas del encargo que corrijo abajo (sección 2). La más importante:
   **ya no existe cuenta gratuita**, así que el gancho de registro es la prueba de
   7 días de Pro.

---

## 1. Qué se pide (reformulado)

Una extensión de Chrome (Manifest V3) que, sobre la página abierta:

| Nivel | Qué ve el usuario | Dónde se calcula |
|---|---|---|
| Sin cuenta | Auditoría SEO on-page, preparación para IA, nota de 0 a 100 y las tres correcciones más urgentes | En el navegador |
| Con cuenta | "¿Te recomienda ChatGPT?" para el dominio, con el comprobador que ya existe | Servidor, con sus límites y su techo de gasto |
| De pago | Search Console de esa página, palabras clave de DataForSEO, enlace al informe y a la consola | Servidor, reutilizando lo que ya existe |

Objetivo a 30 días desde la publicación: **200 o más instalaciones y al menos un
cliente de pago atribuido a la extensión**.

Clasificación: **P1 de crecimiento**. No hay ningún P0 abierto que esto bloquee o
que deba ir antes (el flujo principal funciona en producción).

---

## 2. Lo que cuestiono del encargo

1. **"Con cuenta gratuita" no existe.** Desde TRIAL-ONLY-1 (log §243) no hay plan
   Free: toda alta empieza con 7 días de Pro sin tarjeta y después la cuenta queda en
   solo lectura. Es un gancho mejor que una cuenta gratuita, así que la promesa del
   registro pasa a ser *"7 días de Pro gratis, sin tarjeta"*. Lo que la extensión hace
   sin cuenta sigue siendo gratis para siempre.

2. **La nota única no puede llamarse "Puntuación GEO".** TRUST-METRICS-1 (log §183)
   deja una sola Puntuación GEO en todo el producto, y mide respuestas reales de los
   motores, no el HTML de una página. La extensión enseña una nota distinta, que
   propongo llamar **"Nota SEO + IA de esta página"**. Se construye con los pesos que
   ya usa la Auditoría técnica (`lib/web-audit/page-checks.ts`: bloque IA 55 puntos,
   bloque SEO 45, log §275) más las comprobaciones nuevas de la extensión con peso
   documentado. Así un usuario que ve 62 en la extensión y entra en la consola no se
   encuentra otro número contradictorio para lo mismo.

3. **"¿Te cita ChatGPT?" sin segunda ruta que gaste.** De acuerdo con no abrir otra
   ruta anónima. Pero la ruta actual (`app/api/gratis/comprobar`) cuenta por IP y no
   por persona. Para usarla desde la extensión con cuenta propongo **la misma ruta y
   el mismo `runPublicCheck`**, que además acepte una sesión: si llega con sesión,
   cuenta por usuario; si no, por IP, como hoy. Las filas de la extensión llevan su
   propia marca (`engine = "extension"`) y su propio subtecho, para que la extensión
   no se coma el techo diario del comprobador de la web. El techo global de gasto
   sigue siendo uno y sigue fallando cerrado.

4. **DataForSEO aporta poco sobre la web propia de una pyme.** El diagnóstico real de
   genscore.es (2026-10-18) mostró que Labs apenas conoce webs pequeñas: para tu
   propia página, Search Console ya da las búsquedas reales y gratis. Donde
   DataForSEO sí vale es en **la página de un competidor** ("¿por qué palabras
   posiciona esta página de mi rival?"). Propongo ese uso, solo en Pro y Agencia, con
   tope diario por cuenta, y dejarlo para la fase 4.

5. **"ChatGPT" en el nombre de la ficha es un riesgo de rechazo.** La política de la
   Chrome Web Store sobre marcas de terceros y metadatos engañosos ha retirado
   extensiones con nombres de productos ajenos en el título. Propongo el nombre sin
   marcas ajenas y las marcas en la descripción, donde describen compatibilidad (ver
   sección 7). Si prefieres arriesgar con "ChatGPT" en el título, se puede: el peor
   caso es un rechazo en revisión y volver a enviar, no una sanción.

Además, una nota de expectativas: **200 instalaciones en 30 días no van a venir solas
de la búsqueda de la tienda.** Una extensión nueva, sin reseñas, sale poco en los
resultados las primeras semanas. Hay que empujarla con canales propios (blog,
LinkedIn, X, correos, informe gratis), y el plan de lanzamiento de la sección 9 lo
cuenta.

---

## 3. Qué se reutiliza del repo

| Pieza | Fichero | Uso en la extensión | ¿Se puede llevar al navegador? |
|---|---|---|---|
| Comprobaciones on-page | `lib/web-audit/page-checks.ts` | Metadatos, datos estructurados, indexabilidad, contenido citable, frescura, SEO de página | **Sí**: son funciones puras sobre HTML, sin I/O ni `server-only` |
| Bloques y pesos | `lib/web-audit/audit-blocks.ts` | Reparto IA 55 / SEO 45 de la nota | Sí, si sus imports son puros (comprobar en la fase 1) |
| Bots de IA en robots.txt | `lib/web-audit/robots.ts` (`resolveBotAccess`, `TRACKED_BOT_AGENTS`) | GPTBot, OAI-SearchBot, Google-Extended, PerplexityBot, ClaudeBot, anthropic-ai, Bingbot | **Hay que separar** el analizador puro: el fichero lleva `server-only` |
| llms.txt | `lib/web-audit/llms-txt.ts` | Si no existe, ofrecer un borrador con `buildLlmsTxt` | Sí, es puro |
| Señales de compra | `lib/agentic-audit/html-signals.ts` | Futuro: "¿pueden comprar aquí los agentes?" en fichas de producto | Sí, es puro |
| Comprobador de ChatGPT | `app/api/gratis/comprobar`, `lib/free-checker/*` | Fase 2, con sesión | No, servidor. Se reutiliza tal cual |
| Search Console | `lib/search-console/load.ts`, `connection.ts`, `insights.ts` | Fase 3: clics, impresiones y búsquedas de la URL abierta | No, servidor. Caché de 30 min, nada se guarda |
| DataForSEO | `lib/seo-data/dataforseo.ts`, `lib/seo-tracking/discover.ts` | Fase 4: palabras de una página de competidor | No, servidor. Tope diario como `seo_discovery_runs` |
| Eventos de embudo | `lib/analytics/funnel-events.ts` | Alta y pago atribuidos a la extensión | Servidor; la extensión usa la API de captura de PostHog |
| Atribución | cookie `gs_ref` y `user_metadata.referral_code` (AFFILIATES-1, log §277) | Mismo patrón para `acquisition_source = extension` | Servidor |
| Marca | `--brand-*` de `app/globals.css`, Figtree, Bricolage Grotesque | Estilo del panel | Sí, se copian los tokens |

Lo que **no** se reutiliza: los componentes React de la consola. El panel es una
página pequeña de extensión y meterle React y la hoja de estilos de la consola
multiplicaría el tamaño del paquete. Propongo HTML y TypeScript sin framework para el
MVP, con los mismos tokens de color y las mismas fuentes.

---

## 4. Arquitectura propuesta

```
extension/                     (carpeta nueva en el repo, fuera de Next)
  manifest.json                MV3
  src/background.ts            service worker: clic en el icono, abre el panel, inyecta el análisis
  src/analyze.ts               se inyecta en la pestaña con scripting.executeScript
  src/panel/                   HTML + TS del panel lateral
  src/score.ts                 nota SEO + IA (importa lib/web-audit/* puros)
  src/telemetry.ts             PostHog por HTTP, sin URLs
```

**Cómo analiza sin permisos amplios.** Al pulsar el icono, Chrome concede
`activeTab` sobre esa pestaña. El service worker abre el panel y ejecuta `analyze.ts`
dentro de la página. Desde ahí:

- lee el DOM ya pintado (encabezados, imágenes sin `alt`, enlaces, `hreflang`);
- pide `location.href`, `/robots.txt` y `/llms.txt` **al mismo origen**, sin CORS ni
  permisos de host;
- compara el texto del HTML crudo con el del DOM pintado. Esa diferencia es lo que
  ve un bot de IA que no ejecuta JavaScript, y es la comprobación de "contenido
  renderizado en servidor o solo en cliente".

Las funciones de `page-checks.ts` reciben el **HTML crudo**, que es justo lo que leen
los bots. Es más fiel que leer el DOM y es la misma entrada que usa hoy la Auditoría
técnica, así que los resultados coinciden.

**Permisos del MVP:** `activeTab`, `scripting`, `sidePanel`, `storage`. Ninguno de
los cuatro muestra el aviso "Leer y cambiar todos tus datos en todos los sitios web".
Analizar solo cada página nueva, sin pulsar el icono, requiere ese permiso: se pide
**después**, como `optional_host_permissions`, cuando el usuario active
"Analizar automáticamente", nunca al instalar.

**Riesgo técnico a validar en la primera hora:** que el clic en el icono conceda
`activeTab` y abra el panel en el mismo gesto. El diseño seguro es
`chrome.action.onClicked` (que sí concede `activeTab`) y dentro
`chrome.sidePanel.open({ tabId })` (Chrome 116 o superior). Si falla, el plan B es
un popup que hace el análisis y ofrece "Abrir en panel".

---

## 5. Cambios de backend (por fase, ninguno en el MVP)

| Cambio | Fase | Migración | Riesgo |
|---|---|---|---|
| Página `genscore.es/extension` (bienvenida, desinstalación, privacidad) | 1 | No | Bajo |
| Saltar el build de Vercel cuando sólo cambia `extension/` (`scripts/vercel-should-build.sh` y sus tests) | 1 | No | Bajo |
| Cookie de origen `gs_src=extension` → `user_metadata.acquisition_source` → metadatos de Stripe y propiedad en `payment_completed` | 1 | No | Bajo, mismo patrón que `gs_ref` |
| Entregar la sesión a la extensión: página `/extension/conectar` que, con sesión iniciada, envía el token de Supabase a la extensión por `externally_connectable` (solo desde genscore.es) | 2 | No | **Medio**: es autenticación. Revisión de data-guardian antes de construir |
| CORS en `/api/ext/*` solo para el origen `chrome-extension://<id fijo>` | 2 | No | Medio |
| `/api/gratis/comprobar` acepta `Authorization: Bearer`; con sesión cuenta por usuario, con subtecho propio (`engine = "extension"`) | 2 | No (el usuario se cuenta en la columna de hash, con prefijo propio) o sí, si prefieres una columna `user_id` limpia | Medio, es la ruta que gasta |
| `/api/ext/google?url=…`: busca el proyecto del usuario que cubre ese dominio, lee Search Console con la caché existente y filtra por URL | 3 | No | Medio, hereda las reglas de `search-console.md` |
| `/api/ext/keywords?url=…` (DataForSEO, solo Pro y Agencia, tope diario) | 4 | Probablemente no, si se reutiliza `seo_discovery_runs` | Medio, cuesta dinero |

Todas las rutas nuevas filtran por el usuario verificado (`requireUser` sobre el
token), sin service role salvo donde ya lo usa la pieza reutilizada.

---

## 6. Coste por usuario y límites de Vercel Hobby

| Acción | Coste LLM / API | Carga en Vercel |
|---|---|---|
| Análisis de página (gratis, sin cuenta) | 0 | **0**: no llama al servidor |
| Compartir nota o comparar | 0 | 0 en el MVP (imagen generada en el navegador) |
| "¿Te recomienda ChatGPT?" | ~0,016 $ por comprobación (medido en `rate-limit.ts`) | 1 invocación, casi todo espera de red |
| Search Console | 0 (API de Google gratuita) | 1 invocación; con caché de 30 min |
| DataForSEO, página de competidor | ~0,012 $ por consulta (Labs, medido 2026-10-18) | 1 invocación |

**Peor caso de gasto LLM:** el techo global actual, 300 comprobaciones al día, unos
145 $/mes si se agota todos los días. Propongo que la extensión tenga un subtecho de
100 al día **dentro** de esos 300, no encima. Con 3 comprobaciones por usuario y día,
el coste por usuario activo es como mucho ~1,5 $/mes, y lo normal es una sola
comprobación por dominio.

**Hobby:** la cuenta volvió a Hobby el 2026-10-25. Lo que más pesa en Hobby son el
CPU activo y las invocaciones del mes. La espera a la respuesta de un LLM no cuenta
como CPU activo, y la parte gratuita no invoca nada. Aun en el peor caso (el techo
entero de la extensión todos los días, unas 3.000 comprobaciones al mes) la carga es
pequeña frente a lo que ya hacen los escaneos. Hay que mirar el panel de Uso de
Vercel tras la primera semana, igual que se hizo con el piloto (log §199). Y queda
pendiente lo que ya está anotado en `docs/environment-contract.md`: **Hobby no
permite uso comercial**. Eso es anterior a esta extensión y es tu decisión.

**Coste fijo:** cuenta de desarrollador de la Chrome Web Store, 5 $ una vez.

---

## 7. Ficha de la tienda

| Campo | Propuesta | Por qué |
|---|---|---|
| Nombre (máx. 75) | **GenScore: Auditoría SEO e IA** | Contiene "SEO", "auditoría" e "IA", sin marcas ajenas en el título |
| Alternativa | GenScore: SEO e IA · Auditoría SEO y visibilidad en ChatGPT | La tuya. Más tráfico por "ChatGPT", más riesgo de rechazo |
| Resumen (máx. 132) | Audita el SEO de cualquier web y mira si está lista para ChatGPT, Gemini y Perplexity. Nota de 0 a 100 y qué arreglar primero. | Las tres búsquedas que pediste, con las marcas como compatibilidad |
| Categoría | Herramientas para desarrolladores no; **Productividad / Herramientas** | Donde está Detailed SEO Extension |
| Capturas | 5, 1280×800: nota, correcciones, bots de IA, comparación, informe | La primera captura es la nota sobre una web conocida |
| Idioma | Español primero; inglés en la misma ficha con `_locales/en` | La tienda localiza una sola extensión: no hace falta otra. El inglés, cuando el español convierta |

Primer párrafo de la descripción larga (borrador):

> Abre cualquier web y pulsa GenScore. En segundos ves su nota SEO + IA de 0 a 100,
> las tres correcciones que más suben esa nota y si ChatGPT, Gemini, Claude y
> Perplexity pueden leerla: bots de IA en robots.txt, llms.txt, datos estructurados
> y contenido que se ve sin JavaScript. Gratis y sin cuenta.

---

## 8. Embudo, momento del registro y bucles

**Valor en el primer clic:** la nota sale sin cuenta, sin formulario y sin pantalla
de bienvenida. La página `genscore.es/extension/bienvenida` se abre al instalar con
una sola instrucción ("Abre cualquier web y pulsa el icono") y nada que rellenar.

**Momento del registro:** justo después de ver la nota y las tres correcciones, la
siguiente tarjeta es *"¿Te recomienda ChatGPT cuando preguntan por lo que vendes?"*.
Es la pregunta que la nota abre y no contesta, porque la nota habla de la página y
esta pregunta habla de las respuestas de la IA. El botón dice *"Compruébalo gratis"*
y la promesa de la cuenta es *"7 días de Pro gratis, sin tarjeta"*. En el MVP ese
botón lleva al comprobador de la web (`/gratis/aparece-mi-marca-en-chatgpt?d=dominio`) con
`utm_source=chrome-extension`, que ya funciona y ya acaba en el registro. Desde la
fase 2 la comprobación sale dentro del panel, con la cuenta.

**Bucles de difusión:**

1. **Compartir la nota.** Tarjeta de imagen generada en el navegador (dominio, nota,
   tres barras, marca GenScore y `genscore.es/extension`), lista para LinkedIn o X.
   No se guarda nada en el servidor, así que nadie puede publicar una nota falsa
   bajo nuestra URL.
2. **Exportar la auditoría.** Página imprimible de la extensión con marca GenScore,
   para que una agencia la mande a su cliente. Cada exportación lleva el enlace a la
   extensión.
3. **Comparar con un competidor.** La extensión recuerda las últimas webs analizadas
   (en `storage.local`, nunca en el servidor) y pone dos lado a lado. "Tu rival
   tiene 71 y tú 48" es la frase que hace instalar a un segundo usuario del mismo
   equipo.

**Medición en PostHog** (API de captura por HTTP, sin `posthog-js`, porque MV3 no
permite código remoto):

| Evento | Cuándo | Propiedades |
|---|---|---|
| `ext_installed` | `runtime.onInstalled` | versión |
| `ext_analysis_completed` | nota calculada | rango de nota (0-39, 40-69, 70-100), si es la web propia (no) |
| `ext_fix_opened` | abre una corrección | clave de la comprobación |
| `ext_share_clicked` / `ext_export_clicked` / `ext_compare_opened` | bucles | ninguna |
| `ext_signup_clicked` | botón del registro | posición |
| `signup_completed` | ya existe | `acquisition_source = extension` |
| `search_console_connected` | ya existe en el flujo | idem |
| `payment_completed` | ya existe (webhook de Stripe) | idem |

**Nunca se envía la URL ni el dominio analizado.** El `distinct_id` es un id aleatorio
de instalación hasta el registro, y después se une al id de usuario con `$identify`.
Esto hay que contarlo en `/privacidad` y en la sección de prácticas de privacidad de
la tienda.

---

## 9. Opciones de UX (detalle y wireframes en `ux-options.html`)

| | A. Popup compacto | B. Panel lateral | C. Capa sobre la página |
|---|---|---|---|
| Cómo se abre | Clic en el icono, ventana de 380 px que se cierra al hacer clic fuera | Clic en el icono, panel fijo a la derecha que sigue abierto al navegar | Insignia flotante en la esquina de cada web; al pulsarla se despliega la capa y señala los fallos sobre la propia página |
| Permisos al instalar | 3 | 4 | Todos los sitios web (aviso fuerte) |
| Espacio para fases 3 y 4 | Poco | Mucho | Medio, y tapa la web |
| Bucle viral | Compartir | Compartir, exportar, comparar | El más visible: se ve en capturas y en directos |
| Revisión en la tienda | Rápida | Rápida | Más lenta, por el permiso amplio |
| Esfuerzo MVP | 1 fin de semana | 1,5 a 2 | 2 a 3 |
| Esfuerzo completo | 3 | 4 a 5 | 5 a 6 |

**Recomendación: B, panel lateral.** Tiene el permiso mínimo de A y el espacio que
piden las fases de pago: Search Console y palabras clave son tablas, y en un popup
de 380 px que se cierra solo no se leen. El panel sigue abierto mientras el usuario
navega por su web, que es como trabaja un consultor SEO. De C me quedo con lo mejor
sin su coste: un botón **"Señalar en la página"** dentro del panel que, con el mismo
`activeTab`, marca sobre la web las imágenes sin `alt` y los encabezados mal
ordenados. Se queda fuera del MVP.

Cómo encaja con `UX_BRIEF.md`: el brief pide "de la visibilidad a la
implementación", no un informe pasivo. Por eso cada fallo del panel se escribe como
una acción ("Añade una descripción de 140 a 160 caracteres") con su efecto en la nota
("+6 puntos"), igual que la Auditoría técnica, y no como una lista de avisos rojos.

---

## 10. MVP de 1 o 2 fines de semana (opción B recortada)

**Entra:**

- Panel lateral que analiza la pestaña al pulsar el icono.
- Nota SEO + IA con las comprobaciones de `page-checks.ts` más cinco nuevas: bots de
  IA en robots.txt, llms.txt, contenido visible sin JavaScript, imágenes sin `alt` y
  orden de encabezados.
- Tres correcciones con su efecto en la nota; la lista completa, plegada.
- Tarjeta "¿Te recomienda ChatGPT?", que lleva al comprobador de la web.
- Compartir como imagen y comparar las dos últimas webs analizadas.
- Eventos de PostHog sin URL.
- Página `genscore.es/extension` (bienvenida y privacidad) y la cookie de origen
  para atribuir el pago.
- Ficha de la tienda en español con cinco capturas.

**No entra:** cuenta dentro de la extensión, comprobación dentro del panel, Search
Console, DataForSEO, exportación imprimible, "Señalar en la página", inglés.

**Calendario:**

| Cuándo | Qué |
|---|---|
| Fin de semana 1, sábado | Prueba del `activeTab` con el panel; separar el analizador puro de `robots.ts`; paquete `extension/` con esbuild; análisis y nota |
| Fin de semana 1, domingo | Panel con el diseño aprobado, tres correcciones, tarjeta ChatGPT |
| Fin de semana 2, sábado | Compartir, comparar, PostHog, página `/extension`, cookie de origen |
| Fin de semana 2, domingo | Capturas, ficha, envío a revisión (suele tardar de 1 a 3 días) |

**Lanzamiento** (fuera del código, tras la aprobación de la tienda): artículo en el
blog con enlace a la tienda, publicación en la página de LinkedIn y en X, enlace en
todos los artículos del blog que hablan de auditoría, y una línea en el informe
gratuito. Todo enlace con `utm_source`.

**Cómo sabremos si funciona a 30 días:** instalaciones (tienda), análisis por
instalación (PostHog), clics en el registro, altas con `acquisition_source =
extension` y pagos con esa misma marca. Con supuestos que habrá que medir (la mitad
de los que instalan analizan, 1 de cada 10 que analizan se registra, 1 de cada 10
pruebas paga), 200 instalaciones dan un pago. El objetivo es alcanzable pero justo, y
depende más del empuje de los canales propios que de la tienda.

---

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El clic en el icono no concede `activeTab` con el panel | Prueba en la primera hora; plan B con popup |
| Rechazo en la tienda por marcas ajenas en el título | Nombre sin marcas ajenas (sección 7) |
| La nota de la extensión contradice la de la consola | Mismos pesos que la Auditoría técnica, nombre distinto de la Puntuación GEO |
| La extensión agota el techo del comprobador de la web | Subtecho propio dentro del techo global |
| Entregar la sesión a la extensión (fase 2) | Solo por `externally_connectable` desde genscore.es, `storage.local`, botón de cerrar sesión, revisión de data-guardian |
| Tarjeta compartida con una nota falsa | Imagen generada en local, sin URL pública con la nota |
| Privacidad (la extensión ve páginas visitadas) | No sale ninguna URL; todo el análisis es local; política en `/privacidad` |
| Hobby: uso comercial | Ya anotado en el contrato de entorno; decisión tuya |

---

## 12. Áreas tocadas y prohibidas

- **No toca** escaneo, puntuación, esquema, RLS, Stripe, Gemini ni crons.
- **Fase 2** toca autenticación y CORS: necesita su propio visto bueno y la revisión
  de data-guardian, como pide `CLAUDE.md`.
- **Fase 4** gasta en DataForSEO: necesita su visto bueno con el tope escrito.
- Ningún cron nuevo. Nada sub-diario en `vercel.json`.
- Este PR solo añade documentación en `docs/chrome-extension/`.

---

## 13. Fase segura por la que empezaría

**Fase 1 = MVP de la sección 10.** No cambia ninguna ruta del servidor que ya
existe, no gasta un euro por usuario y no pide permisos amplios. Si a los 30 días
no llega a 200 instalaciones, habremos gastado dos fines de semana y 5 $, y sabremos
qué falla mirando el embudo de PostHog. Si llega, la fase 2 (cuenta y comprobación
dentro del panel) es la que más mueve el pago.

Antes de construir necesito de ti:

1. Que elijas una opción de UX (recomiendo B).
2. El nombre de la ficha (recomiendo "GenScore: Auditoría SEO e IA").
3. Que des de alta la cuenta de desarrollador de la Chrome Web Store (5 $) con el
   correo de GenScore. La publicación la tienes que confirmar tú.

> Do you approve this plan? I will not implement until you confirm.
