<?php
/**
 * The site review: which pages count as the important ones, the score each
 * one got, and the «GenScore» column in the lists of pages, posts and
 * products.
 *
 * Every score is computed in the browser of whoever opens the GenScore
 * screen (the extension's score.js) and stored here, in this site's own
 * options. Nothing is sent to genscore.es.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/** How many pages the site review reads, home page included. */
const GENSCORE_KEY_PAGES = 15;

/** Stored page scores, keyed by post id (0 is the home page). */
const GENSCORE_SCORES_OPTION = 'genscore_page_scores';

/**
 * A page the screen can review: published, public, of this site. Only the id
 * ever travels; the address always comes from WordPress.
 *
 * @param WP_Post|int|null $post Post.
 * @return array|null
 */
function genscore_review_choice( $post ) {
	$post = get_post( $post );
	if ( ! $post || 'publish' !== $post->post_status || ! in_array( $post->post_type, array( 'page', 'post', 'product' ), true ) || post_password_required( $post ) || ! is_post_publicly_viewable( $post ) ) {
		return null;
	}
	$url = get_permalink( $post );
	if ( ! $url || 0 !== strpos( $url, home_url( '/' ) ) ) {
		return null;
	}
	$path = (string) wp_parse_url( $url, PHP_URL_PATH );
	$q    = (string) wp_parse_url( $url, PHP_URL_QUERY );
	return array(
		'id'    => $post->ID,
		'type'  => $post->post_type,
		'title' => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
		'url'   => $url,
		'path'  => rawurldecode( $path . ( '' !== $q ? '?' . $q : '' ) ),
		'edit'  => current_user_can( 'edit_post', $post->ID ) ? get_edit_post_link( $post->ID, 'raw' ) : null,
	);
}

/**
 * The home page as a choice. Its id is 0, so a static front page and a
 * list of latest posts are stored the same way.
 *
 * @return array
 */
function genscore_home_choice() {
	$front = (int) get_option( 'page_on_front' );
	return array(
		'id'    => 0,
		'type'  => 'home',
		'title' => __( 'Portada', 'genscore' ),
		'url'   => home_url( '/' ),
		'path'  => '/',
		'edit'  => $front && current_user_can( 'edit_post', $front ) ? get_edit_post_link( $front, 'raw' ) : null,
	);
}

/**
 * The important pages, in this order and without repeats: the home page,
 * what the menus link to, the best-selling (or latest) products, the latest
 * posts, then the most recently updated pages. At most GENSCORE_KEY_PAGES.
 *
 * @return array[]
 */
function genscore_key_pages() {
	$out  = array( genscore_home_choice() );
	$seen = array_flip( genscore_llms_skipped_pages() );
	$add  = function ( $post ) use ( &$out, &$seen ) {
		if ( count( $out ) >= GENSCORE_KEY_PAGES ) {
			return;
		}
		$id = $post instanceof WP_Post ? $post->ID : (int) $post;
		if ( ! $id || isset( $seen[ $id ] ) ) {
			return;
		}
		$seen[ $id ] = true;
		$c           = genscore_review_choice( $id );
		if ( $c ) {
			$out[] = $c;
		}
	};

	foreach ( wp_get_nav_menus() as $menu ) {
		foreach ( (array) wp_get_nav_menu_items( $menu ) as $item ) {
			if ( isset( $item->type, $item->object_id ) && 'post_type' === $item->type ) {
				$add( (int) $item->object_id );
			}
		}
	}

	$queries = array();
	if ( post_type_exists( 'product' ) ) {
		$queries[] = function_exists( 'wc_get_products' )
			? array( 'post_type' => 'product', 'posts_per_page' => 4, 'meta_key' => 'total_sales', 'orderby' => array( 'meta_value_num' => 'DESC', 'date' => 'DESC' ) ) // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- four rows, once per screen load.
			: array( 'post_type' => 'product', 'posts_per_page' => 4, 'orderby' => 'modified' );
	}
	$queries[] = array( 'post_type' => 'post', 'posts_per_page' => 3, 'orderby' => 'date' );
	$queries[] = array( 'post_type' => 'page', 'posts_per_page' => GENSCORE_KEY_PAGES, 'orderby' => 'modified' );
	if ( post_type_exists( 'product' ) ) {
		$queries[] = array( 'post_type' => 'product', 'posts_per_page' => GENSCORE_KEY_PAGES, 'orderby' => 'modified' );
	}
	foreach ( $queries as $q ) {
		$found = get_posts( array_merge( array( 'post_status' => 'publish', 'has_password' => false ), $q ) );
		foreach ( $found as $p ) {
			$add( $p );
		}
	}
	return $out;
}

/**
 * Stored scores, keyed by post id.
 *
 * @return array<int, array>
 */
function genscore_page_scores() {
	$s = get_option( GENSCORE_SCORES_OPTION, array() );
	return is_array( $s ) ? $s : array();
}

/**
 * Cleans one page result sent by the screen. Numbers are clamped, lanes and
 * units come from a fixed list, and the fix text keeps only the tags the
 * extension writes (<code>, <b>).
 *
 * @param mixed $raw Decoded JSON.
 * @return array|null
 */
function genscore_sanitize_page_score( $raw ) {
	if ( ! is_array( $raw ) || ! isset( $raw['id'], $raw['nota'] ) ) {
		return null;
	}
	$score = function ( $v ) {
		return null === $v || '' === $v || ! is_numeric( $v ) ? null : max( 0, min( 100, (int) round( $v ) ) );
	};
	$out = array(
		'nota'   => $score( $raw['nota'] ),
		'ia'     => $score( isset( $raw['ia'] ) ? $raw['ia'] : null ),
		'google' => $score( isset( $raw['google'] ) ? $raw['google'] : null ),
		'agent'  => $score( isset( $raw['agent'] ) ? $raw['agent'] : null ),
		'at'     => time(),
		'via'    => ! empty( $raw['via'] ),
		'fixes'  => array(),
	);
	if ( null === $out['nota'] ) {
		return null;
	}
	$allowed = array(
		'code' => array( 'class' => true ),
		'b'    => array(),
	);
	foreach ( array_slice( isset( $raw['fixes'] ) && is_array( $raw['fixes'] ) ? $raw['fixes'] : array(), 0, 12 ) as $f ) {
		if ( ! is_array( $f ) || ! isset( $f['id'], $f['lane'], $f['t'] ) || ! in_array( $f['lane'], array( 'ia', 'google', 'agent' ), true ) ) {
			continue;
		}
		$out['fixes'][] = array(
			'id'   => sanitize_key( $f['id'] ),
			'lane' => $f['lane'],
			'pts'  => isset( $f['pts'] ) ? max( 0, min( 100, absint( $f['pts'] ) ) ) : 0,
			'unit' => isset( $f['unit'] ) && 'pt' === $f['unit'] ? 'pt' : 'en Agentes',
			't'    => wp_kses( mb_substr( (string) $f['t'], 0, 200 ), $allowed ),
		);
	}
	return $out;
}

/**
 * Stores one page's score. The home page is 0; anything else must be a page
 * the screen could review.
 *
 * @param int   $id    Post id, 0 for the home page.
 * @param array $score From genscore_sanitize_page_score().
 */
function genscore_store_page_score( $id, $score ) {
	$all        = genscore_page_scores();
	$all[ $id ] = $score;
	if ( count( $all ) > 60 ) {
		uasort(
			$all,
			function ( $a, $b ) {
				return $b['at'] - $a['at'];
			}
		);
		$all = array_slice( $all, 0, 60, true );
	}
	update_option( GENSCORE_SCORES_OPTION, $all, false );
}

/**
 * A page that changes is reviewed again the next time the screen opens:
 * its stored score goes away, and only that one is read again.
 *
 * @param int $post_id Post id.
 */
function genscore_forget_page_score( $post_id ) {
	if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
		return;
	}
	$all     = genscore_page_scores();
	$changed = false;
	foreach ( array( (int) $post_id, (int) get_option( 'page_on_front' ) === (int) $post_id ? 0 : -1 ) as $k ) {
		if ( $k >= 0 && isset( $all[ $k ] ) ) {
			unset( $all[ $k ] );
			$changed = true;
		}
	}
	if ( $changed ) {
		update_option( GENSCORE_SCORES_OPTION, $all, false );
	}
}
add_action( 'save_post', 'genscore_forget_page_score' );
add_action( 'deleted_post', 'genscore_forget_page_score' );

/**
 * Forgets every stored score. robots.txt, llms.txt and «visible to search
 * engines» count on every page, so a change to any of them makes every
 * score stale: the next visit to the screen reads the pages again.
 */
function genscore_forget_all_scores() {
	delete_option( GENSCORE_SCORES_OPTION );
}
add_action( 'update_option_blog_public', 'genscore_forget_all_scores' );

/**
 * Scores stored by another version of the plugin may have been computed
 * differently (1.0.5 stored the borrowed shop fixes with their own ids), so
 * they are read again once after an update.
 */
function genscore_scores_version_check() {
	if ( GENSCORE_VERSION !== get_option( 'genscore_scores_version' ) ) {
		genscore_forget_all_scores();
		update_option( 'genscore_scores_version', GENSCORE_VERSION, false );
	}
}
add_action( 'admin_init', 'genscore_scores_version_check' );
