import type { ReactNode } from "react";
import { InsSprite } from "@/components/ins/sprite";
import { AuthShell } from "./shell";

/** Server wrapper of an entry screen: scope, symbol sheet and Bruma frame. */
export function AuthPage({ children, lit = 0, splash = false }: { children: ReactNode; lit?: 0 | 1 | 2; splash?: boolean }) {
  return (
    <main className="ins ins-auth">
      <InsSprite />
      <AuthShell lit={lit} splash={splash}>{children}</AuthShell>
    </main>
  );
}

export function AuthHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <h1 className="au-t">{title}</h1>
      {children ? <p className="au-s">{children}</p> : null}
    </>
  );
}
