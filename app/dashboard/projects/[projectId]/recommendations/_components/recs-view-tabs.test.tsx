import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoogleRecsPresent, RecsViewTabs } from "./recs-view-tabs";

// RECS-SHORT-CARD-1 (log §301). Clicks and effects don't run here, so this
// only pins the starting state: no pills until Google cards actually mount.
// That they then appear is checked by hand on the preview.
describe("RecsViewTabs", () => {
  it("shows no pills and only the AI half before Google recommendations arrive", () => {
    const html = renderToStaticMarkup(
      <RecsViewTabs ai={<p>ia</p>} google={<p>google</p>} />
    );
    expect(html).not.toContain("rec2-views");
    expect(html).not.toContain("Mejora Google");
    expect(html).not.toContain('role="tab');
    expect(html).toMatch(/id="rec2-panel-ia"><p>ia<\/p>/);
    expect(html).toMatch(/id="rec2-panel-google" hidden="">/);
  });

  it("keeps the pills off on the server render even with Google cards inside", () => {
    const html = renderToStaticMarkup(
      <RecsViewTabs ai={<p>ia</p>} google={<><GoogleRecsPresent /><p>card</p></>} />
    );
    expect(html).not.toContain("rec2-views");
  });

  it("is harmless outside the tabs", () => {
    expect(renderToStaticMarkup(<GoogleRecsPresent />)).toBe("");
  });
});
