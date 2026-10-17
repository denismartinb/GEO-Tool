---
description: Invariantes del comprobador y la landing de comercio agéntico.
paths:
  - "lib/agentic-audit/**"
  - "app/comercio-agentico/**"
  - "app/api/comercio-agentico/**"
  - "components/agentic/**"
---

# Comercio agéntico — invariantes

Se inyectan solos al tocar `lib/agentic-audit/**`,
`app/comercio-agentico/**`, `app/api/comercio-agentico/**` y
`components/agentic/**`. Cada regla es trazable a
`docs/adr/0043-agentic-visibility-score.md` o a
`docs/brand/design-decisions-log.md` §317, §318 y §319.

- **Nunca nos hacemos pasar por un agente.** Se pide como el bot de GenScore
  (`AUDIT_USER_AGENT`). Los anti-bots verifican a los agentes reales por IP o
  firma, así que copiar su user-agent no da su respuesta. El reto se cuenta
  como «tu web pone un reto a las visitas automáticas», nunca como «ChatGPT
  está bloqueado». El acceso por asistente sale sólo de robots.txt.
- **La lista de URLs es fija y del propio dominio.** La página que da el
  visitante, robots.txt, sitemap.xml, cuatro ficheros `/.well-known/` y, en
  Shopify o WooCommerce, una URL de catálogo (`interopProbePaths`). Ni un
  enlace seguido: eso sería un crawler, prohibido sin aprobación. Lo fija
  `run-audit.test.ts`. El checkout no se recorre: Compra mide sólo la ficha.
- **El guardián SSRF se importa de `lib/web-audit/fetch-page.ts`.** Cada salto
  de redirección se verifica antes de seguirlo, sólo https, nada de IP
  literales, sólo el dominio y sus subdominios.
- **Los pesos son del fundador**: 30/30/20/20 (`COMPONENT_WEIGHTS`), y dentro
  de cada componente los checks suman 100. Cambiarlos mueve todos los
  resultados y pide adenda al ADR 0043.
- **`unknown` no suma ni resta.** Lo que no pudimos medir se queda fuera de
  los dos lados. Un bloqueo a nuestra petición nunca puede leerse como fallo
  de la tienda: un reto anti-bots a nuestro robot es `unknown`, no `fail`
  (log §319), porque un agente verificado o con navegador puede pasarlo.
- **Siempre salen los cinco componentes** (fundador, log §319). El que no se
  puede medir lleva el círculo vacío y dice por qué; nunca desaparece.
- **Sin ficha de producto no hay nota total.** Comprensión y Compra se miden
  en una ficha; una portada no las suspende por no tener producto.
- **Interoperabilidad es «N de 4» y no entra en la nota.** Nunca se escribe
  «sin puntos» ni «informativo» (fundador, 2026-10-17). Un feed que no se ve
  desde fuera es `unknown`, nunca `absent`.
- **El comprobador cuenta en `public_checks` con `engine = 'agentic'`** y sus
  propios límites (`AGENTIC_CHECK_LIMITS`). El comprobador de ChatGPT excluye
  esas filas: uno no puede gastar los límites del otro. La fila se escribe
  antes de salir a la red y los límites fallan cerrado.
- **La landing no dice que Pro ya tiene la auditoría agéntica.** «Auditoría
  agéntica» lleva «Próximamente». El cierre del comprobador invita a probar
  Pro gratis (fundador, 2026-10-17, log §318), pero siempre con la línea «La
  auditoría agéntica completa llega muy pronto a la consola de Pro» hasta que
  la Fase 2 esté en producción.
- **La animación del comprobador sólo escenifica el ritmo** (log §318).
  Antes de la respuesta, sólo las URL que el servidor pide de verdad
  (`scan-script.ts` las saca de `interopProbePaths` y `ASSISTANT_ROBOTS_TOKENS`).
  Después, cada dato y cada estado salen de la respuesta. Nunca un porcentaje
  ni un valor de ejemplo. Si el motor añade o quita una comprobación, el guion
  cambia con él.
- **`facts` es texto de terceros.** Se limpia y se recorta en
  `page-facts.ts` y se pinta sólo como texto, nunca como HTML.
