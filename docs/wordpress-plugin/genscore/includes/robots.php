<?php
/**
 * AI bots in robots.txt.
 *
 * Pure functions (no WordPress calls) so tests/robots-test.php can run them
 * with plain PHP. The only thing GenScore ever touches in robots.txt is the
 * groups of the AI bot tokens below: never `*`, never Googlebot, never
 * Bingbot. Everything else WordPress or another plugin wrote is kept as is.
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/**
 * The switches the screen shows. Each switch owns one or more tokens and they
 * always move together: an engine only counts as able to read a page when every
 * one of its search tokens may (same rule as the Chrome extension, score.js).
 *
 * @return array<string, array{tokens: string[], engine: string, kind: string}>
 */
function genscore_bot_switches() {
	return array(
		'chatgpt-search'    => array( 'tokens' => array( 'OAI-SearchBot', 'ChatGPT-User' ), 'engine' => 'chatgpt', 'kind' => 'search' ),
		'chatgpt-training'  => array( 'tokens' => array( 'GPTBot' ), 'engine' => 'chatgpt', 'kind' => 'training' ),
		'claude-search'     => array( 'tokens' => array( 'Claude-SearchBot', 'Claude-User' ), 'engine' => 'claude', 'kind' => 'search' ),
		'claude-training'   => array( 'tokens' => array( 'ClaudeBot' ), 'engine' => 'claude', 'kind' => 'training' ),
		'perplexity-search' => array( 'tokens' => array( 'PerplexityBot', 'Perplexity-User' ), 'engine' => 'perplexity', 'kind' => 'search' ),
		'gemini'            => array( 'tokens' => array( 'Google-Extended' ), 'engine' => 'gemini', 'kind' => 'search' ),
	);
}

/**
 * Keeps only known switch ids and the two allowed values.
 *
 * @param mixed $raw Raw option or request value.
 * @return array<string, string> switch id => 'allow' | 'block'
 */
function genscore_sanitize_bot_settings( $raw ) {
	$out = array();
	if ( ! is_array( $raw ) ) {
		return $out;
	}
	$switches = genscore_bot_switches();
	foreach ( $raw as $id => $value ) {
		if ( isset( $switches[ $id ] ) && ( 'allow' === $value || 'block' === $value ) ) {
			$out[ $id ] = $value;
		}
	}
	return $out;
}

/**
 * Splits robots.txt into blocks: groups (consecutive User-agent lines and the
 * rules after them) and loose lines (comments, Sitemap, blank lines).
 *
 * @param string $text robots.txt content.
 * @return array<int, array{type: string, agents?: string[], lines: string[]}>
 */
function genscore_robots_blocks( $text ) {
	$blocks     = array();
	$cur        = null;
	$last_agent = false;
	foreach ( preg_split( '/\r\n|\n|\r/', (string) $text ) as $raw ) {
		$line = trim( preg_replace( '/#.*$/', '', $raw ) );
		if ( preg_match( '/^user-agent\s*:\s*(.*)$/i', $line, $m ) ) {
			if ( null === $cur || ! $last_agent ) {
				$blocks[]   = array( 'type' => 'group', 'agents' => array(), 'lines' => array() );
				$cur        = count( $blocks ) - 1;
			}
			$blocks[ $cur ]['agents'][] = trim( $m[1] );
			$last_agent                 = true;
			continue;
		}
		$last_agent = false;
		if ( null !== $cur && preg_match( '/^(allow|disallow|crawl-delay)\s*:/i', $line ) ) {
			$blocks[ $cur ]['lines'][] = rtrim( $raw );
			continue;
		}
		if ( '' !== $line && ! preg_match( '/^(sitemap|host)\s*:/i', $line ) && null !== $cur ) {
			// Unknown directive inside a group: keep it with the group.
			$blocks[ $cur ]['lines'][] = rtrim( $raw );
			continue;
		}
		$cur      = null;
		$blocks[] = array( 'type' => 'loose', 'lines' => array( rtrim( $raw ) ) );
	}
	return $blocks;
}

/**
 * The `*` group's rules, minus a blanket «Allow: /» or «Disallow: /». A named
 * group makes a crawler ignore `*` entirely (RFC 9309), so an «Allow» group
 * has to repeat these or it would open /wp-admin/ to that bot.
 *
 * @param array $blocks From genscore_robots_blocks().
 * @return string[]
 */
function genscore_star_rules( $blocks ) {
	$rules = array();
	foreach ( $blocks as $b ) {
		if ( 'group' !== $b['type'] || ! in_array( '*', $b['agents'], true ) ) {
			continue;
		}
		foreach ( $b['lines'] as $l ) {
			if ( ! preg_match( '/^\s*(allow|disallow)\s*:\s*(.*)$/i', $l, $m ) ) {
				continue;
			}
			$path = trim( preg_replace( '/#.*$/', '', $m[2] ) );
			if ( '/' === $path || '' === $path ) {
				continue;
			}
			$line = ucfirst( strtolower( $m[1] ) ) . ': ' . $path;
			if ( ! in_array( $line, $rules, true ) ) {
				$rules[] = $line;
			}
		}
	}
	return $rules;
}

/**
 * Whether the `*` group closes the whole site («Disallow: /» with no
 * «Allow: /»), as a maintenance or «coming soon» plugin does. While it does,
 * no switch may open the site to a bot: an «Allow» group would.
 *
 * @param array $blocks From genscore_robots_blocks().
 * @return bool
 */
function genscore_star_closes_site( $blocks ) {
	$closed = false;
	foreach ( $blocks as $b ) {
		if ( 'group' !== $b['type'] || ! in_array( '*', $b['agents'], true ) ) {
			continue;
		}
		foreach ( $b['lines'] as $l ) {
			if ( ! preg_match( '/^\s*(allow|disallow)\s*:\s*(.*)$/i', $l, $m ) ) {
				continue;
			}
			if ( '/' === trim( preg_replace( '/#.*$/', '', $m[2] ) ) ) {
				if ( 'allow' === strtolower( $m[1] ) ) {
					return false;
				}
				$closed = true;
			}
		}
	}
	return $closed;
}

/**
 * Applies the saved switches to a robots.txt. Tokens with a setting are taken
 * out of every existing group (so an older «Disallow: /» from another plugin
 * cannot win a tie) and written again in GenScore's own block at the end.
 *
 * «Allow» only writes a group when it changes something: the token was taken
 * out of another group (another plugin blocked it). Otherwise the bot follows
 * `*`, so turning a switch off and on again gives back the robots.txt
 * WordPress built, byte for byte, and closing the whole site with `*` (say,
 * in maintenance) closes it to that bot too. While `*` closes the site, no
 * «Allow» group is written at all, even for a token another plugin blocked.
 *
 * @param string               $text     robots.txt as WordPress built it.
 * @param array<string,string> $settings switch id => allow|block.
 * @return string
 */
function genscore_apply_bot_rules( $text, $settings ) {
	$settings = genscore_sanitize_bot_settings( $settings );
	if ( ! $settings ) {
		return $text;
	}
	$switches = genscore_bot_switches();
	$managed  = array();
	foreach ( $settings as $id => $value ) {
		foreach ( $switches[ $id ]['tokens'] as $t ) {
			$managed[ strtolower( $t ) ] = array( 'token' => $t, 'value' => $value );
		}
	}

	$blocks = genscore_robots_blocks( $text );
	$star   = genscore_star_rules( $blocks );
	$closed = genscore_star_closes_site( $blocks );
	$out      = array();
	$skip     = false;
	$stripped = array();
	foreach ( $blocks as $b ) {
		if ( 'loose' === $b['type'] ) {
			// Our own block from an earlier pass is rebuilt below.
			if ( '# BEGIN GenScore' === trim( $b['lines'][0] ) ) {
				$skip = true;
				continue;
			}
			if ( '# END GenScore' === trim( $b['lines'][0] ) ) {
				$skip = false;
				continue;
			}
			if ( ! $skip ) {
				$out[] = $b['lines'][0];
			}
			continue;
		}
		if ( $skip ) {
			continue;
		}
		$agents = array();
		foreach ( $b['agents'] as $a ) {
			if ( isset( $managed[ strtolower( $a ) ] ) ) {
				$stripped[ strtolower( $a ) ] = true;
			} else {
				$agents[] = $a;
			}
		}
		if ( ! $agents ) {
			continue;
		}
		foreach ( $agents as $a ) {
			$out[] = 'User-agent: ' . $a;
		}
		foreach ( $b['lines'] as $l ) {
			$out[] = $l;
		}
	}

	while ( $out && '' === trim( end( $out ) ) ) {
		array_pop( $out );
	}

	$allow  = array();
	$block  = array();
	foreach ( $managed as $key => $m ) {
		if ( 'block' === $m['value'] ) {
			$block[] = $m['token'];
		} elseif ( isset( $stripped[ $key ] ) && ! $closed ) {
			$allow[] = $m['token'];
		}
	}
	if ( ! $allow && ! $block ) {
		// Nothing to say: the bots follow `*`. An older GenScore block, if
		// any, is dropped above; otherwise the text goes back untouched.
		return $stripped || false !== strpos( $text, '# BEGIN GenScore' ) ? implode( "\n", $out ) . "\n" : $text;
	}
	$own = array( '', '# BEGIN GenScore' );
	if ( $allow ) {
		foreach ( $allow as $t ) {
			$own[] = 'User-agent: ' . $t;
		}
		foreach ( $star as $r ) {
			$own[] = $r;
		}
		$own[] = 'Allow: /';
		$own[] = '';
	}
	if ( $block ) {
		foreach ( $block as $t ) {
			$own[] = 'User-agent: ' . $t;
		}
		$own[] = 'Disallow: /';
		$own[] = '';
	}
	$own[] = '# END GenScore';

	return implode( "\n", array_merge( $out, $own ) ) . "\n";
}
