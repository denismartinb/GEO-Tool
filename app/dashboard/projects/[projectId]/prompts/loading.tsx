import { Skeleton } from "@/components/ui/skeleton";

export default function PromptsLoading() {
  return (
    <div className="page">
      <Skeleton width={90} height={12} style={{ marginBottom: 8 }} />
      <Skeleton width={240} height={22} style={{ marginBottom: 24 }} />
      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={48} />
        ))}
      </div>
    </div>
  );
}
