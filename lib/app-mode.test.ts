import { describe, expect, it } from "vitest";
import { ANDROID_PACKAGE, appLaunchRedirect, appModeSignal, isAppModePathAllowed } from "./app-mode";

const q = (s: string) => new URLSearchParams(s);

describe("modo app (TWA)", () => {
  it("entra con ?source=twa o con el referrer de la app, y sale con ?source=web", () => {
    expect(appModeSignal(q("source=twa"), null)).toBe("enter");
    expect(appModeSignal(q(""), `android-app://${ANDROID_PACKAGE}`)).toBe("enter");
    expect(appModeSignal(q("source=web"), `android-app://${ANDROID_PACKAGE}`)).toBe("leave");
  });
  it("no entra por otro origen ni por otro paquete", () => {
    expect(appModeSignal(q(""), null)).toBeNull();
    expect(appModeSignal(q("source=newsletter"), "https://google.com/")).toBeNull();
    expect(appModeSignal(q(""), "android-app://com.otra.app")).toBeNull();
  });
  it("dentro de la app solo hay consola, acceso y lo legal", () => {
    for (const ok of ["/dashboard", "/dashboard/projects/p1/recommendations", "/login", "/signup", "/signup/confirm", "/forgot-password", "/auth/confirm", "/auth/callback", "/api/me", "/privacidad", "/.well-known/assetlinks.json", "/sw.js"]) {
      expect(isAppModePathAllowed(ok), ok).toBe(true);
    }
    for (const no of ["/", "/precios", "/pricing", "/blog/algo", "/comparativas/x", "/dashboard-falso", "/afiliados", "/demo", "/gratis/informe-geo"]) {
      expect(isAppModePathAllowed(no), no).toBe(false);
    }
  });
  it("una apertura que entra a la consola se desvía al inicio de sesión, conservando el destino", () => {
    expect(appLaunchRedirect("/dashboard", q("source=twa"))).toBe("/login?source=twa");
    expect(appLaunchRedirect("/dashboard/projects/p1/prompts", q("source=twa&x=1"))).toBe(
      "/login?source=twa&next=%2Fdashboard%2Fprojects%2Fp1%2Fprompts%3Fx%3D1"
    );
    for (const no of ["/login", "/signup", "/forgot-password", "/dashboard-falso", "/privacidad"]) {
      expect(appLaunchRedirect(no, q("source=twa")), no).toBeNull();
    }
  });
});
