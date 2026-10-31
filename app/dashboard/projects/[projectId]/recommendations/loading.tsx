import { Sk, SkCard, SkHead, SkPage, SkRows, SkSection, SkStrip, SkTabs } from "@/components/ins/skeleton";

/** Recomendaciones while it loads (log §398): the plan deck first, «Más adelante», then the pillars at the bottom (log §396). */
export default function RecommendationsLoading() {
  return (
    <SkPage>
      <SkHead action lead={1} />

      <SkSection side={<Sk w={88} h={40} className="pill sk-hide-m" />}>
        <div className="sk-progress" style={{ marginBottom: 18 }}>
          {[0, 1, 2, 3].map((i) => (
            <Sk key={i} />
          ))}
        </div>
        <SkCard style={{ gap: 18, padding: 28 }}>
          <div className="sk-h">
            <div className="sk-split" style={{ flexDirection: "row" }}>
              <Sk w={56} h={40} className="strong" />
              <Sk w={110} h={22} className="pill" />
            </div>
            <Sk w={64} h={40} className="strong" />
          </div>
          <Sk w={70} h={11} />
          <Sk w="84%" h={24} className="strong" />
          <Sk w="96%" />
          <Sk w="78%" />
          <div className="sk-split" style={{ flexDirection: "row", marginTop: 6 }}>
            <Sk w={150} h={40} className="pill strong" />
            <Sk w={110} h={40} className="pill" />
          </div>
        </SkCard>
      </SkSection>

      <SkSection>
        <SkTabs n={4} />
        <div style={{ marginTop: 10 }}>
          <SkRows n={5} lead="icon" />
        </div>
      </SkSection>

      <section className="sk-sec">
        <SkStrip n={4} row />
      </section>
    </SkPage>
  );
}
