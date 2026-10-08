# Evidencia · parche local ONBOARDING-GRID-MOBILE-1 (una declaración de CSS)

**El parche NO está en esta rama ni en ningún PR.** Vive en la rama **local** `claude/onb-grid-minmax-1` (`ff13d5b0`, sin empujar). Para medirlo con las
tarjetas nuevas del asistente se aplicó la misma línea en el árbol de trabajo de la rama del wizard, se midió y **se revirtió sin commitear**.

```diff
 @media (max-width: 760px) {
-  .onb2-grid { grid-template-columns: 1fr; }
+  .onb2-grid { grid-template-columns: minmax(0, 1fr); }
```

Fichero: `app/globals.css` (zona `styles.md`). Más un test de contrato a nivel de fuente (`tests/onboarding-grid-mobile.test.ts`, falla sin el cambio).

## Qué son estas imágenes

**FIXTURE — datos simulados.** Playwright contra `next dev` local con una página temporal **que no está en el repo** (respuestas fijas en lugar de las server
actions, sin Gemini ni Supabase, sin preview de Vercel). Cada captura lleva una banda amarilla que lo dice. Una imagen no es una prueba de interacción.
Doce capturas: pasos 1 (dominio), 2 (competidores e identidad) y 3 (prompts) a 320, 360, 390 y 1280 px.

## Qué se midió (12 combinaciones, con el parche aplicado)

- Ningún elemento visible fuera del viewport y `scrollWidth = clientWidth` en las 12.
- Antes del parche, la columna medía 427 px de borde derecho a 390, 360 y 320, y «Continuar» quedaba fuera (medido con CSS inyectado en la iteración anterior).
- Controles (ancho×alto, todos «dentro»): «Continuar» 94×44 (móvil) / 130×44; «Atrás» 60×36; «Continuar a prompts» 180×36; «Crear dominio y escanear» 208–210×36; nombre comercial 238–308×40 según ancho;
  «Añadir» 68×36; selector de país **34×38** en móvil (112×38 en 1280); selector de idioma 94×32.
- **País, accesible:** el selector es un `combobox` con nombre «País de análisis» y valor «España» (1 coincidencia por rol), y el contenedor lleva `title`. El orden de Tab en el paso 1
  es dominio → país → «Continuar».
- **País, visible:** en móvil el nombre **se colapsa (0×0) y queda solo la bandera**; en 1280 se ve «España» (44×20). Es un efecto del parche: la barra ahora tiene que caber y el nombre es lo que cede.

## Lo que se ve y no es agradable (no se esconde)

- A 320 px el campo de dominio muestra «elcortei…»: el texto escrito queda truncado a la vista (sigue completo dentro del campo).
- A 320 px los nombres de competidor se cortan junto al chip («Ama…», «Esp…»). El chip es previo a este parche; con el parche la columna es más estrecha que antes.
- Zonas táctiles por debajo de 44 px: país 34×38, idioma 94×32, botones de 36 de alto. Cumplen el mínimo de 24×24 de WCAG 2.2 AA; no la recomendación de 44.

## Qué NO se verificó

- Lector de pantalla real, iOS Safari, Android, otros navegadores (solo Chromium).
- Orden de Tab en los pasos 2 y 3 (solo se midió en el paso 1).
- Que otras pantallas que usen `.onb2-grid` no cambien: se midió solo este asistente.
- Un escaneo ni una creación real.

**El parche altera visualmente el selector de país (solo bandera en móvil).** Por eso se queda local y a la espera de decisión; no se integra.
