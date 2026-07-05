export function Skeleton({ width, height, style, className }: { width?: number | string; height?: number | string; style?: React.CSSProperties; className?: string }) {
  return <div className={`skel ${className ?? ""}`} style={{ width, height, ...style }} />;
}

export function SkeletonCard({ children }: { children?: React.ReactNode }) {
  return <div className="skel-card">{children}</div>;
}
