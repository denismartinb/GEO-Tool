# Plugin de WordPress — invariantes

Se inyectan solos al tocar `docs/wordpress-plugin/**`. Cada regla es trazable a
`docs/brand/design-decisions-log.md` §421.

- **La nota es la de la extensión.** `assets/vendor/collect.js` y `score.js`
  son copia exacta de `docs/chrome-extension/prueba/extension/`. Si cambia la
  extensión, se copian en el mismo PR (lo vigila `tests/wordpress-plugin.test.ts`).
- **El plugin sólo llama a genscore.es tras «Conectar con GenScore»** (WP-PLUGIN-2,
  log §432, sustituye a «no llama» de §421). Todas las llamadas viven en
  `includes/account.php`, desde el servidor: descubrimiento OAuth, registro,
  token y GET a `/api/ext/context` y `/api/ext/project`. Nada más, y nada desde
  el navegador (lo vigila `tests/wordpress-plugin.test.ts`). Una llamada nueva
  necesita aprobación y su línea en «External services» del readme.
- **El token nunca llega al navegador**: opción `genscore_account` sin
  autocarga, leída sólo por el servidor. La pantalla recibe las cifras ya
  pedidas. Un 401 que no se arregla renovando desconecta la web.
- **Sin ventas dentro de WordPress** con la cuenta conectada: sin precios ni
  pago, sólo un enlace informativo a `/precios` (misma regla que el MCP).
- **Nunca toca el grupo `*`, Googlebot ni Bingbot**, y nunca escribe ficheros:
  sólo el filtro `robots_txt` con su bloque `# BEGIN GenScore`. Con robots.txt
  físico, web no pública o WordPress en subcarpeta, los interruptores se
  desactivan y se dice por qué.
- **«Permitir» sólo escribe si cambia algo** (adendas 1.0.1 y 1.0.2 de §421):
  el bot estaba en un grupo de otro plugin. Nunca reabre una web que `*`
  cierra entera. Apagar y volver a encender un bot devuelve el robots.txt
  original, byte a byte (test).
- **llms.txt sólo guarda texto que la persona escribió** (adenda 1.0.2): el
  cuadro manda el texto sólo si se editó, se compara antes de limpiar y se
  limpia con `wp_strip_all_tags`, que conserva las URL codificadas.
- **La guarda de cada PHP es `defined( 'ABSPATH' ) || exit;` a secas**, y cada
  acción AJAX llama a `check_ajax_referer` en su propia función (Plugin Check).
- **Agentes en WooCommerce es la nota de una ficha**, no del escaparate de la
  portada; la Nota SEO + IA sigue siendo la de la portada.
- **llms.txt cede ante otro**: Yoast, Rank Math, AIOSEO o un fichero físico.
  Las descripciones salen del extracto, del meta del plugin SEO o de la propia
  página; nunca se inventan.
- **Sin cuenta, «Tu dominio» no enseña cifras**: sólo maquetas sin números y un
  botón a `/signup?dominio=`. Nada de rastreo ni de avisos fuera de su pantalla,
  salvo el widget del escritorio, que se puede ocultar (normas de WordPress.org).
- **Cada acción AJAX comprueba nonce y `manage_options`**, y todo valor de
  entrada se contrasta con una lista fija.
- **Publicar en WordPress.org lo decide Denis.**
- **Mientras `*` cierre la web, ningún interruptor escribe un grupo de permitir**,
  ni siquiera para un bot que otro plugin bloqueaba (adenda 1.0.3 de §421).
- **La página revisada viaja como id (`?post=`), nunca como URL**: la dirección
  sale de `get_permalink` y sólo vale si es pública y de esta web
  (`genscore_review_choice`).
- **La nota del plugin es la de la web entera** (adenda 1.0.4 de §421): la media
  de las páginas importantes (`genscore_key_pages`, como mucho
  `GENSCORE_KEY_PAGES`: portada, menús, productos más vendidos, últimas
  entradas y páginas recientes). Nunca se pide a la persona que elija página.
- **Cada nota de página se guarda en `genscore_page_scores`, en la propia web**,
  saneada (`genscore_sanitize_page_score`) y con tope de 60. Guardar o borrar
  un post borra sólo su nota, y sólo esa página se vuelve a leer.
- **La columna «GenScore» de las listas sólo lee lo guardado**: no revisa nada
  al pintar la lista.
- **Antes de entregar un zip se pasa el guion en un WordPress real** (con
  WooCommerce y Plugin Check), no sólo los tests de PHP.
- **Meta se enseña fuera de la nota** (adenda 1.0.6 de §421): la fila «Meta AI y
  Muse» y el aviso de la tarjeta de bots se leen en `admin.js` del robots.txt.
  `score.js` sigue con los cuatro motores; no se edita la copia del plugin.
- **Lo que cuenta en todas las páginas borra todas las notas**: guardar bots o
  llms.txt, cambiar `blog_public` o actualizar el plugin llama a
  `genscore_forget_all_scores`, y la pantalla relee la web entera.
- **Agentes prestado (`via`) no cuenta dos veces**: la web suma Agentes sólo
  con las páginas que venden; una página que toma la tienda de otra sólo cuenta
  si ninguna vende. La portada nunca guarda los arreglos `prod`, `price` ni
  `avail`.

## Arreglos con un clic (adenda 1.0.7 de §421)

- **Nada se publica sin el paso «¿Publicar en N páginas?»**, que avisa de que va
  a producción. La hoja de páginas sólo selecciona y edita.
- **Las propuestas salen de los datos de WordPress, nunca de un LLM** (extracto,
  contenido, título, precio y stock de WooCommerce). Sin texto, no hay propuesta.
- **Nunca se edita el contenido del post.** Lo publicado vive en `_genscore_*`
  (u opciones para la portada de entradas) o en los campos de Yoast, Rank Math o
  SEOPress, y sale por filtros. Con AIOSEO no se ofrecen descripción, título ni
  canónica.
- **Todo cambio guarda su lote para deshacer** (`genscore_fix_batches`) con el
  valor anterior. Desinstalar borra lo nuestro, no los campos del plugin SEO.
- **El JSON-LD que se guarda pasa por `genscore_clean_jsonld`** (objeto
  schema.org con `@type`) y se imprime con `JSON_HEX_TAG`. Una canónica sólo vale
  en el mismo host.
- **Cada cambio real de la web avisa con un mensaje flotante** que se va solo.
- **Repintar la pantalla conserva el scroll y el foco**, y la revisión tras un
  guardado es silenciosa: nada vuelve a pintar «Revisando» sobre una nota que ya
  existe.
- **La lista de la tienda se genera al servir la página**, nunca se guarda: sólo la marca `live` (adenda 1.0.7). Devoluciones en la tienda exige esa lista.
- **«Respuesta al principio» nunca se inventa**: sale del extracto o de la descripción (20 palabras o más, sin repetir el arranque del contenido) o la escribe la persona. En fichas va tras el título, no en la pestaña de descripción.
- **Precio y stock de un producto se leen de WooCommerce al servir la página**, nunca de lo guardado al publicar (`genscore_live_offer`).
- **Con Yoast, Rank Math o AIOSEO no se imprime JSON-LD de página propio** (`genscore_seo_prints_schema`): serían dos grafos.
- **En temas clásicos, lo que el plugin pinta en la Tienda va fuera de
  `<header>`** (`woocommerce_before_shop_loop`), porque la revisión ignora todo
  párrafo dentro de un `header` (adenda 1.1.3 de §432).
- **Una nota leída antes de un borrado general no se guarda**: lleva la
  generación `genscore_scores_gen` con la que se leyó, y el servidor la
  rechaza si ya no es la actual (adenda 1.1.3 de §432).

## Optimización técnica frente a Puntuación GEO (adenda de §432, plugin 1.2.0)

- **La revisión de la web es «Optimización técnica»: barra con estado, nunca un
  medidor.** El único medidor de la pantalla es la Puntuación GEO, y sin
  cuenta sale «sin medir». Lo mismo en la extensión (vista de página).
- **«Recomendaciones de GenScore» sólo enseña lo que trae `/api/ext/project`**
  (plan y `audits.blocks`), sin recalcular.

## Recomendaciones accionables (WP-PLUGIN-3, adenda 1.3.0 de §432)

- **«Crear borrador» nunca publica**: `post_status` draft y sólo la posición
  del plan como entrada; el texto sale de lo que ya mandó GenScore. Lo vigila
  `tests/wordpress-plugin.test.ts`.
- **La acción de una recomendación sale de `check`** (`CHECK_KIND`): arreglo
  de un clic si WordPress lo sabe hacer, interruptor para bots y llms.txt, y si
  no, «Cómo hacerlo» en la consola. Nunca un «Arreglar» que no arregla.
- **Lo que ofrece una auditoría del dominio no se repite** en «Recomendaciones
  técnicas» de la misma pestaña.

## Soluciones directas (WP-PLUGIN-4, adenda 1.4.0 de §432)

- **Un dato de un rival nunca lo escribe el plugin**: su celda es
  «[Pendiente: dato, enlace y fecha]» y la caja del editor cuenta los huecos.
  La columna propia sale de WooCommerce o queda «[Pendiente: tu dato]».
- **«Añadir preguntas» sólo publica respuestas a las preguntas del plan
  guardado en el servidor** (`genscore_ajax_faq_publish`); el navegador manda
  respuestas, nunca preguntas.
- **Open Graph cede ante un plugin SEO y hreflang ante uno multilingüe.** La
  valoración sólo sale de reseñas reales; el GTIN sólo con dígito de control
  correcto.
- **«Arreglado aquí» de un tipo que la revisión local no lee** exige un lote
  que se pueda deshacer y cubra todas las páginas de la auditoría.

## Web entera y datos (adenda 1.4.1 de §432)

- **Los arreglos de toda la web son una lista fija** (sitemap, viewport,
  quién está detrás) en `genscore_ajax_site_publish`, con lote y `site_prev`
  para deshacer. **El sitemap nunca escribe robots.txt**: WordPress ya lo
  anuncia (lo vigila `tests/wordpress-plugin.test.ts`).
- **Con un plugin SEO que publica sitemap o schema, esos arreglos no se
  ofrecen**: el aviso manda a sus ajustes. Lo mismo la viewport si el tema ya
  la pone.
- **El texto alternativo nunca es un nombre de fichero** (`genscore_is_file_name`)
  y sólo se escribe en la biblioteca si la imagen no tenía; deshacer lo devuelve.
- **noindex y fragmentos sólo se ofrecen con un plugin SEO que los guarda**, y
  nunca con la web cerrada en Ajustes > Lectura (eso es «Ir a Ajustes de lectura»).
- **«Añadir dato» publica sólo en la página del plan guardado en el servidor**
  y exige dato, fuente http(s) y fecha no futura (`genscore_clean_cite`).
- **La lista de páginas de cancelación no ofrece el blog ni las páginas de
  WooCommerce** (carrito, pago, cuenta, tienda).

## Tras la prueba de la 1.4.0 (adenda 1.4.2 de §432)

- **Nunca se renderizan bloques para sacar texto** (`excerpt_remove_blocks`,
  `do_blocks`, `render_block`): dentro de `wp_head` cambia los estilos del
  tema. El texto sale de `genscore_plain_text`, que lee el HTML guardado con
  `parse_blocks` (lo vigila `tests/wordpress-plugin.test.ts`).
- **La valoración sólo se ofrece si algún producto tiene reseñas reales**; si
  no, la recomendación dice «Sin reseñas».
- **Los borradores hablan con el nombre de la web**, no con la marca de la
  cuenta, y cada celda «[Pendiente…]» va en gris con `mark.has-inline-color`.
- **El texto alternativo nunca toca las imágenes propias de un producto**
  (WooCommerce ya les pone el nombre) y un título igual al nombre del fichero
  cuenta como fichero (`genscore_title_is_file`).
- **Cancelación sólo en productos; la tabla de características no se ofrece
  si WooCommerce ya la enseña**, y «quién está detrás» no rellena el email con
  el remitente de la tienda.
