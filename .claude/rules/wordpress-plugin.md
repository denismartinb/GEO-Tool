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
- **«Permitir» sólo escribe si cambia algo** (adenda 1.0.1 de §421): el bot
  estaba en un grupo de otro plugin o `*` cierra la web. Apagar y volver a
  encender un bot devuelve el robots.txt original, byte a byte (test).
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
