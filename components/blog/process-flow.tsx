import { Icon } from "@/components/ui/icon";

/**
 * A connected sequence of steps (data → evidence → recommendation → action,
 * or similar) — reused across posts instead of a bespoke diagram per post.
 * Deliberately a straight sequence rather than a literal circle/loop shape:
 * far more legible on the mobile widths this blog is actually read on.
 */
export function ProcessFlow({ steps }: { steps: { icon: string; label: string }[] }) {
  return (
    <div className="process-flow">
      {steps.map((step, i) => (
        <div key={step.label} className="process-flow-step-wrap">
          <div className="process-flow-step">
            <div className="process-flow-icon">
              <Icon name={step.icon} size={18} />
            </div>
            <span>{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="process-flow-arrow">
              <Icon name="arrRight" size={16} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
