import { Sk, SkCard, SkHead, SkPage, SkRows, SkSection, SkStrip } from "@/components/ins/skeleton";

/** Visión general while it loads (log §398): score sheet, figures, plan, breakdown and the agentic + SEO pair. */
export default function OverviewLoading() {
  return (
    <SkPage>
      <SkHead action lead={2} />

      <div className="sk-g57" style={{ marginTop: 32 }}>
        <SkCard style={{ gap: 18 }}>
          <Sk w={130} h={26} className="pill strong" />
          <Sk className="sk-score strong" />
          <Sk className="sk-bar" w="100%" />
          <Sk w="88%" h={18} />
          <Sk w="64%" h={18} />
          <Sk w={170} h={40} className="pill" />
        </SkCard>
        <SkCard>
          <Sk w={90} h={13} className="strong" />
          <Sk w="100%" h={150} style={{ borderRadius: 12 }} />
          <SkRows n={4} lead="icon" />
        </SkCard>
      </div>

      <div style={{ marginTop: 28 }}>
        <SkStrip n={4} />
      </div>

      <SkSection>
        <SkCard style={{ gap: 18 }}>
          <div className="sk-split">
            <Sk w={60} h={36} className="strong" />
            <Sk w={110} h={22} className="pill" />
          </div>
          <Sk w="76%" h={22} className="strong" />
          <Sk w="92%" />
          <Sk w="70%" />
        </SkCard>
      </SkSection>

      <section className="sk-sec sk-g57">
        <SkCard>
          <Sk w={140} h={14} className="strong" />
          <SkRows n={4} lead="none" />
        </SkCard>
        <SkCard>
          <Sk w={160} h={14} className="strong" />
          <SkRows n={5} lead="num" />
        </SkCard>
      </section>

      <section className="sk-sec sk-g2">
        <SkCard>
          <Sk w={150} h={14} className="strong" />
          <Sk className="sk-score" style={{ height: 56, width: 90 }} />
          <SkRows n={3} lead="dot" figure={false} />
        </SkCard>
        <SkCard>
          <Sk w={130} h={14} className="strong" />
          <Sk className="sk-score" style={{ height: 56, width: 90 }} />
          <SkRows n={3} lead="dot" figure={false} />
        </SkCard>
      </section>
    </SkPage>
  );
}
