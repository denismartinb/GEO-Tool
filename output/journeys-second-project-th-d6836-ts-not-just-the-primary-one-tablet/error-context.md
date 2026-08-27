# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/second-project.spec.ts >> the position screens render on other projects, not just the primary one
- Location: tests/pilot/journeys/second-project.spec.ts:45:5

# Error details

```
Error: Pilot account has no project to inspect. Seed the pilot account with a project that already has completed scans, or set PILOT_PROJECT_ID.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - img "GenScore" [ref=e5]
      - generic [ref=e9]: Bienvenido de nuevo
      - generic [ref=e10]: Accede a tu panel y sigue mejorando tu visibilidad en IA.
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: Email de trabajo
          - textbox "Email de trabajo" [ref=e14]:
            - /placeholder: nombre@empresa.com
        - generic [ref=e15]:
          - generic [ref=e16]:
            - generic [ref=e17]: Contraseña
            - link "¿Olvidaste tu contraseña?" [ref=e18] [cursor=pointer]:
              - /url: /forgot-password
          - generic [ref=e19]:
            - textbox "Contraseña" [ref=e20]
            - button "Mostrar contraseña" [ref=e21] [cursor=pointer]
        - button "Iniciar sesión" [ref=e25] [cursor=pointer]
      - generic [ref=e26]: o continúa con
      - button "Continuar con Google" [ref=e29] [cursor=pointer]
      - generic [ref=e35]:
        - text: ¿No tienes cuenta?
        - link "Regístrate" [ref=e36] [cursor=pointer]:
          - /url: /signup
      - generic [ref=e37]: Al continuar, aceptas nuestros Términos y la Política de privacidad.
  - alert [ref=e38]
```

# Test source

```ts
  878  |      *
  879  |      * Turn it on when the interaction reveals something TALLER than the fold,
  880  |      * where the viewport frame cuts off the very thing being verified — e.g.
  881  |      * the generated llms.txt, whose five publishing steps sit below the file
  882  |      * block and were invisible in every capture of the first run.
  883  |      */
  884  |     fullContent?: boolean;
  885  |   } = {}
  886  | ): Promise<string> {
  887  |   const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  888  |   mkdirSync(SCREENS_DIR, { recursive: true });
  889  |   if (opts.fullContent) await captureFullContent(page, screenshot);
  890  |   // `animations: "disabled"` finishes running CSS animations and pins them to
  891  |   // their end state. Without it a capture taken right after a reveal catches
  892  |   // the element mid-fade: the notifications panel (`menuIn`, opacity 0→1 over
  893  |   // 140ms) was photographed half-transparent with the page bleeding through,
  894  |   // and a reviewing agent read that as a real rendering defect (2026-08-05).
  895  |   // Every popover, menu and drawer in the suite was subject to the same lie.
  896  |   else await page.screenshot({ path: screenshot, animations: "disabled" });
  897  |   await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
  898  |     path: screenshot,
  899  |     contentType: "image/png"
  900  |   });
  901  |   return screenshot;
  902  | }
  903  | 
  904  | /**
  905  |  * Asserts a revealed element is not just "visible" to Playwright but actually
  906  |  * legible to a human: fully inside the viewport horizontally, and not clipped
  907  |  * by an ancestor's `overflow: hidden`.
  908  |  *
  909  |  * Why this exists: `expect(bubble).toBeVisible()` passed for a KPI tooltip
  910  |  * that was rendering half-cut behind its own card (`overflow: hidden` on the
  911  |  * parent). The assertion was green and the UX was broken — only looking at
  912  |  * the capture caught it (founder, 2026-08-02: "no solo pruebe que sale, sino
  913  |  * que sale bien"). That class of defect is mechanically detectable, so it
  914  |  * belongs in an assertion rather than in a human's judgement.
  915  |  */
  916  | export async function assertFullyVisible(
  917  |   page: Page,
  918  |   selector: string,
  919  |   description: string
  920  | ): Promise<void> {
  921  |   const geometry = await page.locator(selector).first().evaluate((node: Element) => {
  922  |     const rect = node.getBoundingClientRect();
  923  |     let clippedBy: string | null = null;
  924  |     for (let parent = node.parentElement; parent; parent = parent.parentElement) {
  925  |       const style = window.getComputedStyle(parent);
  926  |       if (style.overflow === "visible" && style.overflowX === "visible" && style.overflowY === "visible") continue;
  927  |       const parentRect = parent.getBoundingClientRect();
  928  |       const escapes =
  929  |         rect.top < parentRect.top - 1 ||
  930  |         rect.bottom > parentRect.bottom + 1 ||
  931  |         rect.left < parentRect.left - 1 ||
  932  |         rect.right > parentRect.right + 1;
  933  |       if (escapes) {
  934  |         clippedBy = `${parent.tagName.toLowerCase()}.${parent.className || "(no class)"}`.slice(0, 80);
  935  |         break;
  936  |       }
  937  |     }
  938  |     return {
  939  |       left: rect.left,
  940  |       right: rect.right,
  941  |       width: rect.width,
  942  |       height: rect.height,
  943  |       viewportWidth: window.innerWidth,
  944  |       clippedBy
  945  |     };
  946  |   });
  947  | 
  948  |   expect(
  949  |     geometry.width > 0 && geometry.height > 0,
  950  |     `${description}: revealed element has zero size — nothing actually appeared`
  951  |   ).toBe(true);
  952  | 
  953  |   expect(
  954  |     geometry.clippedBy,
  955  |     `${description}: revealed element is clipped by an ancestor with overflow hidden (${geometry.clippedBy}) — ` +
  956  |       `it is "visible" to the DOM but cut off on screen`
  957  |   ).toBeNull();
  958  | 
  959  |   expect(
  960  |     geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1,
  961  |     `${description}: revealed element runs outside the viewport horizontally ` +
  962  |       `(${Math.round(geometry.left)}…${Math.round(geometry.right)}px vs ${geometry.viewportWidth}px wide)`
  963  |   ).toBe(true);
  964  | }
  965  | 
  966  | /**
  967  |  * Resolves the project the journeys should exercise: the pinned
  968  |  * `PILOT_PROJECT_ID` when set, otherwise the first project on the pilot
  969  |  * account. Discovery keeps the pilot working on a fresh pilot account without
  970  |  * another env var to maintain.
  971  |  */
  972  | export async function resolveProjectId(page: Page): Promise<string> {
  973  |   const pinned = process.env.PILOT_PROJECT_ID?.trim();
  974  |   if (pinned) return pinned;
  975  | 
  976  |   const [first] = await discoverProjectIds(page);
  977  |   if (!first) {
> 978  |     throw new Error(
       |           ^ Error: Pilot account has no project to inspect. Seed the pilot account with a project that already has completed scans, or set PILOT_PROJECT_ID.
  979  |       "Pilot account has no project to inspect. Seed the pilot account with a " +
  980  |         "project that already has completed scans, or set PILOT_PROJECT_ID."
  981  |     );
  982  |   }
  983  |   return first;
  984  | }
  985  | 
  986  | /**
  987  |  * Every project on the pilot account, in list order.
  988  |  *
  989  |  * One project only ever exercises one shape of data. The account's projects
  990  |  * differ in the ways that matter for judging a screen — how many scans they
  991  |  * have, whether the brand is mentioned at all, how many competitors the AI
  992  |  * names — so walking a second one is the cheapest way to reach states the
  993  |  * primary project simply cannot produce (founder, 2026-08-03: *"si cambias de
  994  |  * proyecto escaneado, por ejemplo Movistar, ahí puedes probar otras
  995  |  * casuísticas"*).
  996  |  */
  997  | export async function discoverProjectIds(page: Page): Promise<string[]> {
  998  |   /**
  999  |    * `/dashboard/domains`, no `/dashboard/projects` — DOMAINS-ARCHIVE-RETIRE-1
  1000 |    * (log §104). Esa ruta pasó a ser una redirección, y apuntar el piloto a una
  1001 |    * redirección con `waitUntil: "domcontentloaded"` es un fallo con nombre
  1002 |    * propio: la espera resuelve sobre el documento intermedio, el navegador se
  1003 |    * lleva la página por delante y el `evaluateAll` de abajo revienta con
  1004 |    * *"Execution context was destroyed"*. Tumbó las tres anchuras del journey
  1005 |    * de segundo proyecto y NO se parece en nada a su causa — parece un fallo de
  1006 |    * red, no una ruta que ha cambiado de sitio.
  1007 |    */
  1008 |   await page.goto("/dashboard/domains", { waitUntil: "domcontentloaded" });
  1009 | 
  1010 |   /**
  1011 |    * Dos formas de enlace, y hacen falta las dos: la rejilla enlaza el dominio
  1012 |    * **activo** a su pantalla (`/dashboard/projects/<id>`) y los demás a un
  1013 |    * cambio de activo (`/dashboard/domains?active=<id>`). Quedarse sólo con la
  1014 |    * primera devolvería un único proyecto y el journey se saltaría en silencio
  1015 |    * — que es justo lo que este journey existe para impedir.
  1016 |    */
  1017 |   const hrefs = await page
  1018 |     .locator('a[href^="/dashboard/projects/"], a[href^="/dashboard/domains?active="]')
  1019 |     .filter({ hasNotText: /nuevo|new/i })
  1020 |     .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));
  1021 | 
  1022 |   const ids: string[] = [];
  1023 |   for (const href of hrefs) {
  1024 |     const id =
  1025 |       href.match(/\/dashboard\/projects\/([^/?#]+)/)?.[1] ??
  1026 |       href.match(/\/dashboard\/domains\?active=([^&#]+)/)?.[1];
  1027 |     // "new" is the create route, not a project; the list also links each
  1028 |     // project from several places, so the same id shows up more than once.
  1029 |     if (!id || id === "new" || ids.includes(id)) continue;
  1030 |     ids.push(id);
  1031 |   }
  1032 |   return ids;
  1033 | }
  1034 | 
  1035 | /** Cuántos proyectos se abren buscando uno que sirva. Acotado: cada candidato es una carga de página, por anchura. */
  1036 | const MAX_PROJECT_CANDIDATES = 4;
  1037 | 
  1038 | /** Margen para que la pantalla se decida entre pintar contenido o su estado vacío. */
  1039 | const PROJECT_SETTLE_TIMEOUT_MS = 15_000;
  1040 | 
  1041 | /**
  1042 |  * El primer proyecto de la cuenta que **tiene de verdad** lo que el journey va
  1043 |  * a mirar, abriéndolo y comprobándolo.
  1044 |  *
  1045 |  * Elegir «el primero de la lista» y luego exigir contenido real es una
  1046 |  * contradicción: qué proyecto sale primero depende del cookie
  1047 |  * `geo_active_project` y, sin él, del más reciente — así que basta con que
  1048 |  * alguien cree un dominio para que el piloto aterrice en uno recién escaneado
  1049 |  * y sin nada que corregir. Ese estado vacío es **legítimo del producto**, no un
  1050 |  * fallo, y hacer fallar al piloto por él enseña a ignorarlo (PR #446: pasó dos
  1051 |  * veces el mismo día, primero en `recs-interactions` con el proyecto Linkedin
  1052 |  * y después aquí con Amazon).
  1053 |  *
  1054 |  * Elegir por dato no puede pudrirse igual: si ningún proyecto tiene lo que hace
  1055 |  * falta, quien llama **se salta ruidosamente** en vez de afirmar sobre una
  1056 |  * pantalla vacía — la regla que nació el 2026-08-02.
  1057 |  *
  1058 |  * `exclude` permite que un segundo journey pida otro proyecto distinto del que
  1059 |  * ya usó el primero.
  1060 |  */
  1061 | export async function pickProjectShowing(
  1062 |   page: Page,
  1063 |   testInfo: TestInfo,
  1064 |   options: { path: (id: string) => string; contentSelector: string; emptySelector?: string; exclude?: string[] }
  1065 | ): Promise<string | null> {
  1066 |   const excluded = new Set(options.exclude ?? []);
  1067 |   const all = (await discoverProjectIds(page)).filter((id) => !excluded.has(id));
  1068 |   const candidates = all.slice(0, MAX_PROJECT_CANDIDATES);
  1069 | 
  1070 |   for (const id of candidates) {
  1071 |     await page.goto(options.path(id), { waitUntil: "domcontentloaded" });
  1072 |     const content = page.locator(options.contentSelector).first();
  1073 |     // Esperar a que la pantalla se decida. Sin esto, un cero puede ser
  1074 |     // "todavía no ha hidratado" y se descartaría un proyecto bueno.
  1075 |     await content
  1076 |       .or(page.locator(options.emptySelector ?? ".section-empty").first())
  1077 |       .first()
  1078 |       .waitFor({ state: "visible", timeout: PROJECT_SETTLE_TIMEOUT_MS })
```