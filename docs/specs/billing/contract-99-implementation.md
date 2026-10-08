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
| **B1a** | Configuración del plan único: precio 99, sin promo, 3 dominios · 75 · 3 motores, cadencia semanal, copy | no | **hecho en local** (reutiliza el ID técnico `pro`; ver §4) |
| **B1b** | Superficies públicas: dejar de ofrecer Starter/Agencia (`/precios`, matriz, modal, hero, comparativas, JSON-LD) | no | detenido: es UI y no puedo aportar evidencia 390/1280 del preview (ver §6) |
| **B2** | Bolsa de 75 **hecha cumplir** de forma atómica y a prueba de saltos de la UI | **sí: una función SQL** (`add_project_prompts`), sin tocar RLS; cerrar el insert por REST exige un cambio de RLS **aparte** y aprobado | **hecho en local**: SQL probado en Postgres local con concurrencia real + integración en los 3 caminos de inserción |
| **B3** | Revisión manual mensual por cuenta | probablemente una tabla/contador para reclamarla de forma atómica | **detenido**: depende de Q1 |
| **B4** | Cadencia semanal del plan | no | **hecho en local** (`pro: 7`, `data-maturity`, tests) |
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

## 7. Resultado de lo implementado (head de esta rama)

**Pruebas:** `pnpm test` y `pnpm run validate` (build, tipos, lint) en verde sobre el head.
Los tests que asumían el Pro anterior se **adaptaron al contrato, no se relajaron**: los de
cadencia diaria pasan a un plan diario (Agencia) y se añaden los equivalentes semanales de
Pro; los de promo se mueven a Starter (única que aún tiene precio de lanzamiento) y un test
nuevo fija que Pro no tiene ninguno.

**B2 — bolsa de 75 (evidencia, no solo UI):** `scripts/verify-prompt-pool-sql.sh`, contra un
Postgres 16 local con el esquema real `0001` + `0039`:
- 25 + 25 + 25 cabe; el 76.º se rechaza; un lote que no cabe no inserta **nada**.
- **12 sesiones simultáneas** de 10 prompts por un tope de 75 → siempre **70** (7 lotes),
  tres rondas, nunca más de 75.
- **Control**: el patrón antiguo (leer el conteo, esperar, insertar) con las mismas 12
  sesiones llega a **120** en las tres rondas. La carrera existía.
- Otra cuenta no queda bloqueada; un proyecto ajeno se rechaza; desactivar libera la bolsa;
  `anon` y `authenticated` no pueden ejecutar la función.
Límite: es un Postgres local, no Supabase ni PostgREST; la función se llama por RPC desde el
servidor y eso solo está probado con el cliente simulado en los tests de la aplicación.

**Deuda de copy que depende de otros bloques:** los correos de la secuencia de prueba
(apagados) siguen asumiendo «Pro de 7 días desde el registro» hasta B5; Starter y Agencia
siguen listados con sus precios hasta B1b; el JSON-LD y las comparativas se revisan en B1b.

## 8. Puertas pendientes del dueño (ninguna se ha tocado)

1. **Uso de `service_role` en un flujo de usuario** (la bolsa): atajo de service-role
   prohibido sin aprobación expresa, más revisión de `data-guardian`.
2. Migración `0039` (y, antes, la `0038` del PR de seguridad): aplicar en un entorno de
   prueba y, con aprobación, en producción **antes** de desplegar este código.
3. Cerrar el insert por REST de `project_prompts` (RLS): cambio aparte.
4. Q1–Q5 (§5) y el inventario de cuentas del §4.
5. Price y configuración de Stripe; fiscalidad con el asesor y prueba real en TEST;
   merge y deploy.

## 9. Revisión independiente de B2 (`data-guardian`) y lo que queda abierto

Veredicto: **no bloquea el diseño**, con dos condiciones —aplicar `0039` **antes** de desplegar,
y aprobación expresa del dueño al uso de `service_role`— que ya figuran en el §8. Aplicado
tras la revisión: `search_path` vacío en la función, validación de longitud (10–3000) y de
`sort_order` en el módulo (antes un prompt de 3 caracteres tumbaba el lote entero y se veía
como «no disponible»), y el comentario de `prompt-pool.ts` ya no afirma una garantía de datos.

**Abierto, sin resolver aquí:**
- **Reactivación sin tope por REST (`prompts_update_owner`):** un dueño puede desactivar 75
  prompts, crear 75 nuevos por la función y reactivar los 75 por la API → 150 activos. Ningún
  camino de la app reactiva prompts, pero la política RLS lo permite. Cerrarlo (junto al
  insert directo) es un cambio de RLS que necesita su propia aprobación.
- **Riesgo de despliegue (P0 si se ignora el orden):** sin `0039`, o sin
  `SUPABASE_SERVICE_ROLE_KEY` en un preview, crear un dominio deja el proyecto con 0 prompts
  (`setup_partial`, sin escaneo) y «añadir prompts» también falla: el flujo central queda roto
  para todos. Falla cerrado a propósito, pero el orden tiene que figurar en el PR y el piloto
  tiene que validarlo.
- Una cuenta con el cupo ya ocupado (por ejemplo por dominios archivados, Q4) crea un dominio
  con 0 prompts y un `setup_partial` genérico que no explica que la bolsa está llena.
- `createPrompt` (sin pantalla que la use) traga el rechazo en silencio y no comprueba que el
  proyecto no esté archivado.

