import { tierOf } from "@/lib/search-console/insights";
import { fmtPosition } from "./format";

/** A position, big and coloured by its tier (log §287). */
export function PosBadge({ position }: { position: number }) {
  return <span className={`gsc-posb gsc-posb-${tierOf(position)}`}>{fmtPosition(position)}</span>;
}
