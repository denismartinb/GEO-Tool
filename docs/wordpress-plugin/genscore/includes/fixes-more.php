<?php
/**
 * One-click fixes added in 1.4.0 (WP-PLUGIN-4): section headings, a single
 * <h1>, Open Graph, hreflang, shipping, ratings, product identifiers and the
 * questions a GenScore recommendation asks a page to answer.
 *
 * Same rules as the first fixes: every proposal comes from data WordPress or
 * WooCommerce already has, or the person writes it; the post content is never
 * rewritten (headings and questions are served by filters); every publish
 * keeps the previous value so it can be undone.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/** Shipping data shared by the products that publish it. */
const GENSCORE_SHIPPING_OPTION = 'genscore_shipping';

/** Headings proposed or typed for one page, at most. */
const GENSCORE_H2_MAX = 6;

/** Questions a page answers through «Añadir preguntas a la página», at most. */
const GENSCORE_FAQ_MAX = 8;

/**
 * The 1.4.0 kinds: post types each one applies to. None of them is part of
 * the page review (score.js), so their status is worked out here.
 *
 * @return array
 */
function genscore_more_kinds() {
	return array(
		'h2'       => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array() ),
		'h1'       => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array() ),
		'og'       => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array() ),
		'hreflang' => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array() ),
		'shipping' => array( 'types' => array( 'product' ), 'ids' => array() ),
		'rating'   => array( 'types' => array( 'product' ), 'ids' => array() ),
		'gtin'     => array( 'types' => array( 'product' ), 'ids' => array() ),
		'faq'      => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array() ),
	);
}

/**
 * Whether a kind is one of these.
 *
 * @param string $kind Kind.
 * @return bool
 */
function genscore_is_more_kind( $kind ) {
	return isset( genscore_more_kinds()[ $kind ] );
}

/**
 * The plugin that already handles languages, if any.
 *
 * @return string|null
 */
function genscore_multilingual_plugin() {
	if ( defined( 'ICL_SITEPRESS_VERSION' ) ) {
		return 'WPML';
	}
	if ( function_exists( 'pll_the_languages' ) ) {
		return 'Polylang';
	}
	if ( defined( 'TRP_PLUGIN_VERSION' ) ) {
		return 'TranslatePress';
	}
	return null;
}

/**
 * Whether one of these kinds can be published here, and if not, why.
 *
 * @param string $kind Kind.
 * @return string|true
 */
function genscore_more_available( $kind ) {
	$woo = class_exists( 'WooCommerce' ) && function_exists( 'wc_get_product' );
	if ( in_array( $kind, array( 'shipping', 'rating', 'gtin' ), true ) && ! $woo ) {
		return __( 'Hace falta WooCommerce.', 'genscore' );
	}
	if ( 'og' === $kind && genscore_seo_plugin() ) {
		$seo = genscore_seo_plugin();
		/* translators: %s: SEO plugin name. */
		return sprintf( __( '%s ya publica Open Graph: actívalo en sus ajustes de redes sociales.', 'genscore' ), $seo['name'] );
	}
	if ( 'hreflang' === $kind && genscore_multilingual_plugin() ) {
		/* translators: %s: multilingual plugin name. */
		return sprintf( __( '%s ya gestiona los idiomas de tu web: revisa sus ajustes.', 'genscore' ), genscore_multilingual_plugin() );
	}
	return true;
}

/* ------------------------------------------------------------------ */
/* Section headings                                                   */
/* ------------------------------------------------------------------ */

/**
 * The page's stored content. Block markup already holds its headings and
 * paragraphs as HTML; rendering every block for a list of hundreds of pages
 * would be too slow.
 *
 * @param int $id Post id.
 * @return string
 */
function genscore_raw_content( $id ) {
	$post = $id ? get_post( $id ) : null;
	return $post ? (string) $post->post_content : '';
}

/**
 * <h2> headings already in the content.
 *
 * @param string $html HTML.
 * @return int
 */
function genscore_h2_count( $html ) {
	return (int) preg_match_all( '#<h2[\s>]#i', (string) $html );
}

/**
 * Paragraphs that are only a short line in bold: the page's own headings,
 * written as text instead of as headings.
 *
 * @param string $html HTML.
 * @return string[] Their text.
 */
function genscore_bold_lines( $html ) {
	$out = array();
	if ( preg_match_all( '#<p[^>]*>\s*<(strong|b)>([^<]{3,80})</\1>\s*:?\s*</p>#i', (string) $html, $m ) ) {
		foreach ( $m[2] as $t ) {
			$t = trim( html_entity_decode( $t, ENT_QUOTES, 'UTF-8' ) );
			if ( '' !== $t && ! preg_match( '/[.,;]$/u', $t ) && ! in_array( $t, $out, true ) ) {
				$out[] = $t;
			}
		}
	}
	return array_slice( $out, 0, GENSCORE_H2_MAX );
}

/**
 * Cleans typed headings: one per line, 2 to 80 characters, as many as the
 * page needs to reach two.
 *
 * @param string $value Text.
 * @param int    $id    Post id.
 * @return string|null
 */
function genscore_clean_h2( $value, $id ) {
	$lines = array();
	foreach ( preg_split( '/\r\n|\r|\n/', (string) $value ) as $l ) {
		$l = sanitize_text_field( $l );
		if ( mb_strlen( $l ) >= 2 && ! in_array( $l, $lines, true ) ) {
			$lines[] = mb_substr( $l, 0, 80 );
		}
	}
	$lines = array_slice( $lines, 0, GENSCORE_H2_MAX );
	$need  = max( 1, 2 - genscore_h2_count( genscore_raw_content( $id ) ) );
	return count( $lines ) >= $need ? implode( "\n", $lines ) : null;
}

/**
 * Serves the stored headings: a bold line with the same text becomes an
 * <h2>; the rest go before paragraphs spread through the page.
 *
 * @param string $html  Content.
 * @param string $value Stored headings, one per line.
 * @return string
 */
function genscore_apply_h2( $html, $value ) {
	$lines = array_values( array_filter( array_map( 'trim', explode( "\n", (string) $value ) ) ) );
	$rest  = array();
	foreach ( $lines as $l ) {
		$re   = '#<p[^>]*>\s*<(strong|b)>\s*' . preg_quote( esc_html( $l ), '#' ) . '\s*</\1>\s*:?\s*</p>#iu';
		$new  = preg_replace( $re, '<h2 class="wp-block-heading genscore-h2">' . esc_html( $l ) . '</h2>', $html, 1, $n );
		$html = null === $new ? $html : $new;
		if ( ! $n ) {
			$rest[] = $l;
		}
	}
	if ( ! $rest ) {
		return $html;
	}
	preg_match_all( '#<p[\s>]#i', $html, $m, PREG_OFFSET_CAPTURE );
	$starts = wp_list_pluck( $m[0], 1 );
	$p      = count( $starts );
	$n      = count( $rest );
	if ( $p < 2 ) {
		// Too little text to place headings inside it: they go at the end, never invented between words.
		foreach ( $rest as $l ) {
			$html .= '<h2 class="wp-block-heading genscore-h2">' . esc_html( $l ) . '</h2>';
		}
		return $html;
	}
	$at = array();
	for ( $k = 0; $k < $n; $k++ ) {
		$at[] = max( 1, min( $p - 1, (int) floor( ( $k + 1 ) * $p / ( $n + 1 ) ) ) );
	}
	for ( $k = $n - 1; $k >= 0; $k-- ) {
		$pos  = $starts[ $at[ $k ] ];
		$html = substr( $html, 0, $pos ) . '<h2 class="wp-block-heading genscore-h2">' . esc_html( $rest[ $k ] ) . '</h2>' . substr( $html, $pos );
	}
	return $html;
}

/* ------------------------------------------------------------------ */
/* Shipping, ratings and identifiers                                  */
/* ------------------------------------------------------------------ */

/**
 * What WooCommerce knows about shipping to the store's own country: the flat
 * rate cost and the free-shipping threshold of the zone that covers it.
 *
 * @return array{country: string, cost: string, free: string}
 */
function genscore_wc_shipping_defaults() {
	$out = array( 'country' => 'ES', 'cost' => '', 'free' => '' );
	if ( ! function_exists( 'WC' ) || ! class_exists( 'WC_Shipping_Zones' ) ) {
		return $out;
	}
	$country = WC()->countries ? (string) WC()->countries->get_base_country() : '';
	if ( preg_match( '/^[A-Z]{2}$/', $country ) ) {
		$out['country'] = $country;
	}
	$methods = array();
	foreach ( WC_Shipping_Zones::get_zones() as $zone ) {
		foreach ( (array) ( $zone['zone_locations'] ?? array() ) as $loc ) {
			if ( isset( $loc->type, $loc->code ) && ( ( 'country' === $loc->type && $loc->code === $out['country'] ) || ( 'state' === $loc->type && 0 === strpos( $loc->code, $out['country'] . ':' ) ) ) ) {
				$methods = (array) ( $zone['shipping_methods'] ?? array() );
				break 2;
			}
		}
	}
	if ( ! $methods && class_exists( 'WC_Shipping_Zone' ) ) {
		$rest    = new WC_Shipping_Zone( 0 );
		$methods = $rest->get_shipping_methods( true );
	}
	foreach ( $methods as $m ) {
		if ( ! is_object( $m ) || ( isset( $m->enabled ) && 'yes' !== $m->enabled ) ) {
			continue;
		}
		if ( 'flat_rate' === $m->id && '' === $out['cost'] ) {
			$cost = trim( (string) $m->get_option( 'cost' ) );
			// A formula ([qty] * 2) has no single cost: the person writes it.
			if ( is_numeric( str_replace( ',', '.', $cost ) ) ) {
				$out['cost'] = (string) (float) str_replace( ',', '.', $cost );
			}
		}
		if ( 'free_shipping' === $m->id && '' === $out['free'] ) {
			$min = trim( (string) $m->get_option( 'min_amount' ) );
			$out['free'] = is_numeric( str_replace( ',', '.', $min ) ) ? (string) (float) str_replace( ',', '.', $min ) : '0';
		}
	}
	return $out;
}

/**
 * The shipping settings in use: what the person saved, or WooCommerce's.
 *
 * @return array
 */
function genscore_shipping_settings() {
	$saved = get_option( GENSCORE_SHIPPING_OPTION, array() );
	if ( is_array( $saved ) && isset( $saved['country'], $saved['cost'] ) ) {
		return $saved;
	}
	return array_merge( genscore_wc_shipping_defaults(), array( 'hmin' => 0, 'hmax' => 1, 'tmin' => 1, 'tmax' => 3 ) );
}

/**
 * Cleans the shipping settings sent by the screen.
 *
 * @param array $raw Raw values.
 * @return array|null
 */
function genscore_clean_shipping( $raw ) {
	$num = function ( $v ) {
		$v = str_replace( ',', '.', trim( (string) $v ) );
		return '' === $v ? '' : ( is_numeric( $v ) && (float) $v >= 0 && (float) $v < 100000 ? (string) round( (float) $v, 2 ) : null );
	};
	$country = strtoupper( sanitize_key( (string) ( $raw['country'] ?? '' ) ) );
	$cost    = $num( $raw['cost'] ?? '' );
	$free    = $num( $raw['free'] ?? '' );
	$days    = array();
	foreach ( array( 'hmin', 'hmax', 'tmin', 'tmax' ) as $k ) {
		$days[ $k ] = isset( $raw[ $k ] ) && '' !== (string) $raw[ $k ] ? absint( $raw[ $k ] ) : -1;
	}
	if ( ! preg_match( '/^[A-Z]{2}$/', $country ) || null === $cost || '' === $cost || null === $free ) {
		return null;
	}
	if ( min( $days ) < 0 || max( $days ) > 60 || $days['hmin'] > $days['hmax'] || $days['tmin'] > $days['tmax'] ) {
		return null;
	}
	return array_merge( array( 'country' => $country, 'cost' => $cost, 'free' => $free ), $days );
}

/**
 * OfferShippingDetails for one product at today's price.
 *
 * @param int $id Product id.
 * @return array|null
 */
function genscore_shipping_details( $id ) {
	$s       = get_option( GENSCORE_SHIPPING_OPTION, array() );
	$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
	if ( ! is_array( $s ) || ! isset( $s['cost'], $s['country'] ) || ! $product || $product->is_virtual() ) {
		return null;
	}
	$rate = (float) $s['cost'];
	if ( '' !== (string) $s['free'] && '' !== (string) $product->get_price() && (float) $product->get_price() >= (float) $s['free'] ) {
		$rate = 0.0;
	}
	$q = function ( $min, $max ) {
		return array( '@type' => 'QuantitativeValue', 'minValue' => (int) $min, 'maxValue' => (int) $max, 'unitCode' => 'DAY' );
	};
	return array(
		'@type'               => 'OfferShippingDetails',
		'shippingRate'        => array( '@type' => 'MonetaryAmount', 'value' => $rate, 'currency' => get_woocommerce_currency() ),
		'shippingDestination' => array( '@type' => 'DefinedRegion', 'addressCountry' => $s['country'] ),
		'deliveryTime'        => array(
			'@type'        => 'ShippingDeliveryTime',
			'handlingTime' => $q( $s['hmin'], $s['hmax'] ),
			'transitTime'  => $q( $s['tmin'], $s['tmax'] ),
		),
	);
}

/**
 * Adds a value to every offer of a Product block.
 *
 * @param array  $data  Product data.
 * @param string $key   Offer key.
 * @param mixed  $value Value.
 * @return array
 */
function genscore_offer_set( $data, $key, $value ) {
	if ( ! isset( $data['offers'] ) || ! is_array( $data['offers'] ) ) {
		return $data;
	}
	if ( array_values( $data['offers'] ) === $data['offers'] ) {
		foreach ( $data['offers'] as $i => $offer ) {
			if ( is_array( $offer ) ) {
				$data['offers'][ $i ][ $key ] = $value;
			}
		}
	} else {
		$data['offers'][ $key ] = $value;
	}
	return $data;
}

/**
 * The product's real rating, or null without reviews.
 *
 * @param int $id Product id.
 * @return array|null
 */
function genscore_rating_data( $id ) {
	$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
	if ( ! $product || (int) $product->get_review_count() < 1 || (float) $product->get_average_rating() <= 0 ) {
		return null;
	}
	return array(
		'@type'       => 'AggregateRating',
		'ratingValue' => round( (float) $product->get_average_rating(), 2 ),
		'reviewCount' => (int) $product->get_review_count(),
		'bestRating'  => 5,
		'worstRating' => 1,
	);
}

/**
 * The identifier WooCommerce already has for a product (its GTIN field, 9.2+).
 *
 * @param int $id Product id.
 * @return string
 */
function genscore_wc_gtin( $id ) {
	$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
	return $product && method_exists( $product, 'get_global_unique_id' ) ? (string) $product->get_global_unique_id() : '';
}

/**
 * A valid GTIN (8, 12, 13 or 14 digits with a correct check digit), or null.
 *
 * @param string $value Typed value.
 * @return string|null
 */
function genscore_clean_gtin( $value ) {
	$d = preg_replace( '/[\s-]/', '', (string) $value );
	if ( ! preg_match( '/^(\d{8}|\d{12,14})$/', $d ) ) {
		return null;
	}
	$sum    = 0;
	$digits = strrev( substr( $d, 0, -1 ) );
	for ( $i = 0, $n = strlen( $digits ); $i < $n; $i++ ) {
		$sum += (int) $digits[ $i ] * ( 0 === $i % 2 ? 3 : 1 );
	}
	return ( 10 - $sum % 10 ) % 10 === (int) substr( $d, -1 ) ? $d : null;
}

/**
 * Shipping, rating and identifier, added to a product's block when published.
 *
 * @param array $data Product data.
 * @param int   $id   Product id.
 * @return array
 */
function genscore_with_more( $data, $id ) {
	if ( genscore_fix_get( $id, 'shipping' ) ) {
		$ship = genscore_shipping_details( $id );
		if ( $ship ) {
			$data = genscore_offer_set( $data, 'shippingDetails', $ship );
		}
	}
	if ( genscore_fix_get( $id, 'rating' ) && empty( $data['aggregateRating'] ) ) {
		$rating = genscore_rating_data( $id );
		if ( $rating ) {
			$data['aggregateRating'] = $rating;
		}
	}
	$gtin = genscore_fix_get( $id, 'gtin' );
	$gtin = '' !== $gtin ? $gtin : genscore_wc_gtin( $id );
	if ( '' !== $gtin && empty( $data['gtin'] ) ) {
		$data['gtin'] = $gtin;
	}
	return genscore_with_cancel( $data, $id );
}

/* ------------------------------------------------------------------ */
/* Questions answered on the page                                     */
/* ------------------------------------------------------------------ */

/**
 * Cleans the questions and answers the person wrote: every pair needs both.
 *
 * @param string $value JSON [{q, a}].
 * @return string|null
 */
function genscore_clean_faq( $value ) {
	$rows = json_decode( (string) $value, true );
	if ( ! is_array( $rows ) ) {
		return null;
	}
	$out = array();
	foreach ( array_slice( $rows, 0, GENSCORE_FAQ_MAX ) as $r ) {
		$q = is_array( $r ) ? sanitize_text_field( (string) ( $r['q'] ?? '' ) ) : '';
		$a = is_array( $r ) ? sanitize_textarea_field( (string) ( $r['a'] ?? '' ) ) : '';
		if ( '' !== $q && genscore_word_count( $a ) >= 5 ) {
			$out[] = array( 'q' => mb_substr( $q, 0, 200 ), 'a' => mb_substr( $a, 0, 1500 ) );
		}
	}
	return $out ? wp_json_encode( $out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) : null;
}

/**
 * The stored pairs of a page.
 *
 * @param int $id Post id.
 * @return array[]
 */
function genscore_faq_pairs( $id ) {
	$rows = json_decode( genscore_fix_get( $id, 'faq' ), true );
	return is_array( $rows ) ? $rows : array();
}

/* ------------------------------------------------------------------ */
/* Status, proposal and note for the list                              */
/* ------------------------------------------------------------------ */

/**
 * ready, has, na or missing for one of these kinds.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, or 0.
 * @return string
 */
function genscore_more_status( $kind, $id ) {
	$now = genscore_fix_get( $id, $kind );
	switch ( $kind ) {
		case 'h2':
			return '' !== $now || genscore_h2_count( genscore_raw_content( $id ) ) >= 2 ? 'has' : 'ready';
		case 'h1':
			return '' === $now && preg_match( '#<h1[\s>]#i', genscore_raw_content( $id ) ) ? 'ready' : 'has';
		case 'og':
		case 'hreflang':
		case 'shipping':
			if ( 'shipping' === $kind ) {
				$p = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
				if ( $p && $p->is_virtual() ) {
					return 'na';
				}
			}
			return '' !== $now ? 'has' : 'ready';
		case 'rating':
			if ( '' !== $now ) {
				return 'has';
			}
			return genscore_rating_data( $id ) ? 'ready' : 'na';
		case 'gtin':
			return '' !== $now || '' !== genscore_wc_gtin( $id ) ? 'has' : 'ready';
		case 'faq':
			return '' !== $now ? 'has' : 'ready';
	}
	return 'ready';
}

/**
 * The text the person reviews for one of these kinds.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, or 0.
 * @return string|null
 */
function genscore_more_propose( $kind, $id ) {
	switch ( $kind ) {
		case 'h2':
			$lines = genscore_bold_lines( genscore_raw_content( $id ) );
			return count( $lines ) + genscore_h2_count( genscore_raw_content( $id ) ) >= 2 ? implode( "\n", $lines ) : null;
		case 'h1':
			if ( ! preg_match_all( '#<h1[^>]*>(.*?)</h1>#is', genscore_raw_content( $id ), $m ) ) {
				return null;
			}
			return implode( "\n", array_map( 'genscore_plain_text', $m[1] ) );
		case 'og':
			return 0 === $id ? trim( html_entity_decode( get_bloginfo( 'name' ), ENT_QUOTES, 'UTF-8' ) ) : genscore_post_title( $id );
		case 'hreflang':
			return 'hreflang="' . get_bloginfo( 'language' ) . '" y x-default → ' . genscore_page_url( $id );
		case 'shipping':
			return '1'; // The settings above the list say what is published.
		case 'rating':
			$r = genscore_rating_data( $id );
			/* translators: 1: average rating, 2: number of reviews. */
			return $r ? sprintf( __( '%1$s de 5 · %2$d reseñas', 'genscore' ), number_format_i18n( $r['ratingValue'], 1 ), $r['reviewCount'] ) : null;
		case 'gtin':
		case 'faq':
			return null; // The person writes it.
	}
	return null;
}

/**
 * Whether one of these kinds has what it needs on a page.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id, or 0.
 * @return bool
 */
function genscore_more_has_data( $kind, $id ) {
	if ( in_array( $kind, array( 'h2', 'gtin', 'faq' ), true ) ) {
		return null !== genscore_more_propose( $kind, $id ); // Without a proposal the person has to write it first.
	}
	if ( 'rating' === $kind ) {
		return null !== genscore_rating_data( $id );
	}
	return true;
}

/**
 * Why a page has no proposal.
 *
 * @param string $kind Kind.
 * @return string
 */
function genscore_more_missing_note( $kind ) {
	if ( 'rating' === $kind ) {
		return __( 'Sin reseñas', 'genscore' );
	}
	return __( 'Sin datos', 'genscore' );
}

/**
 * Cleans a typed value of one of these kinds.
 *
 * @param string $kind  Kind.
 * @param string $value Value.
 * @param int    $id    Post id.
 * @return string|null
 */
function genscore_more_clean( $kind, $value, $id ) {
	switch ( $kind ) {
		case 'h2':
			return genscore_clean_h2( $value, $id );
		case 'og':
			$v = sanitize_text_field( $value );
			return '' !== $v ? mb_substr( $v, 0, 95 ) : null;
		case 'gtin':
			return genscore_clean_gtin( $value );
		case 'faq':
			return genscore_clean_faq( $value );
	}
	return null; // h1, hreflang, shipping and rating are not typed.
}

/* ------------------------------------------------------------------ */
/* Front end                                                          */
/* ------------------------------------------------------------------ */

/**
 * Headings, a single <h1> and the questions, served over the content. The
 * content stored in the post does not change.
 *
 * @param string $content Content.
 * @return string
 */
function genscore_more_content( $content ) {
	if ( ! is_singular() || ! in_the_loop() || ! is_main_query() ) {
		return $content;
	}
	$id = (int) get_the_ID();
	if ( ! $id || $id !== (int) get_queried_object_id() ) {
		return $content;
	}
	if ( genscore_fix_get( $id, 'h1' ) ) {
		$content = preg_replace( array( '#<h1(\s|>)#i', '#</h1>#i' ), array( '<h2$1', '</h2>' ), $content );
	}
	$h2 = genscore_fix_get( $id, 'h2' );
	if ( '' !== $h2 ) {
		$content = genscore_apply_h2( $content, $h2 );
	}
	$pairs = genscore_faq_pairs( $id );
	if ( $pairs ) {
		$out = '<section class="genscore-faq"><h2 class="wp-block-heading">' . esc_html__( 'Preguntas frecuentes', 'genscore' ) . '</h2>';
		foreach ( $pairs as $p ) {
			$out .= '<h3 class="wp-block-heading">' . esc_html( $p['q'] ) . '</h3>' . wpautop( esc_html( $p['a'] ) );
		}
		$content .= $out . '</section>';
	}
	return $content;
}
add_filter( 'the_content', 'genscore_more_content', 20 );

/**
 * The best image for a page: its featured image, the product's, or the site icon.
 *
 * @param int $id Post id, or 0.
 * @return string
 */
function genscore_page_image( $id ) {
	$img = $id ? get_the_post_thumbnail_url( $id, 'large' ) : '';
	if ( ! $img && $id && function_exists( 'get_custom_logo' ) && has_custom_logo() ) {
		$img = wp_get_attachment_image_url( (int) get_theme_mod( 'custom_logo' ), 'full' );
	}
	if ( ! $img ) {
		$img = get_site_icon_url( 512 );
	}
	return $img ? (string) $img : '';
}

/**
 * The description Open Graph uses: the one GenScore published, the excerpt,
 * or the start of the page, in up to 200 characters. Runs on the front end.
 *
 * @param int $id Post id, or 0.
 * @return string
 */
function genscore_og_description( $id ) {
	$t = genscore_fix_get( $id, 'desc' );
	if ( '' === $t ) {
		$post = $id ? get_post( $id ) : null;
		$t    = $post ? ( '' !== trim( $post->post_excerpt ) ? $post->post_excerpt : wp_trim_words( excerpt_remove_blocks( $post->post_content ), 35, '…' ) ) : get_bloginfo( 'description' );
	}
	$t = trim( preg_replace( '/\s+/u', ' ', html_entity_decode( wp_strip_all_tags( strip_shortcodes( (string) $t ) ), ENT_QUOTES, 'UTF-8' ) ) );
	return mb_strlen( $t ) > 200 ? rtrim( mb_substr( $t, 0, 199 ) ) . '…' : $t;
}

/**
 * Open Graph, hreflang and the questions' FAQPage in <head>.
 */
function genscore_more_head() {
	$id = genscore_fix_current_id();
	if ( null === $id ) {
		return;
	}
	$url = 0 === $id ? home_url( '/' ) : (string) get_permalink( $id );
	if ( is_singular() && $id ) {
		$canon = wp_get_canonical_url( $id );
		$url   = $canon ? $canon : $url;
	}
	$og = genscore_fix_get( $id, 'og' );
	if ( '' !== $og && ! genscore_seo_plugin() ) {
		$type = $id && 'post' === get_post_type( $id ) ? 'article' : ( $id && 'product' === get_post_type( $id ) ? 'product' : 'website' );
		$tags = array(
			'og:type'        => $type,
			'og:title'       => $og,
			'og:description' => genscore_og_description( $id ),
			'og:url'         => $url,
			'og:image'       => genscore_page_image( $id ),
			'og:site_name'   => html_entity_decode( get_bloginfo( 'name' ), ENT_QUOTES, 'UTF-8' ),
			'og:locale'      => get_locale(),
		);
		foreach ( $tags as $p => $v ) {
			if ( '' !== (string) $v ) {
				echo '<meta property="' . esc_attr( $p ) . '" content="' . esc_attr( $v ) . '">' . "\n";
			}
		}
		echo '<meta name="twitter:card" content="' . ( $tags['og:image'] ? 'summary_large_image' : 'summary' ) . '">' . "\n";
	}
	if ( genscore_fix_get( $id, 'hreflang' ) && ! genscore_multilingual_plugin() ) {
		echo '<link rel="alternate" hreflang="' . esc_attr( get_bloginfo( 'language' ) ) . '" href="' . esc_url( $url ) . '">' . "\n";
		echo '<link rel="alternate" hreflang="x-default" href="' . esc_url( $url ) . '">' . "\n";
	}
	$pairs = $id ? genscore_faq_pairs( $id ) : array();
	if ( $pairs && ! genscore_seo_prints_schema() ) {
		$main = array();
		foreach ( $pairs as $p ) {
			$main[] = array( '@type' => 'Question', 'name' => $p['q'], 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => $p['a'] ) );
		}
		genscore_print_jsonld( array( '@context' => 'https://schema.org', '@type' => 'FAQPage', 'url' => $url, 'mainEntity' => $main ) );
	}
}
add_action( 'wp_head', 'genscore_more_head', 6 );
