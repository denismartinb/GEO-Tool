import { Skeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
  return (
    <div className="page">
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <Skeleton width={90} height={12} style={{ marginBottom: 8 }} />
          <Skeleton width={220} height={18} />
        </div>
      </div>

      <div className="hero-v2" style={{ marginTop: 20 }}>
        <div className="hv-gauge">
          <Skeleton width={140} height={140} style={{ borderRadius: "999px" }} />
        </div>
        <div className="hv-divider" />
        <div className="hv-compose" style={{ display: "grid", gap: 14 }}>
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      </div>

      <div className="metrics-2col" style={{ marginTop: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="wide-stat">
            <Skeleton height={90} />
          </div>
        ))}
      </div>

      <div className="grid-2-1" style={{ marginTop: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <Skeleton height={220} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <Skeleton height={220} />
        </div>
      </div>
    </div>
  );
}
