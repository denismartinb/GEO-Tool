<?php
/**
 * Plain PHP tests for includes/robots.php. Run: php docs/wordpress-plugin/tests/robots-test.php
 * (also run by tests/wordpress-plugin.test.ts when php is installed).
 */

define( 'ABSPATH', __DIR__ . '/' );
require __DIR__ . '/../genscore/includes/robots.php';

$failures = 0;
function check( $name, $cond ) {
	global $failures;
	if ( $cond ) {
		echo "ok   $name\n";
	} else {
		echo "FAIL $name\n";
		++$failures;
	}
}

$wp = "User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n\nSitemap: https://ejemplo.es/wp-sitemap.xml\n";

// No settings: untouched.
check( 'no settings leaves robots.txt as is', genscore_apply_bot_rules( $wp, array() ) === $wp );

// Allow on a plain WordPress robots.txt: the bot already follows *, nothing to write.
check( 'allow alone leaves robots.txt as is', genscore_apply_bot_rules( $wp, array( 'chatgpt-search' => 'allow' ) ) === $wp );

// Off and on again gives back the original, byte for byte (Instinct, 2026-11-01).
$off = genscore_apply_bot_rules( $wp, array( 'chatgpt-training' => 'block' ) );
check( 'off writes the block', false !== strpos( $off, "User-agent: GPTBot\nDisallow: /" ) );
check( 'on again returns the original', genscore_apply_bot_rules( $wp, array( 'chatgpt-training' => 'allow' ) ) === $wp );
check( 'on again over an old GenScore block drops it', false === strpos( genscore_apply_bot_rules( $off, array( 'chatgpt-training' => 'allow' ) ), 'GPTBot' ) );

// Block.
$out = genscore_apply_bot_rules( $wp, array( 'chatgpt-training' => 'block' ) );
check( 'block writes Disallow: /', false !== strpos( $out, "User-agent: GPTBot\nDisallow: /" ) );

// Another plugin blocked GPTBot and ClaudeBot together; we allow GPTBot only.
$other = $wp . "\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n";
$out   = genscore_apply_bot_rules( $other, array( 'chatgpt-training' => 'allow' ) );
check( 'managed token removed from the other group', 1 === substr_count( $out, 'User-agent: GPTBot' ) );
check( 'allow group repeats the * rules', false !== strpos( $out, "User-agent: GPTBot\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nAllow: /" ) );
check( 'the * group stays', 0 === strpos( $out, "User-agent: *\nDisallow: /wp-admin/" ) );
check( 'sitemap stays', false !== strpos( $out, 'Sitemap: https://ejemplo.es/wp-sitemap.xml' ) );
check( 'unmanaged token in that group keeps its rule', false !== strpos( $out, "User-agent: ClaudeBot\nDisallow: /" ) );

// Running twice gives the same result (our own block is rebuilt, not repeated).
$once  = genscore_apply_bot_rules( $wp, array( 'claude-search' => 'allow', 'claude-training' => 'block' ) );
$twice = genscore_apply_bot_rules( $once, array( 'claude-search' => 'allow', 'claude-training' => 'block' ) );
check( 'idempotent', $once === $twice );
check( 'one BEGIN marker', 1 === substr_count( $twice, '# BEGIN GenScore' ) );

// Never touches * or Googlebot, whatever arrives.
$bad = genscore_sanitize_bot_settings( array( '*' => 'block', 'googlebot' => 'block', 'gemini' => 'maybe', 'perplexity-search' => 'block' ) );
check( 'unknown switches and values dropped', array( 'perplexity-search' => 'block' ) === $bad );
$out = genscore_apply_bot_rules( "User-agent: Googlebot\nDisallow:\n\n" . $wp, array( 'gemini' => 'block' ) );
check( 'Googlebot group untouched', false !== strpos( $out, "User-agent: Googlebot\nDisallow:" ) );
check( 'Google-Extended blocked on its own', false !== strpos( $out, "User-agent: Google-Extended\nDisallow: /" ) );

// * closes the whole site (maintenance): an allow does not reopen it for that bot.
$closed = "User-agent: *\nDisallow: /\n";
check( 'allow does not reopen a closed site', genscore_apply_bot_rules( $closed, array( 'perplexity-search' => 'allow' ) ) === $closed );

// * closed AND another plugin blocks GPTBot: allowing it must not open the
// site to GPTBot (Instinct, 1.0.2). The other plugin's group goes, and GPTBot
// follows * again, which is closed.
$closed_other = "User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n";
$out          = genscore_apply_bot_rules( $closed_other, array( 'chatgpt-training' => 'allow' ) );
check( 'closed site + other plugin: no allow group', ! preg_match( '/^Allow:/mi', $out ) && false === stripos( $out, 'User-agent: GPTBot' ) );
check( 'closed site + other plugin: * still closed', false !== strpos( $out, "User-agent: *\nDisallow: /" ) );
// «Allow: /» in * means open, even with a «Disallow: /» line before it.
check( 'star allow wins over star disallow', ! genscore_star_closes_site( genscore_robots_blocks( "User-agent: *\nDisallow: /\nAllow: /\n" ) ) );

exit( $failures ? 1 : 0 );
