# Propuesta: prueba de 14 días tras el diagnóstico (Task Intake, sin implementar)

**Estado:** propuesta para revisión. No hay código, esquema, facturación, Stripe ni escaneos en este documento.
**Origen:** requisito del dueño (relayado por el Director en #553; no tengo acceso al mensaje original, así que lo
que sigue es lo que el Director transcribe) y estado real del código a fecha 2026-10-08.
**Rama de trabajo:** `claude/onboarding-proposal-quality-grq3xv` (identidad y asistente). Coordinar con **#549**.

## 1. Qué se pide

- Una **prueba de 14 días, única por cuenta, sin tarjeta, que empieza después de un diagnóstico completado**.
- Que **no** la active el registro: el registro no debe activar el actual Pro de 7 días.
- Que empiece **solo por opt-in**, con fecha de fin visible, y con la alternativa de **ver el diagnóstico sin iniciar prueba**.
- Fallos y reintentos **no consumen la revisión**; la recuperación es **backend, invisible para el cliente**.
- Mostrar **preparación real**, sin errores técnicos y sin éxito ni resultados inventados; proponer un fallback si el fallo persiste.
- **Regla 5 del dueño: archivar o eliminar congela el trabajo y el gasto (gasto 0).** Nada más. «No borrar historia» fue una
  **propuesta del Director, no un requisito literal del dueño** (corrección del Director en #553): este documento **no** cambia el
  borrado duro ni la retención de historia por inferencia.
- **Regla 1, ya aclarada** (WhatsApp 21:22:31, relayada por el Director en #549, comentario 6067378798):
  - son **75 preguntas ACTIVAS totales por cuenta**, no 75 créditos mensuales;
  - el **primer escaneo de cada dominio nuevo no consume la «revisión manual» mensual**: solo **una vez por dominio**, **máximo 3 dominios activos**, y
    **archivar y volver a añadir no renueva esa exención**;
  - la explicación anterior («no gasta de las 75 preguntas del mes») era **incorrecta y no se implementa**.
- **Antiabuso, decidido por el dueño (21:27:43, relayado por el Director en #549, comentario 6067469241):** acepta el riesgo actual con poco saldo prepago de APIs
  (exposición deseada en torno a 30 €) y prefiere no penalizar la UX. **No se implementan ahora captcha, límites nuevos por IP ni otras barreras**: quedan como opciones
  diferidas, no como requisitos del contrato. **Antes de publicidad pública** hay que revisar el email verificado y un techo global de gasto en euros. El saldo real, su alcance entre
  proveedores y el corte efectivo **no están verificados**: 30 € **no** se presenta como un límite técnico ya aplicado. Este documento no añade ninguna regla antiabuso.

## 2. Cómo está hoy (verificado en el código)

| Hecho | Dónde |
|---|---|
| Todo registro empieza con **Pro 7 días**, sin tarjeta, por el trigger `handle_new_user` | `supabase/migrations/0017_reverse_trial.sql`; comentario en `app/signup/actions.ts:61` |
| El texto «7 días de prueba gratis de Pro, sin tarjeta» se promete en el registro y en la portada | `app/signup/page.tsx:44`, `components/landing/session-ctas.tsx:105`, `lib/seo/llms-txt.ts:72` |
| Los correos de la prueba dicen «7 días» y cuelgan de `trial_ends_at` | `lib/email/transactional.ts:260,332`; secuencia `lib/email/lifecycle/*` (LIFECYCLE-TRIAL-1, apagada tras `LIFECYCLE_EMAILS_ENABLED`) |
| La caducidad es perezosa y **pone `trial_ends_at = null`** | `lib/billing.ts` (`applyTrialExpiry`, ~l. 84) |
| El código de sistema lee el plan efectivo sin escribir | `resolveSystemPlanId` (`lib/billing.ts`, ALERTS-SCOPE-1) |
| «Diagnóstico completado» ≈ primer `scan_run` completado: la pantalla ya lo distingue (`isFirstScan`, `hasData`, `FirstScanTakeover`) | `app/dashboard/projects/[projectId]/page.tsx` |
| El modal «Cambiar de plan» ya se puede abrir preseleccionado con `?openPlan=<id>` | `app/dashboard/settings/page.tsx`, `components/billing/plan-billing-section.tsx` |
| Un escaneo parado se reanuda solo y el vigilante avisa al operador, no al cliente | SCAN-RELAY-1 (log §228), ALERTS-ALWAYS-1 (§227) |

**Consecuencia clave:** como la caducidad borra `trial_ends_at`, **hoy no existe ningún marcador duradero de «prueba ya consumida»**.
«Única por cuenta» no se puede garantizar con lo que hay. Necesita una columna o un registro nuevos: **esquema, sin aprobar**.

## 3. Propuesta mínima de flujo

1. Dominio → 2. marca y alias confirmados → 3. competidores → 4. preguntas → 5. escaneo/diagnóstico (el flujo actual, sin cambios de orden).
6. **Diagnóstico completado** → el Resumen muestra el resultado y, debajo, una tarjeta con dos salidas de igual peso:
   «Probar 14 días gratis, sin tarjeta» y «Ver mi diagnóstico sin iniciar la prueba».
7. Al aceptar: una **confirmación** que dice exactamente qué se activa, **hasta qué fecha** y qué pasa el último día (vuelve a Free; sin cobro). Solo entonces empieza.
8. Quien no acepta conserva el diagnóstico y puede iniciarla más tarde desde Ajustes, mientras su cuenta no la haya consumido.

## 4. Superficies y componentes mínimos

| Superficie | Cambio mínimo | Necesita |
|---|---|---|
| Resumen (`app/dashboard/projects/[projectId]/page.tsx`) | Tarjeta de oferta, solo con diagnóstico completado y prueba disponible | Estado «prueba disponible» (ver §5) |
| Ajustes → Plan (`components/billing/plan-billing-section.tsx`) | Mismo CTA y fecha de fin cuando la prueba está en curso | Reutiliza `?openPlan=` |
| Registro (`app/signup/page.tsx`, `actions.ts`) y portada (`session-ctas.tsx`, `llms-txt.ts`) | Quitar «7 días de Pro» | Decisión de producto + migración del trigger |
| Correos de prueba (`lib/email/transactional.ts`, `lifecycle/*`) | Reanclar a «14 días / inicio por opt-in» | Depende de dónde se guarde el inicio |
| Acción de servidor «iniciar prueba» | **Nueva** | **#549** (ver §5) |
| Estado de preparación del diagnóstico | Mensaje real por estado, sin errores técnicos | Solo lectura de estados que ya existen |

## 5. Dependencia de #549 y lo que NO resuelve

#549 (borrador, `security/billing-change-plan-server-gate`) cierra un agujero concreto: `changePlan` concedía planes con el service role
sin exigir pago. Deja `changePlan` como **«solo baja derechos»**, acota las escrituras privilegiadas a una fila y registra los eventos del
webhook (`0038_stripe_webhook_events.sql`, **aplicar a mano antes de mergear**).

- «Iniciar prueba» **concede derechos** (Pro) sin pago: es exactamente la clase de escritura que #549 acaba de cerrar. **No puede reabrirse por la puerta de atrás de `changePlan`.** Tiene que ser una acción de servidor propia, con la misma disciplina (service role acotado, exactamente una fila, falla cerrado, una sola vez por cuenta).
- #549 **no** crea el marcador de «prueba consumida» ni cambia el trigger de registro. Eso es trabajo posterior y propio.
- Orden recomendado: **#549 primero** (y su migración 0038 aplicada), después esta prueba. Mezclarlo en #549 o en este PR ampliaría el alcance de ambos.
- No es una segunda máquina de facturación: la prueba **no pasa por Stripe**; solo escribe `current_plan` y las fechas.

## 6. Fallos, reintentos y fallback

- **Hoy:** un escaneo parado se reanuda solo (hasta 3 veces, <6 h) y el vigilante avisa al **operador**. Eso cubre la recuperación invisible.
- La «revisión» ya está definida por la regla 1 (1 revisión manual al mes por cuenta; los fallos y reintentos no la consumen). **En el código sigue sin existir** un contador mensual de revisiones: su diseño está en §10.
- **Hueco a decidir:** qué ve el cliente si el fallo persiste tras los reintentos (hoy: estado de error genérico). Propuesta: un estado «seguimos trabajando en tu diagnóstico» y, pasado un umbral definido por producto, una salida explícita (avisarle por correo cuando esté listo, o ofrecer reintentar). **Nunca** un resultado o una puntuación inventados.
- Una prueba **no debería empezar** si el diagnóstico no se completó; y si se perdió por un fallo nuestro, no se consume.

## 7. Archivar y eliminar: dos cosas distintas, con consecuencias distintas

**Archivar** (`projects.is_archived = true`). Verificado en el código: un proyecto archivado queda fuera del barrido recurrente
(`lib/scan/cron.ts`), del vigilante (`lib/scan/watchdog.ts`), del resumen semanal (`lib/scan/weekly-digest.ts`), y no admite crear un escaneo
(`lib/scan/run-creation.ts`) ni añadir prompts (`lib/projects/add-prompts.ts`). Es decir, **congela el trabajo y el gasto nuevos** y conserva la
fila y su historia. Reañadir el mismo dominio+país+idioma **reactiva la misma fila** (`createProjectCore`, «restored») sin lanzar escaneo.
Sin verificar: qué pasa con un escaneo **ya en curso** en el instante de archivar.

**Eliminar** (`deleteProject`, DATA-MGMT-1). Es borrado duro con cascada: desaparecen el proyecto y todo lo que cuelga de él. Congela el gasto
porque ya no existe nada que escanear. **Consecuencia que importa para la regla 1:** la única unicidad que hay hoy es la fila
`projects (owner, domain, country, language)`. Al borrarla se pierde también cualquier huella de que ese dominio ya gozó de la exención del primer
escaneo, así que **eliminar y volver a crear reiniciaría la exención**, que la regla 1 dice que no debe renovarse. Archivar y reañadir no tiene ese
problema (es la misma fila).

**Regla 5 del dueño, congelar al archivar o eliminar:** programación, reintentos y resincronización, auditorías y generación pendiente dejan de gastar. Verificado hoy: barrido recurrente, vigilante del recurrente y
resumen semanal excluyen proyectos archivados, y no se pueden crear escaneos ni añadir prompts a uno archivado. **Sin verificar:** si la reconciliación y la reanudación de runs parados, la auditoría web posterior
al escaneo y la generación de recomendaciones también se detienen, y qué ocurre con un run **en curso** en el instante de archivar o eliminar. Congelar no es borrar datos: este documento no equipara las dos cosas, y el tratamiento del
conteo de prompts archivados se confirma aparte.

**Qué NO se propone cambiar:** el borrado duro ni la retención de historia. Solo se propone que la elegibilidad de la exención **no cuelgue
de la fila del proyecto** (ver §9).

## 8. Fuera de alcance y preguntas abiertas

No hay en esta propuesta: esquema aplicado, migraciones, facturación, Stripe, entornos externos, escaneos, merge ni despliegue.

1. ¿Dónde se guarda el inicio de la prueba y su consumo? (columna en `profiles` o tabla propia: **esquema**).
2. ¿Qué pasa con las cuentas que ya tienen o tuvieron el Pro de 7 días?
3. ~~¿Qué es una «revisión»?~~ **Contestada** por la regla 1 y el contrato: es la **1 revisión manual al mes por cuenta**; no cuenta el primer escaneo de cada dominio ni los reintentos automáticos, y los fallos no la consumen (regla 2). Falta decidir la definición del **mes** (§10).
4. ¿Qué umbral de fallo persistente activa el fallback visible?
5. Tratamiento exacto de subdominios, país e idioma en la clave de elegibilidad (§9, propuesta).
6. Revisión del dueño del antiabuso (no se acepta riesgo ni presupuesto aquí).

## 9. Elegibilidad durable de la exención (propuesta de diseño, sin implementar)

Pedida por el Director: guardar la elegibilidad **por dominio canónico + cuenta**, de forma durable, **no solo por `projectId`** (que desaparece al eliminar),
con **reserva atómica e idempotente** y **sin reiniciarse por archivar o eliminar**.

- **Registro propio**, no una columna de `projects`: tiene que sobrevivir al borrado en cascada. Esquema nuevo: **sin aprobar**.
- **Reserva atómica e idempotente:** una sola inserción con restricción de unicidad `(cuenta, dominio canónico)`; el segundo intento no concede nada.
  La misma clase de problema que el 23505 de #552 (leer y luego insertar no es atómico).
- **Dominio canónico (propuesta, a decidir):** dominio normalizado (sin esquema, sin `www.`, sin ruta, en minúsculas). **País e idioma NO forman parte de la
  clave**: hoy el mismo dominio puede ser varios proyectos (país/idioma distintos) y cada uno daría una exención nueva por una variante de URL.
  Subdominios: opción a decidir (compartir la clave del dominio registrable evita exenciones por variante; tratarlos como dominios distintos las multiplica).
- **Cuándo se consume:** al reservar para un diagnóstico que **se completa**; un fallo o un reintento no consume (ver §6).
- **No hace falta Stripe, ni secretos, ni entorno externo.** No ejecuta escaneos ni aprueba gasto nuevo.

## 10. Diseño local del contador y la reserva (sin implementar; coordinado con #549 y la rama de contrato)

Pedido por el Director: diseño de contador/reserva con la semántica de la regla 1. **No hay esquema aplicado ni código**. La implementación es de la rama de contrato (`feat/contract-99-local`, su bloque B3
«revisión mensual», parado hasta tener estas respuestas) y de #549 en lo que toca a seguridad; este documento solo fija la semántica para que no la reinventen dos veces.

**Por qué un registro propio y no `trigger_source`:** la otra sesión comprobó que `trigger_source = 'user'` no distingue el primer escaneo de un dominio ni un reintento manual tras un fallo de un recheck normal. La fuente de verdad del consumo tiene que ser un registro explícito.

**Registro de reservas** (propuesta, por cuenta; **no** colgado de `projects`, para que sobreviva a la cascada del borrado):

| Campo | Significado |
|---|---|
| `account_id`, `run_id` (único) | Una reserva por escaneo manual; idempotente por `run_id` |
| `kind` | `first_scan_exempt` (exención del primer escaneo de un dominio) o `monthly` (la 1 revisión manual mensual) |
| `canonical_domain` | Solo para `first_scan_exempt`; **único por `(account_id, canonical_domain)` para siempre** |
| `period` | Solo para `monthly`; definición del mes **sin decidir** (mes natural frente a 30 días rodantes, y zona horaria) |
| `state` | `reserved` → `consumed` o `released` |

**Transiciones:**
1. **Reservar al lanzar** un escaneo manual, de forma atómica: primero intenta la exención del dominio (inserción con la restricción única; si ya existe, no hay exención); si no, la mensual (rechaza si ya hay una `reserved` o `consumed` en el periodo). Un segundo intento con el mismo `run_id` no concede nada nuevo.
2. **`consumed`** solo cuando el diagnóstico **se completa**. Idempotente.
3. **`released`** si el escaneo falla por causa nuestra tras los reintentos, o si el proyecto se archiva o elimina antes de completarse (regla 5: sin gasto). **Una exención `released` queda disponible; una `consumed` no se reinicia nunca** (ni por archivar, ni por eliminar y volver a crear).
4. **Los reintentos automáticos y el escaneo semanal no reservan nada** (contrato).
5. **Fallo persistente:** pasado un umbral que define producto, se libera la reserva, el cliente ve «seguimos trabajando en tu diagnóstico» y se le avisa cuando esté listo; nunca un spinner infinito ni un resultado inventado.

**Clave canónica del dominio (propuesta, a decidir):** dominio normalizado, sin esquema, `www.` ni ruta. País e idioma **no** forman parte de la clave (hoy un mismo dominio puede ser varios proyectos). Subdominios: compartir la clave del dominio registrable evita exenciones por variante de URL; tratarlos como dominios distintos las multiplica.

**Tests que debería llevar (sin efectos externos):** reserva idempotente por `run_id`; con dos reservas concurrentes gana exactamente una (**esto no se demuestra con una prueba de lógica: necesita Postgres real y la restricción única**); fallo → `released` y la exención sigue disponible; completar → `consumed` y no se reinicia al archivar, eliminar y recrear; reintento automático y semanal no reservan; variantes de URL no generan exenciones nuevas; archivar con una reserva abierta la libera.

**Límites que quedan visibles:** la cuenta de 75 preguntas activas **no es atómica** hoy (lectura y luego escritura) y esa carrera no se resuelve aquí; no hay esquema; no hay verificación con Stripe ni con datos reales.

Do you approve this plan? I will not implement until you confirm.

## 11. Qué sigue siendo decisión (no es valor por defecto ejecutable) y puntos de coordinación con #549

**Decisiones del propietario, sin valor por defecto en código:**

- **Definición de «mes»** para el contador (mes natural en `Europe/Madrid`, 30 días móviles o ciclo de facturación): no se elige aquí; ningún test ni constante debe fijarlo hasta que se decida.
- **Dominio canónico y subdominios:** si `www.x.es`, `tienda.x.es` y `x.es` cuentan como uno o como tres para la elegibilidad durable (§9). Mientras no se decida, el diseño solo habla de «dominio canónico» como concepto.
- **Umbral de fallo persistente** (cuántos reintentos o cuánto tiempo antes de liberar una reserva o ceder el escaneo): es una cifra de producto, no un detalle técnico; los estados `reservado → consumido | liberado` (§10) no dependen de ella.

**Coordinación con #549 (billing/seguridad):** (1) el contador y la reserva se apoyan en el plan **efectivo** que #549 endurece; no deben leer `current_plan` crudo. (2) Antes de integrar nada de esto se necesita la revisión de Seguridad 01B de #549. (3) El antiabuso queda como lo decidió el propietario (revisar correo verificado y techo global en EUR antes de anunciar; el umbral de ~30 € no es un límite técnico). (4) Nada de esta sección crea esquema, toca Stripe ni lanza escaneos.
