import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const { checkHttpsRedirect } = await import("./https-check");

function redirect(location: string, status = 301): Response {
  return new Response(null, { status, headers: { location } });
}

describe("checkHttpsRedirect (Salud SEO, log §278)", () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    lookupMock.mockReset();
  });

  it("is ok when http:// redirects to https:// on the domain, without requesting the https page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(redirect("https://acme.com/"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkHttpsRedirect("acme.com")).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://acme.com/");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("follows an http → http://www hop before reaching https", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirect("http://www.acme.com/")).mockResolvedValueOnce(redirect("https://www.acme.com/"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkHttpsRedirect("acme.com")).resolves.toBe("ok");
  });

  it("is missing when the http version answers with its own page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 })));
    await expect(checkHttpsRedirect("acme.com")).resolves.toBe("missing");
  });

  it("is unknown for a redirect off the domain, a server error, a timeout or a private IP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirect("https://evil.com/")));
    await expect(checkHttpsRedirect("acme.com")).resolves.toBe("unknown");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(checkHttpsRedirect("acme.com")).resolves.toBe("unknown");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(checkHttpsRedirect("acme.com")).resolves.toBe("unknown");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    lookupMock.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    await expect(checkHttpsRedirect("acme.com")).resolves.toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up after a bounded number of hops", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirect("http://acme.com/loop")));
    await expect(checkHttpsRedirect("acme.com")).resolves.toBe("unknown");
  });
});
