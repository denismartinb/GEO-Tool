# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/recommendations-interactions.spec.ts >> recomendaciones: acordeones, filtros, detalle, tooltips y exportar responden de verdad
- Location: tests/pilot/journeys/recommendations-interactions.spec.ts:45:5

# Error details

```
TimeoutError: page.waitForEvent: Timeout 10000ms exceeded while waiting for event "download"
=========================== logs ===========================
waiting for event "download"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f4e1]:
  - generic [ref=f4e2]:
    - complementary [ref=f4e3]:
      - generic [ref=f4e5]:
        - img "GenScore" [ref=f4e6]
        - generic [ref=f4e10]: Espacio de visibilidad en IA
      - link "Mozilla mozilla.org" [ref=f4e11] [cursor=pointer]:
        - /url: /dashboard/domains
        - generic [ref=f4e12]:
          - generic [ref=f4e13]: Mozilla
          - generic [ref=f4e14]: mozilla.org
      - generic [ref=f4e17]:
        - generic [ref=f4e18]: Analizar
        - link "Visión general" [ref=f4e19] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a
        - link "Prompts 7" [ref=f4e26] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/prompts
          - generic [ref=f4e29]: Prompts
          - generic [ref=f4e30]: "7"
        - link "Competidores 7" [ref=f4e31] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/competitors
          - generic [ref=f4e36]: Competidores
          - generic [ref=f4e37]: "7"
        - link "Páginas citadas" [ref=f4e38] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/citations
        - link "Auditoría web" [ref=f4e45] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/web-audit
        - generic [ref=f4e50]: Actuar
        - link "Recomendaciones 16" [ref=f4e51] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/recommendations
          - generic [ref=f4e55]: Recomendaciones
          - generic [ref=f4e56]: "16"
        - generic [ref=f4e57]: Aprender
        - link "Manuales GEO" [ref=f4e58] [cursor=pointer]:
          - /url: /blog
      - generic [ref=f4e64]:
        - button "¿Qué es el GEO?" [ref=f4e65] [cursor=pointer]
        - link "DE de5@gmail.com Agencia" [ref=f4e69] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=f4e70]: DE
          - generic [ref=f4e71]:
            - generic [ref=f4e72]: de5@gmail.com
            - generic [ref=f4e73]: Agencia
    - generic [ref=f4e76]:
      - banner [ref=f4e77]:
        - generic [ref=f4e78]: Completado
        - generic [ref=f4e80]:
          - button "Notificaciones" [ref=f4e82] [cursor=pointer]
          - button "Cerrar sesión" [ref=f4e87] [cursor=pointer]
      - main [ref=f4e91]:
        - generic [ref=f4e92]:
          - generic [ref=f4e93]:
            - generic [ref=f4e95]:
              - paragraph [ref=f4e96]: Recomendaciones
              - generic [ref=f4e97]:
                - generic [ref=f4e98]: Mozilla
                - generic [ref=f4e99]: 16 acciones
            - generic [ref=f4e100]: Escaneado 29 ago 2026
          - generic [ref=f4e102]:
            - generic [ref=f4e103]:
              - generic [ref=f4e104]:
                - generic [ref=f4e105]:
                  - text: Presencia
                  - note "En cuántas de tus consultas te nombra la IA. Si no te nombra, no te pueden elegir." [ref=f4e106]:
                    - generic: i
                - generic [ref=f4e107]: "38"
              - generic [ref=f4e110]:
                - generic [ref=f4e111]:
                  - text: Cuota de voz
                  - note "Cuánto espacio ocupas tú frente a tus competidores en el total de menciones." [ref=f4e112]:
                    - generic: i
                - generic [ref=f4e113]: "31"
              - generic [ref=f4e116]:
                - generic [ref=f4e117]:
                  - text: Autoridad
                  - note "Con qué frecuencia la IA usa tu web como fuente y te cita, en vez de citar a otros." [ref=f4e118]:
                    - generic: i
                - generic [ref=f4e119]: "7"
            - button [ref=f4e122] [cursor=pointer]
            - generic [ref=f4e128]: 3 acciones prioritarias. Hasta +10 puntos
            - generic [ref=f4e130]:
              - 'button "1 Disputa a Proton VPN 2 consultas donde no apareces Proton VPN sale en 2 respuestas y tú no. Publica contenido que responda esas consultas mejor y que compare con honestidad. Empieza por aquí. Abre una de estas respuestas y mira qué páginas cita para Proton VPN: ahí está el listón que tienes que superar. +6 pt potenciales Ocultar" [expanded] [ref=f4e131] [cursor=pointer]':
                - generic [ref=f4e132]:
                  - generic [ref=f4e133]: "1"
                  - generic [ref=f4e135]: Disputa a Proton VPN 2 consultas donde no apareces
                  - generic [ref=f4e136]: Proton VPN sale en 2 respuestas y tú no. Publica contenido que responda esas consultas mejor y que compare con honestidad.
                  - generic [ref=f4e137]: "Empieza por aquí. Abre una de estas respuestas y mira qué páginas cita para Proton VPN: ahí está el listón que tienes que superar."
                - generic [ref=f4e141]:
                  - generic [ref=f4e142]:
                    - generic [ref=f4e143]: +6 pt
                    - generic [ref=f4e144]: potenciales
                  - button "Ocultar" [ref=f4e145]
              - generic [ref=f4e149]:
                - generic [ref=f4e150]:
                  - generic [ref=f4e151]: Impacto
                  - generic [ref=f4e160]: Esfuerzo
                  - generic [ref=f4e169]:
                    - generic [ref=f4e170]: Confianza
                    - generic [ref=f4e171]: Alta
                  - generic [ref=f4e172]:
                    - generic [ref=f4e173]: Tipo
                    - generic [ref=f4e174]: Cerrar brecha con competidores
                - generic [ref=f4e175]:
                  - generic [ref=f4e176]:
                    - generic [ref=f4e177]: Por qué importa
                    - paragraph [ref=f4e178]: Cuando la IA responde con Proton VPN y no contigo, la decisión se toma sin que llegues a estar en la lista.
                    - generic [ref=f4e179]:
                      - generic [ref=f4e180]: 2 prompts afectados
                      - list [ref=f4e181]:
                        - listitem [ref=f4e182]:
                          - generic [ref=f4e183]:
                            - generic "Gemini" [ref=f4e184]
                            - generic [ref=f4e187]: ¿Qué servicio de VPN ofrece la mejor relación calidad-precio para proteger mi privacidad en línea en España?
                          - generic [ref=f4e188]:
                            - generic [ref=f4e189]: "Gana: Proton VPN"
                            - text: ·
                            - generic [ref=f4e190]: "Cita: xataka.com, esim.holafly.com, bitcatcha.com, surfshark.com, thebestvpn.com, eneba.com, 01net.com, websecurity.es, top10vpn.com"
                        - listitem [ref=f4e191]:
                          - generic [ref=f4e192]:
                            - generic "ChatGPT" [ref=f4e193]
                            - generic [ref=f4e201]: ¿Qué servicio de VPN ofrece la mejor relación calidad-precio para proteger mi privacidad en línea en España?
                          - generic [ref=f4e202]:
                            - generic [ref=f4e203]: "Gana: Proton VPN"
                            - text: ·
                            - generic [ref=f4e204]: "Cita: global.techradar.com, techradar.com, comparix.es"
                    - paragraph [ref=f4e205]: "Supuestos: Proton VPN aparece de forma recurrente en prompts donde tu marca no se menciona."
                  - generic [ref=f4e206]:
                    - generic [ref=f4e207]: Evidencia
                    - generic [ref=f4e208]: “**Proton VPN** es ideal para usuarios que priorizan la privacidad, con planes desde 3,59 € al mes”
                    - paragraph [ref=f4e209]: "Competidores: Proton VPN"
                    - paragraph [ref=f4e210]: "Dominios: xataka.com, esim.holafly.com, bitcatcha.com, surfshark.com, thebestvpn.com, eneba.com, 01net.com, websecurity.es"
                - generic [ref=f4e211]:
                  - button "Generar comparativa" [ref=f4e212] [cursor=pointer]
                  - button "Marcar como hecho" [ref=f4e217] [cursor=pointer]
                  - paragraph [ref=f4e220]: La verás reflejada en tu próximo escaneo.
            - generic [ref=f4e221]:
              - 'button "2 Abierta 2 escaneos Aparece en \"¿Qué cliente de correo electrónico de escritorio es el más recomend…\" Ni tú ni ningún competidor aparecéis en esta respuesta. Es una consulta libre: se la lleva quien publique primero la mejor respuesta. Empieza por aquí. Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta. +3 pt potenciales Ver más" [ref=f4e222] [cursor=pointer]':
                - generic [ref=f4e223]:
                  - generic [ref=f4e224]:
                    - generic [ref=f4e225]: "2"
                    - generic [ref=f4e226]: Abierta 2 escaneos
                  - generic [ref=f4e227]: Aparece en "¿Qué cliente de correo electrónico de escritorio es el más recomend…"
                  - generic [ref=f4e228]: "Ni tú ni ningún competidor aparecéis en esta respuesta. Es una consulta libre: se la lleva quien publique primero la mejor respuesta."
                  - generic [ref=f4e229]: Empieza por aquí. Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta.
                - generic [ref=f4e233]:
                  - generic [ref=f4e234]:
                    - generic [ref=f4e235]: +3 pt
                    - generic [ref=f4e236]: potenciales
                  - button "Ver más" [ref=f4e237]
              - generic [ref=f4e241]:
                - generic [ref=f4e242]:
                  - generic [ref=f4e243]: Impacto
                  - generic [ref=f4e252]: Esfuerzo
                  - generic [ref=f4e261]:
                    - generic [ref=f4e262]: Confianza
                    - generic [ref=f4e263]: Alta
                  - generic [ref=f4e264]:
                    - generic [ref=f4e265]: Tipo
                    - generic [ref=f4e266]: Aumentar visibilidad de marca
                - generic [ref=f4e267]:
                  - generic [ref=f4e268]:
                    - generic [ref=f4e269]: Por qué importa
                    - paragraph [ref=f4e270]: Nadie ocupa todavía esta consulta. Entrar ahora es más barato que disputarla cuando un competidor ya se haya asentado.
                    - generic [ref=f4e271]:
                      - generic [ref=f4e272]: 1 prompt afectado
                      - list [ref=f4e273]:
                        - listitem [ref=f4e274]:
                          - generic [ref=f4e275]:
                            - generic "ChatGPT" [ref=f4e276]
                            - generic [ref=f4e284]: ¿Qué cliente de correo electrónico de escritorio es el más recomendado para gestionar múltiples cuentas y calendarios?
                          - generic [ref=f4e285]: "Cita: getmailbird.com, solvetic.com, grupozas.com, redeszone.net, en.wikipedia.org, techradar.com"
                    - paragraph [ref=f4e287]: "Supuestos: La marca debería aparecer en la respuesta a esta consulta objetivo."
                  - generic [ref=f4e288]:
                    - generic [ref=f4e289]: Evidencia
                    - paragraph [ref=f4e290]: Sin fragmentos de evidencia disponibles.
                    - paragraph [ref=f4e291]: "Dominios: getmailbird.com, solvetic.com, grupozas.com, redeszone.net, en.wikipedia.org, techradar.com"
                - generic [ref=f4e292]:
                  - button "Generar brief de contenido" [ref=f4e293] [cursor=pointer]
                  - button "Marcar como hecho" [ref=f4e298] [cursor=pointer]
                  - paragraph [ref=f4e301]: La verás reflejada en tu próximo escaneo.
            - generic [ref=f4e302]:
              - 'button "3 Prioridad alta Abierta 7 escaneos Publica una comparativa: 5 consultas la piden Son consultas de comparación donde salen tus competidores y tú no. La IA cita comparativas que incluyen a la competencia con honestidad. Empieza por aquí. Monta una tabla comparativa con criterios claros e incluye a tus competidores. Sin tabla, la IA no puede extraerla. Impacto alto Ver más" [ref=f4e303] [cursor=pointer]':
                - generic [ref=f4e304]:
                  - generic [ref=f4e305]:
                    - generic [ref=f4e306]: "3"
                    - generic [ref=f4e307]: Prioridad alta
                    - generic [ref=f4e308]: Abierta 7 escaneos
                  - generic [ref=f4e309]: "Publica una comparativa: 5 consultas la piden"
                  - generic [ref=f4e310]: Son consultas de comparación donde salen tus competidores y tú no. La IA cita comparativas que incluyen a la competencia con honestidad.
                  - generic [ref=f4e311]: Empieza por aquí. Monta una tabla comparativa con criterios claros e incluye a tus competidores. Sin tabla, la IA no puede extraerla.
                - generic [ref=f4e315]:
                  - generic [ref=f4e316]: Impacto alto
                  - button "Ver más" [ref=f4e318]
              - generic [ref=f4e322]:
                - generic [ref=f4e323]:
                  - generic [ref=f4e324]: Impacto
                  - generic [ref=f4e333]: Esfuerzo
                  - generic [ref=f4e342]:
                    - generic [ref=f4e343]: Confianza
                    - generic [ref=f4e344]: Alta
                  - generic [ref=f4e345]:
                    - generic [ref=f4e346]: Tipo
                    - generic [ref=f4e347]: Añadir contenido comparativo
                - generic [ref=f4e348]:
                  - generic [ref=f4e349]:
                    - generic [ref=f4e350]: Por qué importa
                    - paragraph [ref=f4e351]: Quien compara está a punto de decidir. Si la IA no encuentra tu comparativa, usa la de otro.
                    - generic [ref=f4e352]:
                      - generic [ref=f4e353]: 5 prompts afectados
                      - list [ref=f4e354]:
                        - listitem [ref=f4e355]:
                          - generic [ref=f4e356]:
                            - generic "Claude" [ref=f4e357]
                            - generic [ref=f4e360]: "[PILOT-TEST] Comparativa de opciones para comprar online (1785932946767) — prompt de prueba del piloto agéntico, seguro de borrar."
                          - generic [ref=f4e361]: "Gana: Amazon"
                        - listitem [ref=f4e363]:
                          - generic [ref=f4e364]:
                            - generic "Gemini" [ref=f4e365]
                            - generic [ref=f4e368]: "[PILOT-TEST] Comparativa de opciones para comprar online (1785932946767) — prompt de prueba del piloto agéntico, seguro de borrar."
                          - generic [ref=f4e369]:
                            - generic [ref=f4e370]: "Gana: Amazon"
                            - text: ·
                            - generic [ref=f4e371]: "Cita: laterminalexpress.com, bbva.mx, webempresa.com, gobeeping.com, dataiads.io, elcorteingles.es, adslzone.net, carrefour.es, pccomponentes.com, mediamarkt.es, fnac.es, powerplanetonline.com, laredoute.es, algo-bonito.com, dia.es, tienda.consum.es, idealo.es, kelkoo.es"
                        - listitem [ref=f4e372]:
                          - generic [ref=f4e373]:
                            - generic "Gemini" [ref=f4e374]
                            - generic [ref=f4e377]: ¿Qué servicio de VPN ofrece la mejor relación calidad-precio para proteger mi privacidad en línea en España?
                          - generic [ref=f4e378]:
                            - generic [ref=f4e379]: "Gana: Proton VPN"
                            - text: ·
                            - generic [ref=f4e380]: "Cita: xataka.com, esim.holafly.com, bitcatcha.com, surfshark.com, thebestvpn.com, eneba.com, 01net.com, websecurity.es, top10vpn.com"
                        - listitem [ref=f4e381]:
                          - generic [ref=f4e382]:
                            - generic "ChatGPT" [ref=f4e383]
                            - generic [ref=f4e391]: ¿Qué navegador web ofrece la mejor protección de privacidad para usuarios en España?
                          - generic [ref=f4e392]:
                            - generic [ref=f4e393]: "Gana: Brave"
                            - text: ·
                            - generic [ref=f4e394]: "Cita: softzone.es, brave.com, koofr.eu, es.wikipedia.org, tor.jp.malavida.com, techradar.com, instalki.pl, security.org, lunyb.com"
                    - paragraph [ref=f4e395]: "Supuestos: Los prompts con intención comparativa suelen premiar el contenido explícito de comparación entre competidores y tu marca."
                  - generic [ref=f4e396]:
                    - generic [ref=f4e397]: Evidencia
                    - generic [ref=f4e398]: “**Amazon.es** - Amplio catálogo, envíos rápidos y devoluciones sencillas”
                    - generic [ref=f4e399]: “Brave bloquea automáticamente anuncios y rastreadores, y ofrece una VPN integrada”
                    - generic [ref=f4e400]: “**Proton VPN** es ideal para usuarios que priorizan la privacidad, con planes desde 3,59 € al mes”
                    - paragraph [ref=f4e401]: "Competidores: Amazon, Proton VPN, Brave"
                    - paragraph [ref=f4e402]: "Dominios: laterminalexpress.com, bbva.mx, webempresa.com, gobeeping.com, dataiads.io, elcorteingles.es, adslzone.net, carrefour.es"
                - generic [ref=f4e403]:
                  - button "Generar comparativa" [ref=f4e404] [cursor=pointer]
                  - button "Marcar como hecho" [ref=f4e409] [cursor=pointer]
                  - paragraph [ref=f4e412]: La verás reflejada en tu próximo escaneo.
            - generic [ref=f4e413]:
              - generic [ref=f4e414]: Todas las recomendaciones
              - button "Exportar plan" [ref=f4e415] [cursor=pointer]
            - status [ref=f4e419]: Informe listo para guardar como PDF.
            - generic [ref=f4e423]:
              - button "Todas" [ref=f4e424] [cursor=pointer]
              - button "Alta prioridad" [ref=f4e425] [cursor=pointer]
              - button "Técnico" [ref=f4e426] [cursor=pointer]
              - button "Resueltas" [ref=f4e427] [cursor=pointer]
            - button "Añadir contenido comparativo 1" [ref=f4e429] [cursor=pointer]:
              - generic [ref=f4e432]: Añadir contenido comparativo
              - generic [ref=f4e433]: "1"
            - button "Entrar en fuentes citadas 1" [ref=f4e435] [cursor=pointer]:
              - generic [ref=f4e438]: Entrar en fuentes citadas
              - generic [ref=f4e439]: "1"
            - button "Aumentar prominencia de marca 1" [ref=f4e441] [cursor=pointer]:
              - generic [ref=f4e444]: Aumentar prominencia de marca
              - generic [ref=f4e445]: "1"
            - button "Entrar en comunidades 1" [ref=f4e447] [cursor=pointer]:
              - generic [ref=f4e450]: Entrar en comunidades
              - generic [ref=f4e451]: "1"
            - button "Aumentar visibilidad de marca +10 pt 3" [ref=f4e453] [cursor=pointer]:
              - generic [ref=f4e456]: Aumentar visibilidad de marca
              - generic [ref=f4e457]: +10 pt
              - generic [ref=f4e458]: "3"
            - button "Añadir bloque de cita 4" [ref=f4e460] [cursor=pointer]:
              - generic [ref=f4e463]: Añadir bloque de cita
              - generic [ref=f4e464]: "4"
            - button "Cerrar brecha con competidores 1" [ref=f4e466] [cursor=pointer]:
              - generic [ref=f4e469]: Cerrar brecha con competidores
              - generic [ref=f4e470]: "1"
            - button "Amplificar patrón positivo 1" [ref=f4e472] [cursor=pointer]:
              - generic [ref=f4e475]: Amplificar patrón positivo
              - generic [ref=f4e476]: "1"
            - button "Seguir competidor emergente 3" [ref=f4e478] [cursor=pointer]:
              - generic [ref=f4e481]: Seguir competidor emergente
              - generic [ref=f4e482]: "3"
  - alert [ref=f4e483]
  - generic [ref=f4e484]:
    - generic [ref=f4e485]: Informe confidencial
    - generic [ref=f4e491]:
      - generic [ref=f4e492]: Plan de acción GEO
      - heading [level=1] [ref=f4e493]: Optimización de visibilidad en respuestas de IA
      - paragraph [ref=f4e494]: Diagnóstico y hoja de ruta de 3 recomendaciones priorizadas para mejorar cómo la IA representa a la marca en sus respuestas.
    - generic [ref=f4e495]:
      - generic [ref=f4e496]:
        - generic [ref=f4e497]: Cliente
        - generic [ref=f4e498]: mozilla.org
      - generic [ref=f4e499]:
        - generic [ref=f4e500]: Fecha del escaneo
        - generic [ref=f4e501]: 29 ago 2026
      - generic [ref=f4e502]:
        - generic [ref=f4e503]: Puntuación GEO
        - generic [ref=f4e504]: 31 / 100
```

# Test source

```ts
  121 | 
  122 |   const firstGroup = groups.first();
  123 |   await expect(firstGroup.locator(".rec2-group-body"), "el acordeón nace abierto").toHaveCount(0);
  124 |   await firstGroup.locator(".rec2-group-h").click();
  125 |   await expect(firstGroup.locator(".rec2-group-body"), "el acordeón no abre al pulsarlo").toBeVisible();
  126 |   expect(
  127 |     await firstGroup.locator(".rec-card").count(),
  128 |     "el acordeón abre vacío"
  129 |   ).toBeGreaterThan(0);
  130 |   await captureInteraction(page, testInfo, "recs-acordeon-abierto");
  131 | 
  132 |   // Y vuelve a cerrarse.
  133 |   await firstGroup.locator(".rec2-group-h").click();
  134 |   await expect(firstGroup.locator(".rec2-group-body"), "el acordeón no cierra").toHaveCount(0);
  135 | 
  136 |   // --- 4 · Filtros: cambian la lista y "Todas" lo incluye todo -------------
  137 |   const tabs = page.locator(".filters .seg button");
  138 |   const tabLabels = (await tabs.allTextContents()).map((t) => t.trim());
  139 |   expect(tabLabels[0], "el primer filtro debería ser 'Todas'").toContain("Todas");
  140 | 
  141 |   const groupsUnderTodas = await page.locator(".rec2-group").count();
  142 | 
  143 |   // "Alta prioridad" debe devolver EXACTAMENTE las mismas acciones del bloque
  144 |   // de arriba — repetidas, no una selección distinta — y sin acordeones: una
  145 |   // vista filtrada ya viene acotada y nombrada.
  146 |   const highTab = tabs.filter({ hasText: "Alta prioridad" });
  147 |   if (await highTab.count()) {
  148 |     await highTab.first().click();
  149 |     expect(
  150 |       await page.locator(".rec2-group").count(),
  151 |       "'Alta prioridad' no debería agrupar en acordeones"
  152 |     ).toBe(0);
  153 |     expect(
  154 |       await page.locator(".rec-card").count(),
  155 |       "'Alta prioridad' debería repetir las mismas acciones prioritarias de arriba"
  156 |     ).toBe(priorityCount * 2);
  157 |     await captureInteraction(page, testInfo, "recs-filtro-alta-prioridad");
  158 | 
  159 |     await tabs.first().click();
  160 |     expect(
  161 |       await page.locator(".rec2-group").count(),
  162 |       "volver a 'Todas' no restaura la lista completa"
  163 |     ).toBe(groupsUnderTodas);
  164 |   }
  165 | 
  166 |   // "Técnico" lista sus acciones directamente: la categoría ya está en la
  167 |   // pestaña, no hace falta volver a elegirla en un acordeón.
  168 |   const techTab = tabs.filter({ hasText: "Técnico" });
  169 |   if (await techTab.count()) {
  170 |     await techTab.first().click();
  171 |     expect(
  172 |       await page.locator(".rec2-group").count(),
  173 |       "'Técnico' no debería agrupar en acordeones"
  174 |     ).toBe(0);
  175 |     const cards = await page.locator(".rec-card").count();
  176 |     const empty = await page.locator(".section-empty").count();
  177 |     expect(cards + empty, "'Técnico' deja la pantalla en blanco").toBeGreaterThan(0);
  178 |     await captureInteraction(page, testInfo, "recs-filtro-tecnico");
  179 |     await tabs.first().click();
  180 |   }
  181 | 
  182 |   // "Resueltas" — RECS-LOOP-1 Fase A+B. Único sitio donde renderiza la línea
  183 |   // de veredicto (Fase A: mutación cumplida; Fase B: la brecha volvió o no
  184 |   // tras marcarse como hecha) y donde vive la prueba de que el histórico
  185 |   // existe. Ninguna otra parte de este journey ni del barrido genérico abría
  186 |   // esta pestaña — sin este bloque, las dos fases se quedaban sin una sola
  187 |   // captura que las enseñara; lo encontró el propio piloto de esta PR
  188 |   // (docs/brand/design-decisions-log.md §190). `ResolvedHistoryCard`
  189 |   // comparte clase `.rec-card` con las tarjetas activas, así que la cuenta
  190 |   // de abajo es válida sin un selector nuevo.
  191 |   const resolvedTab = tabs.filter({ hasText: "Resueltas" });
  192 |   if (await resolvedTab.count()) {
  193 |     await resolvedTab.first().click();
  194 |     expect(
  195 |       await page.locator(".rec2-group").count(),
  196 |       "'Resueltas' no debería agrupar en acordeones"
  197 |     ).toBe(0);
  198 |     const historyCards = await page.locator(".rec-card").count();
  199 |     const empty = await page.locator(".section-empty").count();
  200 |     expect(historyCards + empty, "'Resueltas' deja la pantalla en blanco").toBeGreaterThan(0);
  201 |     // fullContent: el bloque de "acciones prioritarias" se queda pintado
  202 |     // encima de esta lista en cualquier pestaña, así que una captura de sólo
  203 |     // el viewport deja fuera casi todo el historial — el propio piloto de
  204 |     // esta PR sólo llegó a ver 1-3 filas de las que hubiera en la cuenta real.
  205 |     await captureInteraction(page, testInfo, "recs-resueltas", { fullContent: true });
  206 |     await tabs.first().click();
  207 |   }
  208 | 
  209 |   // --- 5 · "Ver más": el detalle de una prioritaria se abre ----------------
  210 |   await priority.first().locator(".rec-main").click();
  211 |   await expect(
  212 |     priority.first().locator(".rec-detail-inner"),
  213 |     "el detalle de la tarjeta no se abre"
  214 |   ).toBeVisible();
  215 |   await captureInteraction(page, testInfo, "recs-detalle-abierto");
  216 | 
  217 |   // --- 6 · Exportar plan: descarga de verdad ------------------------------
  218 |   const exportBtn = page.getByRole("button", { name: /exportar plan/i });
  219 |   if (await exportBtn.count()) {
  220 |     const [download] = await Promise.all([
> 221 |       page.waitForEvent("download", { timeout: 10_000 }),
      |            ^ TimeoutError: page.waitForEvent: Timeout 10000ms exceeded while waiting for event "download"
  222 |       exportBtn.first().click()
  223 |     ]);
  224 |     expect(download.suggestedFilename(), "el plan exportado no es un .md").toMatch(/\.md$/);
  225 |   }
  226 | });
  227 | 
```