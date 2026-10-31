import { Sk, SkCard, SkHead, SkPage, SkRows, SkSection } from "@/components/ins/skeleton";

/** Visibilidad en agentes while it loads (log §398): the dial board, then the shopping questions. */
export default function AgenticVisibilityLoading() {
  return (
    <SkPage>
      <SkHead lead={2} />

      <SkCard style={{ marginTop: 28, gap: 22 }}>
        <Sk w={150} h={24} className="pill" />
        <div style={{ display: "grid", placeItems: "center" }}>
          <Sk w={220} h={220} className="circ" />
        </div>
        <div className="sk-progress">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "grid", gap: 8, justifyItems: "center" }}>
              <Sk w={48} h={48} className="circ" />
              <Sk w="70%" h={10} />
            </div>
          ))}
        </div>
      </SkCard>

      <SkSection>
        <SkCard flush>
          <SkRows n={4} lead="icon" />
        </SkCard>
      </SkSection>
    </SkPage>
  );
}
