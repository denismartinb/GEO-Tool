"use client";

import { Icon } from "@/components/ui/icon";
import { useWebAuditRunner } from "./web-audit-context";

/**
 * WEB-AUDIT-DRIVE-1 — renders the coverage driver's error.
 *
 * `WebAuditProvider` has always tracked an `error`, and until now **nothing
 * read it**. That was documented in the provider itself ("it has no consumers,
 * and that is not an oversight") because the two buttons that used to consume
 * it were removed in AUDIT-NO-BUTTON-1 and the state was left behind.
 *
 * The consequence was not cosmetic. The driver gives up after
 * MAX_CONSECUTIVE_FAILURES thrown calls, or on the first well-formed failure,
 * and sets `error` — into a void. Meanwhile the header pill kept rendering
 * "Auditando…" from a `generated_solutions` row that only a *successful*
 * campaign ever clears. So every way this campaign could fail presented as an
 * eternal "Auditando…" beside "Todavía no has auditado tu web", with nothing
 * anywhere saying what happened (founder, 2026-08-07).
 *
 * Deliberately renders nothing at all when there is no error: this is the
 * failure channel, not a status display. The pill above already owns "what is
 * happening now", and duplicating it here is the mistake the founder's
 * 2026-08-04 review already corrected once.
 */
export function WebAuditDriveNotice() {
  const { error } = useWebAuditRunner();
  if (!error) return null;

  return (
    <div className="firstscan-banner" role="status">
      <div className="fb-ico">
        <Icon name="search" size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div className="fb-t">La auditoría no ha podido continuar</div>
        {/* The message comes from the driver, which already distinguishes
            "your progress is saved and it will resume on its own" from "try
            again in a few minutes" — both are safe, self-authored strings, not
            provider errors. */}
        <div className="fb-d">{error}</div>
      </div>
    </div>
  );
}
