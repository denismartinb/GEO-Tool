# DOMAINS-REDESIGN-1 — referencia de diseño

Rediseño de la pantalla de Escaneos: deja de ser un panel de máquina y pasa a
ser **Dominios**, un selector limpio; todo lo que hoy vive ahí y sigue siendo
nuestro se muda a una pantalla interna **`/debug`**.

Explorado y aprobado en conversación con el fundador el 2026-08-05, en tres
iteraciones (tres propuestas → opción B elegida → cabecera oficial y estados).
El Task Intake de la fase está en `task-intake.md`, en esta misma carpeta.

## Ficheros

| Fichero | Qué es | Para qué |
|---|---|---|
| `pantalla-dominios.html` | La pantalla `/dashboard/domains` a pantalla completa, con shell, barra lateral y cabecera reales | **Referencia de implementación pixel-perfect** y entrada del `ux-pilot` para su checklist de fidelidad |
| `pantalla-debug.html` | La pantalla `/dashboard/projects/[projectId]/debug` completa, con los 7 bloques | Igual, para la pantalla interna |
| `exploracion-iteracion-3.html` | El artefacto de exploración: anatomía anotada, estados, reglas de estado en cabecera y el razonamiento de cada decisión | Contexto de *por qué* es así. No es la referencia visual — lleva anotaciones y prosa que no van en el producto |

Los tres son HTML autocontenido, sin dependencias externas: se abren en un
navegador, con `Read` o con `WebFetch` desde una sesión de agente o desde el
runner de GitHub Actions. Esa es toda la razón de que existan como ficheros del
repo y no como enlace de chat — ver el README de
`docs/design-reference/web-audit-issues-1/` para el incidente que estableció la
regla.

## Cómo leer las dos pantallas de referencia

Son fieles en estructura, espaciado, tipografía y color, con tres desviaciones
declaradas:

1. **Tipografía.** El producto carga Bricolage Grotesque (display) y Figtree
   (cuerpo) con `next/font`. Los ficheros caen a fuentes de sistema con los
   mismos pesos y *tracking*: las proporciones y la jerarquía son fieles, el
   carácter de la letra no. No copiar de aquí los `font-family`.
2. **Iconos de dominio.** En producción es el favicon real vía `faviconUrl()`.
   Aquí se ve el *fallback* (ficha con inicial sobre color determinista),
   porque un fichero local no puede pedir el favicon a Google.
3. **Datos.** Inventados y plausibles. Ningún número de estas maquetas es una
   medición.

Lo que sí hay que copiar literalmente: el shell (`--sidebar-w: 248px`,
`--header-h: 52px`, breakpoint 899px), el `.page` (`26px 34px 80px`), la
cabecera `.ov-sticky-header` con sus márgenes negativos, el ancho de columna
460/640/1200/1280 y el vocabulario de las pastillas.

## Invariantes que estas maquetas codifican

Cada uno es trazable; si una implementación se separa de ellos, es un bug de
fidelidad, no una interpretación:

- **La cabecera es `.ov-sticky-header`** — *kicker* + línea de identidad de
  15 px + pastilla a la derecha. Sin título grande propio.
  `design-decisions-log.md` §3.
- **El estado vive en la pastilla de esa cabecera, nunca en la barra de app.**
  Vocabulario: `Escaneando…` / `Analizando…` / `Escaneado <fecha>`, calculado
  por `computeScanStage`. §26.
- **`Auditando` entra en ese mismo vocabulario**, en vez de seguir siendo el
  chip `.scan-status` que el CSS oculta en móvil — cierra el pendiente
  declarado al final de §26.
- **En la cabecera de cuenta, la pastilla agrega**: un dominio activo →
  «Escaneando movistar.es»; varios → «N dominios en curso»; el escaneo gana a
  la auditoría (la auditoría corre después, §18); en reposo, sin pastilla.
- **El progreso separa generación de extracción.** Una barra que mide una sola
  etapa se lee como atascada. `.claude/rules/scan.md`, ADR 0029 Fase C.
- **El delta pasa por `resolveDelta`**, nunca una resta cruda. DELTA-GUARD-1 /
  ADR 0024.
- **Ningún control de escaneo o auditoría en la pantalla de cliente.** La
  automatización se cuenta con una línea informativa y con la frescura
  («Escaneado hoy, 06:14»), no con interruptores. Mismo criterio que
  AUDIT-NO-BUTTON-1 (§25).
- **La caja «Añadir dominio» va fuera del raíl, a ancho completo**, también en
  móvil: dentro del raíl cae fuera del viewport a 375 px.
- **`/debug` no aparece en el menú, pero es alcanzable.** `/dashboard/debug`
  redirige al `/debug` del dominio más reciente. Una pantalla de operación a la
  que el operador no puede llegar no es discreta, es inservible — y sin ese
  atajo la única vía era teclear una URL con un UUID dentro.
- **`/debug` no está en el menú de cliente.** La propuesta de protegerla además con
  `OPS_USER_EMAILS` + 404 la descartó el fundador el 2026-08-05 ("no he
  publicado aún la web"). La página pasa por `requireActiveProject`, así que un
  cliente sólo podría ver los internos de SUS proyectos, nunca los de otra
  cuenta — pero **hay que cerrarla antes de abrir la web al público**.

## Estado

**Fase A implementada** (2026-08-05, mismo PR). Lo que la implementación se
desvió del intake, y por qué:

- **El interruptor de auditoría por dominio SÍ entró**, con migración 0030
  (`projects.auto_web_audit_enabled`). El intake proponía dejarlo global; el
  fundador pidió el control real para contener coste en pruebas.
- **`OPS_USER_EMAILS` no entró** (ver arriba).
- **El driver de escaneo se monta en dos sitios**, no en uno: Visión general
  (donde aterriza el onboarding) y `/debug` (donde vive el botón «Repetir
  escaneo»). Es seguro porque los lotes se reclaman con un UPDATE atómico.

**Fase B pendiente**: los bloques de `pantalla-debug.html` que necesitan
consultas nuevas — motores, salud de extracción, alertas al operador, cola de
trabajos y respuestas con coste. `/debug` hoy tiene los bloques 5 y 6
(controles e historial) más el borrado de dominio.
