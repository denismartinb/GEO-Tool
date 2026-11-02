import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WP-PLUGIN-1 (log §421). The WordPress plugin reuses the Chrome extension's
 * page reading and scoring as is, so the score a site sees in wp-admin is the
 * one the extension shows. A copy that drifts is two «Nota SEO + IA».
 */

const ROOT = process.cwd();
const PLUGIN = join(ROOT, "docs/wordpress-plugin/genscore");
const EXTENSION = join(ROOT, "docs/chrome-extension/prueba/extension");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]
  );
}

describe("WordPress plugin", () => {
  it.each(["collect.js", "score.js"])("vendor/%s is the extension's file, byte for byte", (file) => {
    expect(read(join(PLUGIN, "assets/vendor", file))).toBe(read(join(EXTENSION, file)));
  });

  // WP-PLUGIN-2 (log §432): the only outbound calls live in account.php, run
  // on the server after «Conectar con GenScore», and only read.
  it("calls out only from account.php, and the browser never calls genscore.es", () => {
    const files = filesUnder(PLUGIN).filter((f) => /\.(php|js)$/.test(f) && !f.includes("/vendor/"));
    for (const f of files.filter((x) => !x.endsWith("includes/account.php"))) {
      const code = read(f);
      expect(code, f).not.toMatch(/wp_remote_(get|post|request)|wp_safe_remote|curl_init|file_get_contents\(\s*['"]https?:/);
      expect(code, f).not.toMatch(/fetch\(\s*["'`]https?:/);
    }
  });

  it("account.php only reads GenScore's API and only for an administrator", () => {
    const src = read(join(PLUGIN, "includes/account.php"));
    // The only GenScore API paths it calls are the two read-only ones.
    const paths = [...src.matchAll(/genscore_api_get\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(paths)).toEqual(new Set(["/api/ext/context", "/api/ext/project"]));
    // Every entry point checks the capability; AJAX ones check the nonce too.
    for (const fn of ["genscore_oauth_start", "genscore_oauth_return", "genscore_ajax_account", "genscore_ajax_disconnect"]) {
      const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf("\n}\n", src.indexOf(`function ${fn}(`)));
      expect(body, fn).toContain("current_user_can( 'manage_options' )");
      if (fn.startsWith("genscore_ajax")) expect(body, fn).toContain("check_ajax_referer( 'genscore', 'nonce' )");
    }
    // PKCE with S256 and a state compared in constant time; tokens never autoloaded.
    expect(src).toContain("'code_challenge_method' => 'S256'");
    expect(src).toContain("hash_equals( $pending['state'], $state )");
    expect(src).toMatch(/update_option\(\s*GENSCORE_ACCOUNT_OPTION,[\s\S]*?false\s*\);/);
  });

  // WP-PLUGIN-3 (log §432): «Crear borrador» only creates a draft, from the
  // plan GenScore already sent, and only for an administrator.
  it("«Crear borrador» only creates a draft from the cached plan", () => {
    const src = read(join(PLUGIN, "includes/drafts.php"));
    const fn = "genscore_ajax_create_draft";
    const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf("\n}\n", src.indexOf(`function ${fn}(`)));
    expect(body).toContain("check_ajax_referer( 'genscore', 'nonce' )");
    expect(body).toContain("current_user_can( 'manage_options' )");
    expect(body).toContain("'post_status'  => 'draft'");
    expect(body).not.toMatch(/'publish'|wp_publish_post/);
    // The only input is the plan position; the text comes from the cached account data.
    expect([...body.matchAll(/\$_POST\['([a-z_]+)'\]/g)].map((m) => m[1])).toEqual(["plan", "plan"]);
    expect(src).toContain("genscore_account_data( false )");
  });

  it("the token never reaches the browser", () => {
    const screen = read(join(PLUGIN, "includes/account.php"));
    const data = screen.slice(screen.indexOf("function genscore_account_screen_data"));
    expect(data).not.toMatch(/access|refresh/);
    expect(read(join(PLUGIN, "assets/admin.js"))).not.toMatch(/Bearer|access_token|refresh_token/);
  });

  it("every PHP file refuses to run outside WordPress", () => {
    for (const file of filesUnder(PLUGIN).filter((f) => f.endsWith(".php") && !f.endsWith("index.php"))) {
      const src = read(file);
      expect(src, file).toMatch(/defined\( '(ABSPATH|WP_UNINSTALL_PLUGIN)' \)/);
    }
  });

  it("has no em dashes in what a person reads", () => {
    const text = filesUnder(PLUGIN)
      .filter((f) => /\.(php|js|txt|css)$/.test(f) && !f.includes("/vendor/"))
      .map(read)
      .join("\n");
    expect(text).not.toContain("—");
  });

  const php = spawnSync("php", ["-v"]).status === 0;
  it.skipIf(!php)("robots.txt rules pass their PHP tests", () => {
    const out = execFileSync("php", [join(ROOT, "docs/wordpress-plugin/tests/robots-test.php")], {
      encoding: "utf8"
    });
    expect(out).not.toContain("FAIL");
  });

  it.skipIf(!php)("one-click fixes helpers pass their PHP tests", () => {
    const out = execFileSync("php", [join(ROOT, "docs/wordpress-plugin/tests/fixes-test.php")], {
      encoding: "utf8"
    });
    expect(out).not.toContain("FAIL");
  });
});
