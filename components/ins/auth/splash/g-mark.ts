/**
 * The geometric G of the app splash (log §382). Two concentric rings of one
 * stroke width, three equal parallel cuts, a bar with a round end clipped to
 * the outer ring, and the amber dot centred on the ring. Everything derives
 * from the constants below, so the mark is exact at 27 px and at full screen.
 */
export const G_C = 146;
export const G_RM = 113;
export const G_RO = 140;
export const G_RI = 86;
export const G_DOT_ANGLE = 316;
export const G_STROKE = 54;
export const G_DOT_R = 30;
const CUTS = [77, 153, 214];

const f2 = (n: number) => n.toFixed(2);

/** Point on a circle around the mark's centre, angle in degrees from 3 o'clock. */
export function gPoint(angle: number, r: number = G_RM): [number, number] {
  const t = (angle * Math.PI) / 180;
  return [G_C + r * Math.cos(t), G_C + r * Math.sin(t)];
}

export function gArc(a0: number, a1: number, r: number = G_RM): string {
  const [px, py] = gPoint(a0, r);
  const [qx, qy] = gPoint(a1, r);
  return `M${f2(px)} ${f2(py)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f2(qx)} ${f2(qy)}`;
}

/** Inner markup of the mark (viewBox 0 0 292 292). `id` must be unique per document. */
export function gMarkInner(id: string): string {
  const cuts = CUTS.map((a) => {
    const [px, py] = gPoint(a, 76);
    const [qx, qy] = gPoint(a, 152);
    return `<line x1="${f2(px)}" y1="${f2(py)}" x2="${f2(qx)}" y2="${f2(qy)}" stroke="#000" stroke-width="8"/>`;
  }).join("");
  const [dx, dy] = gPoint(G_DOT_ANGLE);
  const ink = "var(--ink,#0b1426)";
  const blue = "var(--blue,#2563eb)";
  return (
    `<defs><mask id="${id}m" maskUnits="userSpaceOnUse" x="-10" y="-10" width="312" height="312"><rect x="-10" y="-10" width="312" height="312" fill="#fff"/>${cuts}</mask>` +
    `<clipPath id="${id}c"><circle cx="146" cy="146" r="140"/></clipPath></defs>` +
    `<g mask="url(#${id}m)">` +
    `<path class="g-n" d="${gArc(0, 153)}" pathLength="100" stroke-width="${G_STROKE}" fill="none" stroke="${ink}" stroke-dasharray="100 101"/>` +
    `<path class="g-b" d="${gArc(153, 296)}" pathLength="100" stroke-width="${G_STROKE}" fill="none" stroke="${blue}" stroke-dasharray="100 101"/></g>` +
    `<g clip-path="url(#${id}c)"><path class="g-x" d="M164 146H300" pathLength="100" stroke-width="${G_STROKE}" stroke-linecap="round" fill="none" stroke="${ink}" stroke-dasharray="100 101"/></g>` +
    `<circle class="g-d" cx="${f2(dx)}" cy="${f2(dy)}" r="${G_DOT_R}" fill="var(--amber,#ffb020)"/>`
  );
}
