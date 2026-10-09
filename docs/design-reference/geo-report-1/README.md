# GEO-REPORT-1 — diseño aprobado

Informe de GenScore que sustituye al PDF de «Exportar plan» (PDF-EXPORT-PLAN-1,
`../pdf-export-plan-1/`). Aprobado por el fundador el 2026-10-09: primero el
formato del informe de prospecto de La Fábrica del SEO («me gusta mucho más que
el que ahora sale en la herramienta»), después esta versión producto («Sí»).

`informe-geo.html` es una instantánea estática de las ocho páginas a tamaño A4
real (794×1123 px, 96 dpi), con sus logos y fuentes locales al lado. Ábrelo en
un navegador o imprímelo a PDF para verlo.

## Qué es igual al informe de prospecto

La maqueta entera: portada oscura con la cifra de menciones, «Lo esencial»,
mapa pregunta × motor agrupado por tema, competencia con barras por motor,
fuentes por tipo, auditoría técnica, tres acciones y contraportada.

## Qué cambia en la versión producto

- Habla de «tú»: el lector es el cliente.
- Todo el texto narrativo sale de plantillas sobre datos calculados
  (`lib/report/report-model.ts`). Lo único literal son las citas, que son
  frases tal cual de las respuestas guardadas.
- La página 6 audita sólo la web del cliente. Comparar con la de un competidor
  exige traer webs de terceros y queda para una fase con aprobación propia.
- La página 7 son las tres primeras acciones del plan de Recomendaciones.
- La contraportada lleva al próximo escaneo y a la consola, sin firma personal.
- La portada muestra la Puntuación GEO. En esta instantánea sale «—» porque
  los datos de muestra vienen de un estudio, no de un proyecto.

## Datos de la instantánea

Estudio real de lafabricadelseo.com del 9 de octubre de 2026, hecho con
`/admin/estudio`. La agrupación por tema, las citas, el tipo de cada fuente,
la tabla técnica y las acciones se tomaron de la curación a mano de ese
informe; en producto salen de los datos del escaneo.

## Normas de contenido (fundador, 2026-10-09)

Sólo porcentajes y proporciones, nunca cifras absolutas de preguntas,
respuestas o escaneos. Motores por su nombre (ChatGPT, Gemini, Claude), sin
versiones. La lista de preguntas se llama siempre «preguntas principales de
búsqueda». Marcas en texto plano.
