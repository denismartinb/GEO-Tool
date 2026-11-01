<?php
/**
 * One-click fixes, admin side: the proposal for each page, the list the
 * screen shows, publishing what the person accepted and undoing it.
 *
 * Proposals come only from data WordPress already has. A page without the
 * data a proposal needs (no text for a description, no price for a product)
 * says so and is never published.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/** Undo records, newest last. */
const GENSCORE_BATCHES_OPTION = 'genscore_fix_batches';

/** How many pages one publish request writes, and how many a list holds. */
const GENSCORE_FIX_CHUNK = 50;
const GENSCORE_FIX_MAX   = 2000;
const GENSCORE_FIX_PAGE  = 30;

/**
 * The fixes GenScore can publish: the post types each one applies to and
 * the score.js fix ids it answers.
 *
 * @return array
 */
function genscore_fix_kinds() {
	return array(
		'ld'      => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array( 'ld' ) ),
		'product' => array( 'types' => array( 'product' ), 'ids' => array( 'prod', 'price', 'avail' ) ),
		'desc'    => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array( 'desc' ) ),
		'title'   => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array( 'title' ) ),
		'canon'   => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array( 'canon' ) ),
		'fresh'   => array( 'types' => array( 'page', 'post' ), 'ids' => array( 'fresh' ) ),
		'returns' => array( 'types' => array( 'product' ), 'ids' => array( 'returns' ) ),
		'lead'    => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array( 'lead' ) ),
	);
}

/**
 * Whether a fix can be published on this site, and if not, why.
 *
 * @param string $kind Kind.
 * @return string|true
 */
function genscore_fix_available( $kind ) {
	$woo = class_exists( 'WooCommerce' ) && function_exists( 'wc_get_product' );
	if ( in_array( $kind, array( 'product', 'returns' ), true ) && ! $woo ) {
		return __( 'Hace falta WooCommerce.', 'genscore' );
	}
	if ( in_array( $kind, array( 'desc', 'title', 'canon' ), true ) && null === genscore_seo_field( 'desc' ) ) {
		$seo = genscore_seo_plugin();
		/* translators: %s: SEO plugin name. */
		return sprintf( __( '%s guarda estos datos a su manera: cámbialos en sus ajustes de cada página.', 'genscore' ), $seo ? $seo['name'] : '' );
	}
	return true;
}

/**
 * Where a fix is written: the SEO plugin's meta key, or GenScore's field.
 *
 * @param string $kind Kind.
 * @return array{0: string, 1: string} ['m', meta key] or ['g', field].
 */
function genscore_fix_store( $kind ) {
	$map = array( 'ld' => 'jsonld', 'product' => 'jsonld', 'desc' => 'desc', 'title' => 'title', 'canon' => 'canonical', 'fresh' => 'fresh', 'returns' => 'returns', 'lead' => 'lead' );
	if ( in_array( $kind, array( 'desc', 'title', 'canon' ), true ) ) {
		$key = genscore_seo_field( 'canon' === $kind ? 'canonical' : $kind );
		if ( $key ) {
			return array( 'm', $key );
		}
	}
	return array( 'g', $map[ $kind ] );
}

/**
 * Current stored value of a fix on a page.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, 0 for a home page that lists posts.
 * @return string
 */
function genscore_fix_current( $kind, $id ) {
	$s = genscore_fix_store( $kind );
	if ( 'm' === $s[0] ) {
		return $id ? (string) get_post_meta( $id, $s[1], true ) : '';
	}
	return genscore_fix_get( $id, $s[1] );
}

/**
 * Writes a fix value and returns what was there before.
 *
 * @param string $kind  Kind.
 * @param int    $id    Post id, or 0.
 * @param string $value Value ('' removes).
 * @return array Previous value record for undo.
 */
function genscore_fix_write( $kind, $id, $value ) {
	$s    = genscore_fix_store( $kind );
	$prev = array( $s[0], $s[1], genscore_fix_current( $kind, $id ) );
	if ( 'm' === $s[0] ) {
		if ( '' === $value ) {
			delete_post_meta( $id, $s[1] );
		} else {
			update_post_meta( $id, $s[1], wp_slash( $value ) );
		}
	} else {
		genscore_fix_set( $id, $s[1], $value );
	}
	if ( $id ) {
		clean_post_cache( $id );
	}
	return $prev;
}

/* ------------------------------------------------------------------ */
/* Proposals                                                          */
/* ------------------------------------------------------------------ */

/**
 * Plain text from post content or an excerpt.
 *
 * @param string $html HTML.
 * @return string
 */
function genscore_plain_text( $html ) {
	$t = function_exists( 'excerpt_remove_blocks' ) ? excerpt_remove_blocks( (string) $html ) : (string) $html;
	// Blocks end where a word ends: «Molienda</h3><p>Fina» is two words.
	$t = preg_replace( '#<br\s*/?>|</(p|h[1-6]|li|div|td|th|blockquote|figcaption)>#i', ' ', $t );
	$t = wp_strip_all_tags( strip_shortcodes( $t ), true );
	$t = html_entity_decode( $t, ENT_QUOTES, 'UTF-8' );
	return trim( preg_replace( '/\s+/u', ' ', $t ) );
}

/**
 * Cuts text at the last whole sentence that fits, or at a word with «…».
 *
 * @param string $text Text.
 * @param int    $max  Characters.
 * @return string
 */
function genscore_cut_text( $text, $max ) {
	$text = trim( $text );
	if ( mb_strlen( $text ) <= $max ) {
		return $text;
	}
	$cut = mb_substr( $text, 0, $max );
	if ( preg_match( '/^(.{40,}[.!?])(\s|$)/us', $cut . ' ', $m ) ) {
		return trim( $m[1] );
	}
	$cut = mb_substr( $text, 0, $max - 1 );
	$sp  = mb_strrpos( $cut, ' ' );
	if ( false !== $sp && $sp > 20 ) {
		$cut = mb_substr( $cut, 0, $sp );
	}
	return rtrim( $cut, " ,;:.-" ) . '…';
}

/**
 * Title without HTML entities.
 *
 * @param int $id Post id.
 * @return string
 */
function genscore_post_title( $id ) {
	return trim( html_entity_decode( wp_strip_all_tags( get_the_title( $id ) ), ENT_QUOTES, 'UTF-8' ) );
}

/**
 * Description proposal: the excerpt, or the start of the content, in one
 * sentence of up to 155 characters. Null when the page has too little text.
 *
 * @param int $id Post id, or 0.
 * @return string|null
 */
function genscore_propose_desc( $id ) {
	if ( 0 === $id ) {
		$t = genscore_plain_text( get_bloginfo( 'description' ) );
	} else {
		$post = get_post( $id );
		$t    = genscore_plain_text( $post->post_excerpt );
		if ( mb_strlen( $t ) < 50 ) {
			$c = genscore_plain_text( $post->post_content );
			$t = mb_strlen( $c ) > mb_strlen( $t ) ? $c : $t;
		}
	}
	// The answer-first paragraph the person approved says the same thing.
	if ( mb_strlen( $t ) < 50 && $id ) {
		$lead = genscore_plain_text( genscore_fix_get( $id, 'lead' ) );
		$t    = mb_strlen( $lead ) > mb_strlen( $t ) ? $lead : $t;
	}
	// A listing (shop, posts page) has no text of its own: its name, the
	// site's name and the site's tagline, all written in WordPress.
	if ( mb_strlen( $t ) < 50 && $id && genscore_is_listing_page( $id ) ) {
		$tag = genscore_plain_text( get_bloginfo( 'description' ) );
		if ( '' !== $tag ) {
			/* translators: 1: page title, 2: site name, 3: site tagline. */
			$t = sprintf( __( '%1$s de %2$s: %3$s.', 'genscore' ), genscore_post_title( $id ), wp_strip_all_tags( get_bloginfo( 'name' ) ), mb_strtolower( mb_substr( $tag, 0, 1 ) ) . mb_substr( rtrim( $tag, '.' ), 1 ) );
		}
	}
	$t = genscore_cut_text( $t, 155 );
	return mb_strlen( $t ) >= 25 ? $t : null;
}

/**
 * Words in a text.
 *
 * @param string $t Text.
 * @return int
 */
function genscore_word_count( $t ) {
	return count( preg_split( '/\s+/u', trim( (string) $t ), -1, PREG_SPLIT_NO_EMPTY ) );
}

/**
 * Answer-first proposal: the page's own summary (its excerpt, or the
 * description it publishes), never invented. Null when it has none.
 *
 * @param int $id Post id.
 * @return string|null
 */
function genscore_propose_lead( $id ) {
	$post = get_post( $id );
	if ( ! $post ) {
		return null;
	}
	$seo  = genscore_seo_field( 'desc' );
	$from = array( $post->post_excerpt, $seo ? get_post_meta( $id, $seo, true ) : '', genscore_fix_get( $id, 'desc' ) );
	// A product's description sits in a tab further down, so it can open
	// the page without repeating anything.
	$product = 'product' === $post->post_type;
	if ( $product ) {
		$from[] = $post->post_content;
	}
	$start = $product ? '' : mb_strtolower( mb_substr( genscore_plain_text( $post->post_content ), 0, 60 ) );
	foreach ( $from as $t ) {
		$t = genscore_plain_text( $t );
		// A summary cut from the page's own opening would only repeat it.
		if ( '' !== $start && 0 === mb_strpos( $start, mb_strtolower( mb_substr( $t, 0, 60 ) ) ) ) {
			continue;
		}
		// Under 20 words the review only gives half the credit.
		if ( genscore_word_count( $t ) >= 20 ) {
			return genscore_cut_text( $t, 700 );
		}
	}
	return null;
}

/**
 * Whether the page already opens with a paragraph of 20 to 120 words.
 *
 * @param int $id Post id.
 * @return bool
 */
function genscore_has_lead( $id ) {
	$post = get_post( $id );
	if ( $post && 'product' === $post->post_type ) {
		// Under a product's title WooCommerce prints its short description.
		$n = genscore_word_count( genscore_plain_text( $post->post_excerpt ) );
		return $n >= 20 && $n <= 120;
	}
	if ( ! $post || ! preg_match_all( '#<p[^>]*>(.*?)</p>#is', (string) $post->post_content, $m ) ) {
		return false;
	}
	foreach ( $m[1] as $p ) {
		$n = genscore_word_count( genscore_plain_text( $p ) );
		if ( $n >= 12 ) {
			return $n >= 20 && $n <= 120;
		}
	}
	return false;
}

/**
 * Title proposal: «Page · Site», up to 65 characters.
 *
 * @param int $id Post id, or 0.
 * @return string|null
 */
function genscore_propose_title( $id ) {
	$site = trim( html_entity_decode( get_bloginfo( 'name' ), ENT_QUOTES, 'UTF-8' ) );
	$base = 0 === $id ? trim( html_entity_decode( get_bloginfo( 'description' ), ENT_QUOTES, 'UTF-8' ) ) : genscore_post_title( $id );
	if ( '' === $base ) {
		return '' !== $site ? $site : null;
	}
	$full = '' !== $site && $site !== $base ? ( 0 === $id ? $site . ' · ' . $base : $base . ' · ' . $site ) : $base;
	if ( mb_strlen( $full ) <= 65 ) {
		return $full;
	}
	$cut = genscore_cut_text( $base, 65 );
	return rtrim( $cut, '…' );
}

/**
 * The page's own address.
 *
 * @param int $id Post id, or 0.
 * @return string
 */
function genscore_page_url( $id ) {
	return 0 === $id ? home_url( '/' ) : (string) get_permalink( $id );
}

/**
 * The page's description as published, or the proposal.
 *
 * @param int $id Post id, or 0.
 * @return string
 */
function genscore_desc_for_ld( $id ) {
	$now = genscore_fix_current( 'desc', $id );
	if ( '' !== $now ) {
		return $now;
	}
	$p = genscore_propose_desc( $id );
	return $p ? $p : '';
}

/**
 * Removes empty values, so the block never carries a blank field.
 *
 * @param array $data Data.
 * @return array
 */
function genscore_compact( $data ) {
	foreach ( $data as $k => $v ) {
		if ( is_array( $v ) ) {
			$v          = genscore_compact( $v );
			$data[ $k ] = $v;
		}
		if ( null === $v || '' === $v || array() === $v ) {
			unset( $data[ $k ] );
		}
	}
	return $data;
}

/**
 * The Product block of a WooCommerce product, or null without a price.
 *
 * @param int $id Product id.
 * @return array|null
 */
function genscore_product_data( $id ) {
	$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
	if ( ! $product ) {
		return null;
	}
	$price = (string) $product->get_price();
	if ( '' === $price ) {
		return null;
	}
	$stock = $product->get_stock_status();
	$avail = 'outofstock' === $stock ? 'OutOfStock' : ( 'onbackorder' === $stock ? 'BackOrder' : 'InStock' );
	$image = $product->get_image_id() ? wp_get_attachment_url( $product->get_image_id() ) : '';
	return genscore_compact(
		array(
			'@context'    => 'https://schema.org',
			'@type'       => 'Product',
			'name'        => genscore_post_title( $id ),
			'url'         => genscore_page_url( $id ),
			'description' => genscore_desc_for_ld( $id ),
			'image'       => $image ? $image : '',
			'sku'         => (string) $product->get_sku(),
			'offers'      => array(
				'@type'         => 'Offer',
				'price'         => wc_format_decimal( $price, wc_get_price_decimals() ),
				'priceCurrency' => get_woocommerce_currency(),
				'availability'  => 'https://schema.org/' . $avail,
				'url'           => genscore_page_url( $id ),
			),
		)
	);
}

/**
 * JSON-LD proposal for any page: WebSite for the home page, Article for a
 * post, Product for a WooCommerce product, WebPage for the rest.
 *
 * @param int $id Post id, or 0.
 * @return array|null
 */
function genscore_ld_data( $id ) {
	$site = array(
		'@type' => 'WebSite',
		'name'  => html_entity_decode( get_bloginfo( 'name' ), ENT_QUOTES, 'UTF-8' ),
		'url'   => home_url( '/' ),
	);
	$lang = get_bloginfo( 'language' );
	if ( 0 === $id || (int) get_option( 'page_on_front' ) === $id ) {
		return genscore_compact( array_merge( array( '@context' => 'https://schema.org' ), $site, array( 'description' => genscore_desc_for_ld( $id ), 'inLanguage' => $lang ) ) );
	}
	$type = get_post_type( $id );
	if ( 'product' === $type ) {
		return genscore_product_data( $id );
	}
	$modified = get_post_modified_time( 'c', false, $id );
	if ( 'post' === $type ) {
		$post   = get_post( $id );
		$thumb  = get_the_post_thumbnail_url( $id, 'full' );
		$author = get_the_author_meta( 'display_name', (int) $post->post_author );
		$icon   = get_site_icon_url( 512 );
		return genscore_compact(
			array(
				'@context'      => 'https://schema.org',
				'@type'         => 'Article',
				'headline'      => genscore_cut_text( genscore_post_title( $id ), 110 ),
				'url'           => genscore_page_url( $id ),
				'description'   => genscore_desc_for_ld( $id ),
				'image'         => $thumb ? $thumb : '',
				'datePublished' => get_post_time( 'c', false, $id ),
				'dateModified'  => $modified,
				'inLanguage'    => $lang,
				'author'        => $author ? array( '@type' => 'Person', 'name' => $author ) : null,
				'publisher'     => array(
					'@type' => 'Organization',
					'name'  => $site['name'],
					'logo'  => $icon ? array( '@type' => 'ImageObject', 'url' => $icon ) : null,
				),
			)
		);
	}
	return genscore_compact(
		array(
			'@context'     => 'https://schema.org',
			'@type'        => 'WebPage',
			'name'         => genscore_post_title( $id ),
			'url'          => genscore_page_url( $id ),
			'description'  => genscore_desc_for_ld( $id ),
			'dateModified' => $modified,
			'inLanguage'   => $lang,
			'isPartOf'     => $site,
		)
	);
}

/**
 * The value GenScore proposes for a page, as the text the person reviews.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, or 0.
 * @return string|null Null when the page lacks the data.
 */
function genscore_fix_propose( $kind, $id ) {
	switch ( $kind ) {
		case 'product':
			if ( $id && genscore_shop_page_id() === $id ) {
				$d = genscore_shop_list_data( '' !== genscore_fix_get( $id, 'returns' ) );
				return $d ? wp_json_encode( $d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT ) : null;
			}
			$d = genscore_ld_data( $id );
			return $d ? wp_json_encode( $d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT ) : null;
		case 'ld':
			$d = genscore_ld_data( $id );
			return $d ? wp_json_encode( $d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT ) : null;
		case 'desc':
			return genscore_propose_desc( $id );
		case 'title':
			return genscore_propose_title( $id );
		case 'canon':
			return genscore_page_url( $id );
		case 'fresh':
			if ( $id && genscore_is_listing_page( $id ) ) {
				$when = genscore_listing_modified( $id );
				return $when ? wp_date( get_option( 'date_format' ), $when ) : null;
			}
			return get_post_modified_time( get_option( 'date_format' ), false, $id, true );
		case 'lead':
			return genscore_propose_lead( $id );
		case 'returns':
			// The shop carries the policy inside its product list.
			if ( $id && genscore_shop_page_id() === $id && GENSCORE_SHOP_LIVE !== genscore_fix_get( $id, 'jsonld' ) ) {
				return null;
			}
			return '1';
	}
	return null;
}

/**
 * Why a page has no proposal.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id.
 * @return string
 */
function genscore_fix_missing_note( $kind, $id = 0 ) {
	if ( 'returns' === $kind && $id && genscore_shop_page_id() === $id ) {
		return __( 'Publica antes sus datos de producto', 'genscore' );
	}
	if ( in_array( $kind, array( 'ld', 'product' ), true ) ) {
		return __( 'Falta el precio', 'genscore' );
	}
	if ( 'desc' === $kind ) {
		return __( 'Sin texto para proponerla', 'genscore' );
	}
	if ( 'lead' === $kind ) {
		return __( 'Sin extracto ni descripción', 'genscore' );
	}
	return __( 'Sin datos', 'genscore' );
}

/**
 * Cleans what the person edited before it is published.
 *
 * @param string $kind  Kind.
 * @param string $value Typed value.
 * @return string|null
 */
function genscore_fix_clean( $kind, $value ) {
	$value = (string) $value;
	switch ( $kind ) {
		case 'ld':
		case 'product':
			return genscore_clean_jsonld( $value );
		case 'desc':
			$v = sanitize_text_field( $value );
			return '' !== $v ? mb_substr( $v, 0, 320 ) : null;
		case 'title':
			$v = sanitize_text_field( $value );
			return '' !== $v ? mb_substr( $v, 0, 120 ) : null;
		case 'lead':
			$v = sanitize_text_field( $value );
			return genscore_word_count( $v ) >= 20 ? mb_substr( $v, 0, 900 ) : null; // Under 20 words the review keeps flagging it.
		case 'canon':
			$v = esc_url_raw( trim( $value ), array( 'http', 'https' ) );
			$h = wp_parse_url( home_url( '/' ), PHP_URL_HOST );
			return $v && wp_parse_url( $v, PHP_URL_HOST ) === $h ? $v : null;
	}
	return null; // fresh and returns are not typed.
}

/* ------------------------------------------------------------------ */
/* Which pages, and whether each one needs the fix                    */
/* ------------------------------------------------------------------ */

/**
 * Whether the stored site review says a page needs this fix: true, false,
 * or null when the page was not reviewed.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, or 0.
 * @return bool|null
 */
function genscore_fix_review_says( $kind, $id ) {
	static $scores = null;
	if ( null === $scores ) {
		$scores = genscore_page_scores();
	}
	$front = (int) get_option( 'page_on_front' );
	$key   = $front && $front === $id ? 0 : $id;
	if ( ! isset( $scores[ $key ]['fixes'] ) ) {
		return null;
	}
	$ids = genscore_fix_kinds()[ $kind ]['ids'];
	foreach ( $scores[ $key ]['fixes'] as $f ) {
		if ( in_array( $f['id'], $ids, true ) ) {
			return true;
		}
	}
	return false;
}

/**
 * Whether WordPress shows this page as a list (no canonical of its own): the
 * home of latest posts, the posts page or the WooCommerce shop.
 *
 * @param int $id Post id, or 0.
 * @return bool
 */
function genscore_is_listing_page( $id ) {
	if ( 0 === $id ) {
		return true;
	}
	if ( (int) get_option( 'page_for_posts' ) === $id ) {
		return true;
	}
	return function_exists( 'wc_get_page_id' ) && (int) wc_get_page_id( 'shop' ) === $id;
}

/**
 * ready (GenScore proposes something), has (the page already has it).
 * Cheap: used for every page of the list.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, or 0.
 * @return string
 */
function genscore_fix_status( $kind, $id ) {
	$now = genscore_fix_current( $kind, $id );
	$len = mb_strlen( $now );
	if ( 'desc' === $kind && $len >= 50 && $len <= 160 ) {
		return 'has';
	}
	if ( 'title' === $kind && $len >= 15 && $len <= 65 ) {
		return 'has';
	}
	if ( 'lead' === $kind && '' !== $now ) {
		// A short one only gets half the credit: it can still be improved.
		return genscore_word_count( $now ) >= 20 ? 'has' : 'ready';
	}
	if ( 'ld' === $kind && genscore_seo_prints_schema() && ! ( $id && 'product' === get_post_type( $id ) ) ) {
		return 'has'; // The SEO plugin's graph already covers it.
	}
	if ( in_array( $kind, array( 'ld', 'product', 'canon', 'fresh', 'returns' ), true ) && '' !== $now ) {
		return 'has';
	}
	$says = genscore_fix_review_says( $kind, $id );
	if ( null !== $says ) {
		return $says ? 'ready' : 'has';
	}
	$seo  = genscore_seo_plugin();
	$type = $id ? get_post_type( $id ) : 'home';
	switch ( $kind ) {
		case 'title':
			$t = 0 === $id ? genscore_propose_title( 0 ) : genscore_post_title( $id ) . ' - ' . get_bloginfo( 'name' );
			$l = mb_strlen( (string) $t );
			return $l >= 15 && $l <= 65 ? 'has' : 'ready';
		case 'canon':
			// WordPress prints it on singular posts only: the home that lists
			// posts, the posts page and the WooCommerce shop are archives.
			return ! $seo && genscore_is_listing_page( $id ) ? 'ready' : 'has';
		case 'ld':
			// Yoast and Rank Math print their own graph; WooCommerce its Product.
			return ( $seo && in_array( $seo['name'], array( 'Yoast SEO', 'Rank Math' ), true ) ) || 'product' === $type ? 'has' : 'ready';
		case 'product':
			return $id && genscore_shop_page_id() === $id ? 'ready' : 'has';
		case 'lead':
			return genscore_has_lead( $id ) ? 'has' : 'ready';
	}
	return 'ready';
}

/**
 * Post ids of one type that the fix can reach, newest edit first.
 *
 * @param string $type Post type.
 * @param string $q    Search in titles.
 * @return int[]
 */
function genscore_fix_query( $type, $q ) {
	if ( ! post_type_exists( $type ) ) {
		return array();
	}
	$args = array(
		'post_type'      => $type,
		'post_status'    => 'publish',
		'has_password'   => false,
		'posts_per_page' => GENSCORE_FIX_MAX,
		'fields'         => 'ids',
		'orderby'        => 'modified',
		'order'          => 'DESC',
		'post__not_in'   => genscore_fix_skipped_pages(), // phpcs:ignore WordPressVIPMinimum.Performance.WPQueryParams.PostNotIn_post__not_in -- a handful of ids (cart, checkout, account, privacy).
		'no_found_rows'  => true,
	);
	if ( '' !== $q ) {
		$args['s']              = $q;
		$args['search_columns'] = array( 'post_title' );
	}
	return array_map( 'intval', get_posts( $args ) );
}

/**
 * The home page row (id 0) only exists when it lists the latest posts:
 * a static front page is listed as the page it is.
 *
 * @param string $kind Kind.
 * @param string $q    Search.
 * @return bool
 */
function genscore_fix_has_home_row( $kind, $q ) {
	if ( 'page' !== get_option( 'show_on_front' ) && in_array( $kind, array( 'ld', 'desc', 'title', 'canon' ), true ) ) {
		$ok_seo = 'ld' === $kind || ! genscore_seo_plugin();
		return $ok_seo && ( '' === $q || false !== mb_stripos( __( 'Portada', 'genscore' ), $q ) );
	}
	return false;
}

/**
 * Pages that never get a fix: cart, checkout, account and privacy. The static
 * front page is left out of llms.txt but it is the first page to fix.
 *
 * @return int[]
 */
function genscore_fix_skipped_pages() {
	$front = (int) get_option( 'page_on_front' );
	return array_values( array_diff( genscore_llms_skipped_pages(), array( $front ) ) );
}

/**
 * The WooCommerce shop page gets the product fixes as a whole: a live list
 * of its products with price, stock and the returns policy.
 *
 * @param string $kind Kind.
 * @param string $q    Search.
 * @return int Shop page id, or 0.
 */
function genscore_fix_shop_row( $kind, $q ) {
	$shop = genscore_shop_page_id();
	if ( ! $shop || ! in_array( $kind, array( 'product', 'returns' ), true ) || 'publish' !== get_post_status( $shop ) ) {
		return 0;
	}
	return '' === $q || false !== mb_stripos( genscore_post_title( $shop ), $q ) ? $shop : 0;
}

/**
 * Whether the page has the data its proposal needs, so «Seleccionar todas»
 * never ticks a page that cannot be published.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, or 0.
 * @return bool
 */
function genscore_fix_has_data( $kind, $id ) {
	switch ( $kind ) {
		case 'desc':
			return null !== genscore_propose_desc( $id );
		case 'title':
			return null !== genscore_propose_title( $id );
		case 'product':
			if ( $id && genscore_shop_page_id() === $id ) {
				return null !== genscore_shop_list_data( false );
			}
			return '' !== (string) get_post_meta( $id, '_price', true );
		case 'returns':
		case 'lead':
			return null !== genscore_fix_propose( $kind, $id );
		case 'ld':
			return ! $id || 'product' !== get_post_type( $id ) || '' !== (string) get_post_meta( $id, '_price', true );
	}
	return true;
}

/**
 * One row of the list, with its proposal.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, or 0.
 * @return array
 */
function genscore_fix_row( $kind, $id ) {
	$status = genscore_fix_status( $kind, $id );
	$live   = 'product' === $kind && $id && genscore_shop_page_id() === $id;
	$value  = 'has' === $status && ! $live ? genscore_fix_current( $kind, $id ) : genscore_fix_propose( $kind, $id );
	// The answer-first paragraph is the person's to write when the page has
	// no summary of its own: the row opens empty instead of being shut.
	if ( 'ready' === $status && null === $value && ! in_array( $kind, array( 'lead', 'desc' ), true ) ) {
		$status = 'missing';
	}
	// A published answer that is too short to count opens with its own text,
	// so the person can lengthen it instead of starting over.
	$short = false;
	if ( 'lead' === $kind && 'ready' === $status && null === $value ) {
		$now = genscore_fix_get( $id, 'lead' );
		if ( '' !== $now ) {
			$value = $now;
			$short = true;
		}
	}
	$path = 0 === $id ? '/' : (string) wp_parse_url( get_permalink( $id ), PHP_URL_PATH );
	return array(
		'id'     => $id,
		'type'   => 0 === $id ? 'page' : get_post_type( $id ),
		'title'  => 0 === $id ? __( 'Portada', 'genscore' ) : genscore_post_title( $id ),
		'path'   => rawurldecode( $path ),
		'url'    => genscore_page_url( $id ),
		'status' => $status,
		'note'   => 'missing' === $status ? genscore_fix_missing_note( $kind, $id ) : '',
		'value'  => null === $value ? '' : (string) $value,
		'live'   => $live,
		'short'  => $short,
	);
}

/* ------------------------------------------------------------------ */
/* AJAX                                                               */
/* ------------------------------------------------------------------ */

/**
 * The kind sent by the screen, checked against the fixed list.
 *
 * @param string $raw Raw.
 * @return string
 */
function genscore_fix_kind_arg( $raw ) {
	$kind = sanitize_key( $raw );
	if ( ! isset( genscore_fix_kinds()[ $kind ] ) ) {
		wp_send_json_error( array( 'message' => __( 'Arreglo desconocido.', 'genscore' ) ), 400 );
	}
	$ok = genscore_fix_available( $kind );
	if ( true !== $ok ) {
		wp_send_json_error( array( 'message' => $ok ), 400 );
	}
	return $kind;
}

/**
 * Lists the pages of a fix: counts per type, every id that would be
 * published (for «Seleccionar todas»), and one page of rows with their
 * proposals.
 */
function genscore_ajax_fix_list() {
	check_ajax_referer( 'genscore', 'nonce' );
	genscore_ajax_guard();
	$kind   = genscore_fix_kind_arg( isset( $_POST['kind'] ) ? wp_unslash( $_POST['kind'] ) : '' ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- checked against a fixed list.
	$type   = isset( $_POST['type'] ) ? sanitize_key( wp_unslash( $_POST['type'] ) ) : 'all';
	$q      = isset( $_POST['q'] ) ? mb_substr( sanitize_text_field( wp_unslash( $_POST['q'] ) ), 0, 80 ) : '';
	$offset = isset( $_POST['offset'] ) ? absint( $_POST['offset'] ) : 0;
	$types  = array_values( array_filter( genscore_fix_kinds()[ $kind ]['types'], 'post_type_exists' ) );

	$by     = array();
	$counts = array( 'all' => 0 );
	foreach ( $types as $t ) {
		$by[ $t ] = genscore_fix_query( $t, $q );
		$counts[ $t ] = count( $by[ $t ] );
	}
	$home = genscore_fix_has_home_row( $kind, $q );
	if ( $home ) {
		$counts['page'] = ( isset( $counts['page'] ) ? $counts['page'] : 0 ) + 1;
	}
	$shop = genscore_fix_shop_row( $kind, $q );
	if ( $shop ) {
		$counts['page'] = ( isset( $counts['page'] ) ? $counts['page'] : 0 ) + 1;
	}
	$counts['all'] = array_sum( array_diff_key( $counts, array( 'all' => 1 ) ) );

	$ids = array();
	if ( $home && in_array( $type, array( 'all', 'page' ), true ) ) {
		$ids[] = 0;
	}
	if ( $shop && in_array( $type, array( 'all', 'page' ), true ) ) {
		$ids[] = $shop;
	}
	foreach ( $types as $t ) {
		if ( 'all' === $type || $type === $t ) {
			$ids = array_merge( $ids, $by[ $t ] );
		}
	}
	$ids = array_slice( $ids, 0, GENSCORE_FIX_MAX );
	if ( $ids ) {
		_prime_post_caches( array_filter( $ids ), false, true );
	}
	$ready = array();
	foreach ( $ids as $id ) {
		if ( 'ready' === genscore_fix_status( $kind, $id ) && genscore_fix_has_data( $kind, $id ) ) {
			$ready[] = $id;
		}
	}
	$items = array();
	foreach ( array_slice( $ids, $offset, GENSCORE_FIX_PAGE ) as $id ) {
		$items[] = genscore_fix_row( $kind, $id );
	}
	wp_send_json_success(
		array(
			'counts' => $counts,
			'total'  => count( $ids ),
			'ready'  => $ready,
			'items'  => $items,
			'offset' => $offset,
			'more'   => $offset + GENSCORE_FIX_PAGE < count( $ids ),
		)
	);
}
add_action( 'wp_ajax_genscore_fix_list', 'genscore_ajax_fix_list' );

/**
 * Whether one id may receive this fix: the home row, or a public post of
 * the right type the person can edit.
 *
 * @param string $kind Kind.
 * @param int    $id   Id.
 * @return bool
 */
function genscore_fix_can_publish( $kind, $id ) {
	if ( 0 === $id ) {
		return genscore_fix_has_home_row( $kind, '' );
	}
	if ( $id === genscore_fix_shop_row( $kind, '' ) ) {
		return current_user_can( 'edit_post', $id );
	}
	$c = genscore_review_choice( $id );
	return $c && in_array( $c['type'], genscore_fix_kinds()[ $kind ]['types'], true ) && current_user_can( 'edit_post', $id ) && ! in_array( $id, genscore_fix_skipped_pages(), true );
}

/**
 * Publishes a fix on up to GENSCORE_FIX_CHUNK pages: the person's edited
 * value when there is one, the proposal otherwise. Everything it replaces is
 * kept in the batch, so «Deshacer» puts it back.
 */
function genscore_ajax_fix_publish() {
	check_ajax_referer( 'genscore', 'nonce' );
	genscore_ajax_guard();
	$kind  = genscore_fix_kind_arg( isset( $_POST['kind'] ) ? wp_unslash( $_POST['kind'] ) : '' ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- checked against a fixed list.
	$ids   = isset( $_POST['ids'] ) && is_array( $_POST['ids'] ) ? array_slice( array_map( 'intval', wp_unslash( $_POST['ids'] ) ), 0, GENSCORE_FIX_CHUNK ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- cast to integers.
	$edits = isset( $_POST['edits'] ) ? json_decode( wp_unslash( $_POST['edits'] ), true ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- every value goes through genscore_fix_clean().
	$edits = is_array( $edits ) ? $edits : array();
	$batch = isset( $_POST['batch'] ) ? sanitize_key( wp_unslash( $_POST['batch'] ) ) : '';
	if ( ! preg_match( '/^[a-z0-9]{12}$/', $batch ) ) {
		wp_send_json_error( null, 400 );
	}

	$all = get_option( GENSCORE_BATCHES_OPTION, array() );
	$all = is_array( $all ) ? $all : array();
	$rec = isset( $all[ $batch ] ) && $all[ $batch ]['kind'] === $kind ? $all[ $batch ] : array( 'kind' => $kind, 'at' => time(), 'ids' => array(), 'prev' => array() );

	if ( 'returns' === $kind && isset( $_POST['days'], $_POST['country'] ) ) {
		$days    = max( 1, min( 365, absint( $_POST['days'] ) ) );
		$country = strtoupper( sanitize_key( wp_unslash( $_POST['country'] ) ) );
		if ( ! preg_match( '/^[A-Z]{2}$/', $country ) ) {
			wp_send_json_error( array( 'message' => __( 'El país tiene que ir en dos letras, como ES.', 'genscore' ) ), 400 );
		}
		if ( ! isset( $rec['returns_prev'] ) ) {
			$rec['returns_prev'] = get_option( GENSCORE_RETURNS_OPTION, array() );
		}
		update_option( GENSCORE_RETURNS_OPTION, array( 'days' => $days, 'country' => $country ), false );
	}

	$done    = array();
	$skipped = array();
	foreach ( $ids as $id ) {
		if ( $id < 0 || ! genscore_fix_can_publish( $kind, $id ) ) {
			$skipped[] = array( 'id' => $id, 'why' => __( 'No se puede publicar en esta página', 'genscore' ) );
			continue;
		}
		$typed = isset( $edits[ (string) $id ] ) && is_string( $edits[ (string) $id ] ) ? $edits[ (string) $id ] : null;
		$value = null !== $typed ? genscore_fix_clean( $kind, $typed ) : genscore_fix_propose( $kind, $id );
		if ( in_array( $kind, array( 'ld', 'product' ), true ) && null === $typed && null !== $value ) {
			$value = genscore_clean_jsonld( $value );
		}
		if ( 'fresh' === $kind || 'returns' === $kind ) {
			$value = null === genscore_fix_propose( $kind, $id ) ? null : '1';
		}
		if ( 'product' === $kind && genscore_shop_page_id() === $id ) {
			$value = genscore_fix_has_data( $kind, $id ) ? GENSCORE_SHOP_LIVE : null;
		}
		if ( null === $value || '' === $value ) {
			$skipped[] = array( 'id' => $id, 'why' => null !== $typed ? __( 'Lo que has escrito no es válido', 'genscore' ) : genscore_fix_missing_note( $kind, $id ) );
			continue;
		}
		$prev = genscore_fix_write( $kind, $id, $value );
		if ( ! isset( $rec['prev'][ $id ] ) ) {
			$rec['prev'][ $id ] = $prev;
			$rec['ids'][]       = $id;
		}
		genscore_forget_page_score( 0 === $id ? (int) get_option( 'page_on_front' ) : $id );
		if ( 0 === $id ) {
			$scores = genscore_page_scores();
			unset( $scores[0] );
			update_option( GENSCORE_SCORES_OPTION, $scores, false );
		}
		$done[] = $id;
	}

	$all[ $batch ] = $rec;
	if ( count( $all ) > 20 ) {
		$all = array_slice( $all, -20, null, true );
	}
	update_option( GENSCORE_BATCHES_OPTION, $all, false );
	wp_send_json_success( array( 'done' => $done, 'skipped' => $skipped, 'batches' => genscore_fix_batches_summary() ) );
}
add_action( 'wp_ajax_genscore_fix_publish', 'genscore_ajax_fix_publish' );

/**
 * Puts back what a publish replaced.
 */
function genscore_ajax_fix_undo() {
	check_ajax_referer( 'genscore', 'nonce' );
	genscore_ajax_guard();
	$batch = isset( $_POST['batch'] ) ? sanitize_key( wp_unslash( $_POST['batch'] ) ) : '';
	$all   = get_option( GENSCORE_BATCHES_OPTION, array() );
	if ( ! is_array( $all ) || ! isset( $all[ $batch ] ) ) {
		wp_send_json_error( array( 'message' => __( 'Ya no se puede deshacer.', 'genscore' ) ), 400 );
	}
	$rec = $all[ $batch ];
	foreach ( $rec['prev'] as $id => $p ) {
		$id = (int) $id;
		if ( 0 !== $id && ! current_user_can( 'edit_post', $id ) ) {
			continue;
		}
		if ( 'm' === $p[0] && $id ) {
			if ( '' === $p[2] ) {
				delete_post_meta( $id, $p[1] );
			} else {
				update_post_meta( $id, $p[1], wp_slash( $p[2] ) );
			}
			clean_post_cache( $id );
		} elseif ( 'g' === $p[0] && isset( GENSCORE_META[ $p[1] ] ) ) {
			genscore_fix_set( $id, $p[1], (string) $p[2] );
		}
		genscore_forget_page_score( 0 === $id ? (int) get_option( 'page_on_front' ) : $id );
	}
	if ( isset( $rec['returns_prev'] ) ) {
		update_option( GENSCORE_RETURNS_OPTION, $rec['returns_prev'], false );
	}
	if ( isset( $rec['prev'][0] ) ) {
		$scores = genscore_page_scores();
		unset( $scores[0] );
		update_option( GENSCORE_SCORES_OPTION, $scores, false );
	}
	unset( $all[ $batch ] );
	update_option( GENSCORE_BATCHES_OPTION, $all, false );
	wp_send_json_success( array( 'batches' => genscore_fix_batches_summary() ) );
}
add_action( 'wp_ajax_genscore_fix_undo', 'genscore_ajax_fix_undo' );

/**
 * What the screen shows of the publishes that can still be undone, newest
 * first.
 *
 * @return array[]
 */
function genscore_fix_batches_summary() {
	$all = get_option( GENSCORE_BATCHES_OPTION, array() );
	$out = array();
	foreach ( is_array( $all ) ? $all : array() as $id => $b ) {
		if ( ! empty( $b['ids'] ) ) {
			$out[] = array( 'id' => (string) $id, 'kind' => $b['kind'], 'n' => count( $b['ids'] ), 'at' => (int) $b['at'] );
		}
	}
	return array_reverse( $out );
}

/**
 * What the screen needs to offer the fixes.
 *
 * @return array
 */
function genscore_fix_screen_data() {
	$avail = array();
	foreach ( array_keys( genscore_fix_kinds() ) as $k ) {
		$a           = genscore_fix_available( $k );
		$avail[ $k ] = true === $a ? true : $a;
	}
	$r   = get_option( GENSCORE_RETURNS_OPTION, array() );
	$seo = genscore_seo_plugin();
	return array(
		'available' => $avail,
		'seo'       => $seo ? $seo['name'] : null,
		'returns'   => is_array( $r ) && ! empty( $r['days'] ) ? $r : array( 'days' => 30, 'country' => 'ES' ),
		'returnsSet' => is_array( $r ) && ! empty( $r['days'] ),
		'batches'   => genscore_fix_batches_summary(),
		'chunk'     => GENSCORE_FIX_CHUNK,
	);
}

/**
 * A box in the editor that says what GenScore published on this page, so
 * nothing it adds is invisible.
 *
 * @param string  $post_type Post type.
 * @param WP_Post $post      Post.
 */
function genscore_fix_meta_box( $post_type, $post ) {
	if ( ! in_array( $post_type, array( 'page', 'post', 'product' ), true ) || ! $post instanceof WP_Post ) {
		return;
	}
	foreach ( GENSCORE_META as $key ) {
		if ( '' !== (string) get_post_meta( $post->ID, $key, true ) ) {
			add_meta_box( 'genscore-fixes', __( 'Publicado por GenScore', 'genscore' ), 'genscore_render_fix_meta_box', $post_type, 'side', 'low' );
			return;
		}
	}
}
add_action( 'add_meta_boxes', 'genscore_fix_meta_box', 10, 2 );

/**
 * The editor box.
 *
 * @param WP_Post $post Post.
 */
function genscore_render_fix_meta_box( $post ) {
	$names = array(
		'jsonld'    => __( 'Datos estructurados (JSON-LD)', 'genscore' ),
		'desc'      => __( 'Descripción', 'genscore' ),
		'title'     => __( 'Título', 'genscore' ),
		'canonical' => __( 'URL canónica', 'genscore' ),
		'fresh'     => __( 'Fecha de actualización visible', 'genscore' ),
		'returns'   => __( 'Política de devoluciones', 'genscore' ),
		'lead'      => __( 'Respuesta al principio', 'genscore' ),
	);
	echo '<ul style="margin:0">';
	foreach ( GENSCORE_META as $field => $key ) {
		$v = (string) get_post_meta( $post->ID, $key, true );
		if ( '' === $v ) {
			continue;
		}
		echo '<li><strong>' . esc_html( $names[ $field ] ) . '</strong>';
		if ( in_array( $field, array( 'desc', 'title', 'canonical' ), true ) ) {
			echo '<br><span style="color:#50575e">' . esc_html( $v ) . '</span>';
		}
		echo '</li>';
	}
	echo '</ul><p style="margin-bottom:0"><a href="' . esc_url( admin_url( 'admin.php?page=genscore' ) ) . '">' . esc_html__( 'Cambiarlo o deshacerlo en GenScore', 'genscore' ) . '</a></p>';
}
