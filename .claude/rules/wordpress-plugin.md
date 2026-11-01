# Plugin de WordPress — invariantes

Se inyectan solos al tocar `docs/wordpress-plugin/**`. Cada regla es trazable a
`docs/brand/design-decisions-log.md` §421.

- **La nota es la de la extensión.** `assets/vendor/collect.js` y `score.js`
  son copia exacta de `docs/chrome-extension/prueba/extension/`. Si cambia la
  extensión, se copian en el mismo PR (lo vigila `tests/wordpress-plugin.test.ts`).
- **El plugin no llama a genscore.es.** Sólo enlaces con UTM. Una llamada
  (token, datos de la cuenta) es la Fase 2 y necesita aprobación: toca auth y
  esquema, y WordPress.org exige declararla en el readme.
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
