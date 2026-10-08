# Bolsa de prompts: procedimiento para el dueño (nada ejecutado en ningún entorno compartido)

**Estado:** propuesta revisada de forma independiente (`data-guardian`) y corregida; **no aprobada, no aplicada**.
Los SQL se escribieron y se probaron **solo en un Postgres local** (`scripts/verify-prompt-pool-proposals.sh`,
la batería local de pruebas (el recuento exacto está en la salida del script). Varias guardas se han probado quitándolas para comprobar que alguna prueba falla; **no todas**: la lista de las que se probaron y de las que se sabe que no, en §8b).
B2 del contrato sigue **PARCIAL** hasta que el dueño aplique una opción y el postflight salga limpio.

## 1. Qué hay y qué elegir

| Paso | Fichero | Qué hace | Aprobación que necesita |
|---|---|---|---|
| **C** | `C_profiles_guards.sql` | Cierra dos agujeros reproducidos (ver §2). Prerrequisito de B y arreglo por sí mismo | cambio de trigger sobre `profiles` (RLS-adyacente) |
| **B1** | `B1_objects.sql` | Tabla de excepciones + funciones. **No hace cumplir nada** | esquema |
| (overrides) | plantilla en §4 | una fila por cuenta *comped* / «a medida» | datos, decide el dueño |
| **B2** | `B2_activate.sql` | **Crea el trigger: lo único que cambia el comportamiento** | RLS/esquema |
| **A1/A2** | `A1_reactivate_fn.sql`, `A2_closure.sql` | Alternativa con `service_role` + cierre REST | **`service_role` en flujo de usuario: no aprobado** |

Recomendación: **C → B1 → overrides → B2**. A solo si el dueño aprueba `service_role` en el flujo de usuario; y
**A sin C no es segura** (hallazgo 2).

## 2. Resultado de la revisión independiente (12 hallazgos)

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| 1 | alta | Una cuenta **sin fila en `profiles`** puede insertar la suya con `current_plan='agency'` (el trigger de 0016 solo cubre UPDATE) → tope 300 en B. **Reproducido en local sobre las migraciones del repo; el estado de Supabase LIVE no está verificado** | **Arreglado en `C`**; el preflight cuenta las cuentas sin perfil (debe dar 0) |
| 2 | alta | `profiles_update_own` deja reescribir `profiles.email`, y la app decide «comped» por ese campo → cualquiera que conozca un email comped obtiene Agency. **Riesgo anterior a esta propuesta (BILLING-COMPED-1) en el código y las migraciones**; reproducido en local; **que esté abierto o se haya explotado en LIVE no está verificado desde aquí** (filas 6 y 7b del preflight lo miden en agregado, sin emails) | **`C` bloquea escrituras futuras, NO repara emails ya alterados** ni cambia la fuente de identidad: ver §9 |
| 3 | alta (proceso) | Los ficheros no se podían pegar enteros y faltaba este documento | Separados por paso; este documento |
| 4 | media | Bajo B, el código convertía «bolsa llena» en «servicio no disponible» | Corregido en `lib/projects/prompt-pool.ts` (23514 `prompt_pool_full` → `pool_full`), con test |
| 5 | media | La lista *comped* vive en dos sitios (env por email, tabla por `user_id`) y divergirá | **Abierto**: documentado; hay que decidir una sola fuente (§4) |
| 6 | media | Bloqueos subestimados | Corregido y medido (§5) |
| 7 | media | Salida del preflight ilegible en el editor y con emails | Reescritos: **una sola consulta**, sin emails |
| 8 | baja-media | Con `REPEATABLE READ` se llegaba a 76 | Arreglado: se rechaza si no es `READ COMMITTED` (también en 0039) |
| 9 | baja | Posible *deadlock* con transacciones largas | **Riesgo, decisión del dueño pendiente** (nadie lo ha aceptado). Disponibilidad, no se salta el tope. **Reproducido con dos `UPDATE` de una sola sentencia** (`where id in (A,B)` frente a `where id in (B,C)`): el candado de fila se toma antes que el de cuenta. Se evita reactivando una fila por sentencia |
| 10 | baja | B no limita filas **inactivas** (5.000 por REST) | **Abierto en B**, anterior a esta propuesta. **A2 lo cierra**: sin política de insert nadie inserta por REST |
| 11 | baja | Huecos del postflight | Corregidos (`count = 2`, `tgfoid`, `tgtype`) |
| 12 | baja | Pruebas que probaban menos de lo que decían | Reescritas; añadidas upsert, perfil ausente, email, `REPEATABLE READ`, B sin 0039, código de error |

## 3. Orden (si el dueño aprueba B)

Contexto: la migración `0038` (registro de webhooks) vive en la rama del **PR #549**; **no está en esta rama ni en
`main`** y no se ha verificado desde aquí. Es independiente de esta bolsa.
Orden global: **0038 → C → B1 → overrides → B2**. `0039` solo hace falta si se despliega el código de esta rama tal
cual (llama a `add_project_prompts`): **desplegar ese código sin 0039 deja a los usuarios sin poder añadir prompts**
(falla cerrado: `unavailable`, no escribe). Con B no hace falta 0039 para que el tope se cumpla.

0. **Preflight** (`preflight_readonly.sql`): una consulta, devuelve la rejilla entera. No se pega ningún email.
   Parar si: faltan columnas (§1 del resultado), hay cuentas sin perfil, hay nombres ocupados, hay transacciones
   abiertas de más de 30 s, o la fila «function body is byte-identical to the repo version from 0019» da `false`
   (hay otra versión instalada: comparar antes de aplicar C). Los valores `md5` fijan el cuerpo exacto de cada función
   de este paquete; en el postflight, un `false` en un cuerpo significa que lo instalado no es lo revisado.
1. **Copia**: comprobar en el Dashboard de Supabase que existe copia diaria/PITR reciente y anotar la hora. Ningún
   paso modifica filas existentes, así que la reversión por SQL basta; la copia es la red de seguridad.
   Exportar a CSV `select id, project_id, is_active from public.project_prompts` (sin texto) para comparar recuentos.
2. **C**: en horario tranquilo. `lock_timeout = 3 s` y todo en una transacción: o entra entero o no entra.
3. **B1**: igual. Comprobar: `select count(*) from public.account_prompt_cap_overrides;` → 0.
4. **Overrides** (§4). 
5. **B2**: ventana tranquila; es el único paso con efecto visible.
6. **Postflight** (`postflight.sql`): una rejilla; las filas de B y C deben decir `true`; las de A, `false` (no aplicadas).
   Fijan el `md5` del cuerpo de cada función, `SECURITY DEFINER`, `search_path`, y de cada trigger su momento,
   eventos, columnas y cláusula `WHEN`; **no ven el propietario de los objetos**. El recuento de filas del final es solo
   informativo (el tráfico legítimo lo cambia). Pegar con saltos de línea LF: con CRLF el `md5` cambia y la fila sale
   `false` (falla seguro).
7. Prueba de humo del dueño con una cuenta propia: añadir un prompt con la bolsa llena debe dar el aviso de bolsa llena.

**Reversión:** primero **`B_rollback_1_disable.sql`** (desactiva el trigger: reversión completa del comportamiento,
sin tocar filas, instantánea y reversible; **no pega junto el paso 2**) y, si se quiere quitar del todo y en ventana
tranquila, `B_rollback_2_drop.sql`; `C_rollback.sql` restaura el trigger de 0019. No hay reversión de datos porque no
se cambia ninguno. Si B2 da quejas: ejecutar solo el paso 1 (`disable`), nunca un `drop` directo.

## 4. Overrides (cuentas comped y «Agencia a medida»)

El tope de B sale de `profiles.current_plan`; una cuenta comped (hoy plan Agency por la variable
`COMPED_ACCOUNT_EMAILS`) o una Agencia «a medida» con más de 300 quedaría con su plan guardado. **Antes de B2**,
con los emails del dueño (no se pegan en tickets ni en comentarios):

```sql
insert into public.account_prompt_cap_overrides (user_id, cap, note)
select id, 300, 'comped'
from auth.users
where email_confirmed_at is not null and lower(email) in ('<email 1>', '<email 2>')   -- los de COMPED_ACCOUNT_EMAILS
on conflict (user_id) do update set cap = excluded.cap;
-- Comprobar: el número de filas insertadas debe ser igual al número de emails.
```

Se usa `auth.users.email` y no `profiles.email`; **`auth.users.email` se fija en el alta, antes de confirmar el
correo**, así que la plantilla de arriba añade `and email_confirmed_at is not null` (comprobar que el dominio de cada
cuenta comped está confirmado) y el dueño decide si acepta cuentas sin confirmar. **Abierto (hallazgo 5):** cada alta o baja de una
cuenta comped hay que hacerla **en los dos sitios** hasta que se decida una única fuente (por ejemplo, que la
variable deje de usarse). Hasta entonces, una cuenta en la variable sin fila queda con su plan guardado (75 si es
`pro`): el síntoma es el aviso de bolsa llena, no un fallo silencioso.

## 5. Riesgos (medidos en Postgres 16 local)

| Paso | Bloqueo | Efecto | Irreversible |
|---|---|---|---|
| C | `CREATE OR REPLACE TRIGGER` sobre `profiles` (medido): `SHARE ROW EXCLUSIVE` | las escrituras de perfil esperan brevemente; las lecturas (inicios de sesión) no. `C_rollback` igual | no |
| B1 | tabla nueva: ninguno relevante (**sin FK a `auth.users`**, que habría bloqueado altas y logins) | ninguno | no (borrar la tabla pierde las excepciones: exportarlas antes) |
| B2 | `CREATE TRIGGER`: `SHARE ROW EXCLUSIVE` sobre `project_prompts` | las escrituras esperan; las lecturas no, salvo cola detrás de una escritura pendiente | no |
| A2 | `DROP POLICY`: **`ACCESS EXCLUSIVE`** sobre `project_prompts` | las lecturas esperan | no |
| `A_rollback` | `create policy`: **`ACCESS EXCLUSIVE`** sobre `project_prompts` | las lecturas esperan | no |
| `B_rollback_1_disable` | `ALTER TABLE … DISABLE TRIGGER`: `SHARE ROW EXCLUSIVE` | las lecturas siguen | no (reversible) |
| `B_rollback_2_drop` | `DROP TRIGGER`: **`ACCESS EXCLUSIVE`** | las lecturas esperan | no |

Coste de A2/0040 que debe conocer el dueño: el trigger de reactivación rechaza **a todos salvo `service_role`,
incluido el rol `postgres` del editor SQL** (probado: A5b). Una corrección manual de una fila exige desactivar el
trigger durante esa sentencia.

## 6. Compatibilidad código ↔ base de datos

| Código desplegado | Base sin nada | + C | + B1 | + B2 | + 0039 |
|---|---|---|---|---|---|
| `main` (cliente de usuario inserta; **sin** `service_role`) | como hoy | igual | igual | **NO ACTIVAR B2 con `main` desplegado**: `main` vende Pro con **100 prompts y 5 dominios** y B1 cablea **75**; los clientes de Pro actuales quedarían con 75 y `createProjectCore`/`createPrompt` convertirían el rechazo en proyecto creado **sin prompts** (`setup_partial`) o error ignorado | igual |
| esta rama (RPC `add_project_prompts`, `service_role`) | **sin 0039: no se pueden añadir prompts (falla cerrado)** | ídem | ídem | ídem | funciona; el trigger puede rechazar con 23514 → se muestra como bolsa llena |

**Regla de activación (revisión independiente, F1):** B2 **solo** puede activarse junto con el código y los precios
del contrato de 99 € (75 prompts por cuenta), o con topes derivados del contrato que esté vendiéndose en ese momento.
El test que fija el SQL a `plans-data.ts` fija el de **esta rama**, no el de `main`. **Ninguna fila del preflight sabe
qué contrato está desplegado**: lo comprueba el dueño a mano antes de B2. B2 además se **niega a activarse** sin C
(`B2_activate.sql` comprueba el cuerpo de la función y el trigger de C). Las cuentas Pro actuales de `main` son la pregunta Q5 (¿qué pasa
con los clientes `pro` existentes?), que sigue abierta.

Aclaración sobre `service_role` y 0039: la función `add_project_prompts` solo la ejecuta `service_role` (0039 revoca
a `authenticated`). El código de esta rama la llama con `createServiceClient()`, es decir, **usa `service_role` en un
flujo de usuario, que no está aprobado**. Con la opción B el tope lo hace la base y ese camino sobra: la app debería
insertar con el cliente de usuario (no escrito). Sin aprobación de `service_role`, esta rama **no debe desplegarse**
tal cual aunque 0039 esté aplicada.

## 7. Lo que sigue sin resolver (no se implementa por inferencia)

- Una sola fuente de «comped» (hallazgo 5): **abierto**, y hoy son dos (`COMPED_ACCOUNT_EMAILS` por email y la tabla de
  excepciones por `user_id`).
- Filas inactivas ilimitadas (hallazgo 10): **abierto**. *Deadlock* con transacciones largas (hallazgo 9): riesgo con
  decisión pendiente del dueño.
- **Emails de `profiles` ya alterados y fuente de identidad de «comped»** (§9).
- `service_role` en el flujo de usuario (solo A) y el cableado de la app para B (insertar con el cliente de usuario
  y traducir la reactivación): no escrito.
- Contador/exención durable del primer escaneo, congelación de ejecuciones en curso y esquema de la prueba de 14
  días (B5/B6): siguen siendo fases con su propio Task Intake.

## 9. Identidad: `profiles.email` frente a `auth.users.email` (C no repara lo ya escrito)

**Lo que se sabe y lo que no.** Por el código: la app decide «comped» con `profiles.email` (`lib/billing.ts`:
`resolveEffectivePlanId`, `resolveSystemPlanId`), y las políticas de 0002 permiten al propietario escribir su fila.
Reproducido en local. **No se ha verificado** que LIVE tenga emails alterados ni que nadie lo haya explotado; el
preflight (fila 7b) da tres recuentos agregados —perfiles cuyo email difiere del de `auth.users`, perfiles sin
email, usuarios sin email—, sin emails ni identificadores. Un recuento distinto de 0 en la primera fila es un hecho
que el dueño debe interpretar; 0 no prueba que nunca ocurriera (un valor pudo restaurarse después).

**Quién escribe `profiles.email`, y qué le hace `C`:**

| Escritor | Efecto de `C` |
|---|---|
| Alta (`handle_new_user`, trigger de `auth.users`, servicio de autenticación sin claim `authenticated`) | sin cambios: crea la fila con la prueba de 7 días |
| Webhook de Stripe / `changePlan` (`service_role`) | sin cambios; además no escriben email |
| Editor SQL de Supabase (`postgres`, `auth.role()` nulo) | **permitido**: es la vía del operador para reconciliar |
| Cambio legítimo de email del usuario | **no existe flujo hoy** y nada sincroniza `auth.users` → `profiles` al actualizar. Si se añade, su parte de servidor escribe `profiles.email` con `service_role` |
| Un usuario autenticado reescribiéndolo | **bloqueado** con el error «email can only be changed by the service role» |

**Limitación visible, no oculta.** Tras `C`, quien tenga un email de perfil incorrecto (por una alteración previa
o por un cambio de email en `auth.users`) **no puede corregirlo por sí mismo**; el error lo dice, y el operador
tiene el camino de arriba. No se bloquea una identidad corrupta de forma permanente: se reconcilia a mano.

**Tratamiento propuesto de discrepancias (no ejecutado, decide el dueño; no cambia nada hasta que lo ejecute):**

**Un único predicado** en el preflight 7b y en todos los pasos (sin distinguir mayúsculas ni espacios; incluye a quien
no tiene email en `auth.users`, teléfono o SSO, porque un perfil que conserva un email ajeno sigue contando como
«comped» en la app):
`lower(btrim(coalesce(pr.email,''))) is distinct from lower(btrim(coalesce(u.email,'')))` sobre `profiles pr join auth.users u on u.id = pr.id`.

1. **Contar** (anotar el número N): `select count(*) from public.profiles pr join auth.users u on u.id = pr.id where <predicado>;`
2. **Copia de seguridad de exactamente esas filas**, en un fichero local que no se sube a ningún sitio (contiene correos
   de clientes): `select pr.id, pr.email as old_email from public.profiles pr join auth.users u on u.id = pr.id where <predicado>;`
3. **Revisar a mano**, sin escribir ningún email *comped* en GitHub ni en tickets, si alguna cuenta cambiaría de plan
   efectivo. Después del paso 4 solo se vuelve atrás con la copia del paso 2.
4. **Una sola sentencia atómica** (sirve en el editor SQL aunque no se conserve una transacción interactiva): si el
   número de filas no es N, **se lanza una excepción y no cambia nada** (también si `postgres` no se salta RLS y no
   coincide ninguna fila):
   ```sql
   do $$
   declare n integer;
   begin
     update public.profiles pr set email = coalesce(u.email, '')
     from auth.users u
     where u.id = pr.id and <predicado>;
     get diagnostics n = row_count;
     if n <> <N> then raise exception 'expected % rows, updated %', <N>, n; end if;
   end $$;
   ```
   (`profiles.email` es `NOT NULL` y admite `''`; el guard de `C` deja pasar al rol `postgres` del editor.)

**Fuente de identidad fiable para «comped» (propuesta, no implementada):** mientras la app lea `profiles.email`, una
alteración previa a `C` sigue sirviendo. Opciones, de menor a mayor cambio:
(a) leer el email de la sesión (`auth.getUser()`, verificado) en `getPlanForUser` y en los lectores del plan; el
barrido y el vigilante, sin sesión, lo leerían de `auth.users` con `service_role` (nueva lectura privilegiada, requiere
aprobación); (b) decidir «comped» solo por la tabla de excepciones (por `user_id`) y retirar la variable
`COMPED_ACCOUNT_EMAILS` (cierra a la vez el hallazgo 5). Ninguna está hecha; ambas cambian código de facturación.

## 8b. Límites conocidos de la revisión (no verificado)

- **Qué se probó quitándolo.** Con una prueba que falla al quitarlo (comprobado por mutación en esta rama, incluidos
  los seis que la tercera revisión encontró sin cubrir: `search_path` de C, aislamiento, candado y filtro de propietario
  de A1, `tgattr` del postflight y el predicado de la 7b): candado y aislamiento de B y de A1, filtro de propietario de
  A1, `security definer` y `search_path` de C, guarda de email, forzado de cada columna de facturación en C, trigger de
  C solo en UPDATE / en AFTER / con `WHEN`, filtro de `service_role` de A2, comprobación de C en B2. **No se ha
  intentado romper todo**: una mutación que no esté en esta lista puede seguir sin prueba. El postflight no ve el
  propietario de los objetos.
- Todas las guardas (0016/0019, C, A2) confían en `auth.role()`, que lee los ajustes `request.jwt.claim.*`.
  Reproducido en local: una sesión capaz de fijar ella misma esos ajustes (`set request.jwt.claim.role='service_role'`)
  salta cualquiera. **No es alcanzable por PostgREST hoy** (ninguna función expuesta ejecuta `set_config` ni SQL
  dinámico, comprobado con grep en las migraciones), y es anterior a este paquete.
- El stub local de `auth` solo lee `request.jwt.claim.role`; el real también lee `request.jwt.claims`. No se ha
  probado contra Supabase real: ni el rol que posee las funciones `SECURITY DEFINER` ni sus permisos sobre
  `auth.users` (si faltaran, la rama INSERT de C falla cerrado), ni los permisos por defecto de `EXECUTE` (el paquete
  los revoca explícitamente), ni cómo traduce PostgREST un upsert o un PATCH masivo, ni cómo trata el editor SQL las
  transacciones.
- Cada alta recibe 7 días de Pro con 75 prompts: los registros repetidos no están limitados (antiabuso diferido).
- `lib/projects/prompt-pool.ts` toma del error de la base el tope que realmente se aplicó; si no puede leerlo, usa el
  de la app.

## 8. Integridad

`SHA256SUMS` fija el contenido exacto de lo que se revisa; `lib/projects/prompt-pool-sql.test.ts` falla si un
fichero cambia sin actualizarlo. Verificar antes de pegar: `sha256sum -c SHA256SUMS` en esta carpeta.
