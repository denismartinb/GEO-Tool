# HEADER-RECURSOS-MEGA-1 — mega menú "Recursos" en la cabecera pública

**Estado: en implementación.** Fase 2 de BLOG-INDEX-CARDS-2026-08 (log §169),
separada de la Fase 1 (rediseño del índice de `/blog`, ya fusionada en PR
#479) por su radio de impacto — `components/marketing/public-header.tsx` lo
comparten las ~8 superficies públicas del sitio.

`version-b-mega-menu.dc.html` es el artboard "HeaderMega.dc.html" del
artefacto de diseño original (Claude Design canvas, iterado con el fundador
durante la Fase 1), extraído de su historial de versiones y recuperado en
esta sesión porque el artefacto en sí no es accesible desde CI ni desde una
sesión futura — sólo el HTML que ya vivía dentro de él. Es la **Versión B**
que el fundador aprobó explícitamente ("En el menú la opción B").

Se abre directamente en el navegador, sin servidor ni dependencias (usa
`support.js` del propio canvas, que no hace falta para leer el marcado).

## Qué muestra

Un mockup de página pública con la barra actual sin cambios (Producto · Cómo
funciona · Qué es GEO · Precios · Blog) y un disparador nuevo **"Recursos"**
al final, con un panel abierto ilustrando el mega menú: dos columnas
("Producto" y "Recursos") más una tarjeta promocional del comprobador
gratuito.

La nota del propio artboard, al pie, es la especificación textual:

> Versión B · Mega menú — la barra actual se mantiene igual; el desplegable
> añade "Recursos" para Comparativas, Docs y Glosario sin ocupar sitio en la
> barra

## Qué implementa realmente esta fase (Task Intake aprobado)

Fiel a esa nota, **no** a la columna "Producto" duplicada del mockup (que es
ilustrativa, no una navegación de Producto que hoy exista como desplegable):
el disparador "Recursos" abre un panel con **Blog, Comparativas,
Documentación y Glosario** (título + descripción de una línea cada uno) y la
tarjeta del comprobador gratuito. El resto de la barra no cambia.
