import { Icon } from "@/components/ui/icon";

const COMPONENTS = [
  { key: "presence", icon: "check", label: "Presencia", weight: 40, color: "#4f46e5" },
  { key: "prominence", icon: "trendUp", label: "Prominencia", weight: 25, color: "#7c3aed" },
  { key: "standing", icon: "target", label: "Posición competitiva", weight: 20, color: "#0d9488" },
  { key: "authority", icon: "layers", label: "Autoridad", weight: 15, color: "#c026d3" }
];

/**
 * Visual breakdown of the GEO Score's 4 weighted components — ties directly
 * to the "Los cuatro componentes" section's table (docs/adr/0008), same
 * weights, just illustrated as bars instead of only a table row.
 */
export function GeoScoreBreakdown() {
  return (
    <div className="geo-breakdown">
      {COMPONENTS.map((c) => (
        <div key={c.key} className="geo-breakdown-row">
          <div className="geo-breakdown-label">
            <Icon name={c.icon} size={15} />
            <span>{c.label}</span>
          </div>
          <div className="geo-breakdown-bar-wrap">
            <div className="geo-breakdown-bar" style={{ width: `${c.weight}%`, background: c.color }} />
          </div>
          <div className="geo-breakdown-weight">{c.weight}%</div>
        </div>
      ))}
    </div>
  );
}
