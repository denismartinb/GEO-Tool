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
- **Antiabuso:** queda en **revisión del dueño**. Este documento no acepta ningún riesgo ni presupuesto de forma implícita, no añade reglas por
  inferencia y no promete escaneos gratis.

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
- **No hay** (por lo que he podido ver) un concepto de «revisión» ni un contador que se consuma: **hay que definir qué es una revisión** antes de decir que un fallo no la consume.
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

**Qué NO se propone cambiar:** el borrado duro ni la retención de historia. Solo se propone que la elegibilidad de la exención **no cuelgue
de la fila del proyecto** (ver §9).

## 8. Fuera de alcance y preguntas abiertas

No hay en esta propuesta: esquema aplicado, migraciones, facturación, Stripe, entornos externos, escaneos, merge ni despliegue.

1. ¿Dónde se guarda el inicio de la prueba y su consumo? (columna en `profiles` o tabla propia: **esquema**).
2. ¿Qué pasa con las cuentas que ya tienen o tuvieron el Pro de 7 días?
3. La regla 1 habla de «1 revisión manual mensual»; en el código no hay un contador mensual de revisiones (sí límites diarios de escaneo manual). ¿Cómo se mide y qué la consume?
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

Do you approve this plan? I will not implement until you confirm.
