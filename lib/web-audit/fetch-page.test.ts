import { afterEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const {
  isPrivateOrReservedIp,
  isAllowedAuditHost,
  hostnameResolvesToPublicIp,
  fetchPageSafely,
  readBodyCapped
} = await import("./fetch-page");

function textResponse(body: BodyInit | null, init?: ResponseInit & { headers?: Record<string, string> }): Response {
  return new Response(body, init);
}

function streamFrom(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

describe("isPrivateOrReservedIp", () => {
  it("flags IPv4 private ranges", () => {
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.31.255.255")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
  });

  it("flags cloud metadata / link-local", () => {
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
  });

  it("flags CGNAT and reserved test ranges", () => {
    expect(isPrivateOrReservedIp("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("192.0.2.1")).toBe(true);
    expect(isPrivateOrReservedIp("198.51.100.1")).toBe(true);
    expect(isPrivateOrReservedIp("203.0.113.1")).toBe(true);
  });

  it("flags multicast and reserved high ranges", () => {
    expect(isPrivateOrReservedIp("224.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("255.255.255.255")).toBe(true);
  });

  it("allows genuinely public IPv4 addresses", () => {
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
    expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false);
  });

  it("flags IPv6 loopback, link-local, and unique-local", () => {
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("fd00::1")).toBe(true);
  });

  it("flags IPv4-mapped IPv6 private addresses", () => {
    expect(isPrivateOrReservedIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows a genuinely public IPv6 address", () => {
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("fails closed on an unrecognized format", () => {
    expect(isPrivateOrReservedIp("not-an-ip")).toBe(true);
  });
});

describe("isAllowedAuditHost", () => {
  it("matches the exact domain and real subdomains", () => {
    expect(isAllowedAuditHost("example.com", "example.com")).toBe(true);
    expect(isAllowedAuditHost("blog.example.com", "example.com")).toBe(true);
  });

  it("rejects a label-boundary lookalike domain", () => {
    expect(isAllowedAuditHost("evilexample.com", "example.com")).toBe(false);
    expect(isAllowedAuditHost("example.com.evil.com", "example.com")).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(isAllowedAuditHost("", "example.com")).toBe(false);
  });
});

describe("hostnameResolvesToPublicIp", () => {
  afterEach(() => vi.resetAllMocks());

  it("returns true when every resolved address is public", async () => {
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    expect(await hostnameResolvesToPublicIp("example.com")).toBe(true);
  });

  it("returns false when any resolved address is private", async () => {
    lookupMock.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.5", family: 4 }
    ]);
    expect(await hostnameResolvesToPublicIp("sneaky.example.com")).toBe(false);
  });

  it("fails closed on a DNS lookup error", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await hostnameResolvesToPublicIp("example.com")).toBe(false);
  });

  it("fails closed on an empty result", async () => {
    lookupMock.mockResolvedValue([]);
    expect(await hostnameResolvesToPublicIp("example.com")).toBe(false);
  });
});

describe("fetchPageSafely", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects a host that resolves to a private IP even though the domain matches", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchPageSafely("https://sub.example.com/page", "example.com");
    expect(result.status).toBe("skipped_offsite");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an off-domain candidate outright", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchPageSafely("https://not-my-domain.com/page", "example.com");
    expect(result.status).toBe("skipped_offsite");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an IP-literal URL without ever resolving/fetching it", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchPageSafely("https://169.254.169.254/latest/meta-data", "example.com");
    expect(result.status).toBe("skipped_offsite");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("follows an in-domain redirect after re-verifying the new host", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        textResponse(null, { status: 302, headers: { location: "https://example.com/final" } })
      )
      .mockResolvedValueOnce(
        new Response(streamFrom("<html><body>ok</body></html>"), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchPageSafely("https://example.com/start", "example.com");
    expect(result.status).toBe("analyzed");
    if (result.status === "analyzed") {
      expect(result.finalUrl).toBe("https://example.com/final");
      expect(result.html).toContain("ok");
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("discards a redirect that hops off-domain, without following it", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        textResponse(null, { status: 302, headers: { location: "https://attacker.com/steal" } })
      );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchPageSafely("https://example.com/start", "example.com");
    expect(result.status).toBe("skipped_offsite");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("gives up after too many redirects", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      const n = Number(new URL(url).pathname.replace("/", "")) || 0;
      return Promise.resolve(
        textResponse(null, { status: 302, headers: { location: `https://example.com/${n + 1}` } })
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchPageSafely("https://example.com/0", "example.com");
    expect(result.status).toBe("skipped_offsite");
  });

  it("rejects a non-HTML content type", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(streamFrom("{}"), { status: 200, headers: { "content-type": "application/json" } })
      )
    );

    const result = await fetchPageSafely("https://example.com/data.json", "example.com");
    expect(result.status).toBe("skipped_not_html");
  });

  it("reports a timeout distinctly from a generic fetch error", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError));

    const result = await fetchPageSafely("https://example.com/slow", "example.com");
    expect(result.status).toBe("skipped_timeout");
  });

  it("truncates a body larger than MAX_HTML_BYTES instead of failing", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const bigBody = "a".repeat(600 * 1024);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(streamFrom(bigBody), { status: 200, headers: { "content-type": "text/html" } })
      )
    );

    const result = await fetchPageSafely("https://example.com/big", "example.com");
    expect(result.status).toBe("analyzed");
    if (result.status === "analyzed") {
      expect(result.html.length).toBeLessThanOrEqual(512 * 1024);
    }
  });
});

describe("readBodyCapped", () => {
  it("returns an empty string when the response has no body", async () => {
    const response = new Response(null);
    expect(await readBodyCapped(response, 1024)).toBe("");
  });
});
