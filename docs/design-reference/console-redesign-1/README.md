# CONSOLE-REDESIGN-1 — referencia de diseño

Rediseño de la consola de cuenta: las cuatro pantallas de `/dashboard/settings`
—Perfil, Organización, Notificaciones, Plan y facturación— se funden en **una
sola ruta** con tres secciones y un índice pegajoso que además resume el estado
de la cuenta.

Explorado y aprobado en conversación con el fundador el 2026-08-06, en tres
iteraciones (tres opciones estructurales → **opción B** elegida → rev. 2 con dos
correcciones suyas). El Task Intake de la fase está en `task-intake.md`, en esta
misma carpeta, **pendiente de aprobación**.

## Ficheros

| Fichero | Qué es | Para qué |
|---|---|---|
| `pantalla-ajustes.html` | Reconstrucción navegable del diseño aprobado, con el vocabulario de clases de producción y los tokens de marca v3 | **Referencia de implementación** y entrada del `ux-pilot`; un agente puede abrirla, medirla y diffearla. Lleva escritorio y móvil en el mismo fichero: es una sola pantalla a dos viewports, no dos pantallas |
| `task-intake.md` | El Task Intake Full (12 puntos) de la fase | Alcance, ficheros permitidos y prohibidos, criterios de aceptación |

Es HTML autocontenido, sin dependencias externas: se abre en un navegador, con
`Read` o con `WebFetch` desde una sesión de agente o desde el runner de GitHub
Actions. Esa es toda la razón de que exista como fichero del repo y no como
enlace de chat — ver el README de `docs/design-reference/web-audit-issues-1/`
para el incidente que estableció la regla.

## Cómo leer la referencia

Es fiel en estructura, espaciado, tipografía y color, con dos desviaciones
declaradas:

1. **Tipografía.** El producto carga Bricolage Grotesque (display) y Figtree
   (cuerpo) con `next/font`. El fichero cae a fuentes de sistema con los mismos
   pesos y *tracking*: las proporciones y la jerarquía son fieles, el carácter
   de la letra no. No copiar de aquí los `font-family`.
2. **Datos.** Inventados y plausibles. Ningún número de esta maqueta es una
   medición. Las etiquetas de consumo sí son las reales de
   `plan-billing-section.tsx` («Prompts monitorizados», «Dominios», «Motores de
   IA») y los precios los de `app/pricing/plans-data.ts`.

Lo que sí hay que copiar literalmente: el shell (`--sidebar-w: 248px`,
`--header-h: 52px`, breakpoint 899px), el `.page` (`26px 34px 80px`), el ancho
de columna de 900 px, el índice de 186 px y el vocabulario de las pastillas.

## Invariantes que esta maqueta codifica

Cada uno es trazable; si una implementación se separa de ellos, es un bug de
fidelidad, no una interpretación:

- **Una sola ruta.** `/dashboard/settings` es la pantalla; las cuatro rutas
  viejas son redirects a sus anclas. **Permanentes, no temporales**: cuatro
  emails de `lib/email/transactional.ts` y los enlaces que genera
  `lib/notifications/render.ts` apuntan a ellas, y están en bandejas de entrada
  que no podemos reescribir.
- **Ninguna barra de pestañas.** Se retira `.set-tabs`/`.set-tab` del sistema.
- **Orden fijo: Cuenta → Avisos → Plan.** La sección más pesada y la que más va
  a crecer va la última, para que al crecer no empuje nada.
- **El índice lleva estado, no sólo enlaces** — nombre, avisos activos, plan.
  Con tres entradas, una columna que sólo navega no se gana su sitio; es lo que
  hace que la página única gane a las pestañas.
- **El índice no existe por debajo de 900 px.** Ni pastillas, ni pestañas, ni
  ningún elemento pegajoso propio de la página: móvil es un solo scroll. El
  argumento entero de esta opción es «una pantalla», y meter navegación por
  secciones en el viewport más pequeño la contradice (fundador, 2026-08-06).
- **«Eliminar cuenta» es el último bloque y no está en el índice.** Tras una
  línea y ~44 px de aire, en gris y con botón de contorno — sin bloque rojo
  relleno. A una acción irreversible se llega bajando, no de un clic (fundador,
  2026-08-06).
- **Cabecera de pantalla de cuenta según §32**: kicker + titular grande +
  pastilla de estado. La pastilla dice el plan y los días de prueba.
- **Organización no tiene pantalla: se reparte.** Lo declarativo va a un
  plegable cerrado dentro de Cuenta; el NIF sube a Plan, porque existe para la
  factura y ahí es donde se entiende.
- **Ningún control sin backend.** Fuera Idioma, Zona horaria, Cambiar foto,
  Activar 2FA y la pastilla de rol «Administrador / Miembro» (sin equipos, toda
  cuenta es admin de sí misma). Los cuatro avisos «Próximamente» de
  Notificaciones pasan de filas apagadas a una línea de texto.
- **Los avisos de facturación van por token.** `--warn` / `--warn-soft` /
  `--warn-ink`, nunca hexes escritos a mano — es la regresión de BRAND-4 que
  esta fase arregla. El ámbar de marca (`--brand-warm`) sigue prohibido en UI:
  es sólo el punto del logo.
- **Repintado con `.ov2-scope`**, el mecanismo que fijó el log §2, no uno nuevo
  por zona. El import de Hanken Grotesk **no se retira**: sigue siendo el
  `body` por defecto de las zonas aún sin migrar.
- **Forma: redondo es persona, squircle es dominio.** Avatar de persona en
  círculo con iniciales sobre azul suave y tinta plana (sin degradado,
  hallazgo de BRAND-4); favicon de dominio en squircle de radio 7–16 px. Regla
  nueva de esta fase: hoy conviven las dos formas sin criterio escrito, y esta
  pantalla las pone a pocos píxeles una de otra.

## Estado

**Pendiente de aprobación.** Nada implementado. La foto de perfil y el icono de
dominio editable quedaron **descartados** por el fundador el 2026-08-06 («de
momento nos quedamos con las iniciales»); el icono editable necesitaría Supabase
Storage y una columna nueva, así que sería fase propia si algún día se retoma.

**Fase B declarada y no aprobada**: los cuatro hallazgos restantes del modal de
cambiar de plan (ver `task-intake.md` §4). El hallazgo 1 —Agencia es un radio
seleccionable que no lleva a ninguna parte— sí entra en la Fase A, porque está
contenido en una celda de la rejilla y es el único de los cinco que ve el
usuario.
