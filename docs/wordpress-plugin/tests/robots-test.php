<?php
/**
 * Plain PHP tests for includes/robots.php. Run: php docs/wordpress-plugin/tests/robots-test.php
 * (also run by tests/wordpress-plugin.test.ts when php is installed).
 */

define( 'GENSCORE_TESTING', true );
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

// Allow: named group repeats the * rules, never opens /wp-admin/.
$out = genscore_apply_bot_rules( $wp, array( 'chatgpt-search' => 'allow' ) );
check( 'allow writes both ChatGPT search tokens', false !== strpos( $out, "User-agent: OAI-SearchBot\nUser-agent: ChatGPT-User\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nAllow: /" ) );
check( 'the * group stays', 0 === strpos( $out, "User-agent: *\nDisallow: /wp-admin/" ) );
check( 'sitemap stays', false !== strpos( $out, 'Sitemap: https://ejemplo.es/wp-sitemap.xml' ) );

// Block.
$out = genscore_apply_bot_rules( $wp, array( 'chatgpt-training' => 'block' ) );
check( 'block writes Disallow: /', false !== strpos( $out, "User-agent: GPTBot\nDisallow: /" ) );

// Another plugin blocked GPTBot and ClaudeBot together; we allow GPTBot only.
$other = $wp . "\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n";
$out   = genscore_apply_bot_rules( $other, array( 'chatgpt-training' => 'allow' ) );
check( 'managed token removed from the other group', 1 === substr_count( $out, 'User-agent: GPTBot' ) );
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

// A blanket Disallow: / in * is not copied into an Allow group.
$closed = "User-agent: *\nDisallow: /\n";
$out    = genscore_apply_bot_rules( $closed, array( 'perplexity-search' => 'allow' ) );
check( 'blanket rule not repeated', false !== strpos( $out, "User-agent: Perplexity-User\nAllow: /" ) );

exit( $failures ? 1 : 0 );
