# HERO-AURA-1 — el fondo del hero de la portada

Diseño aprobado por el fundador el 2026-08-21 e implementado en el mismo PR.
Los dos HTML de esta carpeta son las maquetas tal y como se aprobaron, no una
reconstrucción posterior: se exportaron del lienzo «Portada GenScore» y son
lo que hay que abrir para juzgar fidelidad.

| Fichero | Qué es |
|---|---|
| `fondo-5-aura-suave.html` | El hero a 1280 px. Es el artboard «Fondo 5 · Aura suave» del lienzo. |
| `fondo-5-movil.html` | El artboard móvil a 390 px, con el juego corto de dos lazos. |

Ábrelos en el navegador. Los iconos y la tarjeta de la demo salen vacíos: son
ficheros y plantillas que resuelve el editor del lienzo y que aquí no existen.
**Lo que hay que mirar es el fondo**, que sí es exactamente el implementado.

## Por qué el 5 y no los otros cinco

Se dibujaron seis fondos. Los tres primeros eran patrones de líneas —malla
diagonal, constelación, topografía— y el fundador los descartó a favor de luz
difusa. El 4 subió intensidad, el 6 calcó una referencia externa píxel a píxel.
Ganó el 5: la misma forma circular que el 4 pero con los bordes tres veces más
anchos y la mitad de opacidad. **Se eligió por discreto**, y ése es el criterio
que hay que preservar si alguien lo retoca.

## Lo que NO se implementó

Las maquetas llevan un titular («¿Te recomienda la inteligencia artificial?»),
una bajada y una tarjeta-demo de ChatGPT que **no son los de producción**. Ese
rediseño del hero no está aprobado: sólo el fondo. Si alguien abre estos
ficheros y ve que la portada real no coincide en el texto, es deliberado.

## Los invariantes viven en el CSS

La geometría, los dos cortes responsive y por qué el hero no crea contexto de
apilamiento están anotados en `app/globals.css`, junto a las reglas `.ha-*`.
Se documentan ahí y no aquí a propósito: es lo que se abre para modificarlos.
