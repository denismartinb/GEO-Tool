import { describe, it, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { callTool, listTools, reset, state, rpc } from "./drive";

type R = { id: string; case: string; desc: string; pass: boolean; evidence: string };
const out: R[] = [];
const chk = (id: string, c: string, desc: string, pass: boolean, evidence = "") => { out.push({ id, case: c, desc, pass, evidence: evidence.slice(0, 400) }); };
const has = (t: string, re: RegExp | string) => typeof re === "string" ? t.includes(re) : re.test(t);

describe("MCP-CONVERSATIONAL-QA-1 nivel A", () => {
  it("A1 catalog and contract", async () => {
    for (const p of ["claude", "chatgpt"] as const) {
      reset("data", "ok");
      const { tools, instructions } = await listTools(p);
      chk(`A1-${p}-count`, "A1", `${p}: 10 tools`, tools.length === 10, tools.map((t) => t.name).join(","));
      chk(`A1-${p}-readonly`, "A1", `${p}: all readOnlyHint, none destructive`, tools.every((t) => t.annotations.readOnlyHint === true && t.annotations.destructiveHint === false));
      chk(`A1-${p}-nowrite`, "A1", `${p}: no tool name suggests write (anadir/crear/borrar/guardar/add/create/delete)`, !tools.some((t) => /anadir|añadir|crear|borrar|guardar|add|create|delete|update|actualizar/i.test(t.name)));
      chk(`A1-${p}-instr`, "A1", `${p}: server instructions mention read-only`, /solo lectura/.test(instructions));
    }
    const c = (await listTools("claude")).tools.find((t) => t.name === "que_es_genscore")!.description;
    const g = (await listTools("chatgpt")).tools.find((t) => t.name === "que_es_genscore")!.description;
    chk("A1-desc-profile", "A1", "que_es_genscore description differs per profile and chatgpt one names no plans/prices", c !== g && !/planes|precios/i.test(g), g);
  });

  it("P1 revisar_pagina (anon and with account)", async () => {
    reset("data", "none");
    let r = await callTool("claude", "revisar_pagina", { url: "https://www.genscore.es" });
    chk("P1-anon-ran-once", "P1", "anon: one review of the asked URL only", state.executed.length === 1 && state.executed[0].url.includes("genscore.es"), JSON.stringify(state.executed));
    chk("P1-not-geo", "P1", "page note explicitly not the domain GEO score", has(r.text, "No es la Puntuación GEO"));
    chk("P1-ia-google", "P1", "covers IA and Google", has(r.text, /IA \d+/) && has(r.text, /Google \d+/));
    chk("P1-writes", "P1", "only counter writes to public_checks", state.writes.every((w: any) => w.table === "public_checks"), JSON.stringify(state.writes.map((w: any) => w.table)));
    chk("P1-anon-no-console-link", "P1", "anon: no /dashboard/ link", !has(r.text, "/dashboard/"));
    reset("data", "ok");
    r = await callTool("claude", "revisar_pagina", { url: "https://www.genscore.es" });
    chk("P1-own-domain", "P1", "account owns domain: 'Esta página en tu dominio' + no extra reviews", has(r.text, "Esta página en tu dominio") && state.executed.length === 1);
    chk("P1-own-no-score-confusion", "P1", "text keeps page % distinct from GEO score (contains 'No es la Puntuación GEO')", has(r.text, "No es la Puntuación GEO"));
  });

  it("P2 buscar_guias", async () => {
    reset("data", "none");
    const r = await callTool("claude", "buscar_guias", { consulta: "llms.txt" });
    chk("P2-hits", "P2", "returns hits with genscore.es links", has(r.text, /https:\/\/www\.genscore\.es\/blog\//), r.text.slice(0, 300));
    chk("P2-no-guarantee", "P2", "no citation guarantee wording", !has(r.text, /garantiz|asegura que te cit|seguro que te cit|100%/i), r.text.match(/.{40}(garantiz|100%).{40}/i)?.[0] ?? "");
    chk("P2-utm", "P2", "links carry utm_source=claude", has(r.text, "utm_source=claude"));
    const r2 = await callTool("claude", "buscar_guias", { consulta: "zzzqx plantas carnívoras" });
    chk("P2-nohit", "P2", "no match says so and links the blog", has(r2.text, /blog/) && !has(r2.text, /https:\/\/www\.genscore\.es\/blog\/[a-z-]+\?/), r2.text.slice(0, 200));
  });

  it("P3/L11 ver_dominio fresh and stale", async () => {
    reset("data", "ok");
    let r = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    chk("P3-data", "P3", "shows score, scan date, engines", has(r.text, "41/100") && has(r.text, "2026-11-02") && has(r.text, "ChatGPT"));
    chk("P3-no-audit", "P3", "no review/audit executed", state.executed.length === 0);
    reset("stale", "ok");
    r = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    chk("L11-date", "L11", "stale scan: date shown", has(r.text, "2026-09-05"));
    chk("L11-staleflag", "L11", "stale scan: explicit age/staleness signal in text or structured (e.g. 'hace N días', 'antiguo', ageDays)", has(r.text, /hace \d+ d|antigu|desactualiz|no es de hoy/i) || "ageDays" in (r.structured ?? {}) || "stale" in (r.structured ?? {}), r.text.slice(0, 200));
    reset("stale", "ok");
    r = await callTool("claude", "ver_recomendaciones", { dominio: "genscore.es" });
    chk("L11-recs-date", "L11", "stale scan: ver_recomendaciones shows the scan date", has(r.text, "2026-09-05"), r.text.slice(0, 160));
  });

  it("P4 ver_recomendaciones / L10", async () => {
    reset("data", "ok");
    let r = await callTool("claude", "ver_recomendaciones", { dominio: "genscore.es" });
    chk("P4-order", "P4", "ordered list with first step", has(r.text, "1. **Publica una FAQ alfa**") && has(r.text, "2. **Crea la comparativa alfa**") && has(r.text, "Primer paso"));
    chk("P4-date", "P4", "text or structured carries the scan date the plan comes from", has(r.text, "2026-11-02") || "scanDate" in (r.structured ?? {}), "text has no scan date; structured keys=" + Object.keys(r.structured ?? {}).join(","));
    chk("P4-no-audit", "P4", "no review executed", state.executed.length === 0);
    reset("norecs", "ok");
    r = await callTool("claude", "ver_recomendaciones", { dominio: "genscore.es" });
    chk("L10-norecs", "L10", "empty plan with a scan: says no pending actions + link", has(r.text, "no tiene acciones pendientes") && has(r.text, "/recommendations"));
    reset("noscan", "ok");
    r = await callTool("claude", "ver_recomendaciones", { dominio: "genscore.es" });
    chk("L10-noscan", "L10", "NO scan yet: must say 'no scan' rather than 'no pending actions'", has(r.text, /todavía no tiene un escaneo|sin escaneo/i) && !has(r.text, "no tiene acciones pendientes"), r.text.slice(0, 220));
  });

  it("P5 ver_prompts", async () => {
    reset("data", "ok");
    const r = await callTool("claude", "ver_prompts", { dominio: "genscore.es" });
    chk("P5-engines", "P5", "per-engine result incl. position and pending", has(r.text, "te nombra ChatGPT (puesto 3)") && has(r.text, "pendiente del próximo escaneo"));
    chk("P5-date", "P5", "scan date", has(r.text, "2026-11-02"));
    reset("two", "ok");
    const b = await callTool("claude", "ver_prompts", { dominio: "beta-sintetica.test" });
    chk("P5-empty-second", "P5", "second domain without prompts says so", has(b.text, "no tiene prompts activos"));
  });

  it("N2/L7/L9 domain absent", async () => {
    for (const f of ["data", "two", "empty"]) {
      reset(f, "ok");
      for (const t of ["ver_recomendaciones", "ver_dominio", "ver_competidores", "ver_prompts", "ver_auditorias", "ver_posicion_google"]) {
        const r = await callTool("claude", t, { dominio: "amazon.es" });
        chk(`N2-${f}-${t}`, "N2", `${f}/${t} absent domain: says not in account, offers (not runs) review, no fabricated numbers, no review executed`, has(r.text, "no es uno de los dominios") && has(r.text, "solo se hace si lo pides") && state.executed.length === 0 && !has(r.text, /\d+\/100|\d+%/), r.text.slice(0, 120));
      }
    }
    reset("full", "ok");
    const r = await callTool("claude", "ver_recomendaciones", { dominio: "amazon.es" });
    chk("N2-full-nolink", "N2", "FULL account (cap reached): absent-domain answer must NOT offer the add-domain link (listar_dominios does this right)", !has(r.text, "/dashboard/projects/new"), r.text.slice(0, 260));
    reset("full", "ok");
    const l = await callTool("claude", "listar_dominios", { dominio: "amazon.es" });
    chk("N2-full-listar", "N2", "listar_dominios on full account omits add link", !has(l.text, "/projects/new"));
    reset("data", "ok");
    const inv = await callTool("claude", "ver_dominio", { dominio: "no es un dominio" });
    chk("N2-invalid", "N2", "invalid domain string: isError and no crash", inv.isError, inv.text.slice(0, 150));
  });

  it("N3/D5 no writes", async () => {
    reset("data", "ok");
    const r = await rpc("claude", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "anadir_competidor", arguments: { dominio: "genscore.es", competidor: "nike.com" } } });
    chk("N3-unknown", "N3", "no add-competitor tool: unknown tool error", r.json.error?.code === -32602);
    const c = await callTool("claude", "ver_competidores", { dominio: "genscore.es" });
    chk("N3-link", "N3", "competitors answer gives console link / how to follow another brand, no claim of having done it", has(c.text, "/competitors") && !has(c.text, /he añadido|añadido nike/i));
    chk("N3-nowrite", "N3", "no DB write during read tools", state.writes.length === 0);
    const rv = await callTool("claude", "revisar_pagina", { url: "https://nike.com" });
    chk("N3-review-next", "N3", "reviewing nike.com offers add-as-competitor LINK (prefilled) but writes only counter", has(rv.text, "competitors?nuevo=nike.com") && state.writes.every((w: any) => w.table === "public_checks"), JSON.stringify(state.writes.map((w: any) => w.table)));
  });

  it("L2/D6 two domains", async () => {
    reset("two", "ok");
    const l = await callTool("claude", "listar_dominios", {});
    chk("L2-both", "L2", "lists both domains, shows no figures", has(l.text, "genscore.es") && has(l.text, "beta-sintetica.test") && !has(l.text, /\d+\/100/));
    const a = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    const b = await callTool("claude", "ver_dominio", { dominio: "beta-sintetica.test" });
    chk("D6-isolation", "D6", "second domain shows only its own figures (73, FIXTURE-BETA) and none of the first (41, FIXTURE-ALFA)", has(b.text, "73/100") && !has(b.text, /41\/100|ALFA|Alfa/) && has(a.text, "41/100"), b.text.slice(0, 200));
    chk("D6-loads", "D6", "each tool call loads exactly its domain", JSON.stringify(state.loads) === JSON.stringify(["genscore.es", "beta-sintetica.test"]));
    const nod = await callTool("claude", "ver_dominio", {});
    chk("L2-nodomain", "L2", "ver_dominio with no domain → invalid args naming 'dominio'", nod.isError && has(nod.text, "dominio"), nod.text);
    const nul = await callTool("claude", "ver_dominio", { dominio: null });
    chk("L2-null", "L2", "null domain treated as absent", nul.isError && has(nul.text, "dominio"));
  });

  it("L1 que_es_genscore, L8 privacy", async () => {
    reset("data", "none");
    const c = await callTool("claude", "que_es_genscore");
    const g = await callTool("chatgpt", "que_es_genscore");
    chk("L1-claude", "L1", "claude: describes product; may include plans", c.text.length > 100, c.text.slice(0, 160));
    chk("L1-chatgpt-nopricing", "L1", "chatgpt: no €, plan names, trial, discount", !has(g.text + JSON.stringify(g.structured ?? {}), /€|Starter|Pro\b|Agencia|prueba|descuento|gratis/i), g.text.slice(0, 200));
    reset("two", "ok");
    const l = await callTool("claude", "listar_dominios", {});
    chk("L8-own-only", "L8", "listar_dominios shows only this account's domains/email (no others, no counts of other users)", !has(l.text, /usuarios|clientes|cuentas/i) && has(l.text, "two@example.test"));
    chk("L8-no-global-tool", "L8", "no tool exposes global user/domain counts", !(await listTools("claude")).tools.some((t) => /usuarios|admin|global|todos/i.test(t.name)));
  });

  it("L6 Search Console states", async () => {
    for (const [f, re, tag] of [["data", "/api/search-console/connect?projectId=p-gs", "disconnected"], ["gscreconnect", "caducado", "reconnect"], ["gsc", "1.234", "connected"], ["partial", "Ahora no se pueden leer", "error"]] as const) {
      reset(f, "ok");
      const r = await callTool("claude", "ver_posicion_google", { dominio: "genscore.es" });
      chk(`L6-${tag}`, "L6", `GSC ${tag}`, has(r.text, re) || has(r.text, "1234") || has(r.text, "1.234"), r.text.slice(0, 160));
      if (tag === "disconnected") chk("L6-nonumbers", "L6", "disconnected: no invented clicks/position", !has(r.text, /\d+ clics|puesto medio/i));
    }
  });

  it("states: expired / denied / timeout / internal / partial", async () => {
    reset("data", "invalid");
    let r = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    chk("S-expired-claude", "S", "claude: expired token → HTTP 401 + WWW-Authenticate invalid_token", r.status === 401 && has(r.www ?? "", "invalid_token"), `${r.status} ${r.www}`);
    r = await callTool("chatgpt", "ver_dominio", { dominio: "genscore.es" });
    chk("S-expired-chatgpt", "S", "chatgpt: expired token → per-tool challenge saying session expired", r.status === 200 && has(r.text, "ha caducado") && r.isError, r.text);
    reset("data", "none");
    r = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    chk("S-none-claude", "S", "claude: no token → 401", r.status === 401);
    r = await callTool("chatgpt", "ver_dominio", { dominio: "genscore.es" });
    chk("S-none-chatgpt", "S", "chatgpt: no token → per-tool 'conecta tu cuenta'", has(r.text, "conecta tu cuenta") && r.isError);
    reset("data", "invalid");
    r = await callTool("chatgpt", "buscar_guias", { consulta: "llms.txt" });
    chk("S-expired-public", "S", "chatgpt: expired token still serves public tool", r.status === 200 && !r.isError);
    reset("free", "ok");
    r = await callTool("claude", "ver_recomendaciones", { dominio: "genscore.es" });
    chk("S-denied", "S", "read-only account: notice, no data", has(r.text, "solo lectura") && !has(r.text, /Publica una FAQ/));
    for (const f of ["timeout", "internal"]) {
      reset(f, "ok");
      for (const p of ["claude", "chatgpt"] as const) {
        r = await callTool(p, "ver_recomendaciones", { dominio: "genscore.es" });
        chk(`S-${f}-${p}`, "S", `${f}/${p}: generic retryable message, isError, no raw error leaked, no invented score, no review executed`, r.isError && has(r.text, "fallo puntual") && !has(r.text, /secret|statement|TypeError|supabase/i) && !has(r.text, /\d+\/100/) && state.executed.length === 0 && state.exceptions.length >= 1, r.text);
        chk(`S-${f}-${p}-state`, "S", `${f}/${p}: text distinguishes query failure from bad result (says it is a transient failure and asks to retry)`, has(r.text, /vuelve a intentar/i));
      }
    }
    reset("partial", "ok");
    const d = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    chk("S-partial", "S", "partial: no score line invented, no SEO line", !has(d.text, /Puntuación GEO:/) && !has(d.text, /Salud SEO/), d.text);
    chk("S-partial-nowarn", "S", "partial: answer FLAGS that data is incomplete (e.g. 'parcial'/'incompleto')", has(d.text, /parcial|incompleto|no se han podido/i), d.text.slice(0, 200));
    reset("noscan", "ok");
    const ns = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    chk("S-noscan", "S", "no scan: says so + link", has(ns.text, "todavía no tiene un escaneo"));
    reset("empty", "ok");
    const e = await callTool("claude", "listar_dominios", {});
    chk("S-empty", "S", "empty account: add link", has(e.text, "/dashboard/projects/new"));
  });

  it("ChatGPT rule: no plan/price/trial/discount anywhere (mcp.md §425)", async () => {
    // «plan de acciones» is the recommendations plan, not a commercial plan.
    const re = /€|plan (Pro|Starter|Agencia|Free)|planes|\b(tu|su|este) plan\b(?! de acciones)|\bprueba\b|\bStarter\b|\bAgencia\b|descuento|precio|suscrip/i;
    for (const f of ["data", "trial", "free", "full", "noscan"]) {
      reset(f, "ok");
      for (const t of ["listar_dominios", "ver_dominio", "ver_recomendaciones", "ver_competidores", "ver_prompts", "ver_auditorias", "ver_posicion_google"]) {
        const r = await callTool("chatgpt", t, t === "listar_dominios" ? {} : { dominio: "genscore.es" });
        // The informational link to /precios is the one commercial mention the contract allows.
        const blob = (r.text + " " + JSON.stringify(r.structured ?? {})).replace(/https:\/\/www\.genscore\.es\/precios/g, "");
        const m = blob.match(new RegExp(".{0,40}" + re.source + ".{0,40}", "i"));
        chk(`CG-${f}-${t}`, "CG", `chatgpt ${f}/${t}: no plan/trial/price wording`, !m, m?.[0] ?? "");
      }
    }
  });

  it("D4 interceptor", async () => {
    reset("data", "ok");
    const r = await callTool("claude", "revisar_pagina", { url: "https://amazon.es" });
    chk("D4-scope", "D4", "authorized review hits exactly https://amazon.es once (intercepted, no network); no domain added", state.executed.length === 1 && state.executed[0].url.startsWith("https://amazon.es") && state.writes.every((w: any) => w.table === "public_checks"), JSON.stringify(state.executed));
    chk("D4-next", "D4", "after review: offers add-as-domain / competitor links, does not claim to have added", has(r.text, "¿Qué hacer con amazon.es?"));
    chk("D4-gate", "D4", "SERVER cannot tell whether the user authorized: tool has no confirmation parameter (authorization lives only in model behaviour/description)", true, "by design: see report");
  });

  it("args & robustness", async () => {
    reset("data", "ok");
    const r = await callTool("claude", "revisar_pagina", { url: "javascript:alert(1)" });
    chk("R-badurl", "R", "bad URL rejected with guidance, no review", r.isError && state.executed.length === 0, r.text);
    const r2 = await callTool("claude", "revisar_pagina", { url: "http://127.0.0.1/admin" });
    chk("R-ssrf-guard-normalize", "R", "loopback URL not reviewed (normalizeTarget)", state.executed.length === 0, r2.text.slice(0, 120) + JSON.stringify(state.executed));
    const r3 = await callTool("claude", "ver_dominio", { dominio: "genscore.es", extra: "x" });
    chk("R-extra", "R", "extra arg tolerated", !r3.isError);
  });

  it("MCP-FIX-1 regressions (server controls, not model behaviour)", async () => {
    // H1: absent domain separates add from review, says what to do with an ambiguous reply, and executes nothing.
    reset("data", "ok");
    let r = await callTool("claude", "ver_recomendaciones", { dominio: "amazon.es" });
    chk("FIX1-separate", "FIX1", "absent domain: add link and review offer are separate options and the ambiguity rule is in the answer", has(r.text, "Opción A") && has(r.text, "acción distinta") && has(r.text, "«vale»") && has(r.text, "«no la audites»"), r.text.slice(0, 200));
    chk("FIX1-struct", "FIX1", "structured offer says ask which action when ambiguous and run only_if_asked", (r.structured as any)?.publicReview?.ifAmbiguous === "ask_which_action" && (r.structured as any)?.publicReview?.run === "only_if_asked");
    chk("FIX1-zero", "FIX1", "zero reviews executed and zero writes", state.executed.length === 0 && state.writes.length === 0);
    const tl = (await listTools("claude")).tools.find((t) => t.name === "revisar_pagina")!;
    chk("FIX1-desc", "FIX1", "revisar_pagina description tells the model an ambiguous «vale» is not a request", has(tl.description, "«vale»") && has(tl.description, "no la audites"));
    chk("FIX1-instr", "FIX1", "server instructions carry the same rule", has((await listTools("claude")).instructions, "«vale»"));
    // explicit request: only that URL, intercepted
    reset("data", "ok");
    await callTool("claude", "revisar_pagina", { url: "https://amazon.es" });
    chk("FIX1-explicit", "FIX1", "explicit review request: exactly that URL once, no domain/competitor write", state.executed.length === 1 && state.executed[0].url.startsWith("https://amazon.es") && state.writes.every((w: any) => w.table === "public_checks"));
    // H3/H7: structured fields
    reset("stale", "ok");
    r = await callTool("claude", "ver_recomendaciones", { dominio: "genscore.es" });
    chk("FIX1-recs-age", "FIX1", "stale recs: date, age in days and 'no es una medición de hoy' in text; scanDate and scanAgeDays in structured", has(r.text, "2026-09-05") && has(r.text, /hace \d+ días; no es una medición de hoy/) && (r.structured as any)?.scanDate === "2026-09-05T06:00:00Z" && (r.structured as any)?.scanAgeDays > 0, r.text.slice(0, 200));
    for (const t of ["ver_dominio", "ver_competidores", "ver_prompts"]) {
      r = await callTool("claude", t, { dominio: "genscore.es" });
      chk(`FIX1-age-${t}`, "FIX1", `${t}: stale scan labelled with its age`, has(r.text, /hace \d+ días/), r.text.slice(0, 120));
    }
    // H4 in both routes
    for (const p of ["claude", "chatgpt"] as const) {
      reset("noscan", "ok");
      r = await callTool(p, "ver_recomendaciones", { dominio: "genscore.es" });
      chk(`FIX1-noscan-${p}`, "FIX1", `${p}: no scan says so, not 'sin acciones'`, has(r.text, "todavía no tiene un escaneo") && !has(r.text, "no tiene acciones pendientes") && (r.structured as any)?.state === "no_scan");
      reset("norecs", "ok");
      r = await callTool(p, "ver_recomendaciones", { dominio: "genscore.es" });
      chk(`FIX1-norecs-${p}`, "FIX1", `${p}: scanned without recs says no pending actions per its scan, without implying a perfect web`, has(r.text, "no tiene acciones pendientes") && has(r.text, "solo dice que el escaneo no encontró nada") && !has(r.text, /perfecta|todo bien/i));
    }
    // ChatGPT access notice: no plan/trial words, state kept, still explains access vs no data
    reset("free", "ok");
    r = await callTool("chatgpt", "ver_dominio", { dominio: "genscore.es" });
    chk("FIX1-cg-notice", "FIX1", "chatgpt read-only notice: state plan_required, access vs no-data explained, no plan/trial words", (r.structured as any)?.state === "plan_required" && has(r.text, "no significa que no existan datos") && !has(r.text, /prueba|Pro\b|Starter|plan/i), r.text);
    r = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    chk("FIX1-claude-notice", "FIX1", "claude notice unchanged in substance (trial ended + /precios) and now says access vs no data", has(r.text, "prueba de Pro ha terminado") && has(r.text, "/precios") && has(r.text, "no significa que no existan datos"));
    // chatgpt list: no planName/trialEndsAt in structured
    reset("trial", "ok");
    r = await callTool("chatgpt", "listar_dominios", {});
    chk("FIX1-cg-list", "FIX1", "chatgpt listar_dominios: no planName/trialEndsAt", !("planName" in (r.structured ?? {})) && !("trialEndsAt" in (r.structured ?? {})) && !has(r.text, /plan|prueba/i), r.text);
    reset("trial", "ok");
    r = await callTool("claude", "listar_dominios", {});
    chk("FIX1-claude-list", "FIX1", "claude listar_dominios keeps plan and trial", has(r.text, "plan Pro") && has(r.text, "prueba hasta") && (r.structured as any)?.planName === "Pro");
    // H6 partial, structured flag
    reset("partial", "ok");
    r = await callTool("claude", "ver_dominio", { dominio: "genscore.es" });
    chk("FIX1-partial", "FIX1", "partial: flagged in text and structured, available data kept, missing is not zero", has(r.text, "Datos incompletos") && has(r.text, "ChatGPT: 30%") && (r.structured as any)?.incomplete === true && (r.structured as any)?.geoScore === null);
    // H5 capacity: full account, listar and domain tools agree
    reset("full", "ok");
    r = await callTool("claude", "ver_dominio", { dominio: "amazon.es" });
    chk("FIX1-full", "FIX1", "full account: no add link, says there is no room, structured accountFull", !has(r.text, "/projects/new") && has(r.text, "no se puede añadir otro") && (r.structured as any)?.accountFull === true && !(r.structured as any)?.addDomainUrl);
    // D7 persistent failure: every call in the sequence fails, nothing invented, nothing executed
    reset("timeout", "ok");
    const seq: any[] = [];
    for (const [t, a] of [["ver_recomendaciones", { dominio: "genscore.es" }], ["ver_recomendaciones", { dominio: "genscore.es" }], ["ver_dominio", { dominio: "genscore.es" }], ["ver_auditorias", { dominio: "genscore.es" }]] as const) seq.push(await callTool("claude", t, a as any));
    chk("FIX1-D7", "FIX1", "persistent timeout across 4 calls: all isError, generic retry text, no score, no raw error, no review executed", seq.every((x) => x.isError && has(x.text, "fallo puntual") && !has(x.text, /\d+\/100|statement|secret/i)) && state.executed.length === 0);
    // expired credential and disconnected GSC kept
    reset("data", "invalid");
    r = await callTool("claude", "ver_recomendaciones", { dominio: "genscore.es" });
    chk("FIX1-expired", "FIX1", "expired credential on claude still 401 invalid_token", r.status === 401 && has(r.www ?? "", "invalid_token"));
  });

  afterAll(() => { if (process.env.QA_REPORT) writeFileSync(process.env.QA_REPORT, JSON.stringify(out, null, 1));
    const failed = out.filter((x) => !x.pass);
    if (failed.length) throw new Error("MCP QA checks failed:\n" + failed.map((x) => `${x.id}: ${x.desc} | ${x.evidence}`).join("\n")); });
});
