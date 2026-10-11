import { describe, expect, it } from "vitest";
import { redactEmails, scrubBreadcrumb, scrubEvent, stripQuery } from "./scrub";

/** OBSERVABILITY-1 (log §300): what may and may not reach Sentry. */
describe("scrubEvent", () => {
  it("quita la query de la URL: tokens de baja, código de OAuth, next", () => {
    const event = scrubEvent({
      request: {
        url: "https://www.genscore.es/api/search-console/callback?code=4/abc&state=xyz",
        query_string: "code=4/abc&state=xyz"
      }
    });
    expect(event.request?.url).toBe("https://www.genscore.es/api/search-console/callback");
    expect(event.request?.query_string).toBeUndefined();
  });

  it("tira cabeceras (Authorization con CRON_SECRET), cookies y cuerpo", () => {
    const event = scrubEvent({
      request: {
        url: "https://www.genscore.es/api/cron/scan-watchdog",
        headers: { authorization: "Bearer secret" },
        cookies: { sb: "x" },
        data: { email: "a@b.es" }
      }
    });
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(JSON.stringify(event)).not.toContain("a@b.es");
  });

  it("redacta emails en mensajes y excepciones", () => {
    const event = scrubEvent({
      message: "send failed for ana.lopez+test@clinica.es",
      exception: { values: [{ value: "User pepe@x.com not found" }] }
    });
    expect(event.message).toBe("send failed for [email]");
    expect(event.exception?.values?.[0].value).toBe("User [email] not found");
  });

  it("deja del usuario sólo el id", () => {
    const event = scrubEvent({ user: { id: "u1", email: "a@b.es", ip_address: "1.2.3.4" } });
    expect(event.user).toEqual({ id: "u1" });
  });

  it("limpia las URLs de las migas de pan", () => {
    const crumb = scrubBreadcrumb({
      message: "fetch",
      data: { url: "https://www.genscore.es/baja?token=abc", from: "/login?next=/x", to: "/dashboard" }
    });
    expect(crumb.data).toEqual({ url: "https://www.genscore.es/baja", from: "/login", to: "/dashboard" });
  });
});

describe("helpers", () => {
  it("stripQuery conserva la ruta y quita query y fragmento", () => {
    expect(stripQuery("/a/b?c=1#d")).toBe("/a/b");
    expect(stripQuery("/a/b#d")).toBe("/a/b");
    expect(stripQuery("/a/b")).toBe("/a/b");
  });

  it("redactEmails no toca texto sin emails", () => {
    expect(redactEmails("TypeError: x is undefined")).toBe("TypeError: x is undefined");
  });
});
