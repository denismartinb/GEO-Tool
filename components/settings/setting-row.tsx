import type { ReactNode } from "react";

export function SettingRow({
  title,
  desc,
  children,
  last
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`set-row ${last ? "last" : ""}`}>
      <div className="set-row-txt">
        <div className="set-row-t">{title}</div>
        {desc && <div className="set-row-d">{desc}</div>}
      </div>
      <div className="set-row-ctrl">{children}</div>
    </div>
  );
}
