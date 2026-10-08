# Stripe: procedimiento LIVE seguro (nada ejecutado desde esta sesión)

**Estado real:** el Stripe de producción es LIVE (confirmado por el dueño). Esta sesión no tiene
claves ni red hacia Stripe y no las pedirá. Todo lo de abajo lo ejecuta el dueño; el agente solo
lo ha escrito y revisado.

## 0. Reglas (no negociables)
1. **Ninguna herramienta del agente escribe en Stripe**: ni Price, ni cupón, ni cliente, ni
   suscripción, ni Checkout, ni webhook, ni reembolso.
2. **Ninguna clave pasa por el chat ni por un comentario.** Si hace falta una clave para leer,
   es una **clave restringida (`rk_live_…`) de solo lectura**, creada por el dueño, usada en su
   máquina y revocada al terminar.
3. Los scripts del repo (`scripts/stripe-tax-audit.mjs` en el PR de seguridad) **rechazan claves
   `sk_live_` a propósito**; no se les da una clave LIVE.
4. Cualquier cobro real de prueba exige consentimiento previo y por escrito del dueño (§4).

## 1. Inventario de solo lectura (dueño, ~10 min)
Crear en *Developers → API keys → Create restricted key* una clave **solo lectura** con permiso
*Read* únicamente en: Products, Prices, Coupons, Promotion codes, Subscriptions, Webhook
endpoints, Tax settings, Tax registrations. Nada en *Write*. Anotar y **borrar la clave al acabar**.

Todo con `GET` (no cambia nada). Sustituir `$RK` por la clave en tu shell, sin pegarla en ningún sitio:

```bash
curl -s -u "$RK:" "https://api.stripe.com/v1/prices?active=true&limit=100"      # tax_behavior, unit_amount, currency, recurring, product
curl -s -u "$RK:" "https://api.stripe.com/v1/products?active=true&limit=100"    # tax_code por producto
curl -s -u "$RK:" "https://api.stripe.com/v1/tax/settings"                      # defaults.tax_behavior, tax_code, head_office, status
curl -s -u "$RK:" "https://api.stripe.com/v1/tax/registrations?status=active"   # ¿registro de España/UE activo?
curl -s -u "$RK:" "https://api.stripe.com/v1/coupons?limit=100"                 # redeem_by, percent_off/amount_off, times_redeemed
curl -s -u "$RK:" "https://api.stripe.com/v1/webhook_endpoints"                 # url, enabled_events, status
curl -s -u "$RK:" "https://api.stripe.com/v1/subscriptions?status=all&limit=100" # recuento por price/estado (Q5: cuentas pro existentes)
```

**Qué comprobar y qué significa cada resultado**

| Campo | Valor esperado | Si no |
|---|---|---|
| Price de Pro: `unit_amount` / `currency` / `recurring.interval` | `9900` / `eur` / `month` | es otro importe → no es el contrato |
| Price de Pro: `tax_behavior` | `inclusive` | `exclusive` o `unspecified` → **99 € no es el total final**: Stripe suma el IVA encima (≈119,79 € con 21 %). Hace falta Price nuevo (§2). `tax_behavior` no se puede cambiar una vez fijado |
| `tax/settings` | `status: active`, origen y código fiscal de servicio digital definidos | Stripe Tax no calcula: el total no lleva IVA coherente |
| `tax/registrations` | registro activo para España (o OSS) | Stripe no recauda IVA; fiscalidad con el asesor |
| Cupones con `redeem_by` futuro y `times_redeemed` | ninguno aplicable a Pro | un cupón vivo seguiría rebajando el precio unificado |
| Webhook | URL de producción, eventos de suscripción/factura | faltan eventos → estados de facturación obsoletos |

Devolver al agente **solo** la tabla rellenada (sin IDs de cliente, emails ni claves).

## 2. Si el Price de Pro no es `inclusive`: Price nuevo (dueño, en el Dashboard)
1. *Product catalog → Pro → Add another price*: 99,00 EUR, *Recurring monthly*, **Tax behavior: Inclusive**.
2. **No editar ni archivar el antiguo todavía**: las suscripciones existentes siguen en él.
3. Copiar el ID nuevo y cambiar `STRIPE_PRICE_ID_PRO` en Vercel **en el entorno Preview primero**.
   Un cambio de variable solo surte efecto tras un redeploy.
4. Verificación sin cobrar (§3). Solo entonces, producción, en una ventana de bajo tráfico.
5. Migración de suscriptores existentes: decisión aparte (Q5), nunca implícita.

**Reversión:** restaurar la variable al ID anterior y redeploy; archivar (`active=false`) el
Price nuevo, nunca borrarlo. Las suscripciones creadas con el nuevo siguen vivas y se gestionan a mano.

## 3. Verificar el total que ve el comprador, sin cobrar (dueño)
1. Con el Price nuevo ya en Preview, iniciar *Empezar suscripción* desde esa URL de Preview con
   una cuenta de prueba **y abandonar en la pantalla de Stripe**. Abrir Checkout no cobra; la
   sesión caduca sola.
2. Con una dirección de España, anotar en una captura (sin datos de tarjeta): total, línea de IVA
   «incluido» y moneda. Debe poner **99,00 € con IVA incluido**, no 99 € + IVA.
3. Comprobar el texto de renovación en la propia pantalla y, tras un cobro real (§4), el PDF de factura.
   Prorrateo y cambio de plan: no se pueden comprobar en LIVE sin una suscripción real; se prueban
   solo con el cobro del §4 o se dejan como «sin verificar».

## 4. Cobro real de prueba: coste y consentimiento
Es la única forma de ver factura, recibo, renovación y webhook reales de punta a punta. Tiene
efectos que no se deshacen:
- **Dinero real**: 99 € a una tarjeta del dueño. Un reembolso devuelve el importe, **no la
  comisión de Stripe** (no se recupera).
- **Documento fiscal real**: queda una factura con numeración correlativa, IVA devengado y, al
  reembolsar, una nota de abono. Debe verlo el asesor.
- **Datos reales**: cliente y suscripción en LIVE; cancelar no los borra.
- Dispara los webhooks de producción (correos incluidos): solo con el PR de seguridad (#549) y su
  migración 0038 ya aplicados, o los reintentos y duplicados no están protegidos.

Procedimiento si el dueño lo aprueba: cuenta propia, un solo cobro, cancelar y reembolsar en el
acto desde el Dashboard, guardar factura y nota de abono, y anotar el coste total. **Sin
consentimiento explícito y por escrito, no se hace.** Alternativa sin cargo: dejar B8 como
«sin verificar» y declararlo.

## 5. Lista mínima de seguridad LIVE
- [ ] Clave restringida de solo lectura, caducidad anotada; revocada tras el inventario.
- [ ] Ningún `sk_live_` en ningún script, comentario, captura o variable de Preview.
- [ ] Price antiguo intacto hasta que haya plan de migración de suscriptores.
- [ ] `STRIPE_PRICE_ID_PRO` cambiado primero en Preview; producción solo tras §3.
- [ ] Migración 0038 aplicada y #549 desplegado **antes** de cualquier cobro real o reenvío de eventos.
- [ ] Cupones antiguos de Pro sin `redeem_by` futuro aplicable.
- [ ] Asesor informado del Price nuevo y del cobro de prueba, si lo hay.
- [ ] Cada paso con su evidencia (captura o tabla) devuelta al agente; lo no comprobado se declara como tal.

## 6. Reparto
| Paso | Quién | Verificación |
|---|---|---|
| Inventario de solo lectura | dueño | tabla del §1 |
| Price nuevo y variable en Preview | dueño | captura del Checkout (§3) |
| Cambio en producción | dueño | segunda captura + variable verificada |
| Cobro de prueba | dueño, con consentimiento | factura + nota de abono |
| Revisión de resultados y actualización de los textos | agente | tests y capturas del repo |
