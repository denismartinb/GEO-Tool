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
      - generic [ref=f4e4]:
        - generic [ref=f4e5]:
          - img "GenScore" [ref=f4e6]
          - generic [ref=f4e10]: Espacio de visibilidad en IA
        - button "Cerrar menú" [ref=f4e11] [cursor=pointer]
      - link "Mozilla mozilla.org" [ref=f4e14] [cursor=pointer]:
        - /url: /dashboard/domains
        - generic [ref=f4e15]:
          - generic [ref=f4e16]: Mozilla
          - generic [ref=f4e17]: mozilla.org
      - generic [ref=f4e20]:
        - generic [ref=f4e21]: Analizar
        - link "Visión general" [ref=f4e22] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a
        - link "Prompts 7" [ref=f4e29] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/prompts
          - generic [ref=f4e32]: Prompts
          - generic [ref=f4e33]: "7"
        - link "Competidores 7" [ref=f4e34] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/competitors
          - generic [ref=f4e39]: Competidores
          - generic [ref=f4e40]: "7"
        - link "Páginas citadas" [ref=f4e41] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/citations
        - link "Auditoría web" [ref=f4e48] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/web-audit
        - generic [ref=f4e53]: Actuar
        - link "Recomendaciones 16" [ref=f4e54] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/recommendations
          - generic [ref=f4e58]: Recomendaciones
          - generic [ref=f4e59]: "16"
        - generic [ref=f4e60]: Aprender
        - link "Manuales GEO" [ref=f4e61] [cursor=pointer]:
          - /url: /blog
      - generic [ref=f4e67]:
        - button "¿Qué es el GEO?" [ref=f4e68] [cursor=pointer]
        - link "DE de5@gmail.com Agencia" [ref=f4e72] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=f4e73]: DE
          - generic [ref=f4e74]:
            - generic [ref=f4e75]: de5@gmail.com
            - generic [ref=f4e76]: Agencia
        - button "Cerrar sesión" [ref=f4e80] [cursor=pointer]
    - generic [ref=f4e85]:
      - banner [ref=f4e86]:
        - button "Abrir menú de navegación" [ref=f4e87] [cursor=pointer]
        - button "Notificaciones" [ref=f4e92] [cursor=pointer]
      - main [ref=f4e96]:
        - generic [ref=f4e97]:
          - generic [ref=f4e98]:
            - generic [ref=f4e100]:
              - paragraph [ref=f4e101]: Recomendaciones
              - generic [ref=f4e102]:
                - generic [ref=f4e103]: Mozilla
                - generic [ref=f4e104]: 16 acciones
            - generic [ref=f4e105]: Escaneado 29 ago 2026
          - generic [ref=f4e107]:
            - generic [ref=f4e108]:
              - generic [ref=f4e109]:
                - generic [ref=f4e110]:
                  - text: Presencia
                  - note "En cuántas de tus consultas te nombra la IA. Si no te nombra, no te pueden elegir." [ref=f4e111]:
                    - generic: i
                - generic [ref=f4e112]: "38"
              - generic [ref=f4e115]:
                - generic [ref=f4e116]:
                  - text: Cuota de voz
                  - note "Cuánto espacio ocupas tú frente a tus competidores en el total de menciones." [ref=f4e117]:
                    - generic: i
                - generic [ref=f4e118]: "31"
              - generic [ref=f4e121]:
                - generic [ref=f4e122]:
                  - text: Autoridad
                  - note "Con qué frecuencia la IA usa tu web como fuente y te cita, en vez de citar a otros." [ref=f4e123]:
                    - generic: i
                - generic [ref=f4e124]: "7"
            - button [ref=f4e127] [cursor=pointer]
            - generic [ref=f4e133]: 3 acciones prioritarias. Hasta +10 puntos
            - generic [ref=f4e135]:
              - 'button "1 Disputa a Proton VPN 2 consultas donde no apareces Proton VPN sale en 2 respuestas y tú no. Publica contenido que responda esas consultas mejor y que compare con honestidad. Empieza por aquí. Abre una de estas respuestas y mira qué páginas cita para Proton VPN: ahí está el listón que tienes que superar. +6 pt potenciales Ocultar" [expanded] [ref=f4e136] [cursor=pointer]':
                - generic [ref=f4e137]:
                  - generic [ref=f4e138]: "1"
                  - generic [ref=f4e140]: Disputa a Proton VPN 2 consultas donde no apareces
                  - generic [ref=f4e141]: Proton VPN sale en 2 respuestas y tú no. Publica contenido que responda esas consultas mejor y que compare con honestidad.
                  - generic [ref=f4e142]: "Empieza por aquí. Abre una de estas respuestas y mira qué páginas cita para Proton VPN: ahí está el listón que tienes que superar."
                - generic [ref=f4e146]:
                  - generic [ref=f4e147]:
                    - generic [ref=f4e148]: +6 pt
                    - generic [ref=f4e149]: potenciales
                  - button "Ocultar" [ref=f4e150]
              - generic [ref=f4e154]:
                - generic [ref=f4e155]:
                  - generic [ref=f4e156]: Impacto
                  - generic [ref=f4e165]: Esfuerzo
                  - generic [ref=f4e174]:
                    - generic [ref=f4e175]: Confianza
                    - generic [ref=f4e176]: Alta
                  - generic [ref=f4e177]:
                    - generic [ref=f4e178]: Tipo
                    - generic [ref=f4e179]: Cerrar brecha con competidores
                - generic [ref=f4e180]:
                  - generic [ref=f4e181]:
                    - generic [ref=f4e182]: Por qué importa
                    - paragraph [ref=f4e183]: Cuando la IA responde con Proton VPN y no contigo, la decisión se toma sin que llegues a estar en la lista.
                    - generic [ref=f4e184]:
                      - generic [ref=f4e185]: 2 prompts afectados
                      - list [ref=f4e186]:
                        - listitem [ref=f4e187]:
                          - generic [ref=f4e188]:
                            - generic "Gemini" [ref=f4e189]
                            - generic [ref=f4e192]: ¿Qué servicio de VPN ofrece la mejor relación calidad-precio para proteger mi privacidad en línea en España?
                          - generic [ref=f4e193]:
                            - generic [ref=f4e194]: "Gana: Proton VPN"
                            - text: ·
                            - generic [ref=f4e195]: "Cita: xataka.com, esim.holafly.com, bitcatcha.com, surfshark.com, thebestvpn.com, eneba.com, 01net.com, websecurity.es, top10vpn.com"
                        - listitem [ref=f4e196]:
                          - generic [ref=f4e197]:
                            - generic "ChatGPT" [ref=f4e198]
                            - generic [ref=f4e206]: ¿Qué servicio de VPN ofrece la mejor relación calidad-precio para proteger mi privacidad en línea en España?
                          - generic [ref=f4e207]:
                            - generic [ref=f4e208]: "Gana: Proton VPN"
                            - text: ·
                            - generic [ref=f4e209]: "Cita: global.techradar.com, techradar.com, comparix.es"
                    - paragraph [ref=f4e210]: "Supuestos: Proton VPN aparece de forma recurrente en prompts donde tu marca no se menciona."
                  - generic [ref=f4e211]:
                    - generic [ref=f4e212]: Evidencia
                    - generic [ref=f4e213]: “**Proton VPN** es ideal para usuarios que priorizan la privacidad, con planes desde 3,59 € al mes”
                    - paragraph [ref=f4e214]: "Competidores: Proton VPN"
                    - paragraph [ref=f4e215]: "Dominios: xataka.com, esim.holafly.com, bitcatcha.com, surfshark.com, thebestvpn.com, eneba.com, 01net.com, websecurity.es"
                - generic [ref=f4e216]:
                  - button "Generar comparativa" [ref=f4e217] [cursor=pointer]
                  - button "Marcar como hecho" [ref=f4e222] [cursor=pointer]
                  - paragraph [ref=f4e225]: La verás reflejada en tu próximo escaneo.
            - generic [ref=f4e226]:
              - 'button "2 Abierta 2 escaneos Aparece en \"¿Qué cliente de correo electrónico de escritorio es el más recomend…\" Ni tú ni ningún competidor aparecéis en esta respuesta. Es una consulta libre: se la lleva quien publique primero la mejor respuesta. Empieza por aquí. Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta. +3 pt potenciales Ver más" [ref=f4e227] [cursor=pointer]':
                - generic [ref=f4e228]:
                  - generic [ref=f4e229]:
                    - generic [ref=f4e230]: "2"
                    - generic [ref=f4e231]: Abierta 2 escaneos
                  - generic [ref=f4e232]: Aparece en "¿Qué cliente de correo electrónico de escritorio es el más recomend…"
                  - generic [ref=f4e233]: "Ni tú ni ningún competidor aparecéis en esta respuesta. Es una consulta libre: se la lleva quien publique primero la mejor respuesta."
                  - generic [ref=f4e234]: Empieza por aquí. Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta.
                - generic [ref=f4e238]:
                  - generic [ref=f4e239]:
                    - generic [ref=f4e240]: +3 pt
                    - generic [ref=f4e241]: potenciales
                  - button "Ver más" [ref=f4e242]
              - generic [ref=f4e246]:
                - generic [ref=f4e247]:
                  - generic [ref=f4e248]: Impacto
                  - generic [ref=f4e257]: Esfuerzo
                  - generic [ref=f4e266]:
                    - generic [ref=f4e267]: Confianza
                    - generic [ref=f4e268]: Alta
                  - generic [ref=f4e269]:
                    - generic [ref=f4e270]: Tipo
                    - generic [ref=f4e271]: Aumentar visibilidad de marca
                - generic [ref=f4e272]:
                  - generic [ref=f4e273]:
                    - generic [ref=f4e274]: Por qué importa
                    - paragraph [ref=f4e275]: Nadie ocupa todavía esta consulta. Entrar ahora es más barato que disputarla cuando un competidor ya se haya asentado.
                    - generic [ref=f4e276]:
                      - generic [ref=f4e277]: 1 prompt afectado
                      - list [ref=f4e278]:
                        - listitem [ref=f4e279]:
                          - generic [ref=f4e280]:
                            - generic "ChatGPT" [ref=f4e281]
                            - generic [ref=f4e289]: ¿Qué cliente de correo electrónico de escritorio es el más recomendado para gestionar múltiples cuentas y calendarios?
                          - generic [ref=f4e290]: "Cita: getmailbird.com, solvetic.com, grupozas.com, redeszone.net, en.wikipedia.org, techradar.com"
                    - paragraph [ref=f4e292]: "Supuestos: La marca debería aparecer en la respuesta a esta consulta objetivo."
                  - generic [ref=f4e293]:
                    - generic [ref=f4e294]: Evidencia
                    - paragraph [ref=f4e295]: Sin fragmentos de evidencia disponibles.
                    - paragraph [ref=f4e296]: "Dominios: getmailbird.com, solvetic.com, grupozas.com, redeszone.net, en.wikipedia.org, techradar.com"
                - generic [ref=f4e297]:
                  - button "Generar brief de contenido" [ref=f4e298] [cursor=pointer]
                  - button "Marcar como hecho" [ref=f4e303] [cursor=pointer]
                  - paragraph [ref=f4e306]: La verás reflejada en tu próximo escaneo.
            - generic [ref=f4e307]:
              - 'button "3 Prioridad alta Abierta 7 escaneos Publica una comparativa: 5 consultas la piden Son consultas de comparación donde salen tus competidores y tú no. La IA cita comparativas que incluyen a la competencia con honestidad. Empieza por aquí. Monta una tabla comparativa con criterios claros e incluye a tus competidores. Sin tabla, la IA no puede extraerla. Impacto alto Ver más" [ref=f4e308] [cursor=pointer]':
                - generic [ref=f4e309]:
                  - generic [ref=f4e310]:
                    - generic [ref=f4e311]: "3"
                    - generic [ref=f4e312]: Prioridad alta
                    - generic [ref=f4e313]: Abierta 7 escaneos
                  - generic [ref=f4e314]: "Publica una comparativa: 5 consultas la piden"
                  - generic [ref=f4e315]: Son consultas de comparación donde salen tus competidores y tú no. La IA cita comparativas que incluyen a la competencia con honestidad.
                  - generic [ref=f4e316]: Empieza por aquí. Monta una tabla comparativa con criterios claros e incluye a tus competidores. Sin tabla, la IA no puede extraerla.
                - generic [ref=f4e320]:
                  - generic [ref=f4e321]: Impacto alto
                  - button "Ver más" [ref=f4e323]
              - generic [ref=f4e327]:
                - generic [ref=f4e328]:
                  - generic [ref=f4e329]: Impacto
                  - generic [ref=f4e338]: Esfuerzo
                  - generic [ref=f4e347]:
                    - generic [ref=f4e348]: Confianza
                    - generic [ref=f4e349]: Alta
                  - generic [ref=f4e350]:
                    - generic [ref=f4e351]: Tipo
                    - generic [ref=f4e352]: Añadir contenido comparativo
                - generic [ref=f4e353]:
                  - generic [ref=f4e354]:
                    - generic [ref=f4e355]: Por qué importa
                    - paragraph [ref=f4e356]: Quien compara está a punto de decidir. Si la IA no encuentra tu comparativa, usa la de otro.
                    - generic [ref=f4e357]:
                      - generic [ref=f4e358]: 5 prompts afectados
                      - list [ref=f4e359]:
                        - listitem [ref=f4e360]:
                          - generic [ref=f4e361]:
                            - generic "Claude" [ref=f4e362]
                            - generic [ref=f4e365]: "[PILOT-TEST] Comparativa de opciones para comprar online (1785932946767) — prompt de prueba del piloto agéntico, seguro de borrar."
                          - generic [ref=f4e366]: "Gana: Amazon"
                        - listitem [ref=f4e368]:
                          - generic [ref=f4e369]:
                            - generic "Gemini" [ref=f4e370]
                            - generic [ref=f4e373]: "[PILOT-TEST] Comparativa de opciones para comprar online (1785932946767) — prompt de prueba del piloto agéntico, seguro de borrar."
                          - generic [ref=f4e374]:
                            - generic [ref=f4e375]: "Gana: Amazon"
                            - text: ·
                            - generic [ref=f4e376]: "Cita: laterminalexpress.com, bbva.mx, webempresa.com, gobeeping.com, dataiads.io, elcorteingles.es, adslzone.net, carrefour.es, pccomponentes.com, mediamarkt.es, fnac.es, powerplanetonline.com, laredoute.es, algo-bonito.com, dia.es, tienda.consum.es, idealo.es, kelkoo.es"
                        - listitem [ref=f4e377]:
                          - generic [ref=f4e378]:
                            - generic "Gemini" [ref=f4e379]
                            - generic [ref=f4e382]: ¿Qué servicio de VPN ofrece la mejor relación calidad-precio para proteger mi privacidad en línea en España?
                          - generic [ref=f4e383]:
                            - generic [ref=f4e384]: "Gana: Proton VPN"
                            - text: ·
                            - generic [ref=f4e385]: "Cita: xataka.com, esim.holafly.com, bitcatcha.com, surfshark.com, thebestvpn.com, eneba.com, 01net.com, websecurity.es, top10vpn.com"
                        - listitem [ref=f4e386]:
                          - generic [ref=f4e387]:
                            - generic "ChatGPT" [ref=f4e388]
                            - generic [ref=f4e396]: ¿Qué navegador web ofrece la mejor protección de privacidad para usuarios en España?
                          - generic [ref=f4e397]:
                            - generic [ref=f4e398]: "Gana: Brave"
                            - text: ·
                            - generic [ref=f4e399]: "Cita: softzone.es, brave.com, koofr.eu, es.wikipedia.org, tor.jp.malavida.com, techradar.com, instalki.pl, security.org, lunyb.com"
                    - paragraph [ref=f4e400]: "Supuestos: Los prompts con intención comparativa suelen premiar el contenido explícito de comparación entre competidores y tu marca."
                  - generic [ref=f4e401]:
                    - generic [ref=f4e402]: Evidencia
                    - generic [ref=f4e403]: “**Amazon.es** - Amplio catálogo, envíos rápidos y devoluciones sencillas”
                    - generic [ref=f4e404]: “Brave bloquea automáticamente anuncios y rastreadores, y ofrece una VPN integrada”
                    - generic [ref=f4e405]: “**Proton VPN** es ideal para usuarios que priorizan la privacidad, con planes desde 3,59 € al mes”
                    - paragraph [ref=f4e406]: "Competidores: Amazon, Proton VPN, Brave"
                    - paragraph [ref=f4e407]: "Dominios: laterminalexpress.com, bbva.mx, webempresa.com, gobeeping.com, dataiads.io, elcorteingles.es, adslzone.net, carrefour.es"
                - generic [ref=f4e408]:
                  - button "Generar comparativa" [ref=f4e409] [cursor=pointer]
                  - button "Marcar como hecho" [ref=f4e414] [cursor=pointer]
                  - paragraph [ref=f4e417]: La verás reflejada en tu próximo escaneo.
            - generic [ref=f4e418]:
              - generic [ref=f4e419]: Todas las recomendaciones
              - button "Exportar plan" [ref=f4e420] [cursor=pointer]
            - status [ref=f4e424]: Informe listo para guardar como PDF.
            - generic [ref=f4e428]:
              - button "Todas" [ref=f4e429] [cursor=pointer]
              - button "Alta prioridad" [ref=f4e430] [cursor=pointer]
              - button "Técnico" [ref=f4e431] [cursor=pointer]
              - button "Resueltas" [ref=f4e432] [cursor=pointer]
            - button "Añadir contenido comparativo 1" [ref=f4e434] [cursor=pointer]:
              - generic [ref=f4e437]: Añadir contenido comparativo
              - generic [ref=f4e438]: "1"
            - button "Entrar en fuentes citadas 1" [ref=f4e440] [cursor=pointer]:
              - generic [ref=f4e443]: Entrar en fuentes citadas
              - generic [ref=f4e444]: "1"
            - button "Aumentar prominencia de marca 1" [ref=f4e446] [cursor=pointer]:
              - generic [ref=f4e449]: Aumentar prominencia de marca
              - generic [ref=f4e450]: "1"
            - button "Entrar en comunidades 1" [ref=f4e452] [cursor=pointer]:
              - generic [ref=f4e455]: Entrar en comunidades
              - generic [ref=f4e456]: "1"
            - button "Aumentar visibilidad de marca +10 pt 3" [ref=f4e458] [cursor=pointer]:
              - generic [ref=f4e461]: Aumentar visibilidad de marca
              - generic [ref=f4e462]: +10 pt
              - generic [ref=f4e463]: "3"
            - button "Añadir bloque de cita 4" [ref=f4e465] [cursor=pointer]:
              - generic [ref=f4e468]: Añadir bloque de cita
              - generic [ref=f4e469]: "4"
            - button "Cerrar brecha con competidores 1" [ref=f4e471] [cursor=pointer]:
              - generic [ref=f4e474]: Cerrar brecha con competidores
              - generic [ref=f4e475]: "1"
            - button "Amplificar patrón positivo 1" [ref=f4e477] [cursor=pointer]:
              - generic [ref=f4e480]: Amplificar patrón positivo
              - generic [ref=f4e481]: "1"
            - button "Seguir competidor emergente 3" [ref=f4e483] [cursor=pointer]:
              - generic [ref=f4e486]: Seguir competidor emergente
              - generic [ref=f4e487]: "3"
  - alert [ref=f4e488]
  - generic [ref=f4e489]:
    - generic [ref=f4e490]: Informe confidencial
    - generic [ref=f4e496]:
      - generic [ref=f4e497]: Plan de acción GEO
      - heading [level=1] [ref=f4e498]: Optimización de visibilidad en respuestas de IA
      - paragraph [ref=f4e499]: Diagnóstico y hoja de ruta de 3 recomendaciones priorizadas para mejorar cómo la IA representa a la marca en sus respuestas.
    - generic [ref=f4e500]:
      - generic [ref=f4e501]:
        - generic [ref=f4e502]: Cliente
        - generic [ref=f4e503]: mozilla.org
      - generic [ref=f4e504]:
        - generic [ref=f4e505]: Fecha del escaneo
        - generic [ref=f4e506]: 29 ago 2026
      - generic [ref=f4e507]:
        - generic [ref=f4e508]: Puntuación GEO
        - generic [ref=f4e509]: 31 / 100
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