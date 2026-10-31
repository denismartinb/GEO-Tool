import { Sk, SkCard, SkHead, SkPage, SkRows, SkTabs } from "@/components/ins/skeleton";

/** Auditoría agéntica while it loads (log §399): reviewed page and score, the component tabs and the first component. */
export default function AgenticAuditLoading() {
  return (
    <SkPage>
      <SkHead lead={2} />

      <div className="sk-g21" style={{ marginTop: 28 }}>
        <SkCard>
          <Sk w={90} h={11} />
          <div className="sk-row" style={{ padding: 0, border: 0 }}>
            <Sk w={36} h={36} style={{ borderRadius: 10 }} />
            <div className="sk-grow">
              <Sk w="60%" h={14} className="strong" />
              <Sk w="40%" h={10} />
            </div>
          </div>
          <Sk w="88%" h={10} />
        </SkCard>
        <SkCard>
          <Sk w={110} h={11} />
          <Sk className="sk-score" style={{ height: 40, width: 80 }} />
          <Sk className="sk-bar strong" w="100%" />
        </SkCard>
      </div>

      <div style={{ marginTop: 24 }}>
        <SkTabs n={5} />
      </div>

      <div className="sk-g21" style={{ marginTop: 16 }}>
        <SkCard>
          <div className="sk-h">
            <Sk w={120} h={14} className="strong" />
            <Sk w={44} h={22} className="strong" />
          </div>
          <Sk className="sk-bar" w="100%" />
          <SkRows n={3} lead="dot" figure={false} />
        </SkCard>
        <SkCard>
          <Sk w={150} h={13} className="strong" />
          <SkRows n={4} lead="icon" />
        </SkCard>
      </div>
    </SkPage>
  );
}
