import { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

type Variant = "default" | "outline" | "ghost" | "destructive";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({ className, variant = "default", ...props }: Props) {
  const styles = {
    default: "bg-[var(--accent)] text-white hover:opacity-95",
    outline: "border border-[#dde0e7] bg-white text-[var(--ink-2)] hover:bg-[#fbfbfd]",
    ghost: "border border-transparent bg-transparent text-[var(--ink-2)] hover:bg-[#fbfbfd]",
    destructive: "bg-red-600 text-white hover:bg-red-500"
  };

  return (
    <button
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-semibold disabled:opacity-50",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
