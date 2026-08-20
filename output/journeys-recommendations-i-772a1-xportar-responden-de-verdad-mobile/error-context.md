# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/recommendations-interactions.spec.ts >> recomendaciones: acordeones, filtros, detalle, tooltips y exportar responden de verdad
- Location: tests/pilot/journeys/recommendations-interactions.spec.ts:43:5

# Error details

```
Error: no se han renderizado acciones prioritarias

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=f4e1]:
  - generic [ref=f4e2]:
    - complementary [ref=f4e3]:
      - generic [ref=f4e4]:
        - generic [ref=f4e5]:
          - img "GenScore" [ref=f4e6]
          - generic [ref=f4e10]: Espacio de visibilidad en IA
        - button "Cerrar menú" [ref=f4e11] [cursor=pointer]
      - link "Linkedin linkedin.com" [ref=f4e14] [cursor=pointer]:
        - /url: /dashboard/domains
        - generic [ref=f4e15]:
          - generic [ref=f4e16]: Linkedin
          - generic [ref=f4e17]: linkedin.com
      - generic [ref=f4e20]:
        - generic [ref=f4e21]: Analizar
        - link "Visión general" [ref=f4e22] [cursor=pointer]:
          - /url: /dashboard/projects/af205fad-3567-4145-8086-14913e3c3288
        - link "Prompts 1" [ref=f4e29] [cursor=pointer]:
          - /url: /dashboard/projects/af205fad-3567-4145-8086-14913e3c3288/prompts
          - generic [ref=f4e32]: Prompts
          - generic [ref=f4e33]: "1"
        - link "Competidores 1" [ref=f4e34] [cursor=pointer]:
          - /url: /dashboard/projects/af205fad-3567-4145-8086-14913e3c3288/competitors
          - generic [ref=f4e39]: Competidores
          - generic [ref=f4e40]: "1"
        - link "Páginas citadas" [ref=f4e41] [cursor=pointer]:
          - /url: /dashboard/projects/af205fad-3567-4145-8086-14913e3c3288/citations
        - link "Auditoría web" [ref=f4e48] [cursor=pointer]:
          - /url: /dashboard/projects/af205fad-3567-4145-8086-14913e3c3288/web-audit
        - generic [ref=f4e53]: Actuar
        - link "Recomendaciones" [ref=f4e54] [cursor=pointer]:
          - /url: /dashboard/projects/af205fad-3567-4145-8086-14913e3c3288/recommendations
      - generic [ref=f4e59]:
        - button "¿Qué es el GEO?" [ref=f4e60] [cursor=pointer]
        - link "DE de5@gmail.com Agencia" [ref=f4e64] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=f4e65]: DE
          - generic [ref=f4e66]:
            - generic [ref=f4e67]: de5@gmail.com
            - generic [ref=f4e68]: Agencia
        - button "Cerrar sesión" [ref=f4e72] [cursor=pointer]
    - generic [ref=f4e77]:
      - banner [ref=f4e78]:
        - button "Abrir menú de navegación" [ref=f4e79] [cursor=pointer]
        - button "Notificaciones" [ref=f4e84] [cursor=pointer]
      - main [ref=f4e88]:
        - generic [ref=f4e89]:
          - generic [ref=f4e90]:
            - generic [ref=f4e92]:
              - paragraph [ref=f4e93]: Recomendaciones
              - generic [ref=f4e94]: Linkedin
            - generic [ref=f4e96]: Analizando…
          - generic [ref=f4e99]:
            - generic [ref=f4e100]:
              - generic [ref=f4e101]:
                - generic [ref=f4e105]: linkedin.com
                - text: dado de alta
              - generic [ref=f4e106]: 1 prompt · 3 motores · 3 respuestas
            - generic [ref=f4e185]:
              - generic [ref=f4e186]: Cerrando la misión
              - heading "Casi está" [level=2] [ref=f4e187]
              - paragraph [ref=f4e188]: Estamos calculando tu puntuación GEO.
  - alert [ref=f4e189]
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { assertPageIsHealthy, captureInteraction, resolveProjectId, visitAsUser } from "../support/journey";
  3   | 
  4   | /**
  5   |  * RECS-REDESIGN-1 — interaction proof for the Recomendaciones screen.
  6   |  *
  7   |  * The generic explorer (`exploreInteractions`) cannot cover this screen: it
  8   |  * stops after 4 controls per screen (a timeout budget), and the menu, the
  9   |  * notification bell and two tooltips consume that budget before it ever
  10  |  * reaches the list. The filter tabs are not in its allow-list either, and the
  11  |  * "Añadir bloque de cita" accordion is refused by the destructive-text guard
  12  |  * because of the "añad" stem — a false positive, but the guard is deliberately
  13  |  * over-matching and must stay that way.
  14  |  *
  15  |  * So the screen this PR rebuilds gets an explicit journey instead: it clicks
  16  |  * the real controls and ASSERTS the consequence, rather than reporting "the
  17  |  * DOM changed". Runs against the SECOND project (Movistar by default), which
  18  |  * is the only one with enough recommendations to have accordions at all.
  19  |  *
  20  |  * SCOPE GUARD — read-only, same as core-flow.spec.ts. Every control touched
  21  |  * here is a local state toggle or a client-side download. It never launches a
  22  |  * scan, never writes to Supabase, never submits a form.
  23  |  */
  24  | 
  25  | test.describe.configure({ mode: "serial" });
  26  | 
  27  | async function largestProjectId(page: Parameters<typeof resolveProjectId>[0]): Promise<string | null> {
  28  |   await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });
  29  |   const wanted = (process.env.PILOT_SECOND_PROJECT ?? "Movistar").trim();
  30  |   const links = page.locator('a[href^="/dashboard/projects/"]').filter({ hasNotText: /nuevo|new/i });
  31  |   const ids: string[] = [];
  32  |   for (const link of await links.all()) {
  33  |     const href = await link.getAttribute("href");
  34  |     const text = (await link.textContent()) ?? "";
  35  |     const match = href?.match(/^\/dashboard\/projects\/([^/?#]+)$/);
  36  |     if (!match || match[1] === "new") continue;
  37  |     if (new RegExp(wanted, "i").test(text)) ids.unshift(match[1]);
  38  |     else ids.push(match[1]);
  39  |   }
  40  |   return ids[0] ?? null;
  41  | }
  42  | 
  43  | test("recomendaciones: acordeones, filtros, detalle, tooltips y exportar responden de verdad", async ({
  44  |   page
  45  | }, testInfo) => {
  46  |   const id = await largestProjectId(page);
  47  |   test.skip(!id, "la cuenta piloto no tiene ningún proyecto");
  48  | 
  49  |   const findings = await visitAsUser(
  50  |     page,
  51  |     testInfo,
  52  |     `/dashboard/projects/${id}/recommendations`,
  53  |     "recs-interactions"
  54  |   );
  55  |   assertPageIsHealthy(findings);
  56  | 
  57  |   // --- 1 · Las acciones prioritarias existen y son de tipos distintos -------
  58  |   const priority = page.locator(".rec-card.rec2-priority");
  59  |   const priorityCount = await priority.count();
> 60  |   expect(priorityCount, "no se han renderizado acciones prioritarias").toBeGreaterThan(0);
      |                                                                        ^ Error: no se han renderizado acciones prioritarias
  61  |   const priorityTitles = await priority.locator(".rec-title").allTextContents();
  62  |   expect(
  63  |     new Set(priorityTitles.map((t) => t.trim())).size,
  64  |     `las prioritarias se repiten: ${priorityTitles.join(" | ")}`
  65  |   ).toBe(priorityTitles.length);
  66  | 
  67  |   // El primer paso ("Empieza por aquí") solo vive en filas generadas por el
  68  |   // motor ACTUAL: se persiste en recommendations.evidence_json al escanear.
  69  |   //
  70  |   // La cuenta piloto comparte base de datos con producción, así que un escaneo
  71  |   // lanzado desde otro despliegue las regenera con el motor de esa rama —sin
  72  |   // ese campo— y puede hacerlo incluso a mitad de esta corrida: la primera
  73  |   // versión de este test pasó en móvil (datos del escaneo del 3 ago, con
  74  |   // primer paso) y falló en tablet y escritorio, que ya leyeron un reescaneo
  75  |   // del 4 ago hecho por main.
  76  |   //
  77  |   // Que el motor SIEMPRE emita un primer paso se fija donde corresponde, en su
  78  |   // test unitario ("gives every recommendation a bounded first step"). Aquí,
  79  |   // que es lo único que el pilotaje puede saber de verdad, se comprueba que
  80  |   // cuando el dato existe la tarjeta lo pinta bien.
  81  |   const steps = priority.locator(".rec2-step");
  82  |   const stepCount = await steps.count();
  83  |   for (let i = 0; i < stepCount; i++) {
  84  |     await expect(steps.nth(i), "el bloque de primer paso se renderiza sin su rótulo").toContainText(
  85  |       "Empieza por aquí"
  86  |     );
  87  |   }
  88  | 
  89  |   // --- 2 · Tooltips de los pilares: se revelan y caben en pantalla ----------
  90  |   const tips = page.locator(".rec2-pillars .info-tip");
  91  |   const tipCount = await tips.count();
  92  |   expect(tipCount, "los pilares no tienen tooltip").toBeGreaterThan(0);
  93  |   const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  94  |   for (let i = 0; i < tipCount; i++) {
  95  |     await tips.nth(i).hover();
  96  |     const bubble = page.locator(".rec2-pillars .info-tip-bubble").nth(i);
  97  |     await expect(bubble, `el tooltip ${i + 1} no se revela`).toBeVisible();
  98  |     const box = await bubble.boundingBox();
  99  |     expect(box, `el tooltip ${i + 1} no tiene caja`).not.toBeNull();
  100 |     expect(box!.x, `el tooltip ${i + 1} se sale por la izquierda`).toBeGreaterThanOrEqual(-1);
  101 |     expect(
  102 |       box!.x + box!.width,
  103 |       `el tooltip ${i + 1} se sale por la derecha (viewport ${viewport.width}px)`
  104 |     ).toBeLessThanOrEqual(viewport.width + 1);
  105 |   }
  106 |   await captureInteraction(page, testInfo, "recs-tooltip-pilar");
  107 | 
  108 |   // --- 3 · Acordeón: abre y muestra sus tarjetas ---------------------------
  109 |   const groups = page.locator(".rec2-group");
  110 |   const groupCount = await groups.count();
  111 |   test.skip(groupCount === 0, "este proyecto no tiene suficientes recomendaciones para agrupar");
  112 | 
  113 |   const firstGroup = groups.first();
  114 |   await expect(firstGroup.locator(".rec2-group-body"), "el acordeón nace abierto").toHaveCount(0);
  115 |   await firstGroup.locator(".rec2-group-h").click();
  116 |   await expect(firstGroup.locator(".rec2-group-body"), "el acordeón no abre al pulsarlo").toBeVisible();
  117 |   expect(
  118 |     await firstGroup.locator(".rec-card").count(),
  119 |     "el acordeón abre vacío"
  120 |   ).toBeGreaterThan(0);
  121 |   await captureInteraction(page, testInfo, "recs-acordeon-abierto");
  122 | 
  123 |   // Y vuelve a cerrarse.
  124 |   await firstGroup.locator(".rec2-group-h").click();
  125 |   await expect(firstGroup.locator(".rec2-group-body"), "el acordeón no cierra").toHaveCount(0);
  126 | 
  127 |   // --- 4 · Filtros: cambian la lista y "Todas" lo incluye todo -------------
  128 |   const tabs = page.locator(".filters .seg button");
  129 |   const tabLabels = (await tabs.allTextContents()).map((t) => t.trim());
  130 |   expect(tabLabels[0], "el primer filtro debería ser 'Todas'").toContain("Todas");
  131 | 
  132 |   const groupsUnderTodas = await page.locator(".rec2-group").count();
  133 | 
  134 |   // "Alta prioridad" debe devolver EXACTAMENTE las mismas acciones del bloque
  135 |   // de arriba — repetidas, no una selección distinta — y sin acordeones: una
  136 |   // vista filtrada ya viene acotada y nombrada.
  137 |   const highTab = tabs.filter({ hasText: "Alta prioridad" });
  138 |   if (await highTab.count()) {
  139 |     await highTab.first().click();
  140 |     expect(
  141 |       await page.locator(".rec2-group").count(),
  142 |       "'Alta prioridad' no debería agrupar en acordeones"
  143 |     ).toBe(0);
  144 |     expect(
  145 |       await page.locator(".rec-card").count(),
  146 |       "'Alta prioridad' debería repetir las mismas acciones prioritarias de arriba"
  147 |     ).toBe(priorityCount * 2);
  148 |     await captureInteraction(page, testInfo, "recs-filtro-alta-prioridad");
  149 | 
  150 |     await tabs.first().click();
  151 |     expect(
  152 |       await page.locator(".rec2-group").count(),
  153 |       "volver a 'Todas' no restaura la lista completa"
  154 |     ).toBe(groupsUnderTodas);
  155 |   }
  156 | 
  157 |   // "Técnico" lista sus acciones directamente: la categoría ya está en la
  158 |   // pestaña, no hace falta volver a elegirla en un acordeón.
  159 |   const techTab = tabs.filter({ hasText: "Técnico" });
  160 |   if (await techTab.count()) {
```