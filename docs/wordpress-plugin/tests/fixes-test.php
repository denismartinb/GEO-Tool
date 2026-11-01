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

echo $failures ? "\n$failures failed\n" : "\nall passed\n";
exit( $failures ? 1 : 0 );
