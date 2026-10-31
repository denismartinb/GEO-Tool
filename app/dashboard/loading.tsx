import { SkCard, SkHead, SkPage, SkRows } from "@/components/ins/skeleton";

/**
 * Generic fallback for any dashboard navigation without a more specific
 * `loading.tsx` closer to the target segment (Dominios, Notificaciones…).
 * Next.js nests Suspense boundaries per segment, so this also covers nested
 * layouts without their own boundary — see docs/architecture-audit-2026-07.md
 * finding 1.1. Instrumento shape and tokens, dark mode included (log §399).
 */
export default function DashboardLoading() {
  return (
    <SkPage>
      <SkHead action lead={1} />
      <div className="sk-g2" style={{ marginTop: 28 }}>
        <SkCard>
          <SkRows n={3} lead="icon" />
        </SkCard>
        <SkCard>
          <SkRows n={3} lead="icon" />
        </SkCard>
      </div>
      <SkCard flush style={{ marginTop: 16 }}>
        <SkRows n={4} lead="dot" />
      </SkCard>
    </SkPage>
  );
}
