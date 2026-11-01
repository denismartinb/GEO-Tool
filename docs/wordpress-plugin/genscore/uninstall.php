<?php
/**
 * Removes everything GenScore stored. robots.txt and llms.txt go back to what
 * WordPress serves on its own, because GenScore never writes files.
 *
 * @package GenScore
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

foreach ( array( 'genscore_bots', 'genscore_llms_enabled', 'genscore_llms_custom', 'genscore_last_review', 'genscore_page_scores', 'genscore_scores_version', 'genscore_home_fixes', 'genscore_returns', 'genscore_fix_batches' ) as $genscore_option ) {
	delete_option( $genscore_option );
}

// What GenScore published in the pages through its own fields. What it wrote
// in the SEO plugin's fields (Yoast, Rank Math, SEOPress) stays: it is the
// page's description or title now, and the person sees it in the editor.
foreach ( array( '_genscore_jsonld', '_genscore_desc', '_genscore_title', '_genscore_canonical', '_genscore_fresh', '_genscore_returns' ) as $genscore_meta ) {
	delete_post_meta_by_key( $genscore_meta );
}
