import { describe, expect, it } from "vitest";
import { ANDROID_PACKAGE, appModeSignal, isAppModePathAllowed } from "./app-mode";

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
    for (const ok of ["/dashboard", "/dashboard/projects/p1/recommendations", "/login", "/signup", "/api/me", "/privacidad", "/.well-known/assetlinks.json", "/sw.js"]) {
      expect(isAppModePathAllowed(ok), ok).toBe(true);
    }
    for (const no of ["/", "/precios", "/pricing", "/blog/algo", "/comparativas/x", "/dashboard-falso", "/afiliados", "/demo", "/gratis/informe-geo"]) {
      expect(isAppModePathAllowed(no), no).toBe(false);
    }
  });
});
