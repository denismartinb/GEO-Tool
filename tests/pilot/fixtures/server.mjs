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
  [`/dashboard/projects/${PROJECT_ID}/runs`, "Escaneos"]
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
  "genscore-vs-herramientas-geo"
];

const PUBLIC_PAGES = new Map([
  ["/blog", "Blog — Genscore"],
  ...BLOG_SLUGS.map((slug) => [`/blog/${slug}`, `${slug} — Genscore`]),
  ["/geo", "GEO — Genscore"],
  ["/privacidad", "Privacidad — Genscore"],
  ["/cookies", "Cookies — Genscore"],
  ["/terminos", "Términos — Genscore"]
]);

function html(title, body) {
  const overflow = BREAK_MODE === "overflow" ? '<div style="width:2000px">wide</div>' : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;font-family:system-ui;padding:16px}</style>
</head><body><h1>${title}</h1>${body}${overflow}</body></html>`;
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

  if (PUBLIC_PAGES.has(path)) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(publicHtml(path, PUBLIC_PAGES.get(path)));
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
