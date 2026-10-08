# Evidencia B1b — superficies públicas del plan único de 99 €

**Etiqueta, sin ambigüedad: RENDER LOCAL DEL BUILD DE LA RAMA (`next build` + `next start` en
`localhost`).** No es el preview de Vercel, no hay sesión de usuario, no hay datos reales, no hay
Stripe y la clave de Supabase es ficticia. Todo el contenido sale de `PLANS`
(`app/pricing/plans-data.ts`). Las webfonts están bloqueadas (el script aborta toda petición que
no sea a `localhost`), así que la tipografía es la de reserva y no la real.

**Qué prueba:** que lo que estas pantallas públicas pintan hoy, a 390 y 1280 px, es coherente
con el contrato (un plan de pago, 99 €/mes IVA incluido, 3 dominios · 75 prompts · 3 motores ·
semanal, sin precio tachado ni fecha de campaña).
**Qué NO prueba:** ni checkout, ni IVA, ni ninguna interacción (no se pulsó nada: las imágenes
son render estático), ni la consola, ni el comportamiento en Vercel. «Una imagen no es una
prueba de interacción.»

Generadas con `capture.cjs` (Chromium del entorno, Playwright). Rama `feat/contract-99-local`;
el head exacto está en el informe del PR #549. Para repetirlo: `pnpm run build`, arrancar
`next start -p 3111` con `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY=cualquier-valor-ficticio` y ejecutar `node capture.cjs`.

| Fichero | Qué muestra | Qué se juzgó |
|---|---|---|
| `pricing-1280.png`, `pricing-390.png` | `/pricing` entera: tarjetas, matriz, FAQ | dos tarjetas equilibradas; matriz de dos columnas **sin deslizar a 390 px**; sin Starter ni Agencia |
| `docs-planes-1280.png`, `docs-planes-390.png` | `/docs/planes-y-limites` | tabla con Free y Pro; la escalera de subida ya no nombra Starter/Agencia |
| `home-top-1280.png`, `home-top-390.png` | cabecera de la home con la tira promocional | la tira ya no anuncia descuento |
| `hero-strip-1/2/3-{390,1280}.png` | las tres filas rotatorias de la tira, congeladas una a una | «14 días · de Pro, si quieres, sin tarjeta» (ronda 11: antes decía «Gratis · 7 días de Pro», que contradecía la propuesta de 14 días opt-in) · «99 €/mes, IVA incluido» · «3 dominios · 75 prompts · 3 motores · escaneo semanal» |

## Lo que estas capturas hicieron encontrar (y se corrigió)

1. **La matriz de `/pricing` a 390 px escondía la columna Pro** (tenía un ancho mínimo de 680 px
   pensado para cuatro planes) y yo había ocultado el aviso «Desliza…» para dos planes: nadie
   habría sabido que había que deslizar. Corregido (`.price-matrix-n2`).
2. **La FAQ aún preguntaba por el plan Agencia**, que ya no se ofrece. Retirada.
3. **Dos frases afirmaban un modelo de precio que ya no existe** («tu factura depende de esas tres
   variables, nunca de un precio plano», «pagas por prompts × motores × frecuencia»).
   Reescritas con texto mínimo y verdadero, con el precio leído de `PLANS`.
4. La tira del hero iba a pintar «undefined €/mes» al quitar el precio de lanzamiento (lo vi leyendo
   el código, no en una captura); se rehízo antes de capturar.
5. Mi script de capturas sacaba los fotogramas de la tira desordenados (la fila 2 mostraba la 3 y
   la 3 salía en blanco): error mío, corregido; las imágenes de este directorio son las buenas.

## Observado y NO tocado

- **Tabla de `/docs/planes-y-limites` a 390 px:** la columna «Refresco» queda fuera de pantalla
  (desborde horizontal). Ya era así antes de este cambio; no es de esta rama.
- **Texto editorial de `/pricing` que sigue hablando de escalones** y es del dueño decidirlo:
  titular «Paga solo por lo que necesitas», y las FAQ «¿Qué incluye la prueba de Pro?» y «¿Puedo
  cambiar de plan…?», que además contienen las frases falsas sobre facturación que corrige el
  PR de seguridad/PR 2.
- **«Hablar con ventas»** (banda final de `/pricing`, tarjeta de Agencia en la consola): son un
  camino de contacto, no un plan; si deben seguir existiendo es una decisión del dueño.
- **Contenido editorial fuera de `/pricing`** que cita Starter, precios o cuotas antiguas
  (artículos del blog, comparativas, glosario): inventariado en
  `docs/specs/billing/contract-99-implementation.md` §17; no se reescribe en silencio porque son
  afirmaciones sobre competidores y necesitan revisión de contenido.

## Sin capturar (no verificado)

La consola autenticada (selector «Cambiar de plan», puerta de exceso de dominios, «Tu plan»,
asistente de alta): necesitan sesión y datos. El cambio en ellas es mínimo (Starter deja de
ofrecerse y el que ya lo tiene lo sigue viendo; probado con tests unitarios de
`plansOfferedTo`), pero **su aspecto no se ha visto**.

## Límites de estas imágenes (no afirman más)

Son capturas de un build local con Supabase ficticio: **no** demuestran un checkout, ni que la prueba
de 14 días funcione (el texto va por delante del producto hasta B5: no desplegar antes), ni nada de
Stripe. El Checkout real de 99 € con IVA incluido no se ha visto: el entorno no tiene salida a
Stripe ni a Vercel (403 del proxy) y no hay clave; ver `../../stripe-live-procedure.md` §3.

