# Comprobador gratuito rehecho — GEO-SELF-1 Fase 5

Aprobado por el fundador el 2026-10-10 («Me vale»). Implementado en
`app/gratis/aparece-mi-marca-en-chatgpt/page.tsx` y
`components/free-checker/free-checker-form.tsx` (log §263).

- `Main.dc.html` — escritorio, 1280 px.
- `Movil.dc.html` — móvil, 390 px.

Lo que el diseño fija:

- Portada oscura (la misma de los artículos del blog) con el campo dentro:
  campo y botón en fila en escritorio, apilados en móvil.
- «Así es un resultado»: un ejemplo **inventado y etiquetado como tal**, con
  los mismos bloques que el resultado real (pregunta, respuesta, marcas,
  fuentes). Nunca datos de un cliente.
- «Qué significa tu resultado»: tres tarjetas.
- Gratis frente a completo: tabla en escritorio, dos tarjetas en móvil.
- Cinco preguntas frecuentes, sin cifras absolutas, y tres enlaces de cierre.

La cabecera del boceto es la de la maqueta; en producción manda
`PublicHeader`.
