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

  // WP-PLUGIN-4 (1.4.0, log §432): the questions come from GenScore's plan on
  // the server; the browser only sends the answers the person wrote.
  it("«Añadir preguntas» only publishes answers to the plan's own questions", () => {
    const src = read(join(PLUGIN, "includes/drafts.php"));
    const fn = "genscore_ajax_faq_publish";
    const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf("\n}\n", src.indexOf(`function ${fn}(`)));
    expect(body).toContain("check_ajax_referer( 'genscore', 'nonce' )");
    expect(body).toContain("genscore_ajax_guard()");
    expect(body).toContain("$item['questions']");
    expect(body).toContain("genscore_clean_faq(");
    expect(body).not.toMatch(/wp_update_post|post_content/);
  });

  // A rival's facts are never written by the plugin: their cells say what is missing.
  it("comparison drafts never fill a rival's cell", () => {
    const src = read(join(PLUGIN, "includes/drafts.php"));
    expect(src).toContain("define( 'GENSCORE_PENDING', '[Pendiente' );");
    const body = src.slice(src.indexOf("function genscore_draft_content("));
    expect(body).toContain("array_fill( 0, count( $rivals ), GENSCORE_PENDING . ': dato, enlace y fecha]' )");
  });

  // 1.4.1 (log §432 adenda): the comparison table copied to the clipboard
  // never fills a rival's cell either.
  it("the copied comparison table never fills a rival's cell", () => {
    const src = read(join(PLUGIN, "includes/drafts.php"));
    const fn = "genscore_compare_table_html";
    const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf("\n}\n", src.indexOf(`function ${fn}(`)));
    expect(body).toContain("GENSCORE_PENDING . ': dato, enlace y fecha]'");
  });

  // Plugin Check (mismatched_plugin_name): the header and the readme title match.
  it("the plugin name matches the readme title", () => {
    const header = /Plugin Name:\s*(.+)/.exec(read(join(PLUGIN, "genscore.php")))?.[1].trim();
    const title = /^===\s*(.+?)\s*===/.exec(read(join(PLUGIN, "readme.txt")))?.[1];
    expect(header).toBe(title);
  });

  // 1.4.2 (log §432 adenda): rendering blocks inside wp_head turns the theme's
  // inline block styles into <link> tags, so text is read from parse_blocks.
  it("never renders blocks to get text", () => {
    for (const f of ["fixes.php", "fixes-more.php", "fixes-site.php", "fixes-admin.php", "drafts.php"]) {
      const code = read(join(PLUGIN, "includes", f)).replace(/^\s*(\*|\/\/).*$/gm, "");
      expect(code).not.toMatch(/excerpt_remove_blocks\s*\(|do_blocks\s*\(|render_block\s*\(/);
    }
  });

  // «Añadir dato»: the page comes from the cached plan on the server, the fact
  // from the person, checked before writing; the post content is never edited.
  it("«Añadir dato» publishes only on the plan's own page", () => {
    const src = read(join(PLUGIN, "includes/drafts.php"));
    const fn = "genscore_ajax_cite_publish";
    const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf("\n}\n", src.indexOf(`function ${fn}(`)));
    expect(body).toContain("check_ajax_referer( 'genscore', 'nonce' )");
    expect(body).toContain("genscore_ajax_guard()");
    expect(body).toContain("genscore_plan_page_id( $item )");
    expect(body).toContain("genscore_clean_cite(");
    expect(body).not.toMatch(/\$_POST\['(page|url|id)'\]|wp_update_post|post_content/);
  });

  // Site-wide fixes never touch robots.txt: WordPress announces its own sitemap.
  it("site-wide fixes are a fixed list and never write robots.txt", () => {
    const src = read(join(PLUGIN, "includes/fixes-admin.php"));
    const fn = "genscore_ajax_site_publish";
    const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf("\n}\n", src.indexOf(`function ${fn}(`)));
    expect(body).toContain("check_ajax_referer( 'genscore', 'nonce' )");
    expect(body).toContain("array( 'sitemap', 'viewport', 'identity' )");
    expect(body).toContain("genscore_clean_identity(");
    expect(read(join(PLUGIN, "includes/fixes-site.php"))).not.toMatch(/robots_txt|genscore_save_bots|file_put_contents/);
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

  it.skipIf(!php)("Markdown versions and «Lo que lee la IA» pass their PHP tests", () => {
    const out = execFileSync("php", [join(ROOT, "docs/wordpress-plugin/tests/markdown-test.php")], {
      encoding: "utf8"
    });
    expect(out).not.toContain("FAIL");
  });

  // WP-PLUGIN-5 (log §450): the .md section is added when llms.txt is served,
  // never saved into the person's text, so the switch undoes it entirely.
  it("the .md versions are appended to llms.txt when served, never saved", () => {
    const llms = read(join(PLUGIN, "includes/llms.php"));
    const content = llms.slice(llms.indexOf("function genscore_llms_content("));
    expect(content).toContain("genscore_md_section()");
    const admin = read(join(PLUGIN, "includes/admin.php"));
    const save = admin.slice(admin.indexOf("function genscore_ajax_save_llms("), admin.indexOf("add_action( 'wp_ajax_genscore_save_llms'"));
    expect(save).not.toContain("genscore_md_");
    expect(read(join(PLUGIN, "uninstall.php"))).toContain("'genscore_md_enabled'");
  });

  // WP-PLUGIN-5 (log §450): «Lo que lee la IA» gives global figures, never a
  // list of pages, and stores only numbers.
  it("«Lo que lee la IA» never lists pages and stores only numbers", () => {
    const js = read(join(PLUGIN, "assets/admin.js"));
    const ai = js.slice(js.indexOf("function aiCard("), js.indexOf("function aiMini("));
    expect(ai).not.toMatch(/page\.(title|path|url)/);
    const view = read(join(PLUGIN, "assets/aiview.js"));
    expect(view).toMatch(/return \{ state: "ok", pct: pct, words: seen\.length, k: k \}/);
    const pages = read(join(PLUGIN, "includes/pages.php"));
    const san = pages.slice(pages.indexOf("function genscore_sanitize_ai_view("), pages.indexOf("function genscore_store_page_score("));
    expect(san).toMatch(/'pct' +=>[\s\S]*'w' +=>[\s\S]*'k' +=>/);
  });

  it.skipIf(!php)("one-click fixes helpers pass their PHP tests", () => {
    const out = execFileSync("php", [join(ROOT, "docs/wordpress-plugin/tests/fixes-test.php")], {
      encoding: "utf8"
    });
    expect(out).not.toContain("FAIL");
  });
});
