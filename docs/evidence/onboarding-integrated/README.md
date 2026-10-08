# Evidencia · asistente integrado (identidad + responsive + plan de escaneo) — FIXTURE

**Datos simulados.** Estas capturas salen de la rama **de previsualización** `claude/onb-responsive-preview-2` (nunca se fusiona): contiene esta rama (#553, con la alternativa responsive ya integrada) **más el head de #550** (`4264b927`, SCAN-PLAN-UNITS-1) y unas rutas de fixture con respuestas fijas.
No llama a Gemini, Supabase ni Stripe; «Crear dominio» no hace nada. Chromium sobre Linux, sin dispositivo real. Una imagen no es una prueba de interacción.

## Cómo leer estas imágenes (estado exacto)

- **Integrado en la rama de #553:** identidad + responsive (`claude/onboarding-proposal-quality-grq3xv`). **No fusionado en `main`.**
- **#550 solo está unido en un fixture temporal** (rama de previsualización, no en #553): las capturas con «72» **no son evidencia de #553 aislado ni de backend real**; #553 por sí sola no muestra esa cifra.
- **Despliegue:** el enlace automático de Vercel de #553 pide login y no confirma la rama de previsualización. La rama `claude/onb-responsive-preview-2` (@ `e478195c`) está empujada; su despliegue **no es visible para mí** (sin PR y con 403 en Vercel). Cuando el dueño lo vea, la relación a anotar es rama → commit → URL del panel.
- Los tests de fuente no prueban layout ni interacción: lo que sí se midió con Chromium está en «Medidas».
- **Legibilidad a 768 px: no cerrada.** Que `scrollWidth` = ancho solo dice que no hay desborde de página; las preguntas completas siguen recortadas a una línea (ver «Propuesta mínima»).

## Qué muestra

- Paso 3 con **72 respuestas esperadas · 8 prompts × 3 pasadas × 3 motores** (plan Pro, muestreo activo): la cuenta de #550 sigue intacta con el asistente de identidad y el responsive. `scanContext` se conserva tal cual.
- Los tres pasos a 390, 768 y 1280 px y el caso de texto largo (paso 2) a 390 y 768.

## Medidas (mismo fixture, 390 / 768 / 1280)

- 0 elementos fuera del viewport y `scrollWidth` = ancho en las 18 combinaciones (normal y largo, 3 pasos).
- Tab hasta «Continuar a prompts» (paso 2) y «Crear dominio y escanear» (paso 3): alcanzado en las 6 pruebas (normal y largo × 3 anchos).
- Editor de prompt: 320 px de ancho a 390, 188 px a 768, 592 px a 1280; «Listo, prompt 1» + Enter lo cierra.
- A 768 px el texto del prompt sigue en una línea con puntos suspensivos (editor con engranaje). A 390 el caso largo recorta «Estados Unidos» en la barra de dominio (78/95 px, con puntos suspensivos).
- Caso largo: «45 respuestas esperadas · 3 prompts × 5 pasadas × 3 motores». Es consecuencia del redondeo de la cuenta de #550, **no** un suelo garantizado de 50; se deja visible tal cual, sin corregirla.

## No verificado

Dispositivo real, otros navegadores, lector de pantalla, la creación real de un dominio y un escaneo, el piloto y el preview real con backend.

## 390 px

![390 px · Paso 1 · dominio (fixture)](./390-paso1.png)

![390 px · Paso 2 · competidores e identidad (fixture)](./390-paso2.png)

![390 px · Paso 3 · prompts y 72 respuestas (fixture)](./390-paso3.png)


## 768 px

![768 px · Paso 1 · dominio (fixture)](./768-paso1.png)

![768 px · Paso 2 · competidores e identidad (fixture)](./768-paso2.png)

![768 px · Paso 3 · prompts y 72 respuestas (fixture)](./768-paso3.png)


## 1280 px

![1280 px · Paso 1 · dominio (fixture)](./1280-paso1.png)

![1280 px · Paso 2 · competidores e identidad (fixture)](./1280-paso2.png)

![1280 px · Paso 3 · prompts y 72 respuestas (fixture)](./1280-paso3.png)


## Texto largo (paso 2)

![390 px · texto largo · paso 2 (fixture)](./largo-390-paso2.png)

![768 px · texto largo · paso 2 (fixture)](./largo-768-paso2.png)

## Propuesta mínima para lo que queda abierto (NO implementada; a decidir)

Con las medidas actuales a 768 px (fila de prompt = 188 px de texto; textos de ejemplo de 208 a 419 px de ancho natural, el caso largo 1280 px):
1. **Prompts a 561–900 px:** pasar de una línea con puntos suspensivos a un máximo de **3 líneas** (`line-clamp`) en `.onb2-ptext`. Con 188 px cubriría los ejemplos normales (419/163 ≈ 2,6 líneas) pero **no** el caso largo (≈ 6,8 líneas): ahí seguiría el editor. Es un solo selector en el bloque responsive, sin cambiar props ni textos.
2. **País largo a 390 px:** hoy se recorta «Estados Unidos» (78/95 px). Mínimo: reducir el hueco de la bandera/chevron o aceptar el recorte con puntos suspensivos y `title`. Sin tocar la lista de países.
3. **Editor de 3 filas:** dejar crecer el textarea con el contenido (`field-sizing: content` con `max-height` y desplazamiento) o subir `rows` solo por encima de N caracteres. No se ha medido en navegadores distintos de Chromium; `field-sizing` no es universal, así que el alternativo con `rows` es el seguro.
Nada de esto se aplica sin decisión; se medirá de nuevo con captura a 768 si se aprueba.
