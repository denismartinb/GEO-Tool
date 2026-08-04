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
const SITE_URL = "https://www.genscore.es";

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

// GROWTH-2 Fase 2.1 (tests/pilot/journeys/public-pages.spec.ts): unlike
// AUTHED_PAGES above, these need no session — the real routes are public.
// Each fixture page carries the same <link rel="canonical"> shape the real
// pages ship, so that journey's mechanical assertions have something real to
// check against instead of 404ing on this stand-in server.
const BLOG_SLUGS = [
  "que-es-el-geo-score",
  "que-es-geo-generative-engine-optimization",
  "como-elegir-prompts-monitorizar-marca-ia",
  "como-elegir-competidores-analisis-geo",
  "genscore-vs-herramientas-geo",
  "llms-txt-guia-practica",
  "como-conseguir-que-chatgpt-te-cite"
];

// GROWTH-2 Fase 2.5: /blog and each /blog/<slug> get their own render
// functions below (blogIndexHtml/blogPostHtml) instead of the generic
// publicHtml — the journey now asserts on cluster headings and internal
// "Sigue leyendo" links that a one-size-fits-all title+paragraph can't carry.
const PUBLIC_PAGES = new Map([
  ["/geo", "GEO — Genscore"],
  ["/privacidad", "Privacidad — Genscore"],
  ["/cookies", "Cookies — Genscore"],
  ["/terminos", "Términos — Genscore"],
  ["/glosario", "Glosario GEO — Genscore"],
  ["/comparativas", "Comparativas — Genscore"],
  ["/comparativas/genscore-vs-otterly", "Genscore vs Otterly — Genscore"],
  ["/comparativas/genscore-vs-peec-ai", "Genscore vs Peec AI — Genscore"],
  ["/comparativas/mejores-herramientas-geo-en-espanol", "Las mejores herramientas GEO en 2026 — Genscore"]
]);

// GROWTH-2 Fase 2.6b (tests/pilot/journeys/public-pages.spec.ts): the two
// glossary terms the journey checks — each gets its own render function
// because it needs a "Sigue explorando" related-links block, which the
// generic publicHtml can't carry.
const GLOSSARY_TERM_SLUGS = ["geo", "geo-score"];
const GLOSSARY_RELATED_OF_SLUG = { geo: "geo-score", "geo-score": "geo" };

function glosarioTerminoHtml(slug) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  const related = GLOSSARY_RELATED_OF_SLUG[slug];
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${SITE_URL}/glosario/${slug}">
<title>¿Qué es ${slug}? — Glosario GEO — Genscore</title>
<style>body{margin:0;font-family:system-ui;padding:16px}</style>
</head><body><h1>¿Qué es ${slug}?</h1><p>contenido</p><div class="glossary-related"><h2>Sigue explorando</h2><ul><li><a href="/glosario/${related}">${related}</a></li></ul></div>${overflow}</body></html>`;
}

// GROWTH-2 Fase 2.3 (tests/pilot/journeys/docs-pages.spec.ts): same idea as
// PUBLIC_PAGES above, kept as a separate map/function because these pages
// also need a sidebar with an `active` link — the journey asserts on it.
const DOCS_SLUGS = [
  "empezar/primer-escaneo",
  "informes/overview",
  "metodologia/geo-score",
  "planes-y-limites"
];

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
    <!-- Mirrors the real .cit2-split-key legend so the selfcheck exercises
         the same test path as core-flow.spec.ts's "citations KPI tooltip and
         row expand actually work" journey — added 2026-08-03 alongside that
         journey's new legend-tooltip check, so a healthy fixture run proves
         the assertion itself works before trusting it against production. -->
    <div class="cit2-split-key">
      <span>
        Terceros que te mencionan
        <span class="info-tip" tabindex="0">
          <span class="info-tip-icon">i</span>
          <span class="info-tip-bubble">Tooltip de leyenda de prueba de la fixture</span>
        </span>
      </span>
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

/**
 * Authenticated pages are wrapped in the same shape as the real app shell:
 * pinned to the viewport, with the actual scrolling done by an inner element.
 *
 * That is what made `fullPage: true` silently crop every dashboard capture at
 * the fold — `document.documentElement.scrollHeight` never grows past one
 * viewport, so Playwright believed it had the whole page. Reproducing the
 * shape here is what lets the self-check prove the fix instead of asserting it
 * (`BELOW_FOLD_MARKER` sits far enough down that only a working capture
 * contains it).
 *
 * The class names and the `.dash-main { min-height: 0 }` flex-shrink trick are
 * the real ones from app/globals.css + app/dashboard/layout.tsx, not
 * stand-ins: journey.ts measures horizontal overflow against `.dash-content`
 * specifically, so a fixture that invented its own class name would leave that
 * measurement untested (see the shell-clip case in pilot-selfcheck.mjs).
 */
const BELOW_FOLD_MARKER = "marcador-bajo-el-pliegue";

function shellWrap(body) {
  const filler = Array.from(
    { length: 40 },
    (_, i) => `<p style="margin:0 0 24px">fila de relleno ${i + 1}</p>`
  ).join("");
  // Trapped INSIDE `.dash-content`, whose own `overflow-y: auto` computes
  // `overflow-x: auto` too — so the document never sees it. Only a check that
  // measures `.dash-content` directly can catch this.
  const trappedWide =
    BREAK_MODE === "shell-clip"
      ? '<div style="width:2200px" id="shell-clip-wide-marker">ancho atrapado dentro de .dash-content</div>'
      : "";
  return `<div class="shell" style="height:100dvh;overflow:hidden;display:flex;flex-direction:column">
  <header style="padding:8px 16px">cabecera</header>
  <div class="dash-main" style="flex:1;min-height:0;display:flex;flex-direction:column">
    <main class="dash-content" style="flex:1;overflow-y:auto;padding:16px">
      ${body}
      ${trappedWide}
      ${filler}
      <p id="${BELOW_FOLD_MARKER}">${BELOW_FOLD_MARKER}</p>
    </main>
  </div>
</div>`;
}

function html(title, body) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;font-family:system-ui}</style>
</head><body>${shellWrap(`<h1>${title}</h1>${body}${overflow}`)}</body></html>`;
}

function publicHtml(path, title) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${SITE_URL}${path}">
<title>${title}</title>
<style>body{margin:0;font-family:system-ui;padding:16px}</style>
</head><body><h1>${title}</h1><p>contenido</p>${overflow}</body></html>`;
}

function docsPage(path, title) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  const sidebar = DOCS_SLUGS.map(
    (slug) => `<a href="/docs/${slug}" class="${path === `/docs/${slug}` ? "active" : ""}">${slug}</a>`
  ).join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${SITE_URL}${path}">
<title>${title}</title>
<style>body{margin:0;font-family:system-ui;padding:16px}</style>
</head><body><h1>${title}</h1><nav>${sidebar}</nav><p>contenido</p>${overflow}</body></html>`;
}

// Mirrors lib/blog/posts.ts's cluster assignment (GROWTH-2 Fase 2.5) closely
// enough for the fixture's own internal-linking assertions to hold — not a
// copy of the real editorial mapping, just enough sibling structure per
// cluster so blogPostHtml has at least one real link to render.
const BLOG_CLUSTERS = ["Fundamentos GEO", "Metodología y medición", "Playbooks de ejecución", "GEO por sector"];
const BLOG_CLUSTER_OF_SLUG = Object.fromEntries(BLOG_SLUGS.map((slug, i) => [slug, BLOG_CLUSTERS[i % 2]]));

function blogIndexHtml() {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  const sections = BLOG_CLUSTERS.map((cluster) => {
    const posts = BLOG_SLUGS.filter((slug) => BLOG_CLUSTER_OF_SLUG[slug] === cluster);
    const body = posts.length
      ? `<ul>${posts.map((slug) => `<li><a href="/blog/${slug}">${slug}</a></li>`).join("")}</ul>`
      : `<p class="blog-cluster-soon">Próximamente.</p>`;
    return `<section class="blog-cluster"><h2>${cluster}</h2>${body}</section>`;
  }).join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${SITE_URL}/blog">
<title>Blog — Genscore</title>
<style>body{margin:0;font-family:system-ui;padding:16px}</style>
</head><body><h1>Blog — Genscore</h1>${sections}${overflow}</body></html>`;
}

function blogPostHtml(slug) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  const cluster = BLOG_CLUSTER_OF_SLUG[slug];
  const siblings = BLOG_SLUGS.filter((s) => s !== slug && BLOG_CLUSTER_OF_SLUG[s] === cluster);
  const related = siblings.length
    ? `<div class="blog-related"><h2>Sigue leyendo</h2><ul>${siblings
        .map((s) => `<li><a href="/blog/${s}">${s}</a></li>`)
        .join("")}</ul></div>`
    : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${SITE_URL}/blog/${slug}">
<title>${slug} — Genscore</title>
<style>body{margin:0;font-family:system-ui;padding:16px}</style>
</head><body><h1>${slug} — Genscore</h1><p>contenido</p>${related}${overflow}</body></html>`;
}

// GROWTH-2 Fase 2.9 (B1b): the 4 clusters each get a pillar page at
// /blog/<key> — mirrors lib/blog/posts.ts's BLOG_CLUSTERS keys. "sectores"
// has zero real posts, so it renders the same honest empty-state copy the
// real page does instead of "contenido del pilar" — the pilot journey
// asserts on that exact text.
const BLOG_PILLAR_KEYS = ["fundamentos", "medicion", "playbooks", "sectores"];

function blogPillarHtml(key) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  const body =
    key === "sectores"
      ? `<p>Todavía no hay artículos publicados en esta sección — está planificada en nuestro <a href="/blog">calendario de contenido</a> y llegará más adelante.</p>`
      : `<p>contenido del pilar</p>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${SITE_URL}/blog/${key}">
<title>${key} — Blog — Genscore</title>
<style>body{margin:0;font-family:system-ui;padding:16px}</style>
</head><body><h1>${key}</h1>${body}${overflow}</body></html>`;
}

function feedXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Genscore — Blog</title><link>${SITE_URL}/blog</link><item><link>${SITE_URL}/blog/${BLOG_SLUGS[0]}</link></item></channel></rss>`;
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
    // Real click-to-switch behaviour (not just static markup), mirroring
    // AuditTabBar/AuditTabPanel — added 2026-08-03 alongside
    // core-flow.spec.ts's explicit Correcto/Páginas coverage, so a healthy
    // fixture run proves that test's own aria-selected/tabpanel assertions
    // work before trusting them against production.
    return `<div role="tablist" aria-label="Secciones de la auditoría">
        <button role="tab" aria-selected="true" data-tab="problemas">Problemas</button>
        <button role="tab" aria-selected="false" data-tab="correcto">Correcto</button>
        <button role="tab" aria-selected="false" data-tab="paginas">Páginas</button>
      </div>
      <div role="tabpanel" data-panel="problemas">4 páginas sin datos estructurados</div>
      <div role="tabpanel" data-panel="correcto" hidden>10 de 10 páginas indexables</div>
      <div role="tabpanel" data-panel="paginas" hidden>
        Tabla de páginas de prueba
        <!-- A real collapsed page row: fase 3b's copyable fixes live inside
             one of these, so the journey has to open it to have any evidence
             at all. Native <details>, same as PageAuditRow. -->
        <details class="wa-details">
          <summary>/ · 3 mejoras pendientes</summary>
          <div class="wa-details-body">
            <pre>&lt;link rel="canonical" href="https://fixture.example/" /&gt;</pre>
          </div>
        </details>
      </div>
      <script>
        document.querySelectorAll('[role="tab"]').forEach(function (btn) {
          btn.addEventListener("click", function () {
            var target = btn.getAttribute("data-tab");
            document.querySelectorAll('[role="tab"]').forEach(function (t) {
              t.setAttribute("aria-selected", t.getAttribute("data-tab") === target ? "true" : "false");
            });
            document.querySelectorAll('[role="tabpanel"]').forEach(function (p) {
              if (p.getAttribute("data-panel") === target) p.removeAttribute("hidden");
              else p.setAttribute("hidden", "");
            });
          });
        });
      </script>`;
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

  if (path === "/feed.xml") {
    response.writeHead(200, { "Content-Type": "application/rss+xml; charset=utf-8" });
    response.end(feedXml());
    return;
  }

  if (path === "/blog") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(blogIndexHtml());
    return;
  }

  if (BLOG_PILLAR_KEYS.includes(path.replace(/^\/blog\//, ""))) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(blogPillarHtml(path.replace(/^\/blog\//, "")));
    return;
  }

  if (BLOG_SLUGS.includes(path.replace(/^\/blog\//, ""))) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(blogPostHtml(path.replace(/^\/blog\//, "")));
    return;
  }

  if (GLOSSARY_TERM_SLUGS.includes(path.replace(/^\/glosario\//, ""))) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(glosarioTerminoHtml(path.replace(/^\/glosario\//, "")));
    return;
  }

  if (PUBLIC_PAGES.has(path)) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(publicHtml(path, PUBLIC_PAGES.get(path)));
    return;
  }

  if (path === "/docs") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(docsPage(path, "Documentación — Genscore"));
    return;
  }

  if (DOCS_SLUGS.some((slug) => path === `/docs/${slug}`)) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(docsPage(path, `${path.slice(6)} — Genscore`));
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
