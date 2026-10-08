# Precio único de 99 €/mes (IVA incluido) — propuesta, NO ejecutada

**Estado:** propuesta para decisión del dueño. **No crea ningún Price ni cupón, no toca
Stripe, no migra producción, no despliega.** Este documento no cambia código.

**Origen:** comentario «Director» en el PR #549 (2026-10-08), que cita la decisión de
Denis por WhatsApp: *«99 para todos. No hay clientes aún.»* Un precio único de
**99 €/mes con IVA incluido** sustituye a las escalas actuales (Starter 45 €, Pro 179 €,
Agencia 449 € «a medida») y a las promos (19 € / 59 €). No hay que decidir otra vez a qué
plan corresponde el 99: es el único precio. La decisión de precio **no** autoriza ejecutar
nada (ver §8).

**Hechos que se asumen y que conviene no olvidar:** «cero clientes» es una afirmación sobre
clientes de pago. Sigue habiendo cuentas técnicas, pruebas en curso y cuentas *comped*
(`COMPED_ACCOUNT_EMAILS`), y la gracia futura (Stripe live aún no está activo) no se elimina.
Por eso §3 inventaría antes de retirar nada.

---

## 1. Dónde viven hoy los precios

- **Fuente única:** `app/pricing/plans-data.ts` (`PLANS`, `PLAN_MATRIX`, `PLAN_FAQ`,
  `PROMO_ENDS_AT`, `isPromoActive`). Tras TRUST-PROMISES-1 (log §182) el hero, `/precios`,
  las comparativas, la consola y los correos **leen** de ahí. Una búsqueda de `179`, `449`,
  `45 €`, `19 €`, `59 €` en `app/ lib/ components/` solo encuentra **comentarios**, no copy.
- **Stripe (fuera del repo):** un Price recurrente por plan de autoservicio
  (`STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_PRO`) y un cupón por plan
  (`STRIPE_COUPON_ID_STARTER_PROMO`, `STRIPE_COUPON_ID_PRO_PROMO`). Mapeo en `lib/stripe.ts`
  (`getPriceIdForPlan`, `getPlanIdForPriceId`, `getActivePromoPlanIds`).
- **Consumidores de promo:** `/precios`, modal «Cambiar de plan», «Tu plan», índice de
  Ajustes, tira del hero (`session-ctas.tsx`), correos del ciclo de vida
  (`lib/email/lifecycle/offers.ts`), `createCheckoutSession` (descuento).

## 2. IDs técnicos que NO se pueden romper a ciegas

Son distintos del nombre público y del Price de Stripe. Tres capas independientes:

| Capa | Hoy | Quién la lee |
|---|---|---|
| **ID técnico** (`profiles.current_plan`) | `free`, `starter`, `pro`, `agency` — `CHECK` en `supabase/migrations/0010_profile_current_plan.sql` | 23 ficheros de `app/ lib/ components/`; puertas `isProOrAbove` (`pro` o `agency`); cadencia (`data-maturity.ts`: `starter` = semanal); cuentas *comped* = `agency`; plan por defecto de una cuenta nueva = `pro` (prueba de 7 días, migración 0017); barrido y vigilante (`free` se excluye) |
| **Nombre público** | Free / Starter / Pro / Agencia | copy |
| **Price de Stripe** | `starter`, `pro` (env) | checkout, webhook |

**Regla de la propuesta:** cambiar el precio y lo que se *vende* no exige tocar el ID
técnico. Mientras el inventario del §3 no esté hecho, **`starter` y `agency` siguen siendo
válidos en BD y en código** (no se elimina el `CHECK`, no se renombra nada, el webhook
sigue entendiendo un `price_id` desconocido sin romper). Simplemente dejan de ofrecerse.

## 3. Inventario previo (solo lectura; lo ejecuta el dueño, no esta sesión)

Antes de retirar nada, comprobar en una base de **prueba** y luego en producción con
aprobación:

```sql
-- ¿Quién está en un plan que dejaría de ofrecerse?
select current_plan, count(*) from profiles group by 1 order by 2 desc;

-- ¿Hay suscripciones de Stripe enlazadas (live o test)?
select count(*) filter (where stripe_subscription_id is not null) as con_suscripcion,
       count(*) filter (where stripe_customer_id     is not null) as con_cliente
from profiles;

-- Pruebas en curso (no se las puede dejar sin la gracia prometida)
select count(*) from profiles
where trial_ends_at is not null and trial_ends_at > now() and stripe_subscription_id is null;
```
Y en el Dashboard de Stripe (test y live, sin cambiar nada): suscripciones activas, y los
Prices/cupones actuales, para decidir si se archivan (nunca se borran).
Además: `COMPED_ACCOUNT_EMAILS` (qué plan técnico reciben) y las cuentas piloto.

## 4. Propuesta de configuración (diff conceptual, sin aplicar)

**Código (un PR posterior, tras aprobación):**
- `plans-data.ts`: el único plan de pago pasa a `price: 99`, sin `promoPrice`.
  `starter` y `agency` se marcan **no listados** (`listed: false`): siguen en `PLANS` para
  que el ID técnico se reconozca, pero no salen en `/precios`, el modal, la matriz ni las
  comparativas. Sin `promoPrice`, `resolveShownPromoPrice` ya devuelve `null` y todas las
  superficies de promo se ocultan solas; después se puede retirar la maquinaria de promo
  (`isPromoActive`, `PROMO_ENDS_AT`, cupones) en un PR aparte, con sus tests.
- `lib/stripe.ts`: **un** Price y un mapeo. `STRIPE_PRICE_ID_PRO` apunta al Price nuevo;
  `STRIPE_PRICE_ID_STARTER` y los `STRIPE_COUPON_ID_*` se dejan sin definir (el mapeo ya
  tolera variables ausentes). No hay Price «legacy» que conservar porque no hay cohorte de
  pago; si el inventario §3 dice lo contrario, se añade `STRIPE_PRICE_ID_PRO_LEGACY` solo
  para reconocer suscripciones existentes en el webhook.
- `PLAN_FAQ`, copy de la prueba y de registro: salen de una única política (PR 2 del plan
  aprobado); aquí solo cambia la cifra.

**Stripe (a mano, tras aprobación; nada de esto lo hace esta sesión):**
- 1 Product con tax code SaaS que confirme el dueño/asesor en el catálogo de Stripe Tax.
- 1 Price: `unit_amount` 9900, EUR, mensual, **`tax_behavior: inclusive`**.
- 0 cupones. Los Prices y cupones antiguos se **archivan**, no se borran.

## 5. Producto del precio único: cuadro de diferencias, coste y contrato mínimo

> **Corrección (Director, 2026-10-08).** La primera redacción de este apartado comparó el
> precio con «Pro a su tope» (~$61/mes) y «Agencia a su tope» (~$184/mes). Esas cifras
> (`docs/llm-cost-analysis-2026-08.md`, «Proyección a tope de plan») son **por proyecto,
> cadencia diaria, `samples: 1`, y solo generación + extracción**. No describen la oferta
> semanal que se discute, y comparar «diario 300» con «semanal 75» como si fueran el mismo
> producto era un error. Se retira la recomendación «cuotas de Pro actuales». Lo que sigue
> es un **candidato a revisar**, no una decisión, y **no cambia ningún derecho ni cuota
> en producción**.

### 5.1 El candidato y lo que ya existe en el código

| Elemento | Candidato (Director) | Hoy en el código | Trabajo nuevo si se adopta |
|---|---|---|---|
| Dominios | 3 | `caps.projects` (Free 1, Starter 1, Pro 5, Agencia 999) | un plan con `projects: 3` |
| Preguntas | **75 TOTALES** (reparto libre entre dominios) | `caps.prompts` se aplica **por proyecto** (`lib/projects/add-prompts.ts`, `prompts/page.tsx`, `run-creation.ts`) | **una regla nueva de bolsa de cuenta**; hoy no existe |
| Motores | 3 | `caps.engines` = 3 | ninguno |
| Cadencia | semanal | `Starter` = semanal, el resto diario (`lib/scan/cron.ts`, `data-maturity.ts`) | cadencia por plan ya soportada; hay que decidir su ID técnico |
| Recheck manual | 1 por dominio y mes | el botón de escaneo manual existe; **no hay contador mensual** | contador por dominio/mes (probablemente esquema) |
| Prueba | **14 días, opt-in, iniciada tras el primer escaneo completado**, más un diagnóstico acotado aparte | **7 días de Pro sin tarjeta desde el registro** (`handle_new_user`, migración 0017) | cambio del disparador de la prueba (esquema/trigger) y del texto |
| Fallo de pago | requiere una política | Stripe reintenta; acceso hasta que cancela; solo un correo (`invoice.payment_failed`) | `past_due` visible (aprobado para el PR 2) + política de gracia |

Nada de esto se adopta por ser «lo actual». El 7 días diario de Pro **no** es la propuesta:
es el estado de hoy.

### 5.2 Coste: cómo se obtiene y qué no cubre

Coeficientes del documento de costes (los mismos que usa el Director):
- Generación + extracción por pregunta (3 motores): ≈ **$0,0203** (≈ $0,16/escaneo ÷
  ≈ 7,9 preguntas; coincide con los 0,02036 del comentario). Ojo con la etiqueta: **es
  generación y extracción juntas**, no solo generación.
- Auditoría de cobertura IA: ≈ **$0,035** por pregunta (peor caso, $0,28 por ~8 preguntas;
  el documento la marca como **no medida**).
- Escaneos al mes por dominio: ≈ 4,33 semanales + 1 recheck ≈ **5,3**.

| Concepto | Cálculo | USD/mes |
|---|---|---|
| Generación + extracción | 3 dominios × 25 × 0,02036 × 5,3 | ≈ 8,09 |
| Auditoría de cobertura | 3 × 25 × 0,035 × 5,3 | ≈ 13,91 |
| **Suma** | | **≈ 22,0** |
| Referencia: 99 € con IVA | ≈ 81,8 € netos **si fuese 21 %** (ilustrativo) | — |

La suma es **~25-27 % de los netos** tomando 1 USD ≈ 1 € como aproximación gruesa. **No es
una factura ni un margen asegurado:** no incluye comisiones de pago, soporte, onboarding,
generador de soluciones, reintentos, ni el IVA real de cada comprador.

**El suelo de 50 respuestas rompe la linealidad** (`lib/scan/sampling.ts`,
`MIN_RESPONSES_PER_RUN = 50`, `MAX_PROMPT_SAMPLES = 5`): solo actúa por debajo de **17
preguntas por dominio** (17 × 3 = 51), y entonces repite cada pregunta hasta llegar a 50
(`samples = min(ceil(50 / (preguntas × motores)), 5)`).
- 25 + 25 + 25 → todos cumplen el suelo → sin recargo.
- Un dominio de 10 preguntas cuesta como 20; uno de 5, como 20; uno de 1, como 5.
- **Peor reparto dentro de las 75 totales:** dos dominios de 16 (cuestan 32 cada uno) y
  uno de 43 → ≈ **107 preguntas-equivalentes en vez de 75 (+43 %)** en generación y
  extracción. Si la auditoría no se repite por muestra (**sin verificar**), el total
  sube de ≈ 22,0 a ≈ 25,5 USD/mes.
- Es decir: **menos preguntas por proyecto no abaratan, pueden encarecer.** Hay que decidir
  si la bolsa de 75 impone un mínimo por dominio, si el suelo se desactiva para este plan, o
  si se acepta el recargo.

**Sin medir (y no se inventa):** p95 de respuestas por escaneo, de reintentos y de tokens
por llamada, y la tasa real de uso de la auditoría. Hoy el documento de costes solo tiene
medias. Consulta de solo lectura para el dueño, **no ejecutada** (los nombres de columna
salen de `0001_v0_schema.sql`; revisarlos antes):

```sql
select percentile_cont(0.95) within group (order by n) as p95_respuestas_por_run
from (select run_id, count(*) n from scan_prompt_results group by run_id) t;
-- y lo mismo con sum(tokens_in + tokens_out) por run, y con la tasa de filas con extraction_error
```

### 5.3 Diferencias de producto (no son el mismo producto)

| | Pro diario hasta su tope | Agencia diario hasta su tope | **Candidato semanal 75** |
|---|---|---|---|
| Dominios | 5 | 999 (a medida) | 3 |
| Preguntas | ~100 **por proyecto** | ~300 **por proyecto** | 75 **en total** |
| Cadencia | diaria | diaria | semanal + 1 recheck/dominio/mes |
| Coste LLM de referencia* | ≈ $61/mes por proyecto | ≈ $184/mes por proyecto | ≈ $22/mes en total |

\*Solo generación + extracción en las dos primeras columnas (el documento no incluye la
auditoría); en la tercera sí incluye auditoría. No son cifras homogéneas: sirven para ver
el orden de magnitud, no para restar.

### 5.4 Contrato mínimo para revisión (propuesta; ningún valor está decidido)

| Cláusula | Valor propuesto | Estado |
|---|---|---|
| Precio | 99 €/mes, IVA incluido, para todos | **decidido** |
| Dominios · preguntas · motores | 3 · 75 totales · 3 | candidato |
| Cadencia | semanal + 1 recheck manual por dominio y mes | candidato |
| Mínimo de preguntas por dominio / suelo de 50 | **sin definir** (ver §5.2) | abierto |
| Prueba | 14 días, opt-in, iniciada tras el primer escaneo completado | propuesta |
| Diagnóstico acotado previo | aparte de la prueba (hoy: escaneo Free y comprobador gratuito) | propuesta |
| Fallo de pago | `past_due` visible, enlace al portal, **N días de gracia: sin definir**, corte al cancelar Stripe | propuesta |
| Cancelación | al final del periodo, vía portal | mantiene lo actual |
| Qué NO incluye | más dominios o preguntas; diario; soluciones ilimitadas: **sin definir** | abierto |
| Cuentas existentes (`starter`/`agency`/*comped*) | intactas hasta el inventario §3 | mantiene lo actual |

«Cero clientes de pago» no elimina la necesidad de una política de fallo de pago: hace
falta antes de activar Stripe live.

## 6. Impuestos y comprador

- El precio público es **bruto**. Con `tax_behavior: inclusive` el total del comprador es
  99 € y el impuesto se *extrae*; con `exclusive` se *sumaría* (≈119,79 € a 21 %), lo que
  rompería el copy. **No se verifica hasta tener acceso de lectura a Stripe test** (el
  script de solo lectura `scripts/stripe-tax-audit.mjs` vive en el PR #549).
- **No se asume 21 % para todos.** Lo decide Stripe Tax según país, tipo de comprador
  (particular/empresa con NIF-IVA, inversión del sujeto pasivo), registros fiscales (OSS) y
  tax code. Supuesto de las comprobaciones: particular en España; empresa UE con NIF-IVA y
  comprador fuera de la UE son casos aparte, sin probar.
- Pendiente de verificar: `tax_behavior`/valor por defecto, tax code, registros, y el total
  en alta, renovación, prorrateo y descuento. Una preview de alta no demuestra renovación ni
  prorrateo (relojes de prueba o suscripción de test).

## 7. Matriz de pruebas

| # | Área | Caso | Resultado esperado | Dónde |
|---|---|---|---|---|
| 1 | Precio | `/precios`, hero, comparativas, correos, consola | solo «99 €/mes» IVA incluido; ningún 45/179/449/19/59 | test de coherencia leyendo `PLANS` |
| 2 | Precio | no hay `promoPrice` en ningún plan | ninguna superficie pinta precio tachado | unit + render |
| 3 | IDs | cuenta con `current_plan = starter`/`agency`/*comped* | sigue resolviendo sus cuotas y puertas; no se rompe | `lib/billing.test.ts` |
| 4 | IDs | `price_id` desconocido en el webhook | se ignora sin error, sin tocar el perfil | webhook |
| 5 | Checkout | plan de pago → sesión con el Price único, sin `discounts` | una sola línea, sin cupón | `actions.test.ts` |
| 6 | Seguridad | `changePlan(<pago>)` desde Free | rechazado en servidor (ya cubierto en #549) | `actions.test.ts` |
| 7 | Prueba | alta nueva → 7 días de Pro, fecha de fin visible, sin cargo sin método de pago | texto de la política única | PR 2 |
| 8 | Estados | `trialing`/`active`/`past_due`/`canceled`/`free` | etiqueta correcta; una prueba nunca se llama «Activo» | fixtures PR 2 |
| 9 | Fallo de pago | `invoice.payment_failed` → `past_due` visible + enlace al portal | aviso; acceso según la política elegida | PR 2 |
| 10 | Promo vencida | tras retirar la promo | sin copy de promo ni cupón | test de coherencia |
| 11 | Impuestos | alta ES particular | total 99 € con IVA incluido | Stripe test (pendiente) |
| 12 | Impuestos | renovación / prorrateo / descuento | total coherente | reloj de prueba (pendiente) |

## 8. Puertas — qué NO hace esta propuesta

Sin crear Price ni cupón, sin cambiar Stripe, sin migrar producción, sin desplegar, sin
fusionar. El dueño aprueba cada puerta por separado: (1) inventario §3, (2) decisiones §5,
(3) verificación fiscal §6 con claves **solo por vault** (nunca en chat ni comentarios),
(4) PR de código, (5) creación de Price en Stripe test, (6) live (checklist de
`docs/launch-plan.md` Fase 4).

## 9. Orden propuesto

1. PR #549 (seguridad) — en curso, independiente de este precio.
2. PR 2 de «Unificar prueba, precios y estado de facturación» con el precio único ya
   dentro de la política (una sola cifra, un solo Price, `past_due` visible).
3. Retirada de la maquinaria de promo y de los planes no listados, solo tras el inventario.
