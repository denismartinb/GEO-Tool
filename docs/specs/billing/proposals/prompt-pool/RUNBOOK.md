# Bolsa de prompts: procedimiento para el dueño (nada ejecutado en ningún entorno compartido)

**Estado:** propuesta revisada de forma independiente (`data-guardian`) y corregida; **no aprobada, no aplicada**.
Los SQL se escribieron y se probaron **solo en un Postgres local** (`scripts/verify-prompt-pool-proposals.sh`,
79 comprobaciones; cada guarda se ha vuelto a probar quitándola para ver que la prueba falla).
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
| 1 | alta | Una cuenta **sin fila en `profiles`** puede insertar la suya con `current_plan='agency'` (el trigger de 0016 solo cubre UPDATE) → tope 300 en B. Reproducido | **Arreglado en `C`**; el preflight cuenta las cuentas sin perfil (debe dar 0) |
| 2 | alta | `profiles_update_own` deja reescribir `profiles.email`, y la app decide «comped» por ese campo → cualquiera que conozca un email comped obtiene Agency. **Bug anterior (BILLING-COMPED-1), afecta al producto hoy, no solo a esta propuesta.** Reproducido | **Arreglado en `C`** (el email deja de poder cambiarse desde una sesión de usuario). Mientras `C` no esté aplicada, **sigue abierto en producción** |
| 3 | alta (proceso) | Los ficheros no se podían pegar enteros y faltaba este documento | Separados por paso; este documento |
| 4 | media | Bajo B, el código convertía «bolsa llena» en «servicio no disponible» | Corregido en `lib/projects/prompt-pool.ts` (23514 `prompt_pool_full` → `pool_full`), con test |
| 5 | media | La lista *comped* vive en dos sitios (env por email, tabla por `user_id`) y divergirá | **Abierto**: documentado; hay que decidir una sola fuente (§4) |
| 6 | media | Bloqueos subestimados | Corregido y medido (§5) |
| 7 | media | Salida del preflight ilegible en el editor y con emails | Reescritos: **una sola consulta**, sin emails |
| 8 | baja-media | Con `REPEATABLE READ` se llegaba a 76 | Arreglado: se rechaza si no es `READ COMMITTED` (también en 0039) |
| 9 | baja | Posible *deadlock* con transacciones largas | **Aceptado y documentado** (disponibilidad, no se salta el tope) |
| 10 | baja | B no limita filas **inactivas** (5.000 por REST) | **Abierto**, anterior a esta propuesta; A2 lo deja igual |
| 11 | baja | Huecos del postflight | Corregidos (`count = 2`, `tgfoid`, `tgtype`) |
| 12 | baja | Pruebas que probaban menos de lo que decían | Reescritas; añadidas upsert, perfil ausente, email, `REPEATABLE READ`, B sin 0039, código de error |

## 3. Orden (si el dueño aprueba B)

Contexto: el **PR #549** trae la migración `0038` (registro de webhooks); es independiente de esta bolsa.
Orden global: **0038 → C → B1 → overrides → B2**. `0039` solo hace falta si se despliega el código de esta rama tal
cual (llama a `add_project_prompts`): **desplegar ese código sin 0039 deja a los usuarios sin poder añadir prompts**
(falla cerrado: `unavailable`, no escribe). Con B no hace falta 0039 para que el tope se cumpla.

0. **Preflight** (`preflight_readonly.sql`): una consulta, devuelve la rejilla entera. No se pega ningún email.
   Parar si: faltan columnas (§1 del resultado), hay cuentas sin perfil, hay nombres ocupados, hay transacciones
   abiertas de más de 30 s, o el trigger de `profiles` no es la versión de 0019.
1. **Copia**: comprobar en el Dashboard de Supabase que existe copia diaria/PITR reciente y anotar la hora. Ningún
   paso modifica filas existentes, así que la reversión por SQL basta; la copia es la red de seguridad.
   Exportar a CSV `select id, project_id, is_active from public.project_prompts` (sin texto) para comparar recuentos.
2. **C**: en horario tranquilo. `lock_timeout = 3 s` y todo en una transacción: o entra entero o no entra.
3. **B1**: igual. Comprobar: `select count(*) from public.account_prompt_cap_overrides;` → 0.
4. **Overrides** (§4). 
5. **B2**: ventana tranquila; es el único paso con efecto visible.
6. **Postflight** (`postflight.sql`): una rejilla; las filas de B y C deben decir `true`; las de A, `false` (no aplicadas).
   El recuento final debe ser igual al del preflight.
7. Prueba de humo del dueño con una cuenta propia: añadir un prompt con la bolsa llena debe dar el aviso de bolsa llena.

**Reversión:** `B_rollback.sql` (quita el trigger: reversión completa del comportamiento, sin tocar filas) y
`C_rollback.sql` (restaura el trigger de 0019). No hay reversión de datos porque no se cambia ninguno. Si B2 da
quejas: ejecutar solo `drop trigger trg_project_prompts_pool on public.project_prompts;`.

## 4. Overrides (cuentas comped y «Agencia a medida»)

El tope de B sale de `profiles.current_plan`; una cuenta comped (hoy plan Agency por la variable
`COMPED_ACCOUNT_EMAILS`) o una Agencia «a medida» con más de 300 quedaría con su plan guardado. **Antes de B2**,
con los emails del dueño (no se pegan en tickets ni en comentarios):

```sql
insert into public.account_prompt_cap_overrides (user_id, cap, note)
select id, 300, 'comped'
from auth.users
where lower(email) in ('<email 1>', '<email 2>')   -- los de COMPED_ACCOUNT_EMAILS
on conflict (user_id) do update set cap = excluded.cap;
-- Comprobar: el número de filas insertadas debe ser igual al número de emails.
```

Se usa `auth.users.email` (verificado) y no `profiles.email`. **Abierto (hallazgo 5):** cada alta o baja de una
cuenta comped hay que hacerla **en los dos sitios** hasta que se decida una única fuente (por ejemplo, que la
variable deje de usarse). Hasta entonces, una cuenta en la variable sin fila queda con su plan guardado (75 si es
`pro`): el síntoma es el aviso de bolsa llena, no un fallo silencioso.

## 5. Riesgos (medidos en Postgres 16 local)

| Paso | Bloqueo | Efecto | Irreversible |
|---|---|---|---|
| C | `DROP/CREATE TRIGGER` sobre `profiles`: `ACCESS EXCLUSIVE` breve | los inicios de sesión que leen el perfil esperan hasta `lock_timeout` | no |
| B1 | tabla nueva: ninguno relevante (**sin FK a `auth.users`**, que habría bloqueado altas y logins) | ninguno | no (borrar la tabla pierde las excepciones: exportarlas antes) |
| B2 | `CREATE TRIGGER`: `SHARE ROW EXCLUSIVE` sobre `project_prompts` | las escrituras esperan; las lecturas no, salvo cola detrás de una escritura pendiente | no |
| A2 | `DROP POLICY`: **`ACCESS EXCLUSIVE`** sobre `project_prompts` | las lecturas esperan | no |

Coste de A2/0040 que debe conocer el dueño: el trigger de reactivación rechaza **a todos salvo `service_role`,
incluido el rol `postgres` del editor SQL** (probado: A5b). Una corrección manual de una fila exige desactivar el
trigger durante esa sentencia.

## 6. Compatibilidad código ↔ base de datos

| Código desplegado | Base sin nada | + C | + B1 | + B2 | + 0039 |
|---|---|---|---|---|---|
| `main` (cliente de usuario inserta) | como hoy | igual | igual | **tope en la base**; el error sale como fallo de BD en las rutas que no lo traducen | igual |
| esta rama (RPC `add_project_prompts`, `service_role`) | **sin 0039: no se pueden añadir prompts (falla cerrado)** | ídem | ídem | ídem | funciona; el trigger puede rechazar con 23514 → se muestra como bolsa llena |

## 7. Lo que sigue sin resolver (no se implementa por inferencia)

- Una sola fuente de «comped» (hallazgo 5).
- Filas inactivas ilimitadas (hallazgo 10) y *deadlock* con transacciones largas (hallazgo 9).
- `service_role` en el flujo de usuario (solo A) y el cableado de la app para B (insertar con el cliente de usuario
  y traducir la reactivación): no escrito.
- Contador/exención durable del primer escaneo, congelación de ejecuciones en curso y esquema de la prueba de 14
  días (B5/B6): siguen siendo fases con su propio Task Intake.

## 8. Integridad

`SHA256SUMS` fija el contenido exacto de lo que se revisa; `lib/projects/prompt-pool-sql.test.ts` falla si un
fichero cambia sin actualizarlo. Verificar antes de pegar: `sha256sum -c SHA256SUMS` en esta carpeta.
