import type { IssueAudience } from "@/lib/web-audit/issue-labels";

/** The GOOGLE / IA tags of the approved design: who a check or an area matters to. Renders nothing for an empty list. */
export function AudienceTags({ audience }: { audience: IssueAudience[] }) {
  if (audience.length === 0) return null;
  return (
    <span className="sa-who">
      {audience.map((who) =>
        who === "google" ? (
          <span key={who} className="sa-tag sa-tag-g">
            GOOGLE
          </span>
        ) : (
          <span key={who} className="sa-tag sa-tag-ia">
            IA
          </span>
        )
      )}
    </span>
  );
}
