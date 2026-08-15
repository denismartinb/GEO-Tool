# Growth & Distribution Plan — primeros usuarios gratuitos

**Estado: PROPUESTA — pendiente de aprobación del fundador (2026-08-15).**
Ninguna fase de este documento se ejecuta hasta aprobación explícita, parte
por parte. Complementa la Fase 5 (LAUNCH, bloques C/D) y GROWTH-2 de
`docs/launch-plan.md`; no los sustituye ni los reordena.

Versión visual con diagramas presentada al fundador como artefacto
(2026-08-15). Este fichero es la copia de registro para futuras sesiones.

---

## La recomendación en una frase

No comprar tráfico todavía: **el producto fabrica la pieza de venta**. Un
informe real de visibilidad en IA de la marca de un prospecto es más
persuasivo que cualquier anuncio, cuesta ~1 escaneo y no requiere ninguna
creatividad. Cuatro semanas de canales a coste cero (outreach con informes
reales + LinkedIn orgánico + directorios + comunidades), y solo después SEM
de alta intención en Google con tope de 300–600 €/mes. Meta/Instagram Ads
descartados por ahora (fábrica continua de creatividades sobre audiencia sin
intención — justo lo que el fundador pidió minimizar); LinkedIn Ads
descartado (CPL ≈ 100 $+, incompatible con tickets de 45–179 €/mes).

## De qué partimos (por qué estos canales y no otros)

- Oferta gratuita fuerte: escaneo gratis permanente + reverse trial Pro 14
  días sin tarjeta — ideal para tráfico frío.
- Motor orgánico GROWTH-1/2 ya operativo (blog, docs, glosario,
  comparativas, JSON-LD, llms.txt) — siembra a semanas vista; este plan
  cubre los canales que dan señal en días.
- ICP primario: agencias SEO/marketing en castellano (España/LATAM). El
  launch-plan ya fija D1 (3–5 agencias a mano) antes de difusión pública;
  este plan lo respeta y lo convierte en el primer canal.
- Restricción del fundador: mínimo coste, mínima configuración, mínimas
  piezas creativas.

## Prerrequisito (antes de gastar un euro o una hora)

Instrumentar los 3 eventos explícitos de funnel en PostHog (registro
completado → primer escaneo → upgrade) — la tarea **C5** pendiente del
launch-plan — y acordar convención UTM por canal. PR pequeño, sin esquema.
Sin esto, en la semana 4 no se sabe qué canal funcionó.

## Fase G1 — semanas 1–4, coste 0 €

- **G1a · Outreach con informe real (canal principal).** Lista de 20–30
  objetivos (las agencias de D1 primero). Por cada uno: escaneo real de su
  marca o la de un cliente insignia → mensaje corto con 2–3 hallazgos
  concretos → enlace al informe y al escaneo gratis. Lo agéntico prepara
  cada dossier (escaneo + hallazgos + borrador de mensaje); el fundador
  revisa y envía. Cada conversación devuelve además feedback de producto.
- **G1b · LinkedIn orgánico build-in-public** (adelanta el arranque de D3):
  2–3 posts/semana en castellano con datos reales del producto.
- **G1c · Directorios IA/SEO + Product Hunt.** Rendimiento directo modesto
  (evidencia reciente: directorios en frío traen poco), pero coste de una
  tarde y efecto estratégico: los directorios son fuentes que los motores
  generativos citan → mejora la propia presencia de GenScore en respuestas
  de IA, medible con GenScore (dogfooding, material para G1b).
- **G1d · Comunidades SEO/marketing en castellano** (Forobeta, grupos
  Telegram/Slack, newsletters/podcasts). Aportar antes de enlazar. Es lo
  primero que se recorta si falta tiempo — nunca G1a.

**Puerta G1→G2:** ¿20–30 registros orgánicos y convierten a primer escaneo?
Si no: corregir mensaje/landing, no avanzar de fase.

## Fase G2 — mes 2, SEM Google Search (300–600 €/mes)

- Una campaña, 15–25 keywords de intención altísima en castellano,
  exact/phrase match, anuncios solo de texto, tope diario. Sin display, sin
  Performance Max, sin remarketing.
- Keywords tipo: «herramienta GEO», «medir visibilidad en ChatGPT»,
  «posicionamiento en IA generativa», «alternativa a Otterly/Peec/Profound»
  (aterrizando en `/comparativas`).
- Landing: el escaneo gratis, no la home.
- Contexto de coste: benchmarks EE. UU. sitúan el CPC B2B SaaS en ~9 $;
  la categoría GEO en castellano es naciente (poca puja, volumen bajo) —
  con este presupuesto el volumen bajo es ventaja.
- **Criterio de corte pactado antes de empezar:** si tras ~300 € el coste
  por registro con primer escaneo supera la referencia (15–25 €), se pausa
  y se revisan keywords.
- Condición previa del launch-plan: **A6 (solicitud EUIPO, ~850–900 €)**
  recomendada antes de marketing pagado con el nombre — resolver en el mes
  1 mientras corre G1.

## Fase G3 — mes 3+, escalar lo que midió G2

- Partnerships con agencias (el plan Agencia como canal de distribución;
  semillero: las conversaciones de G1a).
- Retargeting Meta de bajo coste sobre visitantes sin registro, si el
  volumen lo justifica (exigiría revisar la promesa cookieless de
  `/cookies`, hoy cierta).
- Programa de referidos — requeriría su propio Task Intake (toca planes y
  límites).

## Métricas semanales

| Métrica | Fuente |
|---|---|
| Visitas → registros por canal (UTM) | PostHog |
| Registros → primer escaneo completado | PostHog (evento C5) |
| Respuestas/reuniones del outreach G1a | Hoja simple |
| Coste por registro del SEM | Google Ads + PostHog |
| Presencia de GenScore en respuestas de IA | GenScore (dogfooding) |

## Qué necesita del fundador

1. Aprobación de este plan (o recorte — G1a solo ya es un plan válido).
2. C1–C4 del launch-plan verificados (D1 los requiere); C5 como primer PR.
3. La lista inicial de 20–30 prospectos de G1a.
4. Decisión EUIPO (A6) antes de encender SEM.
5. Su voz en LinkedIn (el agente growth borradorea; publica el fundador).

## Fuentes de los benchmarks (consultadas 2026-08-15)

- Kampaio, *B2B SaaS Google Ads Benchmarks 2026* — CPC B2B SaaS ~8,9 $.
- GrowthSpree, *SaaS Google Ads Benchmarks 2026* y *Google vs LinkedIn vs
  Meta for B2B SaaS* — bandas CPC/CPL; «Google captura demanda, LinkedIn la
  crea, Meta retargetea».
- Flyweel, *Cost Per Lead Benchmarks 2025* — CPL B2B: Google ~70 $,
  LinkedIn ~110 $.
- Indie Hackers, *23 days of distributing a SaaS* — directorios en frío
  rinden poco; comunidades con contexto compartido rinden más.
