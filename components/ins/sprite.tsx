import { INS_SPRITE } from "@/app/ins/sprite";

/** Hoja de símbolos de la consola. Se monta una vez en el marco. */
export function InsSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs dangerouslySetInnerHTML={{ __html: INS_SPRITE }} />
    </svg>
  );
}
