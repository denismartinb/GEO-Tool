<?php
/**
 * Plugin Name:       GenScore: visibilidad en IA, llms.txt y bots de IA
 * Plugin URI:        https://www.genscore.es/
 * Description:       Comprueba si ChatGPT, Gemini, Claude y Perplexity pueden leer tu web, publica tu llms.txt, controla los bots de IA en robots.txt y revisa el SEO básico de tus páginas y publica los arreglos con un clic.
 * Version:           1.1.1
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            GenScore
 * Author URI:        https://www.genscore.es/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       genscore
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

define( 'GENSCORE_VERSION', '1.1.1' );
define( 'GENSCORE_FILE', __FILE__ );
define( 'GENSCORE_DIR', plugin_dir_path( __FILE__ ) );
define( 'GENSCORE_URL', plugin_dir_url( __FILE__ ) );

require_once GENSCORE_DIR . 'includes/robots.php';
require_once GENSCORE_DIR . 'includes/llms.php';
require_once GENSCORE_DIR . 'includes/site.php';
require_once GENSCORE_DIR . 'includes/pages.php';
require_once GENSCORE_DIR . 'includes/fixes.php';
if ( is_admin() ) {
	require_once GENSCORE_DIR . 'includes/admin.php';
	require_once GENSCORE_DIR . 'includes/fixes-admin.php';
	require_once GENSCORE_DIR . 'includes/account.php';
}

/**
 * Applies the AI bot switches to the robots.txt WordPress serves. Runs last
 * so it sees what other plugins added. A site that asks search engines not to
 * index it is left alone: WordPress already blocks everyone there.
 *
 * @param string $output robots.txt.
 * @param string $public blog_public.
 * @return string
 */
function genscore_robots_txt( $output, $public ) {
	if ( '0' === (string) $public ) {
		return $output;
	}
	return genscore_apply_bot_rules( $output, get_option( 'genscore_bots', array() ) );
}
add_filter( 'robots_txt', 'genscore_robots_txt', 999, 2 );
