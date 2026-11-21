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
function sanitize_text_field( $t ) { return trim( preg_replace( '/\s+/', ' ', strip_tags( (string) $t ) ) ); }
function sanitize_email( $e ) { return filter_var( $e, FILTER_VALIDATE_EMAIL ) ? $e : ''; }
function esc_url_raw( $u, $p = null ) { return preg_match( '#^https?://#i', $u ) ? $u : ''; }
function wp_parse_url( $u, $c = -1 ) { return parse_url( $u, $c ); }
function get_post_type( $id ) { return 7 === (int) $id ? 'page' : 'post'; }
function get_post_status( $id ) { return 'publish'; }
require __DIR__ . '/../genscore/includes/fixes-site.php';

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

// 1.4.1: a fact needs words, a source and a date that is not in the future.
check( 'cite accepts a fact with source and month', null !== genscore_clean_cite( array( 'text' => 'El 92% de clientes repite compra', 'url' => 'https://acme.com/estudio', 'date' => '2026-10' ) ) );
check( 'cite rejects a short fact', null === genscore_clean_cite( array( 'text' => 'Muy bueno', 'url' => 'https://acme.com/e', 'date' => '2026-10' ) ) );
check( 'cite rejects a missing source', null === genscore_clean_cite( array( 'text' => 'El 92% de clientes repite compra', 'url' => 'acme', 'date' => '2026-10' ) ) );
check( 'cite rejects a future date', null === genscore_clean_cite( array( 'text' => 'El 92% de clientes repite compra', 'url' => 'https://acme.com/e', 'date' => '2999-01-01' ) ) );
check( 'cite rejects a bad date', null === genscore_clean_cite( array( 'text' => 'El 92% de clientes repite compra', 'url' => 'https://acme.com/e', 'date' => '2026-13' ) ) );

// Identity: a name and a contact; a local business needs its address; hours in schema.org form.
$org = genscore_clean_identity( array( 'name' => 'Café Ventura', 'email' => 'hola@acme.com', 'country' => 'es' ) );
check( 'identity keeps an organization', is_array( $org ) && 'Organization' === $org['type'] && 'ES' === $org['country'] );
check( 'identity needs a contact', null === genscore_clean_identity( array( 'name' => 'Café Ventura' ) ) );
check( 'local business needs an address', null === genscore_clean_identity( array( 'type' => 'LocalBusiness', 'name' => 'Café', 'telephone' => '910000000' ) ) );
$loc = genscore_clean_identity( array( 'type' => 'LocalBusiness', 'name' => 'Café', 'street' => 'Calle Mayor 1', 'city' => 'Madrid', 'country' => 'ES', 'hours' => "Mo-Fr 09:00-18:00\nSa 10:00-14:00", 'sameAs' => "https://x.com/acme notaurl" ) );
check( 'local business keeps hours and links', is_array( $loc ) && 2 === count( explode( "\n", $loc['hours'] ) ) && 'https://x.com/acme' === $loc['sameAs'] );
check( 'identity rejects free-form hours', null === genscore_clean_identity( array( 'type' => 'LocalBusiness', 'name' => 'Café', 'street' => 'C/ 1', 'city' => 'Madrid', 'country' => 'ES', 'hours' => 'de 9 a 6' ) ) );

// Cancellation: a published page, 1 to 365 days, a country in two letters.
check( 'cancel keeps clean values', array( 'page' => 7, 'days' => 14, 'country' => 'ES' ) === genscore_clean_cancel( array( 'page' => '7', 'days' => '14', 'country' => 'es' ) ) );
check( 'cancel needs a page', null === genscore_clean_cancel( array( 'page' => 8, 'days' => 14, 'country' => 'ES' ) ) );
check( 'cancel rejects days out of range', null === genscore_clean_cancel( array( 'page' => 7, 'days' => 400, 'country' => 'ES' ) ) );

// Alt text: a file name is never proposed as the description of an image.
check( 'a camera file name is a file name', genscore_is_file_name( 'IMG_20240101_1234' ) && genscore_is_file_name( 'cafe-ventura-1.jpg' ) );
check( 'a real title is not a file name', ! genscore_is_file_name( 'Café de Etiopía en grano' ) );

// Plain text: blocks are separated, and a heading ends its sentence.
if ( ! function_exists( 'wp_strip_all_tags' ) ) {
	function wp_strip_all_tags( $t, $b = false ) { $t = strip_tags( (string) $t ); return $b ? preg_replace( '/[\r\n\t ]+/', ' ', $t ) : $t; }
}
if ( ! function_exists( 'strip_shortcodes' ) ) {
	function strip_shortcodes( $t ) { return $t; }
}
check( 'a heading ends its sentence', 'Café tostado cada semana. En Café Ventura seleccionamos.' === genscore_plain_text( '<h1>Café tostado cada semana</h1><p>En Café Ventura seleccionamos.</p>' ) );
check( 'a heading with its own stop keeps it', '¿Qué café? Este.' === genscore_plain_text( '<h2>¿Qué café?</h2><p>Este.</p>' ) );
check( 'paragraphs keep a space', 'Uno Dos' === genscore_plain_text( '<p>Uno</p><p>Dos</p>' ) );

if ( ! function_exists( 'remove_accents' ) ) {
	function remove_accents( $t ) { return iconv( 'UTF-8', 'ASCII//TRANSLIT', $t ); }
}
check( 'a title made from the file name is the file name', genscore_title_is_file( 'bolsa-cafe-etiopia-250g', '/u/bolsa-cafe-etiopia-250g-scaled.jpg' ) && genscore_title_is_file( 'Bolsa cafe etiopia 250g', '/u/bolsa-cafe-etiopia-250g-1024x768.jpg' ) );
check( 'a duplicate upload («-1») still counts as the file name', genscore_title_is_file( 'bolsa-cafe-etiopia-250g', '/u/bolsa-cafe-etiopia-250g-1.jpg' ) && genscore_title_is_file( 'cafe-2024', '/u/cafe-2024.jpg' ) && genscore_title_is_file( 'cafe-2024', '/u/cafe-2024-2-scaled.jpg' ) );
check( 'a written title is not the file name', ! genscore_title_is_file( 'Café de Etiopía en grano', '/u/bolsa-cafe-etiopia-250g.jpg' ) );

echo $failures ? "\n$failures failed\n" : "\nall passed\n";
exit( $failures ? 1 : 0 );
