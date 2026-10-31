import { SkHead, SkPage, SkTabs } from "@/components/ins/skeleton";
import { GscLoading } from "./_components/gsc-loading";

/**
 * Shown while Google answers (log §289). Data is cached afterwards, so this
 * mostly appears on the first visit. The head and tabs follow the Instrumento
 * screen (log §398); the ambient search scene stays.
 */
export default function SearchConsoleLoading() {
  return (
    <SkPage>
      <SkHead action lead={2} />
      <div style={{ marginTop: 24 }}>
        <SkTabs n={3} />
      </div>
      <GscLoading />
    </SkPage>
  );
}
