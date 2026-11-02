<?php
/**
 * «Versiones en Markdown» (plugin 1.5.0, WP-PLUGIN-5): each public page,
 * post and product of the review list answers at its address ending in .md
 * with its text as Markdown, and llms.txt lists those addresses when
 * GenScore publishes it.
 *
 * Built from what WordPress stores (title, content, excerpt, and the price
 * and stock WooCommerce has when the file is served). Nothing is invented,
 * nothing is written to disk, and turning the switch off undoes it all.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

const GENSCORE_MD_OPTION = 'genscore_md_enabled';

/**
 * Pretty permalinks: with «Simple» (?p=12) there is no address to add .md to.
 *
 * @return bool
 */
function genscore_md_pretty() {
	return '' !== (string) get_option( 'permalink_structure' );
}

/**
 * Whether the .md versions are being served.
 *
 * @return bool
 */
function genscore_md_enabled() {
	return (bool) get_option( GENSCORE_MD_OPTION, false ) && genscore_md_pretty() && '0' !== (string) get_option( 'blog_public' );
}

/**
 * The .md address of a page from genscore_review_choice() or the home page.
 *
 * @param array $choice Page choice.
 * @return string|null
 */
function genscore_md_url( $choice ) {
	if ( 0 === (int) $choice['id'] ) {
		return home_url( '/index.md' );
	}
	$url = (string) $choice['url'];
	if ( false !== strpos( $url, '?' ) ) {
		return null;
	}
	return untrailingslashit( $url ) . '.md';
}

/**
 * The llms.txt section that lists the .md versions: the review's important
 * pages, in the same order.
 *
 * @return string[] Lines, without the heading.
 */
function genscore_md_lines() {
	$out = array();
	foreach ( genscore_key_pages() as $c ) {
		$md = genscore_md_url( $c );
		if ( $md ) {
			$title = 0 === (int) $c['id'] ? genscore_one_line( get_bloginfo( 'name' ) ) : genscore_one_line( $c['title'] );
			$out[] = '- [' . ( '' !== $title ? $title : $md ) . '](' . $md . ')';
		}
	}
	return $out;
}

/**
 * The section appended to the llms.txt GenScore serves.
 *
 * @return string
 */
function genscore_md_section() {
	$lines = genscore_md_lines();
	return $lines ? "\n## " . __( 'Páginas en Markdown', 'genscore' ) . "\n\n" . implode( "\n", $lines ) . "\n" : '';
}

/**
 * What the screen needs.
 *
 * @return array
 */
function genscore_md_screen_data() {
	$enabled = genscore_md_enabled();
	return array(
		'enabled' => $enabled,
		'pretty'  => genscore_md_pretty(),
		'heading' => __( 'Páginas en Markdown', 'genscore' ),
		'sample'  => $enabled ? array_slice( genscore_md_lines(), 0, 3 ) : array(),
	);
}

/**
 * The post behind a .md request, or 0 for the home page, or null.
 *
 * @param string $path Request path.
 * @return int|null
 */
function genscore_md_resolve( $path ) {
	$home = trailingslashit( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ) );
	if ( 0 !== strpos( $path, $home ) || '.md' !== substr( $path, -3 ) ) {
		return null;
	}
	$rel = substr( $path, strlen( $home ), -3 );
	if ( 'index' === $rel ) {
		return 0;
	}
	if ( '' === $rel ) {
		return null;
	}
	foreach ( array( home_url( '/' . $rel . '/' ), home_url( '/' . $rel ) ) as $candidate ) {
		$id = url_to_postid( $candidate );
		if ( $id ) {
			$choice = genscore_review_choice( $id );
			if ( ! $choice || in_array( (int) $id, genscore_llms_skipped_pages(), true ) && (int) get_option( 'page_on_front' ) !== (int) $id ) {
				return null;
			}
			return (int) $id;
		}
	}
	return null;
}

/**
 * Answers /<page>.md before WordPress looks for a post.
 */
function genscore_md_maybe_serve() {
	$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '', PHP_URL_PATH );
	if ( ! is_string( $path ) || '.md' !== substr( $path, -3 ) || ! genscore_md_enabled() ) {
		return;
	}
	$id = genscore_md_resolve( rawurldecode( $path ) );
	if ( null === $id ) {
		return;
	}
	$canonical = 0 === $id ? home_url( '/' ) : get_permalink( $id );
	header( 'Content-Type: text/markdown; charset=utf-8' );
	header( 'X-Robots-Tag: noindex' );
	header( 'Link: <' . esc_url_raw( $canonical ) . '>; rel="canonical"' );
	echo genscore_md_render( $id ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Markdown text file, not HTML.
	exit;
}
add_action( 'parse_request', 'genscore_md_maybe_serve', 0 );

/**
 * Points the HTML page to its .md version.
 */
function genscore_md_head_link() {
	if ( ! genscore_md_enabled() ) {
		return;
	}
	$choice = null;
	if ( is_front_page() ) {
		$choice = genscore_home_choice();
	} elseif ( is_singular( array( 'page', 'post', 'product' ) ) ) {
		$id     = get_queried_object_id();
		$choice = in_array( (int) $id, genscore_llms_skipped_pages(), true ) ? null : genscore_review_choice( $id );
	}
	$md = $choice ? genscore_md_url( $choice ) : null;
	if ( $md ) {
		echo '<link rel="alternate" type="text/markdown" href="' . esc_url( $md ) . '">' . "\n";
	}
}
add_action( 'wp_head', 'genscore_md_head_link', 2 );

/**
 * The Markdown of one page (0 is the home page).
 *
 * @param int $id Post id or 0.
 * @return string
 */
function genscore_md_render( $id ) {
	$front = (int) get_option( 'page_on_front' );
	if ( 0 === $id && ! $front ) {
		$out = array( '# ' . genscore_one_line( get_bloginfo( 'name' ) ) );
		$tag = genscore_one_line( get_bloginfo( 'description' ) );
		if ( '' !== $tag ) {
			$out[] = '';
			$out[] = '> ' . $tag;
		}
		$posts = get_posts( array( 'post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => 10, 'has_password' => false ) );
		if ( $posts ) {
			$out[] = '';
			$out[] = '## ' . __( 'Últimas entradas', 'genscore' );
			$out[] = '';
			foreach ( $posts as $p ) {
				$out[] = genscore_llms_line( $p );
			}
		}
		return implode( "\n", $out ) . "\n";
	}
	$post = get_post( 0 === $id ? $front : $id );
	if ( ! $post ) {
		return '';
	}
	$title = 0 === $id ? get_bloginfo( 'name' ) : get_the_title( $post );
	$out   = array( '# ' . genscore_one_line( html_entity_decode( $title, ENT_QUOTES, 'UTF-8' ) ), '' );
	if ( 'product' === $post->post_type && function_exists( 'wc_get_product' ) ) {
		$product = wc_get_product( $post->ID );
		if ( $product ) {
			$price = $product->get_price();
			if ( '' !== (string) $price ) {
				$out[] = '- ' . __( 'Precio', 'genscore' ) . ': ' . html_entity_decode( wp_strip_all_tags( wc_price( wc_get_price_to_display( $product ) ) ), ENT_QUOTES, 'UTF-8' );
			}
			$out[] = '- ' . __( 'Disponibilidad', 'genscore' ) . ': ' . ( $product->is_in_stock() ? __( 'En stock', 'genscore' ) : __( 'Agotado', 'genscore' ) );
			$out[] = '';
			$short = genscore_html_to_md( $post->post_excerpt );
			if ( '' !== $short ) {
				$out[] = $short;
				$out[] = '';
			}
		}
	}
	$body = genscore_is_sample_content( $post->post_content ) ? '' : genscore_html_to_md( genscore_blocks_html( strip_shortcodes( (string) $post->post_content ) ) );
	if ( '' !== $body ) {
		$out[] = $body;
		$out[] = '';
	}
	$out[] = '---';
	$out[] = '';
	$out[] = __( 'Página original', 'genscore' ) . ': ' . ( 0 === $id ? home_url( '/' ) : get_permalink( $post ) );
	return implode( "\n", $out ) . "\n";
}

/**
 * HTML to Markdown: headings, paragraphs, lists, links, bold, quotes and
 * table rows. Scripts, styles, forms and images are left out.
 *
 * @param string $html HTML.
 * @return string
 */
function genscore_html_to_md( $html ) {
	$html = trim( (string) $html );
	if ( '' === $html || ! class_exists( 'DOMDocument' ) ) {
		return '' === $html ? '' : trim( wp_strip_all_tags( $html ) );
	}
	$dom  = new DOMDocument();
	$prev = libxml_use_internal_errors( true );
	$dom->loadHTML( '<?xml encoding="utf-8"?><div id="gs-md-root">' . $html . '</div>', LIBXML_NONET );
	libxml_clear_errors();
	libxml_use_internal_errors( $prev );
	$root = $dom->getElementById( 'gs-md-root' );
	if ( ! $root ) {
		return trim( wp_strip_all_tags( $html ) );
	}
	$blocks = array();
	genscore_md_walk( $root, $blocks );
	$text = implode( "\n\n", array_filter( array_map( 'trim', $blocks ), 'strlen' ) );
	return trim( preg_replace( "/\n{3,}/", "\n\n", $text ) );
}

/**
 * Inline text of a node, with links and bold.
 *
 * @param DOMNode $node Node.
 * @return string
 */
function genscore_md_inline( $node ) {
	$t = '';
	foreach ( $node->childNodes as $c ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
		if ( XML_TEXT_NODE === $c->nodeType ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
			$t .= $c->nodeValue; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
			continue;
		}
		if ( XML_ELEMENT_NODE !== $c->nodeType ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
			continue;
		}
		$tag = strtolower( $c->nodeName ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
		if ( in_array( $tag, array( 'script', 'style', 'noscript', 'form', 'button', 'svg', 'img', 'iframe' ), true ) ) {
			continue;
		}
		$in = trim( preg_replace( '/\s+/u', ' ', genscore_md_inline( $c ) ) );
		if ( 'br' === $tag ) {
			$t .= "\n";
		} elseif ( 'a' === $tag && '' !== $in && preg_match( '#^https?://#i', (string) $c->getAttribute( 'href' ) ) ) {
			$t .= '[' . str_replace( array( '[', ']' ), array( '(', ')' ), $in ) . '](' . $c->getAttribute( 'href' ) . ')';
		} elseif ( ( 'strong' === $tag || 'b' === $tag ) && '' !== $in ) {
			$t .= ' **' . $in . '** ';
		} else {
			$t .= ' ' . $in . ' ';
		}
	}
	return $t;
}

/**
 * Walks the content and collects one Markdown block per element.
 *
 * @param DOMNode  $node   Node.
 * @param string[] $blocks Blocks so far.
 */
function genscore_md_walk( $node, &$blocks ) {
	foreach ( $node->childNodes as $c ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
		if ( XML_TEXT_NODE === $c->nodeType ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
			$v = trim( preg_replace( '/\s+/u', ' ', $c->nodeValue ) ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
			if ( '' !== $v ) {
				$blocks[] = $v;
			}
			continue;
		}
		if ( XML_ELEMENT_NODE !== $c->nodeType ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
			continue;
		}
		$tag  = strtolower( $c->nodeName ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
		$line = function ( $n ) {
			return trim( preg_replace( '/[ \t]+/u', ' ', preg_replace( '/ ?\n ?/u', "\n", genscore_md_inline( $n ) ) ) );
		};
		if ( in_array( $tag, array( 'script', 'style', 'noscript', 'form', 'svg', 'img', 'iframe', 'button', 'nav' ), true ) ) {
			continue;
		}
		if ( preg_match( '/^h([1-6])$/', $tag, $m ) ) {
			$v = $line( $c );
			if ( '' !== $v ) {
				$blocks[] = str_repeat( '#', min( 6, (int) $m[1] + 1 ) ) . ' ' . $v;
			}
		} elseif ( 'p' === $tag || 'figcaption' === $tag ) {
			$blocks[] = $line( $c );
		} elseif ( 'blockquote' === $tag ) {
			$blocks[] = '> ' . str_replace( "\n", "\n> ", $line( $c ) );
		} elseif ( 'ul' === $tag || 'ol' === $tag ) {
			$items = array();
			$i     = 0;
			foreach ( $c->childNodes as $li ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
				if ( XML_ELEMENT_NODE === $li->nodeType && 'li' === strtolower( $li->nodeName ) ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
					$v = $line( $li );
					if ( '' !== $v ) {
						$items[] = ( 'ol' === $tag ? ( ++$i ) . '. ' : '- ' ) . $v;
					}
				}
			}
			$blocks[] = implode( "\n", $items );
		} elseif ( 'table' === $tag ) {
			$rows = array();
			foreach ( $c->getElementsByTagName( 'tr' ) as $n => $tr ) {
				$cells = array();
				foreach ( $tr->childNodes as $td ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
					if ( XML_ELEMENT_NODE === $td->nodeType && in_array( strtolower( $td->nodeName ), array( 'td', 'th' ), true ) ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
						$cells[] = str_replace( '|', '/', $line( $td ) );
					}
				}
				if ( $cells ) {
					$rows[] = '| ' . implode( ' | ', $cells ) . ' |';
					if ( 0 === $n ) {
						$rows[] = '|' . str_repeat( ' --- |', count( $cells ) );
					}
				}
			}
			$blocks[] = implode( "\n", $rows );
		} else {
			genscore_md_walk( $c, $blocks );
		}
	}
}
