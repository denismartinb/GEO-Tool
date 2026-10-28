/** Icono de la hoja de símbolos de la consola (`#i-<nombre>`). */
export function Ic({ n, sm, className }: { n: string; sm?: boolean; className?: string }) {
  return (
    <svg className={`i${sm ? " sm" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true" focusable="false">
      <use href={`#i-${n}`} />
    </svg>
  );
}
