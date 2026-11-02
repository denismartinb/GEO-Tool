<?php
/**
 * What the plugin does with the GenScore plan (WP-PLUGIN-3 and 4, log §432):
 *
 *  - «Crear borrador» for an item that asks for a new page: a page for some
 *    questions, a comparison with a rival (or with every tracked rival), or an
 *    answer to the criticisms the AI repeats. The draft holds the structure
 *    and only data WordPress or WooCommerce already has; every answer and
 *    every fact about a rival is left for the person, as an empty paragraph
 *    with a hint or a cell marked «[Pendiente…]». It is never published.
 *  - «Añadir preguntas a la página» for an item whose questions belong on a
 *    page that already exists: the person writes the answers and they are
 *    served at the end of that page (includes/fixes-more.php), never written
 *    into its content.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/** Drafts created here: [ key => post id ], so a second click opens the same one. */
define( 'GENSCORE_DRAFTS_OPTION', 'genscore_drafts' );
/** Headings in one draft, at most. */
define( 'GENSCORE_DRAFT_QUESTIONS', 8 );
/** Rivals in a comparison with the tracked rivals, at most. */
define( 'GENSCORE_DRAFT_RIVALS', 3 );
/** What a cell left for the person says. The editor box counts them. */
define( 'GENSCORE_PENDING', '[Pendiente' );

/**
 * The plan as GenScore sent it.
 *
 * @return array{plan: array[], project: array}|null
 */
function genscore_plan_data() {
	$data = genscore_account_data( false );
	if ( ! is_array( $data ) || 'connected' !== $data['state'] || empty( $data['project']['plan'] ) || ! is_array( $data['project']['plan'] ) ) {
		return null;
	}
	return array( 'plan' => array_values( $data['project']['plan'] ), 'project' => $data['project'] );
}

/**
 * Distinct clean strings of a list.
 *
 * @param mixed $list List.
 * @param int   $max  At most.
 * @return string[]
 */
function genscore_clean_list( $list, $max ) {
	$out = array();
	foreach ( (array) $list as $q ) {
		$q = sanitize_text_field( (string) $q );
		if ( '' !== $q && ! in_array( $q, $out, true ) ) {
			$out[] = $q;
		}
	}
	return array_slice( $out, 0, $max );
}

/**
 * The draft kind of a plan item: questions, compare, rivals or critics.
 *
 * @param array $item Plan item.
 * @return string|null
 */
function genscore_draft_kind( $item ) {
	$type = (string) ( $item['type'] ?? '' );
	if ( 'close_competitor_gap' === $type ) {
		return 'compare';
	}
	if ( 'add_comparison_content' === $type ) {
		return 'rivals';
	}
	if ( 'address_negative_narrative' === $type ) {
		return 'critics';
	}
	return 'questions';
}

/**
 * The plan item, only when it asks for a new page.
 *
 * @param int $index Position in the plan.
 * @return array|null { kind, key, title, questions, rival, rivals, drivers, brand }
 */
function genscore_draft_item( $index ) {
	$d = genscore_plan_data();
	if ( ! $d || ! isset( $d['plan'][ $index ] ) || ! is_array( $d['plan'][ $index ] ) || empty( $d['plan'][ $index ]['draft'] ) ) {
		return null;
	}
	$item = $d['plan'][ $index ];
	$kind = genscore_draft_kind( $item );
	$out  = array(
		'kind'      => $kind,
		'type'      => sanitize_key( (string) ( $item['type'] ?? '' ) ),
		'title'     => sanitize_text_field( (string) ( $item['title'] ?? '' ) ),
		'questions' => genscore_clean_list( $item['questions'] ?? array(), GENSCORE_DRAFT_QUESTIONS ),
		'rival'     => sanitize_text_field( (string) ( $item['rival'] ?? '' ) ),
		'drivers'   => genscore_clean_list( $item['drivers'] ?? array(), 6 ),
		'brand'     => genscore_site_name(),
		'rivals'    => array(),
	);
	if ( '' === $out['brand'] ) {
		$out['brand'] = sanitize_text_field( (string) ( $d['project']['brand'] ?? '' ) );
	}
	foreach ( (array) ( $d['project']['rivals'] ?? array() ) as $r ) {
		if ( is_array( $r ) && empty( $r['isBrand'] ) && ! empty( $r['name'] ) ) {
			$out['rivals'][] = sanitize_text_field( (string) $r['name'] );
		}
	}
	$out['rivals'] = array_slice( array_values( array_unique( $out['rivals'] ) ), 0, GENSCORE_DRAFT_RIVALS );
	if ( ( 'questions' === $kind && ! $out['questions'] ) || ( 'compare' === $kind && '' === $out['rival'] ) || ( 'rivals' === $kind && ! $out['rivals'] ) || ( 'critics' === $kind && ! $out['drivers'] ) ) {
		return null;
	}
	$out['key'] = genscore_draft_key( $out );
	return $out;
}

/**
 * The key a draft is remembered by. The screen builds the same one
 * (draftKey in admin.js).
 *
 * @param array $item From genscore_draft_item().
 * @return string
 */
function genscore_draft_key( $item ) {
	switch ( $item['kind'] ) {
		case 'compare':
			return 'compare:' . $item['rival'];
		case 'rivals':
			return 'rivals:' . $item['title'];
		case 'critics':
			return 'critics:' . $item['title'];
	}
	return $item['questions'][0];
}

/**
 * The draft's title: the question or the topic for a page of questions;
 * «Marca frente a Rival» for a comparison. Never a claim GenScore made up.
 *
 * @param array $item From genscore_draft_item().
 * @return string
 */
function genscore_draft_title( $item ) {
	switch ( $item['kind'] ) {
		case 'compare':
			/* translators: 1: brand, 2: rival. */
			return sprintf( __( '%1$s frente a %2$s', 'genscore' ), $item['brand'], $item['rival'] );
		case 'rivals':
			/* translators: 1: brand, 2: rivals. */
			return sprintf( __( '%1$s frente a %2$s', 'genscore' ), $item['brand'], genscore_join_names( $item['rivals'] ) );
		case 'critics':
			/* translators: %s: brand. */
			return sprintf( __( 'Lo que debes saber de %s', 'genscore' ), $item['brand'] );
	}
	if ( 1 < count( $item['questions'] ) && preg_match( '/«([^»]+)»/u', $item['title'], $m ) ) {
		return $m[1];
	}
	return $item['questions'][0];
}

/**
 * «A, B y C».
 *
 * @param string[] $names Names.
 * @return string
 */
function genscore_join_names( $names ) {
	if ( count( $names ) < 2 ) {
		return implode( '', $names );
	}
	$last = array_pop( $names );
	/* translators: 1: names, 2: last name. */
	return sprintf( __( '%1$s y %2$s', 'genscore' ), implode( ', ', $names ), $last );
}

/**
 * An empty paragraph with a hint the editor shows in grey. It prints nothing
 * until the person writes in it.
 *
 * @param string $hint Hint.
 * @return string
 */
function genscore_block_hole( $hint ) {
	return '<!-- wp:paragraph ' . wp_json_encode( array( 'placeholder' => $hint ), JSON_UNESCAPED_UNICODE ) . ' --><p></p><!-- /wp:paragraph -->' . "\n\n";
}

/**
 * A heading block.
 *
 * @param string $text  Text.
 * @param int    $level Level.
 * @return string
 */
function genscore_block_heading( $text, $level = 2 ) {
	$attr = 2 === $level ? '' : ' ' . wp_json_encode( array( 'level' => $level ) );
	return '<!-- wp:heading' . $attr . ' --><h' . $level . ' class="wp-block-heading">' . esc_html( $text ) . '</h' . $level . '><!-- /wp:heading -->' . "\n\n";
}

/**
 * The site's own name, as WordPress shows it.
 *
 * @return string
 */
function genscore_site_name() {
	return trim( wp_strip_all_tags( html_entity_decode( get_bloginfo( 'name' ), ENT_QUOTES, 'UTF-8' ) ) );
}

/**
 * One table cell; a «[Pendiente…]» gap is shown in grey.
 *
 * @param string $text Cell text.
 * @return string
 */
function genscore_cell_html( $text ) {
	$h = esc_html( $text );
	if ( 0 !== strpos( (string) $text, GENSCORE_PENDING ) ) {
		return $h;
	}
	// The editor's own inline text colour, so the block stays valid and the
	// gap reads as a gap in the editor and on the page.
	return '<mark style="background-color:rgba(0, 0, 0, 0);color:#7a8494" class="has-inline-color">' . $h . '</mark>';
}

/**
 * A table block.
 *
 * @param string[] $head Header cells.
 * @param array[]  $rows Rows of cells.
 * @return string
 */
function genscore_block_table( $head, $rows ) {
	$h = '<thead><tr>' . implode( '', array_map( function ( $c ) {
		return '<th>' . esc_html( $c ) . '</th>';
	}, $head ) ) . '</tr></thead><tbody>';
	foreach ( $rows as $r ) {
		$h .= '<tr>' . implode( '', array_map( function ( $c ) {
			return '<td>' . genscore_cell_html( $c ) . '</td>';
		}, $r ) ) . '</tr>';
	}
	return '<!-- wp:table --><figure class="wp-block-table"><table>' . $h . '</tbody></table></figure><!-- /wp:table -->' . "\n\n";
}

/**
 * What the shop itself can say in a comparison, from WooCommerce. A row with
 * nothing to say keeps a «[Pendiente…]» cell for the person.
 *
 * @return array[] [ label, own value ]
 */
function genscore_own_compare_rows() {
	$pending = GENSCORE_PENDING . ': tu dato]';
	$rows    = array();
	if ( function_exists( 'wc_get_products' ) ) {
		$prices = array();
		$count  = 0;
		$sum    = 0.0;
		foreach ( wc_get_products( array( 'status' => 'publish', 'limit' => 200, 'visibility' => 'catalog' ) ) as $p ) {
			if ( '' !== (string) $p->get_price() ) {
				$prices[] = (float) $p->get_price();
			}
			if ( (int) $p->get_review_count() > 0 ) {
				$count += (int) $p->get_review_count();
				$sum   += (float) $p->get_average_rating() * (int) $p->get_review_count();
			}
		}
		$price  = $prices ? html_entity_decode( wp_strip_all_tags( wc_price( min( $prices ) ) ), ENT_QUOTES, 'UTF-8' ) : $pending;
		$ship   = genscore_shipping_settings();
		$money  = static function ( $v ) {
			return html_entity_decode( wp_strip_all_tags( wc_price( (float) $v ) ), ENT_QUOTES, 'UTF-8' );
		};
		$ship_t = '' !== (string) $ship['cost'] ? ( 0.0 === (float) $ship['cost'] ? __( 'Gratis', 'genscore' ) : $money( $ship['cost'] ) ) . ( '' !== (string) $ship['free'] && (float) $ship['free'] > 0 ? ', ' . sprintf( /* translators: %s: amount. */ __( 'gratis desde %s', 'genscore' ), $money( $ship['free'] ) ) : '' ) : $pending;
		$ret    = get_option( GENSCORE_RETURNS_OPTION, array() );
		$ret_t  = is_array( $ret ) && ! empty( $ret['days'] ) ? sprintf( /* translators: %d: days. */ _n( '%d día', '%d días', (int) $ret['days'], 'genscore' ), (int) $ret['days'] ) : $pending;
		$rate_t = $count ? sprintf( /* translators: 1: rating, 2: reviews. */ __( '%1$s de 5 (%2$d reseñas)', 'genscore' ), str_replace( '.', ',', (string) round( $sum / $count, 1 ) ), $count ) : $pending;
		$rows[] = array( __( 'Precio desde', 'genscore' ), $price );
		$rows[] = array( __( 'Envío', 'genscore' ), $ship_t );
		$rows[] = array( __( 'Devoluciones', 'genscore' ), $ret_t );
		$rows[] = array( __( 'Valoración', 'genscore' ), $rate_t );
		return $rows;
	}
	foreach ( array( __( 'Qué ofrece', 'genscore' ), __( 'Precio', 'genscore' ), __( 'Para quién es', 'genscore' ) ) as $l ) {
		$rows[] = array( $l, $pending );
	}
	return $rows;
}

/**
 * Block markup of the draft.
 *
 * @param array $item From genscore_draft_item().
 * @return string
 */
function genscore_draft_content( $item ) {
	$out = '';
	if ( in_array( $item['kind'], array( 'compare', 'rivals' ), true ) ) {
		$rivals = 'compare' === $item['kind'] ? array( $item['rival'] ) : $item['rivals'];
		$out   .= genscore_block_hole( __( 'Resumen en dos frases: para quién es mejor cada opción.', 'genscore' ) );
		$out   .= genscore_block_heading( __( 'Comparativa rápida', 'genscore' ) );
		$rows   = array();
		foreach ( genscore_own_compare_rows() as $r ) {
			$rows[] = array_merge( $r, array_fill( 0, count( $rivals ), GENSCORE_PENDING . ': dato, enlace y fecha]' ) );
		}
		$out .= genscore_block_table( array_merge( array( __( 'Dato', 'genscore' ), $item['brand'] ), $rivals ), $rows );
		foreach ( $item['questions'] as $q ) {
			$out .= genscore_block_heading( $q ) . genscore_block_hole( __( 'Tu respuesta.', 'genscore' ) );
		}
		$out .= genscore_block_heading( __( 'Fuentes', 'genscore' ) );
		$out .= genscore_block_hole( __( 'Enlace y fecha de cada dato de otra marca. Sin fuente, no lo publiques.', 'genscore' ) );
		return $out;
	}
	if ( 'critics' === $item['kind'] ) {
		$out .= genscore_block_hole( __( 'Una frase que diga qué haces y para quién, con tus palabras.', 'genscore' ) );
		foreach ( $item['drivers'] as $d ) {
			$out .= genscore_block_heading( mb_strtoupper( mb_substr( $d, 0, 1 ) ) . mb_substr( $d, 1 ) );
			$out .= genscore_block_hole( __( 'Cómo es de verdad, con un dato que se pueda comprobar.', 'genscore' ) );
		}
		return $out;
	}
	$out .= genscore_block_hole( __( 'La respuesta corta, en dos o tres frases, antes de todo lo demás.', 'genscore' ) );
	if ( in_array( $item['type'], array( 'add_citation_block', 'improve_citation_readiness' ), true ) ) {
		$out .= genscore_block_hole( __( 'Un dato que se pueda comprobar, con el enlace a su fuente y su fecha.', 'genscore' ) );
	}
	foreach ( $item['questions'] as $q ) {
		$out .= genscore_block_heading( $q ) . genscore_block_hole( __( 'Tu respuesta.', 'genscore' ) );
	}
	return $out;
}

/**
 * A draft this plugin already made for that key, if it still exists.
 *
 * @param string $key Key.
 * @return int Post id or 0.
 */
function genscore_existing_draft( $key ) {
	$all = get_option( GENSCORE_DRAFTS_OPTION, array() );
	$id  = is_array( $all ) && isset( $all[ $key ] ) ? (int) $all[ $key ] : 0;
	if ( ! $id ) {
		return 0;
	}
	$status = get_post_status( $id );
	return $status && 'trash' !== $status ? $id : 0;
}

/**
 * What the screen needs: for each draft that still exists, its editor link.
 *
 * @return array [ key => edit url ]
 */
function genscore_drafts_screen_data() {
	$all = get_option( GENSCORE_DRAFTS_OPTION, array() );
	$out = array();
	if ( is_array( $all ) ) {
		foreach ( $all as $key => $id ) {
			if ( genscore_existing_draft( $key ) ) {
				$out[ $key ] = get_edit_post_link( (int) $id, 'raw' );
			}
		}
	}
	return $out;
}

/** AJAX: «Crear borrador». Takes only the plan position; the text comes from GenScore's answer. */
function genscore_ajax_create_draft() {
	check_ajax_referer( 'genscore', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( null, 403 );
	}
	$index = isset( $_POST['plan'] ) ? absint( wp_unslash( $_POST['plan'] ) ) : -1;
	$item  = 0 <= $index && 10 > $index ? genscore_draft_item( $index ) : null;
	if ( ! $item ) {
		wp_send_json_error( array( 'message' => __( 'Esta recomendación ya no pide una página nueva. Actualiza la pantalla.', 'genscore' ) ) );
	}
	$key    = $item['key'];
	$id     = genscore_existing_draft( $key );
	$reused = (bool) $id;
	if ( ! $id ) {
		$id = wp_insert_post(
			array(
				'post_type'    => 'questions' === $item['kind'] ? 'post' : 'page',
				'post_status'  => 'draft',
				'post_title'   => genscore_draft_title( $item ),
				'post_content' => genscore_draft_content( $item ),
				'post_author'  => get_current_user_id(),
			),
			true
		);
		if ( is_wp_error( $id ) || ! $id ) {
			wp_send_json_error( array( 'message' => __( 'WordPress no ha podido crear el borrador. Vuelve a intentarlo.', 'genscore' ) ) );
		}
		$all         = get_option( GENSCORE_DRAFTS_OPTION, array() );
		$all         = is_array( $all ) ? $all : array();
		$all[ $key ] = (int) $id;
		update_option( GENSCORE_DRAFTS_OPTION, array_slice( $all, -50, null, true ), false );
	}
	wp_send_json_success(
		array(
			'key'    => $key,
			'edit'   => get_edit_post_link( (int) $id, 'raw' ),
			'reused' => $reused,
		)
	);
}
add_action( 'wp_ajax_genscore_create_draft', 'genscore_ajax_create_draft' );

/**
 * A draft with cells still «[Pendiente…]» says so in the editor, so nothing
 * about a rival goes live without its source.
 *
 * @param string  $post_type Post type.
 * @param WP_Post $post      Post.
 */
function genscore_pending_meta_box( $post_type, $post ) {
	if ( ! $post instanceof WP_Post || false === strpos( (string) $post->post_content, GENSCORE_PENDING ) ) {
		return;
	}
	add_meta_box( 'genscore-pending', __( 'GenScore: huecos por rellenar', 'genscore' ), 'genscore_render_pending_meta_box', $post_type, 'side', 'high' );
}
add_action( 'add_meta_boxes', 'genscore_pending_meta_box', 10, 2 );

/**
 * The pending box.
 *
 * @param WP_Post $post Post.
 */
function genscore_render_pending_meta_box( $post ) {
	$n = substr_count( (string) $post->post_content, GENSCORE_PENDING );
	/* translators: %d: number of cells. */
	echo '<p style="margin:0;color:#b32d2e">' . esc_html( sprintf( _n( 'Queda %d hueco «[Pendiente…]» por rellenar.', 'Quedan %d huecos «[Pendiente…]» por rellenar.', $n, 'genscore' ), $n ) ) . '</p>';
	echo '<p style="margin-bottom:0">' . esc_html__( 'Cada dato de otra marca necesita su enlace y su fecha. Si no lo tienes, borra esa fila antes de publicar.', 'genscore' ) . '</p>';
}

/* ------------------------------------------------------------------ */
/* Plan items about a page that already exists                        */
/* ------------------------------------------------------------------ */

/**
 * The page of this site a plan item names, if WordPress knows it.
 *
 * @param array $item Plan item.
 * @return int Post id or 0.
 */
function genscore_plan_page_id( $item ) {
	$url = isset( $item['page'] ) && is_string( $item['page'] ) ? esc_url_raw( $item['page'], array( 'http', 'https' ) ) : '';
	if ( '' === $url ) {
		return 0;
	}
	$id = url_to_postid( $url );
	if ( ! $id ) {
		$path = (string) wp_parse_url( $url, PHP_URL_PATH );
		if ( '' === trim( $path, '/' ) ) {
			$id = (int) get_option( 'page_on_front' );
		}
	}
	return $id && 'publish' === get_post_status( $id ) && current_user_can( 'edit_post', $id ) ? (int) $id : 0;
}

/**
 * For each plan item with a page here: its id, title, path and editor link.
 *
 * @return array [ index => { id, title, path, edit } ]
 */
function genscore_plan_pages_screen_data() {
	$d   = genscore_plan_data();
	$out = array();
	foreach ( $d ? $d['plan'] : array() as $i => $item ) {
		$id = is_array( $item ) ? genscore_plan_page_id( $item ) : 0;
		if ( $id ) {
			$out[ $i ] = array(
				'id'    => $id,
				'title' => genscore_post_title( $id ),
				'path'  => rawurldecode( (string) wp_parse_url( get_permalink( $id ), PHP_URL_PATH ) ),
				'url'   => get_permalink( $id ),
				'edit'  => get_edit_post_link( $id, 'raw' ),
				'faq'   => genscore_faq_pairs( $id ),
				'cite'  => genscore_cite_data( $id ),
				'table' => 'close_competitor_gap' === ( $item['type'] ?? '' ) && ! empty( $item['rival'] ) ? genscore_compare_table_html( sanitize_text_field( (string) $item['rival'] ) ) : '',
			);
		}
	}
	return $out;
}

/**
 * AJAX: «Añadir preguntas a la página». The page and the questions come from
 * GenScore's answer; only the answers come from the screen. Undoable like
 * every fix.
 */
function genscore_ajax_faq_publish() {
	check_ajax_referer( 'genscore', 'nonce' );
	genscore_ajax_guard();
	$index = isset( $_POST['plan'] ) ? absint( wp_unslash( $_POST['plan'] ) ) : -1;
	$batch = isset( $_POST['batch'] ) ? sanitize_key( wp_unslash( $_POST['batch'] ) ) : '';
	$typed = isset( $_POST['answers'] ) ? json_decode( wp_unslash( $_POST['answers'] ), true ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- every answer goes through genscore_clean_faq().
	$d     = genscore_plan_data();
	$item  = $d && 0 <= $index && isset( $d['plan'][ $index ] ) && is_array( $d['plan'][ $index ] ) ? $d['plan'][ $index ] : null;
	$id    = $item ? genscore_plan_page_id( $item ) : 0;
	if ( ! $id || ! preg_match( '/^[a-z0-9]{12}$/', $batch ) || ! is_array( $typed ) ) {
		wp_send_json_error( array( 'message' => __( 'Esta recomendación ya no apunta a una página de tu web. Actualiza la pantalla.', 'genscore' ) ), 400 );
	}
	$pairs = array();
	foreach ( genscore_faq_pairs( $id ) as $p ) {
		$pairs[ $p['q'] ] = $p['a'];
	}
	foreach ( genscore_clean_list( $item['questions'] ?? array(), GENSCORE_FAQ_MAX ) as $i => $q ) {
		if ( isset( $typed[ $i ] ) && is_string( $typed[ $i ] ) && '' !== trim( $typed[ $i ] ) ) {
			$pairs[ $q ] = $typed[ $i ];
		}
	}
	$rows = array();
	foreach ( $pairs as $q => $a ) {
		$rows[] = array( 'q' => $q, 'a' => $a );
	}
	$value = genscore_clean_faq( wp_json_encode( $rows ) );
	if ( null === $value ) {
		wp_send_json_error( array( 'message' => __( 'Escribe al menos una respuesta de cinco palabras o más.', 'genscore' ) ), 400 );
	}
	$all = get_option( GENSCORE_BATCHES_OPTION, array() );
	$all = is_array( $all ) ? $all : array();
	$prev           = genscore_fix_write( 'faq', $id, $value );
	$all[ $batch ] = array( 'kind' => 'faq', 'at' => time(), 'ids' => array( $id ), 'prev' => array( $id => $prev ) );
	if ( count( $all ) > 20 ) {
		$all = array_slice( $all, -20, null, true );
	}
	update_option( GENSCORE_BATCHES_OPTION, $all, false );
	genscore_forget_page_score( $id );
	wp_send_json_success( array( 'done' => array( $id ), 'skipped' => array(), 'batches' => genscore_fix_batches_summary() ) );
}
add_action( 'wp_ajax_genscore_faq_publish', 'genscore_ajax_faq_publish' );

/**
 * The comparison table with the shop's own column filled, for «Mejora tu
 * comparativa»: the person pastes it in the comparison that already exists.
 * The rival's column is always «[Pendiente…]».
 *
 * @param string $rival Rival.
 * @return string HTML.
 */
function genscore_compare_table_html( $rival ) {
	$brand = genscore_site_name();
	$d     = '' === $brand ? genscore_plan_data() : null;
	if ( '' === $brand && $d && ! empty( $d['project']['brand'] ) ) {
		$brand = sanitize_text_field( (string) $d['project']['brand'] );
	}
	$h = '<table><thead><tr><th>' . esc_html__( 'Dato', 'genscore' ) . '</th><th>' . esc_html( $brand ) . '</th><th>' . esc_html( $rival ) . '</th></tr></thead><tbody>';
	foreach ( genscore_own_compare_rows() as $r ) {
		$h .= '<tr><td>' . esc_html( $r[0] ) . '</td><td>' . genscore_cell_html( $r[1] ) . '</td><td>' . genscore_cell_html( GENSCORE_PENDING . ': dato, enlace y fecha]' ) . '</td></tr>';
	}
	return $h . '</tbody></table>';
}

/**
 * AJAX: «Añadir dato con fuente» on the page a plan item names. The page
 * comes from GenScore's answer; the fact, its link and its date from the
 * person. Undoable like every fix.
 */
function genscore_ajax_cite_publish() {
	check_ajax_referer( 'genscore', 'nonce' );
	genscore_ajax_guard();
	$index = isset( $_POST['plan'] ) ? absint( wp_unslash( $_POST['plan'] ) ) : -1;
	$batch = isset( $_POST['batch'] ) ? sanitize_key( wp_unslash( $_POST['batch'] ) ) : '';
	$d     = genscore_plan_data();
	$item  = $d && 0 <= $index && isset( $d['plan'][ $index ] ) && is_array( $d['plan'][ $index ] ) ? $d['plan'][ $index ] : null;
	$id    = $item && in_array( $item['type'] ?? '', array( 'add_citation_block', 'improve_citation_readiness' ), true ) ? genscore_plan_page_id( $item ) : 0;
	if ( ! $id || ! preg_match( '/^[a-z0-9]{12}$/', $batch ) ) {
		wp_send_json_error( array( 'message' => __( 'Esta recomendación ya no apunta a una página de tu web. Actualiza la pantalla.', 'genscore' ) ), 400 );
	}
	$value = genscore_clean_cite( isset( $_POST['cite'] ) && is_array( $_POST['cite'] ) ? wp_unslash( $_POST['cite'] ) : array() ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- every value is checked in genscore_clean_cite().
	if ( null === $value ) {
		wp_send_json_error( array( 'message' => __( 'Escribe el dato (cuatro palabras o más), el enlace a su fuente y su fecha, que no puede ser futura.', 'genscore' ) ), 400 );
	}
	$all           = get_option( GENSCORE_BATCHES_OPTION, array() );
	$all           = is_array( $all ) ? $all : array();
	$prev          = genscore_fix_write( 'cite', $id, $value );
	$all[ $batch ] = array( 'kind' => 'cite', 'at' => time(), 'ids' => array( $id ), 'prev' => array( $id => $prev ) );
	if ( count( $all ) > 20 ) {
		$all = array_slice( $all, -20, null, true );
	}
	update_option( GENSCORE_BATCHES_OPTION, $all, false );
	genscore_forget_page_score( $id );
	wp_send_json_success( array( 'batches' => genscore_fix_batches_summary(), 'cite' => genscore_cite_data( $id ) ) );
}
add_action( 'wp_ajax_genscore_cite_publish', 'genscore_ajax_cite_publish' );
