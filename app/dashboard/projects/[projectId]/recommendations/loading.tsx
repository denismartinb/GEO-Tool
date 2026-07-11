import { Skeleton } from "@/components/ui/skeleton";

export default function RecommendationsLoading() {
  return (
    <div className="page">
      <Skeleton width={90} height={12} style={{ marginBottom: 8 }} />
      <Skeleton width={240} height={22} style={{ marginBottom: 24 }} />
      <div className="recs-3col">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rec-card-preview">
            <Skeleton height={180} />
          </div>
        ))}
      </div>
    </div>
  );
}
