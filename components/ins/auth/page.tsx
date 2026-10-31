import type { ReactNode } from "react";
import { InsSprite } from "@/components/ins/sprite";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { AuthShell } from "./shell";

/** Server wrapper of an entry screen: scope, symbol sheet and Bruma frame. */
export function AuthPage({
  children,
  lit = 0,
  splash = false,
  launch = false,
  continueTo
}: {
  children: ReactNode;
  lit?: 0 | 1 | 2;
  splash?: boolean;
  /** An opening of the Android app (`?source=twa`): the splash plays even if already seen (log §389). */
  launch?: boolean;
  /** Session already open: after the splash, go here instead of showing a form. */
  continueTo?: string;
}) {
  return (
    <main className="ins ins-auth">
      <InsSprite />
      <ServiceWorkerRegister />
      <AuthShell lit={lit} splash={splash} launch={launch} continueTo={continueTo}>
        {children}
      </AuthShell>
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
