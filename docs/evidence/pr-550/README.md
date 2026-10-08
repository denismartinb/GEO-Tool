# Evidencia visual de #550 (SCAN-PLAN-UNITS-1)

**Código evaluado:** rama `claude/scan-progress-recovery-diibz3`, commit de código
`bbeb7bb`. Este directorio se añade en un commit posterior **solo de
documentación** (no cambia ningún fichero de producto).

## Qué es y qué NO es esta evidencia

**Todas las imágenes son `FIXTURE`**: los componentes reales del PR
(`OnboardingWizard`, `ScanMissionRocket`) renderizados en una página temporal
de pruebas, con **datos simulados** (sugerencias del asistente y estado del run
inventados), sin backend, sin sesión y sin ningún escaneo real. La página de
pruebas no está en el repo.

- **No es el preview de Vercel** y **no es la aplicación con datos reales**.
  El preview del commit `bbeb7bb` existe (despliegue `success`,
  https://geo-tool-e2k223s99-9v7mrc44g8-1223s-projects.vercel.app) pero **no se
  ha podido abrir desde el entorno donde se hizo este trabajo**: no hay
  verificación de la UI real. El piloto agéntico queda pendiente de identidad 07.
- Una imagen no es una prueba de interacción. Lo que sí se ejercitó: en el
  asistente (`asistente-*`), un script de navegador escribió el dominio y pulsó
  los botones reales hasta llegar al paso de prompts, y de ahí se capturó el
  panel. La misión (`mision-*`) es una **captura estática** del beat «Ascenso»:
  no se grabó su animación ni su sondeo.
- Flujos **no** verificados con evidencia: crear el proyecto de verdad, el
  cambio de beat durante un escaneo real, el estado terminal y el refresco al
  terminar, y cualquier pantalla con datos reales.

## Capturas

Anchos 390 y 1280 px. «Panel» = el panel «Resumen del lanzamiento» del último
paso del asistente.

| Fichero | Fixture | Qué demuestra |
|---|---|---|
| `asistente-pro-15x3-{390,1280}-resumen.png` | 15 prompts, plan con 3 motores | «90 respuestas esperadas» con `15 prompts × 2 pasadas × 3 motores` y por qué hay pasadas (antes decía 45). |
| `asistente-pro-15x3-{390,1280}-completo.png` | ídem | El paso completo, para ver el panel en contexto. |
| `asistente-elcorteingles-8x3-{390,1280}-resumen.png` | 8 prompts, 3 motores | «72 respuestas», `8 × 3 pasadas × 3` (antes prometía 24). |
| `asistente-free-1motor-10-{390,1280}-resumen.png` | plan Free: 1 motor, 10 prompts | «10 respuestas», `10 prompts × 1 motor`; sin pasadas ni explicación; ya no anuncia tres motores. |
| `mision-15x3x2-{390,1280}.png` | run de 30 lanzamientos, 2 pasadas | El carril imprime la misma ecuación que el asistente (90); la nota define «lanzamiento» (30 → 90). |
| `mision-8x3x3-{390,1280}.png` | run de 24 lanzamientos, 3 pasadas | Caso elcorteingles: 72. |
| `mision-limitado-2x3x5-{390,1280}.png` | 2 prompts, tope de 5 pasadas, 30 respuestas | Un run limitado por el tope lo dice («Aun así quedan 30… margen de error») en vez de afirmar que llega a 50. |

## Qué cubre ya el repo sin navegador

- `lib/scan/run-plan.test.ts`: la cuenta, Free, el caso limitado y la
  paridad con el run real.
- `lib/scan/run-creation.test.ts`: la cuenta anunciada coincide con el run que
  crea el backend (15×3, 8×3, Free).
- `tests/scan-plan-units.test.ts`: ni el asistente ni la misión vuelven a
  multiplicar por su cuenta; las cifras publicadas en la metodología están
  atadas al código.

## Documentación relacionada

- Histórico: `docs/brand/design-decisions-log.md` §236 (número provisional,
  se renumera al rebasar).
- Reglas: `.claude/rules/scan.md` y `.claude/rules/mission-rocket.md`.
- Metodología pública: `app/docs/metodologia/geo-score/page.tsx`.

Sin secretos, credenciales, cookies, datos de clientes ni datos personales.
