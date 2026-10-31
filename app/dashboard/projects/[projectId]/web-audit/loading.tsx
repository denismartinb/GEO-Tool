import { Sk, SkCard, SkHead, SkPage, SkRows, SkTabs } from "@/components/ins/skeleton";

/** Auditoría técnica while it loads (log §398): the block card with its arc, the tabs, problems and bot access. */
export default function WebAuditLoading() {
  return (
    <SkPage>
      <SkHead lead={2} />

      <SkCard style={{ marginTop: 28 }}>
        <div className="sk-h">
          <div className="sk-split" style={{ flexDirection: "row" }}>
            <Sk w={84} h={84} className="circ" />
            <div style={{ display: "grid", gap: 10 }}>
              <Sk w={70} h={11} />
              <Sk w={150} h={14} className="strong" />
              <Sk w={110} h={11} />
            </div>
          </div>
          <Sk w={90} h={34} className="strong sk-hide-m" />
        </div>
      </SkCard>

      <div style={{ marginTop: 24 }}>
        <SkTabs n={3} />
      </div>

      <div className="sk-g21" style={{ marginTop: 16 }}>
        <SkCard>
          <Sk w={90} h={13} className="strong" />
          <SkRows n={4} lead="dot" />
        </SkCard>
        <SkCard>
          <Sk w={120} h={13} className="strong" />
          <SkRows n={5} lead="icon" />
        </SkCard>
      </div>
    </SkPage>
  );
}
