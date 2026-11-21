import { SkCard, SkHead, SkPage, SkRows } from "@/components/ins/skeleton";

export default function DebugLoading() {
  return (
    <SkPage>
      <SkHead lead={1} />
      <SkCard flush style={{ marginTop: 28 }}>
        <SkRows n={6} lead="dot" />
      </SkCard>
    </SkPage>
  );
}
