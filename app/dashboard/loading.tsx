import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic fallback for any dashboard navigation without a more specific
 * `loading.tsx` closer to the target segment. Next.js nests Suspense
 * boundaries per segment, so this also covers nested layouts (e.g.
 * `settings/layout.tsx`) that don't have their own boundary — see
 * docs/architecture-audit-2026-07.md finding 1.1.
 */
export default function DashboardLoading() {
  return (
    <div className="page">
      <Skeleton height={22} width={160} style={{ marginBottom: 10 }} />
      <Skeleton height={36} width={320} style={{ marginBottom: 28 }} />
      <div style={{ display: "grid", gap: 14 }}>
        <Skeleton height={120} />
        <Skeleton height={120} />
        <Skeleton height={220} />
      </div>
    </div>
  );
}
