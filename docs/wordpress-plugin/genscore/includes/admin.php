<?php
/**
 * The «GenScore» screen, its three save actions and the dashboard widget.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

const GENSCORE_APP = 'https://www.genscore.es';

/**
 * A genscore.es address with the plugin's UTM tags. Only links: the plugin
 * never calls genscore.es.
 *
 * @param string $path    Path on genscore.es.
 * @param string $content utm_content (where the link was).
 * @param array  $extra   Extra query arguments.
 * @return string
 */
function genscore_app_url( $path, $content, $extra = array() ) {
	return add_query_arg(
		array_merge(
			$extra,
			array(
				'utm_source'   => 'wordpress',
				'utm_medium'   => 'plugin',
				'utm_campaign' => 'wp-plugin',
				'utm_content'  => $content,
			)
		),
		GENSCORE_APP . $path
	);
}

/**
 * The menu icon: the GenScore «G» as a data URI, as WordPress expects.
 *
 * @return string
 */
function genscore_menu_icon() {
	$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="black" d="M10 2a8 8 0 1 0 7.75 10H10V9h8a8 8 0 0 0-8-7Zm0 3a5 5 0 0 1 3.6 1.5l-2.1 2.1A2 2 0 0 0 10 8a2 2 0 1 0 1.73 3H14.6A5 5 0 1 1 10 5Z"/></svg>';
	return 'data:image/svg+xml;base64,' . base64_encode( $svg ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- menu icon, as the admin menu API requires.
}

/**
 * Registers the screen.
 */
function genscore_admin_menu() {
	add_menu_page(
		__( 'GenScore', 'genscore' ),
		__( 'GenScore', 'genscore' ),
		'manage_options',
		'genscore',
		'genscore_render_screen',
		genscore_menu_icon(),
		81
	);
}
add_action( 'admin_menu', 'genscore_admin_menu' );

/**
 * Settings link on the Plugins screen.
 *
 * @param string[] $links Links.
 * @return string[]
 */
function genscore_action_links( $links ) {
	array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=genscore' ) ) . '">' . esc_html__( 'Abrir', 'genscore' ) . '</a>' );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( GENSCORE_FILE ), 'genscore_action_links' );

/**
 * Everything the screen needs, in one object.
 *
 * @return array
 */
function genscore_screen_data() {
	$facts  = genscore_site_facts();
	$domain = $facts['domain'];
	$custom = get_option( 'genscore_llms_custom', '' );
	return array(
		'ajax'     => admin_url( 'admin-ajax.php' ),
		'nonce'    => wp_create_nonce( 'genscore' ),
		'assets'   => GENSCORE_URL . 'assets/',
		'version'  => GENSCORE_VERSION,
		'site'     => $facts,
		'bots'     => array(
			'switches' => genscore_bot_switches(),
			'settings' => genscore_sanitize_bot_settings( get_option( 'genscore_bots', array() ) ),
		),
		'llms'     => array(
			'enabled'   => (bool) get_option( 'genscore_llms_enabled', false ),
			'serving'   => genscore_llms_serving(),
			'other'     => genscore_llms_other_provider(),
			'physical'  => genscore_llms_physical_file(),
			'generated' => genscore_llms_generate(),
			'custom'    => is_string( $custom ) ? $custom : '',
			'url'       => home_url( '/llms.txt' ),
		),
		'pages'    => genscore_pages_to_review(),
		'last'     => get_option( 'genscore_last_review', null ),
		'links'    => array(
			'analyze' => genscore_app_url( '/signup', 'analizar', array( 'dominio' => $domain ) ),
			'login'   => genscore_app_url( '/login', 'identificate' ),
			'checker' => genscore_app_url( '/gratis/aparece-mi-marca-en-chatgpt', 'comprobador', array( 'd' => $domain ) ),
			'pricing' => genscore_app_url( '/precios', 'precios' ),
		),
	);
}

/**
 * Assets, only on our screen.
 *
 * @param string $hook Current admin page.
 */
function genscore_admin_assets( $hook ) {
	if ( 'toplevel_page_genscore' !== $hook ) {
		return;
	}
	wp_enqueue_style( 'genscore-admin', GENSCORE_URL . 'assets/admin.css', array(), GENSCORE_VERSION );
	wp_enqueue_script( 'genscore-score', GENSCORE_URL . 'assets/vendor/score.js', array(), GENSCORE_VERSION, true );
	wp_enqueue_script( 'genscore-admin', GENSCORE_URL . 'assets/admin.js', array( 'genscore-score' ), GENSCORE_VERSION, true );
	wp_add_inline_script( 'genscore-admin', 'window.GS_WP = ' . wp_json_encode( genscore_screen_data() ) . ';', 'before' );
}
add_action( 'admin_enqueue_scripts', 'genscore_admin_assets' );

/**
 * The screen: a mount point the script fills, plus the icon sprite.
 */
function genscore_render_screen() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$sprite = GENSCORE_DIR . 'assets/icons.svg';
	echo '<div class="wrap gsw">';
	echo '<h1 class="screen-reader-text">' . esc_html__( 'GenScore', 'genscore' ) . '</h1>';
	if ( is_readable( $sprite ) ) {
		// Our own static SVG sprite, shipped with the plugin.
		echo file_get_contents( $sprite ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped, WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	}
	echo '<div id="genscore-app" class="gs-pg" aria-live="polite"><p class="gs-loading">' . esc_html__( 'Revisando tu portada…', 'genscore' ) . '</p></div>';
	echo '<noscript><p>' . esc_html__( 'Esta pantalla necesita JavaScript.', 'genscore' ) . '</p></noscript>';
	echo '</div>';
}

/**
 * Common guard for the three actions.
 */
function genscore_ajax_guard() {
	check_ajax_referer( 'genscore', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( array( 'message' => __( 'No tienes permiso para cambiar esto.', 'genscore' ) ), 403 );
	}
}

/**
 * Saves the AI bot switches.
 */
function genscore_ajax_save_bots() {
	genscore_ajax_guard();
	$raw = array();
	if ( isset( $_POST['bots'] ) && is_array( $_POST['bots'] ) ) {
		foreach ( wp_unslash( $_POST['bots'] ) as $id => $value ) { // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- every key and value is checked against a fixed list below.
			$raw[ sanitize_key( $id ) ] = sanitize_key( $value );
		}
	}
	update_option( 'genscore_bots', genscore_sanitize_bot_settings( $raw ), false );
	wp_send_json_success( array( 'settings' => genscore_sanitize_bot_settings( get_option( 'genscore_bots', array() ) ) ) );
}
add_action( 'wp_ajax_genscore_save_bots', 'genscore_ajax_save_bots' );

/**
 * Turns llms.txt on or off and saves the edited text (empty = generated).
 */
function genscore_ajax_save_llms() {
	genscore_ajax_guard();
	$enabled = isset( $_POST['enabled'] ) && '1' === sanitize_text_field( wp_unslash( $_POST['enabled'] ) );
	update_option( 'genscore_llms_enabled', $enabled, true );
	if ( isset( $_POST['text'] ) ) {
		$text = sanitize_textarea_field( wp_unslash( $_POST['text'] ) );
		$same = trim( $text ) === trim( genscore_llms_generate() );
		update_option( 'genscore_llms_custom', $same ? '' : $text, false );
	}
	wp_send_json_success(
		array(
			'enabled' => $enabled,
			'serving' => genscore_llms_serving(),
			'custom'  => (string) get_option( 'genscore_llms_custom', '' ),
		)
	);
}
add_action( 'wp_ajax_genscore_save_llms', 'genscore_ajax_save_llms' );

/**
 * Keeps the last «Nota SEO + IA» for the dashboard widget. Only numbers the
 * browser computed on this same site.
 */
function genscore_ajax_save_review() {
	genscore_ajax_guard();
	$lane = function ( $k ) {
		return isset( $_POST[ $k ] ) && '' !== $_POST[ $k ] ? max( 0, min( 100, absint( wp_unslash( $_POST[ $k ] ) ) ) ) : null; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- checked in genscore_ajax_guard().
	};
	update_option(
		'genscore_last_review',
		array(
			'nota'   => $lane( 'nota' ),
			'ia'     => $lane( 'ia' ),
			'google' => $lane( 'google' ),
			'agent'  => $lane( 'agent' ),
			'at'     => time(),
		),
		false
	);
	wp_send_json_success();
}
add_action( 'wp_ajax_genscore_save_review', 'genscore_ajax_save_review' );

/**
 * Dashboard widget: the last nota and a link to the screen. People can hide
 * it from «Opciones de pantalla», like any other widget.
 */
function genscore_dashboard_widget() {
	if ( current_user_can( 'manage_options' ) ) {
		wp_add_dashboard_widget( 'genscore_widget', __( 'GenScore · Visibilidad en IA', 'genscore' ), 'genscore_render_widget' );
	}
}
add_action( 'wp_dashboard_setup', 'genscore_dashboard_widget' );

/**
 * Widget body.
 */
function genscore_render_widget() {
	$last = get_option( 'genscore_last_review', null );
	echo '<div class="gs-widget">';
	if ( is_array( $last ) && isset( $last['nota'] ) && null !== $last['nota'] ) {
		echo '<p style="display:flex;align-items:baseline;gap:8px;margin:0 0 6px"><strong style="font-size:32px;font-weight:400;line-height:1">' . esc_html( (string) $last['nota'] ) . '</strong><span>' . esc_html__( 'Nota SEO + IA de tu portada', 'genscore' ) . '</span></p>';
		/* translators: %s: how long ago, e.g. «2 horas». */
		echo '<p style="margin:0 0 10px;color:#646970">' . esc_html( sprintf( __( 'Revisada hace %s.', 'genscore' ), human_time_diff( (int) $last['at'] ) ) ) . '</p>';
	} else {
		echo '<p style="margin:0 0 10px">' . esc_html__( 'Comprueba si ChatGPT, Gemini, Claude y Perplexity pueden leer tu web, y qué arreglar primero.', 'genscore' ) . '</p>';
	}
	echo '<p style="margin:0"><a class="button button-primary" href="' . esc_url( admin_url( 'admin.php?page=genscore' ) ) . '">' . esc_html__( 'Abrir GenScore', 'genscore' ) . '</a></p>';
	echo '</div>';
}
