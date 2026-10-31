import { Sk, SkCard, SkHead, SkPage, SkRows } from "@/components/ins/skeleton";

/** Competidores while it loads (log §398): the ranking card with its five rows. */
export default function CompetitorsLoading() {
  return (
    <SkPage>
      <SkHead action lead={2} />

      <SkCard style={{ marginTop: 32 }}>
        <div className="sk-h">
          <Sk w={70} h={13} className="strong" />
          <Sk w={130} h={11} className="sk-hide-m" />
        </div>
        <SkRows n={5} lead="num" />
      </SkCard>

      <SkCard style={{ marginTop: 16 }}>
        <Sk w={150} h={14} className="strong" />
        <Sk w="100%" h={180} style={{ borderRadius: 12 }} />
      </SkCard>
    </SkPage>
  );
}
