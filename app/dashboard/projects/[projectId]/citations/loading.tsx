import { Sk, SkCard, SkHead, SkPage, SkRows, SkSection, SkStrip } from "@/components/ins/skeleton";

/** Páginas citadas while it loads (log §398): three figures in one row, then the origin ring and its legend. */
export default function CitationsLoading() {
  return (
    <SkPage>
      <SkHead lead={2} />
      <Sk w={190} h={30} className="pill" style={{ marginTop: 16 }} />

      <div style={{ marginTop: 28 }}>
        <SkStrip n={3} row bar={false} />
      </div>

      <SkSection>
        <SkCard>
          <div className="sk-g2" style={{ alignItems: "center" }}>
            <div style={{ display: "grid", placeItems: "center", padding: "8px 0" }}>
              <Sk w={180} h={180} className="circ" />
            </div>
            <SkRows n={3} lead="dot" />
          </div>
        </SkCard>
      </SkSection>

      <SkSection>
        <SkCard flush>
          <SkRows n={5} lead="icon" />
        </SkCard>
      </SkSection>
    </SkPage>
  );
}
