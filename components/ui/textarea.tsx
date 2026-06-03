import { TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full rounded-[10px] border border-[#dde0e7] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none",
        className
      )}
      {...props}
    />
  );
}
