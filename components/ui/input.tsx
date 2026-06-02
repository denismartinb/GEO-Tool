import { InputHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-10 w-full rounded-[10px] border border-[#dde0e7] bg-white px-3 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none",
        className
      )}
      {...props}
    />
  );
}
