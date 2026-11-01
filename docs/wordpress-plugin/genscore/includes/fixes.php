<?php
/**
 * One-click fixes: what GenScore proposes for a page, where it is stored and
 * how it reaches the page's HTML.
 *
 * Every proposal is built from data WordPress already has (title, excerpt,
 * permalink, last edit, WooCommerce price and stock). Nothing is invented and
 * no language model is involved. The person reviews it in the GenScore
 * screen; only then is it saved in the page:
 *
 *  - description, title and canonical go to the SEO plugin's own field when
 *    there is one (Yoast, Rank Math, SEOPress), so the person sees them in
 *    the editor as usual, or to GenScore's own field when there is none;
 *  - JSON-LD, the visible update date and the returns policy are GenScore's
 *    own fields, printed by the filters below.
 *
 * The post content is never rewritten, and every publish can be undone
 * (includes/fixes-admin.php keeps the previous values).
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/** GenScore's own fields in a post. */
const GENSCORE_META = array(
	'jsonld'    => '_genscore_jsonld',
	'desc'      => '_genscore_desc',
	'title'     => '_genscore_title',
	'canonical' => '_genscore_canonical',
	'fresh'     => '_genscore_fresh',
	'returns'   => '_genscore_returns',
	'lead'      => '_genscore_lead',
);

/** The same fields for the home page when it is the list of latest posts. */
const GENSCORE_HOME_OPTION = 'genscore_home_fixes';

/** Returns policy shared by the products that publish it. */
const GENSCORE_RETURNS_OPTION = 'genscore_returns';

/** Stored instead of JSON on the shop page: its product list is built live. */
const GENSCORE_SHOP_LIVE = 'live';

/**
 * Where the SEO plugin keeps each field, or null when it has none we can
 * write (All in One SEO keeps them in its own table).
 *
 * @param string $field desc, title or canonical.
 * @return string|null Meta key; '' when no SEO plugin is active.
 */
function genscore_seo_field( $field ) {
	$keys = array(
		'Yoast SEO' => array( 'desc' => '_yoast_wpseo_metadesc', 'title' => '_yoast_wpseo_title', 'canonical' => '_yoast_wpseo_canonical' ),
		'Rank Math' => array( 'desc' => 'rank_math_description', 'title' => 'rank_math_title', 'canonical' => 'rank_math_canonical_url' ),
		'SEOPress'  => array( 'desc' => '_seopress_titles_desc', 'title' => '_seopress_titles_title', 'canonical' => '_seopress_robots_canonical' ),
	);
	$seo = genscore_seo_plugin();
	if ( ! $seo ) {
		return '';
	}
	return isset( $keys[ $seo['name'] ] ) ? $keys[ $seo['name'] ][ $field ] : null;
}

/**
 * Reads one GenScore field. Post id 0 is the home page when it lists the
 * latest posts.
 *
 * @param int    $id    Post id, or 0.
 * @param string $field Key of GENSCORE_META.
 * @return string
 */
function genscore_fix_get( $id, $field ) {
	if ( 0 === (int) $id ) {
		$home = get_option( GENSCORE_HOME_OPTION, array() );
		return is_array( $home ) && isset( $home[ $field ] ) ? (string) $home[ $field ] : '';
	}
	return (string) get_post_meta( (int) $id, GENSCORE_META[ $field ], true );
}

/**
 * Writes (or with '' removes) one GenScore field.
 *
 * @param int    $id    Post id, or 0.
 * @param string $field Key of GENSCORE_META.
 * @param string $value Value.
 */
function genscore_fix_set( $id, $field, $value ) {
	if ( 0 === (int) $id ) {
		$home = get_option( GENSCORE_HOME_OPTION, array() );
		$home = is_array( $home ) ? $home : array();
		if ( '' === $value ) {
			unset( $home[ $field ] );
		} else {
			$home[ $field ] = $value;
		}
		update_option( GENSCORE_HOME_OPTION, $home, false );
		return;
	}
	if ( '' === $value ) {
		delete_post_meta( (int) $id, GENSCORE_META[ $field ] );
	} else {
		update_post_meta( (int) $id, GENSCORE_META[ $field ], wp_slash( $value ) );
	}
}

/**
 * Cleans a JSON-LD block typed or reviewed by the person: it must be valid
 * JSON, an object, about schema.org and with a @type. Returns the canonical
 * JSON to store, or null.
 *
 * @param string $text JSON.
 * @return string|null
 */
function genscore_clean_jsonld( $text ) {
	$data = json_decode( (string) $text, true );
	if ( ! is_array( $data ) || array_values( $data ) === $data || empty( $data['@type'] ) ) {
		return null;
	}
	$context = isset( $data['@context'] ) && is_string( $data['@context'] ) ? $data['@context'] : '';
	if ( ! preg_match( '#^https?://schema\.org/?$#', $context ) ) {
		return null;
	}
	$json = wp_json_encode( $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
	return $json && strlen( $json ) <= 20000 ? $json : null;
}

/**
 * Prints a JSON-LD block. JSON_HEX_TAG keeps any «</script>» in a value from
 * closing the tag.
 *
 * @param array $data Data.
 */
function genscore_print_jsonld( $data ) {
	echo "\n<script type=\"application/ld+json\" class=\"genscore-jsonld\">" . wp_json_encode( $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP ) . "</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON encoded with JSON_HEX_TAG.
}

/**
 * The post the current front-end request is about: the queried post, the
 * static front page, or 0 for a home page that lists the latest posts. Null
 * anywhere else.
 *
 * @return int|null
 */
function genscore_fix_current_id() {
	if ( is_front_page() && is_home() ) {
		return 0;
	}
	// The page that lists the latest posts is not singular either.
	if ( is_home() ) {
		$blog = (int) get_option( 'page_for_posts' );
		return $blog > 0 ? $blog : null;
	}
	// WooCommerce's shop page is an archive, not a singular page.
	if ( function_exists( 'is_shop' ) && function_exists( 'wc_get_page_id' ) && is_shop() ) {
		$shop = (int) wc_get_page_id( 'shop' );
		return $shop > 0 ? $shop : null;
	}
	if ( is_singular() ) {
		$id = (int) get_queried_object_id();
		return $id ? $id : null;
	}
	return null;
}

/**
 * The returns policy as schema.org data, or null when none is set.
 *
 * @return array|null
 */
function genscore_returns_policy() {
	$r = get_option( GENSCORE_RETURNS_OPTION, array() );
	if ( ! is_array( $r ) || empty( $r['days'] ) || empty( $r['country'] ) ) {
		return null;
	}
	return array(
		'@type'                => 'MerchantReturnPolicy',
		'applicableCountry'    => $r['country'],
		'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
		'merchantReturnDays'   => (int) $r['days'],
		'returnMethod'         => 'https://schema.org/ReturnByMail',
	);
}

/**
 * Adds the returns policy to every offer of a Product block.
 *
 * @param array $data Product data.
 * @return array
 */
function genscore_with_returns( $data ) {
	$policy = genscore_returns_policy();
	if ( ! $policy || ! isset( $data['offers'] ) || ! is_array( $data['offers'] ) ) {
		return $data;
	}
	if ( array_values( $data['offers'] ) === $data['offers'] ) {
		foreach ( $data['offers'] as $i => $offer ) {
			if ( is_array( $offer ) ) {
				$data['offers'][ $i ]['hasMerchantReturnPolicy'] = $policy;
			}
		}
	} else {
		$data['offers']['hasMerchantReturnPolicy'] = $policy;
	}
	return $data;
}

/**
 * The WooCommerce shop page id, or 0.
 *
 * @return int
 */
function genscore_shop_page_id() {
	return function_exists( 'wc_get_page_id' ) ? max( 0, (int) wc_get_page_id( 'shop' ) ) : 0;
}

/**
 * The shop page as a list of its products, built from WooCommerce at the
 * moment it is printed, so prices and stock are never out of date. Null when
 * no product has a price.
 *
 * @param bool $returns Add the returns policy to each offer.
 * @return array|null
 */
function genscore_shop_list_data( $returns ) {
	$shop = genscore_shop_page_id();
	if ( ! $shop || ! function_exists( 'wc_get_products' ) ) {
		return null;
	}
	$products = wc_get_products(
		array(
			'status'     => 'publish',
			'visibility' => 'catalog',
			'limit'      => 20,
			'orderby'    => array( 'menu_order' => 'ASC', 'title' => 'ASC' ),
		)
	);
	$items = array();
	foreach ( $products as $product ) {
		$price = (string) $product->get_price();
		if ( '' === $price ) {
			continue;
		}
		$stock = $product->get_stock_status();
		$url   = get_permalink( $product->get_id() );
		$item  = array(
			'@type'  => 'Product',
			'name'   => wp_strip_all_tags( $product->get_name() ),
			'url'    => $url,
			'offers' => array(
				'@type'         => 'Offer',
				'price'         => wc_format_decimal( $price, wc_get_price_decimals() ),
				'priceCurrency' => get_woocommerce_currency(),
				'availability'  => 'https://schema.org/' . ( 'outofstock' === $stock ? 'OutOfStock' : ( 'onbackorder' === $stock ? 'BackOrder' : 'InStock' ) ),
				'url'           => $url,
			),
		);
		if ( $product->get_image_id() ) {
			$item['image'] = wp_get_attachment_url( $product->get_image_id() );
		}
		$items[] = $returns ? genscore_with_returns( $item ) : $item;
	}
	if ( ! $items ) {
		return null;
	}
	return array(
		'@context'        => 'https://schema.org',
		'@type'           => 'ItemList',
		'name'            => wp_strip_all_tags( get_the_title( $shop ) ),
		'url'             => get_permalink( $shop ),
		'numberOfItems'   => count( $items ),
		'itemListElement' => $items,
	);
}

/**
 * Price, currency and stock always come from WooCommerce at render time, never
 * from what was stored when the fix was published: a price change must show.
 *
 * @param array $data Product JSON-LD.
 * @param int   $id   Product id.
 * @return array
 */
function genscore_live_offer( $data, $id ) {
	$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
	if ( ! $product || ! isset( $data['offers'] ) || ! is_array( $data['offers'] ) ) {
		return $data;
	}
	$live = array(
		'availability' => $product->is_in_stock() ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
	);
	if ( '' !== (string) $product->get_price() ) {
		$live['price']         = wc_format_decimal( $product->get_price(), wc_get_price_decimals() );
		$live['priceCurrency'] = get_woocommerce_currency();
	}
	if ( array_values( $data['offers'] ) === $data['offers'] ) {
		foreach ( $data['offers'] as $i => $offer ) {
			if ( is_array( $offer ) ) {
				$data['offers'][ $i ] = array_merge( $offer, $live );
			}
		}
	} else {
		$data['offers'] = array_merge( $data['offers'], $live );
	}
	return $data;
}

/** Products whose Product block WooCommerce already printed in this request. */
$GLOBALS['genscore_wc_printed'] = array();

/**
 * WooCommerce prints its own Product block. When GenScore has one for the
 * product, the person's reviewed block is merged over WooCommerce's, so its
 * reviews and ratings stay and there is a single Product block. The returns
 * policy is added the same way.
 *
 * @param array      $markup  WooCommerce's data.
 * @param WC_Product $product Product.
 * @return array
 */
function genscore_wc_product_markup( $markup, $product ) {
	if ( ! is_array( $markup ) || ! is_object( $product ) || ! method_exists( $product, 'get_id' ) ) {
		return $markup;
	}
	$id                                   = (int) $product->get_id();
	$GLOBALS['genscore_wc_printed'][ $id ] = true;
	$ours                                 = json_decode( genscore_fix_get( $id, 'jsonld' ), true );
	if ( is_array( $ours ) && isset( $ours['@type'] ) && 'Product' === $ours['@type'] ) {
		unset( $ours['@context'] );
		// WooCommerce's own offer already carries today's price and stock.
		if ( isset( $ours['offers'] ) && is_array( $ours['offers'] ) ) {
			$keys = array( 'price' => 0, 'priceCurrency' => 0, 'availability' => 0, 'priceSpecification' => 0 );
			if ( array_values( $ours['offers'] ) === $ours['offers'] ) {
				foreach ( $ours['offers'] as $i => $offer ) {
					$ours['offers'][ $i ] = is_array( $offer ) ? array_diff_key( $offer, $keys ) : $offer;
				}
			} else {
				$ours['offers'] = array_diff_key( $ours['offers'], $keys );
			}
		}
		if ( isset( $ours['offers'], $markup['offers'] ) && array_values( (array) $markup['offers'] ) === $markup['offers'] && ! ( array_values( (array) $ours['offers'] ) === $ours['offers'] ) ) {
			$ours['offers'] = array( $ours['offers'] );
		}
		$markup = array_replace_recursive( $markup, $ours );
	}
	if ( genscore_fix_get( $id, 'returns' ) ) {
		$markup = genscore_with_returns( $markup );
	}
	return $markup;
}
add_filter( 'woocommerce_structured_data_product', 'genscore_wc_product_markup', 20, 2 );

/**
 * Prints what the page needs in <head>: the JSON-LD block (unless
 * WooCommerce prints the product's, see the footer below), the description
 * and, for a home page that lists posts, the canonical.
 */
function genscore_fix_head() {
	$id = genscore_fix_current_id();
	if ( null === $id ) {
		return;
	}
	$seo = genscore_seo_plugin();
	if ( ! $seo ) {
		$desc = genscore_fix_get( $id, 'desc' );
		if ( '' !== $desc ) {
			echo '<meta name="description" content="' . esc_attr( $desc ) . '">' . "\n";
		}
	}
	// WordPress prints the canonical of a singular page itself (and the
	// filter below changes it); the home list and the shop archive get ours.
	if ( ( 0 === $id || ! is_singular() ) && ! $seo ) {
		$canon = genscore_fix_get( $id, 'canonical' );
		if ( '' !== $canon ) {
			echo '<link rel="canonical" href="' . esc_url( $canon ) . '">' . "\n";
		}
	}
	if ( $id && $id === genscore_shop_page_id() && GENSCORE_SHOP_LIVE === genscore_fix_get( $id, 'jsonld' ) ) {
		$list = genscore_shop_list_data( '' !== genscore_fix_get( $id, 'returns' ) );
		if ( $list ) {
			genscore_print_jsonld( $list );
		}
		return;
	}
	$data = json_decode( genscore_fix_get( $id, 'jsonld' ), true );
	if ( ! is_array( $data ) ) {
		return;
	}
	if ( $id && 'product' === get_post_type( $id ) && function_exists( 'wc_get_product' ) ) {
		return; // Merged into WooCommerce's block, or printed in the footer.
	}
	if ( genscore_seo_prints_schema() ) {
		return; // Yoast, Rank Math or AIOSEO already print the page's graph.
	}
	if ( $id && genscore_fix_get( $id, 'fresh' ) ) {
		$data['dateModified'] = get_post_modified_time( 'c', false, $id );
	}
	genscore_print_jsonld( $data );
}
add_action( 'wp_head', 'genscore_fix_head', 5 );

/**
 * A product whose theme does not let WooCommerce print its block still gets
 * GenScore's, once.
 */
function genscore_fix_footer() {
	$id = genscore_fix_current_id();
	if ( ! $id || 'product' !== get_post_type( $id ) || ! empty( $GLOBALS['genscore_wc_printed'][ $id ] ) ) {
		return;
	}
	$data = json_decode( genscore_fix_get( $id, 'jsonld' ), true );
	if ( ! is_array( $data ) ) {
		return;
	}
	$data = genscore_live_offer( $data, $id );
	if ( genscore_fix_get( $id, 'returns' ) ) {
		$data = genscore_with_returns( $data );
	}
	genscore_print_jsonld( $data );
}
add_action( 'wp_footer', 'genscore_fix_footer', 30 );

/**
 * The page's own title, when GenScore keeps it (no SEO plugin).
 *
 * @param string $title Title.
 * @return string
 */
function genscore_fix_document_title( $title ) {
	if ( genscore_seo_plugin() ) {
		return $title;
	}
	$id = genscore_fix_current_id();
	if ( null === $id ) {
		return $title;
	}
	$ours = genscore_fix_get( $id, 'title' );
	return '' !== $ours ? $ours : $title;
}
add_filter( 'pre_get_document_title', 'genscore_fix_document_title', 20 );

/**
 * The canonical WordPress prints for a post, when GenScore keeps it.
 *
 * @param string  $url  Canonical URL.
 * @param WP_Post $post Post.
 * @return string
 */
function genscore_fix_canonical( $url, $post ) {
	if ( genscore_seo_plugin() || ! $post ) {
		return $url;
	}
	$ours = genscore_fix_get( $post->ID, 'canonical' );
	return '' !== $ours ? $ours : $url;
}
add_filter( 'get_canonical_url', 'genscore_fix_canonical', 20, 2 );

/**
 * Under the title: «Actualizado el…» with the real date of the last edit (it
 * can never say something the page did not do) and the answer-first
 * paragraph. The post content itself is never edited.
 *
 * @param string $content Content.
 * @return string
 */
function genscore_fix_fresh( $content ) {
	if ( ! is_singular() || ! in_the_loop() || ! is_main_query() ) {
		return $content;
	}
	$id = (int) get_the_ID();
	if ( ! $id || $id !== (int) get_queried_object_id() ) {
		return $content;
	}
	$top  = '';
	if ( genscore_fix_get( $id, 'fresh' ) ) {
		$iso  = get_post_modified_time( 'c', false, $id );
		$date = get_post_modified_time( get_option( 'date_format' ), false, $id, true );
		/* translators: %s: date of the last edit. */
		$line = sprintf( __( 'Actualizado el %s', 'genscore' ), $date );
		$top .= '<p class="genscore-updated"><time datetime="' . esc_attr( $iso ) . '">' . esc_html( $line ) . '</time></p>';
	}
	// The answer first: a short paragraph the person wrote or approved.
	$lead = 'product' === get_post_type( $id ) ? '' : genscore_fix_get( $id, 'lead' );
	if ( '' !== $lead ) {
		$top .= '<p class="genscore-lead">' . esc_html( $lead ) . '</p>';
	}
	return $top . $content;
}
add_filter( 'the_content', 'genscore_fix_fresh', 5 );

/**
 * The answer first on a product: right under its title, not in the
 * description tab further down.
 */
function genscore_fix_product_lead() {
	$id   = (int) get_the_ID();
	$lead = $id && is_singular( 'product' ) && $id === (int) get_queried_object_id() ? genscore_fix_get( $id, 'lead' ) : '';
	if ( '' !== $lead ) {
		echo '<p class="genscore-lead">' . esc_html( $lead ) . '</p>';
	}
}
add_action( 'woocommerce_single_product_summary', 'genscore_fix_product_lead', 7 );

/**
 * When a listing (shop, posts page) last changed: its newest product or post.
 *
 * @param int $id Listing page id.
 * @return int|null Timestamp, or null.
 */
function genscore_listing_modified( $id ) {
	$type = $id && genscore_shop_page_id() === $id ? 'product' : ( $id && (int) get_option( 'page_for_posts' ) === $id ? 'post' : '' );
	if ( '' === $type ) {
		return null;
	}
	$last = get_posts(
		array(
			'post_type'      => $type,
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'orderby'        => 'modified',
			'order'          => 'DESC',
			'fields'         => 'ids',
		)
	);
	return $last ? (int) get_post_modified_time( 'U', true, $last[0] ) : null;
}

/**
 * What a listing (shop, posts page) prints under its title: the updated date
 * of its newest item and the answer-first paragraph. Once per request.
 *
 * @return string
 */
function genscore_listing_top_html() {
	static $done = false;
	$id = $done ? null : genscore_fix_current_id();
	if ( ! $id || is_search() || is_paged() || ! in_array( $id, array( genscore_shop_page_id(), (int) get_option( 'page_for_posts' ) ), true ) ) {
		return '';
	}
	$html = '';
	$when = genscore_fix_get( $id, 'fresh' ) ? genscore_listing_modified( $id ) : null;
	if ( $when ) {
		/* translators: %s: date of the last edit. */
		$line  = sprintf( __( 'Actualizado el %s', 'genscore' ), wp_date( get_option( 'date_format' ), $when ) );
		$html .= '<p class="genscore-updated"><time datetime="' . esc_attr( wp_date( 'c', $when ) ) . '">' . esc_html( $line ) . '</time></p>';
	}
	$lead = genscore_fix_get( $id, 'lead' );
	if ( '' !== $lead ) {
		$html .= '<p class="genscore-lead">' . esc_html( $lead ) . '</p>';
	}
	if ( '' !== $html ) {
		$done = true;
	}
	return $html;
}

/**
 * Classic themes: WooCommerce's archive description, or the posts loop.
 */
function genscore_fix_shop_lead() {
	echo genscore_listing_top_html(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped when built.
}
add_action( 'woocommerce_archive_description', 'genscore_fix_shop_lead', 5 );

/**
 * Classic themes: before the posts of the posts page.
 *
 * @param WP_Query $q Query.
 */
function genscore_fix_blog_top( $q ) {
	if ( $q->is_main_query() && is_home() && ! is_front_page() ) {
		genscore_fix_shop_lead();
	}
}
add_action( 'loop_start', 'genscore_fix_blog_top' );

/**
 * Block themes: right after the archive title block.
 *
 * @param string $html Rendered block.
 * @return string
 */
function genscore_fix_shop_lead_block( $html ) {
	return $html . genscore_listing_top_html();
}
add_filter( 'render_block_core/query-title', 'genscore_fix_shop_lead_block' );
add_filter( 'render_block_core/query', 'genscore_fix_blog_query_block' );

/**
 * Block themes without an archive title on the posts page: before its list
 * of posts.
 *
 * @param string $html Rendered block.
 * @return string
 */
function genscore_fix_blog_query_block( $html ) {
	return is_home() && ! is_front_page() ? genscore_listing_top_html() . $html : $html;
}
