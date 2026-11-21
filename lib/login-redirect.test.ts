import { describe, expect, it } from "vitest";
import { loginRedirectPath } from "./login-redirect";

describe("loginRedirectPath (LOGIN-NEXT-UTM-1)", () => {
  it("vuelve a la página pedida tras entrar", () => {
    expect(loginRedirectPath("/dashboard/projects/abc/recommendations")).toBe(
      "/login?next=%2Fdashboard%2Fprojects%2Fabc%2Frecommendations"
    );
  });

  it("copia las UTM del enlace al propio login y las deja en el destino", () => {
    const to = loginRedirectPath("/dashboard?utm_source=email&utm_medium=lifecycle&utm_campaign=trial_d3&foo=1");
    const url = new URL(to, "https://www.genscore.es");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/dashboard?utm_source=email&utm_medium=lifecycle&utm_campaign=trial_d3&foo=1");
    expect(url.searchParams.get("utm_source")).toBe("email");
    expect(url.searchParams.get("utm_medium")).toBe("lifecycle");
    expect(url.searchParams.get("utm_campaign")).toBe("trial_d3");
    expect(url.searchParams.get("foo")).toBeNull();
  });

  it("sin ruta o con una ruta a otro sitio, /login a secas", () => {
    expect(loginRedirectPath(null)).toBe("/login");
    expect(loginRedirectPath(undefined)).toBe("/login");
    expect(loginRedirectPath("https://evil.com/x")).toBe("/login");
    expect(loginRedirectPath("//evil.com")).toBe("/login");
  });

  it("no anida el propio login", () => {
    expect(loginRedirectPath("/login?next=%2Fdashboard")).toBe("/login");
    expect(loginRedirectPath("/login")).toBe("/login");
  });
});
