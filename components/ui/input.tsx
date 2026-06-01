import { InputHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-500 focus:outline-none",
        className
      )}
      {...props}
    />
  );
}
