<?php
/**
 * «Crear borrador» (WP-PLUGIN-3, log §432): a draft post for a recommendation
 * of the GenScore plan that asks to publish a page answering some questions.
 * The draft holds the questions as headings and nothing else: GenScore never
 * writes the answer, and the post stays a draft until the person publishes it.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/** Drafts created here: [ first question => post id ], so a second click opens the same one. */
define( 'GENSCORE_DRAFTS_OPTION', 'genscore_drafts' );
/** Headings in one draft, at most. */
define( 'GENSCORE_DRAFT_QUESTIONS', 8 );

/**
 * The plan item as GenScore sent it, only when it asks for a new page.
 *
 * @param int $index Position in the plan.
 * @return array|null { title, questions }
 */
function genscore_draft_item( $index ) {
	$data = genscore_account_data( false );
	if ( ! is_array( $data ) || 'connected' !== $data['state'] || empty( $data['project']['plan'] ) || ! is_array( $data['project']['plan'] ) ) {
		return null;
	}
	$plan = array_values( $data['project']['plan'] );
	if ( ! isset( $plan[ $index ] ) || ! is_array( $plan[ $index ] ) || empty( $plan[ $index ]['draft'] ) ) {
		return null;
	}
	$questions = array();
	foreach ( (array) ( $plan[ $index ]['questions'] ?? array() ) as $q ) {
		$q = sanitize_text_field( (string) $q );
		if ( '' !== $q && ! in_array( $q, $questions, true ) ) {
			$questions[] = $q;
		}
	}
	if ( ! $questions ) {
		return null;
	}
	return array(
		'title'     => sanitize_text_field( (string) ( $plan[ $index ]['title'] ?? '' ) ),
		'questions' => array_slice( $questions, 0, GENSCORE_DRAFT_QUESTIONS ),
	);
}

/**
 * The draft's title: the question when there is one, the topic of a page
 * lever («Publica una página sobre «Cafeteras»» → «Cafeteras»), or the first
 * question. Never a title GenScore made up.
 *
 * @param array $item From genscore_draft_item().
 * @return string
 */
function genscore_draft_title( $item ) {
	if ( 1 < count( $item['questions'] ) && preg_match( '/«([^»]+)»/u', $item['title'], $m ) ) {
		return $m[1];
	}
	return $item['questions'][0];
}

/**
 * Block markup: one heading per question, each followed by an empty paragraph.
 *
 * @param string[] $questions The questions.
 * @return string
 */
function genscore_draft_content( $questions ) {
	$out = '';
	foreach ( $questions as $q ) {
		$out .= '<!-- wp:heading --><h2 class="wp-block-heading">' . esc_html( $q ) . '</h2><!-- /wp:heading -->' . "\n\n";
		$out .= '<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->' . "\n\n";
	}
	return $out;
}

/**
 * A draft this plugin already made for that question, if it still exists.
 *
 * @param string $key First question.
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
 * What the screen needs: for each plan question that already has a draft, its editor link.
 *
 * @return array [ first question => edit url ]
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
	$key = $item['questions'][0];
	$id     = genscore_existing_draft( $key );
	$reused = (bool) $id;
	if ( ! $id ) {
		$id = wp_insert_post(
			array(
				'post_type'    => 'post',
				'post_status'  => 'draft',
				'post_title'   => genscore_draft_title( $item ),
				'post_content' => genscore_draft_content( $item['questions'] ),
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
