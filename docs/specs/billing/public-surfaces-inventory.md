# Superficies públicas afectadas por el contrato de 99 € (inventario, sin reescribir)

Origen: Director en #549 (2026-10-08, informe 6070059446, punto 4). **Solo inventario**: no se ha cambiado ninguna de estas
superficies, no se anuncia ninguna función no implementada y no hay envíos, configuración de Resend ni escrituras en Stripe.
Fuente: lectura del código de `feat/contract-99-local` (c7faa65) y de `origin/main` (c6dcfc6). No se han abierto páginas desplegadas.

## 1. Lo que `main` aún dice y la rama del contrato ya cambia (B1b)
| Dónde (`main`) | Qué dice | En la rama del contrato |
|---|---|---|
| `app/docs/planes-y-limites/page.tsx:33` | «de esas tres variables, **nunca de un precio plano**» | Reescrito (B1b), con el precio leído de `PLANS` |
| `app/pricing/plans-data.ts:237` (FAQ) | «el valor está en cuánto monitorizas, **no en un precio plano**. Pagas por prompts × motores × frecuencia» | Reescrito |
| `app/pricing/plans-data.ts:165,203` | Pro «5 dominios · ~100 prompts», matriz con 4 columnas (~10/~25/~100/~300) | Pro 3 dominios · 75 prompts en total; matriz de 2 columnas |
| Comparativas que leen `PLANS` (precio de Pro, prompts) | 179 €/mes y ~100 prompts | Leen `PLANS`: 99 € y 75 |

## 2. Lo que sigue desactualizado **también en la rama del contrato** (no reescrito)
Cada fila: fichero:línea · qué afirma · por qué choca con el contrato · de qué depende arreglarlo.

| Fichero:línea | Afirmación | Choque | Depende de |
|---|---|---|---|
| `app/signup/page.tsx:44` | «7 días de prueba gratis de Pro, sin tarjeta.» | La prueba aprobada es de **14 días, opt-in, tras el diagnóstico** | B5 (esquema): **hoy es verdad** (`handle_new_user` da 7 días) |
| `app/signup/confirm/page.tsx:38` | «empezar tu prueba de Pro» | idem | B5 |
| `lib/seo/llms-txt.ts:72` | «registro con 7 días de prueba de Pro» | idem (lo leen motores de IA) | B5 |
| `lib/landing/home-faq.ts:48` | El escaneo completo «con tu cuenta gratis, repite la comprobación en **Gemini y Claude**» | El plan **Free es 1 motor** (`plans-data.ts`, y `app/que-es-genscore/page.tsx:54` dice «sobre un motor») | Editorial; **no depende de B5** |
| `lib/comparativas/genscore-vs-otterly.ts:65` y `genscore-vs-peec-ai.ts:43` | Usuarios: «1 (**ilimitados desde Starter**)» | Starter ya no se ofrece; no consta qué incluye Pro | Decisión de producto (usuarios) |
| `lib/comparativas/genscore-vs-peec-ai.ts:31` | «3 motores incluidos sin coste extra **desde el plan Starter**» | idem | Editorial |
| `lib/comparativas/genscore-vs-profound.ts:48` | «**Una cuenta de Agencia** sigue varios dominios de cliente» | Agencia no se ofrece | Editorial / decisión sobre Agencia |
| `lib/comparativas/alternativas-a-otterly.ts:63` | «los usuarios ilimitados llegan …» (desde Starter) | idem | Editorial |
| `app/blog/como-aparecer-en-perplexity/page.mdx:103,114` | «El plan **Starter** incluye 25 prompts mensuales … Starter cuesta **49 €/mes**» | Starter ya no se ofrece, y 49 € **no coincide ni con los 45 € que tenía** | Editorial (artículo con fuentes) |
| `lib/glosario/terms.ts:151` | «diaria o semanal, **según el plan**» | Con un plan de pago, semanal | Editorial menor |
| `app/pricing` (código) | La rama «Agencia no se contrata online» sigue en el componente | Inerte con un solo plan listado | Limpieza |
| `components/landing/landing-page.tsx` (maqueta de producto) | Marcas reales con cifras de ejemplo bajo «Sin demos preparadas» | Ver §3 | **Decidido: se queda así** |

No encontré otras menciones a 179/59/449/19/45 €, «100 prompts», «5 dominios» ni «a diario» en `app/`, `components/` ni `lib/` fuera de
tests, comentarios y los ficheros de plan. **No he revisado el contenido de cada artículo del blog ni de cada página de docs** más allá de
esa búsqueda de patrones: una afirmación que no encaje en esos patrones no aparece aquí.

## 3. Maqueta de producto de la portada: decisión del dueño, sin cambios
Hecho (procedencia, para el mapa de claims): usa marcas reales (IKEA, Leroy Merlin, Kave Home, Maisons du Monde, El Mueble) con cifras
**ilustrativas** inventadas, declaradas así solo en comentarios de código, bajo el titular «Esto es exactamente lo que tienes el primer día. Sin
demos preparadas…».
**Decidido por el dueño (2026-10-09 00:24, transmitido por el Director en #549, comentario 6070273863): «No es necesario. Se queda así».**
No se aplican cambios ni se vuelve a plantear la propuesta de rotulado. Se conserva constancia de que **esas cifras no son evidencia de ningún
cliente** ni una promesa de resultados.

## 4. Qué NO está en este inventario
Correos (ver `email-inventory.md`), el estado desplegado en producción (puede diferir de ambas ramas) y el contenido que no coincide con los patrones
buscados.
