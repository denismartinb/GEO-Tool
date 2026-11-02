<?php
/**
 * Plain PHP tests for plugin 1.5.0: HTML to Markdown and the «Lo que lee la
 * IA» numbers stored per page. Run:
 * php docs/wordpress-plugin/tests/markdown-test.php
 * (also run by tests/wordpress-plugin.test.ts when php is installed).
 */

define( 'ABSPATH', __DIR__ . '/' );
function add_action() {}
function add_filter() {}
function wp_strip_all_tags( $t ) { return trim( strip_tags( (string) $t ) ); }
function absint( $v ) { return abs( (int) $v ); }

require __DIR__ . '/../genscore/includes/pages.php';
require __DIR__ . '/../genscore/includes/markdown.php';

$failures = 0;
function check( $name, $cond ) {
	global $failures;
	if ( $cond ) {
		echo "ok   $name\n";
	} else {
		echo "FAIL $name\n";
		++$failures;
	}
}

$md = genscore_html_to_md( '<h2>Cómo prepararlo</h2><p>Muele <strong>fino</strong> y usa <a href="https://cafeventura.es/guia/">la guía</a>.</p><ul><li>Agua a 94 °C</li><li>Cuatro minutos</li></ul><script>alert(1)</script><table><tr><th>Formato</th><th>Precio</th></tr><tr><td>1 kg</td><td>24,90 €</td></tr></table>' );
check( 'headings go one level down (the title is #)', false !== strpos( $md, '### Cómo prepararlo' ) );
check( 'bold and links', false !== strpos( $md, '**fino**' ) && false !== strpos( $md, '[la guía](https://cafeventura.es/guia/)' ) );
check( 'lists', false !== strpos( $md, "- Agua a 94 °C\n- Cuatro minutos" ) );
check( 'scripts are left out', false === strpos( $md, 'alert' ) );
check( 'tables keep their rows', false !== strpos( $md, '| Formato | Precio |' ) && false !== strpos( $md, '| 1 kg | 24,90 € |' ) );
check( 'a link without http is plain text', false === strpos( genscore_html_to_md( '<p><a href="javascript:x()">mal</a></p>' ), '](' ) );
check( 'empty stays empty', '' === genscore_html_to_md( '' ) );

$v = genscore_sanitize_ai_view( array( 'pct' => 140, 'w' => 900, 'k' => array( 'price' => array( 3, 9 ), 'text' => array( 'x', 2 ), 'evil' => array( 1, 1 ) ) ) );
check( 'pct is clamped', 100 === $v['pct'] );
check( 'delivered never exceeds seen', array( 3, 3 ) === $v['k']['price'] );
check( 'unknown kinds are dropped', ! isset( $v['k']['evil'] ) && 4 === count( $v['k'] ) );
check( 'no pct, no data', null === genscore_sanitize_ai_view( array( 'w' => 3 ) ) );

exit( $failures ? 1 : 0 );
