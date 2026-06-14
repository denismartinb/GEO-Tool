import { Icon } from "@/components/ui/icon";

type DeltaProps = {
  value: number;
  suffix?: string;
  invert?: boolean;
};

export function Delta({ value, suffix = "", invert = false }: DeltaProps) {
  const rounded = Math.round(value * 100) / 100;
  const positive = invert ? rounded < 0 : rounded > 0;
  const flat = rounded === 0;
  const cls = flat ? "flat" : positive ? "up" : "down";
  const sign = rounded > 0 ? "+" : "";
  const display = Number.isInteger(rounded) ? rounded : rounded.toFixed(2);

  return (
    <span className={`delta ${cls}`}>
      {!flat && <Icon name={rounded > 0 ? "arrUp" : "arrDown"} size={11} />}
      {sign}{display}{suffix}
    </span>
  );
}
