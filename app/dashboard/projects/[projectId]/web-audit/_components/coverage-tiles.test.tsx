import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MiniBar } from "./coverage-tiles";

/** Render test for the history bar of «Historial de comprobaciones». */

describe("MiniBar", () => {
  it("acota el relleno a 0-100 en vez de desbordar la barra", () => {
    expect(renderToStaticMarkup(<MiniBar pct={140} color="red" />)).toContain("width:100%");
    expect(renderToStaticMarkup(<MiniBar pct={-20} color="red" />)).toContain("width:0%");
    expect(renderToStaticMarkup(<MiniBar pct={37} color="red" />)).toContain("width:37%");
  });
});
