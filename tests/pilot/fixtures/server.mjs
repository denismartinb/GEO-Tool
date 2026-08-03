#!/usr/bin/env node
/**
 * Minimal stand-in for the GEO Studio app, used only by
 * `pnpm pilot:selfcheck` to prove the pilot harness itself works.
 *
 * It is NOT a mock of the product and it never asserts anything about product
 * behaviour. Its only job is to exercise the harness end to end without a
 * Supabase session or a reachable deployment: login → session cookie →
 * authenticated pages → screenshots → findings → verdict.
 *
 * Run with PILOT_FIXTURE_BREAK=overflow to make every page overflow
 * horizontally, which must flip the verdict to PILOT FAIL. That negative case
 * is the point: a gate that cannot fail is not a gate.
 *
 * The citations page also carries a few real .cit2-* class names (info-tip,
 * row/detail toggle, search + result count) so the "tooltip and row expand
 * actually work" journey (core-flow.spec.ts) can run against the fixture too,
 * not just against a real deployment — proving the CLICK/HOVER/TYPE mechanics
 * of the harness itself work, independent of whether a live Vercel preview is
 * reachable.
 */

import { createServer } from "node:http";

const SESSION_COOKIE = "pilot_fixture_session";
const BREAK_MODE = process.env.PILOT_FIXTURE_BREAK ?? "";
const PROJECT_ID = "fixture-project";

const AUTHED_PAGES = new Map([
  ["/dashboard", "Panel"],
  ["/dashboard/projects", "Proyectos"],
  [`/dashboard/projects/${PROJECT_ID}`, "Visión general"],
  [`/dashboard/projects/${PROJECT_ID}/prompts`, "Prompts"],
  [`/dashboard/projects/${PROJECT_ID}/competitors`, "Competidores"],
  [`/dashboard/projects/${PROJECT_ID}/recommendations`, "Recomendaciones"],
  [`/dashboard/projects/${PROJECT_ID}/runs`, "Escaneos"],
  [`/dashboard/projects/${PROJECT_ID}/web-audit`, "Auditoría web"]
]);

// Bare-bones equivalents of the real .info-tip (pure-CSS hover reveal) and
// .cit2-row/.cit2-opp-item (click-to-toggle "open") classes from
// app/globals.css — just enough for the interaction test's selectors and
// assertions to hold, not a copy of the real styling.
const CITATIONS_STYLE = `
  .info-tip { position: relative; display: inline-block; cursor: help; }
  .info-tip-bubble { position: absolute; display: none; background: #111; color: #fff; padding: 4px 8px; }
  .info-tip:hover .info-tip-bubble, .info-tip:focus .info-tip-bubble { display: block; }
  .cit2-detail { display: none; }
  .cit2-row.open .cit2-detail, .cit2-opp-item.open .cit2-detail { display: block; }
`;
const CITATIONS_SCRIPT = `
  document.querySelectorAll(".cit2-rowmain, .cit2-opp-row").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.closest(".cit2-row, .cit2-opp-item").classList.toggle("open");
    });
  });
  (function () {
    var input = document.querySelector(".cit2-search input");
    if (!input) return;
    var rows = Array.prototype.slice.call(document.querySelectorAll(".cit2-row"));
    var total = rows.length;
    var count = document.querySelector(".cit2-filtercount");
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      var visible = 0;
      rows.forEach(function (row) {
        var match = !q || row.textContent.toLowerCase().indexOf(q) !== -1;
        row.style.display = match ? "" : "none";
        if (match) visible++;
      });
      if (q && visible !== total) {
        count.textContent = visible + " de " + total;
        count.style.display = "";
      } else {
        count.style.display = "none";
      }
    });
  })();
`;

function citationsPage() {
  return `<style>${CITATIONS_STYLE}</style>
    <div class="cit2-kpis">
      <div class="cit2-k">
        Respuestas con cita
        <!-- The long aria-label is deliberate: it reproduces the real
             production incident (2026-08-02, ENAMETOOLONG) where an
             accessible .info-tip's unbounded aria-label sailed into a
             Playwright attachment name uncapped. explore.ts must cap it
             regardless of source, or this fixture's own selfcheck run
             reproduces the crash on a screen the explorer is supposed to
             pass cleanly. -->
        <span
          class="info-tip"
          tabindex="0"
          aria-label="Media simple de tus señales disponibles: cobertura de temas, temas implementados, citados por la IA, y salud técnica. Cada componente se muestra al lado — un componente sin auditar no cuenta como 0, simplemente no entra en la media."
        >
          <span class="info-tip-icon">i</span>
          <span class="info-tip-bubble">Tooltip de prueba de la fixture</span>
        </span>
      </div>
      <div class="cit2-v">50%</div>
    </div>
    <div class="cit2-search"><input type="text" placeholder="Buscar página o dominio…" /></div>
    <div class="cit2-filtercount" style="display:none"></div>
    <div class="cit2-row">
      <button type="button" class="cit2-rowmain">fixture-company.example</button>
      <div class="cit2-detail">Prompt y evidencia de prueba.</div>
    </div>
    <div class="cit2-row">
      <button type="button" class="cit2-rowmain">fixture-other.example</button>
      <div class="cit2-detail">Prompt y evidencia de prueba.</div>
    </div>
    <div class="cit2-opp-item">
      <button type="button" class="cit2-opp-row">fixture-opportunity.example</button>
      <div class="cit2-detail">Prompt y evidencia de prueba.</div>
    </div>
    <!-- Deliberate dead control: looks interactive, does nothing. The
         explorer must report it as outcome:"dead". Present in BOTH fixture
         modes on purpose — it proves the detector works, and it is the
         explorer's report (not the run's exit code) that carries it, so it
         must not flip the healthy fixture to FAIL. -->
    <button type="button" data-pilot-explore class="fixture-dead-control">Control muerto de prueba</button>
    <!-- Deliberate write-looking control: the explorer must REFUSE this one
         (outcome:"skipped") rather than click it. Guards the scope rule that
         keeps the pilot away from anything that could hit Supabase. -->
    <button type="button" data-pilot-explore>Eliminar proyecto</button>
    <script>${CITATIONS_SCRIPT}</script>`;
}

// Reproduces the EXACT clipping chain of the real console shell
// (`.shell { height: 100vh; overflow: hidden }` > `.dash-main` (`min-height:
// 0`, the flex-shrink trick) > `.dash-content { flex: 1; overflow-y: auto }`,
// app/globals.css + app/dashboard/layout.tsx) so the "shell-clip" self-check
// case below exercises the SAME structural bug journey.ts's
// SHELL_CLIPPING_CLASSES fix targets — not a synthetic stand-in for it. A
// wide marker and a marker 2000px below the fold both live inside
// `.dash-content`; neither the document nor the plain-overflow fixture mode
// above them ever sees either, only `.dash-content` does.
const SHELL_CLIP_STYLE = `
  .shell { height: 100vh; overflow: hidden; display: flex; }
  .dash-main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .dash-content { flex: 1; overflow-y: auto; padding: 16px; }
`;

function shellClipBody(title, body) {
  return `<div class="shell"><div class="dash-main"><main class="dash-content">
    <h1>${title}</h1>
    ${body}
    <div style="width:2200px" id="shell-clip-wide-marker">ancho fuera del shell</div>
    <div style="height:2000px"></div>
    <div id="shell-clip-fold-marker">marcador bajo el pliegue, solo visible si la captura ve el contenido real de .dash-content</div>
  </main></div></div>`;
}

function html(title, body) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  // Only authed dashboard pages go through the real shell in production —
  // login and 404 render outside it, so this must not wrap them either.
  const isShellPage = BREAK_MODE === "shell-clip" && title !== "Bienvenido de nuevo" && title !== "No encontrado";
  const content = isShellPage ? shellClipBody(title, body) : `<h1>${title}</h1>${body}${overflow}`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;font-family:system-ui;padding:16px}${isShellPage ? SHELL_CLIP_STYLE : ""}</style>
</head><body>${content}</body></html>`;
}

function loginPage() {
  return html(
    "Bienvenido de nuevo",
    `<form method="POST" action="/login">
       <label for="email">Email de trabajo</label>
       <input id="email" name="email" type="email" required>
       <label for="password">Contraseña</label>
       <input id="password" name="password" type="password" required>
       <button type="submit">Iniciar sesión</button>
     </form>`
  );
}

function projectsPage() {
  return html(
    "Proyectos",
    `<a href="/dashboard/projects/${PROJECT_ID}">Proyecto de prueba</a>`
  );
}

/**
 * Minimal stand-ins for the "this screen has real data" anchors each read-only
 * journey declares via `ContentExpectation` (tests/pilot/support/journey.ts).
 *
 * The fixture used to serve a generic `<p>contenido</p>` for every authed
 * page, which was fine while the harness only checked for breakage. It is not
 * fine now: `assertPageIsHealthy` fails a screen that renders no real content,
 * so a fixture serving placeholders would make the "healthy fixture must
 * PASS" half of `pnpm pilot:selfcheck` fail for the right reason on the wrong
 * subject. Modelling a project WITH data is also simply more honest — an
 * empty account is the state the pilot must refuse, not the state it
 * self-checks against.
 *
 * Deliberately the smallest markup that satisfies each anchor; this is not an
 * attempt to mirror the real screens.
 */
function screenBody(path) {
  // `empty` reproduces the exact production state that made the pilot lie on
  // 2026-08-02: every screen loads cleanly, with no console error, no failed
  // request and no overflow — and shows a placeholder instead of the product.
  // The self-check asserts the pilot FAILS here; a harness that passes this
  // fixture has lost the only defence against certifying an empty account.
  if (BREAK_MODE === "empty") {
    return "<p>Todavía no has auditado tu web</p>";
  }

  if (path === `/dashboard/projects/${PROJECT_ID}`) {
    return "<h2>Puntuación GEO</h2><p>62 / 100</p><p>Tasa de mención 40%</p>";
  }
  if (path === `/dashboard/projects/${PROJECT_ID}/prompts`) {
    return '<p>GenScore monitoriza 3 prompts activos</p><div class="pr2-page">Prompt de prueba</div>';
  }
  if (path === `/dashboard/projects/${PROJECT_ID}/competitors`) {
    return '<table class="tbl"><tr><td>fixture-rival.example</td><td>Cuota de voz 22%</td></tr></table>';
  }
  if (path === `/dashboard/projects/${PROJECT_ID}/recommendations`) {
    return '<h2>Backlog de acciones</h2><div class="rec-card">Recomendación de prueba</div>';
  }
  if (path === `/dashboard/projects/${PROJECT_ID}/runs`) {
    // A table, not prose: the journey anchors on `.run-tbl` because the real
    // page's status text sits inside `.scan-status`, which globals.css hides
    // below 900px. Keep this in sync with that anchor.
    return `<table class="run-tbl"><tbody><tr><td>1</td><td>1 ago 2026</td><td>Completado</td></tr></tbody></table>`;
  }
  if (path === `/dashboard/projects/${PROJECT_ID}/web-audit`) {
    // The tablist is exactly what the web-audit journey anchors on, because
    // the real tabs only exist once the project has a coverage audit.
    return `<div role="tablist" aria-label="Secciones de la auditoría">
        <button role="tab" aria-selected="true">Problemas</button>
        <button role="tab" aria-selected="false">Correcto</button>
        <button role="tab" aria-selected="false">Páginas</button>
      </div>
      <p>4 páginas sin datos estructurados</p>`;
  }
  return "<p>contenido</p>";
}

function isAuthenticated(request) {
  return (request.headers.cookie ?? "").includes(`${SESSION_COOKIE}=1`);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (path === "/login" && request.method === "POST") {
    // Accept any credentials: the fixture verifies harness plumbing, not auth.
    response.writeHead(303, {
      Location: "/dashboard",
      "Set-Cookie": `${SESSION_COOKIE}=1; Path=/; HttpOnly`
    });
    response.end();
    return;
  }

  if (path === "/login") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(loginPage());
    return;
  }

  const citationsPath = `/dashboard/projects/${PROJECT_ID}/citations`;
  if (path === citationsPath) {
    if (!isAuthenticated(request)) {
      response.writeHead(303, { Location: "/login" });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html("Páginas citadas", citationsPage()));
    return;
  }

  if (AUTHED_PAGES.has(path)) {
    if (!isAuthenticated(request)) {
      response.writeHead(303, { Location: "/login" });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      path === "/dashboard/projects"
        ? projectsPage()
        : html(AUTHED_PAGES.get(path) ?? "", screenBody(path))
    );
    return;
  }

  response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html("No encontrado", ""));
});

const port = Number(process.env.PILOT_FIXTURE_PORT ?? 4321);
server.listen(port, () => {
  console.log(`pilot fixture listening on http://127.0.0.1:${port} (break=${BREAK_MODE || "none"})`);
});
