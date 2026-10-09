import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIndexNowPayload, getIndexNowKey, INDEXNOW_ENDPOINT, ownUrls, pingIndexNow } from "./indexnow";
import { GET } from "@/app/indexnow-key.txt/route";

const KEY = "abc123def456";

describe("getIndexNowKey", () => {
  it("is null when unset, blank or malformed", () => {
    expect(getIndexNowKey("")).toBeNull();
    expect(getIndexNowKey("  ")).toBeNull();
    expect(getIndexNowKey("short")).toBeNull();
    expect(getIndexNowKey("has spaces in it")).toBeNull();
  });

  it("returns a well-formed key, trimmed", () => {
    expect(getIndexNowKey(` ${KEY}\n`)).toBe(KEY);
  });
});

describe("ownUrls / payload", () => {
  it("keeps only our host, deduplicated", () => {
    expect(
      ownUrls(["https://www.genscore.es/blog", "https://www.genscore.es/blog", "https://evil.example/x", "nope"])
    ).toEqual(["https://www.genscore.es/blog"]);
  });

  it("declares the key file as keyLocation on our host", () => {
    expect(buildIndexNowPayload(["https://www.genscore.es/"], KEY)).toEqual({
      host: "www.genscore.es",
      key: KEY,
      keyLocation: "https://www.genscore.es/indexnow-key.txt",
      urlList: ["https://www.genscore.es/"]
    });
  });
});

describe("pingIndexNow", () => {
  it("is a no-op without a key — never calls the network", async () => {
    const fetchImpl = vi.fn();
    expect(await pingIndexNow(["https://www.genscore.es/"], { key: null, fetchImpl })).toEqual({
      status: "skipped",
      reason: "no_key"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs the payload and reports success", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const result = await pingIndexNow(["https://www.genscore.es/", "https://www.genscore.es/blog"], {
      key: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result).toEqual({ status: "sent", submitted: 2, httpStatuses: [202] });
    const [endpoint, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe(INDEXNOW_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).urlList).toHaveLength(2);
  });

  it("a non-2xx answer is a failure, not a silent success", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }));
    const result = await pingIndexNow(["https://www.genscore.es/"], {
      key: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result).toEqual({ status: "failed", submitted: 0, httpStatuses: [403] });
  });

  it("a transport error is a failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await pingIndexNow(["https://www.genscore.es/"], {
      key: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.status).toBe("failed");
  });
});

describe("GET /indexnow-key.txt", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("404s while INDEXNOW_KEY is unset", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    expect(GET().status).toBe(404);
  });

  it("serves the key as plain text when set", async () => {
    vi.stubEnv("INDEXNOW_KEY", KEY);
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(KEY);
  });
});
