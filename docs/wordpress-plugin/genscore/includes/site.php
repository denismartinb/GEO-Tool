<?php
/**
 * What WordPress itself knows about the site: settings, the SEO plugin in
 * use, and the pages worth a second look. Read only.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

const GENSCORE_REVIEW_POSTS = 100;
const GENSCORE_REVIEW_PAGES = 200;
const GENSCORE_REVIEW_PRODUCTS = 100;

/**
 * The SEO plugin that writes titles and descriptions, if any.
 *
 * @return array{name: string, meta: string|null}|null
 */
function genscore_seo_plugin() {
	if ( defined( 'WPSEO_VERSION' ) ) {
		return array( 'name' => 'Yoast SEO', 'meta' => '_yoast_wpseo_metadesc' );
	}
	if ( defined( 'RANK_MATH_VERSION' ) ) {
		return array( 'name' => 'Rank Math', 'meta' => 'rank_math_description' );
	}
	if ( defined( 'SEOPRESS_VERSION' ) ) {
		return array( 'name' => 'SEOPress', 'meta' => '_seopress_titles_desc' );
	}
	if ( defined( 'AIOSEO_VERSION' ) ) {
		return array( 'name' => 'All in One SEO', 'meta' => null );
	}
	return null;
}

/**
 * Where the sitemap lives, or null when nothing publishes one.
 *
 * @return string|null
 */
function genscore_sitemap_url() {
	// The screen checks the address answers before saying it exists.
	$by_plugin = array(
		'Yoast SEO'      => '/sitemap_index.xml',
		'Rank Math'      => '/sitemap_index.xml',
		'All in One SEO' => '/sitemap.xml',
		'SEOPress'       => '/sitemaps.xml',
	);
	$seo       = genscore_seo_plugin();
	if ( $seo && isset( $by_plugin[ $seo['name'] ] ) ) {
		$wpseo = get_option( 'wpseo' );
		if ( 'Yoast SEO' !== $seo['name'] || ! is_array( $wpseo ) || ! empty( $wpseo['enable_xml_sitemap'] ) ) {
			return home_url( $by_plugin[ $seo['name'] ] );
		}
	}
	if ( function_exists( 'wp_sitemaps_get_server' ) ) {
		$server = wp_sitemaps_get_server();
		if ( $server && $server->sitemaps_enabled() ) {
			return home_url( '/wp-sitemap.xml' );
		}
	}
	return null;
}

/**
 * One published product to show the agent lane: a shop's home page is a
 * shop window, and what an agent reads to buy is the product page. In stock
 * first, most recently updated. Null without WooCommerce or products.
 *
 * @return string|null
 */
function genscore_sample_product_url() {
	if ( ! class_exists( 'WooCommerce' ) || ! function_exists( 'wc_get_products' ) ) {
		return null;
	}
	foreach ( array( 'instock', null ) as $stock ) {
		$args = array( 'status' => 'publish', 'visibility' => 'visible', 'limit' => 1, 'orderby' => 'modified', 'order' => 'DESC', 'return' => 'ids' );
		if ( $stock ) {
			$args['stock_status'] = $stock;
		}
		$ids = wc_get_products( $args );
		if ( $ids ) {
			$url = get_permalink( (int) $ids[0] );
			return $url ? $url : null;
		}
	}
	return null;
}

/**
 * Site-wide facts for the screen.
 *
 * @return array
 */
function genscore_site_facts() {
	$home = home_url( '/' );
	$host = (string) wp_parse_url( $home, PHP_URL_HOST );
	$seo  = genscore_seo_plugin();
	return array(
		'name'          => get_bloginfo( 'name' ),
		'icon'          => get_site_icon_url( 64 ),
		'domain'        => preg_replace( '/^www\./', '', strtolower( $host ) ),
		'home'          => $home,
		'https'         => 0 === strpos( $home, 'https://' ),
		'public'        => (bool) get_option( 'blog_public' ),
		'sitemap'       => genscore_sitemap_url(),
		'seoPlugin'     => $seo ? $seo['name'] : null,
		'robotsFile'    => file_exists( trailingslashit( ABSPATH ) . 'robots.txt' ),
		'rootInstall'   => '/' === (string) wp_parse_url( $home, PHP_URL_PATH ) || '' === (string) wp_parse_url( $home, PHP_URL_PATH ),
		'woocommerce'   => class_exists( 'WooCommerce' ),
		'product'       => genscore_sample_product_url(),
		'readingUrl'    => admin_url( 'options-reading.php' ),
		'permalinkPlain' => '' === (string) get_option( 'permalink_structure' ),
		'frontPage'     => 'page' === get_option( 'show_on_front' ) ? (int) get_option( 'page_on_front' ) : 0,
	);
}

/**
 * Pages to look at again: no description, a title another page also uses, or
 * images without alternative text in the content.
 *
 * @return array{items: array, reviewed: array, canCheckDescriptions: bool}
 */
function genscore_pages_to_review() {
	$seo      = genscore_seo_plugin();
	$meta_key = $seo ? $seo['meta'] : null;
	$sets     = array(
		'page'    => GENSCORE_REVIEW_PAGES,
		'post'    => GENSCORE_REVIEW_POSTS,
		'product' => GENSCORE_REVIEW_PRODUCTS,
	);
	$posts    = array();
	$reviewed = array();
	foreach ( $sets as $type => $limit ) {
		if ( ! post_type_exists( $type ) ) {
			continue;
		}
		$found = get_posts(
			array(
				'post_type'      => $type,
				'post_status'    => 'publish',
				'posts_per_page' => $limit,
				'has_password'   => false,
				'orderby'        => 'modified',
			)
		);
		$reviewed[ $type ] = count( $found );
		$posts             = array_merge( $posts, $found );
	}

	$titles = array();
	foreach ( $posts as $p ) {
		$k = function_exists( 'mb_strtolower' ) ? mb_strtolower( trim( $p->post_title ) ) : strtolower( trim( $p->post_title ) );
		if ( '' !== $k ) {
			$titles[ $k ] = isset( $titles[ $k ] ) ? $titles[ $k ] + 1 : 1;
		}
	}

	$items = array();
	foreach ( $posts as $p ) {
		$issues = array();
		if ( $meta_key && '' === trim( (string) get_post_meta( $p->ID, $meta_key, true ) ) && '' === trim( (string) $p->post_excerpt ) ) {
			$issues[] = 'desc';
		}
		$k = function_exists( 'mb_strtolower' ) ? mb_strtolower( trim( $p->post_title ) ) : strtolower( trim( $p->post_title ) );
		if ( '' === $k ) {
			$issues[] = 'notitle';
		} elseif ( $titles[ $k ] > 1 ) {
			$issues[] = 'duptitle';
		}
		$no_alt = genscore_images_without_alt( $p->post_content );
		if ( $no_alt > 0 ) {
			$issues[] = 'alt';
		}
		if ( ! $issues ) {
			continue;
		}
		$items[] = array(
			'title'  => get_the_title( $p ),
			'type'   => $p->post_type,
			'issues' => $issues,
			'noAlt'  => $no_alt,
			'edit'   => get_edit_post_link( $p->ID, 'raw' ),
			'view'   => get_permalink( $p ),
		);
	}
	return array(
		'items'                => $items,
		'reviewed'             => $reviewed,
		'limits'               => $sets,
		'canCheckDescriptions' => (bool) $meta_key,
	);
}

/**
 * Images in the content with no alternative text (missing or empty alt).
 *
 * @param string $html Post content.
 * @return int
 */
function genscore_images_without_alt( $html ) {
	if ( ! preg_match_all( '/<img\b[^>]*>/i', (string) $html, $m ) ) {
		return 0;
	}
	$n = 0;
	foreach ( $m[0] as $tag ) {
		if ( ! preg_match( '/\balt\s*=\s*("([^"]*)"|\'([^\']*)\')/i', $tag, $a ) || '' === trim( isset( $a[3] ) ? $a[3] : $a[2] ) ) {
			++$n;
		}
	}
	return $n;
}
