import { Icon } from "@/components/ui/icon";

type DeltaProps = {
  value: number;
  suffix?: string;
  invert?: boolean;
};

export function Delta({ value, suffix = "", invert = false }: DeltaProps) {
  const positive = invert ? value < 0 : value > 0;
  const flat = value === 0;
  const cls = flat ? "flat" : positive ? "up" : "down";
  const sign = value > 0 ? "+" : "";

  return (
    <span className={`delta ${cls}`}>
      {!flat && <Icon name={value > 0 ? "arrUp" : "arrDown"} size={11} />}
      {sign}{value}{suffix}
    </span>
  );
}
