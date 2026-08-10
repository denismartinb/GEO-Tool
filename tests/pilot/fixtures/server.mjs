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
  ["/dashboard/domains", "Dominios"],
  ["/dashboard/notifications", "Notificaciones"],
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
  "como-conseguir-que-chatgpt-te-cite",
  // Cluster "sectores" (GROWTH-2). Faltaban aquí desde que se publicaron, así
  // que sus journeys recibían un 404 y tumbaban el caso SANO del self-check
  // — el que debe pasar (log §44). `fixture-drift.test.ts` impide que la
  // próxima pieza de contenido repita la historia.
  "geo-para-ecommerce",
  "geo-para-saas-b2b",
  "geo-para-agencias"
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
  <header class="topbar" style="padding:8px 16px;display:flex;gap:12px;align-items:center">
    <span>cabecera</span>
    <button type="button" class="header-bell" aria-label="Notificaciones">campana</button>
    <div class="notif-panel" style="display:none;position:absolute;top:40px;right:8px;background:#fff;border:1px solid #ddd;padding:8px;max-width:320px">
      <p class="notif-row">Sin novedades</p>
    </div>
    <button type="button" class="side-geo">¿Qué es el GEO?</button>
  </header>
  <script>
  (function () {
    var bell = document.querySelector(".header-bell");
    var panel = document.querySelector(".notif-panel");
    if (bell && panel) {
      bell.addEventListener("click", function () {
        panel.style.display = panel.style.display === "block" ? "none" : "block";
      });
    }
    // Reabrir el tour desde el menú: el journey lo pulsa tras cerrar el popup.
    var reopen = document.querySelector(".side-geo");
    if (reopen) {
      reopen.addEventListener("click", function () {
        var scrim = document.querySelector(".ptour-scrim");
        if (scrim) scrim.style.display = "block";
      });
    }
  })();
  </script>
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
  if (path === "/dashboard/domains") {
    // DOMAINS-REDESIGN-1: la portada del dominio activo, que es el ancla de
    // core-flow.spec.ts. Estructura, no prosa: la pastilla de estado desaparece
    // en reposo y la línea de automatización se oculta en móvil, así que
    // ninguna de las dos discrimina "hay datos" en los tres viewports.
    return `<a class="dm2-hero" href="/dashboard/projects/${PROJECT_ID}"><span class="dm2-name">Fixture</span><span class="dm2-dom">fixture.example</span><span class="dm2-gauge">64</span></a>`;
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
      <div role="tabpanel" data-panel="problemas">
        4 páginas sin datos estructurados
        <!-- Fase 3a's generated llms.txt lives inside one of these collapsed
             issue rows. PR #319 shipped with a green web-audit row and not
             one capture containing the feature, because nothing ever opened
             it — this is what makes that journey step provable against the
             fixture before it is trusted against production. -->
        <details class="wa-details">
          <summary>Aviso · sitemap.xml · No encontrado <span class="wa2-fix-ready">Solución disponible</span></summary>
          <div class="wa-details-body">
            <ol class="wa2-llms-steps"><li class="wa2-llms-step">Casi seguro que tu plataforma ya lo genera</li></ol>
          </div>
        </details>
        <details class="wa-details">
          <summary>Aviso · llms.txt · No encontrado <span class="wa2-fix-ready">Solución disponible</span></summary>
          <div class="wa-details-body">
            <pre># Marca de prueba

## tema de prueba

- [/pagina](https://fixture.example/pagina): DESCRIBE ESTA PÁGINA EN 1 FRASE</pre>
          </div>
        </details>
      </div>
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


// ---------------------------------------------------------------------------
// Páginas que el caso SANO del self-check necesita (log §44). Sin ellas el
// fixture devolvía 404 y el caso que DEBE pasar fallaba, dejando el self-check
// rojo por deriva y no por un fallo real del arnés.
//
// Sólo llevan lo que los journeys miran, y con COMPORTAMIENTO real donde lo
// comprueban: un plegable que no abre de verdad, o un «Siguiente» que no
// avanza, harían pasar la aserción y mentirían sobre lo que el arnés sabe ver.
// ---------------------------------------------------------------------------

/**
 * El tour, compartido por el popup de bienvenida y por el hero de la landing.
 *
 * Reglas que replica de `.claude/rules/onboarding.md`, porque los journeys las
 * comprueban: sólo el paso 1 se reproduce solo (nunca encadena), la pista del
 * botón «Siguiente» se queda puesta hasta el clic, y cada clic avanza un paso.
 */
function tourWidget({ hero }) {
  const dots = [0, 1, 2, 3]
    .map((i) => `<span class="pt-dot${i === 0 ? " is-on" : ""}"></span>`)
    .join("");
  return `<div class="ptour${hero ? " ptour--hero" : ""}">
    <div class="pt-stage" style="min-height:180px;border:1px solid #ddd;padding:12px">
      <span data-pt="typed"></span>
    </div>
    <div class="pt-dots">${dots}</div>
    <div class="pt-foot">
      <a href="/geo">¿Qué es el GEO?</a>
      <button type="button" class="pt-primary pt-hint">Siguiente</button>
    </div>
  </div>`;
}

const TOUR_SCRIPT = `
(function () {
  document.querySelectorAll(".ptour").forEach(function (tour) {
    var typed = tour.querySelector("[data-pt=typed]");
    // El paso 1 se reproduce solo: teclea el dominio y SE PARA ahí.
    setTimeout(function () { if (typed) typed.textContent = "fixture.example"; }, 300);

    var next = tour.querySelector(".pt-primary");
    if (!next) return;
    next.addEventListener("click", function () {
      var dots = Array.prototype.slice.call(tour.querySelectorAll(".pt-dot"));
      var current = dots.findIndex(function (d) { return d.classList.contains("is-on"); });
      var target = Math.min(current + 1, dots.length - 1);
      dots.forEach(function (d) { d.classList.remove("is-on"); });
      dots[target].classList.add("is-on");
    });
  });
})();
`;

/**
 * Popup de bienvenida. La marca de «visto» se escribe AL MOSTRARLO, nunca al
 * cerrarlo (regla de ruta de onboarding): escribirla al cerrar convierte «sale
 * en el primer acceso» en «sale en cada carga hasta que lo cierres».
 */
const WELCOME_POPUP_SCRIPT = `
(function () {
  var KEY = "genscore.onboarding-tour.seen.v1";
  var scrim = document.querySelector(".ptour-scrim");
  if (!scrim) return;
  try {
    // Se OCULTA, nunca se elimina: el journey cierra el popup, recarga, y
    // luego lo reabre desde el menú. Si aquí se quitara del DOM, ese botón no
    // tendría nada que mostrar — que es justo como falló la 3ª pasada.
    if (window.localStorage.getItem(KEY) === "1") { scrim.style.display = "none"; return; }
    window.localStorage.setItem(KEY, "1");
  } catch (e) { /* almacenamiento no disponible: se muestra igual */ }
  scrim.style.display = "block";
  var close = scrim.querySelector(".pt-close");
  if (close) close.addEventListener("click", function () { scrim.style.display = "none"; });
})();
`;

function welcomeTourPopup() {
  return `<div class="ptour-scrim" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50">
    <div role="dialog" aria-label="Aprende cómo funciona" style="background:#fff;margin:24px auto;max-width:520px;padding:16px">
      <h2>Aprende cómo funciona</h2>
      <button type="button" class="pt-close" aria-label="Cerrar">×</button>
      ${tourWidget({ hero: false })}
    </div>
  </div>`;
}

function landingPage() {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${SITE_URL}/">
<title>Genscore — visibilidad de marca en motores de IA</title>
<style>body{margin:0;font-family:system-ui;padding:16px}.pt-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ccc;margin:2px}.pt-dot.is-on{background:#333}</style>
</head><body>
<h1>Mide cómo te ve la IA</h1>
<div class="lp-shot">${tourWidget({ hero: true })}</div>
${overflow}
<script>${TOUR_SCRIPT}</script>
</body></html>`;
}

/**
 * Ajustes en una sola página (CONSOLE-REDESIGN-1). Los cinco journeys de
 * `settings.spec.ts` miran: el titular, el email real, las tres secciones en
 * orden, los dos plegables gemelos —que nacen cerrados y cuyo cuerpo NO existe
 * en el DOM hasta abrirlo—, el bloque de eliminar cuenta al final y fuera del
 * índice, y que en móvil no quede nada fijado dentro de `.page`.
 */
function settingsPage() {
  return `<div class="page">
    <h1 class="set-title">Ajustes</h1>
    <nav class="set-idx" style="position:sticky;top:0">
      <a href="#cuenta">Cuenta</a>
      <a href="#avisos">Avisos</a>
      <a href="#plan">Plan</a>
    </nav>

    <h2 class="set-sech" id="cuenta">Cuenta</h2>
    <p class="set-idmail">piloto@fixture.example</p>
    <label for="profile-email">Email</label>
    <input id="profile-email" value="piloto@fixture.example">

    <button type="button" class="set-fold-h" aria-controls="company-fold-body" aria-expanded="false">
      Datos de empresa
    </button>
    <div data-fold-slot="company-fold-body"></div>

    <button type="button" class="set-fold-h" aria-controls="billing-fold-body" aria-expanded="false">
      Datos de facturación
    </button>
    <div data-fold-slot="billing-fold-body"></div>

    <h2 class="set-sech" id="avisos">Avisos</h2>
    <p>Preferencias de notificación</p>

    <h2 class="set-sech" id="plan">Plan</h2>
    <p>Plan actual: Pro</p>

    <div class="set-end">
      <h3>Eliminar cuenta</h3>
      <button type="button" class="set-end-d">Eliminar cuenta — esta acción es irreversible</button>
    </div>
  </div>
  <style>
    /* El índice desaparece por debajo de 900px: en móvil la página es un solo
       scroll y nada suyo queda fijado (settings.spec.ts). */
    @media (max-width: 899px) { .set-idx { display: none } }
  </style>
  <script>
  (function () {
    var BODIES = {
      "company-fold-body": '<div id="company-fold-body"><label for="company-name">Nombre</label><input id="company-name" value="Fixture SL"></div>',
      "billing-fold-body": '<div id="billing-fold-body"><label for="billing-legal-name">Razón social</label><input id="billing-legal-name" value="Fixture SL"></div>'
    };
    document.querySelectorAll("[aria-controls]").forEach(function (trigger) {
      var id = trigger.getAttribute("aria-controls");
      if (!BODIES[id]) return;
      var slot = document.querySelector('[data-fold-slot="' + id + '"]');
      trigger.addEventListener("click", function () {
        var open = trigger.getAttribute("aria-expanded") === "true";
        trigger.setAttribute("aria-expanded", open ? "false" : "true");
        // El cuerpo NO existe en el DOM mientras está cerrado: el journey
        // comprueba toHaveCount(0), no sólo que esté oculto.
        slot.innerHTML = open ? "" : BODIES[id];
      });
    });
  })();
  </script>`;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (path === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(landingPage());
    return;
  }

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

  if (path === "/dashboard/settings") {
    if (!isAuthenticated(request)) {
      response.writeHead(303, { Location: "/login" });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html("Ajustes", settingsPage()));
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
    // El popup de bienvenida sólo en /dashboard, que es donde aterriza un
    // primer login de verdad y donde el journey lo busca — entrar por la
    // pantalla final ocultaría el fallo que ese journey existe para cazar.
    const welcome =
      path === "/dashboard"
        ? `${welcomeTourPopup()}<script>${TOUR_SCRIPT}</script><script>${WELCOME_POPUP_SCRIPT}</script>`
        : "";
    const body =
      path === "/dashboard/notifications"
        ? `<div class="notif-list">
             <article class="notif-row"><h3>Escaneo completado</h3><p>Tu dominio se escaneó hace 2 horas.</p></article>
             <article class="notif-row"><h3>Nueva recomendación</h3><p>Hay una acción nueva en tu backlog.</p></article>
           </div>`
        : screenBody(path) + welcome;
    response.end(
      path === "/dashboard/projects"
        ? projectsPage()
        : html(AUTHED_PAGES.get(path) ?? "", body)
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
