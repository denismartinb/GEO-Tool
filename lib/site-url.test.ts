import { afterEach, describe, expect, it } from "vitest";

import { getSiteUrl } from "@/lib/site-url";

const ORIGINAL_ENV = { ...process.env };

// log §241: production's NEXT_PUBLIC_SITE_URL ends in "/" and every
// self-dispatch (`${getSiteUrl()}/api/...`) went to "//api/..." → Vercel 508.
describe("getSiteUrl", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it.each(["https://www.genscore.es/", "https://www.genscore.es//", " https://www.genscore.es/ "])(
    "strips trailing slashes from NEXT_PUBLIC_SITE_URL (%j)",
    (value) => {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      expect(getSiteUrl()).toBe("https://www.genscore.es");
      expect(`${getSiteUrl()}/api/scan/continue`).toBe("https://www.genscore.es/api/scan/continue");
    }
  );

  it("falls back to VERCEL_URL, then localhost", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "geo-tool-abc.vercel.app";
    expect(getSiteUrl()).toBe("https://geo-tool-abc.vercel.app");
    delete process.env.VERCEL_URL;
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});
