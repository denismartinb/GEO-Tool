<?php
/**
 * Plain PHP tests for the one-click fixes helpers. Run:
 * php docs/wordpress-plugin/tests/fixes-test.php
 * (also run by tests/wordpress-plugin.test.ts when php is installed).
 */

define( 'ABSPATH', __DIR__ . '/' );

// Minimal WordPress stand-ins: only what the helpers under test call.
function add_action() {}
function add_filter() {}
function wp_json_encode( $data, $flags = 0 ) {
	return json_encode( $data, $flags );
}

require __DIR__ . '/../genscore/includes/fixes.php';
require __DIR__ . '/../genscore/includes/fixes-admin.php';
function sanitize_key( $k ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $k ) ); }
function absint( $v ) { return abs( (int) $v ); }
function esc_html( $t ) { return htmlspecialchars( (string) $t, ENT_QUOTES, 'UTF-8' ); }
function wp_list_pluck( $list, $field ) { return array_map( function ( $x ) use ( $field ) { return $x[ $field ]; }, $list ); }
require __DIR__ . '/../genscore/includes/fixes-more.php';

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

// JSON-LD: only a schema.org object with a type is accepted.
check( 'jsonld accepts a schema.org object', null !== genscore_clean_jsonld( '{"@context":"https://schema.org","@type":"WebPage","name":"Café"}' ) );
check( 'jsonld keeps unicode', false !== strpos( genscore_clean_jsonld( '{"@context":"https://schema.org","@type":"WebPage","name":"Café"}' ), 'Café' ) );
check( 'jsonld rejects broken JSON', null === genscore_clean_jsonld( '{"@context":' ) );
check( 'jsonld rejects a list', null === genscore_clean_jsonld( '[{"@context":"https://schema.org","@type":"WebPage"}]' ) );
check( 'jsonld rejects a missing type', null === genscore_clean_jsonld( '{"@context":"https://schema.org"}' ) );
check( 'jsonld rejects another context', null === genscore_clean_jsonld( '{"@context":"https://evil.example","@type":"WebPage"}' ) );
check( 'jsonld rejects huge payloads', null === genscore_clean_jsonld( '{"@context":"https://schema.org","@type":"WebPage","x":"' . str_repeat( 'a', 21000 ) . '"}' ) );

// Cutting text for descriptions and titles.
check( 'short text is kept', 'Hola mundo.' === genscore_cut_text( 'Hola mundo.', 155 ) );
$long = 'Tostamos café de especialidad cada semana en Madrid. Enviamos a toda España en 24 horas y con envío gratis desde 30 euros en todos los pedidos de la tienda.';
$cut  = genscore_cut_text( $long, 80 );
check( 'cuts at a whole sentence', 'Tostamos café de especialidad cada semana en Madrid.' === $cut );
$words = genscore_cut_text( str_repeat( 'palabra ', 40 ), 60 );
check( 'cuts at a word with an ellipsis', mb_strlen( $words ) <= 60 && '…' === mb_substr( $words, -1 ) && false === strpos( $words, 'palabr…' ) );

// WP-PLUGIN-4 (1.4.0): barcodes need a valid check digit; nothing else is published.
check( 'gtin accepts a valid EAN-13', '8412345678905' === genscore_clean_gtin( '84 1234 5678905' ) );
check( 'gtin rejects a wrong check digit', null === genscore_clean_gtin( '8412345678904' ) );
check( 'gtin rejects letters and odd lengths', null === genscore_clean_gtin( 'ABC123' ) && null === genscore_clean_gtin( '12345678901' ) );

// Shipping: a country in two letters, a cost, and days from 0 to 60 in order.
$ship = genscore_clean_shipping( array( 'country' => 'es', 'cost' => '4,90', 'free' => '40', 'hmin' => 0, 'hmax' => 1, 'tmin' => 1, 'tmax' => 3 ) );
check( 'shipping keeps clean values', is_array( $ship ) && 'ES' === $ship['country'] && '4.9' === $ship['cost'] && 3 === $ship['tmax'] );
check( 'shipping needs a cost', null === genscore_clean_shipping( array( 'country' => 'ES', 'cost' => '', 'free' => '', 'hmin' => 0, 'hmax' => 1, 'tmin' => 1, 'tmax' => 3 ) ) );
check( 'shipping rejects days out of order', null === genscore_clean_shipping( array( 'country' => 'ES', 'cost' => '0', 'free' => '', 'hmin' => 2, 'hmax' => 1, 'tmin' => 1, 'tmax' => 3 ) ) );
check( 'shipping rejects a bad country', null === genscore_clean_shipping( array( 'country' => 'ESP', 'cost' => '1', 'free' => '', 'hmin' => 0, 'hmax' => 1, 'tmin' => 1, 'tmax' => 3 ) ) );

// Headings: a bold line becomes an h2 with the same text, never new words in a paragraph.
$h = genscore_apply_h2( '<p><strong>Horario</strong></p><p>Abrimos de 9 a 14.</p>', 'Horario' );
check( 'a bold line becomes the h2', false !== strpos( $h, '<h2 class="wp-block-heading genscore-h2">Horario</h2>' ) && false === strpos( $h, '<strong>Horario' ) );
$h = genscore_apply_h2( '<p>Uno.</p><p>Dos.</p><p>Tres.</p>', "Primero\nSegundo" );
check( 'other headings go before paragraphs', 2 === substr_count( $h, 'genscore-h2' ) && false !== strpos( $h, 'Uno.' ) && false !== strpos( $h, 'Tres.' ) );

echo $failures ? "\n$failures failed\n" : "\nall passed\n";
exit( $failures ? 1 : 0 );
