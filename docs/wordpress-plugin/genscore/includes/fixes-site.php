<?php
/**
 * One-click fixes added in 1.4.1 (WP-PLUGIN-4, second delivery): image alt
 * text, noindex and nosnippet, a product's specifications table, the
 * cancellation policy, a fact with its source, and three switches for the
 * whole site (sitemap, viewport, who is behind the site).
 *
 * Same rules as every fix: proposals come from WordPress or WooCommerce data,
 * or the person writes them; the post content is never rewritten; every
 * publish keeps what it replaced so it can be undone.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/** Site-wide switches: sitemap, viewport and identity. */
const GENSCORE_SITE_OPTION = 'genscore_site_fixes';

/** Cancellation policy shared by the pages that publish it. */
const GENSCORE_CANCEL_OPTION = 'genscore_cancel';

/** Images listed for one page, at most. */
const GENSCORE_ALT_MAX = 20;

/**
 * The 1.4.1 kinds that work page by page.
 *
 * @return array
 */
function genscore_extra_kinds() {
	return array(
		'alt'     => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array() ),
		'noindex' => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array( 'index' ) ),
		'snippet' => array( 'types' => array( 'page', 'post', 'product' ), 'ids' => array( 'snippet' ) ),
		'specs'   => array( 'types' => array( 'product' ), 'ids' => array() ),
		'cancel'  => array( 'types' => array( 'product' ), 'ids' => array() ),
	);
}

/**
 * Whether a kind is one of these.
 *
 * @param string $kind Kind.
 * @return bool
 */
function genscore_is_extra_kind( $kind ) {
	return isset( genscore_extra_kinds()[ $kind ] );
}

/**
 * Where an SEO plugin keeps the robots settings of a post, so noindex and
 * nosnippet are removed where the person would look for them.
 *
 * @return string|null Plugin name, or null when none we can write.
 */
function genscore_robots_plugin() {
	$seo = genscore_seo_plugin();
	return $seo && in_array( $seo['name'], array( 'Yoast SEO', 'Rank Math', 'SEOPress' ), true ) ? $seo['name'] : null;
}

/**
 * Whether one of these kinds can be published here, and if not, why.
 *
 * @param string $kind Kind.
 * @return string|true
 */
function genscore_extra_available( $kind ) {
	$woo = class_exists( 'WooCommerce' ) && function_exists( 'wc_get_product' );
	if ( 'specs' === $kind && ! $woo ) {
		return __( 'Hace falta WooCommerce.', 'genscore' );
	}
	if ( 'noindex' === $kind ) {
		if ( '0' === (string) get_option( 'blog_public' ) ) {
			return __( 'Tu web entera pide no salir en los buscadores: se cambia en Ajustes > Lectura.', 'genscore' );
		}
		if ( ! genscore_robots_plugin() ) {
			$seo = genscore_seo_plugin();
			return $seo
				/* translators: %s: SEO plugin name. */
				? sprintf( __( '%s guarda el noindex a su manera: quítalo en los ajustes de cada página.', 'genscore' ), $seo['name'] )
				: __( 'WordPress no guarda un noindex por página: lo pone tu tema u otro plugin.', 'genscore' );
		}
	}
	return true;
}

/* ------------------------------------------------------------------ */
/* Image alt text                                                     */
/* ------------------------------------------------------------------ */

/**
 * Whether an attachment title is a camera or upload name, not words.
 *
 * @param string $t Title.
 * @return bool
 */
function genscore_is_file_name( $t ) {
	$t = trim( (string) $t );
	return '' === $t || (bool) preg_match( '/^(img|dsc|dscn|dcim|pxl|photo|image|imagen|foto|screenshot|captura|whatsapp|wp)[\s_-]*\d/i', $t ) || (bool) preg_match( '/^[\d\s_-]+$/', $t ) || (bool) preg_match( '/\.(jpe?g|png|gif|webp|avif|svg|heic)$/i', $t );
}

/**
 * Whether an attachment's title is just its file name, as WordPress sets it
 * on upload (also after «-scaled» or a size suffix).
 *
 * @param string $title Attachment title.
 * @param string $file  Attached file path.
 * @return bool
 */
function genscore_title_is_file( $title, $file ) {
	$key  = function ( $t ) {
		$t = strtolower( remove_accents( (string) $t ) );
		return preg_replace( '/[^a-z0-9]+/', '', $t );
	};
	$base = preg_replace( '/(-scaled|-rotated|-\d+x\d+|-e\d{10,})+$/i', '', pathinfo( $file, PATHINFO_FILENAME ) );
	return '' !== $base && $key( $title ) === $key( $base );
}

/**
 * Alt text WordPress already has words for: the attachment's alt, its title
 * when it is not a file name, or the page's own title. Never invented.
 *
 * @param int $att Attachment id.
 * @param int $id  Page id.
 * @return string
 */
function genscore_alt_proposal( $att, $id ) {
	$alt = trim( (string) get_post_meta( $att, '_wp_attachment_image_alt', true ) );
	if ( '' !== $alt ) {
		return $alt;
	}
	$title = trim( html_entity_decode( (string) get_the_title( $att ), ENT_QUOTES, 'UTF-8' ) );
	// WordPress names an upload after its file («bolsa-cafe-etiopia-250g»):
	// that title is the file name, not a description, so the page's title is.
	if ( ! genscore_is_file_name( $title ) && ! genscore_title_is_file( $title, (string) get_attached_file( $att ) ) ) {
		return mb_strtoupper( mb_substr( $title, 0, 1 ) ) . mb_substr( $title, 1 );
	}
	return genscore_post_title( $id );
}

/**
 * The images of a page that have no alt text: those in its content with an
 * empty or missing alt, its featured image and, for a product, its gallery.
 *
 * @param int $id Post id.
 * @return array{fix: array[], loose: int} Fixable images, and those with no file in the media library.
 */
function genscore_page_images( $id ) {
	$fix   = array();
	$loose = 0;
	$seen  = array();
	$add   = function ( $att ) use ( &$fix, &$seen, $id ) {
		$att = (int) $att;
		if ( ! $att || isset( $seen[ $att ] ) || ! wp_attachment_is_image( $att ) ) {
			return;
		}
		$seen[ $att ] = true;
		$src          = wp_get_attachment_image_url( $att, 'thumbnail' );
		$fix[]        = array( 'id' => $att, 'src' => $src ? $src : '', 'alt' => genscore_alt_proposal( $att, $id ) );
	};
	if ( preg_match_all( '#<img\b[^>]*>#i', genscore_raw_content( $id ), $m ) ) {
		foreach ( $m[0] as $tag ) {
			if ( preg_match( '#\salt\s*=\s*(["\'])\s*\S#i', $tag ) ) {
				continue;
			}
			if ( preg_match( '#wp-image-(\d+)#', $tag, $a ) ) {
				$add( $a[1] );
			} else {
				$loose++;
			}
		}
	}
	// A product's own images already carry the product name as alt when
	// WooCommerce serves them; writing one in the library would replace it.
	$atts = 'product' === get_post_type( $id ) ? array() : array( (int) get_post_thumbnail_id( $id ) );
	foreach ( $atts as $att ) {
		if ( $att && '' === trim( (string) get_post_meta( $att, '_wp_attachment_image_alt', true ) ) ) {
			$add( $att );
		}
	}
	return array( 'fix' => array_slice( $fix, 0, GENSCORE_ALT_MAX ), 'loose' => $loose );
}

/**
 * Cleans the alt texts the person reviewed: only images of this page, each
 * with 2 to 150 characters.
 *
 * @param string $value JSON [{id, alt}].
 * @param int    $id    Post id.
 * @return string|null JSON {attachment id: alt}.
 */
function genscore_clean_alt( $value, $id ) {
	$rows = json_decode( (string) $value, true );
	if ( ! is_array( $rows ) ) {
		return null;
	}
	$mine = array();
	foreach ( genscore_page_images( $id )['fix'] as $img ) {
		$mine[ $img['id'] ] = true;
	}
	foreach ( genscore_alt_map( $id ) as $att => $alt ) {
		$mine[ (int) $att ] = true; // Already published here: it can be edited again.
	}
	$out = array();
	foreach ( $rows as $r ) {
		$att = is_array( $r ) ? absint( $r['id'] ?? 0 ) : 0;
		$alt = is_array( $r ) ? sanitize_text_field( (string) ( $r['alt'] ?? '' ) ) : '';
		if ( $att && isset( $mine[ $att ] ) && mb_strlen( $alt ) >= 2 ) {
			$out[ (string) $att ] = mb_substr( $alt, 0, 150 );
		}
	}
	return $out ? wp_json_encode( $out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) : null;
}

/**
 * The alt texts published on a page.
 *
 * @param int $id Post id.
 * @return array<string,string>
 */
function genscore_alt_map( $id ) {
	$map = json_decode( genscore_fix_get( $id, 'alt' ), true );
	return is_array( $map ) ? $map : array();
}

/**
 * Saves the alt texts in the media library too, where an image has none, so
 * the same image gets it on every page. Returns what was there, for undo.
 *
 * @param string $value JSON {attachment id: alt}.
 * @return array<string,string>
 */
function genscore_alt_to_library( $value ) {
	$prev = array();
	foreach ( (array) json_decode( (string) $value, true ) as $att => $alt ) {
		$att = absint( $att );
		if ( ! $att || ! current_user_can( 'edit_post', $att ) ) {
			continue;
		}
		$now = (string) get_post_meta( $att, '_wp_attachment_image_alt', true );
		if ( '' === trim( $now ) ) {
			$prev[ (string) $att ] = $now;
			update_post_meta( $att, '_wp_attachment_image_alt', wp_slash( $alt ) );
		}
	}
	return $prev;
}

/**
 * An image in the content with no alt text gets the one published for it.
 * The content stored in the post does not change.
 *
 * @param string $tag     <img> tag.
 * @param string $context Where it is.
 * @param int    $att     Attachment id.
 * @return string
 */
function genscore_alt_content_img( $tag, $context, $att ) {
	if ( 'the_content' !== $context || ! $att || preg_match( '#\salt\s*=\s*(["\'])\s*\S#i', $tag ) ) {
		return $tag;
	}
	$id  = (int) get_the_ID();
	$map = $id ? genscore_alt_map( $id ) : array();
	if ( ! isset( $map[ (string) $att ] ) ) {
		return $tag;
	}
	$alt = ' alt="' . esc_attr( $map[ (string) $att ] ) . '"';
	$tag = preg_replace( '#\salt\s*=\s*(["\'])\s*\1#i', '', $tag );
	return preg_replace( '#^<img\b#i', '<img' . $alt, $tag, 1 );
}
add_filter( 'wp_content_img_tag', 'genscore_alt_content_img', 20, 3 );

/* ------------------------------------------------------------------ */
/* noindex and nosnippet                                              */
/* ------------------------------------------------------------------ */

/**
 * The SEO plugin's robots settings for a post that say noindex or nosnippet.
 *
 * @param int    $id   Post id.
 * @param string $what noindex or nosnippet.
 * @return bool
 */
function genscore_seo_robots_says( $id, $what ) {
	$seo  = genscore_robots_plugin();
	$type = get_post_type( $id );
	if ( 'Yoast SEO' === $seo ) {
		if ( 'noindex' === $what ) {
			$v = (string) get_post_meta( $id, '_yoast_wpseo_meta-robots-noindex', true );
			if ( '1' === $v ) {
				return true;
			}
			$titles = get_option( 'wpseo_titles' );
			return '2' !== $v && is_array( $titles ) && ! empty( $titles[ 'noindex-' . $type ] );
		}
		return false !== strpos( (string) get_post_meta( $id, '_yoast_wpseo_meta-robots-adv', true ), 'nosnippet' );
	}
	if ( 'Rank Math' === $seo ) {
		$robots = get_post_meta( $id, 'rank_math_robots', true );
		if ( ! is_array( $robots ) || ! $robots ) {
			$titles = get_option( 'rank-math-options-titles' );
			$robots = is_array( $titles ) && ! empty( $titles[ 'pt_' . $type . '_custom_robots' ] ) && isset( $titles[ 'pt_' . $type . '_robots' ] ) ? (array) $titles[ 'pt_' . $type . '_robots' ] : array();
		}
		if ( 'noindex' === $what ) {
			return in_array( 'noindex', $robots, true );
		}
		$adv = get_post_meta( $id, 'rank_math_advanced_robots', true );
		return in_array( 'nosnippet', $robots, true ) || ( is_array( $adv ) && isset( $adv['max-snippet'] ) && '0' === (string) $adv['max-snippet'] );
	}
	if ( 'SEOPress' === $seo ) {
		$key = 'noindex' === $what ? '_seopress_robots_index' : '_seopress_robots_snippet';
		return 'yes' === (string) get_post_meta( $id, $key, true );
	}
	return false;
}

/**
 * Removes noindex or nosnippet from the SEO plugin's fields. Returns what each
 * field held, serialized, so undo can put it back exactly.
 *
 * @param int    $id   Post id.
 * @param string $what noindex or nosnippet.
 * @return array<string,string|null> Meta key => previous value (null: it did not exist).
 */
function genscore_seo_robots_clear( $id, $what ) {
	$prev = array();
	$keep = function ( $key ) use ( $id, &$prev ) {
		if ( ! array_key_exists( $key, $prev ) ) {
			$prev[ $key ] = metadata_exists( 'post', $id, $key ) ? maybe_serialize( get_post_meta( $id, $key, true ) ) : null;
		}
	};
	switch ( genscore_robots_plugin() ) {
		case 'Yoast SEO':
			if ( 'noindex' === $what ) {
				$keep( '_yoast_wpseo_meta-robots-noindex' );
				update_post_meta( $id, '_yoast_wpseo_meta-robots-noindex', '2' );
			} else {
				$key = '_yoast_wpseo_meta-robots-adv';
				$keep( $key );
				$adv = array_diff( array_filter( array_map( 'trim', explode( ',', (string) get_post_meta( $id, $key, true ) ) ) ), array( 'nosnippet' ) );
				update_post_meta( $id, $key, $adv ? implode( ',', $adv ) : '-' );
			}
			break;
		case 'Rank Math':
			$robots = get_post_meta( $id, 'rank_math_robots', true );
			$robots = is_array( $robots ) && $robots ? $robots : array( 'index' );
			$keep( 'rank_math_robots' );
			if ( 'noindex' === $what ) {
				$robots = array_values( array_unique( array_merge( array_diff( $robots, array( 'noindex' ) ), array( 'index' ) ) ) );
			} else {
				$robots = array_values( array_diff( $robots, array( 'nosnippet' ) ) );
				$adv    = get_post_meta( $id, 'rank_math_advanced_robots', true );
				if ( is_array( $adv ) && isset( $adv['max-snippet'] ) && '0' === (string) $adv['max-snippet'] ) {
					$keep( 'rank_math_advanced_robots' );
					$adv['max-snippet'] = '-1';
					update_post_meta( $id, 'rank_math_advanced_robots', $adv );
				}
			}
			update_post_meta( $id, 'rank_math_robots', $robots );
			break;
		case 'SEOPress':
			$key = 'noindex' === $what ? '_seopress_robots_index' : '_seopress_robots_snippet';
			$keep( $key );
			delete_post_meta( $id, $key );
			break;
	}
	return $prev;
}

/**
 * Puts back what genscore_seo_robots_clear() replaced.
 *
 * @param int   $id   Post id.
 * @param array $prev Meta key => serialized value or null.
 */
function genscore_seo_robots_restore( $id, $prev ) {
	foreach ( (array) $prev as $key => $v ) {
		if ( null === $v ) {
			delete_post_meta( $id, $key );
		} else {
			update_post_meta( $id, $key, wp_slash( maybe_unserialize( $v ) ) );
		}
	}
	clean_post_cache( $id );
}

/**
 * The page asks WordPress for these robots: noindex and nosnippet go away on
 * a page GenScore published the fix on, whoever added them (a theme, another
 * plugin). A site closed in Ajustes > Lectura stays closed.
 *
 * @param array $robots Robots directives.
 * @return array
 */
function genscore_wp_robots( $robots ) {
	$id = genscore_fix_current_id();
	if ( ! $id ) {
		return $robots;
	}
	if ( genscore_fix_get( $id, 'snippet' ) ) {
		unset( $robots['nosnippet'] );
		if ( isset( $robots['max-snippet'] ) && '0' === (string) $robots['max-snippet'] ) {
			$robots['max-snippet'] = '-1';
		}
	}
	if ( genscore_fix_get( $id, 'noindex' ) && '0' !== (string) get_option( 'blog_public' ) ) {
		unset( $robots['noindex'], $robots['none'] );
	}
	return $robots;
}
add_filter( 'wp_robots', 'genscore_wp_robots', 99 );

/**
 * Yoast and Rank Math build their robots on their own: same rule.
 *
 * @param array $robots Directives as key => value.
 * @return array
 */
function genscore_seo_robots_filter( $robots ) {
	$id = genscore_fix_current_id();
	if ( ! $id || ! is_array( $robots ) ) {
		return $robots;
	}
	if ( genscore_fix_get( $id, 'snippet' ) ) {
		unset( $robots['nosnippet'] );
		foreach ( $robots as $k => $v ) {
			if ( 'nosnippet' === $v ) {
				unset( $robots[ $k ] );
			}
		}
	}
	if ( genscore_fix_get( $id, 'noindex' ) && '0' !== (string) get_option( 'blog_public' ) && isset( $robots['index'] ) && 'noindex' === $robots['index'] ) {
		$robots['index'] = 'index';
	}
	return $robots;
}
add_filter( 'wpseo_robots_array', 'genscore_seo_robots_filter', 99 );
add_filter( 'rank_math/frontend/robots', 'genscore_seo_robots_filter', 99 );

/* ------------------------------------------------------------------ */
/* Specifications table                                               */
/* ------------------------------------------------------------------ */

/**
 * A product's specifications from WooCommerce: its visible attributes, weight
 * and size. Read when the page is served, so they are never out of date.
 *
 * @param int $id Product id.
 * @return array[] [ label, value ]
 */
function genscore_spec_rows( $id ) {
	$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
	if ( ! $product ) {
		return array();
	}
	$rows = array();
	foreach ( $product->get_attributes() as $attr ) {
		if ( ! is_object( $attr ) || ! $attr->get_visible() ) {
			continue;
		}
		$values = $attr->is_taxonomy() ? wc_get_product_terms( $id, $attr->get_name(), array( 'fields' => 'names' ) ) : $attr->get_options();
		$values = array_filter( array_map( 'trim', array_map( 'strval', (array) $values ) ) );
		if ( $values ) {
			$rows[] = array( wc_attribute_label( $attr->get_name(), $product ), implode( ', ', $values ) );
		}
	}
	if ( $product->has_weight() ) {
		$rows[] = array( __( 'Peso', 'genscore' ), wc_format_weight( $product->get_weight() ) );
	}
	if ( $product->has_dimensions() ) {
		$rows[] = array( __( 'Medidas', 'genscore' ), wc_format_dimensions( $product->get_dimensions( false ) ) );
	}
	return array_map(
		function ( $r ) {
			return array( wp_strip_all_tags( html_entity_decode( $r[0], ENT_QUOTES, 'UTF-8' ) ), wp_strip_all_tags( html_entity_decode( $r[1], ENT_QUOTES, 'UTF-8' ) ) );
		},
		$rows
	);
}

/**
 * The specifications as a table, served under the product's description.
 *
 * @param int $id Product id.
 * @return string
 */
function genscore_spec_table( $id ) {
	$rows = genscore_spec_rows( $id );
	if ( count( $rows ) < 2 ) {
		return '';
	}
	$h = '<table class="genscore-specs"><caption>' . esc_html__( 'Características', 'genscore' ) . '</caption><tbody>';
	foreach ( $rows as $r ) {
		$h .= '<tr><th scope="row">' . esc_html( $r[0] ) . '</th><td>' . esc_html( $r[1] ) . '</td></tr>';
	}
	return $h . '</tbody></table>';
}

/* ------------------------------------------------------------------ */
/* Cancellation policy                                                */
/* ------------------------------------------------------------------ */

/**
 * The cancellation settings in use: what the person saved, or a page whose
 * title says it is the policy.
 *
 * @return array{page: int, days: int, country: string}
 */
function genscore_cancel_settings() {
	$saved = get_option( GENSCORE_CANCEL_OPTION, array() );
	if ( is_array( $saved ) && ! empty( $saved['page'] ) ) {
		return $saved;
	}
	$page = 0;
	foreach ( genscore_cancel_pages() as $p ) {
		if ( preg_match( '/cancela|reembols|devoluci|desistim|refund|return/iu', $p['title'] ) ) {
			$page = $p['id'];
			break;
		}
	}
	$country = function_exists( 'WC' ) && WC()->countries ? (string) WC()->countries->get_base_country() : '';
	return array( 'page' => $page, 'days' => 14, 'country' => preg_match( '/^[A-Z]{2}$/', $country ) ? $country : 'ES' );
}

/**
 * Pages that can hold the policy, newest first.
 *
 * @return array[] { id, title }
 */
function genscore_cancel_pages() {
	$ids = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'has_password'   => false,
			'posts_per_page' => 100,
			'fields'         => 'ids',
			'orderby'        => 'title',
			'order'          => 'ASC',
		)
	);
	// Pages that cannot explain a policy: the blog index and WooCommerce's own screens.
	$skip = array( (int) get_option( 'page_for_posts' ) );
	foreach ( array( 'cart', 'checkout', 'myaccount', 'shop' ) as $wc ) {
		$skip[] = (int) get_option( 'woocommerce_' . $wc . '_page_id' );
	}
	$out = array();
	foreach ( $ids as $id ) {
		if ( ! in_array( (int) $id, $skip, true ) ) {
			$out[] = array( 'id' => (int) $id, 'title' => genscore_post_title( $id ) );
		}
	}
	return $out;
}

/**
 * Cleans the cancellation settings sent by the screen.
 *
 * @param array $raw Raw values.
 * @return array|null
 */
function genscore_clean_cancel( $raw ) {
	$page    = absint( $raw['page'] ?? 0 );
	$days    = absint( $raw['days'] ?? 0 );
	$country = strtoupper( sanitize_key( (string) ( $raw['country'] ?? '' ) ) );
	if ( ! $page || 'page' !== get_post_type( $page ) || 'publish' !== get_post_status( $page ) || $days < 1 || $days > 365 || ! preg_match( '/^[A-Z]{2}$/', $country ) ) {
		return null;
	}
	return array( 'page' => $page, 'days' => $days, 'country' => $country );
}

/**
 * The policy as schema.org data, with the link to the page that explains it.
 *
 * @return array|null
 */
function genscore_cancel_policy() {
	$c = get_option( GENSCORE_CANCEL_OPTION, array() );
	if ( ! is_array( $c ) || empty( $c['page'] ) || 'publish' !== get_post_status( (int) $c['page'] ) ) {
		return null;
	}
	return array(
		'@type'                => 'MerchantReturnPolicy',
		'applicableCountry'    => $c['country'],
		'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
		'merchantReturnDays'   => (int) $c['days'],
		'merchantReturnLink'   => get_permalink( (int) $c['page'] ),
	);
}

/* ------------------------------------------------------------------ */
/* Status, proposal and note for the list                              */
/* ------------------------------------------------------------------ */

/**
 * ready, has, na or missing for one of these kinds.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id.
 * @return string
 */
function genscore_extra_status( $kind, $id ) {
	$now = genscore_fix_get( $id, $kind );
	switch ( $kind ) {
		case 'alt':
			$imgs = genscore_page_images( $id );
			if ( $imgs['fix'] ) {
				return 'ready';
			}
			return $imgs['loose'] && '' === $now ? 'missing' : 'has';
		case 'noindex':
		case 'snippet':
			if ( '' !== $now ) {
				return 'has';
			}
			if ( genscore_seo_robots_says( $id, 'noindex' === $kind ? 'noindex' : 'nosnippet' ) ) {
				return 'ready';
			}
			return 'snippet' === $kind && genscore_fix_review_says( 'snippet', $id ) ? 'ready' : 'has';
		case 'specs':
			if ( '' !== $now || preg_match( '#<(table|ul|ol)[\s>]#i', genscore_raw_content( $id ) ) || genscore_wc_shows_specs( $id ) ) {
				return 'has';
			}
			return count( genscore_spec_rows( $id ) ) >= 2 ? 'ready' : 'missing';
		case 'cancel':
			return '' !== $now ? 'has' : 'ready';
	}
	return 'ready';
}

/**
 * Whether WooCommerce already prints the product's table in «Información
 * adicional»: a second one from us would repeat it.
 *
 * @param int $id Product id.
 * @return bool
 */
function genscore_wc_shows_specs( $id ) {
	$p = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
	if ( ! $p ) {
		return false;
	}
	$dims = apply_filters( 'wc_product_enable_dimensions_display', true ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- WooCommerce's own filter.
	return $p->has_attributes() || ( $dims && ( $p->has_weight() || $p->has_dimensions() ) );
}

/**
 * The text the person reviews for one of these kinds.
 *
 * @param string $kind Kind.
 * @param int    $id   Post id.
 * @return string|null
 */
function genscore_extra_propose( $kind, $id ) {
	switch ( $kind ) {
		case 'alt':
			$fix = genscore_page_images( $id )['fix'];
			if ( ! $fix ) {
				$fix = array();
				foreach ( genscore_alt_map( $id ) as $att => $alt ) {
					$src   = wp_get_attachment_image_url( (int) $att, 'thumbnail' );
					$fix[] = array( 'id' => (int) $att, 'src' => $src ? $src : '', 'alt' => $alt );
				}
			}
			return $fix ? wp_json_encode( $fix, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) : null;
		case 'noindex':
			return __( 'Quitar noindex: la página podrá salir en Google.', 'genscore' );
		case 'snippet':
			return __( 'Quitar nosnippet: Google y la IA podrán citar su texto.', 'genscore' );
		case 'specs':
			$rows = genscore_spec_rows( $id );
			return count( $rows ) >= 2 ? implode( "\n", array_map( function ( $r ) {
				return $r[0] . ': ' . $r[1];
			}, $rows ) ) : null;
		case 'cancel':
			return '1'; // The settings above the list say what is published.
	}
	return null;
}

/**
 * Why a page has no proposal.
 *
 * @param string $kind Kind.
 * @return string
 */
function genscore_extra_missing_note( $kind ) {
	if ( 'alt' === $kind ) {
		return __( 'Imágenes fuera de tu biblioteca de medios', 'genscore' );
	}
	if ( 'specs' === $kind ) {
		return __( 'Sin atributos, peso ni medidas', 'genscore' );
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
function genscore_extra_clean( $kind, $value, $id ) {
	return 'alt' === $kind ? genscore_clean_alt( $value, $id ) : null;
}

/**
 * What else a publish writes besides GenScore's own field. Returns the
 * batch record with what it replaced.
 *
 * @param string $kind  Kind.
 * @param int    $id    Post id.
 * @param string $value Value published.
 * @param array  $rec   Batch record.
 * @return array
 */
function genscore_extra_after_write( $kind, $id, $value, $rec ) {
	if ( 'alt' === $kind ) {
		$prev                = genscore_alt_to_library( $value );
		$rec['alt_prev']     = ( isset( $rec['alt_prev'] ) ? $rec['alt_prev'] : array() ) + $prev;
	}
	if ( in_array( $kind, array( 'noindex', 'snippet' ), true ) && $id ) {
		$prev = genscore_seo_robots_clear( $id, 'noindex' === $kind ? 'noindex' : 'nosnippet' );
		if ( $prev && ! isset( $rec['robots_prev'][ $id ] ) ) {
			$rec['robots_prev'][ $id ] = $prev;
		}
		clean_post_cache( $id );
	}
	return $rec;
}

/**
 * Puts back what genscore_extra_after_write() replaced.
 *
 * @param array $rec Batch record.
 */
function genscore_extra_undo( $rec ) {
	foreach ( (array) ( $rec['alt_prev'] ?? array() ) as $att => $alt ) {
		$att = absint( $att );
		if ( $att && current_user_can( 'edit_post', $att ) ) {
			if ( '' === (string) $alt ) {
				delete_post_meta( $att, '_wp_attachment_image_alt' );
			} else {
				update_post_meta( $att, '_wp_attachment_image_alt', wp_slash( $alt ) );
			}
		}
	}
	foreach ( (array) ( $rec['robots_prev'] ?? array() ) as $id => $prev ) {
		if ( current_user_can( 'edit_post', (int) $id ) ) {
			genscore_seo_robots_restore( (int) $id, $prev );
		}
	}
	if ( isset( $rec['cancel_prev'] ) ) {
		update_option( GENSCORE_CANCEL_OPTION, $rec['cancel_prev'], false );
	}
}

/* ------------------------------------------------------------------ */
/* A fact with its source                                             */
/* ------------------------------------------------------------------ */

/**
 * Cleans a fact the person wrote: the fact, a link to its source and the date
 * it is from. All three, or nothing.
 *
 * @param array $raw Raw values.
 * @return string|null JSON {text, url, date}.
 */
function genscore_clean_cite( $raw ) {
	$text = sanitize_text_field( (string) ( $raw['text'] ?? '' ) );
	$url  = esc_url_raw( trim( (string) ( $raw['url'] ?? '' ) ), array( 'http', 'https' ) );
	$date = sanitize_text_field( (string) ( $raw['date'] ?? '' ) );
	if ( genscore_word_count( $text ) < 4 || mb_strlen( $text ) > 300 || '' === $url || ! wp_parse_url( $url, PHP_URL_HOST ) ) {
		return null;
	}
	if ( ! preg_match( '/^(\d{4})-(\d{2})(?:-(\d{2}))?$/', $date, $m ) || ! checkdate( (int) $m[2], isset( $m[3] ) ? (int) $m[3] : 1, (int) $m[1] ) || $date > gmdate( 'Y-m-d' ) ) {
		return null;
	}
	return wp_json_encode( array( 'text' => $text, 'url' => $url, 'date' => $date ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
}

/**
 * The fact published on a page, or null.
 *
 * @param int $id Post id.
 * @return array|null
 */
function genscore_cite_data( $id ) {
	$c = json_decode( genscore_fix_get( $id, 'cite' ), true );
	return is_array( $c ) && ! empty( $c['text'] ) && ! empty( $c['url'] ) ? $c : null;
}

/**
 * The fact as a paragraph: the text, then the source and its date.
 *
 * @param array $c From genscore_cite_data().
 * @return string
 */
function genscore_cite_html( $c ) {
	$ts   = strtotime( $c['date'] . ( 7 === strlen( $c['date'] ) ? '-01' : '' ) );
	$when = $ts ? wp_date( 7 === strlen( $c['date'] ) ? 'F Y' : get_option( 'date_format' ), $ts ) : $c['date'];
	$host = preg_replace( '/^www\./', '', (string) wp_parse_url( $c['url'], PHP_URL_HOST ) );
	return '<p class="genscore-cite">' . esc_html( $c['text'] ) . ' <span class="genscore-cite-src">(' . esc_html__( 'Fuente:', 'genscore' ) . ' <a href="' . esc_url( $c['url'] ) . '" rel="noopener">' . esc_html( $host ) . '</a>, <time datetime="' . esc_attr( $c['date'] ) . '">' . esc_html( $when ) . '</time>)</span></p>';
}

/* ------------------------------------------------------------------ */
/* Site-wide switches                                                 */
/* ------------------------------------------------------------------ */

/**
 * The site switches as saved.
 *
 * @return array{sitemap?: bool, viewport?: bool, identity?: array}
 */
function genscore_site_fixes() {
	$s = get_option( GENSCORE_SITE_OPTION, array() );
	return is_array( $s ) ? $s : array();
}

/**
 * Whether the theme already prints the viewport: block themes always do, a
 * classic theme in its header.php.
 *
 * @return bool
 */
function genscore_theme_prints_viewport() {
	if ( function_exists( 'wp_is_block_theme' ) && wp_is_block_theme() ) {
		return true;
	}
	foreach ( array_unique( array( get_stylesheet_directory(), get_template_directory() ) ) as $dir ) {
		$file = $dir . '/header.php';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a local theme file.
		if ( is_readable( $file ) && false !== stripos( (string) file_get_contents( $file ), 'viewport' ) ) {
			return true;
		}
	}
	return false;
}

/**
 * Where an SEO plugin keeps each setting, for «Ir al ajuste».
 *
 * @param string $what sitemap, social or identity.
 * @return string|null Admin URL.
 */
function genscore_seo_settings_url( $what ) {
	$seo = genscore_seo_plugin();
	if ( ! $seo ) {
		return null;
	}
	$pages = array(
		'Yoast SEO'      => array( 'sitemap' => 'admin.php?page=wpseo_page_settings#/site-features', 'social' => 'admin.php?page=wpseo_page_settings#/site-features', 'identity' => 'admin.php?page=wpseo_page_settings#/site-representation' ),
		'Rank Math'      => array( 'sitemap' => 'admin.php?page=rank-math-options-sitemap', 'social' => 'admin.php?page=rank-math-options-titles#setting-panel-social', 'identity' => 'admin.php?page=rank-math-options-titles#setting-panel-local' ),
		'SEOPress'       => array( 'sitemap' => 'admin.php?page=seopress-xml-sitemap', 'social' => 'admin.php?page=seopress-social', 'identity' => null ),
		'All in One SEO' => array( 'sitemap' => 'admin.php?page=aioseo-sitemaps', 'social' => 'admin.php?page=aioseo-social-networks', 'identity' => 'admin.php?page=aioseo-search-appearance' ),
	);
	$p = $pages[ $seo['name'] ][ $what ] ?? null;
	return $p ? admin_url( $p ) : null;
}

/**
 * Whether a site switch can be turned on here, and if not, why.
 *
 * @param string $kind sitemap, viewport or identity.
 * @return string|true
 */
function genscore_site_available( $kind ) {
	$seo = genscore_seo_plugin();
	if ( 'sitemap' === $kind ) {
		if ( '0' === (string) get_option( 'blog_public' ) ) {
			return __( 'Tu web pide no salir en los buscadores (Ajustes > Lectura): así WordPress no publica sitemap.', 'genscore' );
		}
		if ( $seo ) {
			/* translators: %s: SEO plugin name. */
			return sprintf( __( '%s publica tu sitemap: actívalo en sus ajustes.', 'genscore' ), $seo['name'] );
		}
		if ( ! function_exists( 'wp_sitemaps_get_server' ) ) {
			return __( 'Tu WordPress no publica sitemap.', 'genscore' );
		}
	}
	if ( 'viewport' === $kind && genscore_theme_prints_viewport() && empty( genscore_site_fixes()['viewport'] ) ) {
		return __( 'Tu tema ya la pone en cada página.', 'genscore' );
	}
	if ( 'identity' === $kind && genscore_seo_prints_schema() ) {
		/* translators: %s: SEO plugin name. */
		return sprintf( __( '%s ya publica quién está detrás de tu web: complétalo en sus ajustes.', 'genscore' ), $seo['name'] );
	}
	return true;
}

/**
 * What WordPress and WooCommerce already know about who is behind the site.
 *
 * @return array
 */
function genscore_identity_defaults() {
	$out = array(
		'type'      => 'Organization',
		'name'      => trim( html_entity_decode( wp_strip_all_tags( get_bloginfo( 'name' ) ), ENT_QUOTES, 'UTF-8' ) ),
		'email'     => '',
		'telephone' => '',
		'street'    => '',
		'city'      => '',
		'postal'    => '',
		'region'    => '',
		'country'   => '',
		'hours'     => '',
		'sameAs'    => '',
	);
	if ( class_exists( 'WooCommerce' ) ) {
		$base           = explode( ':', (string) get_option( 'woocommerce_default_country', '' ) );
		$out['street']  = trim( get_option( 'woocommerce_store_address', '' ) . ' ' . get_option( 'woocommerce_store_address_2', '' ) );
		$out['city']    = (string) get_option( 'woocommerce_store_city', '' );
		$out['postal']  = (string) get_option( 'woocommerce_store_postcode', '' );
		$out['country'] = preg_match( '/^[A-Z]{2}$/', $base[0] ) ? $base[0] : '';
		$out['region']  = isset( $base[1] ) && function_exists( 'WC' ) && WC()->countries ? (string) ( WC()->countries->get_states( $base[0] )[ $base[1] ] ?? '' ) : '';
	}
	return array_map( 'strval', $out );
}

/**
 * The logo WordPress has: the theme's custom logo or the site icon.
 *
 * @return string
 */
function genscore_site_logo() {
	$logo = has_custom_logo() ? wp_get_attachment_image_url( (int) get_theme_mod( 'custom_logo' ), 'full' ) : '';
	return $logo ? $logo : (string) get_site_icon_url( 512 );
}

/**
 * Cleans who is behind the site, as the person reviewed it. It needs a name
 * and something to reach them by; a local business needs its address.
 *
 * @param array $raw Raw values.
 * @return array|null
 */
function genscore_clean_identity( $raw ) {
	$t   = function ( $k, $max ) use ( $raw ) {
		return mb_substr( sanitize_text_field( (string) ( $raw[ $k ] ?? '' ) ), 0, $max );
	};
	$out = array(
		'type'      => 'LocalBusiness' === ( $raw['type'] ?? '' ) ? 'LocalBusiness' : 'Organization',
		'name'      => $t( 'name', 120 ),
		'email'     => sanitize_email( (string) ( $raw['email'] ?? '' ) ),
		'telephone' => preg_replace( '/[^\d+()\s.-]/', '', $t( 'telephone', 30 ) ),
		'street'    => $t( 'street', 200 ),
		'city'      => $t( 'city', 80 ),
		'postal'    => $t( 'postal', 20 ),
		'region'    => $t( 'region', 80 ),
		'country'   => strtoupper( substr( sanitize_key( (string) ( $raw['country'] ?? '' ) ), 0, 2 ) ),
		'hours'     => '',
		'sameAs'    => '',
	);
	$hours = array();
	foreach ( preg_split( '/\r\n|\r|\n/', (string) ( $raw['hours'] ?? '' ) ) as $l ) {
		$l = trim( $l );
		if ( '' === $l ) {
			continue;
		}
		if ( ! preg_match( '/^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?(,(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?)* ([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d$/', $l ) ) {
			return null;
		}
		$hours[] = $l;
	}
	$out['hours'] = implode( "\n", array_slice( $hours, 0, 14 ) );
	$links        = array();
	foreach ( preg_split( '/\s+/', (string) ( $raw['sameAs'] ?? '' ) ) as $l ) {
		$u = esc_url_raw( trim( $l ), array( 'https', 'http' ) );
		if ( $u && wp_parse_url( $u, PHP_URL_HOST ) ) {
			$links[] = $u;
		}
	}
	$out['sameAs'] = implode( "\n", array_slice( array_unique( $links ), 0, 10 ) );
	if ( '' === $out['name'] || ( '' === $out['email'] && '' === $out['telephone'] && '' === $out['street'] ) ) {
		return null;
	}
	if ( 'LocalBusiness' === $out['type'] && ( '' === $out['street'] || '' === $out['city'] || '' === $out['country'] ) ) {
		return null;
	}
	if ( '' !== $out['country'] && ! preg_match( '/^[A-Z]{2}$/', $out['country'] ) ) {
		return null;
	}
	return $out;
}

/**
 * The identity as schema.org data.
 *
 * @param array $i From genscore_clean_identity().
 * @return array
 */
function genscore_identity_data( $i ) {
	$logo = genscore_site_logo();
	$data = array(
		'@context'  => 'https://schema.org',
		'@type'     => $i['type'],
		'@id'       => home_url( '/#genscore-organization' ),
		'name'      => $i['name'],
		'url'       => home_url( '/' ),
		'logo'      => $logo,
		'image'     => 'LocalBusiness' === $i['type'] ? $logo : '',
		'email'     => $i['email'],
		'telephone' => $i['telephone'],
		'address'   => '' !== $i['street'] || '' !== $i['city'] ? array(
			'@type'           => 'PostalAddress',
			'streetAddress'   => $i['street'],
			'addressLocality' => $i['city'],
			'postalCode'      => $i['postal'],
			'addressRegion'   => $i['region'],
			'addressCountry'  => $i['country'],
		) : null,
		'openingHours' => 'LocalBusiness' === $i['type'] && '' !== $i['hours'] ? explode( "\n", $i['hours'] ) : null,
		'sameAs'       => '' !== $i['sameAs'] ? explode( "\n", $i['sameAs'] ) : null,
	);
	$policy = genscore_cancel_policy();
	if ( $policy ) {
		$data['hasMerchantReturnPolicy'] = $policy;
	}
	return genscore_compact_front( $data );
}

/**
 * Drops empty values (front-end copy of genscore_compact(), which is admin only).
 *
 * @param array $data Data.
 * @return array
 */
function genscore_compact_front( $data ) {
	foreach ( $data as $k => $v ) {
		if ( is_array( $v ) ) {
			$v          = genscore_compact_front( $v );
			$data[ $k ] = $v;
		}
		if ( null === $v || '' === $v || array() === $v ) {
			unset( $data[ $k ] );
		}
	}
	return $data;
}

/**
 * Prints the viewport, who is behind the site and, on a page that carries
 * it, the cancellation policy.
 */
function genscore_site_head() {
	$s = genscore_site_fixes();
	if ( ! empty( $s['viewport'] ) ) {
		echo '<meta name="viewport" content="width=device-width, initial-scale=1">' . "\n";
	}
	if ( ! empty( $s['identity'] ) && is_array( $s['identity'] ) && ! genscore_seo_prints_schema() ) {
		genscore_print_jsonld( genscore_identity_data( $s['identity'] ) );
	}
	$id = genscore_fix_current_id();
	if ( $id && genscore_fix_get( $id, 'cancel' ) && 'product' !== get_post_type( $id ) ) {
		$policy = genscore_cancel_policy();
		if ( $policy ) {
			genscore_print_jsonld( array_merge( array( '@context' => 'https://schema.org' ), $policy ) );
		}
	}
}
add_action( 'wp_head', 'genscore_site_head', 1 );

/**
 * The sitemap stays on when GenScore turned it on, even if something else
 * switched it off.
 *
 * @param bool $on Enabled.
 * @return bool
 */
function genscore_sitemaps_enabled( $on ) {
	return ! empty( genscore_site_fixes()['sitemap'] ) && '0' !== (string) get_option( 'blog_public' ) ? true : $on;
}
add_filter( 'wp_sitemaps_enabled', 'genscore_sitemaps_enabled', 99 );

/**
 * /sitemap.xml is where every reader looks first. WordPress serves its
 * sitemap at /wp-sitemap.xml and only redirects with pretty permalinks.
 */
function genscore_sitemap_redirect() {
	if ( empty( genscore_site_fixes()['sitemap'] ) || ! function_exists( 'get_sitemap_url' ) || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$path = (string) wp_parse_url( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ), PHP_URL_PATH );
	$home = rtrim( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ), '/' );
	if ( $home . '/sitemap.xml' === $path ) {
		$url = get_sitemap_url( 'index' );
		if ( $url ) {
			wp_safe_redirect( $url, 301, 'GenScore' );
			exit;
		}
	}
}
add_action( 'init', 'genscore_sitemap_redirect', 1 );

/**
 * Fact, specifications and the cancellation policy, served over the content.
 *
 * @param string $content Content.
 * @return string
 */
function genscore_extra_content( $content ) {
	if ( ! is_singular() || ! in_the_loop() || ! is_main_query() ) {
		return $content;
	}
	$id = (int) get_the_ID();
	if ( ! $id || $id !== (int) get_queried_object_id() ) {
		return $content;
	}
	$cite = 'product' === get_post_type( $id ) ? null : genscore_cite_data( $id );
	if ( $cite ) {
		// Under the answer-first paragraph when there is one (priority 5), or first.
		$html = genscore_cite_html( $cite );
		$at   = strpos( $content, '</p>', (int) strpos( $content, 'genscore-lead' ) );
		$content = false !== strpos( $content, 'genscore-lead' ) && false !== $at ? substr( $content, 0, $at + 4 ) . $html . substr( $content, $at + 4 ) : $html . $content;
	}
	if ( 'product' === get_post_type( $id ) && genscore_fix_get( $id, 'specs' ) ) {
		$content .= genscore_spec_table( $id );
	}
	return $content;
}
add_filter( 'the_content', 'genscore_extra_content', 6 );

/**
 * A product's fact, under its title like its answer-first paragraph.
 */
function genscore_product_cite() {
	$id   = (int) get_the_ID();
	$cite = $id && is_singular( 'product' ) && $id === (int) get_queried_object_id() ? genscore_cite_data( $id ) : null;
	if ( $cite ) {
		echo genscore_cite_html( $cite ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped when built.
	}
}
add_action( 'woocommerce_single_product_summary', 'genscore_product_cite', 8 );

/**
 * The cancellation policy in a product's offers.
 *
 * @param array $data Product data.
 * @param int   $id   Product id.
 * @return array
 */
function genscore_with_cancel( $data, $id ) {
	if ( ! genscore_fix_get( $id, 'cancel' ) || genscore_fix_get( $id, 'returns' ) ) {
		return $data;
	}
	$policy = genscore_cancel_policy();
	return $policy ? genscore_offer_set( $data, 'hasMerchantReturnPolicy', $policy ) : $data;
}
