# Contrato de 99 €/mes — delimitación de bloques e implementación local

**Rama:** `feat/contract-99-local`, creada desde `main`. **No** está apilada sobre el PR #549
(seguridad) ni arrastra cambios de otras sesiones.
**Alcance de esta rama:** preparación local y tests. **Nada se aplica fuera**: sin Price ni
configuración de Stripe, sin cobros, sin alertas ni cancelaciones, sin migraciones
ejecutadas en entornos externos (el SQL se escribe y se prueba **solo** en un Postgres
local), sin merge ni deploy. Nada de este documento aprueba activar el cobro.

## 1. Decisión registrada

Contrato confirmado por el dueño, tal y como lo transmite el comentario «Director» del PR
#549 (2026-10-08, citando su canal de WhatsApp: «confirmo el contrato99» y, tras corregir que
el reparto libre puede aumentar el coste interno por el suelo de muestreo —ejemplo 16 + 16 + 43
= 107 equivalentes—, «sí, mantengo»). El coste **no** es idéntico con reparto libre; no se
usa ese argumento.

| Cláusula | Valor |
|---|---|
| Precio | **99 €/mes, IVA incluido, para todos**; sin cohorte de pago *legacy* |
| Preguntas | **75 totales por cuenta**, repartidas libremente entre **hasta 3 dominios**; **sin mínimo por dominio**; el riesgo/coste del suelo actual está aceptado y **el muestreo no se retira en silencio** |
| Motores | 3 |
| Cadencia | escaneo **semanal** + **1 revisión manual al mes por cuenta**; no cuentan el primer escaneo ni los reintentos automáticos |
| Prueba | **opcional, 14 días, tras el diagnóstico**; no desde el registro ni sin opt-in |
| Fallo de pago | **gracia de 3 días** |

**Puertas que siguen siendo del dueño, por separado:** Price y configuración de Stripe;
fiscalidad (asesor) y prueba real en TEST; efectos en cualquier entorno externo; merge y
deploy; migraciones en producción. El #549 mantiene sus `KNOWN LIMITATIONS` y su integración
sigue sin verificar.

## 2. Lo que ya existe (verificado en el código, no supuesto)

- El tope de preguntas **ya se cuenta por cuenta** al añadir (RLS limita el conteo a los
  prompts del dueño en todos sus proyectos): `lib/projects/add-prompts.ts`,
  `prompts/page.tsx`, `getUsageSummary`. *(Una revisión previa de la propuesta decía «por
  proyecto»; era un error y está corregido.)*
- **Pero no se hace cumplir:** `createProject` limita los prompts iniciales al tope del plan
  sin restar los que la cuenta ya tiene; `addPromptsCore` comprueba `count >= tope` y luego
  inserta un lote entero (puede pasarse); la acción `addPrompt` de
  `app/dashboard/projects/[projectId]/actions.ts` inserta **sin ninguna comprobación**; y todo
  es lectura-luego-escritura. Además la política RLS `prompts_insert_owner` permite al dueño
  insertar por la API REST, saltándose cualquier comprobación de la aplicación.
- La cadencia por plan es una tabla (`RECURRING_INTERVAL_DAYS_BY_PLAN` en
  `lib/scan/cron.ts`: `pro: 1`, `starter: 7`), anclada al horario del cron (log §192).
- `scan_runs.trigger_source` distingue `user` de `cron`; los reintentos automáticos de la
  reconciliación ya salen como `cron` (`lib/scan/reconciliation.ts:138`).
- Hoy el registro da Pro con 7 días (`handle_new_user`, migración 0017).

## 3. Bloques y responsabilidades de esquema

| Bloque | Qué es | Esquema | Estado en esta rama |
|---|---|---|---|
| **B1a** | Configuración del plan único: precio 99, sin promo, 3 dominios · 75 · 3 motores, cadencia semanal, copy | no | **se implementa** (reutiliza el ID técnico `pro`; ver §4) |
| **B1b** | Superficies públicas: dejar de ofrecer Starter/Agencia (`/precios`, matriz, modal, hero, comparativas, JSON-LD) | no | detenido: es UI y no puedo aportar evidencia 390/1280 del preview (ver §6) |
| **B2** | Bolsa de 75 **hecha cumplir** de forma atómica y a prueba de saltos de la UI | **sí: una función SQL** (`add_project_prompts`), sin tocar RLS; cerrar el insert por REST exige un cambio de RLS **aparte** y aprobado | **se implementa**: SQL probado en Postgres local con concurrencia real + integración en los 3 caminos de inserción |
| **B3** | Revisión manual mensual por cuenta | probablemente una tabla/contador para reclamarla de forma atómica | **detenido**: depende de Q1 |
| **B4** | Cadencia semanal del plan | no | **se implementa** (`pro: 7`, `data-maturity`, tests) |
| **B5** | Prueba opcional de 14 días tras el diagnóstico (diagnóstico / consentimiento / comienzo separados) | **sí**: reemplazar `handle_new_user` (ya no da Pro al registrarse) y una marca de «prueba ya usada» | **detenido**: depende de Q2 |
| **B6** | Gracia de 3 días en fallo de pago | **sí**: estado de suscripción y fecha del primer fallo | **detenido**: depende de Q3 |
| **B7** | Stripe: 1 Product/Price inclusivo, mapeo, archivar los antiguos | no (a mano en el Dashboard) | **fuera de esta rama** (puerta del dueño) |
| **B8** | Verificación real en TEST (impuestos, renovación, prorrateo, guardas) | no | **bloqueada por entorno** |

## 4. Reutilizar el ID `pro`: condiciones

La instrucción es reutilizarlo **solo** si respeta exactamente el contrato y no arrastra
cuotas previas. En esta rama `pro` pasa a ser **el** plan de 99 € con las cuotas del contrato
(3 · 75 · 3 · semanal), **sin conservar** 5 dominios, 100 prompts ni cadencia diaria. Efectos
que hay que conocer antes de aplicar nada en ningún entorno (no se aplican aquí):
- toda cuenta con `current_plan = 'pro'` cambia de cuotas, incluidas las pruebas de 7 días
  que da hoy `handle_new_user` hasta que B5 las reemplace, las cuentas técnicas y la cuenta
  piloto (inventario del §3 de `single-price-99-proposal.md`, aún sin ejecutar);
- `starter` y `agency` siguen reconocidos (el `CHECK` de la migración 0010 no se toca) y
  **no se tocan** en esta rama; las cuentas *comped* (= `agency`) no cambian.

## 5. Detalles no decididos que cambian compromiso o cobro (se reportan, no se asumen)

Agrupados para el dueño:
- **Q1 — Revisión mensual (B3).** ¿«Primer escaneo» es el primero **de cada dominio** o el
  primero **de la cuenta**? ¿Un escaneo manual que **falla**, o un **reintento manual** tras un
  fallo, consume la revisión del mes? (La columna `trigger_source` no distingue ninguno de los
  dos de una revisión.)
- **Q2 — Prueba (B5).** ¿Se pide **tarjeta** para empezarla o para continuar (cambia el cobro)?
  ¿Es **una por cuenta**? ¿«Diagnóstico» = primer escaneo **completado**? ¿Qué pasa con las
  pruebas de 7 días que ya existan?
- **Q3 — Gracia (B6).** ¿Los 3 días se cuentan desde el **primer** pago fallido? ¿Al acabarlos
  se pasa a Free aunque Stripe siga reintentando, y se **recupera sola** si el pago entra
  después?
- **Q4 — Bolsa (B2).** ¿Cuentan los prompts de dominios **archivados** en los 75? Hoy sí (el
  conteo no filtra por archivado). Esta rama conserva ese comportamiento.
- **Q5 — Reutilizar `pro` (B1a).** ¿Se confirma el efecto del §4 sobre cuentas existentes tras
  ejecutar el inventario?

## 6. Evidencia de UI

Esta rama no toca pantallas en B1a/B2/B4 (el copy sale de `PLANS`). **B1b y B5/B6 sí son UI**
y necesitarán capturas 390/1280 etiquetadas (fixture / preview / datos reales). Con las
herramientas actuales no puedo adjuntar imágenes a GitHub ni abrir el preview (Vercel Login y
proxy de salida), así que hasta que el dueño elija una vía (artifact, commit de imágenes en la
rama, o carga suya) esos bloques quedan detenidos.
