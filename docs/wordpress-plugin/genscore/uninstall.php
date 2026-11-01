<?php
/**
 * Removes everything GenScore stored. robots.txt and llms.txt go back to what
 * WordPress serves on its own, because GenScore never writes files.
 *
 * @package GenScore
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

foreach ( array( 'genscore_bots', 'genscore_llms_enabled', 'genscore_llms_custom', 'genscore_last_review' ) as $genscore_option ) {
	delete_option( $genscore_option );
}
