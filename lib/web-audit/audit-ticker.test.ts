import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AUDIT_TICKER_INTERVAL_MS,
  AUDIT_TICKER_LINES,
  tickerLineAt,
  type AuditTickerLine
} from "@/lib/web-audit/audit-ticker";

/**
 * The check keys the audit really computes, read from `issues.ts` itself
 * rather than copied here.
 *
 * Copying the list would defeat the whole point: the pair would drift apart
 * silently, and this suite would keep certifying a ticker that describes
 * checks the product removed. Parsing the source means deleting a check from
 * `IssueCheckKey` turns this red until someone deletes its line too.
 */
function realCheckKeys(): Set<string> {
  const src = readFileSync("lib/web-audit/issues.ts", "utf8");
  const block = src.slice(src.indexOf("export type IssueCheckKey"));
  const union = block.slice(0, block.indexOf(";"));
  // Digits matter: `single_h1` and `two_h2` are real keys, and a letters-only
  // pattern silently dropped both — the parser reported them as invented.
  return new Set([...union.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
}

describe("AUDIT_TICKER_LINES", () => {
  it("describes only checks the audit really performs", () => {
    // The structural guarantee behind the founder's "poner en valor lo que se
    // hace": mission voice can make anything sound impressive, so a line for
    // work the product does not do must be impossible to add quietly.
    const real = realCheckKeys();
    expect(real.size).toBeGreaterThan(0);

    for (const line of AUDIT_TICKER_LINES) {
      expect(real, `"${line.title}" claims a check that does not exist: ${line.check}`).toContain(line.check);
    }
  });

  it("covers every technical check exactly once", () => {
    // No duplicates (the same work sold twice) and no silent omissions.
    const keys = AUDIT_TICKER_LINES.map((l) => l.check);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(16);
  });

  it("says nothing about the Pro-gated coverage half", () => {
    // A Free project watching its first audit must not be shown lines for work
    // that is not running for it — and must not be shown them greyed out
    // either, which would turn a waiting screen into an upsell.
    for (const line of AUDIT_TICKER_LINES) {
      expect(line.check).not.toMatch(/cover/i);
    }
  });

  it("carries real prose, not placeholders", () => {
    for (const line of AUDIT_TICKER_LINES) {
      expect(line.title.trim().length).toBeGreaterThan(3);
      expect(line.detail.trim().length).toBeGreaterThan(20);
    }
  });
});

describe("tickerLineAt", () => {
  const lines = AUDIT_TICKER_LINES;

  it("starts on the first line", () => {
    expect(tickerLineAt(0)).toBe(lines[0]);
    expect(tickerLineAt(AUDIT_TICKER_INTERVAL_MS - 1)).toBe(lines[0]);
  });

  it("advances one line per interval", () => {
    expect(tickerLineAt(AUDIT_TICKER_INTERVAL_MS)).toBe(lines[1]);
    expect(tickerLineAt(AUDIT_TICKER_INTERVAL_MS * 5)).toBe(lines[5]);
  });

  it("wraps seamlessly instead of running off the end", () => {
    // An audit outlives the ticker: 16 lines x 4s is 64s, and audits take
    // minutes. The wrap has to be exact, not "close enough".
    const full = AUDIT_TICKER_INTERVAL_MS * lines.length;
    expect(tickerLineAt(full)).toBe(lines[0]);
    expect(tickerLineAt(full + AUDIT_TICKER_INTERVAL_MS)).toBe(lines[1]);
    expect(tickerLineAt(full * 7 + AUDIT_TICKER_INTERVAL_MS * 3)).toBe(lines[3]);
  });

  it("never throws on a nonsense clock", () => {
    // Defensive: the elapsed value comes from a timer that a suspended tab or
    // a clock change can make negative or NaN.
    for (const bad of [-1, -999_999, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => tickerLineAt(bad)).not.toThrow();
      expect(lines).toContain(tickerLineAt(bad));
    }
  });

  it("works on a custom line set", () => {
    const custom: AuditTickerLine[] = [
      { title: "a", detail: "aaaaaaaaaaaaaaaaaaaaaaa", check: "canonical" },
      { title: "b", detail: "bbbbbbbbbbbbbbbbbbbbbbb", check: "freshness" }
    ];
    expect(tickerLineAt(0, custom)).toBe(custom[0]);
    expect(tickerLineAt(AUDIT_TICKER_INTERVAL_MS, custom)).toBe(custom[1]);
    expect(tickerLineAt(AUDIT_TICKER_INTERVAL_MS * 2, custom)).toBe(custom[0]);
  });
});
