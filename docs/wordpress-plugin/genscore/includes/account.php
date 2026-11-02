<?php
/**
 * «Conectar con GenScore»: the site reads the figures of the person's GenScore
 * account, the same ones the Chrome extension shows (WP-PLUGIN-2, log §432).
 *
 * OAuth 2.1 with PKCE against the authorization server GenScore publishes
 * (Supabase Auth, the same door as GenScore's MCP connector). The site
 * registers itself as a public client (dynamic registration), the person
 * approves it on genscore.es, and the tokens stay in this site's database,
 * read only by the server: the browser never sees them. Read-only: the plugin
 * only calls GET /api/ext/context and GET /api/ext/project.
 *
 * Nothing here runs until an administrator presses «Conectar con GenScore».
 *
 * @package GenScore
 */

defined( 'ABSPATH' ) || exit;

/** Where the access token and the client registration live (never autoloaded). */
const GENSCORE_ACCOUNT_OPTION = 'genscore_account';
const GENSCORE_CLIENT_OPTION  = 'genscore_oauth_client';
/** The figures are kept this long, so the screen does not call genscore.es on every load. */
const GENSCORE_ACCOUNT_TTL = 600;

/**
 * Where GenScore sends the person back after approving. Fixed by the plugin,
 * never taken from a request.
 *
 * @return string
 */
function genscore_oauth_redirect_uri() {
	return admin_url( 'admin-post.php?action=genscore_oauth' );
}

/**
 * GenScore's authorization server metadata (RFC 8414), cached for a day.
 *
 * @return array|null
 */
function genscore_oauth_metadata() {
	$cached = get_transient( 'genscore_oauth_meta' );
	if ( is_array( $cached ) ) {
		return $cached;
	}
	$res = wp_remote_get( GENSCORE_APP . '/.well-known/oauth-authorization-server', array( 'timeout' => 10 ) );
	if ( is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) ) {
		return null;
	}
	$meta = json_decode( wp_remote_retrieve_body( $res ), true );
	$keys = array( 'authorization_endpoint', 'token_endpoint', 'registration_endpoint' );
	foreach ( $keys as $key ) {
		if ( empty( $meta[ $key ] ) || ! is_string( $meta[ $key ] ) || 0 !== strpos( $meta[ $key ], 'https://' ) ) {
			return null;
		}
	}
	$out = array(
		'authorization_endpoint' => $meta['authorization_endpoint'],
		'token_endpoint'         => $meta['token_endpoint'],
		'registration_endpoint'  => $meta['registration_endpoint'],
		'revocation_endpoint'    => isset( $meta['revocation_endpoint'] ) && is_string( $meta['revocation_endpoint'] ) && 0 === strpos( $meta['revocation_endpoint'], 'https://' ) ? $meta['revocation_endpoint'] : '',
	);
	set_transient( 'genscore_oauth_meta', $out, DAY_IN_SECONDS );
	return $out;
}

/**
 * This site's client id, registering it the first time. A registration made
 * for another address (the site moved) is made again.
 *
 * @param array $meta Authorization server metadata.
 * @return string|null
 */
function genscore_oauth_client_id( $meta ) {
	$redirect = genscore_oauth_redirect_uri();
	$client   = get_option( GENSCORE_CLIENT_OPTION );
	if ( is_array( $client ) && ! empty( $client['id'] ) && isset( $client['redirect'] ) && $client['redirect'] === $redirect ) {
		return $client['id'];
	}
	$facts = genscore_site_facts();
	$res   = wp_remote_post(
		$meta['registration_endpoint'],
		array(
			'timeout' => 15,
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode(
				array(
					/* translators: %s: the site's domain. */
					'client_name'                => sprintf( __( 'GenScore para WordPress (%s)', 'genscore' ), $facts['domain'] ),
					'redirect_uris'              => array( $redirect ),
					'grant_types'                => array( 'authorization_code', 'refresh_token' ),
					'response_types'             => array( 'code' ),
					'token_endpoint_auth_method' => 'none',
				)
			),
		)
	);
	if ( is_wp_error( $res ) ) {
		return null;
	}
	$code = (int) wp_remote_retrieve_response_code( $res );
	$body = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( $code < 200 || $code > 299 || empty( $body['client_id'] ) || ! is_string( $body['client_id'] ) ) {
		return null;
	}
	update_option(
		GENSCORE_CLIENT_OPTION,
		array(
			'id'       => sanitize_text_field( $body['client_id'] ),
			'redirect' => $redirect,
		),
		false
	);
	return sanitize_text_field( $body['client_id'] );
}

/**
 * URL-safe base64 without padding (PKCE, RFC 7636).
 *
 * @param string $bytes Raw bytes.
 * @return string
 */
function genscore_b64url( $bytes ) {
	return rtrim( strtr( base64_encode( $bytes ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- PKCE code challenge (RFC 7636).
}

/**
 * Sends the person to GenScore to approve the connection.
 */
function genscore_oauth_start() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'No tienes permiso para hacer esto.', 'genscore' ), 403 );
	}
	check_admin_referer( 'genscore_connect' );
	$meta   = genscore_oauth_metadata();
	$client = $meta ? genscore_oauth_client_id( $meta ) : null;
	if ( ! $client ) {
		genscore_oauth_back( 'unreachable' );
	}
	$verifier = genscore_b64url( random_bytes( 48 ) );
	$state    = genscore_b64url( random_bytes( 24 ) );
	set_transient(
		'genscore_oauth_' . get_current_user_id(),
		array(
			'verifier' => $verifier,
			'state'    => $state,
		),
		15 * MINUTE_IN_SECONDS
	);
	$url = add_query_arg(
		array(
			'response_type'         => 'code',
			'client_id'             => rawurlencode( $client ),
			'redirect_uri'          => rawurlencode( genscore_oauth_redirect_uri() ),
			'code_challenge'        => genscore_b64url( hash( 'sha256', $verifier, true ) ),
			'code_challenge_method' => 'S256',
			'state'                 => $state,
		),
		$meta['authorization_endpoint']
	);
	wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- GenScore's authorization server, read from its own metadata.
	exit;
}
add_action( 'admin_post_genscore_connect', 'genscore_oauth_start' );

/**
 * Back to the GenScore screen, with what happened.
 *
 * @param string $result connected|denied|expired|unreachable.
 */
function genscore_oauth_back( $result ) {
	wp_safe_redirect( add_query_arg( 'genscore_account', $result, admin_url( 'admin.php?page=genscore' ) ) );
	exit;
}

/**
 * GenScore sends the person back here with a code: it is exchanged for tokens
 * only if the state is the one this administrator started, within 15 minutes.
 */
function genscore_oauth_return() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'No tienes permiso para hacer esto.', 'genscore' ), 403 );
	}
	$key     = 'genscore_oauth_' . get_current_user_id();
	$pending = get_transient( $key );
	delete_transient( $key );
	// The state below is this flow's CSRF check (OAuth 2.1, §7.12): it was made for this administrator and is single-use.
	$state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$code  = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( ! is_array( $pending ) || '' === $state || ! hash_equals( $pending['state'], $state ) ) {
		genscore_oauth_back( 'expired' );
	}
	if ( '' === $code ) {
		genscore_oauth_back( 'denied' );
	}
	$meta   = genscore_oauth_metadata();
	$client = get_option( GENSCORE_CLIENT_OPTION );
	if ( ! $meta || ! is_array( $client ) || empty( $client['id'] ) ) {
		genscore_oauth_back( 'unreachable' );
	}
	$tokens = genscore_token_request(
		$meta,
		array(
			'grant_type'    => 'authorization_code',
			'code'          => $code,
			'redirect_uri'  => genscore_oauth_redirect_uri(),
			'client_id'     => $client['id'],
			'code_verifier' => $pending['verifier'],
		)
	);
	if ( ! is_array( $tokens ) ) {
		genscore_oauth_back( 'unreachable' );
	}
	genscore_save_tokens( $tokens, get_current_user_id() );
	genscore_forget_account_data();
	genscore_oauth_back( 'connected' );
}
add_action( 'admin_post_genscore_oauth', 'genscore_oauth_return' );

/**
 * One call to the token endpoint.
 *
 * @param array $meta   Authorization server metadata.
 * @param array $params Form parameters.
 * @return array|string Tokens, or 'invalid' when the grant was refused, or 'unreachable'.
 */
function genscore_token_request( $meta, $params ) {
	$res = wp_remote_post(
		$meta['token_endpoint'],
		array(
			'timeout' => 15,
			'body'    => $params,
		)
	);
	if ( is_wp_error( $res ) ) {
		return 'unreachable';
	}
	$code = (int) wp_remote_retrieve_response_code( $res );
	$body = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( 200 === $code && ! empty( $body['access_token'] ) && is_string( $body['access_token'] ) ) {
		return $body;
	}
	return $code >= 400 && $code < 500 ? 'invalid' : 'unreachable';
}

/**
 * Keeps the tokens, never autoloaded.
 *
 * @param array $tokens Token response.
 * @param int   $user   Administrator who connected.
 */
function genscore_save_tokens( $tokens, $user ) {
	$old = get_option( GENSCORE_ACCOUNT_OPTION );
	update_option(
		GENSCORE_ACCOUNT_OPTION,
		array(
			'access'  => (string) $tokens['access_token'],
			'refresh' => ! empty( $tokens['refresh_token'] ) ? (string) $tokens['refresh_token'] : ( is_array( $old ) && ! empty( $old['refresh'] ) ? $old['refresh'] : '' ),
			'expires' => time() + max( 60, isset( $tokens['expires_in'] ) ? (int) $tokens['expires_in'] : 3600 ),
			'user'    => $user ? (int) $user : ( is_array( $old ) && isset( $old['user'] ) ? (int) $old['user'] : 0 ),
		),
		false
	);
}

/**
 * A valid access token, renewing it when it is about to expire.
 *
 * @return string|null Token, or null when the site is not connected (or no longer is).
 */
function genscore_access_token() {
	$acct = get_option( GENSCORE_ACCOUNT_OPTION );
	if ( ! is_array( $acct ) || empty( $acct['access'] ) ) {
		return null;
	}
	if ( (int) $acct['expires'] > time() + 60 ) {
		return $acct['access'];
	}
	return genscore_refresh_token();
}

/**
 * Renews the access token. A refused refresh token disconnects the site.
 *
 * @return string|null
 */
function genscore_refresh_token() {
	$acct   = get_option( GENSCORE_ACCOUNT_OPTION );
	$meta   = genscore_oauth_metadata();
	$client = get_option( GENSCORE_CLIENT_OPTION );
	if ( ! is_array( $acct ) || empty( $acct['refresh'] ) || ! $meta || ! is_array( $client ) || empty( $client['id'] ) ) {
		return null;
	}
	$tokens = genscore_token_request(
		$meta,
		array(
			'grant_type'    => 'refresh_token',
			'refresh_token' => $acct['refresh'],
			'client_id'     => $client['id'],
		)
	);
	if ( 'invalid' === $tokens ) {
		genscore_disconnect_account( false );
		return null;
	}
	if ( ! is_array( $tokens ) ) {
		return null;
	}
	genscore_save_tokens( $tokens, 0 );
	return (string) $tokens['access_token'];
}

/**
 * One GET to GenScore's read-only API with the token.
 *
 * @param string $path  /api/ext/... path.
 * @param array  $query Query arguments.
 * @param bool   $retry Renew the token and try once more on a 401.
 * @return array { status: int, body: array|null }
 */
function genscore_api_get( $path, $query = array(), $retry = true ) {
	$token = genscore_access_token();
	if ( ! $token ) {
		return array(
			'status' => 401,
			'body'   => null,
		);
	}
	$res = wp_remote_get(
		add_query_arg( $query, GENSCORE_APP . $path ),
		array(
			'timeout' => 30,
			'headers' => array(
				'Authorization' => 'Bearer ' . $token,
				'Accept'        => 'application/json',
			),
		)
	);
	if ( is_wp_error( $res ) ) {
		return array(
			'status' => 0,
			'body'   => null,
		);
	}
	$status = (int) wp_remote_retrieve_response_code( $res );
	if ( 401 === $status && $retry && genscore_refresh_token() ) {
		return genscore_api_get( $path, $query, false );
	}
	$body = json_decode( wp_remote_retrieve_body( $res ), true );
	return array(
		'status' => $status,
		'body'   => is_array( $body ) ? $body : null,
	);
}

/**
 * Whether the site holds a connection (it may still turn out to be revoked).
 *
 * @return bool
 */
function genscore_is_connected() {
	$acct = get_option( GENSCORE_ACCOUNT_OPTION );
	return is_array( $acct ) && ! empty( $acct['access'] );
}

/**
 * What the screen shows about the account, cached for GENSCORE_ACCOUNT_TTL.
 *
 * @param bool $fresh Skip the cache.
 * @return array { state: off|connected|not_found|expired|error, context?, project? }
 */
function genscore_account_data( $fresh = false ) {
	if ( ! genscore_is_connected() ) {
		return array( 'state' => 'off' );
	}
	if ( ! $fresh ) {
		$cached = get_transient( 'genscore_account_data' );
		if ( is_array( $cached ) ) {
			return $cached;
		}
	}
	$ctx = genscore_api_get( '/api/ext/context' );
	if ( 401 === $ctx['status'] ) {
		genscore_disconnect_account( false );
		return array( 'state' => 'expired' );
	}
	if ( 200 !== $ctx['status'] || ! $ctx['body'] ) {
		return array( 'state' => 'error' );
	}
	$facts = genscore_site_facts();
	$proj  = genscore_api_get( '/api/ext/project', array( 'domain' => $facts['domain'] ) );
	if ( 200 === $proj['status'] && $proj['body'] ) {
		$out = array(
			'state'   => 'connected',
			'context' => $ctx['body'],
			'project' => $proj['body'],
		);
	} elseif ( 404 === $proj['status'] ) {
		$out = array(
			'state'   => 'not_found',
			'context' => $ctx['body'],
		);
	} else {
		return array( 'state' => 'error' );
	}
	set_transient( 'genscore_account_data', $out, GENSCORE_ACCOUNT_TTL );
	return $out;
}

/** Drops the cached figures. */
function genscore_forget_account_data() {
	delete_transient( 'genscore_account_data' );
}

/**
 * Forgets the connection. With $revoke, also tells GenScore to drop the
 * refresh token when it publishes a revocation endpoint.
 *
 * @param bool $revoke Ask GenScore to revoke the token.
 */
function genscore_disconnect_account( $revoke = true ) {
	$acct = get_option( GENSCORE_ACCOUNT_OPTION );
	if ( $revoke && is_array( $acct ) && ! empty( $acct['refresh'] ) ) {
		$meta   = genscore_oauth_metadata();
		$client = get_option( GENSCORE_CLIENT_OPTION );
		if ( $meta && ! empty( $meta['revocation_endpoint'] ) && is_array( $client ) && ! empty( $client['id'] ) ) {
			wp_remote_post(
				$meta['revocation_endpoint'],
				array(
					'timeout' => 10,
					'body'    => array(
						'token'           => $acct['refresh'],
						'token_type_hint' => 'refresh_token',
						'client_id'       => $client['id'],
					),
				)
			);
		}
	}
	delete_option( GENSCORE_ACCOUNT_OPTION );
	genscore_forget_account_data();
}

/** AJAX: the account's figures for this site. */
function genscore_ajax_account() {
	check_ajax_referer( 'genscore', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( null, 403 );
	}
	$fresh = isset( $_POST['fresh'] ) && '1' === $_POST['fresh'];
	wp_send_json_success( genscore_account_data( $fresh ) );
}
add_action( 'wp_ajax_genscore_account', 'genscore_ajax_account' );

/** AJAX: «Desconectar». */
function genscore_ajax_disconnect() {
	check_ajax_referer( 'genscore', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( null, 403 );
	}
	genscore_disconnect_account( true );
	wp_send_json_success( array( 'state' => 'off' ) );
}
add_action( 'wp_ajax_genscore_disconnect', 'genscore_ajax_disconnect' );

/**
 * What the screen starts with: the cached figures if there are any (no call to
 * genscore.es while the page loads), the connect link and, after coming back
 * from GenScore, what happened.
 *
 * @return array
 */
function genscore_account_screen_data() {
	$cached = genscore_is_connected() ? get_transient( 'genscore_account_data' ) : null;
	$result = isset( $_GET['genscore_account'] ) ? sanitize_key( wp_unslash( $_GET['genscore_account'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- only picks which message to show.
	return array(
		'connected' => genscore_is_connected(),
		'data'      => is_array( $cached ) ? $cached : null,
		'connect'   => add_query_arg( '_wpnonce', wp_create_nonce( 'genscore_connect' ), admin_url( 'admin-post.php?action=genscore_connect' ) ),
		'result'    => in_array( $result, array( 'connected', 'denied', 'expired', 'unreachable' ), true ) ? $result : '',
	);
}
