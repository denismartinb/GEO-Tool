import type { ReactNode } from "react";

/**
 * The head every console screen shares (CONSOLE-PAGE-TEMPLATE-1): the title,
 * the screen's one action on the right of the same row, and the data sentence
 * under it. No counter next to the title: the screen itself shows the list. The section and domain are already
 * in the menu and the domain switcher, so there is no eyebrow. On a phone the
 * action keeps its row and drops its label (`.ph-lbl`), so it never pushes the
 * content of the screen down. Server component; the action can be a client one.
 */
export function PageHead({
  title,
  action,
  lead,
}: {
  title: ReactNode;
  action?: ReactNode;
  lead?: ReactNode;
}) {
  return (
    <>
      <div className="pr-hd ph">
        <h1>{title}</h1>
        {action ?? null}
      </div>
      {lead ? <p className="lead">{lead}</p> : null}
    </>
  );
}
