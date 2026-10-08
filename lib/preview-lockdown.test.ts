import { describe, expect, it } from "vitest";
import { decideLockdown, isLockdownActive, normalisePath } from "./preview-lockdown";

const get = (pathname: string) => decideLockdown({ method: "GET", pathname });

describe("preview lockdown · allow-list, deny by default", () => {
  it("serves the public read-only surfaces", () => {
    for (const p of ["/", "/pricing", "/docs", "/docs/planes-y-limites", "/blog/geo-vs-aeo-vs-seo", "/comparativas/x", "/glosario/y", "/robots.txt", "/preview/index.html", "/_next/static/a.js", "/brand/logo.png", "/gratis"]) {
      expect(get(p).allow, p).toBe(true);
    }
  });

  it("denies every state-changing or private surface, including the ones the production matcher skipped", () => {
    for (const p of ["/api/me", "/api/gratis/comprobar", "/api/cron/weekly-scans", "/api/webhooks/stripe", "/dashboard", "/dashboard/settings/billing", "/admin", "/mfa", "/login", "/signup", "/forgot-password", "/auth/callback", "/baja", "/debug", "/unknown"]) {
      expect(get(p).allow, p).toBe(false);
    }
  });

  it("denies every method but GET and HEAD, on any path", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      for (const pathname of ["/", "/pricing", "/api/gratis/comprobar", "/dashboard"]) {
        expect(decideLockdown({ method, pathname }).allow, `${method} ${pathname}`).toBe(false);
      }
    }
    expect(decideLockdown({ method: "HEAD", pathname: "/pricing" }).allow).toBe(true);
  });

  it("denies a request that carries a server-action header", () => {
    expect(decideLockdown({ method: "GET", pathname: "/", hasServerActionHeader: true }).allow).toBe(false);
  });

  it("does not let a prefix match a longer sibling, nor path tricks reach a denied route", () => {
    for (const p of ["/docsx", "/blogger", "/previews", "/pricing2", "/glosarioxyz"]) expect(get(p).allow, p).toBe(false);
    for (const p of ["/docs/../api/me", "/blog/%2e%2e/api/me", "/docs/..%2fdashboard", "/docs\\..\\api", "/%E0%A4%A"]) expect(get(p).allow, p).toBe(false);
    for (const p of ["//api/me", "/API/ME", "/Dashboard", "/api//cron/x", "/api/me/"]) expect(get(p).allow, p).toBe(false);
  });

  it("normalises predictably", () => {
    expect(normalisePath("/Pricing/")).toBe("/pricing");
    expect(normalisePath("//docs//x")).toBe("/docs/x");
    expect(normalisePath("/a/../b")).toBeNull();
  });

  it("is locked everywhere except a production deployment", () => {
    expect(isLockdownActive({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isLockdownActive({ VERCEL_ENV: "development" })).toBe(true);
    expect(isLockdownActive({})).toBe(true);
    expect(isLockdownActive({ VERCEL_ENV: "production" })).toBe(false);
  });
});
