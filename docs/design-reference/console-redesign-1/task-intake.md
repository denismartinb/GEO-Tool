# Task Intake Report — CONSOLE-REDESIGN-1

**Fecha:** 2026-08-06 · **Tipo:** Intake Full (12 puntos) · **Estado:** pendiente
de aprobación del fundador.

**Diseño aprobado:** opción B, rev. 2 — página única con índice de tres,
«Eliminar cuenta» al pie fuera del índice, móvil de un solo scroll. Explorado en
tres iteraciones con el fundador el 2026-08-06 (tres opciones → B elegida →
rev. 2 con borrado al pie y sin pastillas de móvil). La maqueta se commitea en
esta misma carpeta en el PR que implemente la fase.

---

## 1. Interpretación de la petición

La consola de cuenta tiene hoy cuatro pantallas —Perfil, Organización,
Notificaciones, Plan y facturación— organizadas por **tema**. El encargo es
reordenarlas por **el trabajo que alguien viene a hacer**, que son tres: quién
soy y cómo entro, qué me llega al correo, y qué pago y cuánto llevo gastado.

La forma elegida no es «tres pestañas» sino **una sola ruta**,
`/dashboard/settings`, con tres secciones apiladas y un índice pegajoso que
además resume el estado de la cuenta (nombre, avisos activos, plan). Las cuatro
rutas actuales pasan a redirigir a sus anclas.

Organización pierde pantalla propia y se reparte: lo declarativo (razón social,
sitio web, sector) va a un plegable cerrado dentro de Cuenta; el NIF sube a la
sección Plan, que es donde se entiende, porque existe para la factura.

Se retiran cuatro controles que hoy no hacen nada: **Idioma** y **Zona horaria**
(guardan en estado de React y se pierden al recargar), **Cambiar foto** (sin
backend, y encima habilitado: hoy aparenta funcionar) y **Activar 2FA** (sin
backend). El avatar se queda en iniciales. También se retira la pastilla de rol
«Administrador / Miembro»: sin equipos, toda cuenta es admin de sí misma.

De propina, y porque toca la misma pantalla: `plan-billing-section.tsx` pinta
sus dos avisos con cuatro hexes escritos a mano (`#f0c36d`, `#fdf6e8`,
`#92600a`, `#6b4b09`) que se saltan los tokens `--warn` / `--warn-soft` /
`--warn-ink`. Es una regresión de BRAND-4 **en el mismo fichero que BRAND-4
arregló**. El fundador aprobó arreglarlo aquí.

## 2. Evaluación de riesgo y alcance

**Cuatro riesgos, en orden.**

1. **P1 — las URLs viejas están en emails ya enviados.** `lib/email/
   transactional.ts` enlaza `/dashboard/settings/billing` en cuatro emails y
   `/dashboard/settings/notifications` en el pie de todos, y
   `lib/notifications/render.ts:270` genera enlaces a billing. Esos correos
   están en bandejas que no podemos reescribir. **Las cuatro rutas viejas se
   quedan como redirects permanentes, no temporales**, y esta fase no toca los
   emails: seguirán apuntando a la ruta estable, que redirige. Cambiarlos sería
   superficie extra sin ganancia y rompería `render.test.ts:363`.
2. **P1 — la comprobación de admin se muda de sitio.** Hoy
   `settings/billing/page.tsx` redirige a un no-admin antes de renderizar. Al
   fusionar todo en una página, esa comprobación pasa a decidir si la **sección**
   Plan se renderiza y si su entrada aparece en el índice. Si se pierde por el
   camino, un no-admin vería datos de facturación. Con equipos ocultos hoy no
   hay no-admins reales, pero el código no puede asumirlo.
3. **P2 — el dato viejo de `org_tax_info`.** Se parte en dos claves nuevas.
   Decisión aprobada por el fundador: **el contenido antiguo se vuelca entero en
   Razón social y el NIF nace vacío**. Implementación sin migración: al leer, si
   `org_legal_name` está vacío y `org_tax_info` tiene contenido, se siembra el
   campo con él; al primer guardado se escriben las dos claves nuevas.
   `org_tax_info` **no se borra** de `user_metadata` — es la fuente de reserva, y
   borrar datos de usuario a la ligera está prohibido.
4. **P2 — repintado de marca sin mecanismo nuevo.** Ajustes es la última zona de
   consola sin migrar a v3 (log §2). Se repinta con el wrapper `.ov2-scope` que
   ya existe (`app/globals.css:1295`), no con un mecanismo propio. El import
   global de Hanken Grotesk **no se retira**: sigue siendo el `body` por defecto
   de las zonas aún sin migrar.

**Riesgo de alcance.** El encargo mezcla rediseño de pantalla, retirada de
controles falsos, repintado de marca, un cambio de forma de datos y una revisión
de un flujo de pago. Las fases del punto 10 lo parten por la única línea que no
deja nada a medias: **el modal de cambiar de plan no entra**.

**Deriva de alcance vigilada.** Cuatro tentaciones que **no** entran sin
decisión aparte:

- Tocar `change-plan-modal.tsx` más allá del hallazgo 1 (ver Fase B).
- Reactivar cualquiera de los cuatro avisos «Próximamente» de Notificaciones.
- Foto de perfil o icono de dominio editable: descartado por el fundador el
  2026-08-06 («de momento nos quedamos con las iniciales»). Necesitaría Storage
  y columna nueva — prohibido sin aprobación explícita.
- Repintar «ya que estamos» ninguna otra zona.

## 3. Clasificación

**P1 con un P2 dentro.** No hay bloqueador de flujo: Ajustes funciona hoy. Es
una reordenación estructural de navegación (P1) más repintado y copy (P2). El
único componente con filo es el punto 2 del riesgo, que es de seguridad de datos
y va cubierto por test.

Se hace notar explícitamente, como manda la constitución: **no hay ningún P0
abierto que esta fase esté saltándose.** El flujo objetivo (registro → dominio →
escaneo → Overview) no toca ninguno de estos ficheros.

## 4. Nombre de fase

`CONSOLE-REDESIGN-1`, en dos fases:

- **Fase A — Ajustes en una página.** Todo lo descrito arriba, incluido el
  arreglo de los hexes a mano y el hallazgo 1 del modal (Agencia deja de ser un
  radio sin salida), que está contenido en una celda de la rejilla.
- **Fase B — el modal de cambiar de plan.** Los cuatro hallazgos restantes:
  un camino avisa antes de salir a Stripe y el otro no; el bloque de archivar
  dominios duplicado en dos pasos; el distintivo «Bajada de plan» fijo con un
  `.up` muerto en CSS; y «Disponible muy pronto» más el icono `grid` de
  cabecera. **Esta fase no se aprueba aquí** — necesita su propio intake porque
  toca un flujo de pago con cuatro estados y una integración con Stripe.

## 5. Rama

`claude/console-redesign-three-screens-lmg22o` (la rama designada). Fase B iría
sobre rama propia partiendo de `main` una vez mergeada la A.

## 6. Ficheros permitidos (Fase A)

| Fichero | Qué |
|---|---|
| `app/dashboard/settings/page.tsx` | pasa de `redirect` a **ser la pantalla**: cabecera §32, índice y las tres secciones |
| `app/dashboard/settings/layout.tsx` | se elimina — su cabecera se absorbe en `page.tsx` y las pestañas desaparecen |
| `app/dashboard/settings/profile/page.tsx` | `redirect("/dashboard/settings#cuenta")` |
| `app/dashboard/settings/organization/page.tsx` | `redirect("/dashboard/settings#cuenta")` |
| `app/dashboard/settings/notifications/page.tsx` | `redirect("/dashboard/settings#avisos")` |
| `app/dashboard/settings/billing/page.tsx` | `redirect("/dashboard/settings#plan")` |
| `app/dashboard/settings/team/page.tsx` | actualiza el destino del redirect existente |
| `components/settings/settings-tabs.tsx` | **se elimina** |
| `components/settings/profile-tab.tsx` | → `account-section.tsx`: sin idioma, sin zona horaria, sin foto, sin 2FA, sin pastilla de rol |
| `components/settings/organization-tab.tsx` | → `company-fold.tsx`: plegable cerrado, sin el NIF (sube a Plan), sin el botón de logo |
| `components/settings/notifications-tab.tsx` | → `notifications-section.tsx`: las 4 filas «Próximamente» pasan a una línea de texto al pie |
| `components/settings/delete-account-button.tsx` | reestilado a tono bajo; copy nuevo |
| `components/settings/settings-index.tsx` | *(nuevo)* el índice pegajoso con estado; sólo escritorio |
| `components/settings/setting-row.tsx` | sin cambios de API, repintado vía scope |
| `app/dashboard/settings/organization/actions.ts` | `org_tax_info` → `org_legal_name` + `org_tax_id`, con la siembra del punto 3 |
| `app/dashboard/settings/profile/actions.ts` | sin cambios de lógica; sólo si hace falta por el borrado del avatar |
| `components/billing/billing-content.tsx` | su modo `embedded` pasa a ser la sección Plan |
| `components/billing/plan-billing-section.tsx` | los 4 hexes → tokens `--warn*`; aviso de prueba a informativo |
| `components/billing/change-plan-modal.tsx` | **sólo** el hallazgo 1: Agencia deja de ser radio y gana su enlace a ventas |
| `components/sidebar.tsx` | `user-chip` apunta a `/dashboard/settings` |
| `app/globals.css` | `.set-*` bajo el scope de marca; se retiran `.set-tabs`/`.set-tab`; `.cp-sales` para la celda de Agencia |
| `app/dashboard/settings/organization/actions.test.ts` | *(nuevo)* cubre el reparto de `org_tax_info` |
| `app/dashboard/settings/billing/actions.test.ts` | ampliar: la sección Plan no se renderiza para un no-admin |
| `tests/pilot/journeys/settings.spec.ts` | *(nuevo)* **la journey no existe hoy** — ver punto 9 |
| `docs/design-reference/console-redesign-1/` | maqueta aprobada + este intake |
| `docs/brand/design-decisions-log.md` | entrada §38 de cierre de fase |
| `docs/brand/brand-guidelines.md` | regla de forma: redondo = persona, squircle = dominio |
| `CLAUDE.md` | fila nueva en el mapa de zonas: «Ajustes de cuenta» |

## 7. Ficheros prohibidos

- `supabase/**` y cualquier migración — **no hay ninguna en esta fase**. El
  reparto de `org_tax_info` es en `user_metadata`, no en esquema.
- `lib/email/transactional.ts` y `lib/notifications/render.ts` — ver riesgo 1.
- `lib/billing.ts`, `app/dashboard/settings/billing/actions.ts` — la lógica de
  Stripe no se toca; sólo su presentación.
- `app/pricing/plans-data.ts` — precios y topes son la verdad publicada.
- `change-plan-modal.tsx` más allá del hallazgo 1.
- `lib/scan/**`, `lib/scoring/**`, `lib/llm/**`, `Documentacion/**`.

## 8. Criterios de aceptación

1. `/dashboard/settings` renderiza **una sola página** con tres secciones en
   orden Cuenta → Avisos → Plan, y ninguna barra de pestañas en el DOM.
2. Las cuatro rutas viejas responden con redirect a su ancla. Un enlace de un
   email antiguo a `/dashboard/settings/billing` aterriza en la sección Plan.
3. El índice muestra tres entradas con su dato de estado, se mantiene pegajoso
   al hacer scroll y marca la sección visible. **No aparece a ≤899 px.**
4. A 375 px no hay pastillas, ni pestañas, ni ningún elemento pegajoso propio de
   la página; el ancho de scroll del documento es exactamente 375 px.
5. «Eliminar cuenta» es el último bloque de la página, **no está en el índice**,
   va tras una línea y ~44 px de aire, y su texto es: «Esta acción es
   irreversible. Se borrará el historial y todos los datos asociados a tu
   cuenta.»
6. No existe en la pantalla ningún control sin backend: fuera Idioma, Zona
   horaria, Cambiar foto, Activar 2FA y la pastilla de rol.
7. Una cuenta con `org_tax_info` previo ve ese texto en **Razón social** y el
   **NIF vacío**; tras guardar, ambas claves nuevas están en `user_metadata` y
   `org_tax_info` sigue presente.
8. Un usuario no-admin no recibe la sección Plan ni su entrada de índice.
9. En el modal, **Agencia ya no es seleccionable**: es una celda con enlace a
   ventas, y no existe estado en el que «Continuar» quede apagado por haberla
   elegido.
10. Ningún hex de color escrito a mano en `plan-billing-section.tsx`; todo vía
    token.
11. Cero cambios visuales fuera de `/dashboard/settings` y el modal de plan.
12. Existe `tests/pilot/journeys/settings.spec.ts` y la pantalla aparece en la
    tabla del piloto en los tres viewports.
13. `pnpm test` y `pnpm run validate` en verde; `git diff --check` limpio.

## 9. Comandos de validación

```bash
pnpm test
pnpm run validate
git diff --check
bash scripts/agentic-handoff-check.sh
pnpm pilot --url https://<preview>.vercel.app   # journeys de lectura
```

**Nota para el piloto — hueco detectado el 2026-08-06.** La journey de Ajustes
**no existe**. Se comprobó contra la pasada del piloto en este mismo PR: barrió
44 pantallas en tres viewports y `/dashboard/settings` no está en ninguna fila,
porque ninguna journey de lectura la visita (`tests/pilot/journeys/` sólo
cubre core-flow, docs, notificaciones, páginas públicas y el segundo proyecto).
Sin crearla, la Fase A se implementaría y **ningún piloto la vería nunca**.

Al escribirla, la `ContentExpectation` debe exigir **el email real de la cuenta
piloto** en el campo Email y **el nombre real del plan** en la sección Plan.
Ajustes es una pantalla de formulario: siempre «renderiza» aunque no haya datos,
así que un pase verde no prueba nada por sí solo. Un campo vacío o un «—» es
fallo, no estado válido — es exactamente el fallo de Auditoría web del
2026-08-02.

Además debe cubrir tres cosas que sólo se ven interactuando, y que de otro modo
quedarían «no verificadas»: que el **plegable de empresa** abre y su contenido
no se renderiza cortado, que el **índice desaparece a 375 px** sin dejar ningún
pegajoso, y que **«Eliminar cuenta» no aparece en el índice** en ningún
viewport.

## 10. Acción recomendada

**Implementar la Fase A completa en un PR, y dejar la Fase B sin aprobar.**

El reparto no es negociable por comodidad: Ajustes es una pantalla, el modal es
un flujo de pago con cuatro estados y Stripe detrás. Juntos hacen un PR que
nadie revisa de una sentada, y la constitución pide un concern por PR.

El hallazgo 1 sí se adelanta a la A porque está contenido en una celda de la
rejilla, es el único de los cinco que el usuario ve, y dejar un callejón sin
salida vivo mientras se toca esa misma pantalla sería raro.

## 11. Prompt de ejecución optimizado

> Implementa CONSOLE-REDESIGN-1 Fase A en la rama
> `claude/console-redesign-three-screens-lmg22o`, contra la maqueta aprobada en
> `docs/design-reference/console-redesign-1/`.
>
> Funde las cuatro pantallas de `/dashboard/settings` en una sola ruta con tres
> secciones (Cuenta → Avisos → Plan) y un índice pegajoso con estado, sólo en
> escritorio. Las cuatro rutas viejas quedan como redirects **permanentes** a
> sus anclas: hay emails ya enviados que apuntan a ellas, así que no toques
> `lib/email/transactional.ts` ni `lib/notifications/render.ts`.
>
> Retira Idioma, Zona horaria, Cambiar foto, Activar 2FA y la pastilla de rol.
> Mueve Organización a un plegable cerrado dentro de Cuenta, sin el NIF, que
> sube a Plan. Parte `org_tax_info` en `org_legal_name` + `org_tax_id` **sin
> migración**: siembra Razón social con el valor viejo cuando el nuevo esté
> vacío, deja el NIF vacío, y no borres la clave antigua.
>
> «Eliminar cuenta» va al pie, fuera del índice, en tono bajo, con el copy del
> criterio 5. En móvil no hay pastillas ni nada pegajoso: un solo scroll.
>
> Repinta la zona a marca v3 con el wrapper `.ov2-scope` que ya existe — no
> inventes un mecanismo nuevo, y no retires el import de Hanken Grotesk.
> Sustituye los cuatro hexes a mano de `plan-billing-section.tsx` por los tokens
> `--warn*`. En `change-plan-modal.tsx` toca **sólo** la celda de Agencia:
> deja de ser un radio y gana su enlace a ventas.
>
> Preserva la comprobación de admin: sin ella, la sección Plan y su entrada de
> índice no se renderizan. Cúbrela con test, junto al reparto de
> `org_tax_info`.
>
> Cierra la fase en el mismo PR: maqueta aprobada commiteada, entrada §38 en
> `docs/brand/design-decisions-log.md`, la regla de forma en
> `docs/brand/brand-guidelines.md`, y la fila «Ajustes de cuenta» en el mapa de
> zonas de `CLAUDE.md`.

## 12. Puerta de aprobación

¿Apruebas este plan? No implementaré hasta que lo confirmes.
