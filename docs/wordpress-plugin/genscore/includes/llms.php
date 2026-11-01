<?php
/**
 * llms.txt: built from the site's own pages, served at the root.
 *
 * Nothing is invented: each line's description is the page's excerpt, its SEO
 * plugin description or its own first sentence. A page with none of those
 * goes in without a description.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

const GENSCORE_LLMS_PAGES = 30;
const GENSCORE_LLMS_POSTS = 15;
const GENSCORE_LLMS_PRODUCTS = 15;

/**
 * Other plugins that already publish an llms.txt. GenScore never serves its
 * own on top of theirs.
 *
 * @return string|null Plugin name, or null.
 */
function genscore_llms_other_provider() {
	$wpseo = get_option( 'wpseo' );
	if ( defined( 'WPSEO_VERSION' ) && is_array( $wpseo ) && ! empty( $wpseo['enable_llms_txt'] ) ) {
		return 'Yoast SEO';
	}
	if ( class_exists( 'RankMath\\Helper' ) && method_exists( 'RankMath\\Helper', 'is_module_active' ) && \RankMath\Helper::is_module_active( 'llms-txt' ) ) {
		return 'Rank Math';
	}
	$aioseo = get_option( 'aioseo_options' );
	if ( defined( 'AIOSEO_VERSION' ) && is_string( $aioseo ) && preg_match( '/"llms[a-z]*":\{[^}]*"enable":true/i', $aioseo ) ) {
		return 'All in One SEO';
	}
	return null;
}

/**
 * A real llms.txt file in the web root is served by the web server before
 * WordPress runs, so ours would never be seen.
 *
 * @return bool
 */
function genscore_llms_physical_file() {
	return file_exists( trailingslashit( ABSPATH ) . 'llms.txt' );
}

/**
 * The page's own short description, or ''.
 *
 * @param WP_Post $post Post.
 * @return string
 */
function genscore_post_description( $post ) {
	$candidates = array(
		$post->post_excerpt,
		get_post_meta( $post->ID, '_yoast_wpseo_metadesc', true ),
		get_post_meta( $post->ID, 'rank_math_description', true ),
		get_post_meta( $post->ID, '_seopress_titles_desc', true ),
	);
	foreach ( $candidates as $c ) {
		$c = trim( wp_strip_all_tags( (string) $c ) );
		if ( '' !== $c && false === strpos( $c, '%%' ) ) {
			return genscore_one_line( $c );
		}
	}
	if ( genscore_is_sample_content( $post->post_content ) ) {
		return '';
	}
	$text = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( strip_shortcodes( $post->post_content ) ) ) );
	if ( '' === $text ) {
		return '';
	}
	if ( preg_match( '/^(.{40,200}?[.!?])(\s|$)/u', $text, $m ) ) {
		return genscore_one_line( $m[1] );
	}
	return '';
}

/**
 * Whether a page still holds WordPress's own template text (the privacy
 * policy guide), which says nothing about this site.
 *
 * @param string $content Post content.
 * @return bool
 */
function genscore_is_sample_content( $content ) {
	foreach ( array( 'Texto sugerido', 'Suggested text', 'wp-policy-help', 'privacy-policy-tutorial' ) as $needle ) {
		if ( false !== strpos( (string) $content, $needle ) ) {
			return true;
		}
	}
	return false;
}

/**
 * Pages that only work for a shopper with a session (WooCommerce cart,
 * checkout and account): nothing there for an AI to read.
 *
 * @return int[]
 */
function genscore_llms_skipped_pages() {
	$ids = array( (int) get_option( 'page_on_front' ), (int) get_option( 'wp_page_for_privacy_policy' ) );
	if ( function_exists( 'wc_get_page_id' ) ) {
		foreach ( array( 'cart', 'checkout', 'myaccount' ) as $wc ) {
			$ids[] = (int) wc_get_page_id( $wc );
		}
	}
	return array_values( array_filter( $ids, function ( $id ) {
		return $id > 0;
	} ) );
}

/**
 * One line, at most 200 characters, no markdown brackets.
 *
 * @param string $s Text.
 * @return string
 */
function genscore_one_line( $s ) {
	$s = trim( str_replace( array( '[', ']', "\n", "\r" ), array( '(', ')', ' ', ' ' ), $s ) );
	if ( function_exists( 'mb_strlen' ) && mb_strlen( $s ) > 200 ) {
		$s = rtrim( mb_substr( $s, 0, 199 ) ) . '…';
	}
	return $s;
}

/**
 * A markdown list line.
 *
 * @param WP_Post $post Post.
 * @return string
 */
function genscore_llms_line( $post ) {
	$title = genscore_one_line( get_the_title( $post ) );
	if ( '' === $title ) {
		return '';
	}
	$desc = genscore_post_description( $post );
	return '- [' . $title . '](' . get_permalink( $post ) . ')' . ( '' !== $desc ? ': ' . $desc : '' );
}

/**
 * The generated llms.txt.
 *
 * @return string
 */
function genscore_llms_generate() {
	$out  = array( '# ' . genscore_one_line( get_bloginfo( 'name' ) ) );
	$tag  = genscore_one_line( get_bloginfo( 'description' ) );
	if ( '' !== $tag ) {
		$out[] = '';
		$out[] = '> ' . $tag;
	}

	$skip  = genscore_llms_skipped_pages();
	$pages = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'posts_per_page' => GENSCORE_LLMS_PAGES,
			'orderby'        => array( 'menu_order' => 'ASC', 'title' => 'ASC' ),
			'has_password'   => false,
		)
	);
	$lines = array();
	foreach ( $pages as $p ) {
		if ( in_array( (int) $p->ID, $skip, true ) ) {
			continue;
		}
		$l = genscore_llms_line( $p );
		if ( '' !== $l ) {
			$lines[] = $l;
		}
	}
	if ( $lines ) {
		array_push( $out, '', '## ' . __( 'Páginas', 'genscore' ), '' );
		$out = array_merge( $out, $lines );
	}

	if ( post_type_exists( 'product' ) ) {
		$products = get_posts( array( 'post_type' => 'product', 'post_status' => 'publish', 'posts_per_page' => GENSCORE_LLMS_PRODUCTS, 'has_password' => false ) );
		$lines    = array_filter( array_map( 'genscore_llms_line', $products ) );
		if ( $lines ) {
			array_push( $out, '', '## ' . __( 'Productos', 'genscore' ), '' );
			$out = array_merge( $out, $lines );
		}
	}

	$posts = get_posts( array( 'post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => GENSCORE_LLMS_POSTS, 'has_password' => false ) );
	$lines = array_filter( array_map( 'genscore_llms_line', $posts ) );
	if ( $lines ) {
		array_push( $out, '', '## ' . __( 'Artículos', 'genscore' ), '' );
		$out = array_merge( $out, $lines );
	}

	$privacy = (int) get_option( 'wp_page_for_privacy_policy' );
	if ( $privacy && 'publish' === get_post_status( $privacy ) ) {
		array_push( $out, '', '## Optional', '', genscore_llms_line( get_post( $privacy ) ) );
	}
	return implode( "\n", $out ) . "\n";
}

/**
 * What /llms.txt serves: the person's own edited text, or the generated one.
 *
 * @return string
 */
function genscore_llms_content() {
	$custom = get_option( 'genscore_llms_custom', '' );
	return is_string( $custom ) && '' !== trim( $custom ) ? $custom : genscore_llms_generate();
}

/**
 * Whether GenScore is the one answering /llms.txt right now.
 *
 * @return bool
 */
function genscore_llms_serving() {
	return (bool) get_option( 'genscore_llms_enabled', false ) && ! genscore_llms_other_provider() && ! genscore_llms_physical_file();
}

/**
 * Answers /llms.txt before WordPress looks for a post.
 */
function genscore_llms_maybe_serve() {
	if ( ! genscore_llms_serving() ) {
		return;
	}
	$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '', PHP_URL_PATH );
	$home = wp_parse_url( home_url( '/' ), PHP_URL_PATH );
	if ( ! is_string( $path ) || trailingslashit( (string) $home ) . 'llms.txt' !== $path ) {
		return;
	}
	nocache_headers();
	header( 'Content-Type: text/plain; charset=utf-8' );
	header( 'X-Robots-Tag: noindex' );
	echo genscore_llms_content(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- plain text file, not HTML.
	exit;
}
add_action( 'parse_request', 'genscore_llms_maybe_serve', 0 );
