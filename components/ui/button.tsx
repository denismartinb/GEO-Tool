import { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

type Variant = "default" | "outline" | "ghost" | "destructive";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({ className, variant = "default", ...props }: Props) {
  const styles = {
    default: "bg-slate-900 text-white hover:bg-slate-700",
    outline: "border border-slate-300 bg-white hover:bg-slate-100",
    ghost: "bg-transparent hover:bg-slate-100",
    destructive: "bg-red-600 text-white hover:bg-red-500"
  };

  return (
    <button
      className={clsx(
        "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium disabled:opacity-50",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
