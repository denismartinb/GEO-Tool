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
 * row/detail toggle) so the "tooltip and row expand actually work" journey
 * (core-flow.spec.ts) can run against the fixture too, not just against a
 * real deployment — proving the CLICK/HOVER mechanics of the harness itself
 * work, independent of whether a live Vercel preview is reachable.
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
`;

function citationsPage() {
  return `<style>${CITATIONS_STYLE}</style>
    <div class="cit2-kpis">
      <div class="cit2-k">
        Respuestas con cita
        <span class="info-tip" tabindex="0">
          <span class="info-tip-icon">i</span>
          <span class="info-tip-bubble">Tooltip de prueba de la fixture</span>
        </span>
      </div>
      <div class="cit2-v">50%</div>
    </div>
    <div class="cit2-row">
      <button type="button" class="cit2-rowmain">fixture-page.example</button>
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

function html(title, body) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;font-family:system-ui;padding:16px}</style>
</head><body><h1>${title}</h1>${body}${overflow}</body></html>`;
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
        : html(AUTHED_PAGES.get(path) ?? "", "<p>contenido</p>")
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
