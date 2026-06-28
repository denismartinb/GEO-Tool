export function Switch({
  on,
  onChange,
  disabled
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={`sw ${on ? "on" : ""}`}
      onClick={() => !disabled && onChange(!on)}
    >
      <span className="sw-knob" />
    </button>
  );
}
