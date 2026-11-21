<?php
/**
 * Removes everything GenScore stored. robots.txt and llms.txt go back to what
 * WordPress serves on its own, because GenScore never writes files.
 *
 * @package GenScore
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

foreach ( array( 'genscore_bots', 'genscore_llms_enabled', 'genscore_llms_custom', 'genscore_last_review', 'genscore_page_scores', 'genscore_scores_version', 'genscore_scores_gen', 'genscore_home_fixes', 'genscore_returns', 'genscore_shipping', 'genscore_fix_batches', 'genscore_account', 'genscore_oauth_client', 'genscore_drafts', 'genscore_site_fixes', 'genscore_cancel' ) as $genscore_option ) {
	delete_option( $genscore_option );
}

// What GenScore published in the pages through its own fields. What it wrote
// in the SEO plugin's fields (Yoast, Rank Math, SEOPress) stays: it is the
// page's description or title now, and the person sees it in the editor.
delete_transient( 'genscore_account_data' );
delete_transient( 'genscore_oauth_meta' );

foreach ( array( '_genscore_jsonld', '_genscore_desc', '_genscore_title', '_genscore_canonical', '_genscore_fresh', '_genscore_returns', '_genscore_lead', '_genscore_h2', '_genscore_h1', '_genscore_og', '_genscore_hreflang', '_genscore_shipping', '_genscore_rating', '_genscore_gtin', '_genscore_faq', '_genscore_alt', '_genscore_noindex', '_genscore_snippet', '_genscore_specs', '_genscore_cancel', '_genscore_cite' ) as $genscore_meta ) {
	delete_post_meta_by_key( $genscore_meta );
}
