import { clsx } from "clsx";

type Step = {
  label: string;
  description: string;
};

type StepperProps = {
  currentStep: number;
  steps: Step[];
};

export function Stepper({ currentStep, steps }: StepperProps) {
  return (
    <ol className="grid gap-2 sm:grid-cols-3" aria-label="Progreso del onboarding">
      {steps.map((step, index) => {
        const isCurrent = index === currentStep;
        const isDone = index < currentStep;

        return (
          <li
            key={step.label}
            className={clsx(
              "rounded-[14px] border p-3 transition-colors",
              isCurrent ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[#e8eaef] bg-white",
              isDone ? "border-[var(--accent-soft-2)] bg-[#fbfbff]" : null
            )}
            aria-current={isCurrent ? "step" : undefined}
          >
            <div className="flex items-start gap-3">
              <span
                className={clsx(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-xs font-bold",
                  isCurrent || isDone ? "bg-[var(--accent)] text-white" : "bg-[#f1f3f6] text-[var(--ink-3)]"
                )}
              >
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-[var(--ink)]">{step.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-3)]">{step.description}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
