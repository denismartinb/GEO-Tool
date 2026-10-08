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
fiscalidad (asesor) y verificación en el Stripe real (LIVE, ver `stripe-live-procedure.md`); efectos en cualquier entorno externo; merge y
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
| **B1b** | Superficies: dejar de ofrecer Starter/Agencia (`/precios`, matriz, docs, hero, wizard, consola) | no | **hecho en local** en las pantallas públicas (capturas 390/1280 en `docs/specs/billing/evidence/contract-99-b1b/`, **render local, no preview**) y en el selector de la consola (sin capturar); el contenido editorial queda inventariado (§17) |
| **B2** | Bolsa de 75 **cumplida por la aplicación** de forma atómica. **PARCIAL**: la API REST sigue pudiendo insertar (`prompts_insert_owner`) y reactivar (`prompts_update_owner`) saltándose la función | **sí: una función SQL** (`add_project_prompts`), sin tocar RLS; cerrar la vía REST es un cambio de RLS **aparte** (§10) | **PARCIAL en local**: SQL probado con concurrencia real + integración en los 3 caminos de la aplicación; vía REST abierta |
| **B3** | Revisión manual mensual por cuenta | tabla de reserva atómica (propuesta §15) | **detenido en lo que exige esquema**; hecho: la clave de dominio de la exención (`lib/projects/domain-key.ts`) |
| **B4** | Cadencia semanal del plan | no | **hecho en local** (`pro: 7`, `data-maturity`, tests) |
| **B5** | Prueba opcional de 14 días tras el diagnóstico, única por cuenta, sin tarjeta | **sí**: reemplazar `handle_new_user` y una marca de «prueba ya usada» | **detenido**: propuesta de UX/onboarding en §13; el esquema necesita aprobación |
| **B6** | Gracia de 3 días desde el primer pago fallido y después solo lectura hasta pagar | **sí**: guardar la fecha del primer fallo | **núcleo puro hecho** (`lib/billing/payment-grace.ts` + tests); el cableado depende del esquema y del webhook del PR #549 |
| **B7** | Stripe: 1 Product/Price inclusivo, mapeo, archivar los antiguos | no (a mano en el Dashboard) | **fuera de esta rama** (puerta del dueño) |
| **B8** | Verificación en el Stripe real, que es LIVE (impuestos, renovación, prorrateo, guardas): solo lectura desde herramientas y pasos del dueño con comprobación (`stripe-live-procedure.md`) | no | **bloqueada por entorno; procedimiento escrito, nada ejecutado** |

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

> **Actualización (2026-10-08):** el dueño ha respondido a Q1–Q3 en parte; lo decidido y lo que sigue
> abierto está por cláusula en el §11. Lo que sigue es el texto original de la pregunta.

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

**B2 — bolsa de 75, PARCIAL (evidencia de la vía de la aplicación; la vía REST sigue abierta):** `scripts/verify-prompt-pool-sql.sh`, contra un
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
5. Price y configuración de Stripe; fiscalidad con el asesor y verificación en el Stripe real (LIVE);
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

## 10. B2 sigue PARCIAL — propuesta mínima para cerrar la vía REST

Mientras RLS permita escribir `project_prompts` por la API, la bolsa **no está garantizada**:
`prompts_insert_owner` deja insertar sin tope y `prompts_update_owner` deja reactivar prompts
desactivados. Propuesta mínima en `docs/specs/billing/proposals/0040_close_project_prompts_rest_writes.sql`
(fuera de `supabase/migrations/` a propósito: **no es una migración aprobada ni aplicada**):
1. quitar `prompts_insert_owner` (el servicio y la función `add_project_prompts` siguen pudiendo insertar);
2. un trigger que impide **reactivar** (`is_active` de `false` a `true`) salvo al servicio. Desactivar,
   que es lo único que hace la app con prompts existentes, y editar texto o categoría siguen permitidos.

**Pruebas de acceso directo** (`scripts/verify-prompt-rls-sql.sh`, Postgres 16 local con las
políticas reales de `0002` y una identidad de sesión simulada al estilo Supabase):
- *Hoy:* un dueño inserta por la API pasándose del tope (**76 activos con tope 75**) y reactiva 75
  prompts viejos (**150 activos con tope 75**).
- *Con la propuesta:* el insert directo se rechaza; desactivar y editar siguen permitidos; reactivar
  por la API se rechaza; la función del servicio sigue funcionando; el servicio puede reactivar; otra
  cuenta sigue sin ver nada. La propuesta se revierte sola al terminar.
Costes: cualquier cosa que insertara o reactivara con un cliente de usuario dejaría de funcionar (no
hay ninguna en `app/` ni `lib/` tras `0039`); y quien opere desde el editor SQL (`postgres`) también
sería rechazado. Es un cambio de RLS: **necesita aprobación del dueño y revisión de `data-guardian`**.

## 11. Estado por cláusula

«Decidido» = lo dijo el dueño (transmitido por el Director); «propuesta» = lo propongo yo y el dueño
no lo ha aprobado. Ninguna cláusula implica que el sistema esté listo para cobrar.

| # | Cláusula | Estado | Hecho en esta rama | Depende de |
|---|---|---|---|---|
| 1 | 99 €/mes, IVA incluido, para todos | decidido | config y tests (B1a) | Price y configuración de Stripe; fiscalidad |
| 2 | **75 preguntas ACTIVAS TOTALES por cuenta** (no créditos mensuales) | decidido (21:22:31 «sí»; la explicación previa «no gasta de las 75 del mes» era incorrecta y **no** se implementa) | B2 **PARCIAL** | cerrar la vía REST (§10) |
| 3 | Hasta 3 dominios activos | decidido | tope `projects: 3` (ya se hace cumplir al crear) | — |
| 4 | Escaneo semanal | decidido | B4 | — |
| 5 | 1 revisión manual al mes **por cuenta** | decidido | clave de dominio; el resto detenido | reserva atómica (esquema, §15) |
| 5a | El primer escaneo de **cada dominio nuevo** no consume la revisión: una vez por dominio, máximo 3 activos; archivar y volver a añadir **no** la renueva | decidido | `firstScanDomainKey` | persistencia durable (§15) |
| 5b | Fallos y reintentos no consumen revisión | decidido («Correcto») | — | estados idempotentes de recuperación (§12) |
| 6 | Los fallos son **transparentes** para el cliente: no los ve; se recuperan en backend por reintento y resincronización | decidido | — | diseño de §12 (propuesta) |
| 7 | Prueba de 14 días, **única por cuenta, sin tarjeta, tras diagnóstico completado** | decidido («Ok») | — | B5 (esquema); UX en §13 (propuesta) |
| 8 | Gracia de 3 días desde el **primer** pago fallido; después **solo lectura hasta pagar** | decidido («ok») | transición y tests puros | esquema + webhook del #549; la lista de bloqueos es propuesta |
| 9 | Dominios archivados o eliminados **congelados**: no gastan | decidido | auditoría (§14) | guardas nuevas en el pipeline (propuesta); el conteo de prompts archivados se confirma aparte |
| 10 | Antiabuso: captcha, límites por IP | **diferido** por el dueño (21:27): no es requisito del contrato | — | antes de publicidad pública: email verificado y techo global en euros |
| 11 | Starter y Agencia dejan de ofrecerse | decidido (un solo precio) | B1b | decidir si «Hablar con ventas» sigue existiendo |

## 12. Recuperación transparente de fallos (propuesta; nada implementado)

Qué existe hoy, verificado: la reconciliación marca `failed` los runs parados y crea un reintento
automático (`reconciliation.ts`, `trigger_source: 'cron'`); un run parado con trabajo reclamable se
reanuda hasta 3 veces en menos de 6 h (`lib/scan/resume.ts`, SCAN-RELAY-1); el vigilante de 15 min
reconcilia todos los proyectos y avisa **al operador** (ALERTS-ALWAYS-1). Lo que **no** hay: ningún
estado pensado para que el cliente no vea el fallo; hoy un run `failed` se enseña como tal.

Propuesta mínima, de menor a mayor intervención:
1. **Dos estados de cara al cliente, no tres:** «en proceso» (incluye reintentando y resincronizando,
   con un mensaje neutro y sin errores técnicos) y «completado». Un fallo interno nunca se traduce a un
   éxito inventado ni a un error crudo.
2. **Recuperación con estados idempotentes:** cada intento lleva una clave (run + tramo), de modo que
   reintentar o resincronizar no duplica llamadas ya hechas ni consume revisión (5b).
3. **Fallo persistente, para revisión, sin spinner infinito:** agotado el presupuesto de recuperación
   (hoy 48 h, ALERTS-ALWAYS-1) el cliente ve **un** mensaje neutro y definitivo con la opción de
   relanzar, que no consume revisión; el operador ya recibe el aviso. El plazo y el texto los decide el
   dueño.
Dependencias: no ejecuta escaneos; tocar los estados de `scan_runs` es una zona de `scan.md` y
`reliability`, con su propio Task Intake.

## 13. Prueba de 14 días: UX y onboarding mínimos (propuesta)

Respuesta a «¿hay que tocar la UX y el onboarding actual? ¿cómo se modifica?»: **sí, poco, y sin
rehacer el asistente.**
1. **Se mantiene el asistente** (dominio → competidores → prompts → primer escaneo) tal cual.
2. **Se quita el inicio automático de 7 días al registrarse** (`handle_new_user`, migración 0017:
   hoy da Pro y `trial_ends_at` a +7 días). Una cuenta nueva empieza en Free: ese primer escaneo **es
   el diagnóstico**. Cambio de esquema (reemplazo del trigger).
3. **Tras el primer escaneo completado** (el diagnóstico) aparece una tarjeta con la oferta
   «Prueba Pro 14 días, sin tarjeta» y un botón explícito. Consentimiento y comienzo son el mismo
   gesto: sin clic no hay prueba.
4. **Fecha de fin visible** desde el primer momento; **sin pago automático ni Checkout para empezarla**.
5. **Al terminar**, la cuenta vuelve a Free y puede elegir pagar cuando quiera (Checkout normal). La
   elección de pago es posterior y separada.
6. **Única por cuenta:** una marca de «prueba ya usada» que no se borre al expirar (hoy
   `applyTrialExpiry` pone `trial_ends_at` a `null` y perdería el rastro).
Ficheros afectados: `supabase/migrations` (trigger + marca), una acción de servidor para iniciar la
prueba con sus guardas, la pantalla del resultado del primer escaneo, el copy de registro y de
`/precios` («Probar Pro gratis» pasaría a «Empezar gratis»), la tira del hero (`7 días de Pro`) y la
secuencia de correos de prueba (D1/D3/D5 colgados de la fecha de registro). Sin hacer: **«diagnóstico»
= primer escaneo completado de la cuenta** es una propuesta mía; el dueño dijo que dependía de la regla
5a.

## 14. Dominios archivados o eliminados: qué los congela hoy

| Camino | ¿Congelado hoy? | Evidencia |
|---|---|---|
| Barrido recurrente | **sí** | `lib/scan/cron.ts:326` filtra `is_archived = false` |
| Crear un escaneo (manual o reintento) | **sí** | `lib/scan/run-creation.ts:181` rechaza archivados; el reintento automático lo intenta y falla con un log |
| Vigilante de frescura | **sí** (la parte de «sin escaneo en su ciclo») | `lib/scan/watchdog.ts:430` |
| Resumen semanal | **sí** | `lib/scan/weekly-digest.ts:111` |
| Auditoría técnica manual | **sí** | `lib/web-audit/technical-audit.ts:299` |
| **Run ya en curso o con trabajo pendiente** (ejecutor, tramos, `resume`) | **no** | `executor.ts`, `resume.ts` no consultan `is_archived`; `cancelled` existe en el esquema pero **ningún camino lo escribe** (`docs/scan-lifecycle.md`) |
| **Auditorías automáticas encoladas** | **no** | `lib/web-audit/audit-job-runner.ts:249,574` leen los interruptores pero no `is_archived` |
| Eliminar un dominio | borra la historia | `deleteProject` es borrado duro con cascada; los runs y trabajos desaparecen con él |
Hoy un dominio solo se archiva al bajar de plan (el botón de archivar se retiró). Propuesta mínima, sin
borrar historia ni reactivar gasto por defecto: (a) un único guardián de lectura («¿este proyecto está
archivado?») consultado al inicio de cada tramo del ejecutor, de `resume` y del ejecutor de auditorías,
que corta sin consumir y sin marcar `timeout`/error del proveedor; (b) al archivar, marcar como
canceladas las ejecuciones pendientes (estado que hoy nadie escribe: requiere definirlo). **Congelar
no es borrar**; y el conteo de los prompts de un dominio archivado se confirma aparte (Q4). No se ha
implementado: toca el pipeline de escaneo.

## 15. Elegibilidad durable de «primer escaneo de un dominio» (propuesta de esquema)

Decidido: una vez por dominio, máximo 3 activos, archivar y volver a añadir no la renueva, y no se
resetea al archivar ni al eliminar. Por eso **no puede vivir en el proyecto** (se borra con él):
- Tabla propuesta `domain_first_scan_claims(owner_user_id, domain_key, claimed_at, first_project_id
  null on delete set null)`, clave primaria `(owner_user_id, domain_key)`, **sin cascada desde
  `projects`**.
- Reserva **atómica e idempotente** con `insert … on conflict do nothing returning`: si inserta,
  ese escaneo es el exento; si no, cuenta como revisión. Dos primeros escaneos simultáneos no pueden
  ser exentos los dos.
- `domain_key` = `firstScanDomainKey` (hecho y probado): minúsculas, sin esquema, `www.`, puerto, ruta,
  consulta, usuario ni punto final, y punycode para dominios internacionales; **una IP o un valor que
  no sea un dominio no reclama exención**.
- **Propuesta abierta para el dueño:** los *subdominios* son claves distintas (fusionarlos exige una
  lista de sufijos públicos); como mucho una cuenta reclama la exención de 3 subdominios de un sitio, y
  el tope de 3 activos y la regla de no renovar lo acotan. País e idioma **no** forman parte de la
  clave: el mismo dominio en otro país no genera exención nueva.

## 16. Antiabuso: diferido por decisión del dueño

El dueño acepta el riesgo actual con poco saldo prepago de las APIs (exposición deseada alrededor de
30 €) y prefiere no penalizar la UX: **no se implementa ni se impulsa ahora captcha, límites nuevos
por IP ni otras barreras**; quedan como opciones diferidas, no requisitos del contrato. Antes de
cualquier publicidad pública hay que revisar el **email verificado** y un **techo global de gasto en
euros**. El saldo real, el alcance entre proveedores y el corte efectivo **no están verificados**: los
30 € no se presentan como un límite técnico ya aplicado. La ruta del comprobador gratuito es
`/gratis/aparece-mi-marca-en-chatgpt`; no hay página `/gratis`.

## 17. Contenido editorial que aún cita Starter, precios o cuotas antiguas (no reescrito)

Son afirmaciones de contenido y sobre competidores: necesitan revisión de `growth-content`, no un
cambio mecánico. Con `pro` semanal y un solo precio, hoy son inexactas:
- `app/blog/como-aparecer-en-perplexity/page.mdx:103,114` — «plan Starter incluye 25 prompts
  mensuales», «Starter cuesta 49 €/mes» (ya no coincidía ni con los 45 € anteriores).
- `app/blog/que-es-el-geo-score/page.mdx:74` — «A diario: con qué frecuencia se vuelve a medir en los
  planes de pago». **Falso con Pro semanal.**
- `lib/comparativas/genscore-vs-otterly.ts:65`, `genscore-vs-peec-ai.ts:31,43` — «ilimitados desde
  Starter», «motores desde el plan Starter».
- `lib/comparativas/alternativas-a-otterly.ts:63` y las comparaciones de precio por prompts: ahora
  citan 75 prompts frente a los 100 del Standard de Otterly sin afirmar equivalencia; revisar el tono.
- `/pricing`: titular «Paga solo por lo que necesitas» y las FAQ «¿Qué incluye la prueba de Pro?» y
  «¿Puedo cambiar de plan…?» (esta última y la de la prueba contienen las frases falsas sobre
  facturación que corrigen el PR de seguridad y el PR 2).

## 18. Bolsa de prompts: decisión A/B para el dueño (propuesta; nada aplicado)

Carpeta `docs/specs/billing/proposals/prompt-pool/` (SQL fuera de `supabase/migrations/` a
propósito), prueba local `scripts/verify-prompt-pool-proposals.sh` y test de deriva
`lib/projects/prompt-pool-sql.test.ts`. **B2 sigue PARCIAL** hasta que el dueño aplique una de
las dos y se compruebe el postflight.

| | **A — funciones `service_role`** | **B — trigger en la base, sin `service_role`** |
|---|---|---|
| Quién calcula el tope | el llamador (la app) | la base, desde `profiles` (+ tabla de excepciones) |
| `service_role` en flujo de usuario | **sí** (no aprobado) | no |
| Vía REST (insert / reactivar) | cerrada solo con la fase A2 (quita la política de insert + trigger) | cerrada por construcción: toda inserción y toda reactivación pasan por el mismo trigger |
| Un llamador con bug o comprometido que pasa `cap=9999` | **creído** (demostrado en A7) | imposible: el tope no es un argumento |
| Cuentas *comped* | las resuelve la app (env) | **necesitan fila en `account_prompt_cap_overrides` antes de activar** |
| Cambia el código de la app | sí (todas las rutas por las funciones) | no para que funcione; opcional: traducir `prompt_pool_full` a mensaje amable |
| Tope duplicado en SQL | no | sí → fijado a `plans-data.ts` por test |
| Reversión | 2 fases, cada una en una transacción | borrar un trigger; los datos no se tocan |

**Revisión independiente (`data-guardian`) hecha: ninguna de las dos era entregable tal cual.** Hallazgos y estado en
`proposals/prompt-pool/RUNBOOK.md` §2. Dos son agujeros **reproducidos** y previos a esta propuesta: una cuenta
sin fila en `profiles` puede crear la suya con plan `agency`, y cualquier usuario puede reescribir `profiles.email`
y hacerse pasar por una cuenta *comped* (la app lo decide por ese campo). Ambos están **reproducidos en local** sobre las migraciones del repo; **que lo estén en el Supabase LIVE, o que se
hayan explotado, no está verificado** (el preflight lo mide en agregado, sin emails). Un tercer fichero,
`C_profiles_guards.sql` (prerrequisito de B; **A sin C no es segura**), **bloquea escrituras futuras pero no repara
emails ya alterados ni cambia la fuente de identidad de «comped»** (`RUNBOOK.md` §9). Los ficheros se separaron por paso (`C`, `B1`, `B2`, `A1`, `A2`, reversiones) y llevan `SHA256SUMS`.

Recomendación (mía, la decisión es del dueño): **B**. Cierra el hueco REST sin aprobar
`service_role`, y es la única donde la cuenta no puede influir en su tope. Coste: un tope
duplicado (con test) y la lista de *comped*.

Orden (0038 → C → B1 → overrides → B2), riesgos con bloqueos medidos, copia de seguridad, reversión y matriz vieja/nueva: `proposals/prompt-pool/RUNBOOK.md`.
Los SQL se entregan al dueño; el agente no los ejecuta fuera de Postgres local.

## 19. Procedimiento para el Stripe real (LIVE)

`stripe-live-procedure.md`: inventario de solo lectura, pasos del dueño con comprobación,
coste y consentimiento de cualquier cargo de prueba, y lista mínima de seguridad LIVE. Nada
se ha ejecutado contra Stripe desde esta sesión.

