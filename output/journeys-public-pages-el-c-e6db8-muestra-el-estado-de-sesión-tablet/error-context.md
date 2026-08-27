# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/public-pages.spec.ts >> el cajón móvil de la cabecera pública se abre y muestra el estado de sesión
- Location: tests/pilot/journeys/public-pages.spec.ts:192:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.lp-mobnav').getByTestId('account-chip')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('.lp-mobnav').getByTestId('account-chip')

```

```yaml
- text: Gratis 7 días de Pro −67% Pro 179 € 59 €/mes, 6 meses · hasta 1 sept. −58% Starter 45 € 19 €/mes, 6 meses · hasta 1 sept.
- navigation:
  - link "GenScore":
    - /url: /
    - img "GenScore"
  - button "Abrir menú"
- banner:
  - text: Guía visual
  - heading "¿Qué es el GEO?" [level=1]
  - paragraph:
    - text: GEO significa
    - strong: Generative Engine Optimization
    - text: ": conseguir que tu marca aparezca — y aparezca bien — cuando alguien pregunta a ChatGPT, Gemini o Claude. Aquí lo explicamos en cinco minutos, con los mismos indicadores que verás en GenScore."
  - link "Mide tu visibilidad gratis":
    - /url: /signup
  - link "Leer el blog":
    - /url: /blog
- text: El cambio
- heading "La búsqueda ya no termina en diez enlaces azules" [level=2]
- paragraph: "Cada vez más clientes preguntan directamente a una IA. Y la IA no devuelve una lista de páginas: elabora una respuesta y recomienda marcas por su nombre."
- text: Búsqueda tradicional · SEO mejor crm para pymes Los 10 mejores CRM para pymes en 2026 blog-comparativas.com CRM para pequeñas empresas | Competidor A competidor-a.com Tu marca — CRM sencillo para equipos tumarca.com Compites por la
- strong: posición
- text: ". El usuario elige un enlace. Respuesta generativa · GEO ¿Cuál es el mejor CRM para una pyme? Para una pyme, las opciones más recomendadas son Competidor A, por su ecosistema, y Tu marca, destacada por su sencillez y onboarding rápido. Si buscas precio, Competidor B es una alternativa habitual… Fuentes: tumarca.com, blog-comparativas.com Compites por la"
- strong: mención
- text: . La IA ya ha respondido por ti.
- paragraph: Ejemplo ilustrativo con marcas ficticias.
- text: SEO vs GEO
- 'heading "No es el nuevo SEO: es otra pregunta" [level=2]'
- paragraph: El SEO responde a “¿en qué posición aparezco en Google?”. El GEO responde a “¿qué dice la IA de mi marca cuando alguien busca una solución como la mía?”.
- text: Dónde ocurre SEO · Páginas de resultados de buscadores GEO · Respuestas de ChatGPT, Gemini y Claude Qué optimizas SEO · El ranking de tus URLs GEO · Cómo la IA menciona, compara y cita tu marca Cómo se mide SEO · Posiciones y tráfico GEO · Mención, prominencia, cuota de voz y citas Qué es ganar SEO · El clic hacia tu web GEO · Ser la recomendación dentro de la respuesta
- paragraph: "Un buen SEO sigue ayudando: la IA necesita fuentes fiables. Pero ya no basta — puedes ser primero en Google y no existir en la respuesta de la IA."
- text: Cómo se mide
- 'heading "Del concepto al indicador: el GEO Score" [level=2]'
- paragraph: "La visibilidad en IA no es un sí o un no. GenScore la resume en una puntuación de 0 a 100 que pondera todo lo que decide si te recomiendan: si te nombran, con qué protagonismo, cómo estás frente a tu competencia y si tu web puede ser citada."
- text: 66 GEO Score Así lo verás en tu
- strong: Visión general
- text: Presencia (mención)
- emphasis: ¿La IA nombra tu marca?
- text: 80% Prominencia (posición)
- emphasis: ¿Apareces al principio o de pasada?
- text: 64% Cuota de voz
- emphasis: De todas las menciones, ¿cuántas son tuyas?
- text: 55% Autoridad (citas)
- emphasis: ¿La IA cita tu web como fuente?
- text: 40% Preparación técnica
- emphasis: ¿Puede un motor leer y extraer tu web?
- text: 70%
- paragraph: Datos de ejemplo. Tu panel muestra tus cifras reales.
- text: Presencia Tasa de mención 62%
- paragraph: "De cada 100 respuestas de IA a tus prompts, ¿en cuántas aparece tu marca? Es la señal más básica del GEO: existir en la conversación."
- text: Autoridad Cuota de citas 18%
- paragraph: Qué parte de las URLs que la IA usa como fuente pertenecen a tu dominio. A diferencia de la mención, esta señal sí depende del contenido que publicas.
- text: Competencia Presión competitiva 34%
- paragraph: Porcentaje de prompts donde aparece un competidor y tu marca no. Es el hueco exacto que te están quitando en las respuestas.
- text: Prominencia Posición media de marca 2,4
- paragraph: En qué orden te menciona la IA respecto a tus competidores. No es lo mismo ser la primera recomendación que una alternativa al final.
- paragraph: Valores de ejemplo. Todos estos indicadores viven en la pestaña Visión general de tu panel.
- text: De la teoría a la práctica
- heading "Cada concepto del GEO, una pieza de GenScore" [level=2]
- paragraph: No hace falta ser experto en GEO para hacer GEO. La herramienta convierte la metodología en pasos concretos dentro de tu panel.
- heading "Las preguntas reales de tus clientes" [level=3]
- paragraph: "El GEO no se mide con una búsqueda aislada: se mide con el conjunto de preguntas que tu cliente haría a la IA. GenScore te sugiere y monitoriza ese conjunto."
- text: "En GenScore:"
- strong: Prompts
- heading "Frente a quién te compara la IA" [level=3]
- paragraph: "La IA no responde con tu marca en el vacío: recomienda alternativas. Defines contra quién medirte y GenScore calcula cada métrica frente a ellos."
- text: "En GenScore:"
- strong: Competidores
- heading "Medición repetida, no una foto" [level=3]
- paragraph: Las respuestas de la IA cambian. Cada escaneo lanza tus prompts en los motores de IA y guarda las respuestas reales como evidencia, para ver la evolución.
- text: "En GenScore:"
- strong: Escaneos
- heading "Las fuentes que usa la IA" [level=3]
- paragraph: Cuando la IA responde con búsqueda real, cita URLs. GenScore te muestra qué páginas — tuyas y de terceros — están alimentando las respuestas de tu mercado.
- text: "En GenScore:"
- strong: Páginas citadas
- heading "¿Tu web es citable?" [level=3]
- paragraph: Para que la IA te cite, tu contenido tiene que ser rastreable, claro y estructurado. La auditoría revisa tu web con criterios de citabilidad, no solo de SEO.
- text: "En GenScore:"
- strong: Auditoría web
- heading "Del diagnóstico a la acción" [level=3]
- paragraph: Medir no basta. Cada hallazgo se convierte en una acción priorizada por impacto, esfuerzo y confianza, con la evidencia que la respalda — y la solución generada.
- text: "En GenScore:"
- strong: Recomendaciones
- text: El ciclo completo, de la medición a la mejora Escaneo en motores de IA Evidencia real Recomendación priorizada Solución generada GEO Score sube
- heading "Descubre cómo te ve la IA" [level=2]
- paragraph: Introduce tu dominio y obtén tu GEO Score real en minutos. Gratis, sin tarjeta.
- link "Analiza tu dominio":
  - /url: /signup
- link "Profundiza en el blog":
  - /url: /blog/que-es-geo-generative-engine-optimization
- contentinfo:
  - link "GenScore":
    - /url: /
    - img "GenScore"
  - link "Producto":
    - /url: /#producto
  - link "Qué es GEO":
    - /url: /geo
  - link "Precios":
    - /url: /pricing
  - link "Blog":
    - /url: /blog
  - link "Privacidad":
    - /url: /privacidad
  - link "Términos":
    - /url: /terminos
  - text: © 2026 GenScore · Generative Engine Optimization para empresas y agencias.
- alert
- navigation "Menú":
  - link "GenScore":
    - /url: /
    - img "GenScore"
  - button "Cerrar menú"
  - link "Producto":
    - /url: /#producto
  - link "Cómo funciona":
    - /url: /#como
  - link "Qué es GEO":
    - /url: /geo
  - link "Precios":
    - /url: /pricing
  - link "Blog":
    - /url: /blog
  - button "Iniciar sesión"
  - button "Prueba gratis"
```

# Test source

```ts
  112 | // un estado vacío real, nunca contenido fabricado. Esa garantía sigue viva,
  113 | // pero ya no se ancla a "sectores" — se decide mirando los datos.
  114 | //
  115 | // Hasta GROWTH-3 este test iba clavado a `sectores` porque era el único
  116 | // cluster vacío. Al publicarse su primer artículo la aserción pasó a exigir un
  117 | // placeholder que, correctamente, ya no existe. La lección es la misma que dejó
  118 | // GROWTH-3 en `lib/blog/posts.test.ts`: un test que codifica un ESTADO caduca;
  119 | // uno que codifica la REGLA, no.
  120 | for (const cluster of BLOG_CLUSTERS) {
  121 |   const isEmpty = !Object.values(BLOG_POSTS_BY_CLUSTER).includes(cluster);
  122 |   if (!isEmpty) continue;
  123 | 
  124 |   test(`blog cluster pillar page for an empty cluster shows an honest placeholder, not fake content: ${cluster}`, async ({
  125 |     page
  126 |   }, testInfo) => {
  127 |     const findings = await visitAsUser(page, testInfo, `/blog/${cluster}`, `blog-pillar-${cluster}`);
  128 |     assertPageIsHealthy(findings);
  129 |     await assertCanonical(page, `/blog/${cluster}`);
  130 |     await expect(page.getByText(/todavía no hay artículos/i)).toBeVisible();
  131 |   });
  132 | }
  133 | 
  134 | for (const slug of BLOG_POSTS) {
  135 |   test(`blog post renders and has its own canonical: ${slug}`, async ({ page }, testInfo) => {
  136 |     const findings = await visitAsUser(page, testInfo, `/blog/${slug}`, `blog-${slug}`);
  137 |     assertPageIsHealthy(findings);
  138 |     await assertCanonical(page, `/blog/${slug}`);
  139 |     await expect(page).toHaveTitle(/— GenScore$/);
  140 |     // GROWTH-2 Fase 2.5: every post must link to at least one sibling in its
  141 |     // cluster — the internal-linking rule in docs/content-strategy.md §4.3.
  142 |     await expect(page.locator(".blog-related a").first()).toBeVisible();
  143 |   });
  144 | }
  145 | 
  146 | test("/que-es-genscore renders and has its own canonical", async ({ page }, testInfo) => {
  147 |   const findings = await visitAsUser(page, testInfo, "/que-es-genscore", "que-es-genscore");
  148 |   assertPageIsHealthy(findings);
  149 |   await assertCanonical(page, "/que-es-genscore");
  150 | });
  151 | 
  152 | test("/geo renders and has its own canonical", async ({ page }, testInfo) => {
  153 |   const findings = await visitAsUser(page, testInfo, "/geo", "geo");
  154 |   assertPageIsHealthy(findings);
  155 |   await assertCanonical(page, "/geo");
  156 | });
  157 | 
  158 | /**
  159 |  * FREE-CHECKER-1. Estrictamente de lectura, como el resto de este fichero:
  160 |  * visita la página y comprueba que carga, **nunca pulsa el botón**.
  161 |  *
  162 |  * Y desde la Fase B eso ya no es sólo una convención de alcance: pulsarlo
  163 |  * lanzaría una comprobación real contra ChatGPT, o sea **gastaría dinero y
  164 |  * consumiría una de las tres comprobaciones diarias de la IP del runner** en
  165 |  * cada pasada del piloto, en cada deploy de preview. El journey de escritura
  166 |  * (`--journeys write`) es el único sitio donde eso podría plantearse, y hoy no
  167 |  * está planteado.
  168 |  */
  169 | test("/gratis/aparece-mi-marca-en-chatgpt renders and has its own canonical", async ({ page }, testInfo) => {
  170 |   const findings = await visitAsUser(page, testInfo, "/gratis/aparece-mi-marca-en-chatgpt", "free-checker", {
  171 |     describedAs: "el formulario de dominio y la explicación de qué obtiene el visitante",
  172 |     anyOf: [{ selector: ".lp-hero-form" }]
  173 |   });
  174 |   assertPageIsHealthy(findings);
  175 |   await assertCanonical(page, "/gratis/aparece-mi-marca-en-chatgpt");
  176 | });
  177 | 
  178 | /**
  179 |  * GENSCORE-HEADER-3, a petición del `ux-pilot` (2026-08-12). El barrido de
  180 |  * interacción sólo abre menús en pantallas de consola, así que **el cajón
  181 |  * móvil de la cabecera pública no se fotografiaba nunca**: cuando
  182 |  * GENSCORE-HEADER-2 metió el chip de cuenta ahí dentro, el piloto dio PASS sin
  183 |  * haberlo visto en 375 ni en 768, y quien lo verificó fue el fundador con su
  184 |  * teléfono. Eso es exactamente lo que el piloto existe para no delegar.
  185 |  *
  186 |  * Es también el sitio donde ya se coló un fallo real: el CTA duplicado que
  187 |  * §63 tuvo que corregir vivía justo aquí.
  188 |  *
  189 |  * Sólo corre por debajo de 900px, que es donde `.lp-burger` existe: por encima
  190 |  * el cajón no está en el DOM y el test no tendría nada que abrir.
  191 |  */
  192 | test("el cajón móvil de la cabecera pública se abre y muestra el estado de sesión", async ({
  193 |   page
  194 | }, testInfo) => {
  195 |   const findings = await visitAsUser(page, testInfo, "/geo", "geo-mobile-drawer-source");
  196 |   assertPageIsHealthy(findings);
  197 | 
  198 |   const burger = page.locator(".lp-burger");
  199 |   if (!(await burger.isVisible().catch(() => false))) {
  200 |     test.skip(true, "El cajón sólo existe por debajo de 900px — en escritorio no hay nada que abrir.");
  201 |     return;
  202 |   }
  203 | 
  204 |   await burger.click();
  205 |   const drawer = page.locator(".lp-mobnav");
  206 |   await expect(drawer).toBeVisible();
  207 | 
  208 |   // El piloto entra con sesión, así que aquí abajo va el chip de cuenta y NO
  209 |   // los CTA de alta. Se afirma por `data-testid` en vez de por texto: el
  210 |   // email y el plan de la cuenta piloto pueden cambiar, la existencia del
  211 |   // chip no.
> 212 |   await expect(drawer.getByTestId("account-chip")).toBeVisible();
      |                                                    ^ Error: expect(locator).toBeVisible() failed
  213 |   // `button`, no `link`: los CTA del cajón son <button onClick>, así que
  214 |   // preguntar por un enlace llamado "Prueba gratis" da cero SIEMPRE y la
  215 |   // aserción no podría fallar nunca — que es peor que no tenerla.
  216 |   await expect(drawer.getByRole("button", { name: /Prueba gratis/i })).toHaveCount(0);
  217 | 
  218 |   await captureInteraction(page, testInfo, "geo-mobile-drawer-open");
  219 | });
  220 | 
  221 | test("/privacidad renders and has its own canonical", async ({ page }, testInfo) => {
  222 |   const findings = await visitAsUser(page, testInfo, "/privacidad", "privacidad");
  223 |   assertPageIsHealthy(findings);
  224 |   await assertCanonical(page, "/privacidad");
  225 | });
  226 | 
  227 | test("/cookies renders and has its own canonical", async ({ page }, testInfo) => {
  228 |   const findings = await visitAsUser(page, testInfo, "/cookies", "cookies");
  229 |   assertPageIsHealthy(findings);
  230 |   await assertCanonical(page, "/cookies");
  231 | });
  232 | 
  233 | test("/terminos renders and has its own canonical", async ({ page }, testInfo) => {
  234 |   const findings = await visitAsUser(page, testInfo, "/terminos", "terminos");
  235 |   assertPageIsHealthy(findings);
  236 |   await assertCanonical(page, "/terminos");
  237 | });
  238 | 
  239 | test("/glosario renders and has its own canonical", async ({ page }, testInfo) => {
  240 |   const findings = await visitAsUser(page, testInfo, "/glosario", "glosario");
  241 |   assertPageIsHealthy(findings);
  242 |   await assertCanonical(page, "/glosario");
  243 | });
  244 | 
  245 | // GROWTH-2 Fase 2.6b: each term now has its own page (/glosario/<slug>)
  246 | // instead of only an anchor on the index. Two representative terms, not all
  247 | // 15 — they all render through the same dynamic route/component.
  248 | const GLOSSARY_TERM_SLUGS = ["geo", "geo-score"] as const;
  249 | 
  250 | for (const slug of GLOSSARY_TERM_SLUGS) {
  251 |   test(`glossary term page renders and has its own canonical: ${slug}`, async ({ page }, testInfo) => {
  252 |     const findings = await visitAsUser(page, testInfo, `/glosario/${slug}`, `glosario-${slug}`);
  253 |     assertPageIsHealthy(findings);
  254 |     await assertCanonical(page, `/glosario/${slug}`);
  255 |     // Internal-linking rule (content-strategy.md §4.3): every term page
  256 |     // must link onward to at least one related term/doc/post.
  257 |     await expect(page.locator(".glossary-related a").first()).toBeVisible();
  258 |   });
  259 | }
  260 | 
  261 | test("/comparativas/genscore-vs-otterly renders and has its own canonical", async ({ page }, testInfo) => {
  262 |   const findings = await visitAsUser(
  263 |     page,
  264 |     testInfo,
  265 |     "/comparativas/genscore-vs-otterly",
  266 |     "comparativas-genscore-vs-otterly"
  267 |   );
  268 |   assertPageIsHealthy(findings);
  269 |   await assertCanonical(page, "/comparativas/genscore-vs-otterly");
  270 | });
  271 | 
  272 | test("/comparativas/genscore-vs-peec-ai renders and has its own canonical", async ({ page }, testInfo) => {
  273 |   const findings = await visitAsUser(
  274 |     page,
  275 |     testInfo,
  276 |     "/comparativas/genscore-vs-peec-ai",
  277 |     "comparativas-genscore-vs-peec-ai"
  278 |   );
  279 |   assertPageIsHealthy(findings);
  280 |   await assertCanonical(page, "/comparativas/genscore-vs-peec-ai");
  281 | });
  282 | 
  283 | test("/comparativas/genscore-vs-profound renders and has its own canonical", async ({ page }, testInfo) => {
  284 |   const findings = await visitAsUser(
  285 |     page,
  286 |     testInfo,
  287 |     "/comparativas/genscore-vs-profound",
  288 |     "comparativas-genscore-vs-profound"
  289 |   );
  290 |   assertPageIsHealthy(findings);
  291 |   await assertCanonical(page, "/comparativas/genscore-vs-profound");
  292 | });
  293 | 
  294 | test("/comparativas/alternativas-a-otterly renders and has its own canonical", async ({ page }, testInfo) => {
  295 |   const findings = await visitAsUser(
  296 |     page,
  297 |     testInfo,
  298 |     "/comparativas/alternativas-a-otterly",
  299 |     "comparativas-alternativas-a-otterly"
  300 |   );
  301 |   assertPageIsHealthy(findings);
  302 |   await assertCanonical(page, "/comparativas/alternativas-a-otterly");
  303 | });
  304 | 
  305 | test("/comparativas renders and has its own canonical", async ({ page }, testInfo) => {
  306 |   const findings = await visitAsUser(page, testInfo, "/comparativas", "comparativas-index");
  307 |   assertPageIsHealthy(findings);
  308 |   await assertCanonical(page, "/comparativas");
  309 | });
  310 | 
  311 | test("/comparativas/mejores-herramientas-geo-en-espanol renders and has its own canonical", async ({ page }, testInfo) => {
  312 |   const findings = await visitAsUser(
```